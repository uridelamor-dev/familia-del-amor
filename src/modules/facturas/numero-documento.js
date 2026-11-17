// Un marcador de ausencia no identifica un documento ni prueba duplicidad.
// No altera las referencias reales (barras, guiones, prefijos o ceros).
export function numeroDocumentoAusente(value) {
  if(value == null)return true;
  if(typeof value!=='string' && typeof value!=='number')return true;
  if(typeof value==='number' && !Number.isFinite(value))return true;
  const texto=String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const marcador=texto.replace(/[^A-Z0-9]/g,'');
  return !marcador || ['SN','SINNUMERO','SINNUMERAR','SINIDENTIFICAR','NOLEIDO','NODISPONIBLE','PENDIENTE','NA','NULL','UNDEFINED'].includes(marcador);
}
