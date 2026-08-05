// Lector del feature flag PERMISOS_V2 (Iteración 3).
// Por ahora se controla por variable de entorno; NO hay tabla feature_flags ni UI todavía.
// Se considera ACTIVO solo cuando el valor es EXACTAMENTE la cadena "true". Cualquier otro
// valor (incluidos "1", "TRUE", vacío o ausente) se considera DESACTIVADO (por defecto).
export function permisosV2Enabled(env = process.env) {
  return env.PERMISOS_V2 === "true";
}
