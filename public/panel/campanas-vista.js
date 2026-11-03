/* Vista común; cada origen mantiene sus permisos y su circuito de aprobación. */
let CAMP_FILTROS={estado:'todos',canal:'todos',q:''},CAMP_TIMER=null;
function campFilas(datos){
 const wa=(datos.list||[]).map(c=>({...c,origen:'campana',canal:c.canal||'whatsapp',enviados:Number(c.enviados_reales??c.total_enviados??0),errores:Number(c.errores_reales??c.total_errores??0),total:c.total_destinatarios==null?null:Number(c.total_destinatarios)}));
 const permisos=(datos.comunicaciones||[]).map(c=>({...c,origen:'permiso',canal:'whatsapp',enviados:Number(c.progreso?.entregados||0),errores:Number(c.progreso?.fallidos||0),total:Number(c.destinatarios||0)}));
 const emails=(datos.correos||[]).map(c=>({...c,nombre:c.asunto,origen:'correo',canal:'email',enviados:null,errores:c.error?1:0,total:Number(c.destinatarios||0)}));
 return [...wa,...permisos,...emails].sort((a,b)=>Date.parse(b.creado_en||0)-Date.parse(a.creado_en||0));
}
function campGrupo(c){if(c.errores>0||c.estado==='error')return 'errores';if(['enviada','terminada','enviado'].includes(c.estado))return 'terminados';if(c.estado==='programada')return 'programados';if(['borrador','pendiente','preparado','aprobada'].includes(c.estado))return 'borradores';return 'curso';}
function campEstadoTexto(c){return ({borrador:'Borrador',programada:'Programada',enviando:'En curso',enviada:'Terminada',terminada:'Terminada',pausada:'Pausada',aprobada:'Pendiente de encolar',pendiente:'En preparación',preparado:'Listo para revisar',enviado:'Enviado al proveedor',error:'Con errores',preparando:'Preparando correo'})[c.estado]||c.estado||'Sin estado';}
function campEspera(c,ctx={}){
 if(c.estado==='programada')return 'Programada para '+campFecha(c.programada_para);
 if(c.estado==='pausada')return 'Pausada manualmente';
 if(c.estado==='borrador'||c.estado==='preparado')return 'Pendiente de revisión';
 if(c.estado==='aprobada')return 'Aprobada; falta encolar';
 if(c.estado!=='enviando')return c.error||'';
 if(c.canal==='email')return 'Preparación y envío con el proveedor de correo';
 if(ctx.wa===false)return 'Esperando conexión de WhatsApp';
 if(ctx.cupo?.agotado)return 'Límite diario alcanzado; continuará cuando haya cupo';
 if(c.origen==='permiso'&&ctx.cola?.parada)return 'Cola pausada';
 if(c.origen==='permiso'&&ctx.cola?.fuera_horario)return 'Esperando el horario de envío';
 const pendientes=c.total==null?null:Math.max(0,c.total-c.enviados-c.errores);
 return pendientes===0?'Terminando el registro del envío':c.origen==='permiso'?'En cola; respeta el horario y ritmo configurados':'En curso · un mensaje cada 5 min';
}
function campEstimacion(c,ctx={}){
 if(c.canal!=='whatsapp'||c.estado!=='enviando'||c.total==null)return '';
 const n=Math.max(0,c.total-c.enviados-c.errores);if(!n)return '';
 const ritmo=c.origen==='permiso'?Number(ctx.cola?.ritmo?.minutos||5)/Math.max(1,Number(ctx.cola?.ritmo?.cantidad||1)):5;
 const min=Math.ceil(Math.max(0,n-1)*ritmo),horas=Math.floor(min/60),tiempo=horas?`${horas} h ${min%60} min`:`${min} min`;
 const max=Number(ctx.cupo?.max||0),hoy=Number(ctx.cupo?.quedan||0);
 const dias=max?1+Math.ceil(Math.max(0,n-hoy)/max):null;
 return `Tiempo mínimo de envío: ${tiempo}${dias>1?` · al menos ${dias} días con el cupo actual`:''}. Puede aumentar por otros envíos, horario o desconexión.`;
}
function campFecha(v){if(!v)return 'Sin fecha';const d=new Date(v);return Number.isNaN(+d)?String(v):d.toLocaleString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function campAcciones(c){
 const id=esc(c.id);
 if(c.origen==='correo')return `<button class="btn sm" data-act="camp-correo-detalle" data-id="${id}">Detalle</button>`;
 if(c.origen==='permiso'){
 const acciones=c.estado==='borrador'?[['aprobar','Revisar y aprobar']]:c.estado==='aprobada'?[['encolar','Encolar']]:c.estado==='enviando'?[['pausar','Pausar'],['cancelar','Cancelar pendientes']]:c.estado==='pausada'?[['reanudar','Reanudar'],['cancelar','Cancelar pendientes']]:[];
 return `<button class="btn sm" data-act="camp-permiso-detalle" data-id="${id}">Detalle</button>`+acciones.map(([a,t])=>`<button class="btn sm" data-act="fidg-com" data-id="${id}" data-a="${a}">${t}</button>`).join('');
 }
 return `<button class="btn sm" data-act="camp-detalle" data-id="${id}">Detalle</button>${['borrador','programada'].includes(c.estado)?`<button class="btn sm" data-act="camp-editar" data-id="${id}">Editar</button><button class="btn sm" data-act="camp-enviar" data-id="${id}">Revisar envío</button>`:''}<button class="btn sm" data-act="camp-dup" data-id="${id}">Duplicar</button>${c.estado!=='enviando'?`<button class="btn sm" data-act="camp-del" data-id="${id}">Eliminar</button>`:''}`;
}
function campRenderLista(datos){
 const todas=campFilas(datos),f=CAMP_FILTROS;
 const filas=todas.filter(c=>(f.estado==='todos'||campGrupo(c)===f.estado)&&(f.canal==='todos'||c.canal===f.canal)&&String(c.nombre||'').toLowerCase().includes(f.q.toLowerCase()));
 return `<p class="mut camp-count">${filas.length} de ${todas.length} envíos cargados · correos de tu usuario</p>${datos.fallos?.length?`<div class="pendingblock" role="alert">No se pudo cargar: ${datos.fallos.map(esc).join(', ')}. <button class="btn sm" data-act="camp-refrescar">Reintentar</button></div>`:''}<div class="camp-list">${filas.map(c=>{
 const hecho=(c.enviados||0)+(c.errores||0),pct=c.total>0?Math.min(100,100*hecho/c.total):0;
 return `<article class="camp-row"><div class="camp-main"><div class="camp-row-title"><strong>${esc(c.nombre||'Sin nombre')}</strong><span class="pill">${c.canal==='email'?'Email':'WhatsApp'}</span><span class="pill ${c.errores?'bad':''}">${esc(campEstadoTexto(c))}</span></div><p class="mut">${c.origen==='permiso'?'Comunicación con aprobación':c.origen==='correo'?'Correo a contactos':'Campaña a contactos'} · ${esc(campFecha(c.creado_en))}</p><p>${c.enviados===null?`${num(c.total)} destinatarios · entrega no confirmada desde el panel`:`<b>${num(c.enviados)}</b>${c.total==null?' enviados · total no registrado':` de ${num(c.total)} enviados`}${c.errores?` · <span class="camp-error">${num(c.errores)} errores</span>`:''}`}</p>${c.total>0&&c.enviados!==null?`<progress max="100" value="${pct}" aria-label="Destinatarios procesados"></progress>`:''}<p class="camp-wait">${esc(campEspera(c,datos.ctx))}</p>${campEstimacion(c,datos.ctx)?`<small class="mut">${esc(campEstimacion(c,datos.ctx))}</small>`:''}</div><div class="camp-actions">${campAcciones(c)}</div></article>`;
 }).join('')||'<div class="card mut">No hay envíos con estos filtros.</div>'}</div><p class="mut camp-count">Se muestran hasta 200 campañas, 100 comunicaciones y los 30 correos más recientes.</p>`;
}
function campRenderEnvios(){return `<div class="camp-toolbar"><label>Buscar envío<input id="campBuscar" placeholder="Nombre de la campaña…" value="${esc(CAMP_FILTROS.q)}"></label><label>Estado<select id="campEstado">${[['todos','Todos'],['borradores','Borradores y preparación'],['programados','Programados'],['curso','En curso o pausados'],['terminados','Terminados'],['errores','Con errores']].map(([v,t])=>`<option value="${v}" ${CAMP_FILTROS.estado===v?'selected':''}>${t}</option>`).join('')}</select></label><label>Canal<select id="campCanal"><option value="todos">Todos</option><option value="whatsapp" ${CAMP_FILTROS.canal==='whatsapp'?'selected':''}>WhatsApp</option><option value="email" ${CAMP_FILTROS.canal==='email'?'selected':''}>Email</option></select></label><button class="btn" data-act="camp-refrescar">Actualizar</button></div><div id="campEnvios" aria-live="polite">${campRenderLista(CAMP)}</div>`;}
function campConectarFiltros(){for(const [id,key] of [['campBuscar','q'],['campEstado','estado'],['campCanal','canal']]){const el=document.getElementById(id);if(el)el.addEventListener(id==='campBuscar'?'input':'change',()=>{CAMP_FILTROS[key]=el.value;document.getElementById('campEnvios').innerHTML=campRenderLista(CAMP);});}}
async function campCargarEnvios(){
 const fuentes=[['campañas','/api/campanas'],['correos','/api/correo/envios'],...(puedeVer('promos')?[['comunicaciones','/api/fidelizacion/comunicaciones'],['cola','/api/captacion/campanas']]:[])];
 const r=await Promise.allSettled(fuentes.map(([,url])=>apiRaw(url))),datos={list:[],correos:[],comunicaciones:[],ctx:{},fallos:[]};
 r.forEach((v,i)=>{const nombre=fuentes[i][0];if(v.status!=='fulfilled'){datos.fallos.push(nombre);return;}const d=v.value;if(nombre==='campañas'){datos.list=d.data||[];datos.ctx=d.contexto||{};}if(nombre==='correos')datos.correos=d.data||[];if(nombre==='comunicaciones'){datos.comunicaciones=d.data||[];datos.fidelizacion={comunicaciones:datos.comunicaciones,variables:d.variables||[],bajas:d.bajas};}if(nombre==='cola')datos.cola=d;});
 datos.ctx.cola=datos.cola;return datos;
}
async function campRefrescarEnvios(){const root=document.getElementById('campEnvios');if(!root||root.dataset.cargando)return;root.dataset.cargando='1';try{const d=await campCargarEnvios();if(root.isConnected&&CURRENT==='campanas'&&CAMP_SECCION==='envios'){Object.assign(CAMP,d);if(d.fidelizacion)Object.assign(FIDG,d.fidelizacion);root.innerHTML=campRenderLista(CAMP);}}finally{delete root.dataset.cargando;}}
async function campCorreoDetalle(id){try{const {data:c}=await apiRaw('/api/correo/envios/'+encodeURIComponent(id));modal(c.asunto,`<p class="mut">${esc(campEstadoTexto(c))} · ${num(c.destinatarios?.length||0)} destinatarios</p><div style="white-space:pre-wrap">${esc(c.mensaje)}</div>${c.error?`<p role="alert">${esc(c.error)}</p>`:''}<p class="mut">El estado del proveedor no confirma la entrega al destinatario.</p><button class="btn" data-close>Cerrar</button>`);}catch(e){toast(e.message);}}
function campPermisoDetalle(id){const c=(CAMP.comunicaciones||[]).find(c=>String(c.id)===String(id));if(c)modal(c.nombre,`<p>${esc(campEstadoTexto(c))}</p><div style="white-space:pre-wrap">${esc(c.plantilla||c.mensaje||'')}</div><p>${num(c.destinatarios)} destinatarios</p><div class="camp-actions">${campAcciones({...c,origen:'permiso'})}</div>`);}

function campCumpleResumen(cfg){const r=cfg.resumen||{};return `<div class="card" style="margin-bottom:12px"><div class="ch"><h3>Felicitaciones de cumpleaños</h3><span class="pill">${cfg.cumple_auto?'Activa':'Desactivada'}</span></div><p class="mut">${cfg.cumple_auto?'Se preparan cada día desde las 10:00, hora peninsular.':'No se preparan nuevas felicitaciones.'}</p><p>${num(r.enviados||0)} enviados hoy · ${num(r.pendientes||0)} pendientes · ${num(r.fallidos||0)} errores</p><p class="mut">Último envío: ${cfg.ultimo_envio?esc(campFecha(cfg.ultimo_envio)):'Sin envíos registrados'}</p></div>`;}
