import test from 'node:test';
import assert from 'node:assert/strict';
import { crearLecturaOcupacion, resumirOcupacion } from '../../src/integrations/agora/ocupacion.js';

const maestro={SaleCenters:[
 {Id:1,Name:'Sala',SaleLocations:[{Name:'M1'},{Name:'M2'}]},
 {Id:2,Name:'Barra',SaleLocations:[{Name:'B1'}]},
 {Id:3,Name:'Para llevar',StartTakeOutOrder:true,SaleLocations:[{Name:'1'}]},
]};
const ticket=(id,centro,Location,GrossAmount,Payments=[])=>({GlobalId:id,
 SaleCenter:{Id:centro,Location},Totals:{GrossAmount},Payments});
const parcial=ticket('A',1,'M1',50,[{Amount:-20,PaidAmount:-25,ChangeAmount:5,IsPrepayment:true}]);

test('Ágora: saldo neto del prepago, mesas únicas, barra y cancelaciones',()=>{
 const datos=resumirOcupacion({Tickets:[parcial,parcial,ticket('B',1,'M1',10),ticket('C',2,'B1',2.8),
  {...ticket('D',1,'M2',120),Status:'Cancelled'},ticket('E',3,'1',8)]},maestro);
 assert.equal(datos.pendienteCentimos,5080);
 assert.deepEqual(datos.zonas.mesas,{ocupadas:1,total:2});
 assert.deepEqual(datos.zonas.barra,{ocupadas:1,total:1});
 assert.equal(datos.capacidad,3);
 assert.equal(datos.ocupadas,2);
 assert.equal(datos.tickets.length,4);
 assert.equal(datos.tickets[0].pendienteCentimos,3000);
});

test('Ágora: saldo desconocido, saldo cero y respuesta vacía son estados distintos',()=>{
 const sinPagos=ticket('A',1,'M1',50); delete sinPagos.Payments;
 assert.equal(resumirOcupacion([sinPagos],maestro).pendienteCentimos,null);
 assert.equal(resumirOcupacion([ticket('A',1,'M1',50,[{Amount:20}])],maestro).pendienteCentimos,null);
 assert.equal(resumirOcupacion([ticket('A',1,'M1',50,[{Amount:-50}])],maestro).pendienteCentimos,0);
 assert.equal(resumirOcupacion([],null).ocupadas,0);
 assert.equal(resumirOcupacion({Otro:[]},null),null);
});

test('Ágora: lectura acotada al local, caché breve y cobertura real',async()=>{
 let ts=100000;
 const consultas=[];
 const leer=crearLecturaOcupacion({ahora:()=>ts,fetchFn:async(url,opts)=>{
  consultas.push({url,opts});
  if(url.includes('offline'))return {ok:false};
  return {ok:true,json:async()=>url.includes('/tickets/')?{Tickets:[parcial]}:maestro};
 }});
 const configs=[
  {local:'Blanes',host:'https://blanes.example',token:'demo'},
  {local:'Girona',host:'https://offline.example',token:'demo'},
  {local:'Central',host:'https://central.example',token:'demo',localId:'3'},
  {local:'Sin acceso',host:'https://otro.example',token:'demo'},
 ];
 const datos=await leer(['Blanes','Girona','Central','Sin token'],configs);
 assert.deepEqual(datos.cobertura,{ocupacion:1,saldo:1,total:4});
 assert.equal(datos.pendienteCentimos,3000);
 assert.equal(consultas.length,4);
 assert.ok(consultas.every(c=>c.opts.headers['Api-Token']==='demo' && c.opts.redirect==='error'));
 await leer(['Blanes'],configs);
 assert.equal(consultas.length,4);
 ts+=31000;
 await leer(['Blanes'],configs);
 assert.equal(consultas.length,6);
});
