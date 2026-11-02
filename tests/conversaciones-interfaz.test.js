import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/panel/conversaciones.js',import.meta.url),'utf8');
function entorno(extra={}){const c=vm.createContext({Map,Date,JSON,encodeURIComponent,CURRENT:'conversaciones',...extra});vm.runInContext(source,c);return c;}
test('borradores separados por conversación y borrar texto elimina solo el suyo',()=>{
 const input={value:'Respuesta pendiente'};const c=entorno({document:{getElementById:()=>input}});
 vm.runInContext("CONV.jid='uno';convGuardarBorrador()",c);input.value='Otro borrador';vm.runInContext("CONV.jid='dos';convGuardarBorrador()",c);
 assert.equal(vm.runInContext("CONV_BORRADORES.get('uno')",c),'Respuesta pendiente');
 input.value='';vm.runInContext('convGuardarBorrador()',c);assert.equal(vm.runInContext("CONV_BORRADORES.has('dos')",c),false);
});
test('vincular muestra todos los resultados aunque las fichas no tengan jid',async()=>{
 const box={children:[],innerHTML:'',appendChild(x){this.children.push(x);}},input={value:'Laura'},form={};
 const ov={isConnected:true,querySelector:s=>s==='form'?form:s==='input'?input:s==='#convLinkResultados'?box:null};
 const c=entorno({modal:()=>ov,esc:String,document:{createElement:()=>({})},apiRaw:async()=>({data:[{id:1,nombre:'Laura Uno'},{id:2,nombre:'Laura Dos'},{id:3,nombre:'Laura Tres'}]})});
 await c.convVincular();await form.onsubmit({preventDefault(){}});assert.equal(box.children.length,3);
});
test('el detalle antiguo no sobrescribe el chat recién seleccionado',async()=>{
 let resolver;const c=entorno({apiRaw:()=>new Promise(r=>resolver=r),document:{getElementById(){throw Error('No debe pintar el chat antiguo');}}});
 vm.runInContext("CONV.jid='uno';CONV.version=1",c);const tarea=c.convRefrescar();
 vm.runInContext("CONV.jid='dos';CONV.version=2;CONV.cargandoHilo=false",c);resolver({});await tarea;
 assert.equal(vm.runInContext('CONV.cargandoHilo',c),false);
});
test('historial separa días y escapa el texto de los mensajes',()=>{
 const c=entorno({esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});
 const html=c.convMensajes([
  {tipo:'recibido',mensaje:'<script>hola</script>',creado_en:'2026-11-01T12:00:00Z'},
  {tipo:'manual',respuesta:'Respuesta',creado_en:'2026-11-01T13:00:00Z'},
  {tipo:'recibido',mensaje:'Otro día',creado_en:'2026-11-02T12:00:00Z'},
 ]);
 assert.equal((html.match(/class="conv-day"/g)||[]).length,2);
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('conv-bubble equipo'));
});
test('los adjuntos sin archivo no ofrecen una vista previa inexistente',()=>{
 const c=entorno({esc:String});
 const html=c.convMensajes([{tipo:'recibido',mensaje:'Documento',adjuntos:[23],creado_en:'2026-11-02T12:00:00Z'}]);
 assert.ok(html.includes('consulta WhatsApp'));
 assert.ok(!html.includes('<img'));
});
test('lectura solo en chat visible y no repite el mismo límite confirmado',async()=>{
 const env={hidden:true},calls=[];const c=entorno({document:{get hidden(){return env.hidden},querySelector:()=>({})},apiSend:async(...args)=>calls.push(args)});
 vm.runInContext("CONV.jid='uno';CONV.ultimo=['2026-11-02T12:00:00Z','w1'];CONV.version=1",c);
 await c.convMarcarLeido();assert.equal(calls.length,0);
 env.hidden=false;await c.convMarcarLeido();await c.convMarcarLeido();assert.equal(calls.length,1);
 assert.equal(calls[0][1],'/api/conversaciones/leer');assert.equal(calls[0][2].hasta[1],'w1');
 vm.runInContext("CONV.ultimo=['2026-11-02T12:01:00Z','w2']",c);await c.convMarcarLeido();assert.equal(calls.length,2);
});
test('un fallo al guardar lectura se puede reintentar',async()=>{
 let attempts=0;const c=entorno({document:{hidden:false,querySelector:()=>({})},apiSend:async()=>{if(++attempts===1)throw Error('sin conexión');}});
 vm.runInContext("CONV.jid='uno';CONV.ultimo=['2026-11-02T12:00:00Z','w1'];CONV.version=1",c);
 await c.convMarcarLeido();assert.equal(vm.runInContext('CONV.lecturaBusy',c),false);
 await c.convMarcarLeido();assert.equal(attempts,2);
});
