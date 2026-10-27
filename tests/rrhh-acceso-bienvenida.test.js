import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crearEnvioAccesos,mensajeAccesoInicial} from '../src/modules/rrhh/acceso-bienvenida.js';
const datos={nombre:'Persona Prueba',username:'personaprueba',telefono:'34600000000',password:'personaprueba',pin:'5829'};
function sistema({conectado=true,fallar=false,cred=datos}={}){
 let estado='pendiente',envios=0;const queries=[];
 const pool={query:async(sql,args)=>{queries.push({sql,args});if(sql.includes('RETURNING id,worker_id,datos')){if(estado!=='pendiente')return {rows:[]};estado='enviando';return{rows:[{id:1,worker_id:9,datos}]};}if(sql.includes('SET acceso_envio=$1'))estado=args[0];return{rows:[]};}};
 const tick=crearEnvioAccesos({pool,listo:()=>conectado,credenciales:async()=>cred,enviar:async(t,m,meta)=>{envios++;assert.equal(t,datos.telefono);assert.ok(m.includes('https://familiadelamor.org/panel/'));assert.equal(meta.tipoMensaje,'rrhh_acceso_inicial');if(fallar)throw Error('fallo incierto');}});
 return{tick,queries,get estado(){return estado;},get envios(){return envios;}};
}
test('bienvenida explica panel y PIN del sistema del local y contiene las tres credenciales',()=>{
 const m=mensajeAccesoInicial(datos);for(const v of [datos.username,datos.password,datos.pin,'https://familiadelamor.org/panel/','PIN para fichar en el sistema de tu local','cambiar la contraseña'])assert.ok(m.includes(v));
});
test('envío único aunque concurran confirmación y temporizador; no persiste claves',async()=>{
 const s=sistema();await Promise.all([s.tick(),s.tick()]);await s.tick();assert.equal(s.envios,1);assert.equal(s.estado,'enviado');assert.ok(!JSON.stringify(s.queries).includes(datos.pin));assert.ok(s.queries.some(q=>q.sql.includes('SKIP LOCKED')));
});
test('sin WhatsApp queda pendiente, sin consumir el intento',async()=>{const s=sistema({conectado:false});await s.tick();assert.equal(s.estado,'pendiente');assert.equal(s.envios,0);assert.equal(s.queries.length,0);});
test('entrega incierta requiere revisión, nunca reintenta automáticamente',async()=>{const s=sistema({fallar:true});await s.tick();await s.tick();assert.equal(s.estado,'revisar');assert.equal(s.envios,1);});
test('no envía claves cambiadas, sin PIN recuperable o a un teléfono distinto',async()=>{
 for(const cred of [null,{...datos,pin:null},{...datos,telefono:'otro'},{...datos,username:'otro'}]){const s=sistema({cred});await s.tick();assert.equal(s.envios,0);assert.equal(s.estado,'revisar');}
});
