// Completa únicamente un tipo ausente; nunca corrige importes ni un tipo explícito.
const vacio = v => v == null || (typeof v === 'string' && !v.trim());
const numero = v => vacio(v) ? NaN : Number(v);
const centimos = v => Math.round(Math.abs(v) * 100) * Math.sign(v);
export function completarIva(d) {
  if (!d || !vacio(d.porcentaje_iva)) return null;
  const base = numero(d.base_imponible), cuota = numero(d.cuota_iva), total = numero(d.total);
  if (![base, cuota, total].every(Number.isFinite) || !base || !cuota || Math.sign(base) !== Math.sign(cuota)) return null;
  const ajustes = ['recargo_equivalencia','otros_cargos','retencion'].map(k => vacio(d[k]) ? 0 : numero(d[k]));
  if (!ajustes.every(Number.isFinite) || Math.abs(centimos(base + cuota + ajustes[0] + ajustes[1] - ajustes[2]) - centimos(total)) > 2) return null;
  const desglose = d.iva_desglose || [];
  // No convertir un desglose mixto en un único porcentaje efectivo.
  if (!Array.isArray(desglose) || desglose.length > 1) return null;
  const tipos = [4,10,21].filter(tipo => Math.abs(centimos(base * tipo / 100) - centimos(cuota)) <= 1);
  if (tipos.length !== 1) return null;
  const tipo = tipos[0];
  if (desglose.length && (Number(desglose[0].tipo) !== tipo || Math.abs(numero(desglose[0].base) - base) > .02 || Math.abs(numero(desglose[0].cuota) - cuota) > .02 || ![numero(desglose[0].base),numero(desglose[0].cuota)].every(Number.isFinite))) return null;
  if ((d.lineas || []).some(l => !vacio(l.porcentaje_iva) && Number(l.porcentaje_iva) !== tipo)) return null;
  d.porcentaje_iva = tipo;
  if (Array.isArray(d.campos_dudosos)) d.campos_dudosos = d.campos_dudosos.filter(c => c !== 'porcentaje_iva');
  return {campo:'porcentaje_iva',valor:tipo,origen:'Calculado con base, cuota y total concordantes'};
}
