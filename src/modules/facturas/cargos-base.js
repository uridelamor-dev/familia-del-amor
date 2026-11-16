import {redondearImporte} from './redondeo.js';
// Importes del original integrados en la base fiscal, separados del catálogo.
export function validarCargosBase(valor) {
 if(!Array.isArray(valor)||valor.length>30)throw new Error('Revisa los cargos del original (máximo 30).');
 return valor.map(c=>{
  const descripcion=typeof c?.descripcion==='string'?c.descripcion.trim():'';
  const numero=v=>typeof v==='number'||typeof v==='string'&&v.trim()!==''?Number(String(v).replace(',','.')):NaN;
  const importe=numero(c?.importe), porcentaje_iva=numero(c?.porcentaje_iva);
  if(!descripcion||descripcion.length>200||!Number.isFinite(importe)||importe===0||Math.abs(importe)>1e9||Math.abs(importe*100-Math.round(importe*100))>0.00001||!Number.isFinite(porcentaje_iva)||porcentaje_iva<0||porcentaje_iva>100)
   throw new Error('Indica descripción, importe neto con dos decimales e IVA explícito del cargo.');
  return {descripcion,importe,porcentaje_iva};
 });
}
export function leerCargosBase(valor) {
 if(valor==null)return [];
 return validarCargosBase(typeof valor==='string'?JSON.parse(valor):valor);
}
export function sumaCargosBase(valor,conIva=false) {
 return leerCargosBase(valor).reduce((s,c)=>s+Math.round(c.importe*100)+(conIva?Math.round(redondearImporte(c.importe*c.porcentaje_iva/100)*100):0),0)/100;
}
