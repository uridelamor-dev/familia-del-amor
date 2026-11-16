import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const start = source.indexOf('app.get("/api/facturas",');
const end = source.indexOf('// Editar los campos de una factura', start);
assert.ok(start >= 0 && end > start);

// Ejecuta el handler real sin iniciar el servidor ni acceder a una base de datos.
async function consultar({facturas, albaranes}) {
  const documentos = [
    ...Array.from({length: facturas}, (_, id) => ({id, tipo:'factura'})),
    ...Array.from({length: albaranes}, (_, id) => ({id:facturas + id, tipo:'albaran'})),
  ];
  let handler, respuesta;
  const ctx = vm.createContext({
    app:{get(path, auth, fn){handler=fn;}},
    requireAuth:()=>()=>{}, actualizarPagosEmpresa:async()=>{}, localScope:()=>null,
    facturasQueryCategorias:async q=>q,
    facturasWhere:()=>({where:'',params:[]}),
    criterioFechaCompras:()=>({orden:'fecha DESC'}),
    RECEPCION_SQL:'creado_en', DIA_RECEPCION_SQL:'creado_en', RECEPCION_REAL_SQL:'creado_en',
    SIN_ALBARANES:"COALESCE(tipo,'factura') <> 'albaran'",
    dbAll:async sql=>{
      const limite=Number(/LIMIT (\d+)/.exec(sql)?.[1]);
      assert.equal(limite,500);
      return documentos.slice(0,limite);
    },
    dbGet:async sql=>{
      assert.ok(!sql.includes('LIMIT'), 'el conteo debe incluir documentos fuera de pantalla');
      return {docs:facturas,albaranes,total:facturas * 100};
    },
    instanteMadrid:()=>({fecha:'2026-11-16'}), hoyISO:()=> '2026-11-16', hoyMas:()=> '2026-11-23',
    estadoPago:()=>({estado:'sin_fecha'}), cargarDistintivos:async()=>{}, revisarFacturas:rows=>rows,
  });
  vm.runInContext(source.slice(start,end),ctx);
  await handler({query:{}},{json(v){respuesta=v;},status(){return this;}});
  assert.equal(respuesta.ok,true);
  return respuesta;
}

test('522 documentos mixtos avisan del límite aunque solo 371 entren en los totales fiscales',async()=>{
  const r=await consultar({facturas:371,albaranes:151});
  assert.equal(r.data.length,500);
  assert.equal(r.hayMas,true);
  assert.equal(r.totales.docs,371);
  assert.equal(r.totales.total,37100, 'no incorporar albaranes al gasto para corregir el contador');
});

test('una consulta de solo albaranes también avisa cuando quedan documentos fuera',async()=>{
  const r=await consultar({facturas:0,albaranes:501});
  assert.equal(r.hayMas,true);
  assert.equal(r.totales.total,0);
});

test('no anuncia más documentos cuando caben exactamente o la lista está vacía',async()=>{
  for(const caso of [{facturas:350,albaranes:150},{facturas:0,albaranes:0},{facturas:1,albaranes:2}]){
    const r=await consultar(caso);
    assert.equal(r.hayMas,false);
    assert.equal(r.data.length,caso.facturas + caso.albaranes);
  }
});
