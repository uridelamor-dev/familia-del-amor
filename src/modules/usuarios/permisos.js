// Usuarios — lógica PURA de permisos por módulo y ámbito por local.
// Objetivo: que Dirección pueda (1) ver a qué módulos accede cada usuario y RESTRINGIR
// algunos, y (2) confirmar que un usuario con local asignado solo ve los datos de su local
// en los módulos que varían por local. Sin efectos secundarios: apto para tests unitarios.
//
// Modelo: el ROL define el máximo de módulos accesibles (VIEW_ROLES del panel). Encima, cada
// usuario puede tener una allowlist (`modulos`) que RESTRINGE (nunca amplía) ese máximo.
//  - allowlist vacía/null  → acceso completo del rol (comportamiento por defecto).
//  - allowlist con valores → intersección con los módulos del rol.

// Catálogo único de módulos del panel. `porLocal`: sus datos cambian según el local, así que
// un usuario con local asignado (y rol distinto de dirección) queda limitado a su local.
export const CATALOGO_MODULOS = [
  { id: "dashboard", label: "Dashboard", roles: ["direccion", "encargado", "contabilidad"], porLocal: true },
  { id: "reservas", label: "Reservas", roles: ["direccion", "encargado"], porLocal: true },
  { id: "comunicados", label: "Comunicados", roles: ["direccion", "encargado"], porLocal: false },
  { id: "mantenimiento", label: "Mantenimiento", roles: ["direccion", "encargado"], porLocal: true },
  { id: "clientes", label: "Clientes", roles: ["direccion", "marketing"], porLocal: false },
  { id: "rrhh", label: "RR. HH.", roles: ["direccion", "rrhh", "encargado"], porLocal: true },
  // Horarios y fichajes van SEPARADOS a propósito: contabilidad necesita los fichajes para
  // la nómina pero no debe poder tocar el cuadrante, y al revés el encargado planifica pero
  // no cierra periodos. Ojo: hay un espejo manual de esta lista en public/panel/app.js
  // (VIEW_ROLES), y un test que falla si dejan de coincidir.
  { id: "horarios", label: "Horarios", roles: ["direccion", "rrhh", "encargado"], porLocal: true },
  { id: "fichajes", label: "Fichajes", roles: ["direccion", "rrhh", "encargado", "contabilidad"], porLocal: true },
  { id: "facturas", label: "Facturas", roles: ["direccion", "contabilidad"], porLocal: true },
  // Módulo aparte y NO un permiso dentro de Facturas: el encargado sube la factura de su
  // proveedor y no tiene por qué ver el gasto del grupo, los totales ni la configuración
  // fiscal. Separarlo hace que «puede subir» y «puede ver» sean dos cosas distintas, que es
  // lo que son.
  { id: "subirfactura", label: "Subir factura", roles: ["direccion", "contabilidad", "encargado"], porLocal: true },
  { id: "inventarios", label: "Inventarios", roles: ["direccion", "encargado"], porLocal: true },
  { id: "web", label: "Web", roles: ["direccion", "marketing"], porLocal: false },
  { id: "reviews", label: "Reseñas", roles: ["direccion", "encargado", "contabilidad", "marketing"], porLocal: true },
  { id: "campanas", label: "Campañas", roles: ["direccion", "marketing"], porLocal: false },
  { id: "analitica", label: "Analítica de ventas", roles: ["direccion", "contabilidad"], porLocal: true },
  { id: "sara", label: "Sara (IA)", roles: ["direccion", "marketing"], porLocal: false },
  { id: "whatsapp", label: "WhatsApp", roles: ["direccion", "encargado"], porLocal: false },
  { id: "agora", label: "Ágora (TPV)", roles: ["direccion"], porLocal: false },
  { id: "usuarios", label: "Usuarios", roles: ["direccion"], porLocal: false },
];

// IDs de módulos que un rol puede ver (su máximo teórico).
export function modulosDeRol(rol, catalogo = CATALOGO_MODULOS) {
  return (Array.isArray(catalogo) ? catalogo : []).filter((m) => (m.roles || []).includes(rol)).map((m) => m.id);
}

// Normaliza la allowlist guardada (array, JSON string o null) a un array de strings.
export function parseModulos(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (typeof v === "string" && v.trim()) {
    try {
      const a = JSON.parse(v);
      return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Módulos EFECTIVOS de un usuario. Sin allowlist → todos los del rol. Con allowlist →
// intersección con los del rol (jamás concede más de lo que el rol permite).
export function modulosEfectivos(rol, modulosGuardados, catalogo = CATALOGO_MODULOS) {
  const delRol = modulosDeRol(rol, catalogo);
  const guard = parseModulos(modulosGuardados);
  if (!guard.length) return delRol;
  const permit = new Set(guard);
  return delRol.filter((id) => permit.has(id));
}

// ¿Este usuario puede entrar a `view`?
export function puedeAccederModulo(view, { rol, modulos } = {}, catalogo = CATALOGO_MODULOS) {
  return modulosEfectivos(rol, modulos, catalogo).includes(view);
}

// Sanea una allowlist antes de guardarla: solo IDs válidos para ese rol. Si cubre TODOS los
// del rol (o viene vacía) devolvemos null → "sin restricción" (acceso completo del rol).
export function sanearModulos(rol, modulosGuardados, catalogo = CATALOGO_MODULOS) {
  const delRol = modulosDeRol(rol, catalogo);
  const guard = new Set(parseModulos(modulosGuardados));
  const limpio = delRol.filter((id) => guard.has(id));
  if (!limpio.length || limpio.length === delRol.length) return null;
  return limpio;
}

// ¿El módulo `view` muestra datos que cambian por local?
export function esModuloPorLocal(view, catalogo = CATALOGO_MODULOS) {
  const m = (Array.isArray(catalogo) ? catalogo : []).find((x) => x.id === view);
  return !!(m && m.porLocal);
}

// Local que se debe FORZAR a un usuario. Dirección nunca queda restringida; un usuario sin
// local tampoco. Si se pasa `view`, solo se fuerza en módulos que varían por local.
export function localForzado(user, view = null, catalogo = CATALOGO_MODULOS) {
  if (!user || user.rol === "direccion" || !user.local) return null;
  if (view && !esModuloPorLocal(view, catalogo)) return null;
  return user.local;
}
