import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analizarInformeIA,TEMAS_TOOL} from '../../src/modules/reviews/informes-ia.js';
const request={system:'Analizar',messages:[{role:'user',content:'Reseñas'}]};
const data={positivos:[{tema:'Trato',ids:['r1']}],negativos:[]};
const result={stop_reason:'tool_use',content:[{type:'text',text:'Texto no JSON'},{type:'tool_use',name:TEMAS_TOOL.name,input:data}]};
test('exige herramienta y devuelve su objeto aunque exista prosa alrededor',async()=>{
 const ai={messages:{create:async p=>{assert.equal(p.tool_choice.name,TEMAS_TOOL.name);return result;}}};
 assert.deepEqual(await analizarInformeIA(ai,request),data);
});
test('no acepta texto libre, objeto incompleto ni herramientas ambiguas',async()=>{
 for(const r of [{stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(data)}]}, {...result,content:[result.content[1],result.content[1]]},{...result,content:[{...result.content[1],input:{}}]}]) {
  await assert.rejects(()=>analizarInformeIA({messages:{create:async()=>r}},request),/incompleto/);
 }
});
test('respuesta truncada se regenera con más margen, nunca se usa parcialmente',async()=>{
 const budgets=[];const ai={messages:{create:async p=>{budgets.push(p.max_tokens);return budgets.length===1?{...result,stop_reason:'max_tokens'}:result;}}};
 assert.deepEqual(await analizarInformeIA(ai,request),data);assert.deepEqual(budgets,[4000,8000]);
 await assert.rejects(()=>analizarInformeIA({messages:{create:async()=>({...result,stop_reason:'max_tokens'})}},request),/incompleto/);
});
