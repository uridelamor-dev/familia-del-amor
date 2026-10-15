import fs from 'node:fs';
export const seleccionCerezo = JSON.parse(fs.readFileSync(new URL('./cerezo-2026.json',import.meta.url),'utf8'));
// PVP objetivo con reserva conservadora del 21% para impuestos. No es un tipo
// fiscal asignado a los lotes mixtos: su desglose debe confirmarlo el proveedor.
export function catalogoCerezo(){return seleccionCerezo.map((r,sort)=>({
 id:`cerezo-2026-${r.reference}`,category:'lotes',bundleOnly:true,packagingIncluded:true,
 name:r.name,description:r.description,format:{es:'1 lote completo · embalaje incluido',ca:'1 lot complet · embalatge inclòs'},
 priceCents:Math.round(r.suggestedRetailCents*10000/12100),costCents:r.costCents,costEstimated:true,
 taxBps:r.singleTaxBps,suggestedRetailCents:r.singleTaxBps==null?r.suggestedRetailCents:Math.round(r.suggestedRetailCents/1.21)+Math.round(Math.round(r.suggestedRetailCents/1.21)*r.singleTaxBps/10000),retailIndicative:true,
 supplierReference:r.reference,sourcePage:r.page,sourceCatalog:'Cerezo · Navidad 2026',
 visible:true,sort,alcohol:r.alcohol,wholeHam:false,
 images:[{url:r.image,alt:r.name,source:'Catálogo Cerezo Navidad 2026',verified:true}],
}));}
export function aplicarCerezo2026(s){
 if(s.config.cerezoRevision===3)return false;
 if(!s.config.cerezoRevision){
 s.config.catalogBackups ||= [];
 s.config.catalogBackups.push({revision:'antes-cerezo-2026',bundles:structuredClone(s.bundles),discounts:structuredClone(s.config.discounts)});
 // Ocultar únicamente las cuatro selecciones antiguas; conservar pedidos, catálogo
 // individual, composiciones personalizadas y cualquier edición posterior.
 for(const b of s.bundles)if(['detallet','nostre','familia','regal'].includes(b.id))b.visible=false;
 s.config.discounts={...s.config.discounts,enabled:false};
 }
 for(const p of catalogoCerezo()){
  if(!s.catalog.some(x=>x.id===p.id))s.catalog.push(p);
  if(!s.bundles.some(x=>x.id===p.id))s.bundles.push({id:p.id,name:p.name.ca,sort:p.sort,visible:true,sourceCatalog:p.sourceCatalog,lineas:[{id:p.id,unidades:1}],compositionVerified:true});
 }
 s.config.cerezoRevision=3;
 return true;
}
