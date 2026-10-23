import { datosRevision, controlesLectura } from './validacion-lectura.js';
import { ADJUNTOS_DECORATIVOS_VERIFICADOS } from './adjuntos-verificados.js';
import { diagnosticarRecepcion } from './error-recepcion.js';
import { conPlazoFactura } from "./red.js";
import { createHash } from 'node:crypto';

export const RECEPCION_SCHEMA = `CREATE TABLE IF NOT EXISTS facturas_recepciones (
  id BIGSERIAL PRIMARY KEY, clave TEXT NOT NULL UNIQUE, hash TEXT NOT NULL,
  canal TEXT NOT NULL, local TEXT, nombre TEXT NOT NULL, mime TEXT NOT NULL,
  original BYTEA, estado TEXT NOT NULL DEFAULT 'pendiente', intentos INTEGER NOT NULL DEFAULT 0,
  proximo TIMESTAMPTZ NOT NULL DEFAULT NOW(), error TEXT, resultado JSONB,
  creado TIMESTAMPTZ NOT NULL DEFAULT NOW(), actualizado TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;
export function canalFactura(origen = 'Manual') {
  return ({manual:'Manual',web:'Manual',email:'Email',correo:'Email',gmail:'Email',drive:'Drive',whatsapp:'WhatsApp'})[String(origen).toLowerCase()] || 'Manual';
}
export function errorRecibido(id) {
  const e = new Error(`Documento recibido (#${id}). La lectura está pendiente; puedes seguirla en Compras → Documentos recibidos.`);
  e.recibido = true; e.recepcionId = id;
  return e;
}

// El original se confirma en PostgreSQL antes de llamar a Google o a la IA.
// lock debe serializar por hash entre procesos; no mantener transacciones abiertas durante la IA.
export function crearRecepcion({db, lock, procesar, existeDestino, ahora = () => new Date()}) {
  async function ejecutar(id) {
    const inicial = await db.get('SELECT hash FROM facturas_recepciones WHERE id = ?', [id]);
    if (!inicial) throw new Error('Recepción no encontrada');
    return lock(inicial.hash, async () => {
      const f = await db.get('SELECT * FROM facturas_recepciones WHERE id = ?', [id]);
      if (['registrado','duplicado'].includes(f.estado) && f.original) {
        if (existeDestino && !(await existeDestino(f.hash))) {
          await db.run("UPDATE facturas_recepciones SET estado='pendiente',resultado=NULL,intentos=0,proximo=NOW(),error=NULL WHERE id=?", [id]);
          Object.assign(f,{estado:'pendiente',intentos:0,proximo:ahora()});
        } else {
          await db.run('UPDATE facturas_recepciones SET original=NULL WHERE id=?',[id]);
        }
      }
      if (!['registrado','duplicado','descartado'].includes(f.estado) && ADJUNTOS_DECORATIVOS_VERIFICADOS.has(f.hash)) {
        const resultado = {descartado:true,motivo:'Imagen de correo verificada: no es un documento de compra.'};
        // Conserva el original; solo lo aparta de la cola de lectura.
        await db.run("UPDATE facturas_recepciones SET estado='descartado',resultado=?::jsonb,error=NULL,actualizado=NOW() WHERE id=?",[JSON.stringify(resultado),id]);
        return resultado;
      }
      if (f.estado === 'registrado' || f.estado === 'descartado' || f.estado === 'sustituido') return f.resultado;
      if (f.estado === 'duplicado') { const e = new Error('Este documento ya está registrado'); e.isDuplicate = true; throw e; }
      if (f.estado === 'revision') { const e=errorRecibido(id); e.message='Documento guardado para revisión en Compras. Todavía no está contabilizado.'; throw e; }
      if (f.estado === 'error' || new Date(f.proximo) > ahora()) throw errorRecibido(id);
      await db.run(`UPDATE facturas_recepciones SET estado='leyendo', intentos=intentos+1, actualizado=NOW() WHERE id=?`, [id]);
      try {
        const r = await conPlazoFactura(() => procesar({buffer:f.original,mimeType:f.mime,filename:f.nombre,local:f.local,canal:f.canal,origen:f.canal,datosAprobados:f.resultado?.aprobacion ? f.resultado.datos : null}));
        await db.run(`UPDATE facturas_recepciones SET estado=?, resultado=?::jsonb, original=NULL, error=NULL, actualizado=NOW() WHERE id=?`, [r?.descartado ? 'descartado' : 'registrado',JSON.stringify({...r, revisionPrevia:f.resultado?.aprobacion ? f.resultado : undefined}),id]);
        return r;
      } catch(e) {
        if(e.revisionDocumento) {
          await db.run("UPDATE facturas_recepciones SET estado='revision',resultado=?::jsonb,error=?,actualizado=NOW() WHERE id=?",[JSON.stringify(e.resultado),'Comprueba los campos señalados. Original guardado; importes sin registrar.',id]);
          const recibido=errorRecibido(id); recibido.message=e.message; throw recibido;
        }
        if (e.isDuplicate) {
          await db.run(`UPDATE facturas_recepciones SET estado='duplicado', original=NULL, error=NULL, actualizado=NOW() WHERE id=?`, [id]);
          throw e;
        }
        const n = Number(f.intentos || 0) + 1;
        const diagnostico = diagnosticarRecepcion(e);
        console.error("[Recepción] procesamiento fallido", JSON.stringify({id, intento:n, codigo:diagnostico.codigo}));
        const proximo = new Date(ahora().getTime()+Math.min(60,5*2**(n-1))*60000).toISOString();
        // No se guarda el error crudo: los proveedores pueden incluir datos del documento.
        await db.run(`UPDATE facturas_recepciones SET estado=?, error=?, proximo=?, actualizado=NOW() WHERE id=?`,
          [n >= 5 || diagnostico.permanente ? 'error' : 'pendiente',(n >= 5 ? diagnostico.texto.replace('Se volverá a intentar.', 'Se han agotado los intentos automáticos.') : diagnostico.texto) + ' El original está guardado.',proximo,id]);
        throw errorRecibido(id);
      }
    });
  }
  async function recibir(o) {
    if (!Buffer.isBuffer(o.buffer) || !o.buffer.length || o.buffer.length > 20*1024*1024) throw Object.assign(new Error('El documento debe tener entre 1 byte y 20 MB'), {permanente:true});
    if (!(o.mimeType === 'application/pdf' || o.mimeType?.startsWith('image/'))) throw new Error('Solo se admiten PDF o imágenes');
    const hash = createHash('sha256').update(o.buffer).digest('hex');
    const canal = canalFactura(o.canal || o.origen);
    const clave = createHash('sha256').update(JSON.stringify([canal,o.local||'',hash])).digest('hex');
    const f = await db.run(`INSERT INTO facturas_recepciones (clave,hash,canal,local,nombre,mime,original)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(clave) DO UPDATE SET clave=EXCLUDED.clave,
        original=CASE WHEN facturas_recepciones.estado IN ('registrado','duplicado') THEN EXCLUDED.original ELSE facturas_recepciones.original END RETURNING id,estado`,
      [clave,hash,canal,o.local||null,String(o.filename||'documento').slice(0,240),o.mimeType,o.buffer]);
    // Vincular el mensaje original incluso cuando el archivo ya estaba registrado.
    if(o.onDocumentoGuardado) await o.onDocumentoGuardado(f.id);
    // Avisar solo después de guardar el original.
    if (o.onRecibido && !['registrado','duplicado','descartado'].includes(f.estado)) {
      await o.onRecibido(f.id);
    }
    return ejecutar(f.id);
  }
  let trabajando = false;
  async function reintentar() {
    if (trabajando) return;
    trabajando = true;
    try {
      // Recupera también los decorativos antiguos que agotaron los intentos.
      const decorativos = await db.all("SELECT id FROM facturas_recepciones WHERE estado IN ('pendiente','leyendo','error') AND hash = ANY(?::text[])",[[...ADJUNTOS_DECORATIVOS_VERIFICADOS]]);
      for (const f of decorativos) { try { await ejecutar(f.id); } catch(e) { if (!e.recibido) console.error('[Recepción] no se pudo apartar el adjunto verificado',f.id); } }
      const filas = await db.all(`SELECT id FROM facturas_recepciones WHERE (estado IN ('pendiente','leyendo') AND proximo <= NOW()) OR (estado IN ('registrado','duplicado') AND original IS NOT NULL) ORDER BY proximo,id LIMIT 10`);
      for (const f of filas) { try { await ejecutar(f.id); } catch(e) { if (!e.recibido && !e.isDuplicate) console.error('[Recepción] no se pudo recuperar el documento', f.id); } }
    } finally { trabajando = false; }
  }
  async function aprobar(id,cambios,{autor,motivo,confirmado,aceptarAvisos}={}) {
    const inicial=await db.get('SELECT hash FROM facturas_recepciones WHERE id=?',[id]);
    if(!inicial) throw new Error('Documento no encontrado');
    return lock(inicial.hash,async()=>{
      const f=await db.get('SELECT * FROM facturas_recepciones WHERE id=?',[id]);
      if(f.estado!=='revision' || !f.original) throw new Error('Este documento ya no está pendiente de revisión');
      if(confirmado!==true) throw new Error('Confirma que has comprobado el original');
      const datos=datosRevision(f.resultado?.datos,cambios);
      const avisos=controlesLectura(datos);
      if(avisos.some(a=>["fecha","proveedor","tipo"].includes(a.campo))) throw new Error("Completa proveedor, tipo y fecha válidos antes de registrar");
      if(avisos.length && aceptarAvisos!==true) throw new Error("Quedan avisos. Corrígelos o confirma expresamente la excepción indicando el motivo");
      if(!String(motivo||'').trim()) throw new Error('Indica qué has comprobado o corregido');
      const resultado={...f.resultado,datos,avisosTrasRevision:avisos,aprobacion:{autor,fecha:ahora().toISOString(),motivo:String(motivo).trim().slice(0,2000)}};
      await db.run("UPDATE facturas_recepciones SET estado='pendiente',resultado=?::jsonb,intentos=0,proximo=NOW(),error=NULL,actualizado=NOW() WHERE id=? AND estado='revision'",[JSON.stringify(resultado),id]);
      return {ok:true};
    });
  }
  return {recibir,ejecutar,reintentar,aprobar};
}

// Google devuelve páginas aunque todos los elementos de la primera ya estén procesados.
export async function listarPaginas(url, token, campo, fetchFn = fetch) {
  const filas = [], vistos = new Set();
  let pagina = '';
  do {
    const u = new URL(url); if (pagina) u.searchParams.set('pageToken',pagina);
    const r = await fetchFn(u.toString(), {headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(45000)});
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(`No se pudo listar ${campo} en Google (${r.status})`);
    filas.push(...(d[campo] || []));
    pagina = d.nextPageToken || '';
    if (pagina && vistos.has(pagina)) throw new Error('Google repitió una página de resultados');
    vistos.add(pagina);
  } while(pagina);
  return filas;
}
