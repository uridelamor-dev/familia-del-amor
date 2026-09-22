import { createHash } from 'node:crypto';
export const WEB_SCHEMA = `
CREATE SEQUENCE IF NOT EXISTS web_borrador_revision_seq AS INTEGER;
CREATE TABLE IF NOT EXISTS web_borradores (
 usuario_id INTEGER PRIMARY KEY, base_version TEXT NOT NULL, cambios JSONB NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS web_versiones (
 id BIGSERIAL PRIMARY KEY, autor TEXT NOT NULL, contenido JSONB NOT NULL,
 creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
export function huellaContenido(contenido) {
  return createHash('sha256').update(JSON.stringify(Object.keys(contenido).sort().map(k => [k, contenido[k]]))).digest('hex');
}
export function validarCambios(cambios, permitido) {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) return 'Borrador inválido';
  const entradas = Object.entries(cambios);
  if (entradas.length > 1000 || JSON.stringify(cambios).length > 1000000) return 'Borrador demasiado grande';
  for (const [key, value] of entradas) {
    if (!permitido(key) || (value !== null && typeof value !== 'string')) return 'Campo de contenido no permitido';
    if (typeof value === 'string' && value.length > 100000) return 'Contenido demasiado largo';
  }
  return null;
}
export function diferenciasContenido(base, nuevo, permitido = () => true) {
  const cambios = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(nuevo)])) {
    if (permitido(k) && base[k] !== nuevo[k]) cambios[k] = nuevo[k] ?? null;
  }
  return cambios;
}
export function aplicarCambios(base, cambios) {
  const nuevo = { ...base };
  for (const [k, v] of Object.entries(cambios)) { if (v === null) delete nuevo[k]; else nuevo[k] = v; }
  return nuevo;
}
