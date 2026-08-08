// RRHH — Pulso anónimo del equipo. Lógica PURA (sin BD, sin red, sin Date: la fecha y el
// azar se inyectan). Es el sitio donde vive la promesa de anonimato, para que se pueda leer
// y testear en un fichero de 150 líneas en vez de auditar el monolito.
//
// LA REGLA: hay dos tablas que no se pueden cruzar. `pulso_invitaciones` sabe QUIÉN ha
// contestado (para no dar la lata con recordatorios); `pulso_respuestas` sabe QUÉ se ha
// contestado, y no tiene worker_id, ni token, ni fecha. Este módulo se encarga de que,
// además, lo que se PUBLICA tampoco permita deducir quién dijo qué.

// Mínimo de respuestas para enseñar un local por separado. Con 5 locales y plantillas de
// 5 a 15 personas, esto significa que Blanes y Lloret se verán casi siempre y los pequeños
// casi nunca. Es la respuesta honesta: por debajo de 4, la media ES la respuesta de alguien.
export const K_ANON = 4;
// Por debajo de esto no se enseña NADA del mes, ni el total.
export const MIN_GLOBAL = 5;

const round1 = (n) => Math.round(n * 10) / 10;

// Media de una lista de números, ignorando null/undefined. null si no queda ninguno.
export function mediaSegura(valores) {
  const v = (valores || []).filter((x) => x != null && !Number.isNaN(Number(x))).map(Number);
  if (!v.length) return null;
  return round1(v.reduce((s, x) => s + x, 0) / v.length);
}

// Agrega las respuestas de un mes por local, aplicando k-anonimato.
//
// Devuelve { total, locales: [{local, n, p1, p2, p3}], suprimidos: {nLocales, n, p1, p2, p3},
//            suficiente }
//
// SUPRESIÓN COMPLEMENTARIA — el fallo clásico de estas tablas: si solo UN local queda por
// debajo del umbral, su media se despeja restando del total. Por eso, si va a quedar un
// único local oculto, se oculta también el siguiente más pequeño.
export function agregarPorLocal(respuestas, { k = K_ANON, minGlobal = MIN_GLOBAL } = {}) {
  const rs = respuestas || [];
  const total = rs.length;
  if (total < minGlobal) {
    return { total, locales: [], suprimidos: null, suficiente: false };
  }
  const porLocal = new Map();
  for (const r of rs) {
    const clave = String(r.local || "—");
    if (!porLocal.has(clave)) porLocal.set(clave, []);
    porLocal.get(clave).push(r);
  }
  const grupos = [...porLocal.entries()]
    .map(([local, filas]) => ({ local, filas, n: filas.length }))
    .sort((a, b) => b.n - a.n || a.local.localeCompare(b.local));

  let visibles = grupos.filter((g) => g.n >= k);
  let ocultos = grupos.filter((g) => g.n < k);

  // Si solo hay un grupo oculto, se puede despejar por resta: ocultamos también el menor
  // de los visibles. Se repite hasta que haya 0 ocultos o al menos 2.
  while (ocultos.length === 1 && visibles.length) {
    const menor = visibles.reduce((a, b) => (b.n < a.n ? b : a));
    visibles = visibles.filter((g) => g !== menor);
    ocultos = ocultos.concat(menor);
  }
  // Caso extremo: si al final solo queda un grupo oculto y ninguno visible, no hay nada
  // que despejar contra qué, así que es seguro (el total ya es público).

  const resumen = (filas) => ({
    p1: mediaSegura(filas.map((f) => f.p1)),
    p2: mediaSegura(filas.map((f) => f.p2)),
    p3: mediaSegura(filas.map((f) => f.p3)),
  });

  const filasOcultas = ocultos.flatMap((g) => g.filas);
  return {
    total,
    suficiente: true,
    locales: visibles
      .map((g) => ({ local: g.local, n: g.n, ...resumen(g.filas) }))
      .sort((a, b) => b.n - a.n || a.local.localeCompare(b.local)),
    suprimidos: ocultos.length
      ? { nLocales: ocultos.length, n: filasOcultas.length, ...resumen(filasOcultas) }
      : null,
  };
}

// Serie mensual de la media global, para ver la evolución. `meses` es la lista de meses a
// mostrar (en orden). Un mes con pocas respuestas sale con media null, no se inventa.
export function serieMensual(respuestas, meses, { minGlobal = MIN_GLOBAL } = {}) {
  const porMes = new Map();
  for (const r of respuestas || []) {
    const m = String(r.mes || "");
    if (!porMes.has(m)) porMes.set(m, []);
    porMes.get(m).push(r);
  }
  return (meses || []).map((mes) => {
    const filas = porMes.get(mes) || [];
    const suficiente = filas.length >= minGlobal;
    return {
      mes,
      n: filas.length,
      suficiente,
      media: suficiente ? mediaSegura(filas.flatMap((f) => [f.p1, f.p2].filter((x) => x != null))) : null,
    };
  });
}

// Los comentarios solo se enseñan si el mes tiene volumen suficiente. Nunca por local:
// un comentario en un grupo de 4 es casi una firma.
export function puedeMostrarComentarios(nMes, { min = MIN_GLOBAL } = {}) {
  return Number(nMes || 0) >= min;
}

// Baraja (Fisher-Yates) con azar inyectable. Se usa para que el orden de los comentarios
// no delate el orden de llegada, que es una fecha encubierta.
export function barajar(arr, rnd = Math.random) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Calendario ───────────────────────────────────────────────────────────────
// "2026-08" → "2026-07"
export function mesAnterior(mes) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ""));
  if (!m) return null;
  let y = +m[1], mm = +m[2] - 1;
  if (mm === 0) { mm = 12; y -= 1; }
  return `${y}-${String(mm).padStart(2, "0")}`;
}

// Últimos `n` meses terminando en `mes` (incluido), del más antiguo al más reciente.
export function ultimosMeses(mes, n) {
  const out = [];
  let cur = mes;
  for (let i = 0; i < n && cur; i++) { out.unshift(cur); cur = mesAnterior(cur); }
  return out;
}

const DIAS_MES = (y, m) => (m === 2 ? (((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28) : [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]);

// Hasta cuándo vale el enlace: fin del mes evaluado + días de gracia (vacaciones, bajas).
export function caducidadMes(mes, { diasGracia = 10 } = {}) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ""));
  if (!m) return null;
  let y = +m[1], mm = +m[2];
  let d = DIAS_MES(y, mm) + diasGracia;
  while (d > DIAS_MES(y, mm)) {
    d -= DIAS_MES(y, mm);
    mm += 1;
    if (mm > 12) { mm = 1; y += 1; }
  }
  return `${y}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ── Tokens ───────────────────────────────────────────────────────────────────
// El token viaja por WhatsApp; en la BD solo se guarda su hash. Un volcado de la base no
// da enlaces que funcionen, y no hay token en claro que correlacionar con nada.
// `rndBytes` y `sha256` se inyectan para poder testear sin depender de crypto.
export function generarToken(rndBytes) {
  const buf = rndBytes(32);
  return Buffer.from(buf).toString("base64url");
}

export function hashToken(token, sha256) {
  return sha256(String(token || ""));
}
