import { celda } from './export.js';
import { cuentaDeJornada, CADUCADA } from './revision.js';

export function rangoComparativoValido(desde,hasta) {
  const real = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d+'T12:00:00Z')) && new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
  return real(desde)&&real(hasta)&&desde<=hasta&&(Date.parse(hasta)-Date.parse(desde))/86400000<62;
}
const textoSeguro = v => celda(/^[\s]*[=+@-]/.test(String(v||'')) ? "'"+v : v);
const horas = m => m == null ? '' : (Number(m)/60).toFixed(2).replace('.',',');
// No convertir una propuesta en una aprobación. La validación caducada va aparte.
export function csvComparativo(filas=[]) {
  const lineas = [['ID trabajador','Trabajador','Día','Horas previstas','Horas fichadas brutas','Pausas','Horas efectivas','Horas que cuentan','Origen','Horas aprobadas vigentes','Última aprobación','Estado','Validado por'].map(celda).join(';')];
  for (const f of [...filas].sort((a,b)=>a.dia.localeCompare(b.dia)||String(a.nombre).localeCompare(String(b.nombre),'es'))) {
    const caducada=f.estado===CADUCADA;
    const cuenta=cuentaDeJornada({jornada:f.jornada,validacion:f.validacion,caducada});
    const numericos = [f.minPlanificado,f.minFichado,f.minPausa,f.minEfectivo,cuenta.minutos].map(horas);
    lineas.push([celda(f.worker_id),textoSeguro(f.nombre),celda(f.dia),...numericos.map(celda),
      celda(cuenta.origen),celda(horas(caducada?null:f.validacion?.minutos)),celda(horas(f.validacion?.minutos)),
      textoSeguro(f.estado),textoSeguro(f.validacion?.por||'')].join(';'));
  }
  return '\uFEFF'+lineas.join('\r\n')+'\r\n';
}
