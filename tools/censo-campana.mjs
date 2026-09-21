// CUÁNTA GENTE HAY DETRÁS DE UNA CAMPAÑA Y EN QUÉ ESTADO ESTÁ SU MENSAJE.
//
//   node tools/censo-campana.mjs esmorzar-girona
//
// ── SOLO LEE ─────────────────────────────────────────────────────────────────────────────────
//
// Una consulta por bloque y las cuatro son `SELECT`. No hay UPDATE, ni INSERT, ni DELETE, y no
// se importa `whatsapp.js` por ningún lado: ejecutar esto NO manda un solo mensaje. Es a
// propósito — lo primero que hay que saber es a cuánta gente afecta, antes de decidir nada.
//
// ── Y NO IMPRIME DATOS PERSONALES ────────────────────────────────────────────────────────────
//
// Ni un teléfono, ni un nombre, ni un token, ni un código. Solo recuentos. Esta salida se pega
// en un chat y se queda ahí; lo que no sale no se filtra.
//
// Se ejecuta EN REPLIT, que es donde vive `DATABASE_URL`. La misma cuenta que el endpoint
// `/api/captacion/campanas/:clave/censo` del panel, y con el mismo módulo de decisión, para que
// los dos números no puedan divergir.

import { censar, ETIQUETAS, ESTADOS, motivoParada } from "../src/modules/captacion/recuperacion.js";

const clave = (process.argv[2] || "").trim();
if (!clave) {
  console.error("Falta la campaña.  Uso:  node tools/censo-campana.mjs <clave>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("No hay DATABASE_URL. Esto se ejecuta en Replit, no en local.");
  process.exit(1);
}

// `pg` se carga AQUÍ y no arriba: en una máquina de desarrollo no está instalado, y un
// `ERR_MODULE_NOT_FOUND` en la primera línea esconde el aviso útil —que esto se ejecuta en
// Replit— detrás de veinte líneas de traza.
let pg;
try { ({ default: pg } = await import("pg")); }
catch {
  console.error("Falta el paquete `pg`. Esto se ejecuta en Replit, donde sí está.");
  process.exit(1);
}

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const T9 = (col) => `RIGHT(regexp_replace(${col}, '[^0-9]', '', 'g'), 9)`;

// ── 1 · QUIÉN SE APUNTÓ ───────────────────────────────────────────────────────────────────────
//
// Las dos formas de apuntarse cuentan como la misma campaña: el formulario clásico deja
// `leads.campana` y el configurable deja `fuente = 'form:<clave>'`. Separarlas aquí daría dos
// cifras que nadie sabría sumar.
const { rows: gente } = await db.query(
  `SELECT l.id AS lead_id, l.telefono,
          (SELECT r.id FROM pro_qr r
            WHERE ${T9("r.telefono")} = ${T9("l.telefono")} AND r.anulado_en IS NULL
            ORDER BY r.id DESC LIMIT 1) AS qr_id,
          (SELECT p.baja FROM marketing_prefs p
            WHERE ${T9("p.telefono")} = ${T9("l.telefono")} LIMIT 1) AS baja
     FROM leads l
    WHERE COALESCE(NULLIF(l.campana, ''), '') = $1 OR l.fuente = $2`,
  [clave, `form:${clave}`]);

// ── 2 · QUÉ HAY EN LA COLA ────────────────────────────────────────────────────────────────────
const { rows: cola } = await db.query(
  `SELECT telefono, qr_id, estado, enviado_en, intentos, ultimo_error
     FROM cap_cola WHERE campana = $1 ORDER BY id ASC`, [clave]);

// Una fila ENVIADA gana a cualquier otra de la misma persona.
const mejor = (a, b) => (a && (a.enviado_en || String(a.estado) === "enviado")) ? a : b;
const porQr = new Map(), porTel = new Map();
for (const c of cola) {
  if (c.qr_id) porQr.set(c.qr_id, mejor(porQr.get(c.qr_id), c));
  const t9 = String(c.telefono || "").replace(/\D/g, "").slice(-9);
  if (t9) porTel.set(t9, mejor(porTel.get(t9), c));
}

const destinatarios = gente.map((g) => {
  const t9 = String(g.telefono || "").replace(/\D/g, "").slice(-9);
  return { leadId: g.lead_id, telefono: g.telefono, qrId: g.qr_id || null,
           baja: Number(g.baja) === 1,
           cola: (g.qr_id && porQr.get(g.qr_id)) || porTel.get(t9) || null };
});
const censo = censar(destinatarios);

// ── 3 · POR QUÉ NO SALE NADA, SI ES QUE NO SALE ───────────────────────────────────────────────
//
// `isReady()` vive en el proceso del servidor, no aquí, así que desde un script no se puede
// saber si WhatsApp está conectado. Lo que sí se puede leer es el interruptor de pánico y el
// gasto del día, y decir claramente que lo tercero hay que mirarlo en el panel.
const { rows: [parada] } = await db.query(
  `SELECT value FROM config WHERE key = 'captacion_cola_parada'`);
const hoy = new Date().toISOString().slice(0, 10);
const { rows: [gasto] } = await db.query(
  `SELECT COUNT(*)::int AS n FROM cap_cola WHERE SUBSTRING(enviado_en, 1, 10) = $1`, [hoy]);

// ── 4 · ¿HAY MENSAJE CONFIGURADO? ─────────────────────────────────────────────────────────────
//
// Es la causa silenciosa: sin plantilla no se compone nada y no se encola nada, sin error.
const { rows: [camp] } = await db.query(
  `SELECT clave, activa, textos, promocion_id FROM cap_campanas WHERE clave = $1`, [clave]);
const { rows: [form] } = await db.query(
  `SELECT clave, version, estado, COALESCE(NULLIF(mensaje_wa, ''), '') <> '' AS tiene_wa
     FROM fid_formularios WHERE clave = $1 ORDER BY version DESC LIMIT 1`, [clave]);

let plantillaClasica = false;
try {
  const t = camp ? JSON.parse(camp.textos || "{}") : {};
  plantillaClasica = Object.values(t).some((x) => String(x?.wa || "").trim());
} catch {}

await db.end();

const linea = (k) => `  ${String(ETIQUETAS[k] || k).padEnd(30, ".")} ${String(censo[k] ?? 0).padStart(5)}`;
const frenos = motivoParada({
  whatsappListo: true,                       // no se puede saber desde aquí: se avisa abajo
  colaParada: String(parada?.value) === "1",
  cupoLibre: 1,
});

console.log(`
═══════════════════════════════════════════════════════════════
  CENSO DE «${clave}» · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC
═══════════════════════════════════════════════════════════════

  ${"Se apuntaron".padEnd(30, ".")} ${String(censo.total).padStart(5)}

${linea(ESTADOS.ENVIADO)}
${linea(ESTADOS.PENDIENTE)}
${linea(ESTADOS.ERROR)}
${linea(ESTADOS.SIN_COLA)}      ← con código y SIN encolar
${linea(ESTADOS.SIN_QR)}
${linea(ESTADOS.SIN_TELEFONO)}
${linea(ESTADOS.BAJA)}

  ── LO QUE SE PODRÍA RECUPERAR ──
  Encolar por primera vez ........ ${String(censo.recuperables).padStart(5)}
  Reintentar un error ............ ${String(censo.reintentables).padStart(5)}

  ── LA CAMPAÑA ──
  Campaña clásica ................ ${camp ? (camp.activa ? "sí, activa" : "sí, APAGADA") : "no existe"}
  Promoción vinculada ............ ${camp ? (camp.promocion_id ? "sí" : "NO — sin ella no hay código") : "—"}
  Plantilla de WhatsApp .......... ${camp ? (plantillaClasica ? "configurada" : "VACÍA — usa la de por defecto") : "—"}
  Formulario configurable ........ ${form ? `v${form.version} (${form.estado})` : "no existe"}
  Su mensaje de WhatsApp ......... ${form ? (form.tiene_wa ? "configurado" : "VACÍO — no manda nada") : "—"}

  ── POR QUÉ PODRÍA NO ESTAR SALIENDO ──
  Interruptor de pánico .......... ${String(parada?.value) === "1" ? "PUESTO — nada sale" : "quitado"}
  Enviados hoy ................... ${gasto?.n ?? 0}
  WhatsApp conectado ............. míralo en el panel (Sistema → WhatsApp): desde
                                   un script no se puede saber, y es el freno que
                                   más veces lo explica tras un despliegue.
${frenos.parado ? `\n  ⚠ ${frenos.texto}` : ""}
`);
