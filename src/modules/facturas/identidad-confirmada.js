import {nifComprobable} from './contraste-dirigido.js';
import {normNif} from './emisor.js';
const nombre=v=>String(v||'').normalize('NFKC').trim().toLocaleLowerCase('es').replace(/\s+/g,' ');
// Los antiguos revision-nif-* se aprendían al guardar cualquier campo, sin confirmar
// identidad. No se promocionan retroactivamente a evidencia humana.
export function nifsConfirmados(proveedor,fichas=[]) {
 if(!nombre(proveedor))return [];
 return [...new Set(fichas.filter(f=>nombre(f.proveedor)===nombre(proveedor) && f.autor
  && (!String(f.clave||'').startsWith('revision-nif-') || String(f.clave).startsWith('revision-nif-confirmado-')))
  .map(f=>normNif(f.nif)).filter(nifComprobable))];
}
