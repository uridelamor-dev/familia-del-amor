// Vista local de prueba, con API simulada: no usa secretos, base real ni envía a Meta.
import express from 'express';
import path from 'node:path';
const app=express();app.use(express.json());
const now=new Date().toISOString();
const user={username:'direccion',nombre:'Dirección',rol:'direccion',local:'',modulos:null};
const chats=[{phone:'34600000001',name:'Clara · prueba',state:'pending',owner:null,last_inbound_at:now,updated_at:now,preview:'Hola, ¿podemos cambiar la reserva a las 21:30?'},
{phone:'34600000002',name:'Marc · prueba',state:'human',owner:'Laura',last_inbound_at:now,updated_at:now,preview:'Os envío el documento que faltaba.'}];
const messages=[{id:'1',phone:chats[0].phone,direction:'in',type:'text',body:chats[0].preview,status:'received',created_at:now},
{id:'2',phone:chats[0].phone,direction:'out',type:'text',body:'Hola Clara, lo comprobamos y te confirmamos por aquí.',status:'read',author:'Laura',created_at:now}];
app.get('/api/auth/me',(req,res)=>res.json({ok:true,user}));
app.get('/api/whatsapp/cloud/status',(req,res)=>res.json({ok:true,configured:true,mode:'pilot'}));
app.get('/api/whatsapp/cloud/templates',(req,res)=>res.json({ok:true,data:[{name:'hello_world',language:'en_US',status:'APPROVED',components:[{type:'BODY',text:'Hello World'}]}]}));
app.get('/api/whatsapp/cloud/conversations',(req,res)=>res.json({ok:true,data:chats.filter(c=>(!req.query.state || c.state===req.query.state)&&(!req.query.q || c.name.toLowerCase().includes(req.query.q.toLowerCase()) || c.phone.includes(req.query.q)))}));
app.get('/api/whatsapp/cloud/conversations/:phone',(req,res)=>res.json({ok:true,conversation:chats.find(c=>c.phone===req.params.phone),messages:messages.filter(m=>m.phone===req.params.phone)}));
app.post('/api/whatsapp/cloud/conversations/:phone/:action',(req,res)=>{
const c=chats.find(c=>c.phone===req.params.phone);
if(req.params.action==='take'){c.state='human';c.owner=user.username;}
if(req.params.action==='resolve'){c.state='resolved';c.owner=null;}
if(req.params.action==='messages'){const m={id:String(messages.length+1),phone:c.phone,direction:'out',type:'text',body:req.body.text,status:'accepted',author:user.username,created_at:now};messages.push(m);return res.json({ok:true,message:m});}
res.json({ok:true});});
app.use('/api',(req,res)=>res.json({ok:true,data:[],items:[],rows:[],resumen:{},stats:{},totales:{}}));
app.get('/preview-cloud',(req,res)=>res.type('html').send(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>WhatsApp · Prueba local</title><link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/panel.css"><link rel="stylesheet" href="/css/cloud-inbox.css"><body style="padding:24px;background:#f5f5f0"><main id="view"></main><script src="/panel/cloud-inbox.js"></script><script>
const get=async p=>(await fetch(p)).json();const post=async(p,b)=>(await fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})).json();
CloudInbox.mount(document.getElementById('view'),{get,post,token:()=>'',user:${JSON.stringify(user)}});</script></body></html>`));
app.get('/preview-panel',(req,res)=>res.type('html').send('<script>localStorage.setItem("token","local-preview-only");location.href="/panel/#whatsapp-cloud";</script>'));
app.use(express.static(path.resolve('public')));
app.listen(5098,'127.0.0.1',()=>console.log('Vista local en http://127.0.0.1:5098/preview-cloud'));
