import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registrarRepaso} from '../../src/modules/reviews/repaso-routes.js';
function setup(){
 const routes=new Map(),calls=[];
 const app={get:(p,...h)=>routes.set(p,h),post:(p,...h)=>routes.set(p,h)};
 registrarRepaso(app,{requireAuth:roles=>(req,res,next)=>roles.includes(req.user.rol)?next():res.status(403).json({ok:false}),localesDe:user=>user.locales||[],repaso:{authorize:async(...args)=>{calls.push(args);return true},status:async()=>({available:true}),notice:async()=>true,control:async()=>true}});
 return{calls,async run(path,user,body={}){const req={user,body,query:{}};const res={statusCode:200,status(s){this.statusCode=s;return this},json(d){this.body=d;return this}};const chain=[...routes.get(path)];const next=async()=>{const fn=chain.shift();if(fn)await fn(req,res,next);};await next();return res}};
}
test('solo dirección o marketing global puede activar el repaso',async()=>{
 for(const user of [{rol:'encargado'},{rol:'marketing',locales:['Blanes']}]){const h=setup();const r=await h.run('/api/reviews/repaso/autorizar',user,{confirm:true,policy:'x'});assert.equal(r.statusCode,403);assert.equal(h.calls.length,0);}
 const h=setup();await h.run('/api/reviews/repaso/autorizar',{rol:'marketing',id:7},{confirm:true,policy:'x'});assert.deepEqual(h.calls,[['7','x']]);
});
test('abrir el modal o consultar el progreso no autoriza envíos',async()=>{
 const h=setup();const user={rol:'direccion',id:1};await h.run('/api/reviews/repaso',user);await h.run('/api/reviews/repaso/aviso',user);await h.run('/api/reviews/repaso/autorizar',user,{policy:'x'});assert.equal(h.calls.length,0);
});
