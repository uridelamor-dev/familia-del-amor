import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import fixture from './helpers/revision-modal-fixture.js';
const modulePath=process.env.TEST_HAPPY_DOM_MODULE || 'happy-dom';
let Window;try{({Window}=await import(modulePath));}catch{}
const source=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const tramo=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)+a.length));
function entorno(){
 const w=new Window({url:'http://localhost'});
 w.document.body.innerHTML='<div id="facAvisos"></div><pre id="resultados"></pre>';
 w.eval(`const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');const facRevisarTxt=()=>[];`+tramo('function facEstructurarRevision(', 'async function facTerminarRevision(')+tramo('function facCamposRevision(', 'function facMarcarRevision(')+tramo('function modal(title,','// Panel lateral.')+fixture);
 return w;
}
test('modal: cuatro entradas conservan estructura, campos, eventos y continuación (29 comprobaciones)',{skip:!Window&&'Configurar TEST_HAPPY_DOM_MODULE para ejecutar DOM'},()=>{
 const w=entorno();try {w.eval('probar()');assert.match(w.document.querySelector('#resultados').textContent,/29 comprobaciones correctas/);}finally{w.happyDOM.abort();}
});
test('recepción: la validación obligatoria y submitter siguen activos con acciones fuera del form',{skip:!Window&&'Configurar TEST_HAPPY_DOM_MODULE para ejecutar DOM'},()=>{
 const w=entorno();try{
 const ov=w.eval("abrir('recepcion')"),form=ov.querySelector('#revForm'),submit=ov.querySelector('button[type="submit"]');
 let sends=0,submitter;form.onsubmit=e=>{e.preventDefault();sends++;submitter=e.submitter;};
 submit.click();assert.equal(sends,0,'sin comprobar original no debe registrar');
 ov.querySelector('#revConfirmado').checked=true;submit.click();assert.equal(sends,1);assert.equal(submitter,submit);
 }finally{w.happyDOM.abort();}
});
test('un aviso de un ajuste abre su sección y al corregirlo desaparece de los accesos',{skip:!Window&&'Configurar TEST_HAPPY_DOM_MODULE para ejecutar DOM'},()=>{
 const w=entorno();try{
 const ov=w.eval("abrir('registrada')"),input=ov.querySelector('[data-fic="retencion"]'),details=input.closest('details');
 input.value='texto';input.dispatchEvent(new w.Event('input',{bubbles:true}));
 const button=[...ov.querySelectorAll('.fac-review-jump')].find(x=>x.textContent==='Retención');assert.ok(button);assert.equal(details.open,false);
 button.click();assert.equal(details.open,true);assert.equal(w.document.activeElement,input);
 input.value='0';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.ok(![...ov.querySelectorAll('.fac-review-jump')].some(x=>x.textContent==='Retención'));
 }finally{w.happyDOM.abort();}
});
test('histórico: formulario y propuesta sobreviven al reagrupar, también en solo lectura',{skip:!Window&&'Configurar TEST_HAPPY_DOM_MODULE para ejecutar DOM'},()=>{
 for(const editable of [true,false]){
 const w=entorno();try{
 w.document.body.insertAdjacentHTML('beforeend',`<div class="modal-ov"><div class="modal"><div class="modal-h"><b></b></div><div class="modal-b"><div class="hist-revision"><section><h3>Original</h3><div id="histOriginal">Original de prueba</div></section><section><h3>Datos y propuesta</h3><form id="histForm">${[['proveedor','Proveedor'],['fecha','Fecha'],['total','Total']].map(([k,l])=>`<div class="field"><label for="hist-${k}">${l}</label>${editable?`<input id="hist-${k}" value="Actual">`:'<p>Actual</p>'}<small>Propuesta: nueva</small>${editable?`<button type="button" data-propuesta="${k}">Usar propuesta</button>`:''}</div>`).join('')}<input type="checkbox" id="histConfirmado" required><div class="toolbar"><button type="submit" value="conservar">Conservar datos</button></div></form></section></div><div><button id="histVolver">Volver al repaso</button></div></div></div></div>`);
 const ov=w.document.querySelector('.modal-ov');w.facEstructurarRevision(ov,'fac-historico');
 const form=ov.querySelector('#histForm');assert.equal(form.querySelectorAll('.field').length,3);
 assert.equal(form.querySelectorAll('.field small').length,3,'conserva la propuesta junto a cada campo');
 assert.equal(form.querySelectorAll('.fic-g').length,3);assert.equal(form.querySelectorAll('.form-grid').length,3);
 assert.ok([...form.querySelectorAll('.form-grid')].every(g=>g.children.length>0));
 assert.equal(ov.querySelector('button[type="submit"]').form,form);
 assert.equal(ov.querySelector('#histVolver').parentElement,ov.querySelector('.fac-review-footer'));
 if(editable){assert.ok([...form.querySelectorAll('input[id^="hist-"]')].every(e=>e.form===form));assert.equal(form.querySelectorAll('[data-propuesta]').length,3);}
 else assert.equal(form.querySelectorAll('input[id^="hist-"]').length,0);
 }finally{w.happyDOM.abort();}
 }
});
