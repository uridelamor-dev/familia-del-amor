(() => {
 const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);
 const estado=document.querySelector('#estado'), form=document.querySelector('#respuesta');
 async function api(ruta,body={}){const r=await fetch('/api/alta-personal/'+ruta,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error||'No se pudo completar.');return j;}
 api('revisar').then(j=>{for(const [label,value] of j.campos){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;document.querySelector('#datos').append(dt,dd);}estado.textContent='Por seguridad, el DNI y el IBAN se muestran parcialmente. Si hay dudas, solicita una corrección.';form.hidden=false;}).catch(e=>estado.textContent=e.message);
 form.onsubmit=async e=>{e.preventDefault();const botones=[...form.querySelectorAll('button')];botones.forEach(b=>b.disabled=true);try{const j=await api('responder',{accion:e.submitter.value,nota:document.querySelector('#nota').value});estado.textContent=j.mensaje;form.hidden=true;document.querySelector('#datos').replaceChildren();}catch(e){estado.textContent=e.message;botones.forEach(b=>b.disabled=false);}};
})();
