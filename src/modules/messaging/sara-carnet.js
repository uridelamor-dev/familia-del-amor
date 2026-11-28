import {urlTarjeta,urlAlta} from '../wallet/wallet.js';

export const HERRAMIENTA_CARNET={name:'consultar_mi_carnet',description:'Recupera el enlace del carnet de socio del cliente que escribe. Úsala si pide su carnet, tarjeta del Club, QR o recuperar el enlace. No pide nombre ni teléfono: la identidad procede exclusivamente de WhatsApp. No crea carnets ni cambia puntos.',input_schema:{type:'object',properties:{},required:[],additionalProperties:false}};

export function telefonoCarnet(v){
 const t=String(v||'').replace(/\D/g,'').replace(/^00/,'');
 if(/^[6789]\d{8}$/.test(t))return '34'+t;
 return /^\d{10,15}$/.test(t)?t:null;
}
export async function recuperarCarnet({all,telefono,base,activo,hoy=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Madrid'})}){
 if(!activo)return {estado:'no_disponible'};
 const tel=telefonoCarnet(telefono);if(!tel)return {estado:'identidad_no_verificada'};
 // Solo los números españoles admiten el formato histórico de nueve dígitos.
 const filas=await all(`SELECT token,anulado_en,caduca_en FROM pro_qr WHERE clase='carnet' AND
 (CASE WHEN regexp_replace(telefono,'[^0-9]','','g') ~ '^[6789][0-9]{8}$'
 THEN '34'||regexp_replace(telefono,'[^0-9]','','g')
 ELSE regexp_replace(regexp_replace(telefono,'[^0-9]','','g'),'^00','') END)=?`,[tel]);
 const validos=filas.filter(q=>!q.anulado_en&&(!q.caduca_en||String(q.caduca_en).slice(0,10)>=hoy)&&q.token);
 if(validos.length>1)return {estado:'ambiguo'};
 if(validos.length===1)return {estado:'encontrado',url:urlTarjeta(base,validos[0].token)};
 if(filas.length)return {estado:'no_vigente'};
 return {estado:'sin_carnet',url:urlAlta(base)};
}
export function instruccionesCarnet(r){
 switch(r?.estado){
 case 'encontrado':return `Este es el enlace verificado del carnet del remitente: ${r.url}\nInclúyelo exactamente en tu respuesta, en el idioma del cliente. No se ha creado otro carnet ni cambiado sus puntos o visitas. No afirmes que se ha enviado otro mensaje: lo estás facilitando en esta respuesta.`;
 case 'sin_carnet':return `No consta carnet asociado al número de WhatsApp desde el que escribe. Facilita este formulario: ${r.url}. Si cree que lo registró con otro teléfono, indícale que escriba desde aquel número; no pidas un teléfono alternativo para revelar su tarjeta.`;
 case 'identidad_no_verificada':return 'No se ha podido verificar el teléfono del remitente. No afirmes que no tiene carnet ni pidas que escriba otro número para recuperar el enlace. Explica que no puedes recuperar su enlace ahora y que pruebe de nuevo más tarde.';
 case 'ambiguo':case 'no_vigente':return 'El carnet requiere revisión: no facilites enlaces ni crees otro. Explica la incidencia y usa pasar_a_persona para que el equipo revise su carnet sin prometer plazos.';
 case 'no_disponible':return 'El servicio de tarjetas no está disponible. No facilites un enlace de alta ni inventes que no tiene carnet. Explica que no puedes recuperar el enlace ahora.';
 default:return 'Ha fallado la consulta del carnet. No significa que no tenga uno. Indica que no has podido recuperarlo ahora y que puede volver a intentarlo más tarde; no crees otro ni inventes un enlace.';
 }
}

const LOCALES_CLUB_RESERVA = new Set(['La Tapeta - Blanes', 'La Tapeta - Lloret', 'La Tapeta - Girona']);
export const clubEnReserva = local => LOCALES_CLUB_RESERVA.has(local);

const textosReserva = {
 es: { socio: 'Recuerda enseñar tu tarjeta del Club para sumar puntos y aprovechar las promociones vigentes que te correspondan.', alta: 'Únete gratis al Club para sumar puntos y acceder a promociones:' },
 ca: { socio: 'Recorda ensenyar la targeta del Club per sumar punts i aprofitar les promocions vigents que et corresponguin.', alta: 'Uneix-te al Club de franc per sumar punts i accedir a promocions:' },
 en: { socio: 'Show your Club card to earn points and use any current offers you qualify for.', alta: 'Join the Club for free to earn points and access offers:' },
};

export async function consultarClubReserva({ local, telefono, consultar }) {
 if (!clubEnReserva(local) || !telefonoCarnet(telefono) || !consultar) return null;
 let timer;
 try {
  return await Promise.race([
   Promise.resolve().then(() => consultar(telefono, { paraReserva: true })),
   new Promise(resolve => { timer = setTimeout(() => resolve(null), 1500); }),
  ]);
 } catch { return null; }
 finally { clearTimeout(timer); }
}

export async function notaClubReserva({ local, telefono, idioma, consultar, resultado }) {
 if (!clubEnReserva(local)) return '';
 const carnet = resultado === undefined ? await consultarClubReserva({local, telefono, consultar}) : resultado;
 const texto = textosReserva[idioma] || textosReserva.es;
 if (carnet?.estado === 'encontrado') return texto.socio;
 if (carnet?.estado === 'sin_carnet' && carnet.url) return texto.alta + ' ' + carnet.url;
 return '';
}
