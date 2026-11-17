import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const tramo=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const helper=tramo('function facResumenDocumental(', 'function facDistintivoAuditoria(');
const fn=tramo('async function facConfirmarAuditoria(', '// Un vínculo');
async function abrir({permite=true,fallo=false}={}){
 const els=new Map(),writes=[],errors=[];let html='',closed=0;
 const get=s=>{if(s==='#auditResumen'&&!permite)return null;if(!els.has(s))els.set(s,{value:'',checked:false,textContent:'',hidden:true,required:false});return els.get(s);};
 const ctx=vm.createContext({api:async()=>({permite_resumen:permite,huella:'vigente',proveedor:'Lácteos',numero:'2200038291'}),esc:v=>String(v),
 modal:(_t,h)=>{html=h;return {querySelector:get};},apiSend:async(...args)=>{writes.push(args);if(fallo)throw Error('Los datos cambiaron');},facTerminarRevision:async()=>closed++,toast:m=>errors.push(m)});
 vm.runInContext(fn,ctx);await ctx.facConfirmarAuditoria(526);assert.deepEqual(errors,[]);
 return {get,html,writes,closed:()=>closed};
}
test('ofrece alternativa solo cuando servidor confirma factura sin productos',async()=>{
 assert.match((await abrir()).html,/id="auditResumen"/);
 assert.doesNotMatch((await abrir({permite:false})).html,/id="auditResumen"/);
});
test('seleccionar resumen cambia declaración, exige referencias y reinicia comprobación de líneas',async()=>{
 const a=await abrir();a.get('[name="lineas"]').checked=true;
 a.get('#auditResumen').checked=true;a.get('#auditResumen').onchange();
 assert.equal(a.get('#auditResumenCampos').hidden,false);assert.equal(a.get('#auditReferencias').required,true);
 assert.match(a.get('#auditLineasTexto').textContent,/original no contiene productos/);assert.equal(a.get('[name="lineas"]').checked,false);
 a.get('#auditResumen').checked=false;a.get('#auditResumen').onchange();
 assert.equal(a.get('#auditResumenCampos').hidden,true);assert.equal(a.get('#auditReferencias').required,false);
 assert.match(a.get('#auditLineasTexto').textContent,/Productos, cantidades/);
});
test('envía declaración documental y comprobaciones sin crear líneas',async()=>{
 const a=await abrir();a.get('#auditResumen').checked=true;a.get('#auditResumen').onchange();
 for(const k of ['original','identidad','fechas','importes','lineas','duplicados','drive'])a.get(`[name="${k}"]`).checked=true;
 a.get('#auditReferencias').value=' 600191757 · 10nov · 204,44 € ';a.get('#auditNombre').value='Original.pdf';a.get('#auditRuta').value='Contabilidad';
 await a.get('#auditForm').onsubmit({preventDefault(){},submitter:{disabled:false}});
 assert.equal(a.writes.length,1);assert.equal(a.writes[0][1],'/api/facturas/526/auditoria-completa');
 const body=a.writes[0][2];assert.equal(body.comprobaciones.lineas,true);assert.equal(body.comprobaciones.detalle_documento.referencias,'600191757 · 10nov · 204,44 €');
 assert.equal(body.lineas,undefined);assert.equal(a.closed(),1);
});
test('fallo conserva evidencia y permite corregir sin cerrar ni conceder clasificación',async()=>{
 const a=await abrir({fallo:true});a.get('#auditResumen').checked=true;a.get('#auditReferencias').value='Referencia';const boton={disabled:false};
 await a.get('#auditForm').onsubmit({preventDefault(){},submitter:boton});
 assert.equal(a.closed(),0);assert.equal(boton.disabled,false);assert.equal(a.get('#auditReferencias').value,'Referencia');assert.equal(a.get('#auditError').textContent,'Los datos cambiaron');
});
test('presentación solo sustituye falta de productos con confirmación vigente y escapa evidencia',()=>{
 const ctx=vm.createContext({esc:v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;')});vm.runInContext(helper,ctx);
 const f={auditoria_completa:{vigente:true,detalle_documento:{tipo:'resumen_albaranes',confirmado_original:true,referencias:'<script>'}}};
 assert.match(ctx.facResumenDocumentalHtml(f),/Resumen de albaranes/);assert.match(ctx.facResumenDocumentalHtml(f),/&lt;script&gt;/);assert.doesNotMatch(ctx.facResumenDocumentalHtml(f),/<script>/);
 assert.equal(ctx.facResumenDocumentalHtml({}), '');assert.equal(ctx.facResumenDocumentalHtml({...f,auditoria_completa:{...f.auditoria_completa,vigente:false}}),'');
});
