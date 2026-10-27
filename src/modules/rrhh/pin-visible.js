import {cifrar,abrir} from '../seguridad/secretos.js';
const dominio='rrhh-pin-visible-v1';
// El hash sigue siendo la credencial de fichaje. Esta copia solo se abre para RR.HH.
export function guardarPinVisible(pin,llavero){
 return llavero?.actual ? cifrar(pin,llavero,dominio) : null;
}
export function leerPinVisible(valor,llavero,rol){
 if(!['direccion','rrhh'].includes(rol)||!String(valor||'').startsWith('enc:v2:'))return null;
 const r=abrir(valor,llavero,dominio);
 return r.ok && /^\d{4,8}$/.test(r.valor||'') ? r.valor : null;
}
