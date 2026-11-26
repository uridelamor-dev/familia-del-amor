import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
const TIPOS=['cabecera','totales','detalle'];
export function planRelectura(avisos=[],lecturas=[]) {
 const campos=[...new Set(avisos.map(a=>a.campo||a.clave).filter(Boolean))];
 const tipos=[];
 if(campos.some(c=>/total|iva|retencion|recargo|cargo/.test(c)))tipos.push('totales');
 if(campos.some(c=>/linea|producto|unidad/.test(c)))tipos.push('detalle');
 if(campos.some(c=>/fecha|proveedor|nif|numero|tipo/.test(c)))tipos.push('cabecera');
 const zonas=tipos.slice(0,2).map(tipo=>{
  const zona=lecturas.flatMap(d=>Array.isArray(d?.zonas)?d.zonas:[]).find(z=>z?.tipo===tipo&&zonaValida(z));
  return zona ? {tipo,pagina:zona.pagina,x:zona.x,y:zona.y,ancho:zona.ancho,alto:zona.alto}
   : {tipo,pagina:tipo==='totales'?'ultima':1,x:0,y:tipo==='cabecera'?0:tipo==='totales'?.55:.15,ancho:1,alto:tipo==='cabecera'?.45:tipo==='totales'?.45:.7};
 });
 return {campos,zonas};
}
export function zonaValida(z) {
 return TIPOS.includes(z.tipo)&&Number.isInteger(z.pagina)&&z.pagina>0
  && ['x','y','ancho','alto'].every(k=>typeof z[k]==='number'&&Number.isFinite(z[k]))
  && z.x>=0&&z.y>=0&&z.ancho>=.05&&z.alto>=.05&&z.x+z.ancho<=1.001&&z.y+z.alto<=1.001;
}
function margen(z){const x=Math.max(0,z.x-.04),y=Math.max(0,z.y-.04);return {...z,x,y,ancho:Math.min(1,z.x+z.ancho+.04)-x,alto:Math.min(1,z.y+z.alto+.04)-y};}
export async function ampliacionesDocumento(buffer,mime,plan) {
 const salida=[];
 if(!plan?.zonas?.length)return salida;
 const pdf=mime==='application/pdf'?await PDFDocument.load(buffer):null;
 // Orientación EXIF antes de interpretar las coordenadas; el archivo original no se modifica.
 const img=pdf?null:await sharp(buffer,{limitInputPixels:40_000_000}).rotate().toBuffer({resolveWithObject:true});
 for(const raw of plan.zonas.slice(0,2)) {
  const pagina=raw.pagina==='ultima'?(pdf?.getPageCount()||1):raw.pagina;
  if(!zonaValida({...raw,pagina})||pagina>(pdf?.getPageCount()||1))continue;
  const z=margen({...raw,pagina});let datos,tipo;
  if(pdf){
   const out=await PDFDocument.create();const [p]=await out.copyPages(pdf,[pagina-1]);out.addPage(p);
   // En páginas giradas no se asume que coordenadas visuales coincidan con PDF.
   if(p.getRotation().angle%360!==0)continue;
   const b=p.getCropBox(),x=b.x+b.width*z.x,y=b.y+b.height*(1-z.y-z.alto),w=b.width*z.ancho,h=b.height*z.alto;
   p.setCropBox(x,y,w,h);p.setMediaBox(x,y,w,h);datos=Buffer.from(await out.save());tipo='application/pdf';
  }else{
   const w=img.info.width,h=img.info.height,left=Math.floor(w*z.x),top=Math.floor(h*z.y);
   datos=await sharp(img.data).extract({left,top,width:Math.min(w-left,Math.max(1,Math.floor(w*z.ancho))),height:Math.min(h-top,Math.max(1,Math.floor(h*z.alto)))})
    .resize({width:1800,withoutEnlargement:true}).jpeg({quality:92}).toBuffer();tipo='image/jpeg';
  }
  if(datos.length<=(pdf?8:4.5)*1024*1024)salida.push({buffer:datos,mime:tipo,zona:z});
 }
 return salida;
}
export function instruccionesFoco(plan) {
 if(!plan?.zonas?.length)return '';
 return '\nAMPLIACIONES DE APOYO: revisa '+plan.zonas.map(z=>z.tipo).join(', ')+'. Los recortes no son páginas adicionales. El documento completo sigue siendo la fuente principal. Comprueba encabezados de columnas, unidades impresas, envases, precio por unidad o por caja y descuentos. No elijas un dato por mayoría ni deduzcas una unidad del peso del nombre del producto. Devuelve de nuevo el documento completo; no omitas las filas fuera del recorte.';
}
