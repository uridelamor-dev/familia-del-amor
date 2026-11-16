// Importes monetarios explícitos del original; nunca se deducen del descuadre.
export const CAMPOS_AJUSTES = ['recargo_equivalencia','retencion','otros_cargos'];
export function ajustesFiscales(f) {
 const valores=CAMPOS_AJUSTES.map(k=>{
  const v=f[k];
  if(v==null || typeof v==='string' && v.trim()==='')return 0;
  if(!['number','string'].includes(typeof v) || !Number.isFinite(Number(v)))throw new Error('Importe de ajuste fiscal no válido.');
  return Math.round(Number(v)*100);
 });
 return (valores[0]-valores[1]+valores[2])/100;
}
