// Importable tanto por navegador como Node. Dinero en céntimos; ratios en puntos básicos.
const entero = (v, nombre, min = 0) => {
  if (!Number.isSafeInteger(v) || v < min) throw new Error(`${nombre}: valor no válido`);
  return v;
};
export function redondearRatio(n, numerador, denominador) {
  const a = BigInt(entero(n, 'Importe')) * BigInt(entero(numerador, 'Ratio'));
  const d = BigInt(entero(denominador, 'Divisor', 1));
  const r = Number((a + d / 2n) / d);
  return entero(r, 'Importe fuera de rango');
}
export function repartir(total, pesos) {
  entero(total, 'Total'); pesos.forEach(p => entero(p, 'Peso'));
  const suma = pesos.reduce((a,b) => entero(a+b,'Suma'), 0);
  if (!suma) return pesos.map(() => 0);
  const parts = pesos.map((p,i) => ({i, n: Number(BigInt(total)*BigInt(p)/BigInt(suma)), r: BigInt(total)*BigInt(p)%BigInt(suma)}));
  let faltan = total-parts.reduce((a,p)=>a+p.n,0);
  [...parts].sort((a,b)=>a.r===b.r?a.i-b.i:a.r>b.r?-1:1).slice(0,faltan).forEach(p=>p.n++);
  return parts.map(p=>p.n);
}
export function calcular(catalogo, pedido, reglas = {}) {
  const lotes = entero(pedido.lotes, 'Número de lotes', 1);
  const ids = new Set();
  const lineas = (pedido.lineas || []).map(l => {
    if (ids.has(l.id)) throw new Error('Artículo repetido'); ids.add(l.id);
    const p = catalogo.find(p=>p.id===l.id && p.visible!==false && !p.archived);
    if (!p) throw new Error('Artículo no disponible');
    const unidades = entero(l.unidades,'Unidades por lote',1);
    const cantidad = entero(unidades*lotes,'Cantidad',1);
    const precio = entero(p.priceCents,'Precio');
    if(p.taxBps!=null) entero(p.taxBps,'IVA');
    return {id:p.id,name:p.name,kind:p.kind||'product',unidades,cantidad,priceCents:precio,costCents:p.costCents??null,
      taxBps:p.taxBps??null,baseCents:entero(precio*cantidad,'Base'),eligible:(reglas.eligibleKinds||['product','packaging']).includes(p.kind||'product'),wholeHam:!!p.wholeHam,hamCompatible:!!p.hamCompatible};
  });
  if(!lineas.some(l=>l.kind==='product')) throw new Error('Añade productos al lote');
  if(!lineas.some(l=>l.kind==='packaging')) throw new Error('Elige un embalaje');
  const jamones=lineas.filter(l=>l.wholeHam).reduce((s,l)=>s+l.unidades,0);
  if(jamones>lineas.filter(l=>l.kind==='packaging'&&l.hamCompatible).reduce((s,l)=>s+l.unidades,0)) throw new Error('Cada jamón o paletilla necesita una caja compatible');
  const elegible=lineas.filter(l=>l.eligible).reduce((s,l)=>entero(s+l.baseCents,'Base elegible'),0);
  const tramos=reglas.enabled===false?[]:(reglas.tiers||[{from:50000,bps:500},{from:100000,bps:1000}]);
  tramos.forEach(t=>{entero(t.from,'Umbral');entero(t.bps,'Descuento');if(t.bps>10000)throw new Error('Descuento no válido');});
  const bps=tramos.filter(t=>elegible>=t.from).sort((a,b)=>b.from-a.from)[0]?.bps||0;
  const descuentos=repartir(redondearRatio(elegible,bps,10000),lineas.map(l=>l.eligible?l.baseCents:0));
  const grupos={};
  lineas.forEach((l,i)=>{l.discountCents=descuentos[i];l.netCents=l.baseCents-l.discountCents;
    const k=l.taxBps==null?'pending':String(l.taxBps); (grupos[k] ||= []).push(l);});
  const impuestos=Object.entries(grupos).map(([k,ls])=>{
    const baseCents=ls.reduce((s,l)=>s+l.netCents,0),taxBps=k==='pending'?null:Number(k);
    const taxCents=taxBps==null?null:redondearRatio(baseCents,taxBps,10000);
    const partes=taxCents==null?ls.map(()=>null):repartir(taxCents,ls.map(l=>l.netCents));ls.forEach((l,i)=>l.taxCents=partes[i]);
    return {taxBps,baseCents,taxCents};
  });
  const baseCents=lineas.reduce((s,l)=>entero(s+l.netCents,'Total'),0);
  const taxPending=impuestos.some(g=>g.taxCents==null);
  const taxCents=taxPending?null:impuestos.reduce((s,g)=>s+g.taxCents,0);
  const transport=reglas.transport||{pending:true};
  if(!transport.pending){entero(transport.priceCents,'Transporte');entero(transport.taxBps,'IVA transporte');}
  const transportTaxCents=transport.pending?null:redondearRatio(transport.priceCents,transport.taxBps,10000);
  const costCents=lineas.every(l=>Number.isSafeInteger(l.costCents))?lineas.reduce((s,l)=>s+l.costCents*l.cantidad,0):null;
  return {lotes,lineas,impuestos,eligibleCents:elegible,discountBps:bps,discountCents:descuentos.reduce((a,b)=>a+b,0),baseCents,taxCents,transport,transportTaxCents,
    totalCents:taxPending||transport.pending?null:entero(baseCents+taxCents+transport.priceCents+transportTaxCents,'Total'),
    costCents,marginBps:costCents==null||!baseCents?null:Math.round((baseCents-costCents)*10000/baseCents)};
}
export function publico(calculo) {
  const {costCents,marginBps,marginCheck,...r}=calculo;
  return {...r,lineas:r.lineas.map(({costCents,...l})=>l)};
}
