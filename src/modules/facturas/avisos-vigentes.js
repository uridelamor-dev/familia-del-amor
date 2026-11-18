import {cuadraTotal, cuadraIva} from './coherencia.js';

const numero = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const nif = v => String(v || '').replace(/[\s.\-/]/g, '').toUpperCase();

// Solo sustituir controles que podemos volver a demostrar. Las dudas de lectura,
// identidad, fechas y evidencias desconocidas se conservan, aunque cuadren los importes.
export function actualizarAvisosTrasCorreccion(antes, actual) {
  let avisos = antes.revisar;
  if (typeof avisos === 'string') {
    try { avisos = JSON.parse(avisos); } catch { return antes.revisar; }
  }
  if (!Array.isArray(avisos) || avisos.some(a => typeof a !== 'string')) return antes.revisar;
  const controles = [
    {campos:['base_imponible','cuota_iva','total','recargo_equivalencia','retencion','otros_cargos'], obligatorios:['base_imponible','cuota_iva','total'], comprobar:cuadraTotal},
    {campos:['base_imponible','cuota_iva','porcentaje_iva'], obligatorios:['base_imponible','cuota_iva','porcentaje_iva'], comprobar:cuadraIva},
  ];
  let resultado = [...avisos];
  for (const c of controles) {
    if (!c.campos.some(k => String(antes[k] ?? '') !== String(actual[k] ?? ''))) continue;
    if (!c.obligatorios.every(k => numero(actual[k]))) continue;
    if (c.campos.some(k => actual[k] != null && actual[k] !== '' && !numero(actual[k]))) continue;
    if (c.comprobar === cuadraIva && Number(actual.porcentaje_iva) <= 0) continue;
    const previo = c.comprobar(antes);
    if (!previo || !resultado.includes(previo.texto)) continue;
    const nuevo = c.comprobar(actual);
    resultado = resultado.flatMap(t => t === previo.texto ? (nuevo ? [nuevo.texto] : []) : [t]);
  }
  // Compatibilidad con el aviso antiguo: únicamente una corrección explícita al
  // NIF que el propio aviso esperaba, sin cambiar a la vez la entidad proveedora.
  if (nif(antes.nif) !== nif(actual.nif) && antes.proveedor === actual.proveedor) {
    resultado = resultado.filter(t => {
      const m = /^Este proveedor siempre ha venido con el NIF ([A-Z0-9]+) y esta vez pone ([A-Z0-9]+)\. Un proveedor no cambia de NIF: lo que suele cambiar es la lectura\.$/.exec(t);
      return !(m && nif(antes.nif) === m[2] && nif(actual.nif) === m[1]);
    });
  }
  return JSON.stringify(resultado) === JSON.stringify(avisos) ? antes.revisar : resultado.length ? JSON.stringify([...new Set(resultado)]) : null;
}
