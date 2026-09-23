// Datos administrativos: ninguna dependencia de correo ni de WhatsApp.
export const CAMPOS_PRIVADOS = ['direccion', 'iban', 'tipo_jornada', 'tipo_contrato', 'talla_ropa'];
export const puedeVerPrivado = (rol) => ['rrhh', 'direccion'].includes(rol);
export function fechaValida(v) {
  const d = new Date(v + 'T12:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function ibanValido(v) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return false;
  if (v.startsWith('ES') && v.length !== 24) return false;
  const s = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let r = 0; for (const c of s) r = (r * 10 + Number(c)) % 97;
  return r === 1;
}
export function sanearDatosAlta(input = {}, hoy) {
  const datos = {}, errores = [];
  for (const k of [...CAMPOS_PRIVADOS, 'dni', 'telefono', 'email', 'fecha_nac', 'puesto']) {
    if (input[k] === undefined) continue;
    let v = String(input[k] ?? '').trim();
    if (v.length > (k === 'direccion' ? 400 : 160)) { errores.push(`El campo ${k} es demasiado largo.`); continue; }
    if (k === 'iban') v = v.replace(/\s/g, '').toUpperCase();
    if (k === 'dni') v = v.replace(/[\s-]/g, '').toUpperCase();
    if (v && k === 'iban' && !ibanValido(v)) errores.push('El IBAN no es válido.');
    if (v && k === 'dni' && !/^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/.test(v)) errores.push('Revisa el formato del DNI/NIE.');
    if (v && k === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errores.push('Revisa el correo electrónico.');
    if (v && k === 'telefono' && !/^\+?[\d\s()-]{9,20}$/.test(v)) errores.push('Revisa el teléfono.');
    if (v && k === 'fecha_nac' && (!fechaValida(v) || v >= hoy)) errores.push('Revisa la fecha de nacimiento.');
    if (v && k === 'tipo_jornada' && !['completa', 'parcial'].includes(v)) errores.push('Elige jornada completa o parcial.');
    if (v && k === 'tipo_contrato' && !['indefinido', 'temporal', 'fijo_discontinuo'].includes(v)) errores.push('Elige un tipo de contrato.');
    datos[k] = v || null;
  }
  return { datos, errores, ok: !errores.length };
}
export function estadoAlta(persona = {}, contrato = null, tienePin = false) {
  const basicos = { dni: 'DNI/NIE', nombre: 'Nombre completo', tipo_jornada: 'Tipo de jornada', tipo_contrato: 'Tipo de contrato', local: 'Establecimiento', puesto: 'Puesto', fecha_alta: 'Fecha de incorporación', horas_semana: 'Horas semanales' };
  const resto = { direccion: 'Dirección', fecha_nac: 'Fecha de nacimiento', iban: 'IBAN', talla_ropa: 'Talla de ropa', telefono: 'Teléfono', email: 'Correo electrónico', pin: 'PIN de 4 dígitos' };
  const valores = { ...persona, horas_semana: contrato?.horas_semana, pin: tienePin };
  const faltan = campos => Object.entries(campos).filter(([k]) => !valores[k]).map(([, v]) => v);
  const faltanGestoria = faltan(basicos), faltanFicha = [...faltanGestoria, ...faltan(resto)];
  return { listaGestoria: !faltanGestoria.length, completa: !faltanFicha.length, faltanGestoria, faltanFicha, correoConectado: false };
}
export function sanearConversacion(input, hoy) {
  const datos = {};
  for (const [k, max] of Object.entries({ contenido: 6000, asunto: 200, interlocutor: 200, canal: 100, acuerdos: 4000 })) {
    datos[k] = String(input[k] || '').trim();
    if (datos[k].length > max) return { error: `El campo ${k} es demasiado largo.` };
  }
  if (!datos.contenido) return { error: 'Escribe qué se habló.' };
  datos.fecha_conversacion = String(input.fecha_conversacion || hoy);
  if (!fechaValida(datos.fecha_conversacion) || datos.fecha_conversacion > hoy) return { error: 'Revisa la fecha de la conversación.' };
  return { datos };
}
