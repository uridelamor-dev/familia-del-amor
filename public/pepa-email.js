const $=id=>document.getElementById(id);
async function request(path='',body) {
 const response=await fetch('/api/la-pepa/email'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+localStorage.getItem('token'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo completar la operación');return data;
}
async function refresh(){const data=await request();const labels={pending:'Pendientes',accepted:'Aceptados por Resend',review:'Necesitan revisión',excluded:'Excluidos',sending:'En curso',test:'Prueba de baja'};$('status').textContent=(data.control.active?'Envíos activos':'Envíos pausados')+'\n'+data.counts.map(r=>(labels[r.status]||r.status)+': '+r.total).join('\n')+(data.control.notice?'\n'+data.control.notice:'');}
async function action(fn){document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();await refresh();}catch(e){$('status').textContent=e.message;}finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
$('refresh').onclick=()=>action(async()=>{});
$('pause').onclick=()=>action(()=>request('/control',{active:false}));
$('activate').onclick=()=>action(()=>request('/control',{active:true,verified:$('verified').checked}));
$('import').onclick=()=>action(async()=>{const f=$('file').files[0];if(!f)throw Error('Selecciona el archivo');if(f.size>2000000)throw Error('Archivo demasiado grande');await request('/import',JSON.parse(await f.text()));});
window.requireRole(['direccion']).then(user=>{if(user)action(async()=>{});});

$('test').onclick=()=>action(async()=>{const data=await request('/test',{});const a=document.createElement('a');a.href=data.url;a.textContent='Abrir baja de prueba';a.target='_blank';a.rel='noopener';$('testlink').replaceChildren(a);});
