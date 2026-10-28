// Se aplica antes de paginar. Un documento sin ámbito no pertenece por suposición a un local.
export function filtroRevision({locales = [], empresa = '', tipo = ''} = {}, columnas = {local:'local',empresa:'empresa'}) {
  const params=[], partes=[];
  if(locales.length){partes.push(`${columnas.local} = ANY(?::text[])`);params.push([...new Set(locales)]);}
  if(String(empresa).trim()){partes.push(`${columnas.empresa} = ?`);params.push(String(empresa).trim());}
  if(tipo && columnas.tipo){partes.push(`${columnas.tipo} = ANY(?::text[])`);params.push(String(tipo).split(',').map(t=>t.trim()).filter(Boolean));}
  return {sql:partes.length?' AND '+partes.join(' AND '):'',params};
}
export function documentoEnAmbito(documento, locales = []) {
  return !locales.length || locales.includes(documento?.local);
}
