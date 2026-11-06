import {claveProveedor} from './categorias.js';
import {normNif} from './emisor.js';
// El NIF puede haberse leído del cliente: nunca basta para sustituir un nombre distinto.
export function mismoNombreFiscal(a,b) {
 const x=claveProveedor(a),y=claveProveedor(b);
 return !!x && x===y;
}
export function avisosIdentidad(d={},fichas=[]) {
 const avisos=[];
 const add=(campo,texto)=>avisos.push({campo,texto});
 const nif=normNif(d.nif_proveedor);
 if(nif && nif===normNif(d.nif_receptor)) add('nif_proveedor','Emisor y destinatario tienen el mismo NIF: comprueba a quién pertenece.');
 if(nif && fichas.some(f=>normNif(f.nif)===nif&&!mismoNombreFiscal(f.proveedor,d.proveedor)))
  add('proveedor','El nombre del original contradice la memoria para este NIF. No se ha sustituido: comprueba el emisor y su ficha.');
 if(d._exigirEvidenciaEmisor) {
  const e=d.evidencia_emisor;
  if(!e || !mismoNombreFiscal(e.nombre_literal,d.proveedor))add('proveedor','No hay un nombre de emisor respaldado por el membrete o texto fiscal del original.');
  if(nif && (!e?.nif_literal || normNif(e.nif_literal)!==nif || !e?.ubicacion_nif || /cliente|receptor|destinatario/i.test(e.ubicacion_nif)))
   add('nif_proveedor','Falta confirmar el NIF en el bloque fiscal del emisor; no sirve el del recuadro del cliente.');
 }
 return avisos;
}
