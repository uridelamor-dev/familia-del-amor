import { centrosPorDireccionEntrega } from './asignacion.js';
import { comprobarCobertura } from './contraste-detalle.js';
import { vencimientoManualValido } from './vencimiento.js';
import { numeroDocumentoAusente } from './numero-documento.js';
import { avisosEvidenciaCabecera } from './evidencia-cabecera.js';
import { avisosTipoDocumento, tituloFacturaCombinado } from './tipo-documento.js';
import { avisosAbono } from './abonos.js';
import { completarIva } from './iva-inferido.js';
import { nifValido, normNif } from './emisor.js';
import { normalizarLinea, validarSuma } from './lineas.js';
import { revisarCoherencia } from './coherencia.js';

export const CAMPOS_REVISION = ['tipo','titulo_documento','proveedor','nif_proveedor','fecha','vencimiento','numero_factura','base_imponible','porcentaje_iva','cuota_iva','total','retencion','recargo_equivalencia','otros_cargos'];
const numero = v => v === null || v === undefined || v === '' ? null : Number(v);
export function controlesLectura(d = {}) {
  const avisos = [...comprobarCobertura(d), ...avisosAbono(d), ...avisosTipoDocumento(d), ...avisosEvidenciaCabecera(d)];
  if (typeof d.nota_manuscrita === 'string' && d.nota_manuscrita.trim()) {
    avisos.push({campo:'imagen',codigo:'nota_manuscrita',
      texto:`Anotación manuscrita para seguimiento: ${d.nota_manuscrita.trim().slice(0, 300)}`});
  }
  if (Array.isArray(d.numeros_facturas_independientes)) {
    const numeros = new Set(d.numeros_facturas_independientes
      .filter(v => typeof v === 'string' && v.trim()).map(v => v.trim().toUpperCase()));
    if (numeros.size > 1) avisos.push({campo:'tipo',codigo:'varias_facturas',
      texto:`El archivo contiene varias facturas independientes (${[...numeros].join(', ')}). Revisa y presenta cada factura por separado antes de confirmar.`});
  }
  const aviso = (campo,texto) => avisos.push({campo,texto});
  if (!String(d.proveedor || '').trim()) aviso('proveedor','No se ha identificado al proveedor.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') || !Number.isFinite(Date.parse(d.fecha)) || new Date(d.fecha).toISOString().slice(0,10) !== d.fecha) aviso('fecha','Falta una fecha de emisión válida.');
  if (!vencimientoManualValido(d.vencimiento)) aviso('vencimiento','La fecha de vencimiento leída no es válida. Comprueba la fecha escrita en el original.');
  if (!['factura','ticket','albaran','otro'].includes(d.tipo)) aviso('tipo','Hay que confirmar el tipo de documento.');
  if (['factura','albaran'].includes(d.tipo) && numeroDocumentoAusente(d.numero_factura)) aviso('numero_factura',`No se ha leído el número de ${d.tipo==='albaran'?'albarán':'factura'}. Comprueba el original; si realmente no lleva número, confirma expresamente la excepción.`);
  if (d.tipo === 'factura' && !d.nif_proveedor) aviso('nif_proveedor','Falta el NIF del proveedor.');
  if (d.nif_proveedor && !nifValido(d.nif_proveedor)) aviso('nif_proveedor','Revisa el identificador fiscal del proveedor (puede ser extranjero).');
  for (const campo of ['total', ...(d.tipo === 'factura' ? ['base_imponible','cuota_iva'] : [])]) {
    if (d.tipo === 'albaran' && (d[campo] == null || d[campo] === '')) continue; // Un albarán puede no estar valorado.
    if (numero(d[campo]) == null || !Number.isFinite(numero(d[campo]))) aviso(campo,`Falta un importe válido: ${campo.replaceAll('_',' ')}.`);
  }
  if (Array.isArray(d.iva_desglose) && d.iva_desglose.length) {
    for(const fila of d.iva_desglose) {
      if([fila.base,fila.tipo,fila.cuota].some(v=>numero(v)==null || !Number.isFinite(numero(v))) || Math.abs(Number(fila.base)*Number(fila.tipo)/100-Number(fila.cuota))>0.05) aviso('iva_desglose','Una cuota del desglose fiscal no cuadra con su base y tipo.');
    }
    for(const [campo,k] of [['base_imponible','base'],['cuota_iva','cuota']]) if(numero(d[campo])!=null && Math.abs(d.iva_desglose.reduce((s,f)=>s+(numero(f[k])||0),0)-Number(d[campo]))>0.05) aviso(campo,'La suma del desglose fiscal no coincide con el resumen.');
  }
  if (numero(d.porcentaje_iva) === 0 && numero(d.cuota_iva) != null && Math.abs(numero(d.cuota_iva)) > 0.05) aviso('porcentaje_iva','El tipo figura como 0 % pero hay una cuota de IVA. Comprueba el resumen fiscal.');
  // La segunda lectura puede omitir el detalle. Solo controlar líneas realmente recibidas.
  if (Array.isArray(d.lineas) && d.lineas.length) {
    const lineas = d.lineas.map((l,i)=>normalizarLinea({...l,descripcion:l?.descripcion || 'Detalle'},i,d.tipo));
    d.lineas.forEach((l,i)=> {
      if (!l || l.lectura_dudosa === true || l.dudosa === true
        || ((d.tipo !== 'albaran' || numero(d.base_imponible) != null) && lineas[i].importe == null)
        || (numero(l.cantidad) != null && numero(l.precio_unitario) != null && lineas[i].dudosa)) {
        aviso('lineas',`La línea ${i+1} tiene una lectura dudosa o cantidades, precios y descuentos incoherentes. Comprueba el original.`);
      }
    });
    if (lineas.every(l=>l.importe != null) && numero(d.base_imponible) != null) {
      try {
        const suma = validarSuma(lineas,d.base_imponible,d.tipo,d);
        if (suma.diferencia != null && Math.abs(suma.diferencia) > Math.max(0.05,lineas.length*0.02)) aviso('lineas','El detalle no coincide con el resumen: comprueba productos, descuentos, cargos y si los precios incluyen IVA.');
      } catch { aviso('lineas','No se pueden comprobar los cargos y el detalle del documento.'); }
    }
  }
  if (d._lecturaIncompleta) aviso('lineas','La respuesta se cortó: puede faltar parte del documento.');
  if (d.calidad_imagen === 'ilegible' || d.calidad_imagen === 'recortada') aviso('imagen','Hay partes ilegibles o recortadas. Comprueba el original antes de pedir otra foto.');
  for (const campo of (Array.isArray(d.campos_dudosos) ? d.campos_dudosos : [])) {
    if (campo === 'tipo' && tituloFacturaCombinado(d.titulo_documento)) continue;
    if(d.tipo==='albaran'&&['total','base_imponible','cuota_iva','porcentaje_iva'].includes(campo)&&(d[campo]==null||d[campo]===''))continue;
    aviso(String(campo).slice(0,60),'La lectura señala dudas en este campo.');
  }
  for (const a of revisarCoherencia(d).avisos) aviso(a.clave,a.texto);
  return avisos;
}
export function compararLecturas(a,b) {
  const diferentes = [];
  const entregaA = centrosPorDireccionEntrega(a.direccion_entrega);
  const entregaB = centrosPorDireccionEntrega(b.direccion_entrega);
  if (entregaA.join('|') !== entregaB.join('|')) {
    diferentes.push({campo:'local',texto:'Las lecturas difieren en el local que indica la dirección de entrega.'});
  }
  for (const campo of [...CAMPOS_REVISION,'nif_receptor']) {
    const x=a[campo], y=b[campo];
    const numerico=['base_imponible','porcentaje_iva','cuota_iva','total','retencion','recargo_equivalencia','otros_cargos'].includes(campo);
    const normal=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const iguales=numerico ? (numero(x)===null && numero(y)===null) || (numero(x)!==null && numero(y)!==null && Math.abs(numero(x)-numero(y))<=0.02) : (['nif_proveedor','nif_receptor'].includes(campo) ? normNif(x)===normNif(y) : normal(x)===normal(y));
    if(!iguales) diferentes.push({campo,texto:`Las dos lecturas no coinciden en ${campo.replaceAll('_',' ')}.`});
  }
  const desglose = d => (Array.isArray(d.iva_desglose) ? d.iva_desglose : [])
    .map(f=>[numero(f.base),numero(f.tipo),numero(f.cuota)]).sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)));
  if(JSON.stringify(desglose(a))!==JSON.stringify(desglose(b))) diferentes.push({campo:'iva_desglose',texto:'Las lecturas no coinciden en el desglose de IVA.'});
  return diferentes;
}
export class RevisionDocumento extends Error {
  constructor(datos,avisos,segunda=null) {
    super('Documento guardado para revisión. Sus importes todavía no se han registrado.');
    this.revisionDocumento=true;
    const calidadMala=['ilegible','recortada'].includes(datos.calidad_imagen) && datos.calidad_imagen===segunda?.calidad_imagen;
    const faltaEnAmbas=['proveedor','fecha','total'].some(k=>datos[k]==null && segunda?.[k]==null && !(k==='total' && datos.tipo==='albaran'));
    this.resultado={datos,avisos,segunda,version:1,solicitarFoto:calidadMala && faltaEnAmbas};
  }
}
// Se admite una excepción humana motivada (p. ej. NIF extranjero o retención), nunca silenciosa.
export function datosRevision(original,cambios) {
  const d=structuredClone(original || {});
  for(const campo of CAMPOS_REVISION) {
    if(!Object.hasOwn(cambios,campo)) continue;
    const v=cambios[campo];
    if(['base_imponible','porcentaje_iva','cuota_iva','total','retencion','recargo_equivalencia','otros_cargos'].includes(campo)) {
      if(v!==null && (typeof v!=='number' || !Number.isFinite(v))) throw new Error('Importe no válido');
      d[campo]=v;
    } else {
      if(v!==null && typeof v!=='string') throw new Error('Campo no válido');
      d[campo]=v===null ? null : v.trim().slice(0,300);
    }
  }
  if (tituloFacturaCombinado(d.titulo_documento)) d.tipo = 'factura';
  if (Object.hasOwn(cambios, 'lineas_iva_incluido')) {
    if (typeof cambios.lineas_iva_incluido !== 'boolean') throw new Error('Indica si las líneas incluyen IVA.');
    d.lineas_iva_incluido = cambios.lineas_iva_incluido;
  }
  if(Object.hasOwn(cambios,'lineas')) {
    if(!Array.isArray(cambios.lineas)||cambios.lineas.length>500)throw new Error('Detalle de productos no válido');
    d.lineas=cambios.lineas.map((l,i)=>{
      if(!l||typeof l!=='object')throw new Error('Línea no válida');
      const out={};
      for(const k of ['descripcion','unidad','formato_literal']){
        if(l[k]!=null&&typeof l[k]!=='string')throw new Error('Texto de línea no válido');
        out[k]=l[k]==null?null:l[k].trim().slice(0,300);
      }
      for(const k of ['cantidad','bultos','precio_unitario','importe','importe_neto','descuento_pct','descuento_euros']){
        if(l[k]!=null&&(typeof l[k]!=='number'||!Number.isFinite(l[k])))throw new Error('Importe o cantidad de línea no válido');
        out[k]=l[k]??null;
      }
      // Una fila reenviada sin cambios no borra las dudas de la extracción.
      const previa=original?.lineas?.[i];
      if(previa && Object.keys(out).every(k=>(out[k]??null)===(previa[k]??null)))return {...previa,...out};
      return {...out,lectura_dudosa:false,dudosa:false};
    });
  }
  if(d.nif_proveedor) d.nif_proveedor=normNif(d.nif_proveedor);
  // La duda OCR pertenece al valor leído. Los controles sobre el valor nuevo se ejecutan después.
  if(Array.isArray(d.campos_dudosos)) {
    d.campos_dudosos=d.campos_dudosos.filter(campo=>
      !CAMPOS_REVISION.includes(campo) || !Object.hasOwn(cambios,campo)
      || (d[campo]??null)===(campo==='nif_proveedor' ? normNif(original?.[campo])||null : original?.[campo]??null));
  }

  // Un cambio de base/IVA invalida el desglose anterior: no mantener datos fiscales contradictorios.
  if (Object.hasOwn(cambios, 'iva_desglose')) {
    if (!Array.isArray(cambios.iva_desglose) || cambios.iva_desglose.length > 20) {
      throw new Error('Desglose de IVA no válido.');
    }
    d.iva_desglose = cambios.iva_desglose.map(fila => {
      const { base, tipo, cuota, recargo = null } = fila || {};
      if (![base, tipo, cuota].every(Number.isFinite) || tipo < 0 || tipo > 100
        || (recargo !== null && !Number.isFinite(recargo))) {
        throw new Error('Completa la base, el tipo y la cuota de cada fila de IVA.');
      }
      return {base, tipo, cuota, recargo};
    });
    if (d.iva_desglose.length) {
      const suma = campo => Math.round(d.iva_desglose.reduce((total, fila) => total + Math.round((fila[campo] ?? 0) * 100), 0)) / 100;
      d.base_imponible = suma('base');
      d.cuota_iva = suma('cuota');
      const tipos = new Set(d.iva_desglose.map(fila => fila.tipo));
      d.porcentaje_iva = tipos.size === 1 ? d.iva_desglose[0].tipo : null;
      if (d.iva_desglose.some(fila => fila.recargo !== null)) d.recargo_equivalencia = suma('recargo');
    }
  } else if (['base_imponible','cuota_iva','porcentaje_iva'].some(k => d[k] !== original?.[k])) {
    d.iva_desglose = [];
  }
  completarIva(d);
  return d;
}
