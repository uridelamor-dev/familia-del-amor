import { AsyncLocalStorage } from 'node:async_hooks';
const contexto = new AsyncLocalStorage();
export function plazoFactura() {
  const restante = (contexto.getStore()?.fin ?? Date.now() + 120000) - Date.now();
  if (restante <= 0) throw new Error('La lectura ha superado su plazo; se reintentará');
  return Math.min(restante, 120000);
}
export function conPlazoFactura(fn, ms = 300000) {
  return contexto.run({fin: Date.now() + ms}, fn);
}
// El plazo cubre también el cuerpo. No se libera el cerrojo mediante Promise.race:
// se espera a que fetch haya cancelado y terminado antes de permitir otro escritor.
export async function fetchFactura(url, opciones = {}) {
  const signal = opciones.signal
    ? AbortSignal.any([opciones.signal, AbortSignal.timeout(plazoFactura())])
    : AbortSignal.timeout(plazoFactura());
  const r = await globalThis.fetch(url, {...opciones, signal});
  if (!r.ok) { await r.body?.cancel?.(); throw new Error(`Servicio de documentos: HTTP ${r.status}`); }
  if (typeof r.arrayBuffer !== 'function') return r; // adaptadores de pruebas
  const body = await r.arrayBuffer();
  if ((r.headers.get('content-type') || '').includes('json')) {
    const data = JSON.parse(Buffer.from(body).toString('utf8'));
    if(data?.error) throw new Error('El servicio de documentos rechazó la operación');
  }
  return new Response(r.status === 204 ? null : body, {status:r.status, headers:r.headers});
}
export const MAX_DOCUMENTO = 20 * 1024 * 1024;
export async function descargarLimitado(r, max = MAX_DOCUMENTO) {
  if (!r.ok) throw new Error(`Descarga: HTTP ${r.status}`);
  if (Number(r.headers?.get?.('content-length')) > max) { await r.body?.cancel?.(); throw Object.assign(new Error('El documento supera 20 MB; divídelo y vuelve a subirlo'), {permanente:true}); }
  if (!r.body?.getReader) {
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > max) throw Object.assign(new Error('El documento supera 20 MB; divídelo y vuelve a subirlo'), {permanente:true});
    return b;
  }
  const reader=r.body.getReader(), chunks=[]; let size=0;
  try { while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length;
    if(size>max) throw Object.assign(new Error('El documento supera 20 MB; divídelo y vuelve a subirlo'), {permanente:true}); chunks.push(Buffer.from(value)); }
    return Buffer.concat(chunks);
  } catch(e) { await reader.cancel(); throw e; } finally { reader.releaseLock(); }
}
