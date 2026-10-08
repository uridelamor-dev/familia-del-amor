import fs from 'node:fs';
export const productos = JSON.parse(fs.readFileSync(new URL('./catalogo.json',import.meta.url),'utf8'));
export const embalajes = [
 ['kraft','Caja kraft','Caixa kraft',300,429,false],['premium','Caja premium','Caixa prèmium',600,857,false],
 ['madera','Caja de madera','Caixa de fusta',900,1286,false],['cesta','Cesta tradicional','Cistella tradicional',700,1000,false],
 ['jamon','Caja especial para jamón','Caixa especial per a pernil',500,714,true]
].map(([id,es,ca,costCents,priceCents,hamCompatible])=>({id:`box-${id}`,kind:'packaging',name:{es,ca},costCents,priceCents,taxBps:null,visible:true,hamCompatible,images:[],capacityVerified:false}));
export const lotes = [
 {id:'detallet',name:'El Detallet',lineas:[['p09',1],['p19',1],['p29',1],['p52',1],['p49',1],['box-premium',1]]},
 {id:'nostre',name:'El Nostre Nadal',lineas:[['p14',1],['p12',1],['p13',1],['p20',1],['p29',1],['p38',1],['p52',1],['p49',1],['box-premium',1]]},
 {id:'familia',name:'La Gran Família',lineas:[['p15',1],['p20',1],['p32',1],['p38',1],['p44',1],['p55',1],['p50',1],['p59',1],['p57',1],['box-cesta',1]]},
 {id:'regal',name:'El Gran Regal',lineas:[['p02',1],['p12',1],['p20',1],['p29',1],['p38',1],['p56',1],['p51',1],['box-jamon',1],['box-kraft',1]]}
].map((l,sort)=>({...l,sort,visible:true,images:[],lineas:l.lineas.map(([id,unidades])=>({id,unidades})),compositionVerified:false}));
export function inicial() {return {version:1,config:{demo:true,publicActive:false,marketingActive:true,campaign:'nadal-2026',discounts:{enabled:true,tiers:[{from:50000,bps:500},{from:100000,bps:1000}]},bank:null,paymentDays:null,delivery:[],permissions:{},operationalApproved:false},catalog:structuredClone([...productos,...embalajes]),bundles:structuredClone(lotes),orders:[],quotes:[],audit:[],outbox:[]};}
