// Confirmado por dirección el 26/11/2026: apertura 08–24; reservas 09–23.
export const LOCALES_RESERVA = ['La Tapeta - Blanes','La Tapeta - Lloret','La Tapeta - Girona','Cooperativa - Blanes','Can Mateu - Tordera','La Tapa Ibérica - Tordera',"Botiga d'en Mateu - Tordera",'Tribeca - Palafolls'];
export function horarioConfirmado(local) {
  if (!LOCALES_RESERVA.includes(local)) return undefined;
  return {semana:Object.fromEntries([1,2,3,4,5,6,7].map(d=>[d,local==='Tribeca - Palafolls' && d===2 ? [] : [['08:00','24:00']]]))};
}
// Horarios confirmados por local; los días ISO son 1=lunes … 7=domingo.
// Las franjas son [apertura, cierre): no se admite entrar a la hora de cierre.
export function horasDisponibles({dia, horario, bloqueado=false, ahora=new Date()}) {
  const invalid = {ok:false, horas:[], mensaje:'Elige una fecha válida.'};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia))) return invalid;
  const date = new Date(dia+'T12:00:00Z');
  if (!Number.isFinite(+date) || date.toISOString().slice(0,10)!==dia) return invalid;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(ahora).map(p=>[p.type,p.value]));
  const hoy = `${parts.year}-${parts.month}-${parts.day}`, hora = `${parts.hour}:${parts.minute}`;
  if (dia<hoy) return invalid;
  if (bloqueado) return {ok:true,horas:[],mensaje:'Este día el local no admite reservas.'};
  const dow = date.getUTCDay() || 7;
  const franjas = horario?.fechas?.[dia] ?? horario?.semana?.[dow];
  if (!Array.isArray(franjas)) return {ok:false,horas:[],mensaje:'El horario de este local está pendiente de confirmar. Contacta con el local para reservar.'};
  const min = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? Number(v.slice(0,2))*60+Number(v.slice(3)) : v==='24:00' ? 1440 : NaN;
  if (franjas.some(f=>!Array.isArray(f)||f.length!==2||!Number.isFinite(min(f[0]))||!Number.isFinite(min(f[1]))||min(f[0])>=min(f[1]))) return {ok:false,horas:[],mensaje:'No podemos confirmar el horario de este local. Contacta con el local.'};
  const horas=[];
  for(let m=540;m<=1380;m+=30){
    const h=`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    if ((dia>hoy || h>hora) && franjas.some(([a,b])=>m>=min(a)&&m<min(b))) horas.push(h);
  }
  return {ok:true,horas,mensaje:horas.length?'':'No hay horas disponibles para este día.'};
}
