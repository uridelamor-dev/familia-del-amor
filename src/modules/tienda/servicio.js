import {randomUUID,createHash} from 'node:crypto';
import {calcular,publico} from './calculo.js';
export const CAPACIDADES=['consultar','catalogo','pedidos','pagos','descuentos','exportar','banco','activar'];
export function permite(s,user,cap){return user?.rol==='direccion'||(s.config.marketingActive && ['marketing','contabilidad'].includes(user?.rol) && (s.config.permissions[String(user.id)]||[]).includes(cap));}
function must(s,u,c){if(!permite(s,u,c)){const e=new Error('Sin permiso para esta operación');e.status=403;throw e;}}
const str=(s,n=500)=>typeof s==='string'?s.trim().slice(0,n):'';
const fecha=()=>new Date().toISOString();
export function audit(s,u,action,id){s.audit.push({id:randomUUID(),at:fecha(),actor:u?.id??'cliente',action,record:id});}
export function catalogoPublico(s){return s.catalog.filter(p=>p.visible&&!p.archived).map(({costCents,costEstimated,...p})=>p);}
export function valorar(s,b){
 const delivery=s.config.delivery.find(d=>d.id===b.deliveryId&&d.active);
 const transport=delivery?{pending:!!delivery.pending,priceCents:delivery.priceCents,taxBps:delivery.taxBps,id:delivery.id}: {pending:true};
 const result=calcular(s.catalog,b,{...s.config.discounts,transport});
 const preparation=s.config.preparationCostCents;
 const costsKnown=Number.isSafeInteger(preparation)&&result.lineas.every(l=>{const p=s.catalog.find(p=>p.id===l.id);return Number.isSafeInteger(p.costCents)&&p.costEstimated===false;});
 const fullCost=result.costCents==null?null:result.costCents+(preparation||0)*b.lotes;
 result.marginCheck={verified:costsKnown,minimumBps:3000,costCents:fullCost,ok:costsKnown&&fullCost*10000<=result.baseCents*7000};
 return result;
}
export function disponible(s){if(!s.config.publicActive){const e=new Error('La campaña no está activa');e.status=409;throw e;}}
export function crear(s,b,kind='orders') {
 disponible(s);
 if(!['orders','quotes'].includes(kind))throw new Error('Tipo no válido');
 if(!/^[a-zA-Z0-9-]{16,100}$/.test(b.key||''))throw new Error('Identificador de solicitud no válido');
 const keyHash=createHash('sha256').update(b.key).digest('hex');
 const existing=s[kind].find(x=>x.keyHash===keyHash);if(existing)return {id:existing.id,reference:existing.reference,payment:existing.payment,replayed:true};
 const c=b.contact||{};
 if(!str(c.name,160)||!/^\S+@\S+\.\S+$/.test(str(c.email,254))||!b.accepted)throw new Error('Revisa nombre, email y aceptación');
 if(!['es','ca'].includes(b.lang))throw new Error('Idioma no válido');
 if(c.company&&!str(c.taxId,40))throw new Error('Indica el identificador fiscal');
 const price=valorar(s,b);
 const special=!!str(b.notes,2000)||!!str(b.dedication);
 const ready=price.totalCents!=null&&!special;
 if(!s.config.demo&&!price.marginCheck.ok)throw new Error('El precio necesita revisión de costes y margen mínimo del 30%');
 if(!s.config.demo && !s.config.operationalApproved)throw new Error('Venta pendiente de validación operativa');
 // Un servicio por cotizar nunca genera una solicitud de transferencia.
 const payment=kind==='quotes'?'sin_pago':ready?'pendiente_transferencia':'pendiente_valoracion';
 const id=randomUUID(),reference=`${s.config.demo?'DEMO-':''}${kind==='quotes'?'PRE':'LOT'}-${new Date().getFullYear()}-${id.slice(0,8).toUpperCase()}`;
 const doc={id,reference,keyHash,lang:b.lang,campaign:s.config.campaign,createdAt:fecha(),contact:{name:str(c.name,160),email:str(c.email,254),phone:str(c.phone,40),company:str(c.company,160),taxId:str(c.taxId,40),address:str(c.address,1000)},request:{lineas:b.lineas,lotes:b.lotes,deliveryId:b.deliveryId},dedication:str(b.dedication),notes:str(b.notes,2000),marketingConsent:b.marketingConsent===true,termsVersion:s.config.termsVersion||'demo-v1',payment,logistics:'sin_preparar',snapshot:price,status:kind==='quotes'?'solicitado':'confirmado',versions:[],demo:s.config.demo};
 s[kind].push(doc);s.outbox.push({id:randomUUID(),record:id,kind,lang:b.lang,status:s.config.demo?'simulado':'pendiente',createdAt:fecha()});audit(s,null,`crear_${kind}`,id);
 return {id,reference,payment,price:publico(price),bank:ready&&kind==='orders'?s.config.bank:null,demo:s.config.demo};
}
export function operar(s,u,collection,id,b){must(s,u,'pedidos');const d=s[collection]?.find(d=>d.id===id);if(!d)throw new Error('Documento no encontrado');
 if(b.action==='verify'){must(s,u,'pagos');if(collection!=='orders'||d.status==='cancelado'||d.snapshot.totalCents==null)throw new Error('No se puede verificar este pedido');if(b.amountCents!==d.snapshot.totalCents)throw new Error('El importe no coincide; requiere resolución manual');if(d.payment==='pagado')return d;d.payment='pagado';d.verified={by:u.id,at:fecha(),amountCents:b.amountCents,reason:str(b.reason)||'Ingreso comprobado'};}
 else if(b.action==='reported'){if(collection!=='orders'||d.status==='cancelado'||d.snapshot.totalCents==null)throw new Error('Pedido no disponible para pago');if(d.payment==='pagado')throw new Error('Ya verificado');d.payment='pendiente_verificacion';}
 else if(b.action==='logistics'){const order=['sin_preparar','en_preparacion','listo','enviado','entregado'];if(d.payment!=='pagado'||order.indexOf(b.value)!==order.indexOf(d.logistics)+1)throw new Error('Transición logística no válida');d.logistics=b.value;}
 else if(b.action==='cancel'){if(!str(b.reason))throw new Error('Indica el motivo');d.status='cancelado';d.cancelReason=str(b.reason);}
 else if(collection==='quotes'&&b.action==='revise'){
   if(d.orderId)throw new Error('El presupuesto ya está convertido');
   const calculated=valorar(s,b.request||d.request);if(calculated.totalCents==null)throw new Error('Completa impuestos y transporte');
   d.versions.push({snapshot:d.snapshot,status:d.status,at:fecha(),conditions:d.conditions,validUntil:d.validUntil});d.snapshot=calculated;d.request=b.request||d.request;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(b.validUntil||'')||new Date(b.validUntil+'T23:59:59Z')<new Date())throw new Error('Indica una validez futura');
   d.validUntil=b.validUntil;d.conditions=str(b.conditions,3000);d.status='emitido';d.acceptance=null;
 }
 else if(collection==='quotes'&&b.action==='accept'){if(d.status!=='emitido'||!str(b.reason)||new Date(d.validUntil+'T23:59:59Z')<new Date())throw new Error('Presupuesto no vigente o falta constancia de aceptación');d.status='aceptado';d.acceptance={at:fecha(),by:u.id,evidence:str(b.reason)};}
 else if(collection==='quotes'&&b.action==='reject'){if(d.orderId)throw new Error('Ya convertido');d.status='rechazado';}
 else if(collection==='quotes'&&b.action==='convert'){
   if(d.orderId)return s.orders.find(x=>x.id===d.orderId);
   if(d.status!=='aceptado'||d.snapshot.totalCents==null)throw new Error('Es necesaria la aceptación del presupuesto completo');
   const order=structuredClone(d);order.id=randomUUID();order.reference=d.reference.replace('PRE-','LOT-');order.quoteId=d.id;order.payment='pendiente_transferencia';order.status='confirmado';order.createdAt=fecha();s.orders.push(order);d.orderId=order.id;audit(s,u,'convertir',d.id);return order;
 } else throw new Error('Acción no válida');
 audit(s,u,b.action,d.id);return d;
}
export function configurar(s,u,b){
 if('publicActive'in b||'marketingActive'in b){must(s,u,'activar');if(typeof b.publicActive==='boolean')s.config.publicActive=b.publicActive;if(typeof b.marketingActive==='boolean')s.config.marketingActive=b.marketingActive;}
 if(b.permissions){if(u.rol!=='direccion')throw new Error('Solo Dirección puede asignar permisos');for(const caps of Object.values(b.permissions))if(!Array.isArray(caps)||caps.some(c=>!CAPACIDADES.includes(c)))throw new Error('Permisos no válidos');s.config.permissions=b.permissions;}
 if('bank'in b){must(s,u,'banco');s.config.bank=b.bank?{holder:str(b.bank.holder,160),iban:str(b.bank.iban,40)}:null;}
 if('preparationCostCents'in b){must(s,u,'catalogo');if(b.preparationCostCents!==null&&(!Number.isSafeInteger(b.preparationCostCents)||b.preparationCostCents<0))throw new Error('Coste de preparación no válido');s.config.preparationCostCents=b.preparationCostCents;}
 if(b.delivery){must(s,u,'catalogo');if(!Array.isArray(b.delivery))throw new Error('Entrega no válida');for(const d of b.delivery){if(!str(d.id)||!Number.isSafeInteger(d.priceCents)||d.priceCents<0||!Number.isSafeInteger(d.taxBps)||d.taxBps<0)throw new Error('Tarifa no válida');}s.config.delivery=b.delivery;}
 audit(s,u,'configurar','config');return s.config;
}
export function editarArticulo(s,u,id,b){must(s,u,'catalogo');const p=s.catalog.find(x=>x.id===id);if(!p)throw new Error('Artículo no encontrado');
 for(const k of ['priceCents','costCents','taxBps','sort'])if(k in b){if(!Number.isSafeInteger(b[k])||b[k]<0)throw new Error('Importe o impuesto no válido');p[k]=b[k];}
 if(typeof b.costEstimated==='boolean')p.costEstimated=b.costEstimated;
 if('format'in b){if(!b.format||typeof b.format.es!=='string'||typeof b.format.ca!=='string')throw new Error('Formato no válido');p.format={es:str(b.format.es,160),ca:str(b.format.ca,160)};}
 for(const k of ['name','description'])if(b[k]){if(!str(b[k].es)||!str(b[k].ca))throw new Error('Completa ambos idiomas');p[k]={es:str(b[k].es,1000),ca:str(b[k].ca,1000)};}
 if(typeof b.visible==='boolean')p.visible=b.visible;
 if(typeof b.archived==='boolean')p.archived=b.archived;
 audit(s,u,'editar_articulo',id);return p;
}
