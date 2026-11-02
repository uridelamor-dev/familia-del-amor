import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
test('diez cambios de apartado comparten avisos recientes; abrir campana fuerza actualización',async()=>{
 let peticiones=0,repintados=0,ahora=100,session='uno';
 const c=vm.createContext({USER:{rol:'direccion'},token:()=>session,Date:{now:()=>ahora},Set,JSON,AVISOS_RR:[],AVISOS_OCULTOS:[],AVISOS_CARGA:null,AVISOS_SESION:null,AVISOS_HASTA:0,apiRaw:async()=>{peticiones++;return {data:[{id:1}],ocultos:[]}},repintarBarra:()=>repintados++});
 vm.runInContext(s.slice(s.indexOf('async function refrescarAvisosRR('),s.indexOf('async function abrirAvisos(')),c);
 for(let i=0;i<10;i++)await c.refrescarAvisosRR(false);
 assert.equal(peticiones,1);assert.equal(repintados,1);
 await c.refrescarAvisosRR();assert.equal(peticiones,2);assert.equal(repintados,1,'sin cambios no reconstruye el menú');
 ahora+=31000;await c.refrescarAvisosRR(false);assert.equal(peticiones,3);
 session='dos';await c.refrescarAvisosRR(false);assert.equal(peticiones,4,'otra sesión no hereda la vigencia');
});
test('Clientes se pinta aunque poblaciones siga cargando',async()=>{
 let completar;const view={isConnected:true,innerHTML:''};const c=vm.createContext({document:{getElementById:()=>view},CURRENT:'clientes',CLI_POBLACIONES:[],CLI_POB_CARGA:null,token:()=> 'uno',skeleton:()=> 'cargando',cliQS:()=>'',renderClientes:()=> 'clientes visibles',cliAvisoPropuestas:()=>{},errorCard:String,apiRaw:url=>url.includes('poblaciones')?new Promise(r=>completar=r):Promise.resolve({data:[]})});
 vm.runInContext(s.slice(s.indexOf('async function loadClientes()'),s.indexOf('// Refresca SOLO los resultados')),c);
 await c.loadClientes();assert.equal(view.innerHTML,'clientes visibles');assert.equal(c.CLI_POBLACIONES.length,0);
 completar({data:['Blanes']});await c.CLI_POB_CARGA;assert.equal(c.CLI_POBLACIONES[0],'Blanes');
});
