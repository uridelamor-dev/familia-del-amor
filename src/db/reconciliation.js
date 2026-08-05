// Reconciliación de valores `local` contra el catálogo canónico de establecimientos.
// Iteración 2 — solo lectura y diagnóstico. La normalización se usa ÚNICAMENTE para comparar;
// NUNCA modifica los strings originales. No ejecuta SQL con nombres de tabla sin validarlos
// contra los nombres reales obtenidos de sqlite_master/PRAGMA.
import crypto from "crypto";

// Catálogo canónico inicial (sin inventar empresas ni CIF).
export const CATALOGO_CANONICO = [
  "La Tapeta - Blanes",
  "Cooperativa - Blanes",
  "La Tapeta - Lloret",
  "La Tapeta - Girona",
  "Can Mateu - Tordera",
  "La Tapa Ibérica - Tordera",
  "Botiga d'en Mateu - Tordera",
];

// Allowlist CERRADA (sin comodines) de tablas que ESPERAMOS que tengan columna `local`.
// Cualquier tabla futura con columna `local` que NO esté aquí vuelve a DETENER la reconciliación
// hasta revisarla expresamente. Que una tabla esté vacía de valores `local` NO la excluye del
// inventario: si en el futuro contiene valores, se someterá a la misma reconciliación estricta.
export const EXPECTED_LOCAL_TABLES = [
  "users",                       // cuenta de panel; `local` del trabajador nominal
  "reservas",                    // reserva en un local
  "bloqueos_reservas",           // fechas sin reservas por local
  "wa_links",                    // grupo de WhatsApp por local
  "facturas",                    // factura asignada a un local
  "facturas_grupos",             // grupo de WhatsApp de facturas por local
  "facturas_email_reglas",       // regla email→local para clasificar facturas
  "facturas_pendientes",         // factura pendiente de asignar (local opcional)
  "facturas_locales",            // datos fiscales por local (empresa/CIF)
  "hr_jobs",                     // oferta de empleo asociada a un local
  "maintenance_issues",          // incidencia de mantenimiento de un local
  "announcements",               // comunicado interno por local
  // Tablas verificadas por esquema real (tienen columna `local`; hoy sin valores):
  "facturas_emails_procesados",  // registro de emails de facturas ya procesados (dedupe), con su local
  "followup_scheduled",          // seguimientos post-reserva programados, con el local de la reserva
  "sara_respuestas",             // respuestas/documentos configurables de Sara, opcionalmente por local
];

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Checksum corto del catálogo canónico (para migration_state).
export function catalogChecksum(catalogo = CATALOGO_CANONICO) {
  const norm = [...catalogo].sort().join("\n");
  return crypto.createHash("sha256").update(norm).digest("hex").slice(0, 16);
}

// Normaliza SOLO para comparar (no altera el valor original):
// - variantes de guion (‑ ‒ – — ―) → '-'
// - espacios repetidos → un espacio
// - recorta extremos
// - minúsculas (no se tocan acentos: una diferencia de acentos se considera NO reconocida)
export function normalizeForCompare(s) {
  return String(s == null ? "" : s)
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Detecta tablas con columna `local`. Los nombres provienen de sqlite_master (no de input
// externo) y además se validan con un patrón de identificador antes de usarlos en PRAGMA.
export async function detectLocalTables(x) {
  const tables = await x.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name", []
  );
  const withLocal = [];
  for (const { name } of tables) {
    if (!IDENT_RE.test(name)) continue;
    const cols = await x.all(`PRAGMA table_info(${name})`, []);
    if (cols.some((c) => c.name === "local")) withLocal.push(name);
  }
  return withLocal.sort();
}

// Recoge valores distintos de `local` (no nulos ni vacíos) por tabla, con su nº de registros.
// `tableNames` debe venir de detectLocalTables; se re-valida el identificador por seguridad.
export async function collectLocalValues(x, tableNames) {
  const out = [];
  for (const t of tableNames) {
    if (!IDENT_RE.test(t)) throw new Error(`nombre de tabla inválido: ${t}`);
    const rows = await x.all(
      `SELECT local AS local, COUNT(*) AS n FROM "${t}" WHERE local IS NOT NULL AND TRIM(local) <> '' GROUP BY local`, []
    );
    for (const r of rows) out.push({ table: t, local: r.local, count: r.n });
  }
  return out;
}

// Reconciliación completa. Devuelve un informe estructurado con ok/blockers.
export async function reconcile(x, { catalogo = CATALOGO_CANONICO, expectedTables = EXPECTED_LOCAL_TABLES } = {}) {
  const detected = await detectLocalTables(x);
  const unexpectedTables = detected.filter((t) => !expectedTables.includes(t));
  const missingTables = expectedTables.filter((t) => !detected.includes(t)); // informativo

  const normToCanon = new Map();
  for (const c of catalogo) normToCanon.set(normalizeForCompare(c), c);

  const values = await collectLocalValues(x, detected);
  const rows = [];
  const unknown = [];
  const ambiguous = []; // por construcción no debería producirse (catálogo con normalizados únicos)

  for (const v of values) {
    let matchType, canonical = null;
    if (catalogo.includes(v.local)) { matchType = "exacta"; canonical = v.local; }
    else {
      const canon = normToCanon.get(normalizeForCompare(v.local));
      if (canon) { matchType = "normalizada"; canonical = canon; }
      else { matchType = "desconocido"; unknown.push(v); }
    }
    rows.push({ table: v.table, local: v.local, count: v.count, canonical, matchType });
  }

  const blockers = [];
  if (unexpectedTables.length) blockers.push(`tablas inesperadas con columna 'local': ${unexpectedTables.join(", ")}`);
  if (unknown.length) blockers.push(`valores 'local' no reconocidos: ${unknown.length}`);
  if (ambiguous.length) blockers.push(`valores 'local' ambiguos: ${ambiguous.length}`);

  // Mapa valor→canónico para el backfill (solo valores reconocidos).
  const valueToCanon = new Map();
  for (const r of rows) if (r.canonical) valueToCanon.set(r.local, r.canonical);

  return {
    ok: blockers.length === 0,
    blockers,
    detectedTables: detected,
    unexpectedTables,
    missingTables,
    rows,
    unknown,
    ambiguous,
    valueToCanon,
  };
}

// Informe legible (para --dry-run y para los artefactos de la PR). No incluye datos personales.
export function formatReport(result) {
  const L = [];
  L.push("== Reconciliación de establecimientos ==");
  L.push(`Catálogo canónico (checksum ${catalogChecksum()}): ${CATALOGO_CANONICO.length} establecimientos`);
  L.push(`Tablas detectadas con 'local': ${result.detectedTables.join(", ") || "(ninguna)"}`);
  if (result.unexpectedTables.length) L.push(`⚠️  Tablas INESPERADAS con 'local': ${result.unexpectedTables.join(", ")}`);
  if (result.missingTables.length) L.push(`(info) Tablas esperadas ausentes: ${result.missingTables.join(", ")}`);
  L.push("");
  L.push("original | tabla | registros | canónico | coincidencia");
  for (const r of result.rows) {
    L.push(`${JSON.stringify(r.local)} | ${r.table} | ${r.count} | ${r.canonical ?? "—"} | ${r.matchType}`);
  }
  if (result.unknown.length) {
    L.push("");
    L.push("⛔ VALORES NO RECONOCIDOS (bloquean el backfill):");
    for (const u of result.unknown) L.push(`   ${JSON.stringify(u.local)}  (tabla ${u.table}, ${u.count} registros)`);
  }
  L.push("");
  L.push(result.ok ? "RESULTADO: OK (sin bloqueos)" : `RESULTADO: BLOQUEADO → ${result.blockers.join("; ")}`);
  return L.join("\n");
}
