// CUÁNTA GENTE HAY DETRÁS DE UNA CAMPAÑA, Y DÓNDE ESTÁN LAS ALTAS DE VERDAD.
//
//   node tools/censo-campana.mjs --descubrir      qué claves existen y cuántas altas tiene cada una
//   node tools/censo-campana.mjs <clave>          el detalle de UNA campaña concreta
//
// ── POR QUÉ HAY DOS MODOS, Y POR QUÉ EL PRIMERO ES EL QUE HAY QUE USAR PRIMERO ───────────────
//
// El modo `<clave>` FILTRA por un nombre que hay que saberse de antemano, y eso convierte dos
// situaciones muy distintas en la misma respuesta: «esa campaña existe y no se apuntó nadie» y
// «ese nombre no es la clave que está guardada» devuelven las dos un cero.
//
// Pasó de verdad: `esmorzar-girona` dio cero en todo, y el nombre no era la clave persistida.
// Un censo que solo sabe decir «cero» no distingue una cosa de la otra.
//
// Por eso existe `--descubrir`: no pregunta «¿cuántos hay con esta clave?» sino «¿QUÉ CLAVES
// HAY?». Es la pregunta que había que hacer desde el principio.
//
// ── SOLO LEE ─────────────────────────────────────────────────────────────────────────────────
//
// Todas las consultas de los dos modos son `SELECT`. No hay UPDATE, ni INSERT, ni DELETE, y no
// se importa `whatsapp.js` por ningún lado: ejecutar esto NO manda un solo mensaje.
//
// ── Y NO IMPRIME DATOS PERSONALES ────────────────────────────────────────────────────────────
//
// Ni un teléfono, ni un nombre de cliente, ni un correo, ni un token, ni un hash. Sí salen los
// nombres de campañas y promociones, que son nuestros y hacen falta para identificarlas. Esta
// salida se pega en un chat y se queda ahí; lo que no sale no se filtra.
//
// Se ejecuta EN REPLIT, que es donde vive `DATABASE_URL`.

import { censar, ETIQUETAS, ESTADOS, motivoParada } from "../src/modules/captacion/recuperacion.js";

const args = process.argv.slice(2);
const DESCUBRIR = args.includes("--descubrir");
const clave = args.find((a) => !a.startsWith("--"))?.trim() || "";

if (!DESCUBRIR && !clave) {
  console.error(`Uso:
  node tools/censo-campana.mjs --descubrir      qué claves existen y cuántas altas tiene cada una
  node tools/censo-campana.mjs <clave>          el detalle de UNA campaña

Si no sabes con seguridad bajo qué nombre se guardó, empieza por --descubrir.`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("No hay DATABASE_URL. Esto se ejecuta en Replit, no en local.");
  process.exit(1);
}

// `pg` se carga AQUÍ y no arriba: en una máquina de desarrollo no está instalado, y un
// `ERR_MODULE_NOT_FOUND` en la primera línea esconde el aviso útil detrás de veinte de traza.
let pg;
try { ({ default: pg } = await import("pg")); }
catch {
  console.error("Falta el paquete `pg`. Esto se ejecuta en Replit, donde sí está.");
  process.exit(1);
}

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const T9 = (col) => `RIGHT(regexp_replace(${col}, '[^0-9]', '', 'g'), 9)`;

/**
 * Una consulta que NO tumba el informe si falla.
 *
 * Varias columnas de esta base se añadieron con `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, así que
 * una instalación vieja puede no tenerlas. Sin esto, la primera columna que faltara dejaría sin
 * ver los otros siete bloques, que son justo los que dicen dónde mirar.
 */
const q = async (sql, params = []) => {
  try { return (await db.query(sql, params)).rows; }
  catch (e) { return { _error: String(e.message || e).split("\n")[0] }; }
};

/** Una tabla de texto alineada. `r: 1` en una columna la alinea a la derecha (son números). */
function tabla(filas, cols) {
  if (filas?._error) return `    (no se pudo leer: ${filas._error})`;
  if (!filas?.length) return "    (ninguna fila)";
  const anchos = cols.map((c) => Math.max(c.t.length, ...filas.map((f) => String(f[c.k] ?? "").length)));
  const linea = (vals) => "    " + vals.map((v, i) =>
    (cols[i].r ? String(v).padStart(anchos[i]) : String(v).padEnd(anchos[i]))).join("  ");
  return [linea(cols.map((c) => c.t)), linea(anchos.map((a) => "─".repeat(a))),
          ...filas.map((f) => linea(cols.map((c) => f[c.k] ?? "")))].join("\n");
}

const P = (t) => console.log("\n" + t);
const ahora = () => new Date().toISOString().slice(0, 16).replace("T", " ");

// ═════════════════════════════════════════════════════════════════════════════════════════════
//  MODO DESCUBRIR
// ═════════════════════════════════════════════════════════════════════════════════════════════

async function descubrir() {
  console.log(`
═══════════════════════════════════════════════════════════════════════
  DÓNDE ESTÁN LAS ALTAS · ${ahora()} UTC
═══════════════════════════════════════════════════════════════════════`);

  // ── 1 · LA CONSULTA QUE FALTABA ────────────────────────────────────────────────────────────
  // En vez de «¿cuántos hay con esta clave?», pregunta «¿qué claves hay?». Si el nombre que
  // usamos no es el persistido, aquí se ve en la primera línea.
  P("1 · DE DÓNDE VIENEN LOS LEADS  (fuente + campaña, tal cual se guardaron)");
  console.log(tabla(await q(
    `SELECT COALESCE(NULLIF(fuente,''), '(vacía)') AS fuente,
            COALESCE(NULLIF(campana,''), '(vacía)') AS campana,
            COUNT(*)::int AS altas,
            MIN(SUBSTRING(creado_en,1,10)) AS primera,
            MAX(SUBSTRING(creado_en,1,10)) AS ultima
       FROM leads GROUP BY 1,2 ORDER BY 3 DESC LIMIT 60`),
    [{ k: "fuente", t: "fuente" }, { k: "campana", t: "campaña" }, { k: "altas", t: "altas", r: 1 },
     { k: "primera", t: "primera" }, { k: "ultima", t: "última" }]));

  // `leads.campana` llegó por ALTER: si en esta base no está, el bloque de arriba sale en blanco
  // y este lo salva.
  P("1b · SOLO POR `fuente`, por si `campana` no existe en esta base");
  console.log(tabla(await q(
    `SELECT COALESCE(NULLIF(fuente,''), '(vacía)') AS fuente, COUNT(*)::int AS altas
       FROM leads GROUP BY 1 ORDER BY 2 DESC LIMIT 40`),
    [{ k: "fuente", t: "fuente" }, { k: "altas", t: "altas", r: 1 }]));

  P("2 · CAMPAÑAS CLÁSICAS  (cap_campanas) y su promoción");
  console.log(tabla(await q(
    `SELECT c.clave, c.nombre, c.idioma, c.activa, p.nombre AS promo,
            (SELECT COUNT(*)::int FROM leads l WHERE l.campana = c.clave) AS altas,
            (SELECT COUNT(*)::int FROM cap_cola x WHERE x.campana = c.clave) AS en_cola
       FROM cap_campanas c LEFT JOIN pro_promociones p ON p.id = c.promocion_id
      ORDER BY c.creado_en DESC LIMIT 40`),
    [{ k: "clave", t: "clave" }, { k: "nombre", t: "nombre" }, { k: "idioma", t: "idi" },
     { k: "activa", t: "activa" }, { k: "promo", t: "promoción" },
     { k: "altas", t: "altas", r: 1 }, { k: "en_cola", t: "cola", r: 1 }]));

  P("3 · FORMULARIOS CONFIGURABLES  (fid_formularios)");
  console.log(tabla(await q(
    `SELECT f.clave, f.version, f.estado, f.campana, f.promo_clave,
            COALESCE(NULLIF(f.mensaje_wa,''),'') <> '' AS tiene_wa,
            (SELECT COUNT(*)::int FROM leads l WHERE l.fuente = 'form:' || f.clave) AS altas
       FROM fid_formularios f ORDER BY f.id DESC LIMIT 40`),
    [{ k: "clave", t: "clave" }, { k: "version", t: "v", r: 1 }, { k: "estado", t: "estado" },
     { k: "campana", t: "campaña" }, { k: "promo_clave", t: "promo" },
     { k: "tiene_wa", t: "msg wa" }, { k: "altas", t: "altas", r: 1 }]));

  // ── 4 · LA OTRA MITAD DEL DESCUBRIMIENTO ───────────────────────────────────────────────────
  // Toda clave que alguna vez se encoló aparece aquí, exista o no hoy como campaña.
  P("4 · LA COLA DE ENVÍOS, POR CLAVE Y ESTADO  (cap_cola)");
  console.log(tabla(await q(
    `SELECT COALESCE(NULLIF(campana,''),'(vacía)') AS campana, estado, COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE enviado_en IS NOT NULL)::int AS salieron,
            MIN(SUBSTRING(creado_en,1,10)) AS primera, MAX(SUBSTRING(creado_en,1,10)) AS ultima
       FROM cap_cola GROUP BY 1,2 ORDER BY 3 DESC LIMIT 60`),
    [{ k: "campana", t: "campaña" }, { k: "estado", t: "estado" }, { k: "n", t: "n", r: 1 },
     { k: "salieron", t: "salieron", r: 1 }, { k: "primera", t: "primera" }, { k: "ultima", t: "última" }]));

  P("5 · CÓDIGOS EMITIDOS, POR ORIGEN Y CLASE  (pro_qr)");
  console.log(tabla(await q(
    `SELECT COALESCE(NULLIF(origen,''),'(vacío)') AS origen, clase, COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE enviado_en IS NOT NULL)::int AS enviados,
            COUNT(*) FILTER (WHERE enviado_error IS NOT NULL)::int AS con_error,
            MIN(SUBSTRING(creado_en,1,10)) AS primero, MAX(SUBSTRING(creado_en,1,10)) AS ultimo
       FROM pro_qr GROUP BY 1,2 ORDER BY 3 DESC LIMIT 40`),
    [{ k: "origen", t: "origen" }, { k: "clase", t: "clase" }, { k: "n", t: "n", r: 1 },
     { k: "enviados", t: "enviados", r: 1 }, { k: "con_error", t: "error", r: 1 },
     { k: "primero", t: "primero" }, { k: "ultimo", t: "último" }]));

  // ── 6 · BUSCAR POR NOMBRE, NUNCA POR PERSONA ───────────────────────────────────────────────
  // Cinco términos y sus variantes: la clave puede estar con guion, con guion bajo o escrita de
  // otra forma, y el nombre visible casi nunca coincide con el slug.
  P("6 · LO QUE SUENA AL ESMORZAR DE GIRONA  (búsqueda en NOMBRES, no en datos de nadie)");
  const COMO = ["%esmorzar%", "%girona%", "%octubre%", "%desayun%", "%gratis%"];
  const buscar = async (sql, etiqueta) => {
    const r = await q(sql, [COMO]);
    console.log(`\n  ${etiqueta}`);
    console.log(tabla(r, [{ k: "que", t: "tabla" }, { k: "clave", t: "clave" },
                          { k: "nombre", t: "nombre" }, { k: "extra", t: "detalle" }]));
  };

  // `pro_promociones` NO tiene columna `clave`: se identifica por `id`, y es ese id el que
  // guardan `cap_campanas.promocion_id` y `pro_qr.promocion_id`. Por eso aquí se enseña el id:
  // es lo que permite seguir el rastro hasta los códigos emitidos, en el bloque 6b.
  await buscar(
    `SELECT 'promoción' AS que, 'id ' || id AS clave, nombre,
            CASE WHEN activa THEN 'activa' ELSE 'apagada' END
            || COALESCE(' · ' || NULLIF(locales,''), '')
            || COALESCE(' · desde ' || NULLIF(desde,''), '')
            || COALESCE(' · hasta ' || NULLIF(hasta,''), '') AS extra
       FROM pro_promociones
      WHERE LOWER(COALESCE(nombre,'')) LIKE ANY($1)
         OR LOWER(COALESCE(descripcion,'')) LIKE ANY($1) LIMIT 30`, "promociones (pro_promociones)");
  await buscar(
    `SELECT 'campaña' AS que, clave, nombre, COALESCE(idioma,'') AS extra
       FROM cap_campanas
      WHERE LOWER(COALESCE(clave,'')) LIKE ANY($1)
         OR LOWER(COALESCE(nombre,'')) LIKE ANY($1) LIMIT 30`, "campañas clásicas");
  await buscar(
    `SELECT 'formulario' AS que, clave, COALESCE(titulo,'') AS nombre,
            'v' || version || ' · ' || estado AS extra
       FROM fid_formularios
      WHERE LOWER(COALESCE(clave,'')) LIKE ANY($1) OR LOWER(COALESCE(titulo,'')) LIKE ANY($1)
         OR LOWER(COALESCE(subtitulo,'')) LIKE ANY($1)
         OR LOWER(COALESCE(introduccion,'')) LIKE ANY($1) LIMIT 30`, "formularios configurables");
  await buscar(
    `SELECT 'promo fid' AS que, clave, nombre,
            'v' || version || COALESCE(' · ' || NULLIF(local,''), '') AS extra
       FROM fid_promos
      WHERE LOWER(COALESCE(clave,'')) LIKE ANY($1) OR LOWER(COALESCE(nombre,'')) LIKE ANY($1)
         OR LOWER(COALESCE(texto_cliente,'')) LIKE ANY($1) LIMIT 30`, "promociones de fidelización");

  // ── 6b · EL RASTRO QUE SOBREVIVE AL RENOMBRADO ─────────────────────────────────────────────
  // Aunque la campaña se llame de otra forma o ya no exista, los códigos siguen apuntando a su
  // promoción. Esto dice cuántos hay de cada una y cuántos llegaron a salir.
  P("6b · CÓDIGOS POR PROMOCIÓN  (el rastro que sobrevive aunque la campaña se renombre)");
  console.log(tabla(await q(
    `SELECT p.id AS promo_id, p.nombre, COUNT(r.id)::int AS codigos,
            COUNT(r.id) FILTER (WHERE r.enviado_en IS NOT NULL)::int AS enviados,
            COUNT(r.id) FILTER (WHERE r.enviado_error IS NOT NULL)::int AS con_error,
            MIN(SUBSTRING(r.creado_en,1,10)) AS primero, MAX(SUBSTRING(r.creado_en,1,10)) AS ultimo
       FROM pro_promociones p LEFT JOIN pro_qr r ON r.promocion_id = p.id
      GROUP BY 1,2 HAVING COUNT(r.id) > 0 ORDER BY 3 DESC LIMIT 40`),
    [{ k: "promo_id", t: "id", r: 1 }, { k: "nombre", t: "promoción" },
     { k: "codigos", t: "códigos", r: 1 }, { k: "enviados", t: "enviados", r: 1 },
     { k: "con_error", t: "error", r: 1 }, { k: "primero", t: "primero" }, { k: "ultimo", t: "último" }]));

  P("7 · ALTAS DE LOS ÚLTIMOS 45 DÍAS, POR DÍA Y CLAVE");
  console.log(tabla(await q(
    `SELECT SUBSTRING(creado_en,1,10) AS dia,
            COALESCE(NULLIF(campana,''), NULLIF(fuente,''), '(sin clave)') AS clave,
            COUNT(*)::int AS altas
       FROM leads
      WHERE SUBSTRING(creado_en,1,10) >= TO_CHAR(NOW() - INTERVAL '45 days', 'YYYY-MM-DD')
      GROUP BY 1,2 ORDER BY 1 DESC, 3 DESC LIMIT 60`),
    [{ k: "dia", t: "día" }, { k: "clave", t: "clave" }, { k: "altas", t: "altas", r: 1 }]));

  console.log(`
───────────────────────────────────────────────────────────────────────
  Cómo se lee: el bloque 1 dice bajo qué nombre están guardadas las altas
  DE VERDAD. Si ahí no aparece la clave que buscabas, ese nombre no es el
  persistido — y el bloque 6 dice cuál es. Con la clave correcta:

      node tools/censo-campana.mjs <clave>
───────────────────────────────────────────────────────────────────────
`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
//  MODO CENSO DE UNA CAMPAÑA
// ═════════════════════════════════════════════════════════════════════════════════════════════

async function censoDe(clave) {
  // Las dos formas de apuntarse cuentan como la misma campaña: el formulario clásico deja
  // `leads.campana` y el configurable deja `fuente = 'form:<clave>'`. Separarlas aquí daría dos
  // cifras que nadie sabría sumar.
  const gente = await q(
    `SELECT l.id AS lead_id, l.telefono,
            (SELECT r.id FROM pro_qr r
              WHERE ${T9("r.telefono")} = ${T9("l.telefono")} AND r.anulado_en IS NULL
              ORDER BY r.id DESC LIMIT 1) AS qr_id,
            (SELECT p.baja FROM marketing_prefs p
              WHERE ${T9("p.telefono")} = ${T9("l.telefono")} LIMIT 1) AS baja
       FROM leads l
      WHERE COALESCE(NULLIF(l.campana, ''), '') = $1 OR l.fuente = $2`,
    [clave, `form:${clave}`]);
  if (gente?._error) { console.error("No se pudo leer `leads`:", gente._error); process.exit(1); }

  const cola = await q(
    `SELECT telefono, qr_id, estado, enviado_en FROM cap_cola WHERE campana = $1 ORDER BY id ASC`,
    [clave]);
  const filasCola = Array.isArray(cola) ? cola : [];

  // Una fila ENVIADA gana a cualquier otra de la misma persona.
  const mejor = (a, b) => (a && (a.enviado_en || String(a.estado) === "enviado")) ? a : b;
  const porQr = new Map(), porTel = new Map();
  for (const c of filasCola) {
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

  // ── Por qué podría no estar saliendo nada ──────────────────────────────────────────────────
  // `isReady()` vive en el proceso del servidor, no aquí, así que desde un script no se puede
  // saber si WhatsApp está conectado. Sí se puede leer el interruptor de pánico y el gasto del
  // día, y decir claramente que lo tercero hay que mirarlo en el panel.
  const [parada] = (await q(`SELECT value FROM config WHERE key = 'captacion_cola_parada'`)) || [];
  const hoy = new Date().toISOString().slice(0, 10);
  const [gasto] = (await q(
    `SELECT COUNT(*)::int AS n FROM cap_cola WHERE SUBSTRING(enviado_en, 1, 10) = $1`, [hoy])) || [];

  // ¿Hay mensaje configurado? Es la causa silenciosa: sin plantilla no se compone nada, no se
  // encola nada y no queda error.
  const [camp] = (await q(
    `SELECT clave, activa, textos, promocion_id FROM cap_campanas WHERE clave = $1`, [clave])) || [];
  const [form] = (await q(
    `SELECT clave, version, estado, COALESCE(NULLIF(mensaje_wa, ''), '') <> '' AS tiene_wa
       FROM fid_formularios WHERE clave = $1 ORDER BY version DESC LIMIT 1`, [clave])) || [];

  let plantillaClasica = false;
  try {
    const t = camp ? JSON.parse(camp.textos || "{}") : {};
    plantillaClasica = Object.values(t).some((x) => String(x?.wa || "").trim());
  } catch {}

  const linea = (k) => `  ${String(ETIQUETAS[k] || k).padEnd(30, ".")} ${String(censo[k] ?? 0).padStart(5)}`;
  const frenos = motivoParada({
    whatsappListo: true,                      // no se puede saber desde aquí: se avisa abajo
    colaParada: String(parada?.value) === "1",
    cupoLibre: 1,
  });

  // Si no hay NADA con esta clave, se dice que puede ser el nombre y no la ausencia de gente.
  // Es exactamente la confusión que hizo perder una tarde.
  const vacio = censo.total === 0 && !camp && !form;

  console.log(`
═══════════════════════════════════════════════════════════════
  CENSO DE «${clave}» · ${ahora()} UTC
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
${frenos.parado ? `\n  ⚠ ${frenos.texto}` : ""}${vacio ? `
  ⚠ NO HAY NADA con esta clave: ni gente, ni campaña, ni formulario.
    Eso NO significa que no se apuntara nadie — lo más probable es que
    «${clave}» no sea la clave con la que se guardó. Para verlo:

        node tools/censo-campana.mjs --descubrir
` : ""}`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════

try {
  if (DESCUBRIR) await descubrir();
  else await censoDe(clave);
} finally {
  await db.end();
}
