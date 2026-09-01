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
  { id: "rrhh", label: "Equipo", roles: ["direccion", "rrhh", "encargado"], porLocal: true },
  // Las tres pestañas de dentro de Equipo, sueltas. Antes «RR. HH.» era una sola casilla que
  // daba las cuatro cosas a la vez, y dar acceso a la ficha de la gente obligaba a dar también
  // la contratación y las respuestas del pulso. Son datos muy distintos:
  //   · Equipo      la ficha de cada uno: contrato, documentos, horas.
  //   · Contratación candidaturas y vacantes: currículums de gente de fuera.
  //   · Pulso       lo que el equipo contesta sobre cómo está. Se lee agregado, y aun así.
  //   · Preguntas   qué se les pregunta cada mes.
  { id: "contratacion", label: "Contratación", roles: ["direccion", "rrhh"], porLocal: true, dentroDe: "rrhh" },
  { id: "pulso", label: "Pulso del equipo", roles: ["direccion", "rrhh"], porLocal: true, dentroDe: "rrhh" },
  { id: "preguntas", label: "Preguntas del mes", roles: ["direccion", "rrhh"], porLocal: false, dentroDe: "rrhh" },
  // Horarios y fichajes van SEPARADOS a propósito: contabilidad necesita los fichajes para
  // la nómina pero no debe poder tocar el cuadrante, y al revés el encargado planifica pero
  // no cierra periodos. Ojo: hay un espejo manual de esta lista en public/panel/app.js
  // (VIEW_ROLES), y un test que falla si dejan de coincidir.
  { id: "horarios", label: "Horarios", roles: ["direccion", "rrhh", "encargado"], porLocal: true },
  { id: "fichajes", label: "Fichajes", roles: ["direccion", "rrhh", "encargado", "contabilidad"], porLocal: true },
  { id: "facturas", label: "Compras", roles: ["direccion", "contabilidad"], porLocal: true },
  // Productos (antes «Qué compramos», dentro de Compras). Es un módulo aparte y no una
  // pestaña porque no responde a la misma pregunta: Compras es «qué papeles hay» y Productos
  // es «qué entra por la puerta y a cómo nos lo cobran». Se mira con otra frecuencia y por
  // otro motivo, y escondido en la cuarta pestaña de otro módulo casi nadie llegaba.
  { id: "productos", label: "Productos", roles: ["direccion", "contabilidad"], porLocal: true },
  // Módulo aparte y NO un permiso dentro de Facturas: el encargado sube la factura de su
  // proveedor y no tiene por qué ver el gasto del grupo, los totales ni la configuración
  // fiscal. Separarlo hace que «puede subir» y «puede ver» sean dos cosas distintas, que es
  // lo que son.
  //
  // SOLO ENCARGADO. Dirección y contabilidad ya suben facturas desde Compras → Facturas, con
  // el mismo botón y el mismo endpoint. Tenerlo además como módulo suelto les repetía en el
  // menú una entrada que no usaban y hacía pensar que era otro sitio con otra bandeja.
  { id: "subirfactura", label: "Subir factura", roles: ["encargado"], porLocal: true },
  { id: "inventarios", label: "Inventarios", roles: ["direccion", "encargado"], porLocal: true },
  { id: "web", label: "Web", roles: ["direccion", "marketing"], porLocal: false },
  { id: "reviews", label: "Reseñas", roles: ["direccion", "encargado", "contabilidad", "marketing"], porLocal: true },
  { id: "campanas", label: "Campañas", roles: ["direccion", "marketing"], porLocal: false },
  // Promociones. `porLocal: false` como Clientes y Campañas: una promoción puede limitarse a
  // una barra, pero eso es un campo suyo, no el ámbito de quien la gestiona — el de Marketing
  // las hace para todo el grupo. Quien SÍ trabaja por local es el kiosco, y ese no pasa por
  // aquí: valida con el token del dispositivo, que ya lleva su barra dentro.
  { id: "promos", label: "Promociones", roles: ["direccion", "marketing"], porLocal: false },
  { id: "analitica", label: "Analítica de ventas", roles: ["direccion", "contabilidad"], porLocal: true },
  { id: "sara", label: "Sara (IA)", roles: ["direccion", "marketing"], porLocal: false },
  { id: "whatsapp", label: "WhatsApp", roles: ["direccion", "encargado"], porLocal: false },
  { id: "agora", label: "Ágora (TPV)", roles: ["direccion"], porLocal: false },
  // `porLocal` desde que la lista se filtra por el establecimiento de la barra: con Blanes
  // puesto salen los de Blanes. El menú lo marca como «por local» y el panel lo respeta.
  { id: "usuarios", label: "Usuarios", roles: ["direccion"], porLocal: true },
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
  // HERENCIA, y no es un capricho: el día que un módulo se parte en varios, las allowlist ya
  // guardadas hablan del padre y no saben nada de los hijos. Sin esto, partir «RR. HH.» en
  // cuatro le quitaría de golpe la contratación y el pulso a quien los tenía —sin que nadie
  // lo decidiera y sin que se note hasta que alguien busca una pantalla que ya no está—.
  //
  // La regla: si la lista NO menciona a NINGÚN hijo de un padre que sí está, se entiende que
  // los tiene todos. En cuanto se guarde una vez desde el panel, la lista pasa a ser explícita
  // y manda ella.
  const lista = (Array.isArray(catalogo) ? catalogo : []);
  // Se decide ANTES de tocar nada: qué padres están en la lista sin ninguno de sus hijos. Si
  // se fueran añadiendo sobre la marcha, al meter el primer hijo los demás verían un hermano
  // ya presente y se quedarían fuera — heredaría uno solo de los tres.
  const padres = [...new Set(lista.filter((m) => m.dentroDe).map((m) => m.dentroDe))];
  const heredan = padres.filter((p) => permit.has(p)
    && !lista.some((x) => x.dentroDe === p && permit.has(x.id)));
  for (const m of lista) if (m.dentroDe && heredan.includes(m.dentroDe)) permit.add(m.id);
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

/**
 * De qué módulo es una ruta de la API. Sirve para que quitar un módulo a alguien no sea solo
 * cosmético: hasta ahora la allowlist únicamente escondía botones, y quien supiera la URL
 * seguía pudiendo llamar a la API.
 *
 * El mapa va por prefijo y es DELIBERADAMENTE incompleto: lo que no está aquí se comporta
 * exactamente como antes (sin comprobación de módulo, solo de rol). Añadir una entrada
 * ENDURECE; no añadirla no rompe nada. Es la forma segura de cerrar esto por partes.
 */
export const MODULO_POR_RUTA = [
  ["/api/reservas", "reservas"],
  ["/api/dashboard", "dashboard"],
  ["/api/comunicados", "comunicados"],
  ["/api/mantenimiento", "mantenimiento"],
  ["/api/inventario", "inventarios"],
  ["/api/inv/", "inventarios"],
  ["/api/contactos", "clientes"],
  ["/api/clientes", "clientes"],
  ["/api/campanas", "campanas"],
  ["/api/promos", "promos"],
  ["/api/plantillas", "campanas"],
  ["/api/audiencias", "campanas"],
  ["/api/reviews", "reviews"],
  // OJO AL ORDEN: se recorre de arriba abajo y gana la primera que casa, así que las hijas
  // van antes que `/api/rrhh`. Al revés, «pulso» nunca se alcanzaría.
  ["/api/rrhh/pulso", "pulso"],
  ["/api/rrhh/preguntas", "preguntas"],
  ["/api/hr/", "contratacion"],
  ["/api/rrhh", "rrhh"],
  ["/api/horarios", "horarios"],
  ["/api/fichajes", "fichajes"],
  ["/api/agora", "analitica"],
  ["/api/sara", "sara"],
];

/** Módulo al que pertenece una ruta, o null si no está mapeada (no se comprueba). */
export function moduloDeRuta(ruta) {
  const r = String(ruta || "").split("?")[0];
  for (const [pre, mod] of MODULO_POR_RUTA) if (r === pre || r.startsWith(pre + "/") || r.startsWith(pre)) return mod;
  return null;
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
