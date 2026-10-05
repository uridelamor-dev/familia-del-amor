window.showClubProfile = async function(token, target) {
  const dialog=target.closest('dialog');
  const response=await fetch('/club-profile-form.html');
  if(!response.ok) throw new Error('No se pudo cargar el perfil');
  target.innerHTML=await response.text();
  dialog.classList.add('profile-preview');
  dialog.querySelector('#clubTitle').innerHTML='Ya eres parte<br> de la familia.';
  dialog.querySelector('.club-story>p').textContent='Tu carnet está listo. Este paso es opcional: puedes completarlo ahora o dejarlo para otro momento.';
  const title=target.querySelector('#profileTitle');title.tabIndex=-1;title.focus();
  dialog.querySelector('.club-layout').scrollTop=0;
  const day=target.querySelector('#profileDay'),month=target.querySelector('#profileMonth'),year=target.querySelector('#profileYear');
  for(let n=1;n<=31;n++)day.add(new Option(n,n));
  ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].forEach((name,i)=>month.add(new Option(name,i+1)));
  for(let n=new Date().getFullYear();n>=new Date().getFullYear()-120;n--)year.add(new Option(n,n));
  const script=document.createElement('script');script.src='/club-birthday-picker.js';document.body.append(script);
  const go=()=>{location.href='/tarjeta.html?t='+encodeURIComponent(token);};
  target.querySelector('#profileSkip').onclick=go;
  const status=message=>{const box=target.querySelector('#profileStatus');box.textContent=message;box.hidden=false;};
  target.querySelector('#profileForm').onsubmit=async event=>{
    event.preventDefault();
    const values=[day.value,month.value,year.value];
    if(values.some(Boolean)&&!values.every(Boolean)){status('Completa el día, mes y año, o deja los tres vacíos.');return;}
    const nacimiento=values.every(Boolean)?`${year.value}-${month.value.padStart(2,'0')}-${day.value.padStart(2,'0')}`:'';
    if(nacimiento){const date=new Date(nacimiento+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==nacimiento||nacimiento>new Date().toLocaleDateString('sv-SE')){status('Revisa la fecha de nacimiento.');return;}}
    const poblacion=target.querySelector('#profileTown').value.trim();
    if(!poblacion&&!nacimiento){go();return;}
    const button=target.querySelector('[type=submit]');button.disabled=true;button.textContent='Guardando…';
    try{
      const r=await fetch('/api/tarjeta/perfil',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,poblacion,nacimiento})});
      const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'No se pudieron guardar los datos.');
      go();
    }catch(e){status(e.message||'No hemos podido conectar. Inténtalo de nuevo.');button.disabled=false;button.textContent='Guardar y ver mi carnet';}
  };
};
