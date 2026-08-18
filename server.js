import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { execSync, execFileSync } from "child_process";
import zlib from "zlib";
import { initWhatsApp, sendConfirmacionCliente, sendConfirmacionPendienteCliente, sendCancelacionCliente, sendMensajeLibre, sendDocumentoLibre, sendMediaLibre, sendNotificacionGrupo, sendNotificacionGrupoPendiente, sendCancelacionGrupo, getGroups, isReady, getQRImage, forceReconnect, setOnReserva, setOnReady, setOnMessage, setHistorialLoader, markAwaitingFollowup, setPerfilLoader, setOnMensajeSaliente, setOnActualizarPerfil, addSaraToHistorial, setOnGroupAttachment, sendMensajeAGrupo, sendDocumentoAGrupo, setSaraConfigLoader, setDocumentoResolver, setReservaLoader, setOnCancelarReserva, setOnContactoLead, setTelefonoInterno } from "./whatsapp.js";
import Anthropic from "@anthropic-ai/sdk";
import { procesarFactura, procesarFacturaSinLocal, asignarFacturaPendiente, combinarArchivosEnPdf, releerLineasFactura, proveedorConLineas, FacturaDuplicadaError, migrarEstructuraDrive, reconstruirSheetMaestro, resincronizarSheetsFactura, repararTodosLosSheets, reproyectarPendientes, idDeDriveUrl, condicionesDePago } from "./facturas.js";
import { indexarHistorialProveedor, sugerirLocalPendiente } from "./src/modules/facturas/asignacion.js";
// Núcleo técnico portado a PostgreSQL (seguridad 1A, modelo de establecimientos, enforcement).
import { isProduction, replitEnvWarning, resolveJwtSecret, errorHandler, isAllowedCvUpload, safeUploadName, finalizeCvUpload, CV_MAX_BYTES } from "./security.js";
import { permisosV2Enabled } from "./src/core/flags.js";
import { ensureSchema as ensureEstablecimientosSchema, seedCatalogo } from "./src/db/establecimientos.migration.js";
import { listMaintenanceIssues, createMaintenanceIssue, updateMaintenanceIssueStatus } from "./src/modules/mantenimiento/maintenance.service.js";
import { getDashboard } from "./src/modules/dashboard/dashboard.service.js";
import { fusionarDashboards, fusionarPeriodo } from "./src/modules/dashboard/fusion.js";
import { rangoAnterior, variacion } from "./src/modules/dashboard/periodos.js";
import { mapManageRow, draftRequest, extractText, syncReviews, mensajeEstadoReseñas, buildManageQuery, queryTextSearch, elegirSugerido, normalizarUbicacionBP, normalizarPlaceResult, placeIdsConfigurados, upsertPlaceEntry, locationNamesDeLocal } from "./src/modules/reviews/reviews.service.js";
import crypto from "crypto";
import QRCode from "qrcode";   // ya instalada (la usa el enlace de WhatsApp); emparejar la tablet escaneando
import { loadAgoraConfigs, configsFromRows, publicConfig } from "./src/integrations/agora/registry.js";
import { candidatosDiagnostico, ordenarResultados } from "./src/integrations/agora/diagnostico.js";
import { extraerScripts, extraerRutasApi, clasificarRutas, extraerClrTypes, clasificarInformes } from "./src/integrations/agora/descubrir.js";
import { getInforme, listaInformes, calcularTotales } from "./src/integrations/agora/reports.js";
import { CATALOGO_MODULOS, modulosDeRol, modulosEfectivos, sanearModulos, moduloDeRuta } from "./src/modules/usuarios/permisos.js";
import { localesDe, localPermitido, localesPermitidos, puedeLocal, sanearLocalesExtra, parseLocales } from "./src/modules/usuarios/locales.js";
// `activoEnFecha` y `pertenecioAlPeriodo` no se importan: en el servidor esas dos preguntas se
// hacen en SQL (SQL_ACTIVO_EL_DIA y SQL_ESTUVO_ENTRE) porque hay que filtrar en la consulta,
// no después. El módulo puro es la referencia y quien las prueba.
import { activoAhora, bajaEfectiva, turnosTrasLaBaja, marcadoActivo } from "./src/modules/rrhh/vigencia.js";
import { sanearSolicitud, transitar, solapesVivos, turnosDurante, paraTrabajador, paraResponsable,
  resumirBandeja, TIPOS_SOLICITABLES, ETIQUETA_TIPO } from "./src/modules/rrhh/ausencias.js";
import { stockNecesario as invStockNecesario, cantidadAPedir as invCantidadAPedir, construirRevision as invConstruirRevision, lineasPropuestaPedido as invLineasPedido, sanitizarCantidad as invSanitizarCantidad, esEstadoPedidoValido, esMMDDValido } from "./src/modules/inventario/calculo.js";
import { construyeTimeline, antiguedad as rrhhAntiguedad, documentosPorCaducar, resumenEquipoPorLocal, diasHastaCumple } from "./src/modules/rrhh/ficha.js";
import { agregarPorLocal, serieMensual, puedeMostrarComentarios, barajar, mesAnterior, ultimosMeses, finDePlazo, generarToken } from "./src/modules/rrhh/pulso.js";
import { ensureSchemaHorarios, sembrarLocal, migrarDescansos } from "./src/modules/horarios/schema.js";
import { descansosPorDia, esTramoDescanso } from "./src/modules/horarios/descansos.js";
import { instanteANegocio, lunesDe, diasSemana, isoConOffset, aMinutos, deMinutos, epochDeLocal, sumaDias, instanteMadrid } from "./src/modules/horarios/tiempo.js";
import { detectarConflictos, resumirConflictos, contratosSolapados } from "./src/modules/horarios/conflictos.js";
import { validarPublicacion, construirSnapshot, cambiosPorTrabajador } from "./src/modules/horarios/versiones.js";
import { serializarCanonico } from "./src/core/canonico.js";
import { construirCuadrante } from "./src/modules/horarios/cuadrante.js";
import { generarSemana, ORIGEN as ORIGEN_SOLVER } from "./src/modules/horarios/solver.js";
import { construirPdfSemana, nombreFichero } from "./src/modules/horarios/pdf/schedule-pdf.service.js";
import { ensureSchemaFichajes } from "./src/modules/fichajes/schema.js";
import { estadoDe, accionesPermitidas, evaluar as evaluarFichaje, calcularJornada, faltaLaSalida } from "./src/modules/fichajes/maquina.js";
import { validarFormatoPin, estadoBloqueo, trasFallo as pinTrasFallo, trasAcierto as pinTrasAcierto } from "./src/modules/fichajes/pin.js";
import { construirJornada, firmaDeEventos } from "./src/modules/fichajes/jornadas.js";
import { clasificarJornada, resumirRevision, mereceSalir, candidatasDeLote, LISTA, CADUCADA } from "./src/modules/fichajes/revision.js";
import { periodoDe, saldoDe, movimientosParaJornada, estaCerrado, motivoBloqueo } from "./src/modules/fichajes/bolsa.js";
import { construirCsv, nombreFicheroRegistro } from "./src/modules/fichajes/export.js";
import * as DUP from "./src/modules/clientes/duplicados.js";
import { colaDeTrabajo, cobertura } from "./src/modules/facturas/diccionario.js";
import { gruposDuplicados } from "./src/modules/facturas/proveedores-duplicados.js";
import { grupoDeSQL, claveProducto, validarSuma, mensajeValidacion } from "./src/modules/facturas/lineas.js";
import { buscarParecida, resumenMotivos } from "./src/modules/facturas/duplicados.js";
import { proponerConciliacion, resumenConciliacion, estadoConciliada } from "./src/modules/facturas/conciliacion.js";
import { MISMO_PROVEEDOR as MISMO_PROV } from "./src/modules/facturas/duplicados.js";
import { normNif, nifValido } from "./src/modules/facturas/emisor.js";
import { CATALOGO, CATEGORIAS, claveProveedor, normalizarCategoria, normalizarPar, indiceCategorias, categoriasDe, soloCategorias, gastoPorCategoria } from "./src/modules/facturas/categorias.js";
import { canonizarLocal, esLocalCanonico, agruparNoCanonicos, LOCALES as LOCALES_CANON } from "./src/modules/facturas/local-canonico.js";
import { repasarLote, resumenRepaso, pideRelecturaDeLineas, esAlcanceValido, ALCANCES_REPASO, VERSION_LINEAS } from "./src/modules/facturas/repaso.js";
import { fusionarCompras } from "./src/modules/facturas/compras-fusion.js";
import { agruparPagos, agruparRecibos, resumenPagos, calcularVencimiento, estadoPago, textoCondiciones } from "./src/modules/facturas/vencimiento.js";
import { crearZip, nombreDeFactura } from "./src/modules/facturas/zip.js";
import { repartirImporte, pesosPorVentas, textoReparto, imputarGastoEmpresa } from "./src/modules/facturas/reparto.js";
import { mensajeDeErrorIA, seCorto } from "./src/modules/ia/errores.js";
import { unidadSugerida } from "./src/modules/inventario/unidades.js";
import { variantesDeProveedor, sugerenciasDeProveedor, marcarYaConfigurados, fusionarFuentes, normalizarLote, TOPE_LOTE } from "./src/modules/inventario/catalogo.js";
import { indiceDescartes, descartadosDe } from "./src/modules/facturas/descartes.js";
import { debeSincronizar, siguebloqueado, edadMinutos } from "./src/modules/agora/programacion.js";
import { claveFalta, ordenarFaltas } from "./src/modules/marketing/faltan.js";
import { sanearSegmento, describirSegmento } from "./src/modules/marketing/segmento.js";
import { sanearHecho, agruparHechos, resumenHechos, ETIQUETAS, conversacionesParaLeer, hechosNuevos } from "./src/modules/clientes/hechos.js";
import { comprimir } from "./src/http/comprimir.js";
import { passwordInicial, validarPassword, estadoFreno, trasFalloLogin, trasLoginCorrecto } from "./src/modules/usuarios/acceso.js";
import { emparejaOperadores, rendimientoDeEmpleado } from "./src/modules/rrhh/matching.js";
import { formatTelefonoES, aplicarVariables, filtrarEnviablesWA, dividirPorTope, delayConJitter, esTelefonoInterno, clave9 } from "./src/modules/messaging/queue.js";

// Invalida la caché de teléfonos internos (se define al arrancar WhatsApp). Se llama al
// dar de alta o editar un trabajador para que el cambio no espere al TTL de 10 min.
let invalidarInternos = () => {};
import { detectarIdioma, normalizarIdioma, idiomaDeContacto, necesitaTraduccion, idiomasPresentes, placeholdersIntactos, construirTraduccionRequest, IDIOMA_BASE } from "./src/modules/messaging/i18n.js";
import { esCumpleHoy, hoyMadrid, resumenEnvios } from "./src/modules/campaigns/campaigns.service.js";
import { createAgoraClient } from "./src/integrations/agora/client.js";
import { syncVentas } from "./src/integrations/agora/sync.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// ── PostgreSQL pool ───────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("neon") ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[PG] Error en pool (no fatal):", err.message);
});

// Translate ? placeholders → $1, $2, ...
function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function dbGet(sql, params = []) {
  const result = await pool.query(toPositional(sql), params);
  return result.rows[0] || null;
}
async function dbAll(sql, params = []) {
  const result = await pool.query(toPositional(sql), params);
  return result.rows;
}
// dbRun returns the first row if the query has RETURNING, otherwise undefined.
async function dbRun(sql, params = []) {
  const result = await pool.query(toPositional(sql), params);
  return result.rows[0] || undefined;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * HOY, en hora de MADRID. No es un detalle: `new Date().toISOString()` da la fecha en UTC, y
 * entre medianoche y las dos de la mañana en verano eso es AYER. Un restaurante cierra a esa
 * hora — la reserva que se apunta a las 00:30, la factura que se sube al cerrar caja y el
 * «hoy» del dashboard se archivaban con la fecha del día anterior, cada noche de verano.
 *
 * Los módulos de horarios y fichajes ya tenían su propia hora de Madrid porque ahí la fecha es
 * prueba legal. Esto la trae al resto.
 */
const hoyISO = () => instanteMadrid(new Date()).fecha;
/** Días antes o después de hoy, también en Madrid. */
const hoyMas = (n) => sumaDias(hoyISO(), n);

const app = express();
const PORT = process.env.PORT || 5000;
// JWT endurecido (Iteración 1A): en producción exige un secreto FUERTE o el proceso NO arranca
// (refuse-to-boot); en desarrollo usa un secreto fijo estable. Nunca queda un fallback inseguro.
const PROD = isProduction();
const _envWarn = replitEnvWarning();
if (_envWarn) console.warn("[env]", _envWarn);
const { secret: JWT_SECRET, status: jwtStatus, source: jwtSource } = resolveJwtSecret({ prod: PROD });
console.log(`[auth] JWT secret: ${jwtStatus} (fuente: ${jwtSource})`);

// Copia REVERSIBLE de la contraseña, cifrada AES-256-GCM, para que Dirección pueda "verla"
// desde el panel (petición explícita). El login sigue usando el hash bcrypt (irreversible);
// esta copia es solo para mostrarla. Nota de seguridad: es recuperable si se filtra la BD.
// RETIRADO. Una contraseña se puede RESTABLECER; no se debe poder CONSULTAR.
//
// Aquí había una copia reversible (AES-256-GCM con una clave derivada de JWT_SECRET) para que
// dirección pudiera «ver» la contraseña desde el panel. El problema no es el cifrado: es que
// con la base de datos y el JWT_SECRET —que viajan juntos en cualquier copia de seguridad— se
// recuperan en claro las contraseñas de TODA la plantilla. Y son las mismas que la gente usa
// en otros sitios.
//
// La columna `password_enc` NO se borra en esta fase (una migración destructiva de esquema no
// hace falta para cerrar el riesgo) pero se vacía y ya no se escribe nunca. El flujo pasa a
// ser: generar una temporal, enseñarla UNA vez y obligar a cambiarla al entrar.
const passwordTemporal = () => {
  // Legible por teléfono: sin caracteres que se confundan (0/O, 1/l/I).
  const abc = "abcdefghijkmnpqrstuvwxyz", num = "23456789";
  const pick = (s) => s[crypto.randomInt(0, s.length)];
  return Array.from({ length: 4 }, () => pick(abc)).join("") + "-" +
         Array.from({ length: 4 }, () => pick(abc)).join("") + "-" +
         Array.from({ length: 2 }, () => pick(num)).join("");
};

// Va ANTES que todo lo que responde: comprime el HTML, el JS y el JSON de la API.
// `public/panel/app.js` son 474 KB que salían sin comprimir en cada primera visita.
// El servidor empieza a escuchar ANTES de que `initDB()` termine (así el health check de
// Replit responde enseguida y el despliegue no se marca como caído). Pero durante esos
// segundos las tablas y las columnas nuevas todavía no existen, y una consulta contra una
// columna que falta no falla a medias: falla del todo.
//
// Así que la API contesta «arrancando» hasta que el esquema está listo. Un 503 con su motivo
// se entiende y se reintenta; un 500 con «column dup_estado does not exist» parece que se ha
// roto algo. Lo estático (la web pública, el panel) se sirve igual desde el primer segundo.
let DB_LISTA = false;
app.use("/api", (req, res, next) => {
  if (DB_LISTA) return next();
  res.set("Retry-After", "3");
  res.status(503).json({ ok: false, arrancando: true,
    error: "El sistema está arrancando. Vuelve a intentarlo en unos segundos." });
});

app.use(comprimir());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"), {
  // Las fotos y los PDF de `uploads/` llevan el id en el nombre y no cambian nunca: se pueden
  // guardar un año sin volver a preguntar. El HTML/JS/CSS sí cambia en cada despliegue, así que
  // ese se revalida siempre (ETag) — el navegador sigue ahorrándose la descarga con un 304,
  // pero nunca sirve una versión vieja del panel.
  setHeaders(res, ruta) {
    res.setHeader("Cache-Control", /[\\/]uploads[\\/]/.test(ruta) ? "public, max-age=31536000, immutable" : "no-cache");
  },
}));

const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({ storage });
// Subida de facturas: en memoria (necesitamos el buffer para el pipeline de facturas.js).
const uploadFacturaMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Subida de CV endurecida (Iteración 1A): se guarda primero en un directorio PRIVADO fuera de
// public/, con límite de tamaño y allowlist de extensión+MIME; solo se publica tras validar los
// magic bytes reales (ver el handler de /api/hr/applications con finalizeCvUpload).
// Documentos de RR.HH. Van FUERA de `public/` a propósito: ahí dentro cualquiera con el
// enlace abre el fichero sin sesión, y en `hr_documentos` hay DNIs, contratos y bajas.
//
// No se cierra `public/uploads` entero porque lo comparten los CV de las candidaturas, las
// imágenes de la web y las fotos: cerrarlo de golpe rompería tres cosas ajenas a RR.HH.
const rrhhDocsDir = path.join(__dirname, "private_uploads", "rrhh");
if (!fs.existsSync(rrhhDocsDir)) fs.mkdirSync(rrhhDocsDir, { recursive: true });

const uploadsTmpDir = path.join(__dirname, "tmp_uploads");
if (!fs.existsSync(uploadsTmpDir)) fs.mkdirSync(uploadsTmpDir, { recursive: true });
const cvStorage = multer.diskStorage({
  destination: (req, file, cb) => { if (!fs.existsSync(uploadsTmpDir)) fs.mkdirSync(uploadsTmpDir, { recursive: true }); cb(null, uploadsTmpDir); },
  filename: (req, file, cb) => cb(null, safeUploadName(file.originalname)),
});
const uploadCv = multer({
  storage: cvStorage,
  limits: { fileSize: CV_MAX_BYTES },
  fileFilter: (req, file, cb) => cb(null, isAllowedCvUpload(file)),
});

// ── Inicializar esquema PostgreSQL ────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        rol TEXT NOT NULL,
        nombre TEXT,
        local TEXT,
        creado_en TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL DEFAULT '',
        apellidos TEXT NOT NULL DEFAULT '',
        nacimiento TEXT NOT NULL DEFAULT '',
        poblacion TEXT NOT NULL DEFAULT '',
        telefono TEXT NOT NULL DEFAULT '',
        correo TEXT NOT NULL DEFAULT '',
        premio TEXT NOT NULL DEFAULT '',
        creado_en TEXT NOT NULL,
        genero TEXT,
        fuente TEXT DEFAULT 'web',
        actualizado_en TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reservas (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        personas INTEGER NOT NULL,
        dia TEXT NOT NULL,
        hora TEXT NOT NULL,
        telefono TEXT NOT NULL,
        nombre_reserva TEXT NOT NULL,
        creado_en TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bloqueos_reservas (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        desde TEXT NOT NULL,
        hasta TEXT NOT NULL,
        motivo TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sara_respuestas (
        id SERIAL PRIMARY KEY,
        tema TEXT NOT NULL,
        disparadores TEXT,
        respuesta TEXT,
        documento_url TEXT,
        local TEXT,
        activo INTEGER DEFAULT 1,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS contents (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS wa_links (
        local TEXT PRIMARY KEY,
        group_jid TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_jobs (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        local TEXT NOT NULL,
        tipo TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        activo INTEGER NOT NULL DEFAULT 1,
        creado_en TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_applications (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        email TEXT NOT NULL,
        telefono TEXT NOT NULL,
        puesto TEXT NOT NULL,
        mensaje TEXT,
        cv_url TEXT,
        estado TEXT NOT NULL DEFAULT 'nuevo',
        creado_en TEXT NOT NULL,
        edad INTEGER,
        experiencia TEXT,
        poblacion TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_issues (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        titulo TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'abierta',
        creado_en TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        rol TEXT NOT NULL,
        mensaje TEXT NOT NULL,
        creado_en TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Config de Ágora POR LOCAL, editable desde el panel (fuente de verdad; sustituye al Secret
    // AGORA_LOCALES). El token va CIFRADO (AES-256-GCM) y NUNCA se expone por la API.
    await client.query(`
      CREATE TABLE IF NOT EXISTS agora_locales (
        local TEXT PRIMARY KEY,
        host TEXT NOT NULL,
        token TEXT,
        local_id TEXT,
        activo INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Credenciales de login de Ágora (usuario en claro, contraseña cifrada). La integración real
    // usa login web (/auth/) → cookie → /bus/; el token de Haddock es otra API no accesible.
    try { await client.query(`ALTER TABLE agora_locales ADD COLUMN IF NOT EXISTS usuario TEXT`); } catch (e) { console.error("[DB] alter agora_locales usuario:", e.message); }
    try { await client.query(`ALTER TABLE agora_locales ADD COLUMN IF NOT EXISTS pass_enc TEXT`); } catch (e) { console.error("[DB] alter agora_locales pass_enc:", e.message); }
    // Desglose fiscal de ventas por día (aditivo; el dashboard usa "ventas").
    try { await client.query(`ALTER TABLE ventas_diarias ADD COLUMN IF NOT EXISTS base_imponible NUMERIC`); } catch (e) { console.error("[DB] alter ventas_diarias base:", e.message); }
    try { await client.query(`ALTER TABLE ventas_diarias ADD COLUMN IF NOT EXISTS cuota_iva NUMERIC`); } catch (e) { console.error("[DB] alter ventas_diarias cuota:", e.message); }

    // Preferencias de marketing por contacto (consentimiento RGPD). Se cruza por teléfono con
    // la vista unificada de contactos. baja=1 excluye SIEMPRE de cualquier envío masivo.
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketing_prefs (
        telefono TEXT PRIMARY KEY,
        correo TEXT,
        opt_in_wa INTEGER DEFAULT 0,
        opt_in_email INTEGER DEFAULT 0,
        baja INTEGER DEFAULT 0,
        idioma TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS google_reviews (
        id TEXT PRIMARY KEY,
        location_name TEXT,
        author TEXT,
        rating INTEGER,
        text TEXT,
        fecha TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS followup_scheduled (
        id SERIAL PRIMARY KEY,
        jid TEXT NOT NULL,
        nombre TEXT NOT NULL,
        local TEXT NOT NULL,
        dia TEXT NOT NULL,
        send_at TEXT NOT NULL,
        sent INTEGER DEFAULT 0,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id SERIAL PRIMARY KEY,
        jid TEXT NOT NULL,
        telefono TEXT NOT NULL,
        mensaje TEXT NOT NULL,
        respuesta TEXT NOT NULL,
        historico INTEGER DEFAULT 0,
        tipo TEXT DEFAULT 'intercambio',
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_grupos (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        group_jid TEXT NOT NULL UNIQUE,
        sheet_id TEXT,
        sheet_url TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Carpetas de Drive vigiladas por local (tercer canal de ingesta) + idempotencia.
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_drive_carpetas (
        local TEXT PRIMARY KEY,
        folder_id TEXT NOT NULL,
        folder_url TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_drive_procesados (
        drive_file_id TEXT PRIMARY KEY,
        local TEXT,
        procesado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        tipo TEXT,
        fecha TEXT,
        numero_factura TEXT,
        proveedor TEXT,
        nif TEXT,
        concepto TEXT,
        base_imponible NUMERIC,
        porcentaje_iva NUMERIC,
        cuota_iva NUMERIC,
        total NUMERIC,
        drive_url TEXT,
        sheet_id TEXT,
        file_hash TEXT,
        empresa TEXT,
        pagado INTEGER DEFAULT 0,
        fecha_pago TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { await client.query(`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS canal TEXT`); } catch (e) { console.error("[DB] alter facturas canal:", e.message); }

    // De qué es cada proveedor: «Grau es bebidas y alcohol». Sirve para contestar «cuánto me
    // gasto en bebida», que con el gasto solo por proveedor y por producto no se puede.
    // Se guarda la clave normalizada del proveedor Y el nombre tal como se escribió: la
    // clave es la que une «GRAU, S.L.» con «Grau Distribucions», y el nombre es el que se
    // enseña. Ver src/modules/facturas/categorias.js.
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_proveedor_cats (
        prov_clave TEXT NOT NULL,
        proveedor TEXT NOT NULL,
        categoria TEXT NOT NULL,
        creado_en TEXT,
        PRIMARY KEY (prov_clave, categoria)
      )
    `);
    // Condiciones de pago del proveedor: a cuántos días paga y, si los tiene, en qué día del
    // mes. Se guarda por `prov_clave` —igual que las categorías— para que sirva aunque el
    // nombre se lea de tres formas distintas.
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_proveedor_pago (
        prov_clave TEXT PRIMARY KEY,
        proveedor TEXT NOT NULL,
        dias INTEGER,
        dia_pago INTEGER,
        actualizado_por TEXT,
        actualizado_en TEXT
      )
    `);
    // El RECIBO MENSUAL, que es como paga la mayoría: «todo lo que me facture en julio me lo
    // pasa en un recibo el 15 de agosto». No se puede simular con «a X días»: una factura del
    // 3 y otra del 31 del mismo mes vencen el MISMO día, y con días saldrían dos fechas que no
    // existen. Aditivas y con su valor de siempre, para que lo ya guardado no cambie.
    for (const col of ["modo TEXT NOT NULL DEFAULT 'dias'", "meses_despues INTEGER NOT NULL DEFAULT 1",
                       "domiciliado INTEGER NOT NULL DEFAULT 0"]) {
      await dbRun(`ALTER TABLE facturas_proveedor_pago ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
    }
    // En modo recibo no hay «días», así que la columna deja de ser obligatoria.
    await dbRun(`ALTER TABLE facturas_proveedor_pago ALTER COLUMN dias DROP NOT NULL`).catch(() => {});
    // NOTA: a partir de aquí esta tabla ya NO se usa. Las reglas viven en `facturas_pago_reglas`
    // (abajo), que admite una por proveedor y empresa. Se deja como estaba —sin tocar y sin
    // borrar— porque de ella se copian las reglas la primera vez y porque borrarla es
    // justo el tipo de cambio que bloquea un despliegue.
    // LAS REGLAS DE PAGO, POR PROVEEDOR **Y EMPRESA**. El mismo proveedor puede servir a dos
    // empresas del grupo con condiciones distintas —una paga el recibo del 15 y la otra al
    // contado—, y con una sola regla por proveedor la fecha de una de las dos sale mal siempre.
    //
    // Va en una TABLA NUEVA y no cambiando la clave de la de antes. Cambiar una clave primaria
    // obliga a tres pasos en un orden concreto (añadir la columna, quitar la clave, ponerla
    // nueva) y el generador de migraciones del despliegue los emite en otro orden: crea la
    // clave con una columna que aún no existe, falla, y el despliegue se queda bloqueado. Una
    // tabla nueva es aditiva y no hay orden que se pueda equivocar.
    await dbRun(`
      CREATE TABLE IF NOT EXISTS facturas_pago_reglas (
        prov_clave TEXT NOT NULL,
        empresa TEXT NOT NULL DEFAULT '',
        proveedor TEXT NOT NULL,
        dias INTEGER,
        dia_pago INTEGER,
        modo TEXT NOT NULL DEFAULT 'dias',
        meses_despues INTEGER NOT NULL DEFAULT 1,
        domiciliado INTEGER NOT NULL DEFAULT 0,
        actualizado_por TEXT,
        actualizado_en TEXT,
        PRIMARY KEY (prov_clave, empresa)
      )
    `);
    // Lo que ya estuviera guardado pasa a ser la regla GENERAL, que es justo lo que significaba
    // hasta ahora. `DO NOTHING` para que repetirlo en cada arranque no pise lo que se cambie
    // después desde el panel.
    await dbRun(`
      INSERT INTO facturas_pago_reglas (prov_clave, empresa, proveedor, dias, dia_pago, modo, meses_despues, domiciliado, actualizado_por, actualizado_en)
        SELECT prov_clave, '', proveedor, dias, dia_pago, COALESCE(modo,'dias'), COALESCE(meses_despues,1),
               COALESCE(domiciliado,0), actualizado_por, actualizado_en
          FROM facturas_proveedor_pago
      ON CONFLICT (prov_clave, empresa) DO NOTHING
    `).catch(() => { /* si la vieja no existe (base nueva), no hay nada que copiar */ });
    // ── El diccionario de productos ────────────────────────────────────────
    // EL PROBLEMA: el mismo producto se llama de tres maneras. En la factura «COCA COLA ZERO
    // 33CL LATA CAJA 24U», en el inventario «Coca-Cola Zero». Agrupamos por el texto exacto
    // del proveedor, así que «COCA COLA 33CL» y «Coca-Cola 33 cl» son dos productos y
    // «cuánto compramos de Coca-Cola» no se puede contestar.
    //
    // El producto canónico es del GRUPO y no de un local: si fuera por local, comparar Blanes
    // con Lloret —que es la mitad de la gracia— seguiría sin poder hacerse.
    await dbRun(`
      CREATE TABLE IF NOT EXISTS productos_canonicos (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        unidad TEXT,
        creado_por TEXT,
        creado_en TEXT
      )
    `);
    // Dos productos con el mismo nombre son un error de dedo, no dos productos.
    await dbRun(`CREATE UNIQUE INDEX IF NOT EXISTS productos_canonicos_nombre ON productos_canonicos (LOWER(nombre))`).catch(() => {});
    // Qué texto exacto de proveedor es qué producto. `producto_id` NULL significa «revisado y
    // dejado aparte»: así no vuelve a salir en la cola, pero tampoco se une a nada.
    await dbRun(`
      CREATE TABLE IF NOT EXISTS producto_alias (
        clave TEXT PRIMARY KEY,
        producto_id INTEGER REFERENCES productos_canonicos(id) ON DELETE CASCADE,
        descripcion TEXT,
        confirmado_por TEXT,
        confirmado_en TEXT
      )
    `);

    // Segundo nivel: «Bebidas · Vinos y cavas». Un proveedor es de UNA categoría con su
    // subcategoría, no de dos categorías sueltas: así el gasto va entero a un sitio y la
    // categoría es la suma exacta de sus subcategorías, sin nada aproximado.
    try {
      await client.query(`ALTER TABLE facturas_proveedor_cats ADD COLUMN IF NOT EXISTS subcategoria TEXT NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE facturas_proveedor_cats DROP CONSTRAINT IF EXISTS facturas_proveedor_cats_pkey`);
      await client.query(`ALTER TABLE facturas_proveedor_cats ADD PRIMARY KEY (prov_clave, categoria, subcategoria)`);
      // «Alcohol» y «Café e infusiones» eran categorías sueltas antes de partir Bebidas.
      await client.query(`UPDATE facturas_proveedor_cats SET categoria = 'Bebidas', subcategoria = 'Licores y destilados' WHERE categoria = 'Alcohol'`);
      await client.query(`UPDATE facturas_proveedor_cats SET categoria = 'Bebidas', subcategoria = 'Cafés e infusiones' WHERE categoria = 'Café e infusiones'`);
      await client.query(`UPDATE facturas_proveedor_cats SET categoria = 'Carne y aves' WHERE categoria = 'Carne'`);
      // Si tras migrar un proveedor tiene la categoría a secas Y la misma con subcategoría, la
      // de a secas sobra: era la versión vaga de lo mismo. Dejarla haría que su gasto se
      // repartiera entre «Bebidas (sin más)» y «Bebidas · Licores», que es un desglose falso.
      await client.query(`DELETE FROM facturas_proveedor_cats a
         WHERE a.subcategoria = '' AND EXISTS (
           SELECT 1 FROM facturas_proveedor_cats b
            WHERE b.prov_clave = a.prov_clave AND b.categoria = a.categoria AND b.subcategoria <> '')`);
    } catch (e) { console.error("[DB] alter facturas_proveedor_cats:", e.message); }

    // Nombres de proveedor corregidos a mano. «Viruta Bronco S.L.» es «Virutas Branco S.L.»:
    // la lectura se equivoca siempre igual, así que corregirlo una vez vale para las
    // siguientes. Se guarda por NIF y por clave del nombre; el NIF es lo que no cambia.
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_proveedor_alias (
        clave TEXT PRIMARY KEY,
        nif TEXT,
        proveedor TEXT NOT NULL,
        autor TEXT,
        creado_en TEXT
      )
    `);
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_prov_alias_nif ON facturas_proveedor_alias(nif) WHERE nif IS NOT NULL`); }
    catch (e) { console.error("[DB] idx_prov_alias_nif:", e.message); }

    // Descuento por línea. Muchas facturas traen «IMPORTE» (bruto) y «TOTAL» (lo que se paga):
    // guardando solo el bruto, «Qué compramos» decía un precio que nadie paga y el seguimiento
    // de subidas comparaba tarifas en vez de lo pagado.
    // `factor_unidad`: cuántas unidades traía cada paquete cuando la factura da la cantidad en
    // packs y el precio por unidad. Se guarda para poder explicar de dónde sale la cantidad
    // («3 PACK × 150») y para que se vea que ahí ha pasado algo.
    // `sin_albaran`: quién y cuándo dijo que esta factura NO lleva albarán. Es una decisión,
    // no un dato del papel, así que se guarda con firma: dentro de tres meses hay que poder
    // saber quién cerró esto y volver atrás si se equivocó.
    for (const col of ["sin_albaran_por TEXT", "sin_albaran_en TEXT"]) {
      try { await client.query(`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS ${col}`); }
      catch (e) { console.error("[DB] alter facturas " + col + ":", e.message); }
    }
    // `reparto`: null = de un local; 'empresa' = de toda la sociedad, se reparte al sumar.
    try { await client.query(`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS reparto TEXT`); }
    catch (e) { console.error("[DB] alter facturas reparto:", e.message); }
    for (const col of ["precio_bruto NUMERIC", "importe_bruto NUMERIC", "descuento_pct NUMERIC", "factor_unidad NUMERIC"]) {
      try { await client.query(`ALTER TABLE factura_lineas ADD COLUMN IF NOT EXISTS ${col}`); }
      catch (e) { console.error("[DB] alter factura_lineas " + col + ":", e.message); }
    }

    // Detalle línea a línea. Ver src/modules/facturas/lineas.js y docs/lineas-de-factura.md.
    // `lineas_estado` guarda si el detalle cuadra con la base imponible: sin ese aviso, una
    // cantidad mal leída se arrastraría a todos los informes sin que nadie lo supiera.
    // Sospecha de duplicado. `dup_estado='duda'` aparta la factura de TODOS los totales hasta
    // que alguien decida: un total con un duplicado dentro es un total falso, y uno al que le
    // falta una factura buena también. Se aparta, se dice cuánto se ha apartado, y se decide.
    for (const col of ["dup_estado TEXT", "dup_de INTEGER", "dup_motivos TEXT", "dup_resuelto_por TEXT", "dup_resuelto_en TEXT",
      // Conciliación: en la factura, la lista de ids de sus albaranes; en el albarán, el id de
      // su factura. Aditivo, sin FK: es el mismo patrón que el resto.
      "conciliado_con TEXT", "conciliado_por TEXT", "conciliado_en TEXT",
      // Avisos de coherencia de lo leído (base+IVA≠total, NIF distinto del de siempre,
      // importe fuera de escala). Ver src/modules/facturas/coherencia.js.
      "revisar TEXT"]) {
      try { await client.query(`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS ${col}`); } catch (e) { console.error("[DB] alter facturas " + col + ":", e.message); }
    }
    // `lineas_version`: con qué versión del lector se sacó el detalle. Es lo que permite
    // releer hacia atrás SOLO lo que se leyó con la versión de antes de los descuentos —sin
    // este número habría que adivinarlo mirando las columnas, y una factura que de verdad no
    // tiene descuentos parecería pendiente de releer para siempre.
    // Ver src/modules/facturas/repaso.js.
    // `drive_thumb`: la miniatura del papel, en base64, como CACHÉ. No es un dato: se puede
    // borrar entera y se vuelve a pedir a Drive sola. Se guarda la imagen y no el enlace porque
    // el `thumbnailLink` de Drive caduca en unas horas (ver /api/facturas/:id/miniatura).
    // `vencimiento`: cuándo hay que pagar. `vencimiento_origen` dice de dónde salió —del papel
    // o calculado con lo pactado— y no es un adorno: si cambian las condiciones del proveedor,
    // se recalculan las calculadas y NO se tocan las que traía escritas la factura.
    for (const col of ["lineas_estado TEXT", "lineas_aviso TEXT", "lineas_leidas_en TEXT", "lineas_version INTEGER", "drive_thumb TEXT",
      "vencimiento TEXT", "vencimiento_origen TEXT"]) {
      try { await client.query(`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS ${col}`); } catch (e) { console.error("[DB] alter facturas " + col + ":", e.message); }
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS factura_lineas (
        id SERIAL PRIMARY KEY,
        factura_id INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
        orden INTEGER NOT NULL DEFAULT 0,
        descripcion TEXT NOT NULL,
        cantidad NUMERIC,
        unidad TEXT,
        precio_unitario NUMERIC,
        importe NUMERIC,
        dudosa BOOLEAN NOT NULL DEFAULT FALSE,
        clave TEXT,
        creado_en TEXT NOT NULL
      )`);
    // Descuento por línea. Muchas facturas traen «IMPORTE» (bruto) y «TOTAL» (lo que se paga):
    // guardando solo el bruto, «Qué compramos» decía un precio que nadie paga y el seguimiento
    // de subidas comparaba tarifas en vez de lo pagado. Va DESPUÉS del CREATE, claro.
    for (const col of ["precio_bruto NUMERIC", "importe_bruto NUMERIC", "descuento_pct NUMERIC"]) {
      try { await client.query(`ALTER TABLE factura_lineas ADD COLUMN IF NOT EXISTS ${col}`); }
      catch (e) { console.error("[DB] alter factura_lineas " + col + ":", e.message); }
    }
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fl_factura ON factura_lineas (factura_id)`);
    // El índice que hace rápida la pregunta «cuántas Coca-Colas desde marzo».
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fl_clave ON factura_lineas (clave)`);
    // local_receptor: pista del establecimiento concreto que aparece en la factura (p.ej. "(TAPETA LLORET)").
    try { await client.query(`ALTER TABLE facturas_pendientes ADD COLUMN IF NOT EXISTS local_receptor TEXT`); } catch (e) { console.error("[DB] alter facturas_pendientes local_receptor:", e.message); }
    // El detalle leído se guarda mientras la factura espera local: al confirmarla se
    // reutiliza en vez de volver a leer el PDF y pagar la lectura dos veces.
    try { await client.query(`ALTER TABLE facturas_pendientes ADD COLUMN IF NOT EXISTS lineas_json TEXT`); } catch (e) { console.error("[DB] alter facturas_pendientes lineas_json:", e.message); }
    try { await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS modulos TEXT`); } catch (e) { console.error("[DB] alter users modulos:", e.message); }
    // «Qué compramos» era una pestaña DENTRO de Compras y ahora es el módulo «Productos».
    // A quien tenga los módulos recortados a mano, la lista guardada dice «facturas» y no
    // «productos», así que perdería una pantalla que ya usaba sin que nadie lo pidiera. Se le
    // añade. Una sola vez (por eso la marca en `config`): si mañana dirección se lo quita a
    // propósito, no se le vuelve a poner solo.
    try {
      const yaHecho = await client.query(`SELECT value FROM config WHERE key = 'modulos_productos_v1'`);
      if (!yaHecho.rows.length) {
        const r = await client.query(
          `UPDATE users SET modulos = REPLACE(modulos, '"facturas"', '"facturas","productos"')
            WHERE modulos LIKE '%"facturas"%' AND modulos NOT LIKE '%"productos"%'`);
        await client.query(`INSERT INTO config (key, value, updated_at) VALUES ('modulos_productos_v1', '1', CURRENT_TIMESTAMP)
                            ON CONFLICT (key) DO NOTHING`);
        if (r.rowCount) console.log(`[DB] «Productos» añadido a los módulos de ${r.rowCount} usuario(s) que ya tenían Compras.`);
      }
    } catch (e) { console.error("[DB] migración modulos productos:", e.message); }
    try { await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_enc TEXT`); } catch (e) { console.error("[DB] alter users password_enc:", e.message); }
    try { await client.query(`ALTER TABLE maintenance_issues ADD COLUMN IF NOT EXISTS foto_url TEXT`); } catch (e) { console.error("[DB] alter maintenance_issues foto_url:", e.message); }

    // ── RRHH: perfil de trabajador (aditivo). Enriquece `users` con datos de personal + documentos.
    // `pass_temporal`: la cuenta entra con la contraseña inicial y no puede hacer NADA más
    // que cambiarla. `login_intentos`/`login_bloqueado_hasta`: el freno a la fuerza bruta,
    // en la base para que sobreviva a un reinicio.
    // Establecimientos EXTRA de un usuario, como lista de nombres canónicos. Es aditivo y no
    // toca ninguna tabla viva: el ADR 0001 aparta el modelo con `establecimiento_id` y RLS
    // hasta después de producción, y esto no lo adelanta. Cada consulta sigue filtrando por UN
    // local; lo que cambia es que ahora se puede elegir cuál, entre los suyos.
    try { await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locales_extra TEXT`); }
    catch (e) { console.error("[DB] alter users locales_extra:", e.message); }
    for (const col of ["telefono TEXT", "email TEXT", "dni TEXT", "puesto TEXT", "fecha_nac TEXT", "fecha_alta TEXT", "fecha_baja TEXT", "foto_url TEXT", "agora_username TEXT", "activo INTEGER DEFAULT 1",
      "pass_temporal BOOLEAN DEFAULT FALSE", "pass_cambiada_en TEXT", "login_intentos INTEGER DEFAULT 0", "login_bloqueado_hasta TEXT"]) {
      try { await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col}`); } catch (e) { console.error("[DB] alter users " + col + ":", e.message); }
    }
    // Enlace 1:1 con el operador de Ágora (ignora NULL): un UserName no puede colgar de dos perfiles.
    try { await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_agora_username ON users(agora_username) WHERE agora_username IS NOT NULL`); } catch (e) { console.error("[DB] idx users agora_username:", e.message); }
    // Documentos del trabajador con caducidad (contrato, DNI, carnet manipulador…). worker_id → users.id.
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS hr_documentos (
          id SERIAL PRIMARY KEY,
          worker_id INTEGER NOT NULL,
          tipo TEXT NOT NULL DEFAULT 'otro',
          nombre TEXT,
          url TEXT NOT NULL,
          sensible INTEGER DEFAULT 0,
          fecha_emision TEXT,
          fecha_caducidad TEXT,
          autor TEXT,
          creado_en TEXT NOT NULL
        )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_hrdocs_worker ON hr_documentos(worker_id)`);
    } catch (e) { console.error("[DB] hr_documentos:", e.message); }
    // ── El CHECK de `hor_ausencias.estado`, solo si los datos lo permiten ────────────────
    // La columna aceptaba cualquier texto. Ahora que hay un circuito con cuatro estados
    // conviene cerrarla, pero NO a ciegas: si en la base hay un valor que no conocemos, no se
    // puede saber qué quiso decir quien lo escribió, y convertirlo por nuestra cuenta sería
    // inventarse una decisión de RR.HH. Se mira primero; si hay algo raro, se informa y se
    // deja la tabla como está.
    try {
      const raros = await client.query(
        `SELECT DISTINCT estado FROM hor_ausencias
          WHERE estado IS NULL OR estado NOT IN ('pendiente','aprobada','rechazada','cancelada')`);
      if (raros.rows.length) {
        console.warn(`[DB] hor_ausencias.estado tiene valores fuera de la lista: ` +
          `${raros.rows.map((r) => JSON.stringify(r.estado)).join(", ")}. ` +
          `No se añade la restricción y NO se ha tocado ni una fila: revísalos a mano.`);
      } else {
        await client.query(
          `ALTER TABLE hor_ausencias ADD CONSTRAINT hor_ausencias_estado_ck
             CHECK (estado IN ('pendiente','aprobada','rechazada','cancelada'))`);
      }
    } catch (e) {
      // `duplicate_object` = ya estaba puesto en un arranque anterior. Lo demás sí se cuenta.
      if (e.code !== "42710") console.error("[DB] check estado ausencias:", e.message);
    }

    // Se vacían las copias reversibles de contraseña que quedaran. NO se borra la columna —una
    // migración de esquema aquí no aporta nada y sí puede fallar en el despliegue—, pero sí su
    // contenido: mientras exista, quien tenga una copia de la base y el JWT_SECRET recupera en
    // claro las contraseñas de toda la plantilla. Nadie pierde el acceso: el hash sigue intacto.
    try {
      const r = await client.query(`UPDATE users SET password_enc = NULL WHERE password_enc IS NOT NULL`);
      if (r.rowCount) console.log(`[DB] copias reversibles de contraseña eliminadas: ${r.rowCount}`);
    } catch (e) { console.error("[DB] limpiar password_enc:", e.message); }

    // Los documentos de RR.HH. que se subieron cuando vivían en `public/uploads` siguen
    // accesibles por su URL sin sesión. Se trasladan al directorio privado.
    //
    // NO ES DESTRUCTIVO Y ES IDEMPOTENTE: se COPIA primero, solo si la copia sale bien se
    // apunta la url nueva, y solo si la url quedó apuntada se borra la pública. Si algo falla
    // a mitad, lo peor que queda es el fichero por duplicado y la url vieja, que sigue
    // funcionando. En ningún orden de fallo se pierde un documento.
    try {
      const viejos = await client.query(
        `SELECT id, url FROM hr_documentos WHERE url LIKE '/uploads/%'`);
      let movidos = 0, fallidos = 0;
      for (const d of viejos.rows) {
        const fichero = path.basename(String(d.url));
        const origen = path.join(uploadsDir, fichero), destino = path.join(rrhhDocsDir, fichero);
        try {
          if (!fs.existsSync(origen)) {
            // El fichero ya no está en disco (un redespliegue se lo llevó). La fila se queda
            // como está: perder el rastro de que existió sería peor que un enlace roto.
            fallidos++; continue;
          }
          if (!fs.existsSync(destino)) fs.copyFileSync(origen, destino);
          await client.query(`UPDATE hr_documentos SET url = $1 WHERE id = $2`, [`rrhh:${fichero}`, d.id]);
          try { fs.unlinkSync(origen); } catch { /* el duplicado no molesta; la fila ya apunta al privado */ }
          movidos++;
        } catch (e) { fallidos++; console.error(`[DB] documento ${d.id} no se pudo proteger:`, e.message); }
      }
      if (movidos || fallidos) console.log(`[DB] documentos de RR.HH. protegidos: ${movidos} movidos, ${fallidos} sin mover`);
    } catch (e) { console.error("[DB] migrar documentos rrhh:", e.message); }

    // Backfill cosmético e idempotente: fecha de alta = alta del usuario para el equipo existente.
    try { await client.query(`UPDATE users SET fecha_alta = creado_en WHERE fecha_alta IS NULL AND rol IN ('trabajador','encargado')`); } catch (e) { console.error("[DB] backfill fecha_alta:", e.message); }

    // ── Inventarios (aditivo, aislado por `local`). Flujo: local → proveedor → contar → pedido.
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS inv_proveedores (
          id SERIAL PRIMARY KEY,
          local TEXT NOT NULL,
          nombre TEXT NOT NULL,
          activo BOOLEAN DEFAULT TRUE,
          orden INTEGER DEFAULT 0,
          factura_proveedor TEXT,
          creado_en TEXT NOT NULL,
          UNIQUE(local, nombre)
        )`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS inv_productos (
          id SERIAL PRIMARY KEY,
          proveedor_id INTEGER NOT NULL REFERENCES inv_proveedores(id) ON DELETE CASCADE,
          local TEXT NOT NULL,
          nombre TEXT NOT NULL,
          unidad TEXT NOT NULL DEFAULT 'unidades',
          stock_minimo NUMERIC DEFAULT 0,
          stock_objetivo NUMERIC DEFAULT 0,
          temporada_stock NUMERIC,
          temporada_inicio TEXT,
          temporada_fin TEXT,
          activo BOOLEAN DEFAULT TRUE,
          orden INTEGER DEFAULT 0,
          observaciones TEXT,
          agora_product_id TEXT,
          creado_en TEXT NOT NULL
        )`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS inv_sesiones (
          id SERIAL PRIMARY KEY,
          local TEXT NOT NULL,
          proveedor_id INTEGER NOT NULL REFERENCES inv_proveedores(id) ON DELETE CASCADE,
          estado TEXT NOT NULL DEFAULT 'en_curso',
          usuario TEXT,
          creado_en TEXT NOT NULL,
          finalizado_en TEXT
        )`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS inv_lineas (
          id SERIAL PRIMARY KEY,
          sesion_id INTEGER NOT NULL REFERENCES inv_sesiones(id) ON DELETE CASCADE,
          producto_id INTEGER NOT NULL REFERENCES inv_productos(id) ON DELETE CASCADE,
          cantidad NUMERIC DEFAULT 0,
          observacion TEXT,
          actualizado_en TEXT,
          UNIQUE(sesion_id, producto_id)
        )`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS inv_pedidos (
          id SERIAL PRIMARY KEY,
          local TEXT NOT NULL,
          proveedor_id INTEGER NOT NULL REFERENCES inv_proveedores(id) ON DELETE CASCADE,
          sesion_id INTEGER REFERENCES inv_sesiones(id) ON DELETE SET NULL,
          estado TEXT NOT NULL DEFAULT 'DRAFT',
          usuario TEXT,
          observaciones TEXT,
          factura_id INTEGER REFERENCES facturas(id) ON DELETE SET NULL,
          creado_en TEXT NOT NULL,
          actualizado_en TEXT
        )`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS inv_pedido_lineas (
          id SERIAL PRIMARY KEY,
          pedido_id INTEGER NOT NULL REFERENCES inv_pedidos(id) ON DELETE CASCADE,
          producto_id INTEGER REFERENCES inv_productos(id) ON DELETE SET NULL,
          nombre TEXT,
          unidad TEXT,
          stock_contado NUMERIC,
          stock_necesario NUMERIC,
          cantidad_sugerida NUMERIC,
          cantidad_final NUMERIC,
          observacion TEXT
        )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_inv_prod_prov ON inv_productos(proveedor_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_inv_prov_local ON inv_proveedores(local)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_inv_ped_local ON inv_pedidos(local)`);
      // El puente con las facturas: la clave del producto en el diccionario de Compras, copiada
      // en el momento del alta. Sin ella, saber si un producto ya está montado dependería de que
      // el nombre no cambiara nunca — y en cuanto alguien edite «Coca Cola 33cl» → «Cocacola 33»,
      // el catálogo lo volvería a ofrecer y crearía el duplicado.
      //
      // SIN índice único a propósito: con NULLs y productos legítimamente parecidos, un único
      // convertiría un alta en lote en un 500. La unicidad se aplica en la aplicación, donde se
      // puede contestar «14 creados, 3 ya estaban» en vez de reventar.
      await client.query(`ALTER TABLE inv_productos ADD COLUMN IF NOT EXISTS clave_producto TEXT`);
    } catch (e) { console.error("[DB] inventario:", e.message); }
    // sheet_synced: 1 = proyectada a Sheets; 0 = pendiente (la cola de reintentos la reproyecta desde la BD).
    // Las facturas existentes se asumen sincronizadas (default 1); las nuevas insertan 0 y pasan a 1 al proyectar.
    try { await client.query(`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS sheet_synced INTEGER DEFAULT 1`); } catch (e) { console.error("[DB] alter facturas sheet_synced:", e.message); }

    await client.query(`
      CREATE TABLE IF NOT EXISTS wa_clientes (
        jid TEXT PRIMARY KEY,
        nombre TEXT,
        telefono TEXT,
        notas TEXT DEFAULT '{}',
        ultima_interaccion BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_email_reglas (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        local TEXT NOT NULL,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_emails_procesados (
        id SERIAL PRIMARY KEY,
        gmail_id TEXT NOT NULL UNIQUE,
        de_email TEXT,
        asunto TEXT,
        local TEXT,
        adjuntos_procesados INTEGER DEFAULT 0,
        procesado TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_locales (
        local TEXT PRIMARY KEY,
        empresa TEXT NOT NULL,
        cif TEXT,
        local_contable TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_pendientes (
        id SERIAL PRIMARY KEY,
        empresa_detectada TEXT,
        nif_receptor TEXT,
        nombre_receptor TEXT,
        tipo TEXT,
        fecha TEXT,
        numero_factura TEXT,
        proveedor TEXT,
        nif TEXT,
        concepto TEXT,
        base_imponible NUMERIC,
        porcentaje_iva NUMERIC,
        cuota_iva NUMERIC,
        total NUMERIC,
        drive_url TEXT,
        drive_file_id TEXT,
        file_hash TEXT,
        origen TEXT DEFAULT 'email',
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS campanas_wa (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        segmento_json TEXT NOT NULL,
        mensaje TEXT NOT NULL,
        total_enviados INTEGER DEFAULT 0,
        total_errores INTEGER DEFAULT 0,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
        finalizado_en TEXT
      )
    `);
    /**
     * «ESTE ALBARÁN NO ES DE ESTA FACTURA».
     *
     * Sin esto, una propuesta falsa vuelve a proponerse cada vez que se abre la pantalla —para
     * siempre—, y quien concilia acaba pasando por encima de las mismas tres cada semana. Esa
     * es justo la manera de que un día pulse sin mirar.
     *
     * PK tonta e índice único aparte, NO una clave primaria compuesta: el despliegue de Replit
     * genera su migración diffando, y una PK compuesta es exactamente lo que no sabe ordenar
     * (ya nos costó un despliegue con `facturas_pago_reglas`).
     */
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_conciliacion_descartes (
        id SERIAL PRIMARY KEY,
        factura_id INTEGER NOT NULL,
        albaran_id INTEGER NOT NULL,
        local TEXT,
        motivo TEXT,
        autor TEXT,
        creado_en TEXT NOT NULL
      )
    `);
    try { await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_conc_descarte ON facturas_conciliacion_descartes (factura_id, albaran_id)`); }
    catch (e) { console.error("[DB] ux_conc_descarte:", e.message); }

    /**
     * LO QUE SABEMOS DE CADA CLIENTE. El cuaderno del camarero, escrito.
     *
     * Se guarda por TELÉFONO y no por id de lead porque un cliente puede estar en la base
     * solo por una reserva, sin ficha; el teléfono es lo único que hay siempre y es como se
     * cruza todo lo demás.
     *
     * `texto_original` no es decoración: es lo que separa un dato de un rumor. Y nada se
     * pisa: un dato nuevo sucede al viejo, así que el historial explica por qué la ficha
     * dice lo que dice.
     */
    await client.query(`
      CREATE TABLE IF NOT EXISTS cliente_hechos (
        id SERIAL PRIMARY KEY,
        telefono TEXT NOT NULL,
        etiqueta TEXT NOT NULL,
        valor TEXT NOT NULL,
        texto_original TEXT,
        fuente TEXT NOT NULL DEFAULT 'panel',
        estado TEXT NOT NULL DEFAULT 'propuesto',
        atribucion_dudosa BOOLEAN NOT NULL DEFAULT FALSE,
        creado_en TEXT NOT NULL,
        creado_por TEXT,
        confirmado_por TEXT,
        confirmado_en TEXT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hechos_tel ON cliente_hechos (RIGHT(regexp_replace(telefono, '[^0-9]', '', 'g'), 9))`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hechos_etiqueta ON cliente_hechos (etiqueta) WHERE estado = 'confirmado'`);

    /**
     * LO QUE NOS PIDEN Y NO PODEMOS FILTRAR.
     *
     * «Quiero escribir a la gente con hijos». No tenemos ese dato, así que la respuesta hoy es
     * «no se puede» y ahí muere: nadie se entera de que hace falta, y el mes que viene se pide
     * otra vez. Guardado, al cabo de unas semanas la lista dice sola qué merece la pena empezar
     * a preguntar en la ficha del cliente — que es una decisión de negocio, no de código.
     *
     * `veces` sube en vez de crear filas nuevas: lo que importa no es que se pidió, es cuántas.
     */
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketing_faltan (
        id SERIAL PRIMARY KEY,
        clave TEXT NOT NULL UNIQUE,
        que_pidieron TEXT NOT NULL,
        contexto TEXT,
        veces INTEGER NOT NULL DEFAULT 1,
        primera_vez TEXT NOT NULL,
        ultima_vez TEXT NOT NULL,
        quien TEXT
      )
    `);
    // Ampliación de campañas (multicanal + estados + programación). Aditivo.
    for (const col of [
      "canal TEXT DEFAULT 'whatsapp'", "estado TEXT DEFAULT 'enviada'", "programada_para TEXT",
      "plantilla_id INTEGER", "adjunto_url TEXT", "asunto TEXT",
    ]) {
      try { await client.query(`ALTER TABLE campanas_wa ADD COLUMN IF NOT EXISTS ${col}`); } catch (e) { console.error("[DB] alter campanas_wa:", e.message); }
    }
    // Seguimiento por destinatario (quién recibió qué). Base para aperturas/clics de email.
    await client.query(`
      CREATE TABLE IF NOT EXISTS campana_envios (
        id SERIAL PRIMARY KEY,
        campana_id INTEGER,
        telefono TEXT,
        correo TEXT,
        nombre TEXT,
        estado TEXT DEFAULT 'enviado',
        error TEXT,
        enviado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_campana_envios_cid ON campana_envios(campana_id)`); } catch { /* noop */ }
    // Plantillas de mensaje guardadas (reutilizables, con variables {nombre} {apellidos} {local}).
    await client.query(`
      CREATE TABLE IF NOT EXISTS plantillas_mensaje (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        canal TEXT DEFAULT 'whatsapp',
        asunto TEXT,
        cuerpo TEXT NOT NULL,
        idioma TEXT DEFAULT 'es',
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Audiencias guardadas: un conjunto de filtros reutilizable para campañas/masivo.
    await client.query(`
      CREATE TABLE IF NOT EXISTS audiencias (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        filtros_json TEXT NOT NULL,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Caché de traducciones de plantillas (por idioma + hash del texto) para no repetir llamadas IA.
    await client.query(`
      CREATE TABLE IF NOT EXISTS traducciones (
        id SERIAL PRIMARY KEY,
        idioma TEXT NOT NULL,
        hash TEXT NOT NULL,
        texto_original TEXT,
        texto_traducido TEXT NOT NULL,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (idioma, hash)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pending_whatsapp (
        id SERIAL PRIMARY KEY,
        tipo TEXT NOT NULL,
        destino TEXT NOT NULL,
        reserva_json TEXT NOT NULL,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_worker_notes (
        id SERIAL PRIMARY KEY,
        worker_id INTEGER NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'nota',
        contenido TEXT NOT NULL,
        autor TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_preguntas_mes (
        id SERIAL PRIMARY KEY,
        mes TEXT NOT NULL,
        orden INTEGER DEFAULT 0,
        pregunta TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_llamadas_mes (
        id SERIAL PRIMARY KEY,
        worker_id INTEGER NOT NULL,
        mes TEXT NOT NULL,
        realizada INTEGER DEFAULT 0,
        fecha_llamada TEXT,
        respuestas TEXT,
        comentario_libre TEXT,
        autor TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(worker_id, mes)
      )
    `);

    // ── Pulso anónimo del equipo ──────────────────────────────────────────────
    // DOS TABLAS QUE NO SE PUEDEN CRUZAR. Es el diseño entero, no un detalle:
    //
    //   pulso_invitaciones → sabe QUIÉN ha contestado (para no repetir recordatorios).
    //   pulso_respuestas   → sabe QUÉ se ha contestado. Sin worker_id, sin token y SIN FECHA.
    //
    // Lo único que comparten es `local` y `mes`, que es justo el nivel al que se publica.
    // Hay un test (tests/modules/rrhh-pulso.test.js) que falla si alguien añade una columna
    // identificadora aquí o escribe una consulta que toque las dos a la vez.
    await client.query(`
      CREATE TABLE IF NOT EXISTS pulso_invitaciones (
        id SERIAL PRIMARY KEY,
        worker_id INTEGER NOT NULL,
        mes TEXT NOT NULL,
        local TEXT,
        token_hash TEXT NOT NULL UNIQUE,
        caduca_en TEXT NOT NULL,
        enviado_en TEXT,
        enviado_error TEXT,
        recordatorio_en TEXT,
        usado INTEGER NOT NULL DEFAULT 0,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(worker_id, mes)
      )
    `);
    // `usado` es un entero y NO un timestamp a propósito: con la hora de uso y la hora de
    // llegada de una respuesta, cruzarlas sería trivial. Para recordatorios basta sí/no.
    await client.query(`
      CREATE TABLE IF NOT EXISTS pulso_respuestas (
        id SERIAL PRIMARY KEY,
        mes TEXT NOT NULL,
        local TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        p1 INTEGER NOT NULL,
        p2 INTEGER NOT NULL,
        p3 INTEGER,
        comentario TEXT,
        idioma TEXT DEFAULT 'es'
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pulso_resp_mes ON pulso_respuestas(mes, local)`);
    // Tercera tabla, y aquí SÍ hay nombre: es la vía por la que alguien pide hablar, y la
    // da él a sabiendas. Su mensaje es un campo distinto del comentario anónimo (dos
    // <textarea> distintos en el formulario): copiar uno en otro sería justo lo que
    // prometimos no hacer. Nada en pulso_respuestas indica que esta persona pidió hablar.
    await client.query(`
      CREATE TABLE IF NOT EXISTS pulso_contactos (
        id SERIAL PRIMARY KEY,
        mes TEXT NOT NULL,
        worker_id INTEGER NOT NULL,
        nombre TEXT,
        local TEXT,
        con_quien TEXT,
        mensaje TEXT,
        atendido INTEGER DEFAULT 0,
        atendido_por TEXT,
        atendido_en TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ventas diarias por establecimiento (integración Ágora TPV). Aditiva; se llena por el job de
    // sincronización cuando haya locales configurados (env AGORA_LOCALES). Vacía = dashboard honesto.
    await client.query(`
      CREATE TABLE IF NOT EXISTS ventas_diarias (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        dia TEXT NOT NULL,
        ventas NUMERIC DEFAULT 0,
        tickets INTEGER DEFAULT 0,
        comensales INTEGER DEFAULT 0,
        ticket_medio NUMERIC DEFAULT 0,
        actualizado_en TEXT,
        UNIQUE(local, dia)
      )
    `);

    // Índices (aditivos e idempotentes). Las consultas del panel/dashboard filtran por local,
    // fecha, teléfono, estado… sin índices eran full-scans que a millones de filas degradan mucho.
    // Cada CREATE va en su propio try/catch: un índice que falle NUNCA impide arrancar el servidor.
    const INDICES = [
      "CREATE INDEX IF NOT EXISTS idx_reservas_dia ON reservas(dia)",
      "CREATE INDEX IF NOT EXISTS idx_reservas_local ON reservas(local)",
      "CREATE INDEX IF NOT EXISTS idx_reservas_telefono ON reservas(telefono)",
      "CREATE INDEX IF NOT EXISTS idx_facturas_local ON facturas(local)",
      "CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha)",
      "CREATE INDEX IF NOT EXISTS idx_facturas_pagado ON facturas(pagado)",
      "CREATE INDEX IF NOT EXISTS idx_facturas_proveedor ON facturas(proveedor)",
      // Compuestos para las dos consultas que se lanzan al abrir Reservas y Facturas: siempre
      // son «un local + un rango de fechas». Con los índices sueltos, Postgres tenía que leer
      // TODAS las filas del local y cruzarlas; medido sobre 150.000 reservas, 2,47 ms → 0,24 ms.
      "CREATE INDEX IF NOT EXISTS idx_reservas_local_dia ON reservas(local, dia)",
      "CREATE INDEX IF NOT EXISTS idx_facturas_local_fecha ON facturas(local, fecha)",
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_hash ON facturas(file_hash) WHERE file_hash IS NOT NULL",
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_pend_hash ON facturas_pendientes(file_hash) WHERE file_hash IS NOT NULL",
      "CREATE INDEX IF NOT EXISTS idx_maint_estado ON maintenance_issues(estado)",
      "CREATE INDEX IF NOT EXISTS idx_maint_local ON maintenance_issues(local)",
      "CREATE INDEX IF NOT EXISTS idx_greviews_fecha ON google_reviews(fecha)",
      "CREATE INDEX IF NOT EXISTS idx_greviews_location ON google_reviews(location_name)",
      "CREATE INDEX IF NOT EXISTS idx_wmsg_creado ON whatsapp_messages(creado_en)",
      "CREATE INDEX IF NOT EXISTS idx_leads_creado ON leads(creado_en)",
      "CREATE INDEX IF NOT EXISTS idx_hrnotes_worker ON hr_worker_notes(worker_id)",
      "CREATE INDEX IF NOT EXISTS idx_hrllamadas_mes ON hr_llamadas_mes(mes)",
      "CREATE INDEX IF NOT EXISTS idx_hrapps_estado ON hr_applications(estado)",
      "CREATE INDEX IF NOT EXISTS idx_bloqueos_local ON bloqueos_reservas(local)",
      "CREATE INDEX IF NOT EXISTS idx_ventas_local_dia ON ventas_diarias(local, dia)",
    ];
    for (const sql of INDICES) {
      try { await client.query(sql); } catch (e) { console.warn("Índice omitido (no crítico):", e.message); }
    }

    // Migración aditiva (no destructiva): columnas para responder reseñas en modo borrador.
    // ADD COLUMN IF NOT EXISTS + try/catch: nunca puede impedir el arranque ni tocar datos.
    const ALTERS = [
      "ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS reply TEXT",
      "ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS replied_at TEXT",
      "ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS reply_by TEXT",
      "ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS origen TEXT",
      "ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS google_name TEXT",
    ];
    for (const sql of ALTERS) {
      try { await client.query(sql); } catch (e) { console.warn("Columna omitida (no crítica):", e.message); }
    }

    // Seed usuarios por defecto si la tabla está vacía
    const { rows: usersCount } = await client.query("SELECT COUNT(*) AS total FROM users");
    if (parseInt(usersCount[0].total) === 0) {
      const roles = [
        { username: "direccion", nombre: "Dirección", rol: "direccion" },
        { username: "encargado", nombre: "Encargado", rol: "encargado" },
        { username: "trabajador", nombre: "Trabajador", rol: "trabajador" },
        { username: "rrhh", nombre: "RR.HH.", rol: "rrhh" },
        { username: "marketing", nombre: "Marketing", rol: "marketing" },
        { username: "contabilidad", nombre: "Contabilidad", rol: "contabilidad" }
      ];
      for (const u of roles) {
        const hash = await bcrypt.hash("tapeta2024", 10);
        // También temporal: esta contraseña está escrita en el código y sale por el log al
        // arrancar. Una cuenta con una contraseña pública no puede quedarse así.
        await client.query(
          `INSERT INTO users (username, password_hash, rol, nombre, pass_temporal, creado_en) VALUES ($1, $2, $3, $4, TRUE, $5)`,
          [u.username, hash, u.rol, u.nombre, new Date().toISOString()]
        );
      }
      console.log("Usuarios por defecto creados. Contraseña inicial: tapeta2024 (la pide cambiar al entrar).");
    }

    // Rellenar empresa en facturas que quedaron como null o "Sin empresa asignada"
    await client.query(
      `UPDATE facturas SET empresa = (
         SELECT fl.empresa FROM facturas_locales fl WHERE fl.local = facturas.local
       )
       WHERE (empresa IS NULL OR empresa = 'Sin empresa asignada')
       AND EXISTS (SELECT 1 FROM facturas_locales fl WHERE fl.local = facturas.local)`
    );

    // Modelo de establecimientos (Iteración 2): esquema ADITIVO e idempotente + catálogo canónico.
    // NO fatal: si algo fallara aquí, el resto del ERP debe seguir arrancando (con PERMISOS_V2
    // ausente nadie lee estas tablas). No hace backfill de datos (paso manual y explícito).
    try {
      const schemaX = { run: (sql, p = []) => client.query(toPositional(sql), p) };
      await ensureEstablecimientosSchema(schemaX);
      await seedCatalogo(schemaX);
    } catch (e) {
      console.error("[DB] Aviso: esquema de establecimientos no inicializado (no fatal):", e.message);
    }

    // Horarios y fichajes. Aditivo e idempotente, y NO fatal por la misma razón: si algo
    // fallara aquí, reservas y facturas deben seguir arrancando.
    try {
      const schemaX = { run: (sql, p = []) => client.query(toPositional(sql), p) };
      await ensureSchemaHorarios(schemaX);
      await ensureSchemaFichajes(schemaX);
      await migrarDescansos(schemaX, isoConOffset(Date.now()));
    } catch (e) {
      console.error("[DB] Aviso: esquema de horarios no inicializado (no fatal):", e.message);
    }

    console.log("[DB] Esquema PostgreSQL inicializado");
  } finally {
    client.release();
  }
}

// ── KV → PostgreSQL: restauración de respaldo antiguo (idempotente) ──────────
// Si existen datos en Replit KV de la época SQLite, los importa una sola vez.
async function restoreFromKV() {
  const dbUrl = process.env.REPLIT_DB_URL;
  if (!dbUrl) return;

  // Restaurar leads desde copia comprimida
  try {
    const raw = execSync(`curl -sf "${dbUrl}/latapeta_leads_v1"`, { encoding: "utf8", timeout: 10000 }).trim();
    if (raw && raw !== "null" && raw.length >= 5) {
      let leads;
      try { leads = JSON.parse(zlib.gunzipSync(Buffer.from(raw, "base64")).toString()); } catch { leads = null; }
      if (Array.isArray(leads) && leads.length) {
        let restaurados = 0;
        for (const l of leads) {
          try {
            const existe = await dbGet(
              `SELECT id FROM leads
               WHERE (COALESCE(telefono, '') <> '' AND ? <> '' AND ${MATCH_TEL9("telefono")})
                  OR (COALESCE(correo, '') <> '' AND ? <> '' AND LOWER(TRIM(correo)) = LOWER(TRIM(?)))`,
              [l.telefono || "", l.telefono || "", l.correo || "", l.correo || ""]
            );
            if (!existe) {
              await dbRun(
                `INSERT INTO leads (nombre, apellidos, nacimiento, poblacion, telefono, correo, premio, fuente, genero, creado_en, actualizado_en)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT DO NOTHING`,
                [l.nombre || "", l.apellidos || "", l.nacimiento || "", l.poblacion || "", l.telefono || "", l.correo || "",
                 l.premio || "", l.fuente || "web", l.genero || null, l.creado_en || new Date().toISOString(), l.actualizado_en || null]
              );
              restaurados++;
            }
          } catch {}
        }
        if (restaurados) console.log(`[KV→PG] ${restaurados} leads restaurados desde KV`);
      }
    }
  } catch (e) { console.error("[KV→PG] Error restaurando leads:", e.message); }

  // Restaurar config crítica (wa_links, facturas_grupos, etc.)
  try {
    const raw = execSync(`curl -sf "${dbUrl}/latapeta_critical_config_v2"`, { encoding: "utf8", timeout: 10000 }).trim();
    if (raw && raw !== "null" && raw.length >= 5) {
      const cfg = JSON.parse(raw);
      const ahora = new Date().toISOString();
      for (const { local, group_jid } of (cfg.waLinks || [])) {
        await dbRun(
          "INSERT INTO wa_links (local, group_jid, updated_at) VALUES (?, ?, ?) ON CONFLICT(local) DO UPDATE SET group_jid=EXCLUDED.group_jid, updated_at=EXCLUDED.updated_at",
          [local, group_jid, ahora]
        );
        await dbRun(
          "INSERT INTO contents (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at",
          [`whatsapp_group_${local}`, group_jid, ahora]
        );
      }
      for (const { local, group_jid, sheet_id, sheet_url } of (cfg.facturasGrupos || [])) {
        await dbRun(
          `INSERT INTO facturas_grupos (local, group_jid, sheet_id, sheet_url) VALUES (?, ?, ?, ?)
           ON CONFLICT(group_jid) DO UPDATE SET local=EXCLUDED.local,
             sheet_id=COALESCE(EXCLUDED.sheet_id, facturas_grupos.sheet_id),
             sheet_url=COALESCE(EXCLUDED.sheet_url, facturas_grupos.sheet_url)`,
          [local, group_jid, sheet_id || null, sheet_url || null]
        );
      }
      for (const r of (cfg.facturasLocales || [])) {
        await dbRun(
          `INSERT INTO facturas_locales (local, empresa, cif, local_contable) VALUES (?, ?, ?, ?)
           ON CONFLICT(local) DO UPDATE SET empresa=EXCLUDED.empresa, cif=EXCLUDED.cif, local_contable=EXCLUDED.local_contable`,
          [r.local, r.empresa, r.cif, r.local_contable]
        );
      }
      for (const r of (cfg.emailReglas || [])) {
        await dbRun(
          `INSERT INTO facturas_email_reglas (email, local) VALUES (?, ?) ON CONFLICT(email) DO NOTHING`,
          [r.email, r.local]
        );
      }
      console.log(`[KV→PG] Config crítica restaurada desde KV`);
    }
  } catch (e) { console.error("[KV→PG] Error restaurando config:", e.message); }
}

// ── Google Business OAuth ─────────────────────────────────────────────────

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI  = (process.env.BASE_URL || "https://familia-del-amor.replit.app") + "/auth/google/callback";
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

async function getConfig(key) {
  const row = await dbGet("SELECT value FROM config WHERE key = ?", [key]);
  return row ? row.value : null;
}
async function setConfig(key, value) {
  await dbRun(
    `INSERT INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
    [key, String(value)]
  );
}

// Devuelve el bloqueo de reservas que aplica a (local, dia) o null.
async function estaBloqueado(local, dia) {
  if (!local || !dia) return null;
  return await dbGet(
    `SELECT * FROM bloqueos_reservas
     WHERE (local = ? OR local = 'Todos')
       AND ?::date BETWEEN desde::date AND hasta::date
     ORDER BY id LIMIT 1`,
    [local, dia]
  );
}

async function getGoogleAccessToken() {
  const refresh = await getConfig("google_refresh_token");
  if (!refresh) throw new Error("No hay refresh token de Google guardado");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: "refresh_token"
    })
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("Token inválido: " + JSON.stringify(d));
  return d.access_token;
}

const STAR = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

// Cuenta cuántos Place IDs válidos hay configurados (tolerante a JSON malformado).
async function contarPlaceIds() {
  try { const raw = await getConfig("places_ids"); return placeIdsConfigurados(raw ? JSON.parse(raw) : []); }
  catch { return 0; }
}
// Traduce un error de Google a un motivo corto (sin volcar la respuesta completa).
function detectarMotivoGoogle(status, data) {
  const err = data && data.error;
  const code = err && (err.status || "");
  if (status === 403 || code === "PERMISSION_DENIED") return "cuota_o_permiso_403";
  if (status === 429 || code === "RESOURCE_EXHAUSTED") return "cuota_agotada_429";
  if (err && err.message) return String(err.message).slice(0, 120);
  return `http_${status}`;
}

// Business Profile: devuelve resultado ESTRUCTURADO (no lanza en casos recuperables).
async function fetchBusinessReviews() {
  console.log("[Google Reviews] Business Profile start");
  const token = await getGoogleAccessToken(); // token inválido → lanza; lo captura syncReviews
  const h = { Authorization: `Bearer ${token}` };
  const accRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: h });
  const accData = await accRes.json().catch(() => ({}));
  if (!accRes.ok || accData.error) {
    const reason = detectarMotivoGoogle(accRes.status, accData);
    console.log(`[Google Reviews] Falling back to Places: ${reason}`);
    return { imported: 0, updated: 0, accounts: 0, reason };
  }
  const accounts = accData.accounts || [];
  console.log(`[Google Reviews] Accounts found: ${accounts.length}`);
  if (!accounts.length) return { imported: 0, updated: 0, accounts: 0, reason: "sin_cuentas" };

  let imported = 0, updated = 0, locsTotal = 0;
  for (const account of accounts) {
    const locRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`, { headers: h });
    const locData = await locRes.json().catch(() => ({}));
    const locs = locData.locations || [];
    locsTotal += locs.length;
    for (const loc of locs) {
      // Paginación: recorre TODAS las páginas de reseñas de la ficha (histórico completo).
      let pageToken = null, pages = 0;
      do {
        const url = `https://mybusinessreviews.googleapis.com/v1/${loc.name}/reviews?pageSize=50` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
        const revRes = await fetch(url, { headers: h });
        const revData = await revRes.json().catch(() => ({}));
        for (const rev of (revData.reviews || [])) {
          const r = await dbRun(
            `INSERT INTO google_reviews (id, location_name, author, rating, text, fecha, origen, google_name)
             VALUES (?, ?, ?, ?, ?, ?, 'business_profile', ?)
             ON CONFLICT(id) DO UPDATE SET author=EXCLUDED.author, rating=EXCLUDED.rating, text=EXCLUDED.text, fecha=EXCLUDED.fecha, origen='business_profile', google_name=EXCLUDED.google_name
             RETURNING (xmax = 0)::int AS inserted`,
            [rev.reviewId || rev.name, loc.title || loc.name, rev.reviewer?.displayName || "Cliente", STAR[rev.starRating] || 5, rev.comment || "", rev.createTime || new Date().toISOString(), rev.name || null]
          );
          if (r && (r.inserted === 1 || r.inserted === "1" || r.inserted === true)) imported++; else updated++;
        }
        pageToken = revData.nextPageToken || null;
        pages++;
      } while (pageToken && pages < 60); // tope de seguridad (~3000 reseñas/ficha)
    }
  }
  console.log(`[Google Reviews] Locations found: ${locsTotal}`);
  console.log(`[Google Reviews] Business Profile imported: ${imported} (updated: ${updated})`);
  return { imported, updated, accounts: accounts.length, locations: locsTotal, reason: (imported + updated === 0 ? "sin_resenas" : null) };
}

// Places API: resultado ESTRUCTURADO; un local que falle NO detiene a los demás.
async function fetchPlacesReviews() {
  const raw = await getConfig("places_ids");
  let locations = [];
  try { locations = raw ? JSON.parse(raw).filter((l) => l && l.placeId) : []; } catch { locations = []; }
  console.log(`[Google Reviews] Places configured: ${locations.length}`);
  let imported = 0, updated = 0; const errors = [];
  for (const loc of locations) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(loc.placeId)}&fields=name,reviews&key=${GOOGLE_PLACES_API_KEY}&language=es&reviews_sort=newest`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({ status: "PARSE_ERROR" }));
      if (data.status !== "OK") { errors.push(`${loc.name || loc.placeId}: ${data.status}${data.error_message ? " - " + data.error_message : ""}`); continue; }
      for (const rev of (data.result?.reviews || [])) {
        const id = `places_${loc.placeId}_${rev.time}`;
        const r = await dbRun(
          `INSERT INTO google_reviews (id, location_name, author, rating, text, fecha, origen)
           VALUES (?, ?, ?, ?, ?, ?, 'places')
           ON CONFLICT(id) DO UPDATE SET author=EXCLUDED.author, rating=EXCLUDED.rating, text=EXCLUDED.text, fecha=EXCLUDED.fecha,
             origen = CASE WHEN google_reviews.origen = 'business_profile' THEN 'business_profile' ELSE 'places' END
           RETURNING (xmax = 0)::int AS inserted`,
          [id, loc.name || "Local", rev.author_name || "Cliente", rev.rating || 5, rev.text || "", new Date(rev.time * 1000).toISOString()]
        );
        if (r && (r.inserted === 1 || r.inserted === "1" || r.inserted === true)) imported++; else updated++;
      }
    } catch (e) { errors.push(`${loc.name || loc.placeId}: ${e.message}`); }
  }
  console.log(`[Google Reviews] Places imported: ${imported} (updated: ${updated})`);
  return { imported, updated, errors };
}

// Orquesta la sincronización (Business → fallback Places) y persiste el estado.
async function runReviewsSync() {
  const t0 = Date.now();
  const ahora = new Date().toISOString();
  await setConfig("reviews_last_attempt", ahora); // último INTENTO (aunque falle)
  const refresh = await getConfig("google_refresh_token");
  const placeIdsCount = await contarPlaceIds();
  console.log(`[Google Reviews] runReviewsSync ENTRA · token=${!!refresh} placesKey=${!!GOOGLE_PLACES_API_KEY} placeIds=${placeIdsCount}`);
  const result = await syncReviews({
    hasRefreshToken: !!refresh,
    hasPlacesKey: !!GOOGLE_PLACES_API_KEY,
    placeIdsCount,
    fetchBusiness: fetchBusinessReviews,
    fetchPlaces: fetchPlacesReviews,
  });
  const ms = Date.now() - t0;
  const total = result.imported + result.updated;
  console.log(`[Google Reviews] runReviewsSync SALE · source=${result.source} imported=${result.imported} updated=${result.updated} reason=${result.reason || "-"} bpError=${result.businessProfileError || "-"} errors=${(result.errors || []).join("; ") || "-"} · ${ms} ms`);
  await setConfig("reviews_last_fetch", ahora);
  await setConfig("reviews_last_source", result.source);
  await setConfig("reviews_last_reason", result.reason || "");
  await setConfig("reviews_last_bp_error", result.businessProfileError || "");
  await setConfig("reviews_last_error", (result.businessProfileError || (result.errors && result.errors[0]) || result.reason || ""));
  if (total > 0) await setConfig("reviews_last_ok", ahora); // última SINCRONIZACIÓN con reseñas de verdad
  return result;
}

// Refresco diario de reseñas (cada 24h). Fallback automático Business → Places.
setInterval(async () => {
  try {
    const refresh = await getConfig("google_refresh_token");
    if (refresh || GOOGLE_PLACES_API_KEY) await runReviewsSync();
  } catch (e) {
    console.error("[Google Reviews] Auto-refresh:", e.message);
  }
}, 24 * 60 * 60 * 1000);

// Sincronización de ventas de Ágora (oportunista + catch-up). No hace NADA si no hay locales
// configurados (AGORA_LOCALES vacío). Arranque diferido 60s + cada 45 min.
setTimeout(() => { lanzarAgoraSync("arranque"); }, 60 * 1000);
// Se COMPRUEBA cada 5 minutos y se sincroniza si el último pasa de 15. No es lo mismo que un
// temporizador de 15: así «cada 15 minutos» significa «nunca más viejo de 15 minutos», venga el
// disparo de donde venga —el temporizador, alguien entrando al panel o el botón—.
setInterval(() => { agoraSyncSiToca("timer").catch((e) => console.error("Ágora sync:", e.message)); }, 5 * 60 * 1000);

// ── Google Drive / Sheets OAuth (cuenta separada para facturas) ────────────
const GOOGLE_DRIVE_CLIENT_ID     = process.env.GOOGLE_DRIVE_CLIENT_ID     || "";
const GOOGLE_DRIVE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI_FACTURAS = (process.env.BASE_URL || "https://familia-del-amor.replit.app") + "/auth/google-facturas/callback";

async function getDriveAccessToken() {
  const refresh = await getConfig("google_drive_refresh_token");
  if (!refresh) throw new Error("Google Drive no conectado. Ve a Dirección → Facturas y conecta la cuenta.");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: "refresh_token"
    })
  });
  const data = await r.json();
  if (!data.access_token) throw new Error("No se pudo renovar token de Drive: " + JSON.stringify(data));
  return data.access_token;
}

// ── Gmail: funciones de polling ────────────────────────────────────────────

function flattenParts(payload, result = []) {
  if (!payload) return result;
  if (payload.parts) {
    for (const part of payload.parts) flattenParts(part, result);
  } else {
    result.push(payload);
  }
  return result;
}

async function markGmailRead(token, msgId) {
  await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] })
  });
}

// ── Ingesta de facturas por Drive (carpeta vigilada por local) ──────────────
async function driveListarCarpeta(token, folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and (mimeType='application/pdf' or mimeType contains 'image/')`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=100`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json();
  if (d.error) throw new Error(JSON.stringify(d.error));
  return d.files || [];
}
async function driveDescargarArchivo(token, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error("descarga Drive " + r.status);
  return Buffer.from(await r.arrayBuffer());
}
async function pollDriveFacturas() {
  try {
    const carpetas = await dbAll("SELECT local, folder_id FROM facturas_drive_carpetas");
    if (!carpetas.length) return;
    const token = await getDriveAccessToken();
    if (!token) return;
    for (const c of carpetas) {
      let files = [];
      try { files = await driveListarCarpeta(token, c.folder_id); } catch (e) { console.error(`[Drive ingest] listar ${c.local}:`, e.message); continue; }
      for (const f of files) {
        const done = await dbGet("SELECT 1 FROM facturas_drive_procesados WHERE drive_file_id = ?", [f.id]);
        if (done) continue;
        try {
          const buffer = await driveDescargarArchivo(token, f.id);
          await procesarFactura({ buffer, mimeType: f.mimeType, filename: f.name, local: c.local, canal: "Drive", getToken: getDriveAccessToken, dbGet, dbAll, dbRun });
          console.log(`[Drive ingest] Procesada ${f.name} (${c.local})`);
        } catch (e) {
          if (!(e && e.isDuplicate)) console.error(`[Drive ingest] ${f.name}:`, e.message);
        }
        // Marca como procesado SIEMPRE (evita reintentos infinitos, también en duplicado/error).
        try { await dbRun("INSERT INTO facturas_drive_procesados (drive_file_id, local, procesado_en) VALUES (?, ?, ?) ON CONFLICT(drive_file_id) DO NOTHING", [f.id, c.local, new Date().toISOString()]); } catch { /* noop */ }
      }
    }
  } catch (e) { console.error("[pollDriveFacturas]", e.message); }
}

async function pollGmail() {
  try {
    const token = await getDriveAccessToken();

    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent("is:unread has:attachment")}&maxResults=20`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    const listData = await listRes.json();
    if (listData.error) { console.error("[Gmail] Error listando:", JSON.stringify(listData.error)); return; }
    if (!listData.messages || listData.messages.length === 0) return;

    for (const { id: msgId } of listData.messages) {
      const yaProcesado = await dbGet("SELECT id FROM facturas_emails_procesados WHERE gmail_id = ?", [msgId]);
      if (yaProcesado) continue;

      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const msg = await msgRes.json();

      const headers = msg.payload?.headers || [];
      const from = headers.find(h => h.name.toLowerCase() === "from")?.value || "";
      const subject = headers.find(h => h.name.toLowerCase() === "subject")?.value || "Sin asunto";
      const emailMatch = from.match(/<(.+?)>/);
      const senderEmail = (emailMatch ? emailMatch[1] : from).trim().toLowerCase();

      const regla = await dbGet("SELECT local FROM facturas_email_reglas WHERE LOWER(email) = ?", [senderEmail]);
      const localConocido = regla?.local || null;

      const parts = flattenParts(msg.payload);
      const adjuntos = parts.filter(p =>
        p.filename && p.body?.attachmentId &&
        (p.mimeType === "application/pdf" || p.mimeType?.startsWith("image/"))
      );

      if (adjuntos.length === 0) {
        await markGmailRead(token, msgId);
        await dbRun(
          "INSERT INTO facturas_emails_procesados (gmail_id, de_email, asunto, local, adjuntos_procesados) VALUES (?, ?, ?, ?, 0) ON CONFLICT(gmail_id) DO NOTHING",
          [msgId, senderEmail, subject, localConocido || "auto"]
        );
        continue;
      }

      let procesados = 0;
      for (const parte of adjuntos) {
        try {
          const attRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${parte.body.attachmentId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const attData = await attRes.json();
          const buffer = Buffer.from(attData.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");

          if (localConocido) {
            await procesarFactura({
              buffer, mimeType: parte.mimeType,
              filename: parte.filename || `adjunto_${msgId}`,
              local: localConocido,
              caption: `Email · ${from} · ${subject}`,
              getToken: getDriveAccessToken, dbGet, dbAll, dbRun,
              backupFn: null
            });
          } else {
            await procesarFacturaSinLocal({
              buffer, mimeType: parte.mimeType,
              filename: parte.filename || `adjunto_${msgId}`,
              origen: "email",
              getToken: getDriveAccessToken, dbGet, dbAll, dbRun
            });
          }
          procesados++;
        } catch (err) {
          if (err instanceof FacturaDuplicadaError) {
            console.warn(`[Gmail] Duplicado de ${senderEmail}: ${err.message}`);
          } else {
            console.error(`[Gmail] Error procesando adjunto de ${msgId}:`, err.message);
          }
        }
      }

      await markGmailRead(token, msgId);
      await dbRun(
        "INSERT INTO facturas_emails_procesados (gmail_id, de_email, asunto, local, adjuntos_procesados) VALUES (?, ?, ?, ?, ?) ON CONFLICT(gmail_id) DO NOTHING",
        [msgId, senderEmail, subject, localConocido || "auto", procesados]
      );
      console.log(`[Gmail] ${senderEmail} → ${localConocido || "auto-detect"} (${procesados} adjunto/s)`);
    }
  } catch (err) {
    if (err.message.includes("no conectado")) return;
    console.error("[Gmail] Error en poll:", err.message);
  }
}

app.get("/auth/google-facturas", (req, res) => {
  if (!GOOGLE_DRIVE_CLIENT_ID) return res.status(500).send("GOOGLE_DRIVE_CLIENT_ID no configurado en Replit Secrets");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_DRIVE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI_FACTURAS);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify"
  ].join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  res.redirect(url.toString());
});

app.get("/auth/google-facturas/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`Error Google OAuth Facturas: ${error}`);
  if (!code) return res.send("Sin código de autorización");
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI_FACTURAS,
      grant_type: "authorization_code"
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.refresh_token) {
    return res.send("Error: Google no devolvió refresh_token. Ve a <a href='https://myaccount.google.com/permissions'>myaccount.google.com/permissions</a>, revoca el acceso y vuelve a intentarlo.");
  }
  await setConfig("google_drive_refresh_token", tokenData.refresh_token);
  res.redirect("/panel/?facturas=connected");
});

// ── API: estado y grupos de facturas ───────────────────────────────────────
app.get("/api/facturas/status", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const token = await getConfig("google_drive_refresh_token");
  const grupos = await dbAll("SELECT * FROM facturas_grupos ORDER BY local", []);
  let pendientesSheet = 0;
  try { const r = await dbGet("SELECT COUNT(*) AS n FROM facturas WHERE COALESCE(sheet_synced,0)=0", []); pendientesSheet = Number(r?.n || 0); } catch { /* columna nueva */ }
  res.json({ ok: true, conectado: !!token, grupos, pendientes_sheet: pendientesSheet, ultimo_reintento: (await getConfig("facturas_ultimo_reintento")) || null });
});

/**
 * Dónde están las facturas en Drive, con enlaces para ir a mirarlo.
 *
 * Existe porque «está conectado» no contesta la pregunta que se hace de verdad, que es «no veo
 * ninguna carpeta». Las carpetas se crean en el Drive de la CUENTA QUE AUTORIZÓ la conexión, y
 * si esa no es la cuenta con la que se navega, no aparecen por ningún lado aunque todo esté
 * funcionando. Esto dice qué cuenta es y da el enlace directo a la carpeta raíz.
 */
app.get("/api/facturas/drive-diagnostico", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const out = { conectado: false, cuenta: null, raiz: null, facturas: 0, conArchivo: 0, ultimas: [], sheets: [], avisos: [] };
  try {
    const refresh = await getConfig("google_drive_refresh_token");
    out.conectado = !!refresh;
    if (!refresh) { out.avisos.push("Google Drive no está conectado: nada se está guardando en Drive."); return res.json({ ok: true, ...out }); }

    let token;
    try { token = await getDriveAccessToken(); }
    catch (e) { out.avisos.push("Hay una conexión guardada pero Google la rechaza: " + e.message + ". Hay que volver a conectar la cuenta."); return res.json({ ok: true, ...out }); }

    // Con qué cuenta de Google se está escribiendo. Es el dato que resuelve el 90 % de los casos.
    try {
      const r = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName),storageQuota(limit,usage)",
        { headers: { Authorization: "Bearer " + token } });
      const j = await r.json();
      if (j.user) out.cuenta = { email: j.user.emailAddress, nombre: j.user.displayName };
      if (j.storageQuota && j.storageQuota.limit && Number(j.storageQuota.usage) >= Number(j.storageQuota.limit)) {
        out.avisos.push("El Drive de esa cuenta está lleno: las subidas fallarán hasta que se libere espacio.");
      }
    } catch { /* el diagnóstico sigue sin esto */ }

    const rootId = await getConfig("drive_facturas_root_id");
    if (!rootId) {
      out.avisos.push("Todavía no se ha creado la carpeta raíz. Se crea sola con la primera factura que entre.");
    } else {
      try {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${rootId}?fields=id,name,trashed,webViewLink,parents,ownedByMe,shared,owners(emailAddress)`,
          { headers: { Authorization: "Bearer " + token } });
        const j = await r.json();
        if (j.error) out.avisos.push("La carpeta raíz guardada ya no existe o no es accesible con esta cuenta.");
        else {
          out.raiz = { id: j.id, nombre: j.name, url: j.webViewLink, papelera: !!j.trashed,
            dueño: (j.owners || [])[0]?.emailAddress || null, propia: j.ownedByMe !== false, padres: j.parents || [] };
          if (j.trashed) out.avisos.push("¡La carpeta raíz está en la PAPELERA de Drive! Restáurala o se seguirán subiendo archivos a una carpeta borrada.");

          // ¿Cuelga de «Mi unidad»? Si no, los archivos existen y se ven en la página
          // principal y en «Reciente», pero NO hay forma de llegar a ellos navegando por Mi
          // unidad. Es exactamente el síntoma de «veo las facturas pero no las carpetas».
          out.raiz.enMiUnidad = false;
          if (!j.parents || !j.parents.length) {
            out.raiz.ubicacion = "huérfana";
            out.avisos.push("La carpeta raíz no cuelga de ninguna parte (está huérfana): por eso las facturas se ven en la página principal de Drive pero no aparecen en «Mi unidad».");
          } else {
            try {
              const pr = await fetch(`https://www.googleapis.com/drive/v3/files/${j.parents[0]}?fields=id,name,parents,ownedByMe`,
                { headers: { Authorization: "Bearer " + token } }).then((x) => x.json());
              const raizDrive = await fetch("https://www.googleapis.com/drive/v3/files/root?fields=id",
                { headers: { Authorization: "Bearer " + token } }).then((x) => x.json());
              out.raiz.enMiUnidad = pr.id === raizDrive.id;
              out.raiz.ubicacion = out.raiz.enMiUnidad ? "Mi unidad" : (pr.name || "otra carpeta");
              if (!out.raiz.enMiUnidad && pr.ownedByMe === false) {
                out.avisos.push(`La carpeta raíz está dentro de «${pr.name}», que NO es tuya (compartida contigo). Por eso no aparece en «Mi unidad».`);
              } else if (!out.raiz.enMiUnidad) {
                out.raiz.ubicacion = pr.name;
              }
            } catch { /* si no se puede leer el padre, se deja lo que hay */ }
          }
          if (j.ownedByMe === false) out.avisos.push("La carpeta raíz no es de esta cuenta: es de " + (out.raiz.dueño || "otra persona") + ".");
          // Qué hay dentro: es lo que confirma que la estructura existe de verdad.
          const hijos = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${rootId}' in parents and trashed = false`)}&fields=files(id,name,mimeType,webViewLink)&pageSize=50`,
            { headers: { Authorization: "Bearer " + token } }).then((x) => x.json());
          out.raiz.contenido = (hijos.files || []).map((f) => ({ nombre: f.name, url: f.webViewLink, esCarpeta: f.mimeType === "application/vnd.google-apps.folder" }));
          if (!out.raiz.contenido.length) out.avisos.push("La carpeta raíz está vacía: no ha entrado ninguna factura todavía.");
        }
      } catch (e) { out.avisos.push("No se pudo leer la carpeta raíz: " + e.message); }
    }

    const c = await dbGet(`SELECT count(*)::int AS n, count(*) FILTER (WHERE drive_url IS NOT NULL AND drive_url <> '')::int AS con FROM facturas WHERE COALESCE(dup_estado,'') <> 'duda'`);
    out.facturas = c?.n || 0; out.conArchivo = c?.con || 0;
    if (out.facturas && !out.conArchivo) out.avisos.push("Hay facturas guardadas pero NINGUNA tiene archivo en Drive: entraron cuando la conexión estaba caída.");
    out.ultimas = await dbAll(`SELECT id, fecha, proveedor, local, empresa, drive_url FROM facturas
                                WHERE drive_url IS NOT NULL AND drive_url <> '' ORDER BY id DESC LIMIT 8`);

    // La ruta REAL de cada una en Drive, subiendo por sus carpetas padre. Es lo único que
    // contesta «¿están ordenadas?» sin que nadie tenga que fiarse de lo que diga el código:
    // si sale «Contabilidad / Familia del Amor SL / La Tapeta - Blanes / Julio 2026», lo están.
    const idDe = (u) => (String(u || "").match(/(?:file\/d\/|id=)([a-zA-Z0-9_-]+)/) || [])[1] || null;
    const cacheNombre = new Map();
    const rutaDe = async (fileId) => {
      const partes = [];
      let actual = fileId, saltos = 0;
      while (actual && saltos++ < 8) {
        if (!cacheNombre.has(actual)) {
          const r = await fetch(`https://www.googleapis.com/drive/v3/files/${actual}?fields=name,parents,trashed`,
            { headers: { Authorization: "Bearer " + token } });
          const j = await r.json();
          if (j.error) return { error: j.error.message, partes };
          cacheNombre.set(actual, { nombre: j.name, padre: (j.parents || [])[0] || null, papelera: !!j.trashed });
        }
        const n = cacheNombre.get(actual);
        partes.unshift(n.nombre);
        actual = n.padre;
      }
      return { partes };
    };

    let sueltas = 0;
    for (const f of out.ultimas) {
      const fid = idDe(f.drive_url);
      if (!fid) { f.ruta = null; continue; }
      try {
        const { partes, error } = await rutaDe(fid);
        f.ruta = error ? null : partes.slice(0, -1).join(" / ");   // sin el nombre del archivo
        f.rutaError = error || null;
        // Ordenada = cuelga de al menos Empresa/Local/Mes por debajo de la raíz.
        f.ordenada = !!(f.ruta && partes.length >= 5);
        if (f.ruta && !f.ordenada) sueltas++;
      } catch (e) { f.rutaError = e.message; }
    }
    if (sueltas) {
      out.avisos.push(`${sueltas} de las ${out.ultimas.length} últimas facturas NO están en su carpeta Empresa/Local/Mes. El botón «Reordenar Drive» las coloca sin volver a subirlas.`);
    }
    out.sheets = await dbAll(`SELECT local, sheet_url FROM facturas_grupos WHERE sheet_url IS NOT NULL ORDER BY local`);

    // Un local sin empresa manda sus facturas a una carpeta llamada «Sin empresa asignada».
    const sinEmpresa = await dbAll(`SELECT DISTINCT f.local FROM facturas f
                                     LEFT JOIN facturas_locales l ON l.local = f.local
                                    WHERE l.empresa IS NULL OR l.empresa = ''`);
    if (sinEmpresa.length) out.avisos.push(`Sin empresa configurada: ${sinEmpresa.map((x) => x.local).join(", ")}. Sus facturas van a una carpeta «Sin empresa asignada».`);

    res.json({ ok: true, ...out });
  } catch (e) {
    console.error("[facturas] diagnóstico drive:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Coloca la carpeta raíz en «Mi unidad».
 *
 * No mueve ni copia ni un archivo: en Drive, mover una carpeta es cambiarle el padre, y todo
 * lo de dentro va con ella conservando sus enlaces. Los `drive_url` guardados en la base de
 * datos siguen funcionando exactamente igual.
 */
app.post("/api/facturas/drive-colocar-raiz", requireAuth(["direccion"]), async (req, res) => {
  try {
    const rootId = await getConfig("drive_facturas_root_id");
    if (!rootId) return res.status(400).json({ ok: false, error: "Todavía no hay carpeta raíz." });
    const token = await getDriveAccessToken();

    const actual = await fetch(`https://www.googleapis.com/drive/v3/files/${rootId}?fields=id,name,parents,ownedByMe`,
      { headers: { Authorization: "Bearer " + token } }).then((r) => r.json());
    if (actual.error) return res.status(400).json({ ok: false, error: "No se puede leer la carpeta raíz: " + actual.error.message });
    if (actual.ownedByMe === false) {
      return res.status(400).json({ ok: false, error: `La carpeta «${actual.name}» no es de esta cuenta, así que no se puede mover. Hay que crear una raíz nueva y reordenar.` });
    }

    const miUnidad = await fetch("https://www.googleapis.com/drive/v3/files/root?fields=id",
      { headers: { Authorization: "Bearer " + token } }).then((r) => r.json());
    const quitar = (actual.parents || []).filter((p) => p !== miUnidad.id);
    if (!quitar.length && (actual.parents || []).includes(miUnidad.id)) {
      return res.json({ ok: true, yaEstaba: true, mensaje: "La carpeta ya estaba en Mi unidad." });
    }

    const url = `https://www.googleapis.com/drive/v3/files/${rootId}?addParents=${miUnidad.id}`
      + (quitar.length ? `&removeParents=${quitar.join(",")}` : "") + "&fields=id,name,webViewLink";
    const mv = await fetch(url, { method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json());
    if (mv.error) return res.status(500).json({ ok: false, error: mv.error.message });

    console.log(`[Facturas] Carpeta raíz colocada en Mi unidad: ${mv.name}`);
    res.json({ ok: true, url: mv.webViewLink, mensaje: `«${mv.name}» ya está en Mi unidad, con todo lo que tiene dentro.` });
  } catch (e) {
    console.error("[facturas] colocar raíz:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Reproyectar ahora las facturas pendientes de volcado a Sheets (botón "Reintentar volcado").
app.post("/api/facturas/reproyectar", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const r = await reproyectarPendientes({ getToken: getDriveAccessToken, dbGet, dbAll, dbRun });
    await setConfig("facturas_ultimo_reintento", new Date().toISOString());
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/api/facturas/grupos", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const rows = await dbAll("SELECT * FROM facturas_grupos ORDER BY local", []);
  res.json({ ok: true, data: rows });
});

app.post("/api/facturas/grupos", requireAuth(["direccion"]), async (req, res) => {
  const { local, group_jid } = req.body;
  if (!local || !group_jid) return res.status(400).json({ ok: false, error: "Faltan local o group_jid" });
  // El canal es el que decide a qué local se apunta cada factura que llega por él. Si aquí se
  // guarda «Blanes» o «Tordera», ese error se copia en todas. Se canoniza en la puerta.
  const localCanon = canonizarLocal(local);
  if (!localCanon) return res.status(400).json({ ok: false, error: `«${local}» no es ningún establecimiento. Elige a cuál pertenece este grupo.` });
  try {
    await dbRun(
      "INSERT INTO facturas_grupos (local, group_jid) VALUES (?, ?) ON CONFLICT(group_jid) DO UPDATE SET local = EXCLUDED.local",
      [localCanon, group_jid]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/facturas/grupos/:id", requireAuth(["direccion"]), async (req, res) => {
  await dbRun("DELETE FROM facturas_grupos WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// Construye el WHERE de facturas a partir de los filtros de query (reutilizado por lista y CSV).
// Lo que está pendiente de decidir si es duplicado NO cuenta en ningún sitio: ni en la lista,
// ni en los totales, ni en el gasto por categoría. Un total con un duplicado dentro es un
// total falso. Se ve aparte, en su propia pantalla, con lo que suma.
const SIN_DUDAS = "COALESCE(dup_estado,'') <> 'duda'";
// Un albarán es la ENTREGA; lo que se paga es la factura que agrupa varios. Sumar los dos es
// contar el mismo gasto dos veces: el albarán de 400 € y la factura de 1.240 € que lo incluye
// darían 1.640 €. Así que el dinero se cuenta solo sobre facturas y tickets. Los albaranes
// siguen viéndose en la lista y se concilian aparte.
const SIN_ALBARANES = "COALESCE(tipo,'factura') <> 'albaran'";

// La línea de un albarán se descuenta SOLO si ese albarán ya está conciliado con una factura y
// esa factura trae su propio detalle. Si la factura es un resumen sin líneas («según albaranes
// adjuntos»), el albarán es la ÚNICA fuente de lo que entró por la puerta y quitarlo perdería el
// producto entero, que es peor que contarlo dos veces.
//
// Vive aquí, y no dentro de la consulta que la estrenó, porque ahora la usan dos: el «Qué
// compramos» y el catálogo de un proveedor de inventario. Con una copia en cada sitio, dentro de
// un año serían dos reglas de conciliación distintas sin que nadie hubiera decidido separarlas.
// Espera que la tabla `facturas` venga con el alias `f`.
const ALBARAN_YA_CONTADO = `(COALESCE(f.tipo,'factura') = 'albaran' AND f.conciliado_con IS NOT NULL AND EXISTS (
    SELECT 1 FROM facturas ff
     WHERE ff.id = NULLIF(regexp_replace(f.conciliado_con, '[^0-9]', '', 'g'), '')::int
       AND ff.lineas_estado IN ('ok','dudas','descuadre')))`;

function facturasWhere(query = {}) {
  const { local, empresa, tipo, estado, from, to, q, proveedor } = query;
  const cond = [SIN_DUDAS], params = [];
  if (local) { cond.push("local = ?"); params.push(local); }
  if (empresa) { cond.push("empresa = ?"); params.push(empresa); }
  if (proveedor) { cond.push("proveedor = ?"); params.push(proveedor); }
  // Varios tipos a la vez ("factura,albaran"): el filtro es de casillas, no de una sola
  // opción, y pedir albaranes Y tickets a la vez es lo normal.
  if (tipo) {
    const tipos = String(tipo).split(",").map((t) => t.trim()).filter(Boolean);
    if (tipos.length === 1) { cond.push("tipo = ?"); params.push(tipos[0]); }
    else if (tipos.length > 1) { cond.push(`tipo IN (${tipos.map(() => "?").join(",")})`); params.push(...tipos); }
  }
  if (estado === "pagada") cond.push("pagado = 1");
  else if (estado === "pendiente") cond.push("COALESCE(pagado, 0) = 0");
  if (from) { cond.push("fecha >= ?"); params.push(from); }
  if (to) { cond.push("fecha <= ?"); params.push(to); }
  if (q) { cond.push("(LOWER(proveedor) LIKE ? OR LOWER(concepto) LIKE ? OR numero_factura LIKE ?)"); const like = "%" + String(q).toLowerCase() + "%"; params.push(like, like, "%" + q + "%"); }
  return { where: cond.length ? "WHERE " + cond.join(" AND ") : "", params };
}

app.get("/api/facturas", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const scope = localScope(req);
    const query = scope ? { ...req.query, local: scope } : req.query;
    const { where, params } = facturasWhere(query);
    const LIMITE = 500;
    const rows = await dbAll(`SELECT * FROM facturas ${where} ORDER BY fecha DESC NULLS LAST, creado_en DESC LIMIT ${LIMITE}`, params);
    // `drive_thumb` es la miniatura en base64 y NO puede viajar en la lista: son ~8 KB por
    // factura, y con el tope de 500 serían cuatro megas de respuesta para pintar una tabla.
    // Cada fila la pide por su lado (`/api/facturas/:id/miniatura`) y el navegador la cachea.
    //
    // El estado de pago se calcula AQUÍ y no en el panel: los umbrales («vencida», «esta
    // semana») viven en un módulo puro con tests, y copiarlos al navegador sería tener dos
    // verdades que un día dejan de coincidir sin que nadie se entere.
    const hoyMad = instanteMadrid(new Date()).fecha;
    for (const r of rows) { delete r.drive_thumb; r.estado_pago = estadoPago(r, hoyMad); }
    // Los totales se calculan sobre el MISMO filtro y SIN el tope: sumar solo las filas que se
    // enseñan daría un total corto en cuanto haya más de 500, y un total corto no se nota —
    // parece que se ha gastado menos—. Es una consulta agregada, no trae filas.
    // Los albaranes NO suman: son la entrega, no el pago. Se cuentan aparte para poder decir
    // cuántos se están dejando fuera — esconderlos sin más sería otra forma de mentir.
    const t = await dbGet(
      `SELECT count(*) FILTER (WHERE ${SIN_ALBARANES})::int AS docs,
              COALESCE(SUM(base_imponible) FILTER (WHERE ${SIN_ALBARANES}),0)::float AS base,
              COALESCE(SUM(cuota_iva) FILTER (WHERE ${SIN_ALBARANES}),0)::float AS iva,
              COALESCE(SUM(total) FILTER (WHERE ${SIN_ALBARANES}),0)::float AS total,
              count(*) FILTER (WHERE ${SIN_ALBARANES} AND COALESCE(pagado,0) = 0)::int AS pendientes,
              COALESCE(SUM(total) FILTER (WHERE ${SIN_ALBARANES} AND COALESCE(pagado,0) = 0),0)::float AS por_pagar,
              count(*) FILTER (WHERE NOT (${SIN_ALBARANES}))::int AS albaranes,
              COALESCE(SUM(total) FILTER (WHERE NOT (${SIN_ALBARANES})),0)::float AS albaranes_importe,
              -- Lo que de verdad se mira al abrir Compras no es cuánto se ha gastado —eso ya
              -- pasó— sino qué hay que pagar y cuándo. Sin esto había que ir a la pestaña de
              -- Pagos para saber si algo estaba vencido.
              count(*) FILTER (WHERE ${SIN_ALBARANES} AND COALESCE(pagado,0) = 0 AND COALESCE(vencimiento,'') <> '' AND vencimiento < ?)::int AS vencidas,
              COALESCE(SUM(total) FILTER (WHERE ${SIN_ALBARANES} AND COALESCE(pagado,0) = 0 AND COALESCE(vencimiento,'') <> '' AND vencimiento < ?),0)::float AS vencido_importe,
              count(*) FILTER (WHERE ${SIN_ALBARANES} AND COALESCE(pagado,0) = 0 AND vencimiento >= ? AND vencimiento <= ?)::int AS semana,
              COALESCE(SUM(total) FILTER (WHERE ${SIN_ALBARANES} AND COALESCE(pagado,0) = 0 AND vencimiento >= ? AND vencimiento <= ?),0)::float AS semana_importe
         FROM facturas ${where}`, // OJO con el orden: los «?» se numeran por su sitio en el SQL, y estos van ANTES del WHERE.
      [hoyISO(), hoyISO(), hoyISO(), hoyMas(7), hoyISO(), hoyMas(7), ...params]);
    res.json({ ok: true, data: rows, totales: t || null, hayMas: (t?.docs || 0) > rows.length });
  } catch (e) { res.status(500).json({ ok: false, error: e.message, data: [] }); }
});

// Editar los campos de una factura (corregir lo que extrajo la IA). Re-proyecta a los Sheets.
app.patch("/api/facturas/:id", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const antes = await dbGet("SELECT local, fecha FROM facturas WHERE id = ?", [req.params.id]);
    const allowed = ["proveedor", "nif", "concepto", "fecha", "numero_factura", "tipo", "base_imponible", "porcentaje_iva", "cuota_iva", "total", "local", "empresa", "pagado"];
    // Corregir a mano tampoco puede colar un local que no existe: es la otra puerta por la
    // que entraron los «Lloret» y «BLANES» sueltos.
    if (req.body.local !== undefined && String(req.body.local || "").trim()) {
      const canon = canonizarLocal(req.body.local);
      if (!canon) return res.status(400).json({ ok: false, error: `«${req.body.local}» no es ningún establecimiento.` });
      req.body.local = canon;
    }
    const sets = [], vals = [];
    for (const k of allowed) if (req.body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(req.body[k] === "" ? null : req.body[k]); }
    if (!sets.length) return res.json({ ok: true });
    vals.push(req.params.id);
    await dbRun(`UPDATE facturas SET ${sets.join(", ")} WHERE id = ?`, vals);
    res.json({ ok: true });
    // Re-proyectar (fondo, no fatal): la pestaña vieja y la nueva si cambió local/fecha, + maestro.
    const despues = await dbGet("SELECT local, fecha FROM facturas WHERE id = ?", [req.params.id]);
    (async () => {
      try {
        const deps = { getToken: getDriveAccessToken, dbGet, dbAll, dbRun };
        if (antes && antes.local && antes.fecha) await resincronizarSheetsFactura(deps, antes.local, antes.fecha);
        if (despues && despues.local && despues.fecha && (despues.local !== antes?.local || despues.fecha !== antes?.fecha)) await resincronizarSheetsFactura(deps, despues.local, despues.fecha);
      } catch (e) { console.error("[PATCH factura] resync:", e.message); }
    })();
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Eliminar una factura (errores). Quita la fila y re-proyecta la pestaña afectada.
app.delete("/api/facturas/:id", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const row = await dbGet("SELECT local, fecha FROM facturas WHERE id = ?", [req.params.id]);
    await dbRun("DELETE FROM facturas WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
    if (row && row.local && row.fecha) {
      (async () => { try { await resincronizarSheetsFactura({ getToken: getDriveAccessToken, dbGet, dbAll, dbRun }, row.local, row.fecha); } catch (e) { console.error("[DELETE factura] resync:", e.message); } })();
    }
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Verificar y reparar: reescribe todas las pestañas y el maestro desde la BD (fuente de verdad).
app.post("/api/facturas/reparar", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try { const r = await repararTodosLosSheets({ getToken: getDriveAccessToken, dbGet, dbAll, dbRun }); res.json({ ok: true, ...r }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Export CSV de la tabla de facturas (con los mismos filtros).
// Export por filtros (GET) o de UNA SELECCIÓN concreta (POST con ids). Lo segundo hace
// falta porque lo marcado puede venir de varias búsquedas distintas y no siempre se puede
// reconstruir con un filtro.
async function facturasCsv(req, res) {
  const scope = localScope(req);
  let rows;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite).slice(0, 5000) : null;
  if (ids && ids.length) {
    rows = await dbAll(
      `SELECT fecha, numero_factura, tipo, proveedor, nif, concepto, base_imponible, porcentaje_iva, cuota_iva, total, local, empresa, pagado
       FROM facturas WHERE id = ANY(?::int[]) ${scope ? "AND local = ?" : ""} ORDER BY fecha DESC NULLS LAST`,
      scope ? [ids, scope] : [ids]);
  } else {
    const { where, params } = facturasWhere(scope ? { ...req.query, local: scope } : req.query);
    rows = await dbAll(`SELECT fecha, numero_factura, tipo, proveedor, nif, concepto, base_imponible, porcentaje_iva, cuota_iva, total, local, empresa, pagado FROM facturas ${where} ORDER BY fecha DESC NULLS LAST LIMIT 5000`, params);
  }
  // Punto y coma y BOM, como el registro de jornada: es lo que Excel en español abre a la
  // primera. Con coma, un concepto con decimales parte la fila.
  const header = ["Fecha", "Numero", "Tipo", "Proveedor", "NIF", "Concepto", "Base", "IVA%", "Cuota", "Total", "Local", "Empresa", "Pagado"];
  const c = (v) => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = rows.map((r) => [r.fecha, r.numero_factura, r.tipo, r.proveedor, r.nif, r.concepto, r.base_imponible, r.porcentaje_iva, r.cuota_iva, r.total, r.local, r.empresa, r.pagado ? "Sí" : "No"].map(c).join(";"));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="facturas${ids && ids.length ? "-seleccion" : ""}.csv"`);
  res.send("﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n");
}

app.get("/api/facturas/export.csv", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try { await facturasCsv(req, res); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.post("/api/facturas/export.csv", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try { await facturasCsv(req, res); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Subir una factura MANUALMENTE desde el panel (mismo pipeline que WhatsApp/correo/Drive).
// Subida manual: admite VARIAS facturas a la vez (campo "files"), y también el envío
// antiguo de una sola ("file"). Se procesan en secuencia (respeta límites de Drive y el
// cerrojo por hash) y se devuelve un resultado por archivo.
// Subir facturas. El encargado entra aquí también, pero SOLO a esto: el resto de rutas de
// facturas (lista, totales, configuración, qué compramos) siguen siendo de dirección y
// contabilidad. Y su local no lo elige él: se le fija el suyo, porque un encargado subiendo
// una factura al local equivocado descuadra dos locales a la vez y nadie se entera.
app.post("/api/facturas/subir", requireAuth(["direccion", "contabilidad", "encargado"]), uploadFacturaMem.fields([{ name: "files", maxCount: 30 }, { name: "file", maxCount: 1 }]), async (req, res) => {
  const archivos = [...((req.files && req.files.files) || []), ...((req.files && req.files.file) || [])];
  if (!archivos.length) return res.status(400).json({ ok: false, error: "Falta el archivo" });
  // Encargado → siempre uno de los SUYOS, venga lo que venga: `localPermitido` no deja pasar
  // un local ajeno. Lo que sí se respeta es CUÁL de los suyos, que llega en el cuerpo (aquí
  // no hay query): quien lleva dos establecimientos elige arriba y la pantalla le promete
  // «se guardará en X». Sin esto, se guardaba siempre en el principal aunque pusiera el otro
  // —una factura archivada en el local equivocado descuadra dos locales y no se ve—.
  const fijado = localScope(req, (req.query && req.query.local) || (req.body && req.body.local) || undefined);
  if (req.user.rol === "encargado" && !fijado) {
    return res.status(403).json({ ok: false, error: "Tu usuario no tiene un establecimiento asignado, así que no se sabe a qué local pertenece la factura. Pídeselo a dirección." });
  }
  const local = fijado || (req.body.local || "").trim();

  // Modo "misma factura": todas las páginas subidas se combinan en UN solo PDF
  // y se procesan como un único documento (la IA ve todas las hojas de golpe).
  const combinar = ["1", "true", "si", "sí"].includes(String(req.body.combinar || "").toLowerCase());
  if (combinar && archivos.length > 1) {
    const invalido = archivos.find((f) => !(f.mimetype === "application/pdf" || f.mimetype.startsWith("image/")));
    if (invalido) return res.status(400).json({ ok: false, error: `«${invalido.originalname}»: solo se admiten PDF o imágenes` });
    const nombre = (archivos[0].originalname || "factura").replace(/\.[^.]+$/, "") + "-completa.pdf";
    try {
      const buffer = await combinarArchivosEnPdf(archivos);
      let result;
      if (local) result = await procesarFactura({ buffer, mimeType: "application/pdf", filename: nombre, local, canal: "Manual", getToken: getDriveAccessToken, dbGet, dbAll, dbRun });
      else result = await procesarFacturaSinLocal({ buffer, mimeType: "application/pdf", filename: nombre, origen: "manual", getToken: getDriveAccessToken, dbGet, dbAll, dbRun });
      const r = { filename: nombre, paginas: archivos.length, ok: true, pendiente: !!result.pendiente, proveedor: result.datos && result.datos.proveedor, total: result.datos && result.datos.total, empresa: result.empresa, driveUrl: result.driveUrl };
      return res.json({ ok: true, total: 1, correctas: 1, resultados: [r] });
    } catch (e) {
      const r = e && e.isDuplicate
        ? { filename: nombre, ok: false, duplicate: true, error: e.message || "Esta factura ya está registrada" }
        : { filename: nombre, ok: false, error: e.message };
      return res.json({ ok: true, total: 1, correctas: 0, resultados: [r] });
    }
  }

  const resultados = [];
  for (const f of archivos) {
    const { buffer, mimetype, originalname } = f;
    if (!(mimetype === "application/pdf" || mimetype.startsWith("image/"))) {
      resultados.push({ filename: originalname, ok: false, error: "Solo se admiten PDF o imágenes" });
      continue;
    }
    try {
      let result;
      if (local) result = await procesarFactura({ buffer, mimeType: mimetype, filename: originalname, local, canal: "Manual", getToken: getDriveAccessToken, dbGet, dbAll, dbRun });
      else result = await procesarFacturaSinLocal({ buffer, mimeType: mimetype, filename: originalname, origen: "manual", getToken: getDriveAccessToken, dbGet, dbAll, dbRun });
      resultados.push({ filename: originalname, ok: true, pendiente: !!result.pendiente, proveedor: result.datos && result.datos.proveedor, total: result.datos && result.datos.total, empresa: result.empresa, driveUrl: result.driveUrl });
    } catch (e) {
      if (e && e.isDuplicate) resultados.push({ filename: originalname, ok: false, duplicate: true, error: e.message || "Esta factura ya está registrada" });
      else resultados.push({ filename: originalname, ok: false, error: e.message });
    }
  }
  const okc = resultados.filter((r) => r.ok).length;
  res.json({ ok: true, total: resultados.length, correctas: okc, resultados });
});

// Carpetas de Drive vigiladas por local (ingesta directa dejando el archivo en Drive).
function extraerFolderId(input) {
  const s = String(input || "").trim();
  const m = s.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{20,})/) || s.match(/^([a-zA-Z0-9_-]{20,})$/);
  return m ? m[1] : "";
}
app.get("/api/facturas/drive-carpetas", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try { res.json({ ok: true, data: await dbAll("SELECT local, folder_id, folder_url FROM facturas_drive_carpetas ORDER BY local") }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.post("/api/facturas/drive-carpetas", requireAuth(["direccion"]), async (req, res) => {
  const { local, folder } = req.body || {};
  const folderId = extraerFolderId(folder);
  if (!local || !folderId) return res.status(400).json({ ok: false, error: "Falta local o el enlace/ID de la carpeta" });
  const localCanon = canonizarLocal(local); // misma razón que en los grupos: el canal marca el local
  if (!localCanon) return res.status(400).json({ ok: false, error: `«${local}» no es ningún establecimiento. Elige a cuál pertenece esta carpeta.` });
  try {
    await dbRun(`INSERT INTO facturas_drive_carpetas (local, folder_id, folder_url) VALUES (?, ?, ?) ON CONFLICT(local) DO UPDATE SET folder_id = EXCLUDED.folder_id, folder_url = EXCLUDED.folder_url`,
      [localCanon, folderId, String(folder).trim()]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.delete("/api/facturas/drive-carpetas/:local", requireAuth(["direccion"]), async (req, res) => {
  try { await dbRun("DELETE FROM facturas_drive_carpetas WHERE local = ?", [req.params.local]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Estado + reconstrucción del Sheet maestro consolidado.
app.get("/api/facturas/master", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try { const id = await getConfig("drive_facturas_master_sheet_id"); res.json({ ok: true, sheet_id: id || null, url: id ? `https://docs.google.com/spreadsheets/d/${id}` : null }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.post("/api/facturas/reconstruir-maestro", requireAuth(["direccion"]), async (req, res) => {
  try { const r = await reconstruirSheetMaestro({ getToken: getDriveAccessToken, dbGet, dbAll, dbRun }); res.json({ ok: true, ...r }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.patch("/api/facturas/:id/pago", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const { id } = req.params;
    const row = await dbGet("SELECT id, pagado FROM facturas WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ ok: false, error: "Factura no encontrada" });
    const nuevoPagado = row.pagado ? 0 : 1;
    const fechaPago   = nuevoPagado ? hoyISO() : null;
    await dbRun("UPDATE facturas SET pagado = ?, fecha_pago = ? WHERE id = ?", [nuevoPagado, fechaPago, id]);
    res.json({ ok: true, pagado: nuevoPagado, fecha_pago: fechaPago });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

/**
 * Marcar VARIAS como pagadas (o como sin pagar) de una vez.
 *
 * El de arriba (`/:id/pago`) es un interruptor: vale para una fila, pero para veinte no —al
 * conmutar cada una, las que ya estaban pagadas se quedarían sin pagar—. Aquí el estado se
 * dice, no se conmuta: es lo que se quiere cuando llega el recibo del banco y se marcan de
 * golpe las diez facturas de ese proveedor.
 */
app.post("/api/facturas/pago-lote", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger);
    if (!ids.length) return res.status(400).json({ ok: false, error: "No hay documentos elegidos" });
    if (ids.length > 500) return res.status(400).json({ ok: false, error: "Demasiados de una vez (máximo 500)" });
    const pagado = req.body?.pagado ? 1 : 0;
    // La fecha de pago se pone al marcar y se borra al desmarcar: dejarla puesta en una que
    // vuelve a estar pendiente diría que se pagó un día que no se pagó.
    const fechaPago = pagado ? hoyISO() : null;
    // Solo las que pueda tocar: un encargado no marca las de otro establecimiento.
    const suyas = await dbAll(`SELECT id, local FROM facturas WHERE id = ANY(?)`, [ids]);
    const permitidas = suyas.filter((f) => puedeAccederLocal(req, f.local)).map((f) => f.id);
    if (!permitidas.length) return res.status(403).json({ ok: false, error: "No puedes tocar esos documentos" });
    await dbRun(`UPDATE facturas SET pagado = ?, fecha_pago = ? WHERE id = ANY(?)`, [pagado, fechaPago, permitidas]);
    res.json({ ok: true, tocadas: permitidas.length, pagado });
  } catch (e) {
    console.error("[facturas] pago en lote:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cambiar el estado de pago" });
  }
});

app.get("/api/facturas/email-reglas", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const rows = await dbAll("SELECT * FROM facturas_email_reglas ORDER BY email", []);
  res.json({ ok: true, data: rows });
});

app.post("/api/facturas/email-reglas", requireAuth(["direccion"]), async (req, res) => {
  const { email, local } = req.body;
  if (!email || !local) return res.status(400).json({ ok: false, error: "Faltan email o local" });
  const localCanon = canonizarLocal(local); // tercera puerta de entrada, misma regla
  if (!localCanon) return res.status(400).json({ ok: false, error: `«${local}» no es ningún establecimiento. Elige a cuál pertenece este remitente.` });
  try {
    await dbRun(
      "INSERT INTO facturas_email_reglas (email, local) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET local = EXCLUDED.local",
      [email.trim().toLowerCase(), localCanon]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/facturas/email-reglas/:id", requireAuth(["direccion"]), async (req, res) => {
  await dbRun("DELETE FROM facturas_email_reglas WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

app.get("/api/facturas/locales", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const rows = await dbAll("SELECT * FROM facturas_locales ORDER BY empresa, local", []);
  res.json({ ok: true, data: rows });
});

app.post("/api/facturas/locales", requireAuth(["direccion"]), async (req, res) => {
  const { local, empresa, cif, local_contable } = req.body;
  if (!local || !empresa) return res.status(400).json({ ok: false, error: "Faltan local o empresa" });
  try {
    await dbRun(
      `INSERT INTO facturas_locales (local, empresa, cif, local_contable) VALUES (?, ?, ?, ?)
       ON CONFLICT(local) DO UPDATE SET empresa = EXCLUDED.empresa, cif = EXCLUDED.cif, local_contable = EXCLUDED.local_contable`,
      [local, empresa.trim(), (cif || "").trim() || null, (local_contable || "").trim() || null]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/facturas/locales/:local", requireAuth(["direccion"]), async (req, res) => {
  await dbRun("DELETE FROM facturas_locales WHERE local = ?", [decodeURIComponent(req.params.local)]);
  res.json({ ok: true });
});

app.get("/api/facturas/pendientes", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const rows = await dbAll("SELECT * FROM facturas_pendientes ORDER BY creado_en DESC", []);
  // Enriquecer cada pendiente con una sugerencia de local (para preseleccionar en el panel).
  let locales = [], historial = {};
  try {
    locales = await dbAll("SELECT local, empresa, cif, local_contable FROM facturas_locales", []);
    historial = indexarHistorialProveedor(await dbAll("SELECT proveedor, local FROM facturas WHERE proveedor IS NOT NULL", []));
  } catch (e) { console.error("[pendientes] sugerencia:", e.message); }
  const data = rows.map((p) => ({ ...p, sugerido: sugerirLocalPendiente({ pendiente: p, locales, historial }) }));
  res.json({ ok: true, data });
});

// Vista previa del archivo pendiente SIN salir del panel: hacemos de proxy del fichero de
// Drive (el navegador no puede mandar el token de Google). Se sirve desde nuestro dominio.
app.get("/api/facturas/pendientes/:id/archivo", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const p = await dbGet("SELECT drive_file_id FROM facturas_pendientes WHERE id = ?", [req.params.id]);
    if (!p || !p.drive_file_id) return res.status(404).json({ ok: false, error: "No encontrado" });
    const token = await getDriveAccessToken();
    const meta = await (await fetch(`https://www.googleapis.com/drive/v3/files/${p.drive_file_id}?fields=mimeType,name`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const mime = meta.mimeType || "application/pdf";
    const dl = await fetch(`https://www.googleapis.com/drive/v3/files/${p.drive_file_id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
    if (!dl.ok) return res.status(502).json({ ok: false, error: "No se pudo leer el archivo de Drive" });
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(meta.name || "factura")}"`);
    const buf = Buffer.from(await dl.arrayBuffer());
    res.end(buf);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/**
 * EL DOCUMENTO DE UNA FACTURA, el original. La miniatura de abajo sirve para reconocerla de un
 * vistazo; esto es el papel entero, para verlo grande o guardarlo.
 *
 * Va por nuestro proxy y no por el enlace de Drive porque el navegador no puede mandarle a
 * Google nuestro token de servicio — y porque así el permiso lo decide esta casa: el encargado
 * de Blanes no se descarga una factura de Lloret escribiendo el id en la barra.
 */
async function archivoDeFactura(f) {
  const fileId = idDeDriveUrl(f.drive_url);
  if (!fileId) return null;
  const token = await getDriveAccessToken();
  const meta = await (await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
    { headers: { Authorization: `Bearer ${token}` } })).json();
  const dl = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!dl.ok) return null;
  return { mime: meta.mimeType || "application/pdf", nombre: meta.name || "factura",
    datos: Buffer.from(await dl.arrayBuffer()) };
}

app.get("/api/facturas/:id/archivo", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const f = await dbGet("SELECT id, local, proveedor, fecha, numero_factura, drive_url FROM facturas WHERE id = ?", [Number(req.params.id)]);
    if (!f) return res.status(404).json({ ok: false, error: "Factura no encontrada" });
    if (!puedeAccederLocal(req, f.local)) return res.status(403).json({ ok: false, error: "Sin acceso" });
    if (!f.drive_url) return res.status(404).json({ ok: false, error: "Esta factura no tiene archivo guardado" });
    const a = await archivoDeFactura(f);
    if (!a) return res.status(502).json({ ok: false, error: "No se pudo leer el archivo de Drive" });
    const ext = (a.mime.split("/")[1] || "pdf").replace("jpeg", "jpg");
    res.setHeader("Content-Type", a.mime);
    res.setHeader("Content-Disposition",
      `${req.query.descargar ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nombreDeFactura(f, ext))}`);
    res.end(a.datos);
  } catch (e) {
    console.error("[facturas] archivo:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo descargar" });
  }
});

/**
 * VARIAS FACTURAS, EN UN ZIP. «Exportar» tenía que dar los papeles y daba una hoja de cálculo:
 * lo que se le manda al gestor son las facturas, no una tabla con sus números.
 *
 * El ZIP se escribe a mano (src/modules/facturas/zip.js) porque aquí no se pueden añadir
 * dependencias. Se topa a 60 documentos por tanda: se monta entero en memoria y una tanda de
 * trescientos PDF tumbaría el servidor justo cuando más falta hace.
 */
const TOPE_ZIP = 60;
app.post("/api/facturas/export.zip", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger);
    if (!ids.length) return res.status(400).json({ ok: false, error: "No hay documentos elegidos" });
    if (ids.length > TOPE_ZIP) return res.status(400).json({ ok: false, error: `Máximo ${TOPE_ZIP} documentos por descarga. Filtra un poco más.` });
    const filas = await dbAll(
      `SELECT id, local, proveedor, fecha, numero_factura, drive_url FROM facturas WHERE id = ANY(?) ORDER BY fecha, id`, [ids]);
    const mias = filas.filter((f) => puedeAccederLocal(req, f.local) && f.drive_url);
    if (!mias.length) return res.status(404).json({ ok: false, error: "Ninguno de esos documentos tiene archivo guardado" });

    const archivos = [];
    const fallidas = [];
    for (const f of mias) {
      try {
        const a = await archivoDeFactura(f);
        if (!a) { fallidas.push(f.numero_factura || f.id); continue; }
        archivos.push({ nombre: nombreDeFactura(f, (a.mime.split("/")[1] || "pdf").replace("jpeg", "jpg")), datos: a.datos });
      } catch { fallidas.push(f.numero_factura || f.id); }
    }
    if (!archivos.length) return res.status(502).json({ ok: false, error: "No se pudo traer ningún archivo de Drive" });

    const zip = crearZip(archivos, { fecha: new Date() });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="facturas-${archivos.length}.zip"`);
    // Cuántas se han quedado fuera, en una cabecera: el ZIP se descarga igual, pero el panel
    // puede decirlo. Un archivo con menos facturas de las pedidas y sin avisar es una trampa.
    res.setHeader("X-Faltan", String(fallidas.length));
    res.end(zip);
  } catch (e) {
    console.error("[facturas] export zip:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo preparar la descarga" });
  }
});

// ── Miniatura de la factura ─────────────────────────────────────────────────
// Una lista de facturas es una lista de papeles, y un papel se reconoce por su pinta antes que
// por su número. Con la miniatura al lado, «esa es la de Grau» se ve sin leer.
//
// POR QUÉ UN PROXY Y NO GUARDAR EL ENLACE: el `thumbnailLink` que da Drive CADUCA en unas horas
// y depende de la sesión. Guardarlo daría una lista llena de imágenes rotas al día siguiente —y
// rotas en silencio—. Se guarda la IMAGEN, no el enlace, y se sirve desde nuestro dominio (el
// navegador no puede mandar el token de Google). Mismo patrón que la vista previa de pendientes.
//
// La caché es de usar y tirar: si se borra la columna, se vuelve a pedir y ya está.
app.get("/api/facturas/:id/miniatura", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const f = await dbGet("SELECT id, local, drive_url, drive_thumb FROM facturas WHERE id = ?", [Number(req.params.id)]);
    if (!f) return res.status(404).end();
    const scope = localScope(req);
    if (scope && f.local !== scope && !puedeAccederLocal(req, f.local)) return res.status(403).end();

    const enviar = (b64) => {
      // Un día de caché en el navegador: la miniatura de una factura no cambia nunca.
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.end(Buffer.from(b64, "base64"));
    };
    if (f.drive_thumb) return enviar(f.drive_thumb);

    const fileId = idDeDriveUrl(f.drive_url);
    if (!fileId) return res.status(404).end();
    const token = await getDriveAccessToken();
    const meta = await (await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink`,
      { headers: { Authorization: `Bearer ${token}` } })).json();
    if (!meta || !meta.thumbnailLink) return res.status(404).end();
    // `=s220` pide una miniatura pequeña: son 5-10 KB en vez de 200, y en una fila de tabla no
    // se va a ver más grande de 40 px.
    const url = String(meta.thumbnailLink).replace(/=s\d+.*$/, "") + "=s220";
    const img = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!img.ok) return res.status(404).end();
    const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    await dbRun("UPDATE facturas SET drive_thumb = ? WHERE id = ?", [b64, f.id]).catch(() => {});
    return enviar(b64);
  } catch (e) {
    // Que falte una miniatura no puede ensuciar el log ni romper la fila: 404 y a otra cosa.
    return res.status(404).end();
  }
});

// Campos de la factura que el panel puede corregir al asignar (se persisten en BD/Sheets).
const CAMPOS_PENDIENTE_EDITABLES = ["tipo", "fecha", "numero_factura", "proveedor", "nif", "concepto", "base_imponible", "porcentaje_iva", "cuota_iva", "total"];
function mergePendienteEditado(pendiente, body) {
  const out = { ...pendiente };
  for (const k of CAMPOS_PENDIENTE_EDITABLES) {
    if (body[k] === undefined) continue;
    if (["base_imponible", "porcentaje_iva", "cuota_iva", "total"].includes(k)) {
      const n = body[k] === "" || body[k] === null ? null : Number(body[k]);
      out[k] = Number.isFinite(n) ? n : out[k];
    } else {
      out[k] = body[k] === null ? out[k] : String(body[k]).trim();
    }
  }
  return out;
}

app.post("/api/facturas/pendientes/:id/asignar", requireAuth(["direccion"]), async (req, res) => {
  let { local } = req.body || {};
  // «Toda la empresa»: el papel se archiva bajo uno de sus locales —en algún sitio tiene que
  // vivir— pero la factura queda marcada para repartirse entre todos al sumar por local.
  const repartoEmpresa = req.body?.reparto === "empresa";
  if (repartoEmpresa) {
    const suyos = await dbAll(`SELECT local FROM facturas_locales WHERE empresa = ? ORDER BY local`, [String(req.body?.empresa || "")]);
    if (!suyos.length) return res.status(400).json({ ok: false, error: "Esa empresa no tiene locales configurados en Compras → Configuración." });
    local = suyos[0].local;
  }
  if (!local) return res.status(400).json({ ok: false, error: "Falta local" });
  const pendienteBD = await dbGet("SELECT * FROM facturas_pendientes WHERE id = ?", [req.params.id]);
  if (!pendienteBD) return res.status(404).json({ ok: false, error: "No encontrado" });
  // Si el usuario corrigió datos en el modal, se aplican antes de asignar (van a BD y Sheet).
  const pendiente = mergePendienteEditado(pendienteBD, req.body || {});
  try {
    const result = await asignarFacturaPendiente({ pendiente, local, reparto: repartoEmpresa ? "empresa" : null, getToken: getDriveAccessToken, dbGet, dbAll, dbRun, backupFn: null });
    res.json({ ok: true, ...result });
    // Asegura Sheets por local + maestro consistentes con la BD (fondo, no fatal).
    (async () => { try { await resincronizarSheetsFactura({ getToken: getDriveAccessToken, dbGet, dbAll, dbRun }, local, pendiente.fecha); } catch (e) { console.error("[asignar] resync:", e.message); } })();
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Fusionar varias facturas pendientes en un único documento: son páginas de la
// MISMA factura que entraron por separado (dos fotos, dos correos…). Se descargan
// de Drive, se combinan en un PDF, se re-extraen los datos viendo todas las hojas,
// y los registros/archivos antiguos se eliminan.
app.post("/api/facturas/pendientes/fusionar", requireAuth(["direccion"]), async (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
  if (ids.length < 2) return res.status(400).json({ ok: false, error: "Elige al menos 2 documentos para fusionar" });
  try {
    const pendientes = [];
    for (const id of ids) {
      const p = await dbGet("SELECT * FROM facturas_pendientes WHERE id = ?", [id]);
      if (!p) return res.status(404).json({ ok: false, error: `Pendiente #${id} no encontrado` });
      if (!p.drive_file_id) return res.status(400).json({ ok: false, error: `Pendiente #${id} no tiene archivo en Drive` });
      pendientes.push(p);
    }
    const token = await getDriveAccessToken();
    const archivos = [];
    for (const p of pendientes) {
      const meta = await (await fetch(`https://www.googleapis.com/drive/v3/files/${p.drive_file_id}?fields=mimeType,name`, { headers: { Authorization: `Bearer ${token}` } })).json();
      const dl = await fetch(`https://www.googleapis.com/drive/v3/files/${p.drive_file_id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
      if (!dl.ok) return res.status(502).json({ ok: false, error: `No se pudo descargar de Drive el pendiente #${p.id}` });
      archivos.push({ buffer: Buffer.from(await dl.arrayBuffer()), mimetype: meta.mimeType || "application/pdf", originalname: meta.name || `pendiente-${p.id}` });
    }
    const buffer = await combinarArchivosEnPdf(archivos);

    // PRIMERO se crea el documento fusionado; los registros viejos solo se borran
    // cuando el nuevo existe. Si algo falla aquí, no se pierde nada: los pendientes
    // originales siguen intactos en BD y en Drive. (El hash del PDF combinado es
    // distinto al de los originales, así que la deduplicación no lo bloquea.)
    let result;
    try {
      result = await procesarFacturaSinLocal({ buffer, mimeType: "application/pdf", filename: "factura-fusionada.pdf", origen: "fusion", getToken: getDriveAccessToken, dbGet, dbAll, dbRun });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "No se pudo procesar el documento fusionado (no se ha borrado nada): " + e.message });
    }

    // Documento nuevo creado con éxito → retirar los registros y archivos viejos.
    for (const p of pendientes) await dbRun("DELETE FROM facturas_pendientes WHERE id = ?", [p.id]);
    const noRetirados = [];
    for (const p of pendientes) {
      try {
        const tr = await fetch(`https://www.googleapis.com/drive/v3/files/${p.drive_file_id}`, {
          method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ trashed: true }),
        });
        if (!tr.ok) throw new Error(`HTTP ${tr.status}`);
      } catch (e) {
        noRetirados.push(p.drive_file_id);
        console.error(`[fusionar] No se pudo retirar de Drive ${p.drive_file_id}:`, e.message);
      }
    }
    if (noRetirados.length) console.error(`[fusionar] Quedan ${noRetirados.length} archivo(s) viejos sin retirar en Drive (revisar a mano):`, noRetirados.join(", "));

    res.json({ ok: true, paginas: archivos.length, pendiente: !!result.pendiente, proveedor: result.datos && result.datos.proveedor, total: result.datos && result.datos.total, empresa: result.empresa, driveUrl: result.driveUrl, drive_sin_retirar: noRetirados.length || undefined });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Empezar de cero: limpia TODO el estado de facturas en la BD (no borra archivos de Drive,
// eso se hace a mano). Deja el sistema listo para volcar desde cero, sin referencias colgando.
app.post("/api/facturas/reset-test", requireAuth(["direccion"]), async (req, res) => {
  try {
    await dbRun("DELETE FROM facturas");
    await dbRun("DELETE FROM facturas_pendientes");
    await dbRun("DELETE FROM facturas_emails_procesados");
    try { await dbRun("DELETE FROM facturas_drive_procesados"); } catch { /* tabla nueva */ }
    await dbRun("UPDATE facturas_grupos SET sheet_id = NULL, sheet_url = NULL");
    await dbRun("DELETE FROM config WHERE key = 'drive_facturas_root_id'");
    await dbRun("DELETE FROM config WHERE key = 'drive_facturas_master_sheet_id'");
    // Con la BD ya limpia, aseguramos los índices únicos por hash (evitan duplicados de raíz).
    try { await dbRun("CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_hash ON facturas(file_hash) WHERE file_hash IS NOT NULL"); } catch (e) { console.error("[reset] uq_facturas_hash:", e.message); }
    try { await dbRun("CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_pend_hash ON facturas_pendientes(file_hash) WHERE file_hash IS NOT NULL"); } catch (e) { console.error("[reset] uq_pend_hash:", e.message); }
    res.json({ ok: true, mensaje: "Base de datos de facturas limpiada. Ahora borra el contenido de Drive (y los Sheets si quieres) y vuelve a subir." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/facturas/migrar-estructura", requireAuth(["direccion"]), async (req, res) => {
  try {
    const resultado = await migrarEstructuraDrive({ getToken: getDriveAccessToken, dbAll, dbGet });
    res.json({ ok: true, ...resultado });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/facturas/gmail-status", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const token = await getConfig("google_drive_refresh_token");
  const ultimosEmails = await dbAll("SELECT * FROM facturas_emails_procesados ORDER BY procesado DESC LIMIT 20", []);
  res.json({ ok: true, conectado: !!token, emails: ultimosEmails });
});

// ── Estadísticas y Modelo 303 ─────────────────────────────────────────────

app.get("/api/facturas/empresas", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT DISTINCT empresa FROM facturas_locales WHERE empresa IS NOT NULL AND empresa != '' ORDER BY empresa`, []
    );
    res.json({ ok: true, data: rows.map(r => r.empresa) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/facturas/stats", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const año = req.query.año || new Date().getFullYear();
    // Ámbito de establecimiento: el del selector del panel (?local=), salvo que el usuario
    // tenga uno fijado (encargado), que manda siempre. Sin ámbito = todo el grupo.
    const local = localScope(req) || String(req.query.local || "").trim();
    const andLocal = local ? " AND local = ?" : "";
    const p = local ? [String(año), local] : [String(año)];
    const [mensual, topProveedores, porLocal, resumenAnual] = await Promise.all([
      dbAll(
        `SELECT local, TO_CHAR(fecha::date, 'MM') AS mes,
           COUNT(*) AS num,
           ROUND(SUM(COALESCE(total,0))::NUMERIC, 2) AS total,
           ROUND(SUM(COALESCE(base_imponible,0))::NUMERIC, 2) AS base,
           ROUND(SUM(COALESCE(cuota_iva,0))::NUMERIC, 2) AS iva
         FROM facturas
         WHERE ${SIN_ALBARANES} AND TO_CHAR(fecha::date, 'YYYY') = ? AND fecha IS NOT NULL${andLocal}
         GROUP BY local, mes ORDER BY local, mes`,
        p
      ),
      dbAll(
        `SELECT MIN(proveedor) AS proveedor, COUNT(*) AS num, ROUND(SUM(COALESCE(total,0))::NUMERIC, 2) AS total
         FROM facturas
         WHERE ${SIN_ALBARANES} AND TO_CHAR(fecha::date, 'YYYY') = ? AND proveedor IS NOT NULL AND TRIM(proveedor) != ''${andLocal}
         GROUP BY LOWER(TRIM(proveedor))
         ORDER BY total DESC LIMIT 10`,
        p
      ),
      dbAll(
        // El gasto de empresa se saca de aquí y se reparte aparte: si contara entero al local
        // donde está archivado, ese local cargaría con la gestoría de los tres.
        `SELECT local, COUNT(*) AS num, ROUND(SUM(COALESCE(total,0))::NUMERIC, 2) AS total
         FROM facturas
         WHERE ${SIN_ALBARANES} AND COALESCE(reparto,'') <> 'empresa' AND TO_CHAR(fecha::date, 'YYYY') = ?${andLocal}
         GROUP BY local ORDER BY total DESC`,
        p
      ),
      dbGet(
        `SELECT COUNT(*) AS num_docs,
           ROUND(SUM(COALESCE(base_imponible,0))::NUMERIC, 2) AS base,
           ROUND(SUM(COALESCE(cuota_iva,0))::NUMERIC, 2) AS iva,
           ROUND(SUM(COALESCE(total,0))::NUMERIC, 2) AS total
         FROM facturas WHERE ${SIN_ALBARANES} AND TO_CHAR(fecha::date, 'YYYY') = ?${andLocal}`,
        p
      )
    ]);
    // ── El gasto que es de toda una empresa, repartido entre sus locales ──────
    // Elegido: proporcional a las ventas de cada local. Con un freno: si a alguno le faltan
    // las ventas del año, se reparte a partes iguales entre todos —dejarlo fuera concentraría
    // el gasto en los demás, y eso no es más justo, es un número falso—. Y se DICE con qué se
    // ha repartido, porque un número repartido sin explicación parece un número medido.
    const deEmpresa = await dbAll(
      `SELECT empresa, ROUND(SUM(COALESCE(total,0))::NUMERIC, 2) AS total
         FROM facturas
        WHERE ${SIN_ALBARANES} AND reparto = 'empresa' AND TO_CHAR(fecha::date, 'YYYY') = ?
        GROUP BY empresa`, [String(año)]).catch(() => []);
    let repartos = [], sinRepartir = [];
    if (deEmpresa.length) {
      const [locEmp, ventas] = await Promise.all([
        dbAll(`SELECT local, empresa FROM facturas_locales`).catch(() => []),
        dbAll(`SELECT local, COALESCE(SUM(ventas),0)::float AS ventas FROM ventas_diarias
                WHERE TO_CHAR(dia::date, 'YYYY') = ? GROUP BY local`, [String(año)]).catch(() => []),
      ]);
      const r = imputarGastoEmpresa({ base: porLocal, deEmpresa, locEmp, ventas });
      repartos = r.repartos; sinRepartir = r.sinRepartir;
      porLocal.length = 0;
      porLocal.push(...r.porLocal);
      // Con un local en el filtro, solo interesa el suyo.
      if (local) { const suyo = porLocal.filter((x) => x.local === local); porLocal.length = 0; porLocal.push(...suyo); }
    }
    res.json({ ok: true, data: { mensual, topProveedores, porLocal, resumenAnual, repartos, sinRepartir, año, local: local || null } });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/facturas/modelo303", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const { empresa, año = new Date().getFullYear(), trimestre } = req.query;
    if (!empresa || !trimestre) return res.json({ ok: false, error: "Faltan parámetros: empresa y trimestre" });
    const q = parseInt(trimestre);
    if (q < 1 || q > 4) return res.json({ ok: false, error: "Trimestre debe ser 1, 2, 3 o 4" });

    const mesInicio = (q - 1) * 3 + 1;
    const mesFin    = q * 3;
    const fechaInicio = `${año}-${String(mesInicio).padStart(2, "0")}-01`;
    const fechaFin    = `${año}-${String(mesFin).padStart(2, "0")}-31`;

    const [porTipoIva, totales, otrosDocs, locales] = await Promise.all([
      dbAll(
        `SELECT
           CAST(ROUND(COALESCE(porcentaje_iva, 0)) AS INTEGER) AS tipo_iva,
           COUNT(*) AS num_docs,
           ROUND(SUM(COALESCE(base_imponible, 0))::NUMERIC, 2) AS base_total,
           ROUND(SUM(COALESCE(cuota_iva, 0))::NUMERIC, 2) AS cuota_total
         FROM facturas
         WHERE empresa = ? AND fecha BETWEEN ? AND ? AND LOWER(tipo) = 'factura'
         GROUP BY CAST(ROUND(COALESCE(porcentaje_iva, 0)) AS INTEGER)
         ORDER BY tipo_iva`,
        [empresa, fechaInicio, fechaFin]
      ),
      dbGet(
        `SELECT
           COUNT(*) AS num_facturas,
           ROUND(SUM(COALESCE(base_imponible, 0))::NUMERIC, 2) AS base_total,
           ROUND(SUM(COALESCE(cuota_iva, 0))::NUMERIC, 2) AS cuota_total,
           ROUND(SUM(COALESCE(total, 0))::NUMERIC, 2) AS importe_total
         FROM facturas
         WHERE empresa = ? AND fecha BETWEEN ? AND ? AND LOWER(tipo) = 'factura'`,
        [empresa, fechaInicio, fechaFin]
      ),
      dbGet(
        `SELECT COUNT(*) AS num_otros, ROUND(SUM(COALESCE(total, 0))::NUMERIC, 2) AS total_otros
         FROM facturas
         WHERE empresa = ? AND fecha BETWEEN ? AND ? AND LOWER(tipo) != 'factura'`,
        [empresa, fechaInicio, fechaFin]
      ),
      dbAll(
        `SELECT DISTINCT local FROM facturas
         WHERE empresa = ? AND fecha BETWEEN ? AND ? ORDER BY local`,
        [empresa, fechaInicio, fechaFin]
      )
    ]);

    res.json({
      ok: true,
      data: {
        porTipoIva, totales, otrosDocs,
        locales: locales.map(l => l.local),
        empresa, año: parseInt(año), trimestre: q, fechaInicio, fechaFin
      }
    });
  } catch (e) {
    console.error("[Modelo 303]", e);
    res.json({ ok: false, error: e.message });
  }
});

// OAuth routes
app.get("/auth/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(500).send("GOOGLE_CLIENT_ID no configurado");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/business.manage");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  res.redirect(url.toString());
});

app.get("/auth/google/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`Error Google OAuth: ${error}`);
  if (!code) return res.send("Sin código de autorización");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code"
    })
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.refresh_token) {
    return res.send("Error: Google no devolvió refresh_token. Ve a <a href='https://myaccount.google.com/permissions'>https://myaccount.google.com/permissions</a>, revoca el acceso a esta app y vuelve a intentarlo.");
  }

  await setConfig("google_refresh_token", tokenData.refresh_token);

  try {
    const r = await runReviewsSync(); // fallback automático Business → Places
    res.redirect(`/panel/?google=connected&source=${r.source}&n=${r.imported + r.updated}`);
  } catch (e) {
    console.error("[Google Reviews] callback sync:", e.message);
    const msg = encodeURIComponent(String(e.message || "").slice(0, 200));
    res.redirect(`/panel/?google=token_ok&err=${msg}`);
  }
});

app.get("/api/google/status", async (req, res) => {
  const token = await getConfig("google_refresh_token");
  const count = await dbGet("SELECT COUNT(*) as n FROM google_reviews");
  const placesCount = await contarPlaceIds();
  const status = {
    connected: !!token,
    reviews_count: parseInt(count?.n || 0),
    last_fetch: (await getConfig("reviews_last_ok")) || (await getConfig("reviews_last_fetch")) || null, // última sincronización correcta
    last_attempt: (await getConfig("reviews_last_attempt")) || null, // último intento
    source: (await getConfig("reviews_last_source")) || null,
    reason: (await getConfig("reviews_last_reason")) || null,
    businessProfileError: (await getConfig("reviews_last_bp_error")) || null,
    last_error: (await getConfig("reviews_last_error")) || null,
    places_configured: placesCount,
    places_key_set: !!GOOGLE_PLACES_API_KEY,
  };
  res.json({ ...status, mensaje: mensajeEstadoReseñas(status) });
});

app.get("/api/reviews", async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 20, 50);
  const rating = parseInt(req.query.rating) || 4;
  try {
    const rows = await dbAll(
      `SELECT * FROM google_reviews WHERE rating >= ? AND text != '' ORDER BY fecha DESC LIMIT ?`,
      [rating, limit]
    );
    res.json({ ok: true, data: rows });
  } catch {
    res.status(500).json({ ok: false, data: [] });
  }
});

app.post("/api/reviews/refresh", requireAuth(["direccion", "marketing"]), async (req, res) => {
  // Dirección puede forzar (bypass del límite) para poder probar tras un cambio.
  const force = !!(req.body && req.body.force) && req.user && req.user.rol === "direccion";
  const lastFetch = await getConfig("reviews_last_fetch");
  if (lastFetch && !force) {
    const minsAgo = (Date.now() - new Date(lastFetch).getTime()) / 60000;
    if (minsAgo < 30) {
      return res.status(429).json({ ok: false, error: `Espera ${Math.ceil(30 - minsAgo)} min antes de volver a actualizar.` });
    }
  }
  try {
    const r = await runReviewsSync();
    res.json({ ok: true, source: r.source, imported: r.imported, updated: r.updated, reason: r.reason, businessProfileError: r.businessProfileError, errors: r.errors });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/places/config", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const raw = await getConfig("places_ids");
  res.json({ ok: true, data: raw ? JSON.parse(raw) : [] });
});

app.post("/api/places/config", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const { locations } = req.body;
  if (!Array.isArray(locations)) return res.status(400).json({ ok: false, error: "locations debe ser array" });
  await setConfig("places_ids", JSON.stringify(locations));
  res.json({ ok: true });
});

// ── Auto-descubrimiento de fichas de Google (sin copiar Place IDs a mano) ──────
// Lista las ubicaciones de Business Profile de la cuenta conectada (con metadata.placeId).
async function listarUbicacionesBusiness() {
  const token = await getGoogleAccessToken();
  const h = { Authorization: `Bearer ${token}` };
  const accRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: h });
  const accData = await accRes.json().catch(() => ({}));
  if (!accRes.ok || accData.error) throw new Error(detectarMotivoGoogle(accRes.status, accData));
  const out = [];
  for (const account of (accData.accounts || [])) {
    const locRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress,metadata`, { headers: h });
    const locData = await locRes.json().catch(() => ({}));
    for (const loc of (locData.locations || [])) { const c = normalizarUbicacionBP(loc); if (c && c.place_id) out.push(c); }
  }
  return out;
}
// Busca fichas por texto (nombre + ciudad) con Places Text Search — no necesita cuota Business.
async function buscarPlacesTextSearch(query) {
  if (!GOOGLE_PLACES_API_KEY || !query) return [];
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_PLACES_API_KEY}&language=es&region=es`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({ status: "PARSE_ERROR" }));
  if (data.status !== "OK") return [];
  return (data.results || []).slice(0, 6).map(normalizarPlaceResult).filter((c) => c && c.place_id);
}
// Upsert de la ficha vinculada a un local en places_ids (no pisa otros locales).
async function upsertPlaceLocal(entry) {
  const raw = await getConfig("places_ids");
  let arr = []; try { arr = raw ? JSON.parse(raw) : []; } catch { arr = []; }
  const nuevo = upsertPlaceEntry(arr, entry);
  await setConfig("places_ids", JSON.stringify(nuevo));
  return nuevo;
}

// Descubre automáticamente las fichas de Google para cada local del ERP.
app.get("/api/reviews/descubrir-fichas", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const raw = await getConfig("places_ids");
    let saved = []; try { saved = raw ? JSON.parse(raw) : []; } catch { saved = []; }
    const savedMap = Object.fromEntries(saved.filter((l) => l && l.name).map((l) => [l.name, l]));
    let bpLocs = null, bpError = null;
    if (await getConfig("google_refresh_token")) {
      try { bpLocs = await listarUbicacionesBusiness(); } catch (e) { bpError = e.message; }
    }
    const usaBP = Array.isArray(bpLocs) && bpLocs.length > 0;
    const data = [];
    for (const local of SARA_LOCALES) {
      let candidatos = [];
      if (usaBP) candidatos = bpLocs;                                   // fichas de la cuenta (elige la correcta)
      else if (GOOGLE_PLACES_API_KEY) candidatos = await buscarPlacesTextSearch(queryTextSearch(local));
      data.push({ local, vinculado: savedMap[local] || null, candidatos, sugerido: elegirSugerido(candidatos) });
    }
    res.json({ ok: true, data, fuente: usaBP ? "business_profile" : (GOOGLE_PLACES_API_KEY ? "places" : "none"), bpError, places_key_set: !!GOOGLE_PLACES_API_KEY });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Vincula una ficha de Google a un local del ERP (guarda place_id, location_id, nombre, dirección).
app.post("/api/reviews/vincular-ficha", requireAuth(["direccion"]), async (req, res) => {
  const { local, place_id, google_location_id, name, address } = req.body || {};
  if (!local || !place_id) return res.status(400).json({ ok: false, error: "Faltan local y place_id" });
  try {
    const arr = await upsertPlaceLocal({ name: local, placeId: place_id, google_location_id, official_name: name, address });
    res.json({ ok: true, total: arr.filter((l) => l && l.placeId).length });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Reseñas: gestión interna por local + respuesta en MODO BORRADOR ──────────────
// Nota: el /api/reviews público (web) NO se toca. Este endpoint devuelve TODAS las reseñas
// (incluidas las negativas, que son las que más interesa responder), con filtro por local.
app.get("/api/reviews/manage", requireAuth(["direccion", "encargado", "contabilidad", "marketing"]), async (req, res) => {
  try {
    // Ámbito por local. Es el ÚNICO camino por el que entra el establecimiento: nuestro nombre
    // («La Tapeta - Blanes») se traduce aquí a los nombres de ficha de Google que le
    // correspondan («Blanes»), porque comparar los dos textos a pelo no casa nunca.
    // `localScope` ya devuelve lo que pide dirección y lo que le toca al encargado.
    const scope = localScope(req);
    let scopeCond = "", scopeParams = [], fichas = [];
    if (scope) {
      const allNames = (await dbAll(`SELECT DISTINCT location_name FROM google_reviews WHERE location_name IS NOT NULL AND location_name <> ''`)).map((r) => r.location_name);
      fichas = locationNamesDeLocal(scope, allNames);
      scopeCond = fichas.length ? `location_name IN (${fichas.map(() => "?").join(",")})` : "1=0";
      scopeParams = fichas.length ? fichas : [];
    }
    // Sin ficha que case, la respuesta correcta es CERO reseñas — pero hay que decirlo, o
    // parece que el establecimiento no tiene ninguna cuando lo que pasa es que su ficha de
    // Google no está vinculada.
    const sinFicha = !!scope && fichas.length === 0;
    const withScope = (whereStr) => scopeCond ? (whereStr && whereStr.trim() ? `${whereStr} AND ${scopeCond}` : `WHERE ${scopeCond}`) : whereStr;
    const scopeAnd = scopeCond ? `AND ${scopeCond}` : "";

    const q = buildManageQuery(req.query);
    const where = withScope(q.where); const params = [...q.params, ...scopeParams]; const orderBy = q.orderBy;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const rows = await dbAll(`SELECT * FROM google_reviews ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const data = (rows || []).map(mapManageRow);
    // Contadores sobre TODO el conjunto filtrado (no solo la página).
    const c = await dbGet(`SELECT COUNT(*) AS n,
        SUM(CASE WHEN reply IS NULL OR reply = '' THEN 1 ELSE 0 END) AS pend,
        SUM(CASE WHEN reply IS NOT NULL AND reply <> '' THEN 1 ELSE 0 END) AS resp
      FROM google_reviews ${where}`, params);
    const total = parseInt(c?.n || 0);
    // Ya no se calcula el resumen por local (media y pendientes de cada ficha): lo pintaba una
    // fila de píldoras que no se podía pulsar y que se ha quitado. Era una lectura de la tabla
    // ENTERA en cada página de la bandeja para algo que nadie miraba.
    const locRows = await dbAll(`SELECT DISTINCT location_name FROM google_reviews WHERE location_name IS NOT NULL AND location_name <> '' ${scopeAnd} ORDER BY location_name`, scopeParams);
    res.json({
      ok: true, data, total, offset, limit,
      hasMore: offset + data.length < total,
      contadores: { total, pendientes: parseInt(c?.pend || 0), respondidas: parseInt(c?.resp || 0) },
      locales: (locRows || []).map((l) => l.location_name),
      local: scope || null, fichas, sinFicha,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error reseñas: " + e.message, data: [] });
  }
});

// Genera un borrador de respuesta con IA (reutiliza el patrón de /api/sara/chat, sin tools).
async function draftReplyForReview(review) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("IA no configurada");
  const { system, messages } = draftRequest(review);
  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await ai.messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 400, system, messages });
  return extractText(response);
}

app.post("/api/reviews/draft", requireAuth(["direccion", "encargado"]), async (req, res) => {
  try {
    let review = req.body || {};
    if (review.id) {
      const row = await dbGet(`SELECT * FROM google_reviews WHERE id = ?`, [String(review.id)]);
      if (row) review = row;
    }
    const reply = await draftReplyForReview(review);
    if (!reply) return res.status(502).json({ ok: false, error: "La IA no devolvió texto" });
    res.json({ ok: true, reply });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message === "IA no configurada" ? e.message : "Error generando borrador" });
  }
});

// Borradores IA en lote (respuestas masivas). Máx 12 por llamada.
app.post("/api/reviews/draft-bulk", requireAuth(["direccion", "encargado"]), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 12) : [];
  if (!ids.length) return res.status(400).json({ ok: false, error: "Sin reseñas seleccionadas" });
  const out = [];
  for (const id of ids) {
    try {
      const row = await dbGet(`SELECT * FROM google_reviews WHERE id = ?`, [String(id)]);
      if (!row) { out.push({ id, ok: false }); continue; }
      const reply = await draftReplyForReview(row);
      out.push({ id, ok: !!reply, reply });
    } catch (e) { out.push({ id, ok: false, error: e.message }); }
  }
  res.json({ ok: true, data: out });
});

// Guarda la respuesta (modo borrador/registro interno). La publicación DIRECTA en Google
// (updateReply) queda pendiente de aprobación de cuota de la Business Profile API + persistir
// el resource name de cada reseña; hoy la respuesta solo se guarda aquí.
app.post("/api/reviews/:id/reply", requireAuth(["direccion", "encargado"]), async (req, res) => {
  const reply = String(req.body?.reply || "").trim();
  if (!reply) return res.status(400).json({ ok: false, error: "Respuesta vacía" });
  try {
    const row = await dbGet(`SELECT id, location_name FROM google_reviews WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ ok: false, error: "Reseña no encontrada" });
    const scope = localScope(req);
    if (scope && locationNamesDeLocal(scope, [row.location_name]).length === 0) return res.status(403).json({ ok: false, error: "Sin permiso sobre esta reseña" });
    await dbRun(`UPDATE google_reviews SET reply = ?, replied_at = ?, reply_by = ? WHERE id = ?`,
      [reply, new Date().toISOString(), req.user?.nombre || req.user?.username || null, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "No se pudo guardar la respuesta" });
  }
});

// ── Middleware de autenticación
function requireAuth(roles = []) {
  return (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "No autenticado" });
    }
    const token = auth.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      // `pass_temporal` NO bloquea. Se probó a cortar el paso hasta cambiarla y el resultado
      // fue gente que no podía trabajar por un formulario: el encargado que llega a las siete
      // de la mañana con el local abriendo no puede quedarse fuera del panel por esto. La
      // marca viaja igual en el token y la interfaz enseña un aviso que se puede posponer.
      if (roles.length && !roles.includes(payload.rol)) {
        return res.status(403).json({ ok: false, error: "Sin permiso para este recurso" });
      }
      // Y la allowlist por usuario, no solo el rol. Hasta ahora quitarle un módulo a alguien
      // solo escondía botones: quien supiera la URL seguía pudiendo llamar a la API. El mapa
      // de rutas es incompleto a propósito; lo que no está en él se comporta como antes.
      const mod = moduloDeRuta(req.path);
      if (mod && payload.rol !== "direccion" && Array.isArray(payload.modulos) && payload.modulos.length
          && !payload.modulos.includes(mod)) {
        return res.status(403).json({ ok: false, error: "No tienes acceso a este módulo." });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ ok: false, error: "Token inválido o expirado" });
    }
  };
}

// Ámbito por local a nivel de servidor: un usuario con `local` asignado y rol ≠ dirección solo
// puede ver/tocar los datos de SU local. Dirección y roles sin local → null (sin restricción).
// Se aplica en los listados y mutaciones por local (belt-and-suspenders, independiente de flags).
/**
 * El local con el que se responde a esta petición.
 *
 * Quien tiene UN local recibe siempre el suyo, pida lo que pida — igual que antes. Quien tiene
 * varios (el encargado de la Cooperativa lleva también La Tapeta de Blanes) puede pedir
 * cualquiera de los SUYOS con `?local=`; si pide otro se le devuelve el principal, nunca el
 * que pidió. La regla vive en src/modules/usuarios/locales.js, con tests.
 */
function localScope(req, pedido) {
  if (!req || !req.user) return null;
  return localPermitido(req.user, pedido !== undefined ? pedido : (req.query && req.query.local));
}

/**
 * Los establecimientos de esta petición cuando la pantalla enseña VARIOS a la vez (`?locales=`).
 *
 * Devuelve siempre una lista: vacía = sin restricción (solo dirección), uno = lo de siempre,
 * varios = hay que pedir uno a uno y sumar. Nunca devuelve un local que no sea del usuario:
 * eso lo garantiza `localesPermitidos`, que está aparte y con tests porque es lo único que
 * impide leer los datos de otro establecimiento escribiéndolo en la URL.
 */
function localesScope(req) {
  if (!req || !req.user) return [];
  const pedidos = req.query && req.query.locales;
  if (pedidos) {
    const lista = localesPermitidos(req.user, pedidos);
    if (lista.length) return lista;
  }
  const uno = localScope(req);
  return uno ? [uno] : [];
}

// Lista canónica de establecimientos (espejo de public/auth.js window.LOCALES). Solo lectura.
const INV_LOCALES = [
  "La Tapeta - Blanes", "Cooperativa - Blanes", "La Tapeta - Lloret",
  "La Tapeta - Girona", "Can Mateu - Tordera", "La Tapa Ibérica - Tordera",
  "Botiga d'en Mateu - Tordera", "Oficina",
];
// Centros sin atención al público: reciben facturas, incidencias, personal e inventario,
// pero NO se puede reservar mesa en ellos. Espejo de window.LOCALES_SIN_PUBLICO (auth.js).
const LOCALES_SIN_PUBLICO = new Set(["Oficina"]);
// Comparación tolerante (mayúsculas, tildes, espacios sobrantes): "oficina" u " Oficina "
// deben bloquearse igual que "Oficina".
const normLocal = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const SIN_PUBLICO_NORM = new Set([...LOCALES_SIN_PUBLICO].map(normLocal));
const esLocalSinPublico = (l) => SIN_PUBLICO_NORM.has(normLocal(l));
// Locales a los que el usuario tiene acceso: dirección = todos; encargado = solo su local.
function localesAccesibles(req) {
  if (req.user && req.user.rol === "direccion") return [...INV_LOCALES];
  const s = localScope(req);
  return s ? [s] : [];
}
// ¿El usuario puede operar sobre este local? Validación de aislamiento (SIEMPRE en backend).
// «¿Puede esta persona tocar ESTE local?» — distinto de «¿en cuál está mirando ahora?».
// Comparar contra localScope() dejaba fuera los demás locales del usuario, que sí son suyos.
function puedeAccederLocal(req, local) {
  return puedeLocal(req && req.user, local);
}

// Auth endpoints
app.post("/api/auth/login", async (req, res) => {
  // Primera capa del freno: por IP y en memoria. Corta el barrido de miles de intentos
  // desde un sitio antes de tocar siquiera la base.
  if (!pulsoRateLimit(req, res, 20)) return;

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Faltan credenciales" });
  }
  try {
    // Usuario insensible a mayúsculas/minúsculas (la contraseña sí distingue). Así "Direccion"
    // y "direccion" entran igual. Se recorta espacio sobrante por si acaso.
    const user = await dbGet("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", [String(username).trim()]);
    if (!user) return res.status(401).json({ ok: false, error: "Credenciales incorrectas" });

    // Segunda capa: por usuario y EN LA BASE, así que sobrevive a un reinicio y no se
    // esquiva cambiando de red. Se mira ANTES de bcrypt: si no, cada intento seguiría
    // costando sus ~100 ms de CPU y el freno no frenaría nada.
    const ahora = Date.now();
    const freno = estadoFreno(user, ahora);
    if (freno.frenado) return res.status(429).json({ ok: false, error: freno.mensaje, segundos: freno.segundos });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const f = trasFalloLogin(user, ahora);
      await dbRun("UPDATE users SET login_intentos = ?, login_bloqueado_hasta = ? WHERE id = ?",
        [f.login_intentos, f.login_bloqueado_hasta, user.id]).catch(() => {});
      // El mensaje NO cambia según si el usuario existe o la contraseña falla: decirlo
      // convertiría el login en un buscador de nombres de usuario válidos.
      return res.status(401).json({ ok: false, error: "Credenciales incorrectas" });
    }

    // Baja o cuenta desactivada: la contraseña era buena, pero ya no trabaja aquí. Se
    // comprueba DESPUÉS de bcrypt a propósito —antes convertiría el login en un buscador de
    // quién sigue en plantilla— y con la fecha de HOY, para que una baja futura no eche a
    // nadie antes de tiempo: quien causa baja el 31 entra el 25 y también el 31.
    // No se usa `activoAhora` aquí: esa incluye la fecha de ALTA, y a quien empieza el mes
    // que viene hay que poder darle su usuario para que lo pruebe antes del primer día.
    if (!marcadoActivo(user) || bajaEfectiva(user, hoyISO())) {
      await ficAuditar("acceso", user.id, "login_bloqueado_baja", user.username,
        { local: user.local, workerId: user.id, detalle: { fecha_baja: user.fecha_baja || null, activo: user.activo } }).catch(() => {});
      return res.status(403).json({ ok: false, error: "Esta cuenta ya no está activa. Habla con tu responsable." });
    }

    const ok = trasLoginCorrecto();
    await dbRun("UPDATE users SET login_intentos = ?, login_bloqueado_hasta = ? WHERE id = ?",
      [ok.login_intentos, ok.login_bloqueado_hasta, user.id]).catch(() => {});

    // `pass_temporal` viaja en el token: es lo que permite que requireAuth corte el paso
    // en el servidor, no solo que la pantalla enseñe un formulario.
    const debeCambiar = !!user.pass_temporal;
    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre, local: user.local,
        modulos: modulosEfectivos(user.rol, user.modulos), locales: localesDe(user), pass_temporal: debeCambiar },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ ok: true, token, rol: user.rol, nombre: user.nombre, debeCambiarPassword: debeCambiar });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error de autenticación" });
  }
});

// Cambiar la propia contraseña. Sirve para el cambio obligatorio de la primera vez y para
// cambiarla cuando a uno le apetezca.
app.put("/api/mi-password", requireAuth(), async (req, res) => {
  try {
    const u = await dbGet("SELECT id, username, password_hash, pass_temporal FROM users WHERE id = ?", [req.user.id]);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const actual = String(req.body?.actual || "");
    const nueva = String(req.body?.nueva || "");
    if (!(await bcrypt.compare(actual, u.password_hash))) {
      return res.status(401).json({ ok: false, error: "La contraseña actual no es correcta." });
    }
    const v = validarPassword(nueva, { username: u.username });
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });

    // `password_enc = NULL` y no una copia nueva. Era el caso más feo de todos: la contraseña
    // que alguien elige en privado, para él solo, quedaba guardada en una forma que dirección
    // podía leer desde el panel.
    await dbRun(
      "UPDATE users SET password_hash = ?, password_enc = NULL, pass_temporal = FALSE, pass_cambiada_en = ? WHERE id = ?",
      [await bcrypt.hash(nueva, 10), isoConOffset(Date.now()), u.id]);

    // Token nuevo sin la marca: si no, seguiría bloqueado hasta volver a entrar.
    const fresco = await dbGet("SELECT * FROM users WHERE id = ?", [u.id]);
    const token = jwt.sign(
      { id: fresco.id, username: fresco.username, rol: fresco.rol, nombre: fresco.nombre, local: fresco.local,
        modulos: modulosEfectivos(fresco.rol, fresco.modulos), locales: localesDe(fresco), pass_temporal: false },
      JWT_SECRET, { expiresIn: "8h" });
    res.json({ ok: true, token, mensaje: "Contraseña cambiada." });
  } catch (e) {
    console.error("[auth] mi-password:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cambiar la contraseña" });
  }
});

// Se lee de la BASE, no del token. El token guarda lo que había AL ENTRAR, así que quitarle
// un módulo a alguien no tenía efecto hasta que volviera a entrar — y quien ya estaba dentro
// seguía viéndolo todo. Es una consulta por carga de pantalla, no por petición.
app.get("/api/auth/me", requireAuth(), async (req, res) => {
  try {
    const u = await dbGet("SELECT id, username, rol, nombre, local, modulos, locales_extra, pass_temporal FROM users WHERE id = ?", [req.user.id]);
    if (!u) return res.json({ ok: true, user: req.user });   // usuario borrado: no se le echa a mitad de faena
    res.json({ ok: true, user: {
      id: u.id, username: u.username, rol: u.rol, nombre: u.nombre, local: u.local,
      modulos: modulosEfectivos(u.rol, u.modulos), locales: localesDe(u), pass_temporal: !!u.pass_temporal,
    } });
  } catch { res.json({ ok: true, user: req.user }); }
});

// Gestión de usuarios (solo dirección)
// Catálogo de módulos del panel (para pintar checkboxes en el editor de usuarios).
app.get("/api/users/catalogo-modulos", requireAuth(["direccion"]), (req, res) => {
  res.json({ ok: true, data: CATALOGO_MODULOS });
});

app.get("/api/users", requireAuth(["direccion"]), async (req, res) => {
  try {
    const rows = await dbAll("SELECT id, username, rol, nombre, local, modulos, locales_extra, creado_en FROM users ORDER BY rol");
    const data = (rows || []).map((u) => ({
      id: u.id, username: u.username, rol: u.rol, nombre: u.nombre, local: u.local, creado_en: u.creado_en,
      // TODOS sus locales, no solo el principal. El panel filtra la lista por el
      // establecimiento de la barra: sin los extra, un encargado de Blanes que también lleva
      // Lloret desaparecería al mirar Lloret y ese local parecería no tener a nadie.
      locales: localesDe({ ...u, rol: u.rol }),
      locales_extra: u.locales_extra || null,
      modulos: modulosEfectivos(u.rol, u.modulos),      // módulos que realmente puede ver
      restringido: !!(u.modulos && String(u.modulos).trim()), // tiene allowlist propia
      // `pass_visible` ya no existe: no hay copia recuperable de ninguna contraseña.
    }));
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error leyendo usuarios" });
  }
});

app.post("/api/users", requireAuth(["direccion"]), async (req, res) => {
  const { username, password, rol, nombre, local, modulos } = req.body;
  if (!username || !password || !rol) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const creado_en = new Date().toISOString();
    const mods = sanearModulos(rol, modulos);
    // `pass_temporal = TRUE`: la contraseña la ha elegido quien crea la cuenta y se la va a
    // decir de viva voz o por WhatsApp, así que la sabe más de una persona. Hasta que su dueño
    // la cambie, la cuenta no puede hacer NADA más en el panel. Esto se olvidó aquí —que es la
    // vía por la que se crean casi todos los usuarios— y por eso el cambio obligatorio no
    // saltaba nunca. Hay un test que ahora recorre todos los INSERT de usuarios.
    const row = await dbRun(
      `INSERT INTO users (username, password_hash, rol, nombre, local, modulos, locales_extra, pass_temporal, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?) RETURNING id`,
      [username, hash, rol, nombre || "", local || "", mods ? JSON.stringify(mods) : null,
       (() => { const x = sanearLocalesExtra(local, req.body.locales_extra, INV_LOCALES); return x ? JSON.stringify(x) : null; })(), creado_en]
    );
    invalidarInternos();
    res.json({ ok: true, id: row.id });
  } catch (err) {
    res.status(400).json({ ok: false, error: "Usuario ya existe o error al crear" });
  }
});

// Editar datos de un usuario: rol, nombre, local y módulos accesibles (allowlist).
app.put("/api/users/:id", requireAuth(["direccion"]), async (req, res) => {
  const { rol, nombre, local, modulos } = req.body;
  if (!rol) return res.status(400).json({ ok: false, error: "Falta el rol" });
  try {
    const mods = sanearModulos(rol, modulos); // se sanea contra el NUEVO rol
    // Los locales extra se sanean contra el catálogo y contra el principal: nunca se guarda
    // uno inventado ni el suyo repetido.
    const extra = sanearLocalesExtra(local, req.body.locales_extra, INV_LOCALES);
    await dbRun(
      "UPDATE users SET rol = ?, nombre = ?, local = ?, modulos = ?, locales_extra = ? WHERE id = ?",
      [rol, nombre || "", local || "", mods ? JSON.stringify(mods) : null, extra ? JSON.stringify(extra) : null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error actualizando usuario" });
  }
});

app.put("/api/users/:id/password", requireAuth(["direccion"]), async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ ok: false, error: "Contraseña requerida" });
  try {
    const hash = await bcrypt.hash(password, 10);
    await dbRun("UPDATE users SET password_hash = ?, password_enc = NULL, pass_temporal = TRUE WHERE id = ?", [hash, req.params.id]);
    // `pass_temporal`: la contraseña la ha elegido otra persona y se la va a decir de viva voz,
    // así que la sabe más de uno. Hasta que su dueño la cambie, la cuenta no hace nada más.
    res.json({ ok: true, mensaje: "Contraseña puesta. Al entrar le pedirá cambiarla." });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error actualizando contraseña" });
  }
});

// Ya no se puede consultar una contraseña. La ruta se queda para que una pestaña vieja del
// panel reciba una explicación en vez de un 404 sin sentido.
app.get("/api/users/:id/password", requireAuth(["direccion"]), (req, res) => {
  res.status(410).json({ ok: false, error: "Las contraseñas ya no se pueden consultar. Restablécela y se genera una nueva." });
});

// Restablecer: genera una temporal, la enseña UNA vez y obliga a cambiarla al entrar.
app.post("/api/users/:id/reset-password", requireAuth(["direccion"]), async (req, res) => {
  try {
    const u = await dbGet("SELECT id, username, nombre, local FROM users WHERE id = ?", [Number(req.params.id) || 0]);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    const nueva = passwordTemporal();
    await dbRun("UPDATE users SET password_hash = ?, password_enc = NULL, pass_temporal = TRUE, login_intentos = 0, login_bloqueado_hasta = NULL WHERE id = ?",
      [await bcrypt.hash(nueva, 10), u.id]);
    await ficAuditar("usuario", u.id, "reset_password", req.user.username, { local: u.local, workerId: u.id }).catch(() => {});
    res.json({ ok: true, password: nueva, mensaje: `${u.nombre || u.username} entra con esta contraseña. Al entrar le pedirá cambiarla.` });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo restablecer" }); }
});

/**
 * Lo que una persona deja detrás. Se consulta ANTES de borrarla.
 *
 * Ninguna de estas tablas tiene clave ajena contra `users`, y es a propósito: un
 * `ON DELETE CASCADE` sobre `fic_eventos` borraría el registro de jornada que la ley obliga a
 * conservar cuatro años. Pero sin cascada y sin esta comprobación, borrar dejaba huérfano todo
 * eso: el CSV de la Inspección salía con la columna «Trabajador» vacía y nadie podía saber de
 * quién eran esas horas.
 *
 * El orden importa: primero lo que no se puede perder por ley.
 */
const HISTORICO_LABORAL = [
  { tabla: "fic_eventos", que: "fichajes" },
  { tabla: "fic_bolsa_movimientos", que: "movimientos de la bolsa de horas" },
  { tabla: "fic_jornadas", que: "jornadas calculadas" },
  { tabla: "fic_correcciones", que: "correcciones de fichaje" },
  { tabla: "hor_asignaciones", que: "turnos en cuadrantes" },
  { tabla: "hor_contratos", que: "contratos" },
  { tabla: "hor_ausencias", que: "ausencias" },
  { tabla: "hr_documentos", que: "documentos" },
  { tabla: "hr_worker_notes", que: "notas" },
  { tabla: "hr_llamadas_mes", que: "check-ins" },
];
async function historicoLaboralDe(workerId) {
  const encontrado = [];
  for (const { tabla, que } of HISTORICO_LABORAL) {
    const r = await dbGet(`SELECT COUNT(*)::int AS n FROM ${tabla} WHERE worker_id = ?`, [workerId]).catch(() => null);
    if (r && Number(r.n) > 0) encontrado.push({ tabla, que, n: Number(r.n) });
  }
  return encontrado;
}

app.delete("/api/users/:id", requireAuth(["direccion"]), async (req, res) => {
  try {
    const id = Number(req.params.id) || 0;
    const u = await dbGet("SELECT id, nombre, username, rol, local, fecha_baja FROM users WHERE id = ?", [id]);
    if (!u) return res.json({ ok: true });

    const historico = await historicoLaboralDe(id);
    if (historico.length) {
      const detalle = historico.map((h) => `${h.n} ${h.que}`).join(", ");
      return res.status(409).json({
        ok: false, historico,
        error: `${u.nombre || u.username} tiene histórico laboral (${detalle}) y no puede eliminarse. ` +
               `Dale de baja: se conserva todo y deja de entrar y de aparecer en los cuadrantes.`,
      });
    }
    // Sin nada detrás, se borra como siempre: son las cuentas administrativas creadas por
    // error, que es el caso para el que estaba pensado este botón.
    await dbRun("DELETE FROM users WHERE id = ?", [id]);
    await ficAuditar("usuario", id, "borrar", req.user.username,
      { local: u.local, workerId: id, detalle: { username: u.username, rol: u.rol } }).catch(() => {});
    invalidarInternos();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error eliminando usuario" });
  }
});

// Leads
app.post("/api/leads", async (req, res) => {
  const { nombre, apellidos, nacimiento, poblacion, telefono, correo, fuente, genero } = req.body;
  if (!nombre || !apellidos || !nacimiento || !poblacion || !telefono || !correo) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  const premio = "10% de descuento";
  const ahora = new Date().toISOString();
  const fuenteVal = fuente || "web";
  const generoVal = genero || null;

  // Consentimiento de marketing (opcional; solo se registra si el formulario lo envía).
  const consienteWa = req.body.consent === true || req.body.consent === "1" || req.body.consent === 1 || !!req.body.opt_in_wa;
  const consienteEmail = req.body.consent === true || req.body.consent === "1" || req.body.consent === 1 || !!req.body.opt_in_email;
  const hayConsentimiento = req.body.consent !== undefined || req.body.opt_in_wa !== undefined || req.body.opt_in_email !== undefined;
  const registrarConsent = async () => {
    if (hayConsentimiento) {
      try { await setMarketingPref(telefono, { correo, opt_in_wa: consienteWa ? 1 : 0, opt_in_email: consienteEmail ? 1 : 0 }); } catch (e) { console.error("[leads] consent:", e.message); }
    }
  };

  try {
    // Teléfono por los últimos 9 dígitos y correo sin distinguir mayúsculas ni espacios:
    // con la comparación exacta de antes, "+34 600…" o "Marta@X.com" creaban un lead nuevo.
    const existing = await dbGet(
      `SELECT id FROM leads
       WHERE ${MATCH_TEL9("telefono")}
          OR (COALESCE(correo, '') <> '' AND LOWER(TRIM(correo)) = LOWER(TRIM(?)))
       ORDER BY id LIMIT 1`,
      [telefono, correo]
    );
    if (existing) {
      await dbRun(
        `UPDATE leads SET nombre=?, apellidos=?, nacimiento=?, poblacion=?, genero=COALESCE(?,genero), fuente=?, actualizado_en=? WHERE id=?`,
        [nombre, apellidos, nacimiento, poblacion, generoVal, fuenteVal, ahora, existing.id]
      );
      await registrarConsent();
      return res.json({ ok: true, premio, actualizado: true });
    } else {
      await dbRun(
        `INSERT INTO leads (nombre, apellidos, nacimiento, poblacion, telefono, correo, premio, fuente, genero, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, apellidos, nacimiento, poblacion, telefono, correo, premio, fuenteVal, generoVal, ahora]
      );
      mirrorLeadToSheet({ nombre, apellidos, telefono, correo, poblacion, nacimiento, genero: generoVal, fuente: fuenteVal, premio });
      await registrarConsent();
      return res.json({ ok: true, premio });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando lead" });
  }
});

// Crea/actualiza un lead por teléfono.
async function upsertLead({ nombre = "", apellidos = "", telefono, fuente = "web" }) {
  if (!telefono) return;
  const ahora = new Date().toISOString();
  try {
    // Comparamos por los últimos 9 dígitos: "600112233", "600 11 22 33" y "+34 600 11 22 33"
    // son la misma persona. Con el `= ?` de antes, cada formato creaba un lead nuevo.
    const row = await dbGet(`SELECT id, nombre, apellidos FROM leads WHERE ${MATCH_TEL9("telefono")} ORDER BY id LIMIT 1`, [telefono]);
    if (row) {
      const nuevoNombre = (!row.nombre || row.nombre === "") && nombre ? nombre : row.nombre;
      const nuevoApellidos = (!row.apellidos || row.apellidos === "") && apellidos ? apellidos : row.apellidos;
      await dbRun(
        `UPDATE leads SET nombre = ?, apellidos = ?, actualizado_en = ? WHERE id = ?`,
        [nuevoNombre || "", nuevoApellidos || "", ahora, row.id]
      );
    } else {
      await dbRun(
        `INSERT INTO leads (nombre, apellidos, telefono, nacimiento, poblacion, correo, premio, fuente, creado_en) VALUES (?, ?, ?, '', '', '', '', ?, ?)`,
        [nombre, apellidos, telefono, fuente, ahora]
      );
      mirrorLeadToSheet({ nombre, apellidos, telefono, correo: "", poblacion: "", nacimiento: "", genero: null, fuente, premio: "" });
    }
  } catch (e) {
    console.error("[upsertLead] Error:", e.message);
  }
}

// Datos opcionales que el cliente añade en el pop-up de confirmación (población y fecha de
// nacimiento). No crean contacto nuevo: rellenan el lead que `upsertLeadFromReserva` ya creó
// al reservar, así no se duplica a nadie. Es público, pero exigimos que el teléfono coincida
// con el de la reserva para que nadie pueda escribir en la ficha de otro probando ids.
app.post("/api/reservas/:id/perfil", async (req, res) => {
  const { telefono, poblacion, nacimiento } = req.body || {};
  if (!telefono) return res.status(400).json({ ok: false, error: "Faltan datos" });
  const pob = String(poblacion || "").trim().slice(0, 80);
  const nac = String(nacimiento || "").trim().slice(0, 10);
  if (!pob && !nac) return res.json({ ok: true, guardado: false });
  if (nac) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nac)) return res.status(400).json({ ok: false, error: "Fecha inválida" });
    const año = Number(nac.slice(0, 4));
    if (año < 1900 || año > new Date().getFullYear()) return res.status(400).json({ ok: false, error: "Fecha inválida" });
  }
  try {
    const reserva = await dbGet(`SELECT id FROM reservas WHERE id = ? AND ${MATCH_TEL9("telefono")}`, [req.params.id, telefono]);
    if (!reserva) return res.status(404).json({ ok: false, error: "Reserva no encontrada" });
    // El lead se crea al reservar, pero sin esperar a que termine: si aún no está, lo creamos.
    const lead = await dbGet(`SELECT id FROM leads WHERE ${MATCH_TEL9("telefono")} ORDER BY id LIMIT 1`, [telefono]);
    if (!lead) await upsertLead({ telefono, fuente: "reserva" });
    // Solo rellenamos lo que esté vacío: nunca pisamos lo que dio en el formulario del descuento.
    await dbRun(
      `UPDATE leads SET
         poblacion = CASE WHEN COALESCE(poblacion, '') = '' THEN ? ELSE poblacion END,
         nacimiento = CASE WHEN COALESCE(nacimiento, '') = '' THEN ? ELSE nacimiento END,
         actualizado_en = ?
       WHERE ${MATCH_TEL9("telefono")}`,
      [pob, nac, new Date().toISOString(), telefono]
    );
    res.json({ ok: true, guardado: true });
  } catch (e) {
    console.error("[reserva/perfil] Error:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron guardar los datos" });
  }
});

function upsertLeadFromReserva({ nombre_reserva, telefono }) {
  const nombre = (nombre_reserva || "").split(" ")[0] || nombre_reserva || "";
  const apellidos = (nombre_reserva || "").split(" ").slice(1).join(" ");
  upsertLead({ nombre, apellidos, telefono, fuente: "reserva" });
}

// ── Espejo de leads en Google Sheets ──────────────────────────────────────
async function ensureLeadsSheet(token) {
  let id = await getConfig("leads_sheet_id");
  if (id) return id;
  const r = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { title: "Leads · Familia del Amor" } })
  });
  const data = await r.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  id = data.spreadsheetId;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent("A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [["Fecha", "Nombre", "Apellidos", "Teléfono", "Correo", "Población", "Nacimiento", "Género", "Fuente", "Premio"]] })
  });
  await setConfig("leads_sheet_id", id);
  console.log(`[Leads] Hoja de Google Sheets creada: ${id}`);
  return id;
}

async function mirrorLeadToSheet(lead) {
  try {
    const refresh = await getConfig("google_drive_refresh_token");
    if (!refresh) return;
    const token = await getDriveAccessToken();
    const id = await ensureLeadsSheet(token);
    const fecha = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
    const fila = [fecha, lead.nombre || "", lead.apellidos || "", lead.telefono || "", lead.correo || "",
      lead.poblacion || "", lead.nacimiento || "", lead.genero || "", lead.fuente || "", lead.premio || ""];
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent("A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [fila] })
    });
    console.log(`[Leads] Fila añadida a Google Sheets: ${lead.nombre} ${lead.apellidos}`);
  } catch (e) {
    console.error("[Leads] No se pudo escribir en Sheets:", e.message);
  }
}

// SQL unificado: leads + clientes de reservas sin lead, mergeando por teléfono.
// Cruza marketing_prefs (consentimiento) por los últimos 9 dígitos del teléfono (robusto al
// formato) y marca si el contacto tiene conversación de WhatsApp abierta (wa_clientes).
/**
 * LA EDAD, SIN CONVERTIR A FECHA.
 *
 * `to_date('31/02/1970','DD/MM/YYYY')` revienta con «date/time field value out of range», y
 * basta UN contacto con una fecha imposible —los hay, se teclean a mano— para que la lista
 * entera deje de cargar. Es el mismo fallo que ya tuvimos con las fechas en blanco.
 *
 * Así que aritmética pura sobre los trozos: año, mes y día como números. Se aceptan los dos
 * formatos guardados («1980-08-15» y «15/08/1980») y lo que no encaje da NULL, que es lo
 * honesto: de esa persona no sabemos la edad, así que no entra en un filtro por edad.
 */
const SQL_TROZO_NAC = (desdeISO, desdeES) =>
  `CASE WHEN c.nacimiento ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN substring(c.nacimiento,${desdeISO},2)::int
        WHEN c.nacimiento ~ '^[0-9]{2}[/-][0-9]{2}[/-][0-9]{4}$' THEN substring(c.nacimiento,${desdeES},2)::int END`;
const SQL_ANYO_NAC =
  `CASE WHEN c.nacimiento ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN substring(c.nacimiento,1,4)::int
        WHEN c.nacimiento ~ '^[0-9]{2}[/-][0-9]{2}[/-][0-9]{4}$' THEN substring(c.nacimiento,7,4)::int END`;
const SQL_MES_NAC = SQL_TROZO_NAC(6, 4);
const SQL_DIA_NAC = SQL_TROZO_NAC(9, 1);
// Los años cumplidos A DÍA DE HOY: si aún no ha llegado su cumpleaños este año, uno menos.
const sqlEdad = (hoy) => {
  const [, m, d] = String(hoy).split("-").map(Number);
  return `(${String(hoy).slice(0, 4)}::int - ${SQL_ANYO_NAC}
           - (CASE WHEN (${SQL_MES_NAC}, ${SQL_DIA_NAC}) > (${m}, ${d}) THEN 1 ELSE 0 END))`;
};

function sqlContactosUnificados(filtros = {}, params = []) {
  const { q, poblacion, genero, cumple_mes, local, con_email, con_telefono, idioma, origen, excluir_baja } = filtros;

  // También por teléfono normalizado: si el lead guardó "+34 600…" y la reserva "600…",
  // con el IN exacto el cliente desaparecía al filtrar por local.
  let localFilter = local
    ? `AND EXISTS (
         SELECT 1 FROM reservas rl
         WHERE rl.local = ?
           AND RIGHT(regexp_replace(rl.telefono, '[^0-9]', '', 'g'), 9) = RIGHT(regexp_replace(c.telefono, '[^0-9]', '', 'g'), 9)
       )`
    : "";
  if (local) params.push(local);

  let sql = `
    SELECT
      c.nombre, c.apellidos, c.telefono, c.correo,
      c.nacimiento, c.poblacion, c.genero, c.origen,
      c.ultima_actividad,
      COALESCE(mp.baja, 0) AS baja,
      COALESCE(mp.opt_in_wa, 0) AS opt_in_wa,
      COALESCE(mp.opt_in_email, 0) AS opt_in_email,
      mp.idioma AS idioma,
      CASE WHEN EXISTS (
        SELECT 1 FROM wa_clientes w
        WHERE RIGHT(regexp_replace(w.telefono, '[^0-9]', '', 'g'), 9) = RIGHT(regexp_replace(c.telefono, '[^0-9]', '', 'g'), 9)
      ) THEN 1 ELSE 0 END AS es_contacto_wa
    FROM (
      -- Clientes con lead (datos completos)
      SELECT
        l.nombre, l.apellidos, l.telefono, l.correo,
        l.nacimiento, l.poblacion, l.genero,
        'lead' AS origen,
        COALESCE(l.actualizado_en, l.creado_en) AS ultima_actividad
      FROM leads l

      UNION

      -- Clientes solo de reservas (sin lead). Agrupamos por teléfono normalizado y nos
      -- quedamos con el nombre de la reserva más reciente: antes el GROUP BY incluía
      -- nombre_reserva, así que "Uri" y "Uriel" con el mismo móvil salían como dos personas.
      SELECT
        (array_agg(r.nombre_reserva ORDER BY r.creado_en DESC))[1] AS nombre,
        '' AS apellidos,
        (array_agg(r.telefono ORDER BY r.creado_en DESC))[1] AS telefono,
        '' AS correo,
        NULL AS nacimiento,
        NULL AS poblacion,
        NULL AS genero,
        'reserva' AS origen,
        MAX(r.creado_en) AS ultima_actividad
      FROM reservas r
      WHERE NOT EXISTS (
        SELECT 1 FROM leads l2
        WHERE l2.telefono IS NOT NULL
          AND RIGHT(regexp_replace(l2.telefono, '[^0-9]', '', 'g'), 9) = RIGHT(regexp_replace(r.telefono, '[^0-9]', '', 'g'), 9)
      )
      GROUP BY RIGHT(regexp_replace(r.telefono, '[^0-9]', '', 'g'), 9)
    ) c
    LEFT JOIN marketing_prefs mp
      ON RIGHT(regexp_replace(mp.telefono, '[^0-9]', '', 'g'), 9) = RIGHT(regexp_replace(c.telefono, '[^0-9]', '', 'g'), 9)
    WHERE 1=1
    ${localFilter}
  `;

  if (q) {
    // ILIKE = búsqueda insensible a mayúsculas/minúsculas (da igual "ana" o "Ana").
    sql += ` AND (c.nombre ILIKE ? OR c.apellidos ILIKE ? OR c.telefono ILIKE ? OR c.correo ILIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (poblacion) { sql += ` AND c.poblacion ILIKE ?`; params.push(`%${poblacion}%`); }
  if (genero) {
    // EL FORMULARIO DE CAMPAÑAS MANDABA «M»/«F» Y EN LA BASE PONE «hombre»/«mujer», así que
    // filtrar por género no devolvía a NADIE — y una campaña con cero destinatarios se lee
    // como «no hay mujeres en la base», no como «el filtro está roto».
    // Se normaliza aquí y no solo en el formulario porque las campañas ya guardadas llevan
    // «M» dentro de su segmento: si solo se arreglara la pantalla, las programadas seguirían
    // saliendo vacías.
    const g = String(genero).trim().toLowerCase();
    const norm = { m: "hombre", h: "hombre", hombre: "hombre", f: "mujer", mujer: "mujer" }[g] || g;
    sql += ` AND c.genero = ?`; params.push(norm);
  }
  // Cumpleaños de un mes. SIN convertir a fecha: `''::date` revienta la consulta entera con
  // un error de Postgres, y basta UN contacto con la fecha de nacimiento en blanco —que los
  // hay— para que la lista deje de cargar. Se compara el trozo del mes tal cual, y se aceptan
  // los dos formatos que hay guardados: «1980-08-15» y «15/08/1980».
  const mm = String(cumple_mes || "").padStart(2, "0");
  if (/^(0[1-9]|1[0-2])$/.test(mm)) {
    sql += ` AND ( (c.nacimiento ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND substring(c.nacimiento, 6, 2) = ?)
                OR (c.nacimiento ~ '^[0-9]{2}[/-][0-9]{2}[/-][0-9]{4}$' AND substring(c.nacimiento, 4, 2) = ?) )`;
    params.push(mm, mm);
  } else if (cumple_mes) {
    // Un mes que no es un mes no puede filtrar por lo que le dé la gana: se ignora y se dice.
    console.warn("[contactos] cumple_mes no válido, se ignora:", cumple_mes);
  }
  if (filtros.from) { sql += ` AND c.ultima_actividad >= ?`; params.push(filtros.from); }
  if (filtros.to) { sql += ` AND c.ultima_actividad <= ?`; params.push(filtros.to + " 23:59:59"); }

  // ── QUIÉN VINO, y no «quién tiene la ficha tocada» ────────────────────────
  // `from`/`to` filtran la última actividad, que en un lead es cuándo se actualizó su ficha.
  // «Los que reservaron el mes pasado» es otra cosa y hasta ahora no se podía pedir: se daba
  // una lista parecida que no era esa. Va por la FECHA DE LA RESERVA (`dia`), no por cuándo
  // se apuntó, y cruza por teléfono normalizado como el resto.
  if (filtros.reservo_from || filtros.reservo_to) {
    const cond = ["RIGHT(regexp_replace(rr.telefono, '[^0-9]', '', 'g'), 9) = RIGHT(regexp_replace(c.telefono, '[^0-9]', '', 'g'), 9)"];
    if (filtros.reservo_from) { cond.push("rr.dia >= ?"); }
    if (filtros.reservo_to) { cond.push("rr.dia <= ?"); }
    sql += ` AND EXISTS (SELECT 1 FROM reservas rr WHERE ${cond.join(" AND ")})`;
    if (filtros.reservo_from) params.push(filtros.reservo_from);
    if (filtros.reservo_to) params.push(filtros.reservo_to);
  }

  // ── EDAD ──────────────────────────────────────────────────────────────────
  // Quien no tiene fecha de nacimiento NO entra: de esa persona no sabemos la edad, y meterla
  // en «mayores de 35» sería inventarse el dato. Se dice aparte cuántas se quedan fuera.
  const hoyM = filtros.hoy || hoyISO();
  const edadMin = Number(filtros.edad_min), edadMax = Number(filtros.edad_max);
  if (Number.isFinite(edadMin) && edadMin > 0) sql += ` AND ${sqlEdad(hoyM)} >= ${Math.floor(edadMin)}`;
  if (Number.isFinite(edadMax) && edadMax > 0) sql += ` AND ${sqlEdad(hoyM)} <= ${Math.floor(edadMax)}`;

  // ── CUMPLEAÑOS EN LOS PRÓXIMOS N DÍAS ─────────────────────────────────────
  // «Felicitar y regalar un café» funciona el día que es, no en un envío único el día 1 a los
  // doscientos del mes. Se compara mes×100+día, que no necesita convertir nada a fecha; y se
  // contempla que la ventana cruce el fin de año, que si no diciembre se queda sin felicitar.
  const dias = Number(filtros.cumple_en_dias);
  if (Number.isFinite(dias) && dias >= 0 && dias <= 60) {
    const desde = new Date(hoyM + "T12:00:00Z");
    const hasta = new Date(desde.getTime() + dias * 86400000);
    const md = (d) => (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    const a = md(desde), b = md(hasta);
    const expr = `(${SQL_MES_NAC} * 100 + ${SQL_DIA_NAC})`;
    sql += a <= b
      ? ` AND ${expr} BETWEEN ${a} AND ${b}`
      : ` AND (${expr} >= ${a} OR ${expr} <= ${b})`;
  }
  if (con_email) sql += ` AND c.correo IS NOT NULL AND c.correo <> ''`;
  if (con_telefono) sql += ` AND c.telefono IS NOT NULL AND c.telefono <> ''`;
  // ── LOS QUE NOS FALTAN DATOS ──────────────────────────────────────────────
  // No es un filtro de marketing al uso: es para poder PEDIR el dato. «Los leads sin fecha de
  // nacimiento» es la lista a la que preguntar cuándo cumplen, y a partir de ahí se les puede
  // felicitar. Sin esto, el hueco no se puede ni ver.
  // ── SEGMENTAR POR LO QUE SABEMOS DE ELLOS ─────────────────────────────────
  // «Los celíacos de Blanes» solo se puede pedir si el cuaderno se puede filtrar. Solo entra
  // lo CONFIRMADO: una propuesta que nadie ha mirado no puede decidir a quién se escribe.
  if (filtros.hecho_etiqueta) {
    const cond = ["h.estado = 'confirmado'",
      "RIGHT(regexp_replace(h.telefono, '[^0-9]', '', 'g'), 9) = RIGHT(regexp_replace(c.telefono, '[^0-9]', '', 'g'), 9)",
      "h.etiqueta = ?"];
    const par = [String(filtros.hecho_etiqueta)];
    if (filtros.hecho_valor) { cond.push("h.valor ILIKE ?"); par.push(`%${filtros.hecho_valor}%`); }
    sql += ` AND EXISTS (SELECT 1 FROM cliente_hechos h WHERE ${cond.join(" AND ")})`;
    params.push(...par);
  }
  if (filtros.sin_nacimiento) sql += ` AND COALESCE(c.nacimiento, '') = ''`;
  if (filtros.sin_email) sql += ` AND COALESCE(c.correo, '') = ''`;
  if (filtros.sin_poblacion) sql += ` AND COALESCE(c.poblacion, '') = ''`;
  if (origen) { sql += ` AND c.origen = ?`; params.push(origen); }
  if (idioma) { sql += ` AND mp.idioma = ?`; params.push(idioma); }
  if (excluir_baja) sql += ` AND COALESCE(mp.baja, 0) = 0`;
  // Exclusión manual de destinatarios concretos (editar la lista a mano en el panel).
  if (Array.isArray(filtros.excluir_telefonos) && filtros.excluir_telefonos.length) {
    const ph = filtros.excluir_telefonos.map(() => "?").join(",");
    sql += ` AND c.telefono NOT IN (${ph})`;
    params.push(...filtros.excluir_telefonos);
  }

  sql += ` ORDER BY c.ultima_actividad DESC`;
  return sql;
}

// Marca/actualiza preferencias de marketing por teléfono (normalizado). Usado por opt-out y ficha.
async function setMarketingPref(telefono, campos = {}) {
  const tel = formatTelefonoES(telefono);
  if (!tel) return;
  const existing = await dbGet(`SELECT telefono FROM marketing_prefs WHERE telefono = ?`, [tel]);
  const now = new Date().toISOString();
  if (existing) {
    const sets = [], vals = [];
    for (const k of ["correo", "opt_in_wa", "opt_in_email", "baja", "idioma"]) {
      if (campos[k] !== undefined) { sets.push(`${k} = ?`); vals.push(campos[k]); }
    }
    if (!sets.length) return;
    sets.push(`updated_at = ?`); vals.push(now); vals.push(tel);
    await dbRun(`UPDATE marketing_prefs SET ${sets.join(", ")} WHERE telefono = ?`, vals);
  } else {
    await dbRun(
      `INSERT INTO marketing_prefs (telefono, correo, opt_in_wa, opt_in_email, baja, idioma, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tel, campos.correo ?? null, campos.opt_in_wa ?? 0, campos.opt_in_email ?? 0, campos.baja ?? 0, campos.idioma ?? null, now]
    );
  }
}

app.get("/api/leads", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const params = [];
    const sql = sqlContactosUnificados(req.query, params);
    const rows = await dbAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error leyendo leads" });
  }
});

// ── Compras por producto (detalle de las facturas) ───────────────────────────
// Contesta «cuántas Coca-Colas hemos comprado desde marzo» y, sobre todo, «a cómo nos las
// están cobrando y cómo ha cambiado». Fase A de docs/lineas-de-factura.md: SIN enlazar
// todavía con inventario ni con Ágora — se agrupa por la descripción del proveedor tal
// cual. Dos proveedores que llamen distinto al mismo producto salen separados, y en esta
// fase eso es lo correcto: dos filas honestas valen más que una fusión inventada.
// Es una función y no el cuerpo del endpoint porque, para ver varios establecimientos a la
// vez, se llama UNA VEZ POR LOCAL y se suman las respuestas (src/modules/facturas/compras-fusion.js).
// La consulta es exactamente la de siempre, con su `local = ?`: el ADR 0001 aparta tocar el
// filtrado por local hasta después de producción.
// Cuántos PRODUCTOS distintos se enseñan de una vez. Ya no es un tope de líneas: la base
// agrupa, así que da igual cuántas veces se haya comprado cada uno — un producto comprado
// quinientas veces sigue siendo una fila.
//
// 5.000 es holgado a propósito: con un catálogo real de cientos de productos no muerde nunca,
// y así el total de la pantalla es el total de verdad. Sigue habiendo un número porque una
// consulta sin límite es una forma de tumbar el servidor el día que algo salga mal; y si
// alguna vez muerde, se dice en pantalla en vez de enseñar un total a medias.
const TOPE_PRODUCTOS = 5000;

/**
 * Por dónde se ordena la lista de productos.
 *
 * VA EN LA CONSULTA Y NO EN EL NAVEGADOR porque hay un tope de filas: ordenar después de
 * recortar daría «la A-Z de los cinco mil que más gastan», que no es la A-Z de nada. Lo que se
 * recorta tiene que ser lo último según el orden pedido.
 *
 * La lista es cerrada a propósito: esto se pega dentro de un ORDER BY.
 */
const ORDENES_COMPRAS = {
  gasto: "importe DESC NULLS LAST",
  nombre: "descripcion ASC",
  reciente: "ultima DESC NULLS LAST",
  veces: "veces DESC",
  // Cuánto se ha movido el precio dentro del periodo. Es la misma cuenta que enseña la
  // columna de variación, así que ordenar por aquí ordena por lo que se ve.
  subida: "(preciomax - preciomin) / NULLIF(preciomin, 0) DESC NULLS LAST",
};
const ordenCompras = (o) => ORDENES_COMPRAS[String(o || "")] || ORDENES_COMPRAS.gasto;

async function comprasDeLocal(query, local) {
    // Dos juegos de condiciones separados a propósito: los filtros de FACTURA valen para
    // las dos consultas y el de texto solo para las líneas. Recortar un WHERE ya montado a
    // base de reemplazos es la clase de cosa que un día deja de funcionar en silencio.
    const req = { query };
    const condFac = ["COALESCE(f.dup_estado,'') <> 'duda'"], parFac = [];
    if (local) { condFac.push("f.local = ?"); parFac.push(local); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || ""))) { condFac.push("f.fecha >= ?"); parFac.push(req.query.from); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || ""))) { condFac.push("f.fecha <= ?"); parFac.push(req.query.to); }
    if (String(req.query.proveedor || "").trim()) { condFac.push("LOWER(f.proveedor) = LOWER(?)"); parFac.push(String(req.query.proveedor).trim()); }
    // Filtrar por categoría es filtrar por «los proveedores que son de esa categoría». Se
    // resuelve con una subconsulta sobre la clave normalizada, que es la que une «GRAU, S.L.»
    // con «Grau Distribucions»: si se comparara el nombre a pelo, faltaría media lista.
    const cats = String(req.query.categoria || "").split(",").map((c) => normalizarCategoria(c)).filter(Boolean);
    // La subcategoría afina dentro de la categoría: «Bebidas» sin más, o «Vinos y cavas».
    const todasSubs = new Set(CATALOGO.flatMap((c) => c.subs));
    const subs = String(req.query.subcategoria || "").split(",").map((x) => x.trim()).filter((x) => todasSubs.has(x));
    if (cats.length || subs.length) {
      const provsCat = await proveedoresDeCategorias(cats, subs);
      // Si nadie está etiquetado con esas categorías, la respuesta correcta es «nada», no
      // «todo»: una condición que no filtra habría devuelto la lista entera como si sí.
      condFac.push("f.proveedor = ANY(?)");
      parFac.push(provsCat.length ? provsCat : ["\u0000sin-proveedores"]);
    }

    const q = String(req.query.q || "").trim();
    const condLin = [...condFac], parLin = [...parFac];
    if (q) {
      // Se busca sobre la clave normalizada: escribiendo «coca» salen «COCA-COLA» y
      // «Coca Cola 33cl» sin tener que acertar el formato exacto del proveedor.
      condLin.push("l.clave LIKE ?");
      parLin.push("%" + claveProducto(q) + "%");
    }
    // ── El albarán y su factura cuentan UNA vez ──────────────────────────────
    // El proveedor deja un albarán por entrega y a fin de mes manda la factura que las agrupa.
    // Si las dos traen su detalle leído, el mismo kilo de gambas está dos veces: se compró
    // una, y «Todo lo comprado» decía el doble.
    //
    // Pero no vale con quitar los albaranes y ya: hay facturas resumen que no traen detalle
    // («según albaranes adjuntos»), y ahí el albarán es la ÚNICA fuente de lo que entró por la
    // puerta. Quitarlo perdería el producto entero, que es peor que contarlo dos veces.
    //
    // La regla, entonces: se descuenta la línea de un albarán solo si YA está conciliado con
    // una factura y esa factura TIENE su propio detalle. Si la factura no lo trae, o si el
    // albarán aún no tiene factura, la línea del albarán cuenta — es lo único que hay.
    condLin.push(`NOT ${ALBARAN_YA_CONTADO}`);
    // Una línea sin descripción legible tiene la clave vacía y no es un producto: agrupadas
    // todas juntas saldría un «producto fantasma» sin nombre y con un gasto que no es de nada.
    // El agrupado que se hacía en el servidor ya las descartaba; la consulta tenía que hacerlo
    // también, y lo cazó un test al portarlo.
    condLin.push(`COALESCE(l.clave,'') <> ''`);

    const whereLin = condLin.length ? "WHERE " + condLin.join(" AND ") : "";
    const whereFac = condFac.length ? "WHERE " + condFac.join(" AND ") : "";

    // AGRUPA LA BASE, NO EL SERVIDOR. Un producto comprado quinientas veces es UNA fila, no
    // quinientas: la pantalla enseña productos. Traérselas todas para juntarlas después obliga
    // a un tope, y con tope el total deja de ser el total sin que se note. Aquí salen tantas
    // filas como productos hay — cien productos, cien filas, den igual las compras que haya
    // detrás—. El detalle de cada uno se pide al pulsarlo (`/api/facturas/compras/producto`).
    //
    // El diccionario entra en la propia agrupación: si dos escrituras están confirmadas como
    // el mismo producto, la base ya las suma juntas y con el nombre bueno.
    const filas = await dbAll(
      `SELECT
         COALESCE('p:' || a.producto_id::text, l.clave) AS clave,
         (array_agg(COALESCE(p.nombre, l.descripcion) ORDER BY f.fecha DESC, l.id DESC))[1] AS descripcion,
         bool_or(a.producto_id IS NOT NULL) AS unificado,
         array_agg(DISTINCT f.proveedor) AS proveedores,
         count(*)::int AS veces,
         count(*) FILTER (WHERE l.dudosa)::int AS dudosas,
         count(*) FILTER (WHERE l.cantidad IS NOT NULL)::int AS concantidad,
         count(*) FILTER (WHERE l.importe IS NOT NULL)::int AS conimporte,
         SUM(l.cantidad)::float AS cantidad,
         SUM(l.importe)::float AS importe,
         MIN(l.precio_unitario)::float AS preciomin,
         MAX(l.precio_unitario)::float AS preciomax,
         MIN(f.fecha) AS primera,
         MAX(f.fecha) AS ultima,
         (array_agg(l.precio_unitario::float ORDER BY f.fecha DESC, l.id DESC)
            FILTER (WHERE l.precio_unitario IS NOT NULL))[1:40] AS precios,
         (array_agg(f.fecha ORDER BY f.fecha DESC, l.id DESC)
            FILTER (WHERE l.precio_unitario IS NOT NULL))[1:40] AS precios_fechas,
         -- La unidad, solo si TODAS las compras coinciden: «441» sin unidad no dice nada, y
         -- «441 kg» junto a «441 ud» sumados diría algo falso. Con dos unidades distintas se
         -- calla, que es la respuesta honesta.
         (array_agg(DISTINCT l.unidad) FILTER (WHERE COALESCE(l.unidad,'') <> '')) AS unidades
       FROM factura_lineas l
       JOIN facturas f ON f.id = l.factura_id
       LEFT JOIN producto_alias a ON a.clave = l.clave AND a.producto_id IS NOT NULL
       LEFT JOIN productos_canonicos p ON p.id = a.producto_id
       ${whereLin}
       GROUP BY 1
       ORDER BY ${ordenCompras(req.query.orden)}
       LIMIT ${TOPE_PRODUCTOS}`, parLin);

    // Las líneas sueltas SOLO al buscar: ahí sí se quieren ver las compras una a una, y son
    // las de un producto concreto. Sin búsqueda no se traen — es lo que quitaba el tope.
    const sueltas = q ? await dbAll(
      `SELECT l.descripcion, l.cantidad::float AS cantidad, l.unidad, l.precio_unitario::float AS precio_unitario,
              l.importe::float AS importe, l.dudosa, f.fecha, f.proveedor, f.local, f.id AS factura_id, f.numero_factura
       FROM factura_lineas l JOIN facturas f ON f.id = l.factura_id
       ${whereLin} ORDER BY f.fecha DESC, l.orden LIMIT 400`, parLin) : [];

    // Cuántos albaranes se han dejado fuera por eso, para poder decirlo: descontar en silencio
    // es cambiar un total sin avisar, y el que lo mire mañana no sabrá por qué bajó.
    const dobles = await dbGet(
      `SELECT count(DISTINCT f.id)::int AS n FROM factura_lineas l JOIN facturas f ON f.id = l.factura_id
        WHERE ${[...condFac, ALBARAN_YA_CONTADO].join(" AND ")}`, parFac);

    const grupos = filas.map(grupoDeSQL);
    // Cuántas facturas del periodo NO tienen detalle: sin esto, un total parcial parecería
    // el total de verdad. Es la diferencia entre un dato y un dato en el que se puede confiar.
    const cobertura = await dbGet(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE f.lineas_estado IS NOT NULL AND f.lineas_estado NOT IN ('no_leible','no_aplica'))::int AS con_detalle,
              count(*) FILTER (WHERE f.lineas_estado = 'descuadre')::int AS descuadradas,
              count(*) FILTER (WHERE f.lineas_estado = 'no_leible')::int AS no_leibles,
              -- Alquiler, luz, gestor…: no se leen a propósito. Contarlas como «con detalle»
              -- inflaría la cobertura, y como «sin leer» pediría leerlas para siempre.
              count(*) FILTER (WHERE f.lineas_estado = 'no_aplica')::int AS no_aplica,
              count(*) FILTER (WHERE f.lineas_estado IS NULL)::int AS sin_leer
       FROM facturas f ${whereFac}`, parFac);

    // Gasto por categoría. Va sobre el TOTAL de las facturas, no sobre las líneas: así el
    // alquiler y la luz —de las que a propósito no se lee el detalle— también cuentan. Si
    // saliera de las líneas, las categorías de gasto estructural darían siempre cero.
    const etiquetas = await dbAll(`SELECT prov_clave AS proveedor, categoria, subcategoria FROM facturas_proveedor_cats`).catch(() => []);
    const porProveedor = await dbAll(
      `SELECT f.proveedor, COALESCE(SUM(f.total),0)::float AS importe FROM facturas f ${whereFac} AND COALESCE(f.tipo,'factura') <> 'albaran' GROUP BY f.proveedor`, parFac);
    const idxCat = new Map();
    for (const e of etiquetas) {
      if (!idxCat.has(e.proveedor)) idxCat.set(e.proveedor, []);
      idxCat.get(e.proveedor).push({ categoria: e.categoria, subcategoria: e.subcategoria || "" });
    }
    const categorias = gastoPorCategoria(
      porProveedor.map((p) => ({ proveedor: p.proveedor, importe: p.importe })), idxCat);

    return {
      ok: true, local: local || null, q: q || null,
      desde: req.query.from || null, hasta: req.query.to || null,
      categoria: cats.length ? cats.join(",") : null,
      subcategoria: subs.length ? subs.join(",") : null,
      proveedor: String(req.query.proveedor || "").trim() || null,
      catalogoCategorias: CATALOGO,
      categorias,
      grupos,
      lineas: sueltas,
      totales: {
        importe: Math.round(grupos.reduce((s, g) => s + g.importe, 0) * 100) / 100,
        productos: grupos.length,
      },
      // Los albaranes que ya trae su factura y por eso no se cuentan dos veces.
      albaranesYaFacturados: dobles?.n || 0,
      // Si hay más productos distintos de los que caben, se dice: el total sería el de los
      // 300 que más gasto tienen y se leería como el de todos.
      topeProductos: filas.length >= TOPE_PRODUCTOS ? TOPE_PRODUCTOS : 0,
      cobertura: {
        facturas: cobertura?.total || 0,
        conDetalle: cobertura?.con_detalle || 0,
        descuadradas: cobertura?.descuadradas || 0,
        // Separadas a propósito: «todavía sin leer» se arregla con un botón, «no se pudo
        // leer» no. Meterlas en el mismo saco haría prometer algo que no va a pasar.
        sinLeer: cobertura?.sin_leer || 0,
        noLeibles: cobertura?.no_leibles || 0,
        noAplica: cobertura?.no_aplica || 0,
      },
    };
}

// ── El diccionario de productos ─────────────────────────────────────────────
// La cola de trabajo: qué descripciones no se han revisado todavía, ordenadas POR EL DINERO
// QUE MUEVEN. Con cientos de textos distintos, las veinte primeras confirmaciones cubren la
// mayor parte del histórico; por orden alfabético no termina nadie.
app.get("/api/facturas/diccionario", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    // LA COLA se puede acotar a un establecimiento; EL DICCIONARIO no. Son cosas distintas:
    // un producto es el mismo en Blanes y en Lloret —de eso va unificar, de poder comparar el
    // precio entre locales—, pero la cola de revisión sí conviene poder despacharla por sitio:
    // «lo que compro en Blanes» de una sentada, en vez de las siete mezcladas.
    const local = localScope(req) || String(req.query.local || "").trim();
    const cond = ["a.clave IS NULL", "COALESCE(l.clave,'') <> ''", SIN_DUDAS], par = [];
    if (local) { cond.push("f.local = ?"); par.push(local); }
    const pendientes = await dbAll(
      `SELECT l.clave, MAX(l.descripcion) AS descripcion, SUM(l.importe)::float AS gasto,
              COUNT(*)::int AS veces, string_agg(DISTINCT f.proveedor, ' · ') AS proveedores
         FROM factura_lineas l JOIN facturas f ON f.id = l.factura_id
         LEFT JOIN producto_alias a ON a.clave = l.clave
        WHERE ${cond.join(" AND ")}
        GROUP BY l.clave ORDER BY gasto DESC NULLS LAST LIMIT 200`, par);

    const productos = await dbAll(
      `SELECT p.id, p.nombre, COUNT(a.clave)::int AS alias,
              -- Las formas de escribirlo, para poder quitar UNA sin cargarse el producto: si
              -- se acepta una unión por error, deshacerla no puede costar deshacer las demás.
              COALESCE(json_agg(json_build_object('clave', a.clave, 'descripcion', a.descripcion)
                       ORDER BY a.descripcion) FILTER (WHERE a.clave IS NOT NULL), '[]') AS formas
         FROM productos_canonicos p LEFT JOIN producto_alias a ON a.producto_id = p.id
        GROUP BY p.id, p.nombre ORDER BY p.nombre`, []);

    // Cuánto gasto está ya revisado. Es el número que dice si merece la pena seguir: no
    // «cuántas faltan» —siempre faltarán— sino cuánto dinero cubre lo decidido.
    // La cobertura se mide sobre lo mismo que la cola: si la cola es de Blanes y el «ya
    // revisado» fuera de los siete locales, el porcentaje no diría nada de lo que se está
    // mirando.
    const resueltos = await dbAll(
      `SELECT SUM(l.importe)::float AS gasto
         FROM factura_lineas l JOIN facturas f ON f.id = l.factura_id
         JOIN producto_alias a ON a.clave = l.clave
        WHERE ${SIN_DUDAS}${local ? " AND f.local = ?" : ""} GROUP BY a.clave`, local ? [local] : []);

    res.json({
      ok: true,
      cola: colaDeTrabajo(pendientes, productos),
      productos,
      cobertura: cobertura(resueltos, pendientes),
      local: local || null,
      hayMas: pendientes.length >= 200,
    });
  } catch (e) {
    console.error("[facturas] diccionario:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar el diccionario" });
  }
});

// Confirmar una: unir a un producto que ya existe, crear uno nuevo, o dejarla aparte.
// NADA se une solo, ni con un 95 % de parecido: unir dos productos que no son el mismo
// estropea el histórico de los dos a la vez y ya no hay forma de saber cuál era cuál.
app.post("/api/facturas/diccionario", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const clave = String(req.body?.clave || "").trim();
    if (!clave) return res.status(400).json({ ok: false, error: "Falta el producto" });
    const quien = req.user?.nombre || req.user?.username || null;
    const ahora = isoConOffset(Date.now());
    const descripcion = String(req.body?.descripcion || "").trim() || null;

    let productoId = null;
    if (req.body?.aparte) {
      productoId = null;                                   // revisado, pero no se une a nada
    } else if (req.body?.nombre_nuevo) {
      const nombre = String(req.body.nombre_nuevo).trim().slice(0, 120);
      if (!nombre) return res.status(400).json({ ok: false, error: "El nombre no puede estar vacío" });
      const ya = await dbGet(`SELECT id FROM productos_canonicos WHERE LOWER(nombre) = LOWER(?)`, [nombre]);
      if (ya) productoId = ya.id;
      else {
        const r = await dbRun(
          `INSERT INTO productos_canonicos (nombre, creado_por, creado_en) VALUES (?, ?, ?) RETURNING id`,
          [nombre, quien, ahora]);
        productoId = r?.id;
      }
    } else {
      productoId = Number(req.body?.producto_id);
      if (!Number.isInteger(productoId)) return res.status(400).json({ ok: false, error: "Falta a qué producto se une" });
      const existe = await dbGet(`SELECT id FROM productos_canonicos WHERE id = ?`, [productoId]);
      if (!existe) return res.status(404).json({ ok: false, error: "Ese producto ya no existe" });
    }

    await dbRun(
      `INSERT INTO producto_alias (clave, producto_id, descripcion, confirmado_por, confirmado_en)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (clave) DO UPDATE SET producto_id = EXCLUDED.producto_id,
         descripcion = EXCLUDED.descripcion, confirmado_por = EXCLUDED.confirmado_por,
         confirmado_en = EXCLUDED.confirmado_en`,
      [clave, productoId, descripcion, quien, ahora]);

    res.json({ ok: true, producto_id: productoId });
  } catch (e) {
    console.error("[facturas] confirmar diccionario:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar" });
  }
});

/**
 * UNIFICAR VARIOS PRODUCTOS DE UNA VEZ, desde la propia lista de Productos.
 *
 * Hasta ahora, para juntar «Calamar Andalusa Xipiron» con «Albarà 2026-AL-43429 … CALAMAR
 * ANDALUSA» había que irse al diccionario, buscarlos y confirmarlos uno a uno — y los ves
 * juntos en la lista, uno debajo del otro, con el mismo importe. Se decide donde se ve.
 *
 * Las claves llegan como las enseña la lista: «p:12» si ya es un producto del diccionario, o
 * la clave normalizada si es una descripción suelta. De ahí los tres casos, resueltos aquí y
 * no en el navegador para que sea UNA operación y no cinco peticiones a medio terminar.
 */
app.post("/api/facturas/diccionario/unificar", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const entradas = (Array.isArray(req.body?.productos) ? req.body.productos : [])
      .map((p) => ({ clave: String(p?.clave || "").trim(), descripcion: String(p?.descripcion || "").trim() || null }))
      .filter((p) => p.clave);
    if (entradas.length < 2) return res.status(400).json({ ok: false, error: "Elige al menos dos productos" });
    const nombre = String(req.body?.nombre || "").trim().slice(0, 120);
    if (!nombre) return res.status(400).json({ ok: false, error: "Falta el nombre del producto" });

    const quien = req.user?.nombre || req.user?.username || null;
    const ahora = isoConOffset(Date.now());
    const ids = [], sueltas = [];
    for (const e of entradas) {
      const m = /^p:(\d+)$/.exec(e.clave);
      if (m) ids.push(Number(m[1])); else sueltas.push(e);
    }

    // El que se queda: si ya había productos del diccionario, el primero —y se le pone el
    // nombre elegido—. Si no había ninguno, se crea uno.
    let destino = ids[0] ?? null;
    if (destino != null) {
      const existe = await dbGet(`SELECT id FROM productos_canonicos WHERE id = ?`, [destino]);
      if (!existe) return res.status(404).json({ ok: false, error: "Ese producto ya no existe" });
      await dbRun(`UPDATE productos_canonicos SET nombre = ? WHERE id = ?`, [nombre, destino]);
    } else {
      const ya = await dbGet(`SELECT id FROM productos_canonicos WHERE LOWER(nombre) = LOWER(?)`, [nombre]);
      destino = ya ? ya.id
        : (await dbRun(`INSERT INTO productos_canonicos (nombre, creado_por, creado_en) VALUES (?, ?, ?) RETURNING id`,
            [nombre, quien, ahora]))?.id;
    }

    // Los demás productos se vacían en el destino. Primero se mueven sus formas de escribirlo
    // y LUEGO se borran: al revés, el borrado en cascada se las llevaría por delante y
    // volverían todas a la cola.
    let movidas = 0;
    for (const otro of ids.slice(1)) {
      const n = await dbGet(`SELECT count(*)::int AS n FROM producto_alias WHERE producto_id = ?`, [otro]);
      await dbRun(`UPDATE producto_alias SET producto_id = ? WHERE producto_id = ?`, [destino, otro]);
      await dbRun(`DELETE FROM productos_canonicos WHERE id = ?`, [otro]);
      movidas += n?.n || 0;
    }

    // Y las descripciones sueltas se enganchan como una forma más de escribirlo.
    for (const e of sueltas) {
      await dbRun(
        `INSERT INTO producto_alias (clave, producto_id, descripcion, confirmado_por, confirmado_en)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (clave) DO UPDATE SET producto_id = EXCLUDED.producto_id,
           descripcion = EXCLUDED.descripcion, confirmado_por = EXCLUDED.confirmado_por,
           confirmado_en = EXCLUDED.confirmado_en`,
        [e.clave, destino, e.descripcion, quien, ahora]);
      movidas += 1;
    }

    res.json({ ok: true, producto_id: destino, nombre, formas: movidas,
      mensaje: `«${nombre}» junta ahora ${movidas + (ids.length ? 1 : 0)} forma(s) de escribirlo.` });
  } catch (e) {
    console.error("[facturas] unificar:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron unificar" });
  }
});

// Corregir un producto del diccionario. Sin esto, una errata al crearlo se queda para
// siempre: y las erratas se cometen justo en los primeros veinte, que es cuando aún no se ha
// cogido el gusto a nombrarlos.
app.put("/api/facturas/productos/:id", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const nombre = String(req.body?.nombre || "").trim().slice(0, 120);
    if (!Number.isInteger(id) || !nombre) return res.status(400).json({ ok: false, error: "Falta el nombre" });
    const choca = await dbGet(`SELECT id FROM productos_canonicos WHERE LOWER(nombre) = LOWER(?) AND id <> ?`, [nombre, id]);
    if (choca) return res.status(409).json({ ok: false, error: "Ya hay otro producto con ese nombre. Puedes fusionarlos." });
    await dbRun(`UPDATE productos_canonicos SET nombre = ? WHERE id = ?`, [nombre, id]);
    res.json({ ok: true, mensaje: "Nombre cambiado. Todas sus formas de escribirlo siguen apuntando aquí." });
  } catch (e) {
    console.error("[facturas] renombrar producto:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cambiar el nombre" });
  }
});

// Fusionar dos: pasa a ser uno solo. Es lo que hace falta cuando el mismo producto se creó dos
// veces con nombres distintos — que pasa, y sin esto el diccionario acaba con el mismo problema
// que venía a resolver.
app.post("/api/facturas/productos/:id/fusionar", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const destino = Number(req.params.id);
    const origen = Number(req.body?.origen);
    if (!Number.isInteger(destino) || !Number.isInteger(origen)) return res.status(400).json({ ok: false, error: "Faltan los productos" });
    if (destino === origen) return res.status(400).json({ ok: false, error: "Son el mismo producto" });
    const d = await dbGet(`SELECT id, nombre FROM productos_canonicos WHERE id = ?`, [destino]);
    const o = await dbGet(`SELECT id, nombre FROM productos_canonicos WHERE id = ?`, [origen]);
    if (!d || !o) return res.status(404).json({ ok: false, error: "Alguno ya no existe" });

    // Primero se repuntan los alias y LUEGO se borra: al revés, el borrado en cascada se
    // llevaría por delante las formas de escribirlo y volverían todas a la cola.
    // Cuántas formas se mueven: se cuentan antes, porque `dbRun` devuelve la fila de RETURNING
    // y no el número de filas tocadas (eso era de SQLite, y aquí ya no hay SQLite).
    const cuantas = await dbGet(`SELECT count(*)::int AS n FROM producto_alias WHERE producto_id = ?`, [origen]);
    await dbRun(`UPDATE producto_alias SET producto_id = ? WHERE producto_id = ?`, [destino, origen]);
    await dbRun(`DELETE FROM productos_canonicos WHERE id = ?`, [origen]);
    res.json({ ok: true, movidos: cuantas?.n || 0,
      mensaje: `«${o.nombre}» ahora es «${d.nombre}»${cuantas?.n ? `, con sus ${cuantas.n} forma(s) de escribirlo` : ""}.` });
  } catch (e) {
    console.error("[facturas] fusionar productos:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron fusionar" });
  }
});

// Borrar un producto del diccionario. Sus formas de escribirlo VUELVEN a la cola: no se pierde
// trabajo, se deshace. Por eso se dice cuántas son antes de borrar.
app.delete("/api/facturas/productos/:id", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "Falta el producto" });
    const n = await dbGet(`SELECT count(*)::int AS n FROM producto_alias WHERE producto_id = ?`, [id]);
    await dbRun(`DELETE FROM productos_canonicos WHERE id = ?`, [id]);
    res.json({ ok: true, vueltas: n?.n || 0,
      mensaje: `Borrado. ${n?.n || 0} forma(s) de escribirlo vuelven a la cola.` });
  } catch (e) {
    console.error("[facturas] borrar producto:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo borrar" });
  }
});

// Deshacer: la descripción vuelve a la cola. Equivocarse tiene que costar un clic, no un
// vaciado de tabla — si no, nadie se atreve a decidir.
app.delete("/api/facturas/diccionario/:clave", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    await dbRun(`DELETE FROM producto_alias WHERE clave = ?`, [String(req.params.clave || "")]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "No se pudo deshacer" });
  }
});

/**
 * La lista de productos, en CSV. Para pasársela al gestor, mirarla en una hoja o compararla
 * con otra cosa: hoy no había ninguna salida de esta pantalla.
 *
 * Sale lo MISMO que se está viendo —mismos filtros, mismo orden—: un CSV que no coincide con
 * la pantalla de la que salió es peor que no tenerlo.
 */
app.get("/api/facturas/compras.csv", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const locales = localesScope(req);
    const datos = locales.length > 1
      ? fusionarCompras(await Promise.all(locales.map((l) => comprasDeLocal(req.query, l))), { locales })
      : await comprasDeLocal(req.query, locales[0] || null);

    const header = ["Producto", "Proveedores", "Veces", "Cantidad", "Unidad", "Gastado", "Precio normal", "Ultimo precio", "Variacion %", "Primera compra", "Ultima compra"];
    const c = (v) => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    // Coma decimal y punto y coma de separador: es lo que Excel en español abre a la primera.
    const n2 = (x) => (x == null ? "" : String(Math.round(Number(x) * 100) / 100).replace(".", ","));
    const lines = (datos.grupos || []).map((g) => [
      g.descripcion, (g.proveedores || []).join(" · "), g.veces, n2(g.cantidad), g.unidad || "",
      n2(g.importe), n2(g.precioNormal), n2(g.ultimoPrecio), n2(g.variacionPct), g.primera, g.ultima,
    ].map(c).join(";"));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="productos-${(datos.grupos || []).length}.csv"`);
    res.send("\ufeff" + [header.join(";"), ...lines].join("\r\n") + "\r\n");
  } catch (e) {
    console.error("[facturas] compras csv:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo exportar" });
  }
});

app.get("/api/facturas/compras", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const locales = localesScope(req);
    if (locales.length > 1) {
      // Una petición por local y se suman. Ver src/modules/facturas/compras-fusion.js: lo
      // delicado no es sumar, es no sumar dos veces lo que ya viene junto.
      const partes = [];
      for (const l of locales) partes.push(await comprasDeLocal(req.query, l));
      return res.json(fusionarCompras(partes, { locales }));
    }
    res.json(await comprasDeLocal(req.query, locales[0] || null));
  } catch (e) {
    console.error("[facturas] compras:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron cargar las compras" });
  }
});

// ── Locales mal guardados ────────────────────────────────────────────────────
// Antes el campo `local` era texto libre y acabaron conviviendo «La Tapeta - Lloret»,
// «Lloret» y «BLANES» en la misma columna: filtrando por el nombre bueno faltaban
// facturas y el gasto por local salía repartido entre nombres que son el mismo sitio.
// Las puertas de entrada ya están cerradas; esto arregla lo que quedó.
// Todas las veces que hemos comprado un producto, con el enlace a cada factura. Es la
// pregunta que se hace de verdad cuando algo falta o ha subido: «¿cuándo lo compré y a
// cuánto?», y luego «enséñame ese papel».
app.get("/api/facturas/compras/producto", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    // Un producto del diccionario llega como «p:12» —así lo agrupa la lista— y sus compras
    // son las de TODAS sus formas de escribirlo. Pasarlo por `claveProducto` lo convertía en
    // el texto «p 12», que no es la clave de nada: el histórico salía vacío justo en los
    // productos ya unificados, que son los que más interesa mirar.
    const crudo = String(req.query.clave || req.query.q || "").trim();
    const unificado = /^p:(\d+)$/.exec(crudo);
    const clave = unificado ? crudo : claveProducto(crudo);
    if (!clave) return res.status(400).json({ ok: false, error: "Falta el producto" });
    const cond = [], par = [];
    if (unificado) { cond.push("l.clave IN (SELECT clave FROM producto_alias WHERE producto_id = ?)"); par.push(Number(unificado[1])); }
    else { cond.push("l.clave = ?"); par.push(clave); }
    const local = localScope(req) || String(req.query.local || "").trim();
    if (local) { cond.push("f.local = ?"); par.push(local); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || ""))) { cond.push("f.fecha >= ?"); par.push(req.query.from); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || ""))) { cond.push("f.fecha <= ?"); par.push(req.query.to); }

    const compras = await dbAll(
      `SELECT l.id AS linea_id, l.descripcion, l.cantidad::float AS cantidad, l.unidad,
              l.precio_unitario::float AS precio_unitario, l.importe::float AS importe, l.dudosa,
              l.precio_bruto::float AS precio_bruto, l.descuento_pct::float AS descuento_pct,
              l.factor_unidad::float AS factor_unidad,
              f.id AS factura_id, f.fecha, f.proveedor, f.local, f.numero_factura, f.drive_url
         FROM factura_lineas l JOIN facturas f ON f.id = l.factura_id
        WHERE ${cond.join(" AND ")}
        ORDER BY f.fecha DESC NULLS LAST, f.id DESC LIMIT 500`, par);

    // El nombre que se enseña es el más frecuente, no el de la última factura: si un
    // proveedor lo escribió raro una vez, esa vez no debe rebautizar el producto entero.
    const cuenta = new Map();
    for (const c of compras) cuenta.set(c.descripcion, (cuenta.get(c.descripcion) || 0) + 1);
    // Si está en el diccionario manda SU nombre: es el que alguien decidió a mano, y verlo
    // cambiar al abrir el histórico haría dudar de si es el mismo producto.
    const canonico = unificado ? await dbGet("SELECT nombre FROM productos_canonicos WHERE id = ?", [Number(unificado[1])]) : null;
    const nombre = canonico?.nombre || [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || req.query.clave;

    const conPrecio = compras.filter((c) => c.precio_unitario != null);
    res.json({
      ok: true, clave, nombre, compras,
      nombres: [...cuenta.keys()],
      resumen: {
        veces: compras.length,
        cantidad: compras.reduce((s2, c) => s2 + (Number(c.cantidad) || 0), 0),
        importe: Math.round(compras.reduce((s2, c) => s2 + (Number(c.importe) || 0), 0) * 100) / 100,
        proveedores: [...new Set(compras.map((c) => c.proveedor).filter(Boolean))],
        precioMin: conPrecio.length ? Math.min(...conPrecio.map((c) => c.precio_unitario)) : null,
        precioMax: conPrecio.length ? Math.max(...conPrecio.map((c) => c.precio_unitario)) : null,
        precioUltimo: conPrecio[0]?.precio_unitario ?? null,
        dudosas: compras.filter((c) => c.dudosa).length,
      },
    });
  } catch (e) {
    console.error("[facturas] historial producto:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar el historial" });
  }
});

// ── Pagos: qué hay que pagar y cuándo ───────────────────────────────────────
// La pregunta de los lunes. Hasta ahora sabíamos CUÁNTO se debe (un total) pero no CUÁNDO, y
// un total de deuda no se paga: se pagan facturas con fecha. Ver src/modules/facturas/vencimiento.js.
//
// Los albaranes quedan fuera: son la entrega, no el pago —su importe ya va en la factura que
// los agrupa— y meterlos aquí sería pagar dos veces lo mismo. Las dudosas también: mientras no
// se decida si están repetidas, ni cuentan en los totales ni se pagan.
app.get("/api/facturas/pagos", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const locales = localesScope(req);
    const cond = [SIN_DUDAS, SIN_ALBARANES, "COALESCE(pagado,0) = 0"];
    const par = [];
    if (locales.length) { cond.push(`local = ANY(?)`); par.push(locales); }
    const filas = await dbAll(
      `SELECT id, local, empresa, proveedor, nif, fecha, numero_factura, total::float AS total,
              vencimiento, vencimiento_origen, drive_url, revisar
         FROM facturas WHERE ${cond.join(" AND ")}
        ORDER BY vencimiento NULLS LAST, fecha LIMIT 2000`, par);

    // Quién paga por recibo mensual: hace falta para juntar sus facturas en un solo cargo, que
    // es como llega al banco. Una consulta para todos, no una por factura.
    const reglas = await dbAll(
      `SELECT prov_clave, empresa, modo, domiciliado FROM facturas_pago_reglas`, []).catch(() => []);
    // Clave doble: la regla de la empresa manda sobre la general (`empresa = ''`).
    const porClaveEmpresa = new Map(reglas.map((r) => [`${r.prov_clave}|${r.empresa || ""}`, r]));
    for (const f of filas) {
      const clave = claveProveedor(f.proveedor);
      const c = porClaveEmpresa.get(`${clave}|${f.empresa || ""}`) || porClaveEmpresa.get(`${clave}|`);
      f.prov_clave = clave;
      f.recibo = c?.modo === "mensual";
      f.domiciliado = !!Number(c?.domiciliado);
    }

    // Hora de MADRID y no UTC: `hoyISO()` es UTC y entre medianoche y las dos de la mañana en
    // verano devuelve el día de ayer. Aquí eso significaría enseñar como «vence hoy» algo que
    // venció ayer, justo a la hora en que se cierra caja. (Deuda conocida en el resto; en lo
    // nuevo se usa el módulo que ya sabe de husos.)
    const hoy = instanteMadrid(new Date()).fecha;
    // Primero se juntan los recibos —doce facturas de Grau del 15 de agosto son UN cargo de
    // 3.450 €— y luego se reparten por urgencia. Al revés, el mismo recibo saldría partido
    // entre «esta semana» y «más adelante».
    const grupos = agruparPagos(agruparRecibos(filas), hoy);
    // Los proveedores que salen sin fecha y NO tienen condiciones puestas: es lo que hay que
    // arreglar para que esta pantalla deje de tener un grupo de «no se sabe».
    const sinFecha = grupos.find((g) => g.clave === "sin_fecha");
    const provsSinCondiciones = [...new Set((sinFecha?.facturas || []).map((f) => f.proveedor).filter(Boolean))].slice(0, 12);
    res.json({ ok: true, hoy, grupos, resumen: resumenPagos(grupos), provsSinCondiciones });
  } catch (e) {
    console.error("[facturas] pagos:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron cargar los pagos" });
  }
});

// Las condiciones de pago de un proveedor. Al guardarlas se RECALCULAN sus facturas sin pagar,
// pero solo las que tenían la fecha calculada: si el vencimiento venía escrito en el papel,
// manda el papel y no se toca.
app.put("/api/facturas/proveedor-pago", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const nombre = String(req.body?.proveedor || "").trim();
    const clave = claveProveedor(nombre);
    if (!nombre || !clave) return res.status(400).json({ ok: false, error: "Falta el proveedor" });

    // Vacío = la regla GENERAL, la que vale para todas las empresas del grupo. Con nombre =
    // la excepción de esa empresa, que manda sobre la general.
    const empresa = String(req.body?.empresa || "").trim();
    const modo = req.body?.modo === "mensual" ? "mensual" : "dias";
    // Quitar las condiciones es dejar vacío lo que define el modo: los días, o el día del recibo.
    const quitar = modo === "mensual"
      ? (req.body?.dia_pago === null || req.body?.dia_pago === "" || req.body?.dia_pago === undefined)
      : (req.body?.dias === null || req.body?.dias === "");

    if (quitar) {
      await dbRun(`DELETE FROM facturas_pago_reglas WHERE prov_clave = ? AND empresa = ?`, [clave, empresa]);
    } else {
      const diaBruto = req.body?.dia_pago;
      const diaPago = diaBruto === null || diaBruto === "" || diaBruto === undefined ? null : Number(diaBruto);
      if (diaPago !== null && (!Number.isInteger(diaPago) || diaPago < 1 || diaPago > 31)) {
        return res.status(400).json({ ok: false, error: "El día de pago tiene que estar entre 1 y 31" });
      }
      const domiciliado = req.body?.domiciliado ? 1 : 0;
      let dias = null, meses = 1;

      if (modo === "mensual") {
        // El día ES la condición: sin él no hay recibo que valga.
        if (diaPago === null) return res.status(400).json({ ok: false, error: "Falta el día en que pasa el recibo" });
        meses = Number(req.body?.meses_despues);
        if (!Number.isInteger(meses) || meses < 0 || meses > 12) meses = 1;
      } else {
        dias = Number(req.body?.dias);
        if (!Number.isInteger(dias) || dias < 0 || dias > 365) {
          return res.status(400).json({ ok: false, error: "Los días de pago tienen que ser un número entre 0 y 365" });
        }
      }

      await dbRun(
        `INSERT INTO facturas_pago_reglas (prov_clave, proveedor, empresa, dias, dia_pago, modo, meses_despues, domiciliado, actualizado_por, actualizado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (prov_clave, empresa) DO UPDATE SET proveedor = EXCLUDED.proveedor, dias = EXCLUDED.dias,
           dia_pago = EXCLUDED.dia_pago, modo = EXCLUDED.modo, meses_despues = EXCLUDED.meses_despues,
           domiciliado = EXCLUDED.domiciliado,
           actualizado_por = EXCLUDED.actualizado_por, actualizado_en = EXCLUDED.actualizado_en`,
        [clave, nombre, empresa, dias, diaPago, modo, meses, domiciliado, req.user?.nombre || req.user?.username || null, isoConOffset(Date.now())]);
    }

    // Recalcular las suyas: sin pagar y con la fecha calculada (o sin fecha). Las que traían el
    // vencimiento escrito en la factura NO se tocan.
    // El proveedor se filtra por CLAVE y eso no lo sabe hacer el SQL (une «GRAU, S.L.» con
    // «Grau Distribucions»), así que se traen las candidatas y se criban aquí. Una consulta,
    // no una por factura.
    const candidatas = await dbAll(
      `SELECT id, fecha, proveedor, empresa FROM facturas
        WHERE COALESCE(pagado,0) = 0 AND COALESCE(vencimiento_origen,'') <> 'factura'
          AND proveedor IS NOT NULL AND proveedor <> ''`, []);

    // Cada factura coge la regla de SU empresa (o la general si esa empresa no tiene la suya),
    // así que se resuelven las condiciones una vez por empresa y no una por factura.
    const porEmpresa = new Map();
    const condDe = async (emp) => {
      const k = String(emp || "");
      if (!porEmpresa.has(k)) porEmpresa.set(k, await condicionesDePago(dbGet, nombre, k));
      return porEmpresa.get(k);
    };

    let tocadas = 0;
    for (const f of candidatas) {
      if (claveProveedor(f.proveedor) !== clave) continue;
      const v = calcularVencimiento({ fecha: f.fecha, condiciones: await condDe(f.empresa) });
      await dbRun(`UPDATE facturas SET vencimiento = ?, vencimiento_origen = ? WHERE id = ?`,
        [v.vencimiento, v.origen, f.id]);
      tocadas++;
    }
    const cond = await condicionesDePago(dbGet, nombre, empresa);
    const deQuien = empresa ? ` de ${empresa}` : "";
    res.json({ ok: true, condiciones: cond, recalculadas: tocadas,
      mensaje: quitar
        ? `Regla${deQuien ? " " + deQuien : " general"} quitada. Se han recalculado ${tocadas} factura(s) suyas sin pagar.`
        : `Guardado${deQuien}. Se han puesto fechas a ${tocadas} factura(s) suyas sin pagar.` });
  } catch (e) {
    console.error("[facturas] condiciones de pago:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron guardar las condiciones" });
  }
});

// Ficha de un proveedor: sus datos, su gasto y cómo se le ha corregido el nombre.
app.get("/api/facturas/proveedor", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const nombre = String(req.query.nombre || "").trim();
    if (!nombre) return res.status(400).json({ ok: false, error: "Falta el proveedor" });
    const clave = claveProveedor(nombre);
    const nombres = await dbAll(`SELECT DISTINCT proveedor FROM facturas WHERE proveedor IS NOT NULL AND proveedor <> ''`);
    const suyos = nombres.map((x) => x.proveedor).filter((x) => claveProveedor(x) === clave);
    if (!suyos.length) suyos.push(nombre);

    const [datos, nifs, cats, alias] = await Promise.all([
      dbGet(`SELECT count(*)::int AS facturas, COALESCE(SUM(total),0)::float AS gasto,
                    MIN(fecha) AS primera, MAX(fecha) AS ultima
               FROM facturas WHERE proveedor = ANY(?) AND ${SIN_ALBARANES}`, [suyos]),
      dbAll(`SELECT nif, count(*)::int AS n FROM facturas WHERE proveedor = ANY(?) AND nif IS NOT NULL AND nif <> '' GROUP BY nif ORDER BY n DESC`, [suyos]),
      dbAll(`SELECT categoria, subcategoria FROM facturas_proveedor_cats WHERE prov_clave = ?`, [clave]),
      dbGet(`SELECT proveedor, nif, autor, creado_en FROM facturas_proveedor_alias WHERE clave = ?`, [clave]),
    ]);
    // Las condiciones de pago, para poder ponerlas desde la misma ficha: es donde se mira
    // cuando llega su factura y donde se sabe la respuesta.
    // TODAS sus reglas de pago: la general y las excepciones por empresa. El mismo proveedor
    // puede pasarle el recibo del 15 a una empresa del grupo y cobrarle al contado a otra.
    const reglas = (await dbAll(
      `SELECT empresa, dias, dia_pago, modo, meses_despues, domiciliado, actualizado_por, actualizado_en
         FROM facturas_pago_reglas WHERE prov_clave = ? ORDER BY (empresa <> ''), empresa`, [clave]).catch(() => []))
      .map((r) => ({ ...r, empresa: r.empresa || "", modo: r.modo || "dias", domiciliado: !!Number(r.domiciliado),
        texto: textoCondiciones({ ...r, modo: r.modo || "dias", domiciliado: !!Number(r.domiciliado) }) }));
    const pago = reglas.find((r) => !r.empresa) || null;   // la general, para compatibilidad
    // Las empresas del grupo van EN LA FICHA y no se cogen de lo que hubiera cargado la
    // pantalla: la ficha se abre también desde Pagos, y allí no se ha pasado por Configuración
    // — el desplegable salía vacío y no se podía poner una regla a una empresa.
    const empresas = (await dbAll(
      `SELECT DISTINCT empresa FROM facturas_locales WHERE empresa IS NOT NULL AND empresa <> '' ORDER BY empresa`, [])
      .catch(() => [])).map((r) => r.empresa);
    res.json({ ok: true, proveedor: nombre, clave, nombres: suyos, ...datos,
      nifs, categorias: cats, alias: alias || null,
      pago: pago || null, pagoTexto: pago ? textoCondiciones(pago) : null, reglasPago: reglas, empresas });
  } catch (e) {
    console.error("[facturas] ficha proveedor:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar la ficha" });
  }
});

// Los proveedores que son el mismo metido varias veces. NO se une nada: se propone.
app.get("/api/facturas/proveedores-duplicados", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    // Una fila por forma de escribirlo, con su NIF más repetido: es la señal que permite ver
    // que «GRAU» y «Vins i Licors Grau, S.A.» son la misma empresa, cosa que por el nombre no
    // se puede saber.
    const filas = await dbAll(
      `SELECT f.proveedor, count(*)::int AS facturas, SUM(f.total)::float AS gasto,
              (SELECT n.nif FROM facturas n
                WHERE n.proveedor = f.proveedor AND n.nif IS NOT NULL AND n.nif <> ''
                GROUP BY n.nif ORDER BY count(*) DESC LIMIT 1) AS nif
         FROM facturas f
        WHERE f.proveedor IS NOT NULL AND f.proveedor <> '' AND COALESCE(f.dup_estado,'') <> 'duda' 
        GROUP BY f.proveedor ORDER BY gasto DESC NULLS LAST`, []);

    res.json({ ok: true, grupos: gruposDuplicados(filas).slice(0, 40), proveedores: filas.length });
  } catch (e) {
    console.error("[facturas] proveedores duplicados:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron buscar los repetidos" });
  }
});

// Corregir el nombre de un proveedor Y APRENDERLO para las siguientes.
app.put("/api/facturas/proveedor", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const client = await pool.connect();
  try {
    const antiguo = String(req.body?.antiguo || "").trim();
    const nuevo = String(req.body?.nuevo || "").trim();
    if (!antiguo || !nuevo) return res.status(400).json({ ok: false, error: "Faltan el nombre antiguo y el nuevo" });
    if (nuevo.length < 2) return res.status(400).json({ ok: false, error: "El nombre nuevo es demasiado corto" });
    const clave = claveProveedor(antiguo);
    if (!clave) return res.status(400).json({ ok: false, error: "Ese proveedor no se reconoce" });

    await client.query("BEGIN");
    const q = (sql, p = []) => client.query(toPositional(sql), p);
    // Todas las formas en que se escribió ese mismo proveedor.
    const todos = (await q(`SELECT DISTINCT proveedor FROM facturas WHERE proveedor IS NOT NULL AND proveedor <> ''`)).rows
      .map((x) => x.proveedor).filter((x) => claveProveedor(x) === clave);
    // El NIF más repetido: es el ancla para las próximas, aunque el nombre se lea distinto.
    const nifRow = todos.length
      ? (await q(`SELECT nif FROM facturas WHERE proveedor = ANY(?) AND nif IS NOT NULL AND nif <> '' GROUP BY nif ORDER BY count(*) DESC LIMIT 1`, [todos])).rows[0]
      : null;
    const nifActual = nifRow?.nif || null;
    const nifNuevo = String(req.body?.nif || "").trim() || null;
    const nif = nifNuevo || nifActual;

    // Cambiar el NIF es más delicado que cambiar el nombre: el NIF es el ancla con la que se
    // reconoce al proveedor en las siguientes facturas, y si se pone el de OTRO se fusionan
    // dos proveedores distintos y su gasto se mezcla sin que nadie lo note. Se comprueba.
    if (nifNuevo && nifActual && normNif(nifNuevo) !== normNif(nifActual)) {
      const deOtro = (await q(
        `SELECT DISTINCT proveedor FROM facturas WHERE nif IS NOT NULL
           AND REPLACE(REPLACE(REPLACE(UPPER(nif),' ',''),'-',''),'.','') = ?
           AND NOT (proveedor = ANY(?))`, [normNif(nifNuevo), todos.length ? todos : [""]])).rows;
      if (deOtro.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false,
          error: `Ese NIF ya es de «${deOtro[0].proveedor}». Si de verdad son el mismo proveedor, corrige antes el nombre de los dos para que se unifiquen; si no, revisa el NIF.` });
      }
    }

    let cambiadas = 0;
    if (req.body?.aplicarHistorico !== false && todos.length) {
      cambiadas = (await q(`UPDATE facturas SET proveedor = ? WHERE proveedor = ANY(?)`, [nuevo, todos])).rowCount || 0;
      // El NIF solo se pisa si se ha pedido cambiarlo: si no, se deja el que traía cada una.
      if (nifNuevo) await q(`UPDATE facturas SET nif = ? WHERE proveedor = ANY(?)`, [nifNuevo, todos]);
    }
    await q(`INSERT INTO facturas_proveedor_alias (clave, nif, proveedor, autor, creado_en)
             VALUES (?, ?, ?, ?, ?) ON CONFLICT (clave) DO UPDATE SET nif = EXCLUDED.nif, proveedor = EXCLUDED.proveedor,
               autor = EXCLUDED.autor, creado_en = EXCLUDED.creado_en`,
      [clave, nif, nuevo, req.user.nombre || req.user.username, isoConOffset(Date.now())]);
    // Y también con la clave del nombre NUEVO, para que no se deshaga si alguien lo relee.
    const claveNueva = claveProveedor(nuevo);
    if (claveNueva && claveNueva !== clave) {
      await q(`INSERT INTO facturas_proveedor_alias (clave, nif, proveedor, autor, creado_en)
               VALUES (?, ?, ?, ?, ?) ON CONFLICT (clave) DO NOTHING`,
        [claveNueva, nif, nuevo, req.user.nombre || req.user.username, isoConOffset(Date.now())]);
    }
    await client.query("COMMIT");
    await ficAuditar("facturas", null, "proveedor_renombrado", req.user.nombre || req.user.username,
      { detalle: { antiguo, nuevo, nif, nifAntiguo: nifActual, facturas: cambiadas } });
    const cambioNif = nifNuevo && nifActual && normNif(nifNuevo) !== normNif(nifActual);
    res.json({ ok: true, cambiadas, nif,
      mensaje: `${cambiadas} ${cambiadas === 1 ? "factura corregida" : "facturas corregidas"}${cambioNif ? ` (nombre y NIF)` : ""}. A partir de ahora entrará como «${nuevo}».` });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[facturas] renombrar proveedor:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar" });
  } finally { client.release(); }
});

// ── Conciliación de albaranes con facturas ──────────────────────────────────
// El proveedor deja un albarán por entrega y a fin de mes manda UNA factura que las agrupa.
// Aquí se propone qué albaranes componen cada factura. Se PROPONE: confirmarlo es de una
// persona, porque dar por buena una conciliación equivocada es peor que no tener ninguna —se
// paga la factura creyendo que está comprobada. Ver src/modules/facturas/conciliacion.js.
app.get("/api/facturas/conciliacion", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const scope = localScope(req);
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || "")) ? req.query.from : null;
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || "")) ? req.query.to : null;
    const cond = [SIN_DUDAS], par = [];
    if (scope) { cond.push("local = ?"); par.push(scope); }
    if (desde) { cond.push("fecha >= ?"); par.push(desde); }
    if (hasta) { cond.push("fecha <= ?"); par.push(hasta); }
    const where = "WHERE " + cond.join(" AND ");

    const docs = await dbAll(
      `SELECT id, local, tipo, fecha, numero_factura, proveedor, nif, concepto,
              base_imponible::float AS base_imponible, total::float AS total, drive_url,
              conciliado_con, conciliado_por, conciliado_en
         FROM facturas ${where} ORDER BY fecha DESC NULLS LAST LIMIT 1500`, par);

    // Los albaranes se comparan contra un margen MÁS ANCHO que el periodo pedido: la factura
    // de agosto recoge entregas de julio, y si solo se miraran las de agosto no cuadraría nunca.
    const albDesde = desde ? new Date(Date.parse(desde) - 60 * 86400000).toISOString().slice(0, 10) : null;
    const albaranes = await dbAll(
      `SELECT id, local, tipo, fecha, numero_factura, proveedor, nif, total::float AS total, drive_url, conciliado_con
         FROM facturas WHERE ${SIN_DUDAS} AND tipo = 'albaran' ${scope ? "AND local = ?" : ""}
         ${albDesde ? "AND fecha >= ?" : ""} ${hasta ? "AND fecha <= ?" : ""}
         ORDER BY fecha LIMIT 3000`,
      [scope, albDesde, hasta].filter((x) => x != null));

    const sueltos = albaranes.filter((a) => !a.conciliado_con);
    const facturas = docs.filter((d) => (d.tipo || "factura") !== "albaran");
    // Lo que ya se dijo que NO va junto. Una sola consulta para todas las facturas del listado.
    const descartesIdx = indiceDescartes(facturas.length
      ? await dbAll(`SELECT factura_id, albaran_id FROM facturas_conciliacion_descartes WHERE factura_id = ANY(?)`,
          [facturas.map((f) => f.id)]).catch(() => [])
      : []);
    const propuestas = facturas.map((f) => {
      // Cerrada a mano: no lleva albarán y alguien lo ha dicho. Sale de la cola de revisión
      // pero no se esconde —tiene su filtro—, y se puede reabrir si el albarán aparece tarde.
      if (f.sin_albaran_por) {
        return { factura: f, estado: "cerrada", albaranes: [], candidatos: [], diferencia: 0,
          motivos: [`Sin albarán · lo marcó ${f.sin_albaran_por}${f.sin_albaran_en ? " el " + String(f.sin_albaran_en).slice(0, 10) : ""}`] };
      }
      if (f.conciliado_con) {
        const ids = (() => { try { return JSON.parse(f.conciliado_con); } catch { return []; } })();
        const ligados = albaranes.filter((a) => ids.includes(a.id));
        const est = estadoConciliada(f, ligados);
        // A medias se siguen ofreciendo los albaranes sueltos del proveedor: cuando llegue el
        // que falta, se añade sin deshacer lo que ya estaba comprobado.
        // También en las de a medias: si no, un descartado seguiría ofreciéndose ahí.
        const desc = descartadosDe(descartesIdx, f.id);
        const candidatos = est.estado === "conciliada-parcial"
          ? sueltos.filter((a) => MISMO_PROV(f, a) && !ids.includes(a.id) && !desc.has(String(a.id))) : [];
        return { factura: f, estado: est.estado, albaranes: ligados, candidatos,
          ligado: est.ligado, falta: est.falta,
          motivos: est.estado === "conciliada"
            ? [`Conciliada por ${f.conciliado_por || "alguien"}`]
            : [`${est.ligado.toFixed(2)} € comprobados de ${Number(f.total).toFixed(2)} €`,
               est.falta > 0 ? `faltan ${est.falta.toFixed(2)} € por llegar` : `hay ${Math.abs(est.falta).toFixed(2)} € ligados de más`],
          diferencia: est.falta };
      }
      const desc = descartadosDe(descartesIdx, f.id);
      // Los descartados, con su número: sin él, «2 descartados» no dice cuáles y no se pueden
      // recuperar. Se resuelven contra los albaranes ya cargados, sin otra consulta.
      const descartadosIds = albaranes.filter((a) => desc.has(String(a.id)))
        .map((a) => ({ id: a.id, numero_factura: a.numero_factura, fecha: a.fecha, total: a.total }));
      return { factura: f, ...proponerConciliacion(f, sueltos, { descartados: desc }), descartadosIds };
    });

    res.json({ ok: true, propuestas, resumen: resumenConciliacion(propuestas),
      albaranesSueltos: sueltos.length, totalAlbaranes: albaranes.length });
  } catch (e) {
    console.error("[facturas] conciliación:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo calcular la conciliación" });
  }
});

/**
 * CERRAR una factura que no lleva albarán, y punto.
 *
 * Hay proveedores que no dejan albarán nunca —la gestoría, el seguro, un servicio— y su factura
 * se queda para siempre en la lista de conciliación pidiendo algo que no va a llegar. Con
 * veinte así, la pantalla deja de servir: lo que hay que revisar se pierde entre lo que no.
 *
 * Se guarda QUIÉN lo dijo y CUÁNDO, porque es una decisión y no un dato del papel; y se puede
 * reabrir, porque a veces el albarán aparece un mes después.
 */
app.post("/api/facturas/:id/sin-albaran", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const f = await dbGet(`SELECT id, local, conciliado_con FROM facturas WHERE id = ?`, [req.params.id]);
    if (!f) return res.status(404).json({ ok: false, error: "Factura no encontrada" });
    if (!puedeAccederLocal(req, f.local)) return res.status(403).json({ ok: false, error: "Sin acceso" });
    const quien = req.user?.nombre || req.user?.username || null;

    if (req.body?.reabrir) {
      await dbRun(`UPDATE facturas SET sin_albaran_por = NULL, sin_albaran_en = NULL WHERE id = ?`, [f.id]);
      await ficAuditar("facturas", f.id, "sin_albaran_reabierta", quien, { local: f.local });
      return res.json({ ok: true, mensaje: "Vuelve a la lista de conciliación." });
    }
    // Si ya está conciliada, cerrarla como «sin albarán» sería contradecir lo que se ve.
    if (f.conciliado_con) return res.status(409).json({ ok: false, error: "Esta factura ya está conciliada con albaranes." });

    await dbRun(`UPDATE facturas SET sin_albaran_por = ?, sin_albaran_en = ? WHERE id = ?`,
      [quien, isoConOffset(Date.now()), f.id]);
    await ficAuditar("facturas", f.id, "sin_albaran", quien, { local: f.local });
    res.json({ ok: true, mensaje: "Cerrada: esta factura no lleva albarán." });
  } catch (e) {
    console.error("[facturas] sin albarán:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cerrar" });
  }
});

/**
 * DESCARTAR una propuesta: «este albarán NO es de esta factura».
 *
 * Es OTRA COSA que deshacer una conciliación. Deshacer suelta un albarán que estaba ligado;
 * descartar dice que nunca lo estuvo y que no vuelva a proponerse aquí. Por eso deshacer una
 * conciliación NO borra los descartes: son dos decisiones distintas de dos momentos distintos.
 *
 * Y es por PAREJA: el mismo albarán puede ser perfectamente de la factura del mes siguiente.
 */
app.post("/api/facturas/:id/descartar", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const f = await dbGet(`SELECT id, local FROM facturas WHERE id = ?`, [req.params.id]);
    if (!f) return res.status(404).json({ ok: false, error: "Factura no encontrada" });
    if (!puedeAccederLocal(req, f.local)) return res.status(403).json({ ok: false, error: "Sin acceso" });
    const ids = (Array.isArray(req.body?.albaranes) ? req.body.albaranes : []).map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ ok: false, error: "No hay albaranes que descartar" });

    // Si está LIGADO a esta factura, esto no es un descarte: es deshacer, y se hace por el otro
    // camino. Mezclar los dos dejaría un albarán suelto y además descartado, sin que se vea.
    const ligados = await dbAll(`SELECT id FROM facturas WHERE id = ANY(?) AND conciliado_con = ?`, [ids, String(f.id)]);
    if (ligados.length) {
      return res.status(409).json({ ok: false, error: "Ese albarán está conciliado con esta factura: deshaz la conciliación primero." });
    }

    const ahora = isoConOffset(Date.now());
    const quien = req.user?.nombre || req.user?.username || null;
    for (const albaranId of ids) {
      await dbRun(
        `INSERT INTO facturas_conciliacion_descartes (factura_id, albaran_id, local, motivo, autor, creado_en)
         VALUES (?,?,?,?,?,?) ON CONFLICT (factura_id, albaran_id) DO NOTHING`,
        [f.id, albaranId, f.local, String(req.body?.motivo || "").slice(0, 200) || null, quien, ahora]);
    }
    await ficAuditar("facturas", f.id, "conciliacion_descartada", quien, { local: f.local, detalle: { albaranes: ids } });
    res.json({ ok: true, descartados: ids.length });
  } catch (e) {
    console.error("[facturas] descartar conciliación:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo descartar" });
  }
});

// Recuperar un descarte hecho por error: vuelve a proponerse.
app.delete("/api/facturas/:id/descartar/:albaranId", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const f = await dbGet(`SELECT id, local FROM facturas WHERE id = ?`, [req.params.id]);
    if (!f) return res.status(404).json({ ok: false, error: "Factura no encontrada" });
    if (!puedeAccederLocal(req, f.local)) return res.status(403).json({ ok: false, error: "Sin acceso" });
    await dbRun(`DELETE FROM facturas_conciliacion_descartes WHERE factura_id = ? AND albaran_id = ?`,
      [f.id, Number(req.params.albaranId)]);
    await ficAuditar("facturas", f.id, "descarte_deshecho", req.user?.nombre || req.user?.username || null,
      { local: f.local, detalle: { albaran: Number(req.params.albaranId) } });
    res.json({ ok: true, mensaje: "Vuelve a proponerse." });
  } catch (e) {
    console.error("[facturas] recuperar descarte:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo recuperar" });
  }
});

app.post("/api/facturas/:id/conciliar", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const f = await dbGet(`SELECT id, local, proveedor, total::float AS total FROM facturas WHERE id = ?`, [req.params.id]);
    if (!f) return res.status(404).json({ ok: false, error: "Factura no encontrada" });
    if (!puedeAccederLocal(req, f.local)) return res.status(403).json({ ok: false, error: "Sin acceso" });
    const ids = Array.isArray(req.body?.albaranes) ? req.body.albaranes.map(Number).filter(Boolean) : [];
    const quien = req.user.nombre || req.user.username;

    if (!ids.length) {   // deshacer
      await dbRun(`UPDATE facturas SET conciliado_con = NULL, conciliado_por = NULL, conciliado_en = NULL WHERE id = ?`, [f.id]);
      await dbRun(`UPDATE facturas SET conciliado_con = NULL WHERE conciliado_con = ?`, [String(f.id)]).catch(() => {});
      await ficAuditar("facturas", f.id, "conciliacion_deshecha", quien, { local: f.local });
      return res.json({ ok: true, mensaje: "Conciliación deshecha." });
    }
    // Un albarán solo puede pertenecer a UNA factura: si no, se pagaría dos veces lo mismo.
    // Los que ya estaban ligados a ESTA factura no cuentan: se está reenviando la lista entera
    // para añadir uno nuevo, que es como se completa una conciliación a medias.
    const yaUsados = (await dbAll(`SELECT id, conciliado_con FROM facturas WHERE id = ANY(?) AND conciliado_con IS NOT NULL`, [ids]))
      .filter((a) => String(a.conciliado_con) !== String(f.id));
    if (yaUsados.length) {
      return res.status(409).json({ ok: false, error: `Ya hay ${yaUsados.length} albarán(es) conciliados con otra factura. Deshaz esa conciliación primero.` });
    }
    // Los que estaban ligados a esta factura y ya no vienen en la lista se sueltan: es como se
    // descarta uno que se había propuesto por error.
    await dbRun(`UPDATE facturas SET conciliado_con = NULL WHERE conciliado_con = ? AND NOT (id = ANY(?))`,
      [String(f.id), ids]).catch(() => {});
    await dbRun(`UPDATE facturas SET conciliado_con = ?, conciliado_por = ?, conciliado_en = ? WHERE id = ?`,
      [JSON.stringify(ids), quien, isoConOffset(Date.now()), f.id]);
    await dbRun(`UPDATE facturas SET conciliado_con = ? WHERE id = ANY(?)`, [String(f.id), ids]);
    await ficAuditar("facturas", f.id, "conciliada", quien, { local: f.local, detalle: { albaranes: ids, total: f.total } });
    res.json({ ok: true, mensaje: `Conciliada con ${ids.length} albarán(es).` });
  } catch (e) {
    console.error("[facturas] conciliar:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar" });
  }
});

// ── Posibles duplicados ─────────────────────────────────────────────────────
// Las que entraron con dudas: están guardadas pero apartadas de todos los totales hasta que
// alguien decida. Se enseñan EN PAREJA, con los motivos en palabras: «mismo proveedor, mismo
// importe, misma fecha y el número difiere en un carácter» se decide en dos segundos.
app.get("/api/facturas/duplicados", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const scope = localScope(req);
    const filas = await dbAll(
      `SELECT f.id, f.local, f.empresa, f.tipo, f.fecha, f.numero_factura, f.proveedor, f.nif,
              f.concepto, f.base_imponible::float AS base_imponible, f.total::float AS total,
              f.drive_url, f.canal, f.creado_en, f.dup_de, f.dup_motivos,
              o.id AS o_id, o.fecha AS o_fecha, o.numero_factura AS o_numero, o.proveedor AS o_proveedor,
              o.total::float AS o_total, o.drive_url AS o_drive_url, o.canal AS o_canal, o.local AS o_local
         FROM facturas f LEFT JOIN facturas o ON o.id = f.dup_de
        WHERE f.dup_estado = 'duda' ${scope ? "AND f.local = ?" : ""}
        ORDER BY f.id DESC LIMIT 200`, scope ? [scope] : []);
    const data = filas.map((f) => ({
      ...f,
      motivos: (() => { try { return JSON.parse(f.dup_motivos || "[]"); } catch { return []; } })(),
      original: f.o_id ? { id: f.o_id, fecha: f.o_fecha, numero_factura: f.o_numero, proveedor: f.o_proveedor,
        total: f.o_total, drive_url: f.o_drive_url, canal: f.o_canal, local: f.o_local } : null,
    }));
    res.json({ ok: true, data, total: data.length,
      importe: Math.round(data.reduce((s2, f) => s2 + (Number(f.total) || 0), 0) * 100) / 100 });
  } catch (e) {
    console.error("[facturas] duplicados:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron cargar" });
  }
});

// Decidir. `duplicada` la borra —es la copia, el original se queda—; `distinta` la deja contar.
app.post("/api/facturas/duplicados/:id/resolver", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const accion = String(req.body?.accion || "");
    if (!["duplicada", "distinta"].includes(accion)) {
      return res.status(400).json({ ok: false, error: "Hay que decir si es duplicada o distinta" });
    }
    const f = await dbGet(`SELECT * FROM facturas WHERE id = ? AND dup_estado = 'duda'`, [req.params.id]);
    if (!f) return res.status(404).json({ ok: false, error: "Esa factura ya no está pendiente de decidir" });
    if (localScope(req) && f.local !== localScope(req)) return res.status(403).json({ ok: false, error: "Sin acceso" });

    const quien = req.user.nombre || req.user.username;
    if (accion === "distinta") {
      await dbRun(`UPDATE facturas SET dup_estado = 'distinta', dup_resuelto_por = ?, dup_resuelto_en = ? WHERE id = ?`,
        [quien, isoConOffset(Date.now()), f.id]);
      await ficAuditar("facturas", f.id, "duplicado_descartado", quien, { local: f.local, detalle: { parecida_a: f.dup_de } });
      // Vuelve a contar, así que su mes hay que reproyectarlo al Sheet.
      resincronizarSheetsFactura({ getToken: getDriveAccessToken, dbGet, dbAll, dbRun }, f.local, f.fecha).catch(() => {});
      return res.json({ ok: true, accion, mensaje: "Marcada como distinta: ya cuenta en los totales." });
    }

    // Es duplicada: se borra la copia. El archivo de Drive NO se toca —borrar el papel de
    // alguien no es reversible— pero se deja dicho dónde está por si hay que mirarlo.
    await ficAuditar("facturas", f.id, "duplicado_confirmado", quien, { local: f.local,
      detalle: { copia_de: f.dup_de, proveedor: f.proveedor, numero: f.numero_factura, total: f.total, drive_url: f.drive_url } });
    await dbRun("DELETE FROM factura_lineas WHERE factura_id = ?", [f.id]).catch(() => {});
    await dbRun("DELETE FROM facturas WHERE id = ?", [f.id]);
    res.json({ ok: true, accion, mensaje: "Descartada como duplicada. El archivo sigue en Drive." });
  } catch (e) {
    console.error("[facturas] resolver duplicado:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar la decisión" });
  }
});

// ── Categorías de proveedor ─────────────────────────────────────────────────
/**
 * Nombres de proveedor (tal como están escritos en las facturas) que pertenecen a alguna de
 * estas categorías.
 *
 * Se resuelve en JS y NO en SQL a propósito. La normalización de nombres —quitar «S.L.»,
 * acentos y puntuación— vive en claveProveedor(); reescribirla en SQL crearía una segunda
 * versión que el día que se toque una se queda desincronizada de la otra y el filtro empieza
 * a perder proveedores en silencio. Son unas decenas de nombres distintos: traerlos y
 * compararlos en memoria cuesta nada.
 */
async function proveedoresDeCategorias(cats, subs = []) {
  if (!cats.length && !subs.length) return [];
  const [etiquetas, nombres] = await Promise.all([
    subs.length
      ? dbAll(`SELECT prov_clave FROM facturas_proveedor_cats WHERE subcategoria = ANY(?)`, [subs])
      : dbAll(`SELECT prov_clave FROM facturas_proveedor_cats WHERE categoria = ANY(?)`, [cats]),
    dbAll(`SELECT DISTINCT proveedor FROM facturas WHERE proveedor IS NOT NULL AND proveedor <> ''`),
  ]);
  const claves = new Set(etiquetas.map((e) => e.prov_clave));
  return nombres.map((n) => n.proveedor).filter((n) => claves.has(claveProveedor(n)));
}

// Qué vende cada proveedor. Lista cerrada a propósito: si cada uno escribe «bebida»,
// «Bebidas» y «BEBIDA», el agrupar —que es para lo único que sirve esto— deja de funcionar.
app.get("/api/facturas/categorias", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const [etiquetas, provs] = await Promise.all([
      dbAll(`SELECT prov_clave, proveedor, categoria, subcategoria FROM facturas_proveedor_cats ORDER BY proveedor, categoria, subcategoria`),
      dbAll(`SELECT proveedor, count(*)::int AS facturas, COALESCE(SUM(total),0)::float AS gasto
               FROM facturas WHERE ${SIN_ALBARANES} AND proveedor IS NOT NULL AND proveedor <> ''
              GROUP BY proveedor ORDER BY COALESCE(SUM(total),0) DESC`),
    ]);
    const idx = indiceCategorias(etiquetas);
    // Los proveedores se agrupan por su clave: «GRAU, S.L.» y «Grau Distribucions» son uno.
    const mapa = new Map();
    for (const p of provs) {
      const k = claveProveedor(p.proveedor);
      if (!k) continue;
      if (!mapa.has(k)) mapa.set(k, { clave: k, proveedor: p.proveedor, nombres: [], facturas: 0, gasto: 0, categorias: idx.get(k) || [] });
      const g = mapa.get(k);
      g.nombres.push(p.proveedor); g.facturas += p.facturas; g.gasto += p.gasto;
    }
    const lista = [...mapa.values()].map((g) => ({ ...g, gasto: Math.round(g.gasto * 100) / 100 }))
      .sort((a, b) => b.gasto - a.gasto);
    const sinEtiquetar = lista.filter((p) => !p.categorias.length);
    res.json({ ok: true, catalogo: CATALOGO, proveedores: lista,
      sinEtiquetar: sinEtiquetar.length,
      // El gasto que hay detrás de lo que falta por etiquetar: es lo que dice si el aviso
      // urge o da igual. «3 proveedores sin categoría» no dice nada; «14.000 € sin repartir» sí.
      gastoSinEtiquetar: Math.round(sinEtiquetar.reduce((s2, p) => s2 + p.gasto, 0) * 100) / 100 });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudieron cargar las categorías" }); }
});

app.put("/api/facturas/categorias", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const client = await pool.connect();
  try {
    const proveedor = String(req.body?.proveedor || "").trim();
    const clave = claveProveedor(proveedor);
    if (!clave) return res.status(400).json({ ok: false, error: "Falta el proveedor" });
    // Cada entrada es {categoria, subcategoria}. Se valida el PAR: una subcategoría colgando
    // de la categoría equivocada rompería que la categoría sume exactamente sus subcategorías.
    const pedidas = Array.isArray(req.body?.categorias) ? req.body.categorias : [];
    const pares = [];
    for (const p of pedidas) {
      const par = normalizarPar(typeof p === "string" ? p : p?.categoria, typeof p === "string" ? "" : p?.subcategoria);
      if (!par) return res.status(400).json({ ok: false, error: `«${typeof p === "string" ? p : p?.categoria}» no está en la lista de categorías.` });
      if (!pares.some((x) => x.categoria === par.categoria && x.subcategoria === par.subcategoria)) pares.push(par);
    }
    await client.query("BEGIN");
    const q = (sql, p = []) => client.query(toPositional(sql), p);
    // Se reemplaza el juego entero: quitar una categoría es no mandarla.
    await q(`DELETE FROM facturas_proveedor_cats WHERE prov_clave = ?`, [clave]);
    for (const par of pares) {
      await q(`INSERT INTO facturas_proveedor_cats (prov_clave, proveedor, categoria, subcategoria, creado_en) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (prov_clave, categoria, subcategoria) DO NOTHING`,
        [clave, proveedor, par.categoria, par.subcategoria, isoConOffset(Date.now())]);
    }
    await client.query("COMMIT");
    res.json({ ok: true, proveedor, categorias: pares });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[facturas] categorías:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar" });
  } finally { client.release(); }
});

app.get("/api/facturas/locales-raros", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const filas = await dbAll(`SELECT local, count(*)::int AS n FROM facturas GROUP BY local`);
    // Los canales de entrada (grupo de WhatsApp, remitente, carpeta de Drive) son la causa:
    // lo que ponga ahí se copia en cada factura que llega. Se avisa aparte, porque arreglar
    // las facturas de ayer sin arreglar el canal es volver a empezar mañana.
    const canales = [];
    for (const [tabla, etiqueta] of [["facturas_grupos", "grupo de WhatsApp"], ["facturas_email_reglas", "remitente de email"], ["facturas_drive_carpetas", "carpeta de Drive"]]) {
      try {
        for (const r of await dbAll(`SELECT DISTINCT local FROM ${tabla}`)) {
          if (!esLocalCanonico(r.local)) canales.push({ tipo: etiqueta, valor: r.local || "", sugerido: canonizarLocal(r.local) });
        }
      } catch { /* la tabla puede no existir todavía en una instalación nueva */ }
    }
    res.json({ ok: true, data: agruparNoCanonicos(filas), canales, locales: LOCALES_CANON });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo comprobar" }); }
});

app.post("/api/facturas/locales-raros/arreglar", requireAuth(["direccion"]), async (req, res) => {
  const client = await pool.connect();
  try {
    // Cada cambio va explícito: {de: "Lloret", a: "La Tapeta - Lloret"}. No se aplica en
    // bloque «lo que el sistema crea» porque esto reescribe a qué local pertenece el gasto,
    // y equivocarse descuadra dos locales a la vez.
    const cambios = Array.isArray(req.body?.cambios) ? req.body.cambios : [];
    if (!cambios.length) return res.status(400).json({ ok: false, error: "No hay nada que cambiar" });
    for (const c of cambios) {
      if (!esLocalCanonico(c.a)) return res.status(400).json({ ok: false, error: `«${c.a}» no es ningún establecimiento.` });
    }

    await client.query("BEGIN");
    const q = (sql, p = []) => client.query(toPositional(sql), p);
    let n = 0, nCanales = 0;
    for (const c of cambios) {
      const r = c.de === "" || c.de == null
        ? await q(`UPDATE facturas SET local = ? WHERE local IS NULL OR local = ''`, [c.a])
        : await q(`UPDATE facturas SET local = ? WHERE local = ?`, [c.a, c.de]);
      n += r.rowCount || 0;
      // El mismo cambio en los canales de entrada: si no, mañana vuelven a entrar mal.
      if (c.de) {
        for (const t of ["facturas_grupos", "facturas_email_reglas", "facturas_drive_carpetas"]) {
          try { nCanales += (await q(`UPDATE ${t} SET local = ? WHERE local = ?`, [c.a, c.de])).rowCount || 0; }
          catch { /* tabla inexistente */ }
        }
      }
    }
    await client.query("COMMIT");
    await ficAuditar("facturas", null, "normalizar_locales", req.user.username, { detalle: { cambios, filas: n, canales: nCanales } });
    res.json({ ok: true, actualizadas: n, canales: nCanales,
      mensaje: `${n} ${n === 1 ? "factura vinculada" : "facturas vinculadas"} a su establecimiento` + (nCanales ? `, y ${nCanales} ${nCanales === 1 ? "canal de entrada corregido" : "canales de entrada corregidos"}.` : ".") });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[facturas] normalizar locales:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo aplicar" });
  } finally { client.release(); }
});

// Proveedores distintos que aparecen en las facturas, para el filtro. Con su número de
// facturas: así los que más se usan salen arriba y no hay que buscar en una lista larga.
app.get("/api/facturas/proveedores", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const scope = localScope(req) || String(req.query.local || "").trim();
    // Con su NIF: al corregir el proveedor de una factura, elegirlo tiene que traer también su
    // CIF —si no, se arregla un dato y se deja el otro mal, que es peor que no tocar nada—.
    // Se coge el NIF de su factura MÁS RECIENTE con NIF: si una empresa cambió de CIF, el
    // último es el bueno; y una errata vieja no puede pisar al de siempre.
    const filas = await dbAll(
      `SELECT proveedor, count(*)::int AS n,
              (array_agg(nif ORDER BY fecha DESC NULLS LAST, id DESC)
                 FILTER (WHERE COALESCE(nif,'') <> ''))[1] AS nif
         FROM facturas
        WHERE COALESCE(proveedor,'') <> '' ${scope ? "AND local = ?" : ""}
        GROUP BY proveedor ORDER BY n DESC, proveedor LIMIT 400`, scope ? [scope] : []);
    res.json({ ok: true, data: filas });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudieron cargar los proveedores" }); }
});

// ── Releer las facturas antiguas ─────────────────────────────────────────────
// Las facturas que entraron ANTES de que se leyera el detalle no lo tienen, así que sin
// esto la pantalla de compras solo sabría de las nuevas y la pregunta «cuántas Coca-Colas
// desde marzo» no tendría respuesta hasta dentro de meses.
//
// Va POR TANDAS y no de una vez: cada factura es una descarga de Drive más una lectura con
// el modelo, y meter cientos en una sola petición acabaría en un tiempo de espera agotado
// a la mitad, sin saber por dónde iba. Es idempotente: se puede repetir sin duplicar nada.
let _releyendo = false;

app.get("/api/facturas/lineas/pendientes", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const scope = localScope(req);
    const r = await dbGet(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE lineas_estado IS NULL)::int AS sin_detalle,
              count(*) FILTER (WHERE lineas_estado IS NULL AND drive_url IS NOT NULL)::int AS releibles
       FROM facturas ${scope ? "WHERE local = ?" : ""}`, scope ? [scope] : []);
    res.json({
      ok: true, total: r?.total || 0, sinDetalle: r?.sin_detalle || 0, releibles: r?.releibles || 0,
      sinArchivo: (r?.sin_detalle || 0) - (r?.releibles || 0),
      enCurso: _releyendo,
    });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo comprobar" }); }
});

/**
 * RECUADRAR las líneas ya guardadas cuya cantidad venía en paquetes.
 *
 * El caso: «UDS. PACK 3 · P. UNIDAD 0,52 · IMPORTE 234 € · TOTAL 121,49 €». La cantidad
 * quedó en 3 y el precio en 40,50 € «por unidad», cuando lo que se paga son 0,27 € por
 * cápsula. Aquí NO se vuelve a leer ningún PDF ni se llama al modelo: la propia línea guardada
 * ya lo dice dos veces, y esto es aritmética sobre lo que hay.
 *
 * EL IMPORTE NO SE TOCA. Cambia cómo se reparte, nunca cuánto se pagó: por eso la suma con la
 * base imponible de cada factura sigue cuadrando igual y no hay nada que revisar después.
 */
const SQL_RECUADRE = `
  WITH cand AS (
    SELECT id, cantidad, precio_bruto, importe,
           (COALESCE(importe_bruto, importe) / precio_bruto / cantidad) AS f
      FROM factura_lineas
     WHERE cantidad > 0 AND precio_bruto > 0 AND COALESCE(importe_bruto, importe) IS NOT NULL
       AND abs(cantidad * precio_bruto - COALESCE(importe_bruto, importe)) > 0.02)`;

app.get("/api/facturas/lineas/paquetes", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const r = await dbGet(`${SQL_RECUADRE}
      SELECT count(*)::int AS n FROM cand WHERE f >= 2 AND abs(f - round(f)) < 0.01`);
    res.json({ ok: true, n: r?.n || 0 });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo comprobar", n: 0 }); }
});

app.post("/api/facturas/lineas/recuadrar", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const antes = await dbGet(`${SQL_RECUADRE}
      SELECT count(*)::int AS n FROM cand WHERE f >= 2 AND abs(f - round(f)) < 0.01`);
    await dbRun(`${SQL_RECUADRE}
      UPDATE factura_lineas l
         SET cantidad = c.cantidad * round(c.f),
             factor_unidad = round(c.f),
             -- La unidad de la factura («PACK») deja de valer: eran 3 packs, ahora son 450
             -- unidades, y «450 PACK» sería peor que no decir nada.
             unidad = 'ud',
             precio_unitario = round(l.importe / (c.cantidad * round(c.f)), 2)
        FROM cand c
       WHERE l.id = c.id AND c.f >= 2 AND abs(c.f - round(c.f)) < 0.01`);
    res.json({ ok: true, arregladas: antes?.n || 0 });
  } catch (e) {
    console.error("[facturas] recuadrar:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron recuadrar" });
  }
});

/**
 * CORREGIR A MANO LA LECTURA DE UNA LÍNEA.
 *
 * El recuadre automático de arriba resuelve el caso en que la factura dice la verdad dos veces
 * (precio por unidad e importe). Pero hay facturas que solo ponen «3 PACK · 121,49 €» y no
 * dicen cuántas cápsulas trae el pack: eso no está escrito en ninguna parte y solo lo sabe
 * quien abre la caja. Para esas, esto.
 *
 * DOS REGLAS:
 * 1. El IMPORTE no se toca nunca. Es lo que se pagó y está en el papel: lo que se corrige es
 *    en cuántas unidades se reparte, no cuánto costó. Así la factura sigue cuadrando.
 * 2. Corregir una vale para las demás iguales, si se pide. El mismo proveedor factura el mismo
 *    producto igual todos los meses: arreglar una y dejar treinta mal sería trabajo tirado.
 */
/**
 * Vuelve a mirar si las líneas cuadran con la base imponible y actualiza el estado.
 *
 * Es lo que hace que la etiqueta de «descuadre» desaparezca sola al arreglar lo que estaba mal.
 * Sin esto, la factura se quedaría marcada para siempre y nadie volvería a mirarla.
 */
async function recalcularCuadre(facturaId, baseImponible) {
  const lineas = await dbAll(`SELECT importe::float AS importe, dudosa FROM factura_lineas WHERE factura_id = ?`, [facturaId]);
  const v = validarSuma(lineas, baseImponible);
  await dbRun(`UPDATE facturas SET lineas_estado = ?, lineas_aviso = ? WHERE id = ?`,
    [v.cuadra ? "ok" : "descuadre", mensajeValidacion(v), facturaId]);
  return v;
}

/**
 * BORRAR UNA LÍNEA QUE NO ES UN PRODUCTO.
 *
 * La lectura se cuela a veces con los SUBTOTALES: una línea «Cooperativa 128 €» que en realidad
 * es la suma de las de arriba. Contada como producto, infla el gasto, se cuela en «Qué
 * compramos» y descuadra la factura contra su base imponible — las tres cosas a la vez.
 *
 * Se borra y no se marca como «ignorada» porque no es un producto que no interese: es una línea
 * que nunca debió existir. El documento original sigue en Drive, que es donde vive la verdad.
 */
app.delete("/api/facturas/lineas/:id", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "Falta la línea" });
    const l = await dbGet(
      `SELECT l.id, l.descripcion, l.importe::float AS importe, f.id AS factura_id, f.local,
              f.base_imponible::float AS base_imponible
         FROM factura_lineas l JOIN facturas f ON f.id = l.factura_id WHERE l.id = ?`, [id]);
    if (!l) return res.status(404).json({ ok: false, error: "Esa línea ya no existe" });
    if (!puedeAccederLocal(req, l.local)) return res.status(403).json({ ok: false, error: "No puedes tocar ese establecimiento" });

    await dbRun(`DELETE FROM factura_lineas WHERE id = ?`, [id]);
    await ficAuditar("facturas", l.factura_id, "linea_borrada", req.user?.nombre || req.user?.username || null,
      { local: l.local, detalle: { descripcion: l.descripcion, importe: l.importe } });

    const v = await recalcularCuadre(l.factura_id, l.base_imponible);
    res.json({ ok: true, suma: v.suma, base: v.base, diferencia: v.diferencia ?? 0, cuadra: !!v.cuadra });
  } catch (e) {
    console.error("[facturas] borrar línea:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo borrar" });
  }
});

app.patch("/api/facturas/lineas/:id", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "Falta la línea" });
    const l = await dbGet(
      `SELECT l.id, l.cantidad::float AS cantidad, l.precio_unitario::float AS precio_unitario,
              l.importe::float AS importe, l.clave, f.id AS factura_id, f.proveedor, f.local,
              f.base_imponible::float AS base_imponible
         FROM factura_lineas l JOIN facturas f ON f.id = l.factura_id WHERE l.id = ?`, [id]);
    if (!l) return res.status(404).json({ ok: false, error: "Esa línea ya no existe" });
    if (!puedeAccederLocal(req, l.local)) return res.status(403).json({ ok: false, error: "No puedes tocar ese establecimiento" });

    const num = (v) => { if (v === undefined || v === null || v === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
    const cantidad = num(req.body?.cantidad) ?? l.cantidad;
    const unidad = req.body?.unidad !== undefined ? (String(req.body.unidad || "").trim().slice(0, 20) || null) : undefined;
    const importePedido = num(req.body?.importe);
    const precioPedido = num(req.body?.precio_unitario);

    if (cantidad != null && cantidad <= 0) return res.status(400).json({ ok: false, error: "La cantidad tiene que ser mayor que cero" });

    /**
     * QUÉ MANDA AL CORREGIR. Los tres números están atados —cantidad × precio = importe—, así
     * que tocar uno obliga a recalcular otro. Manda EL QUE SE HA ESCRITO:
     *   · si se corrige el importe (lo normal al arreglar un descuadre: se leyó 12,49 donde
     *     ponía 121,49), el precio se recalcula;
     *   · si se corrige el precio, se recalcula el importe;
     *   · si solo se corrige la cantidad, el importe se respeta y el precio se reparte.
     * Así lo que se acaba de teclear no se ve cambiado por detrás, que es lo que hace que
     * alguien deje de fiarse de una pantalla.
     */
    let importe = l.importe, precio = l.precio_unitario;
    if (importePedido != null) {
      importe = importePedido;
      precio = cantidad ? Math.round((importe / cantidad) * 100) / 100 : precio;
    } else if (precioPedido != null) {
      precio = precioPedido;
      importe = cantidad != null ? Math.round(precio * cantidad * 100) / 100 : importe;
    } else if (importe != null && cantidad) {
      precio = Math.round((importe / cantidad) * 100) / 100;
    }

    const factor = l.cantidad ? cantidad / l.cantidad : null;
    await dbRun(
      `UPDATE factura_lineas SET cantidad = ?, precio_unitario = ?, importe = ?,
              ${unidad !== undefined ? "unidad = ?," : ""}
              factor_unidad = ?, dudosa = FALSE WHERE id = ?`,
      unidad !== undefined
        ? [cantidad, precio, importe, unidad, factor && factor > 1 && Number.isInteger(factor) ? factor : null, id]
        : [cantidad, precio, importe, factor && factor > 1 && Number.isInteger(factor) ? factor : null, id]);

    // Las demás compras del MISMO producto al MISMO proveedor, con el mismo factor. Se guarda
    // el factor y no la cantidad: si un mes pidieron 5 packs y otro 8, la cantidad buena es
    // distinta pero el tamaño del paquete es el mismo.
    let tambien = 0;
    if (req.body?.aplicar_a_todas && factor && factor !== 1 && l.clave) {
      const otras = await dbAll(
        `SELECT l.id FROM factura_lineas l JOIN facturas f ON f.id = l.factura_id
          WHERE l.clave = ? AND f.proveedor = ? AND l.id <> ? AND l.cantidad > 0 AND l.importe IS NOT NULL`,
        [l.clave, l.proveedor, id]);
      for (const o of otras) {
        await dbRun(
          `UPDATE factura_lineas
              SET cantidad = round(cantidad * ?, 3),
                  ${unidad !== undefined ? "unidad = ?," : ""}
                  precio_unitario = round(importe / (cantidad * ?), 2),
                  factor_unidad = ?
            WHERE id = ?`,
          unidad !== undefined
            ? [factor, unidad, factor, Number.isInteger(factor) && factor > 1 ? factor : null, o.id]
            : [factor, factor, Number.isInteger(factor) && factor > 1 ? factor : null, o.id]);
      }
      tambien = otras.length;
    }

    const v = await recalcularCuadre(l.factura_id, l.base_imponible);

    res.json({ ok: true, cantidad, unidad, precio_unitario: precio, importe, tambien,
      suma: v.suma, base: v.base, diferencia: v.diferencia ?? 0, cuadra: !!v.cuadra });
  } catch (e) {
    console.error("[facturas] corregir línea:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo corregir" });
  }
});

app.post("/api/facturas/lineas/releer", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  if (_releyendo) return res.status(409).json({ ok: false, error: "Ya hay una relectura en marcha. Espera a que termine." });
  _releyendo = true;
  try {
    const scope = localScope(req);
    const tanda = Math.min(Math.max(Number(req.body?.tanda) || 15, 1), 40);
    const filas = await dbAll(
      `SELECT id, local, proveedor, numero_factura, fecha, base_imponible::float AS base_imponible, drive_url
       FROM facturas
       WHERE lineas_estado IS NULL AND drive_url IS NOT NULL ${scope ? "AND local = ?" : ""}
       ORDER BY fecha DESC NULLS LAST, id DESC LIMIT ?`,
      scope ? [scope, tanda] : [tanda]);

    const resultado = { leidas: 0, conAviso: 0, fallidas: 0, saltadas: 0, detalles: [] };
    for (const f of filas) {
      try {
        // El alquiler, la luz o el gestor no se leen: su línea no es un producto y cada
        // lectura cuesta una llamada al modelo. Se marca `no_aplica` para que no vuelva a
        // salir en la siguiente tanda.
        if (!(await proveedorConLineas(dbGet, f.proveedor))) {
          await dbRun(`UPDATE facturas SET lineas_estado = 'no_aplica', lineas_leidas_en = ? WHERE id = ?`, [isoConOffset(Date.now()), f.id]);
          resultado.saltadas += 1;
          resultado.detalles.push({ id: f.id, proveedor: f.proveedor, fecha: f.fecha, saltada: "gasto estructural" });
          continue;
        }
        const r = await releerLineasFactura({ factura: f, getToken: getDriveAccessToken, dbRun });
        resultado.leidas += 1;
        if (r.aviso) resultado.conAviso += 1;
        resultado.detalles.push({ id: f.id, proveedor: f.proveedor, fecha: f.fecha, lineas: r.n, aviso: r.aviso || null });
      } catch (e) {
        resultado.fallidas += 1;
        // Se marca para no volver a intentarlo en cada tanda: si no, una factura cuyo PDF
        // ya no está en Drive bloquearía el avance para siempre.
        await dbRun(`UPDATE facturas SET lineas_estado = 'no_leible', lineas_aviso = ?, lineas_leidas_en = ? WHERE id = ?`,
          [String(e.message || "").slice(0, 300), isoConOffset(Date.now()), f.id]).catch(() => {});
        resultado.detalles.push({ id: f.id, proveedor: f.proveedor, fecha: f.fecha, error: e.message });
        console.error(`[facturas] releer #${f.id}:`, e.message);
      }
    }

    const quedan = await dbGet(
      `SELECT count(*)::int AS n FROM facturas WHERE lineas_estado IS NULL AND drive_url IS NOT NULL ${scope ? "AND local = ?" : ""}`,
      scope ? [scope] : []);
    res.json({ ok: true, ...resultado, quedan: quedan?.n || 0 });
  } catch (e) {
    console.error("[facturas] releer:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo releer: " + e.message });
  } finally {
    _releyendo = false;
  }
});

// ── Repaso de las facturas ya guardadas ─────────────────────────────────────
// Las comprobaciones se han ido añadiendo con el tiempo y todas actúan sobre la factura que
// ENTRA: los descuentos por línea, los avisos de coherencia y la sospecha de duplicado. Las
// que ya estaban guardadas se quedaron como estaban, así que la contabilidad tiene dos mitades
// —la de antes, sin repasar, y la de ahora— y la de antes es la más grande.
//
// El repaso son DOS COSAS con costes muy distintos, y por eso son dos endpoints:
//   · Coherencia y duplicados: aritmética y comparaciones sobre lo que ya está en la base.
//     Ni una llamada al modelo, ni una descarga. Se puede repasar todo entero en un segundo.
//   · Descuentos por línea: hay que volver a leer el documento. Descarga de Drive + modelo por
//     factura, así que va por tandas y se puede parar, igual que «Leer las que faltan».
//
// Y mirar va SEPARADO de aplicar. Apartar una factura como dudosa la saca de TODOS los totales;
// enseñar antes lo que va a pasar no es un lujo cuando lo que se toca es un mes ya cerrado.
// Ver src/modules/facturas/repaso.js.

/** Las columnas que necesita el repaso. Se piden una vez y se reparten a las dos revisiones. */
const REPASO_COLS = `id, local, tipo, fecha, numero_factura, proveedor, nif,
   base_imponible::float AS base_imponible, porcentaje_iva::float AS porcentaje_iva,
   cuota_iva::float AS cuota_iva, total::float AS total, dup_estado, dup_de, revisar,
   lineas_estado, lineas_version, drive_url`;
// Techo de seguridad: el repaso carga las facturas en memoria para compararlas entre sí. Con
// unos miles va sobrado; poner un límite evita que el día que haya cientos de miles esto se
// convierta en una petición que tumba el proceso en vez de en una que dice que no puede.
const REPASO_MAX = 20000;

async function repasoCargar(scope) {
  return dbAll(`SELECT ${REPASO_COLS} FROM facturas ${scope ? "WHERE local = ?" : ""}
                ORDER BY id LIMIT ${REPASO_MAX}`, scope ? [scope] : []);
}

// Mirar. No escribe nada: dice qué cambiaría y cuánto.
app.get("/api/facturas/repaso", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const scope = localScope(req);
    const filas = await repasoCargar(scope);
    const r = repasarLote(filas);
    const alcance = esAlcanceValido(req.query?.alcance) ? String(req.query.alcance) : "faltan";
    const porReleer = filas.filter((f) => pideRelecturaDeLineas(f, alcance));
    res.json({
      ok: true,
      facturas: filas.length,
      tope: filas.length >= REPASO_MAX,
      ...resumenRepaso(r),
      porReleer: porReleer.length,
      alcance,
      // Cuántas hay en cada alcance, para poder elegir con el número delante y no a ciegas.
      alcances: ALCANCES_REPASO.map((a) => ({ ...a, n: filas.filter((f) => pideRelecturaDeLineas(f, a.clave)).length })),
      // Solo una muestra: la lista entera de una base grande no cabe en una pantalla ni en
      // una cabeza. Para verlas todas están la pestaña de facturas y la de duplicados.
      revisiones: r.revisiones.slice(0, 25),
      dudas: r.sospechas.slice(0, 25),
      enCurso: _releyendo,
    });
  } catch (e) {
    console.error("[facturas] repaso (mirar):", e.message);
    res.status(500).json({ ok: false, error: "No se pudo repasar: " + e.message });
  }
});

// Aplicar lo barato: escribir los avisos de coherencia y apartar las repetidas.
app.post("/api/facturas/repaso", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const scope = localScope(req);
    const conDuplicados = req.body?.duplicados !== false;
    const filas = await repasoCargar(scope);
    const r = repasarLote(filas);

    let avisos = 0;
    for (const v of r.revisiones) {
      await dbRun(`UPDATE facturas SET revisar = ? WHERE id = ?`,
        [v.textos.length ? JSON.stringify(v.textos) : null, v.id]);
      avisos++;
    }

    // `dup_estado IS NULL` en el WHERE y no solo en el módulo: entre mirar y aplicar puede
    // haber entrado una factura o haber decidido alguien, y lo que no se puede es pisar la
    // decisión de una persona con el resultado de un análisis de hace treinta segundos.
    let apartadas = 0;
    if (conDuplicados) {
      for (const s of r.sospechas) {
        const upd = await dbRun(
          `UPDATE facturas SET dup_estado = 'duda', dup_de = ?, dup_motivos = ?
            WHERE id = ? AND dup_estado IS NULL RETURNING id`,
          [s.contraId, JSON.stringify(s.motivos), s.id]);
        if (upd) {
          apartadas++;
          await ficAuditar("facturas", s.id, "duplicado_sospechado", req.user?.username || "sistema",
            { local: s.local, detalle: { parecida_a: s.contraId, motivos: s.motivos, origen: "repaso" } }).catch(() => {});
        }
      }
    }

    console.log(`[facturas] repaso aplicado${scope ? " (" + scope + ")" : ""}: ${avisos} avisos, ${apartadas} apartadas`);
    res.json({ ok: true, facturas: filas.length, avisos, apartadas, ...resumenRepaso(r),
      porReleer: filas.filter(pideRelecturaDeLineas).length });
  } catch (e) {
    console.error("[facturas] repaso (aplicar):", e.message);
    res.status(500).json({ ok: false, error: "No se pudo aplicar el repaso: " + e.message });
  }
});

// Lo caro: volver a leer el detalle de las que se leyeron con la versión de antes de los
// descuentos. Por tandas, con la misma mecánica que «Leer las que faltan».
app.post("/api/facturas/repaso/lineas", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  if (_releyendo) return res.status(409).json({ ok: false, error: "Ya hay una relectura en marcha. Espera a que termine." });
  _releyendo = true;
  try {
    const scope = localScope(req);
    const tanda = Math.min(Math.max(Number(req.body?.tanda) || 10, 1), 40);
    // Las que ya fallaron en esta pasada. No se marcan en la base como ilegibles —tienen su
    // detalle viejo, que sigue sirviendo— pero hay que saltarlas o la tanda siguiente volvería
    // a tropezar con las mismas y el contador no bajaría nunca.
    // El tope tiene que dar para una pasada entera: con «todas», aquí vienen TODAS las ya
    // releídas, y recortando a 500 la 501 volvería a salir y esto no terminaría.
    const saltar = (Array.isArray(req.body?.saltar) ? req.body.saltar : []).map(Number).filter(Number.isInteger).slice(0, 5000);
    // El ALCANCE. Que una factura esté marcada como leída con la versión de hoy no garantiza
    // que esté bien: si la lectura se cortó, se guardaron las líneas que llegaron y quedó
    // marcada igual. Por eso se puede pedir releer también las que no cuadran, o todas.
    const alcance = esAlcanceValido(req.body?.alcance) ? String(req.body.alcance) : "faltan";
    const cond = [`drive_url IS NOT NULL`, `lineas_estado IN ('ok','dudas','descuadre')`];
    const par = [];
    if (alcance === "faltan") { cond.push(`COALESCE(lineas_version, 1) < ?`); par.push(VERSION_LINEAS); }
    else if (alcance === "descuadre") cond.push(`lineas_estado = 'descuadre'`);
    if (scope) { cond.push("local = ?"); par.push(scope); }
    if (saltar.length) { cond.push(`NOT (id = ANY(?))`); par.push(saltar); }
    const filas = await dbAll(
      `SELECT id, local, proveedor, numero_factura, fecha, base_imponible::float AS base_imponible, drive_url
         FROM facturas WHERE ${cond.join(" AND ")}
        ORDER BY fecha DESC NULLS LAST, id DESC LIMIT ?`, [...par, tanda]);

    const r = { leidas: 0, conDescuento: 0, conAviso: 0, fallidas: 0, detalles: [] };
    for (const f of filas) {
      try {
        const antes = await dbGet(`SELECT count(*)::int AS n FROM factura_lineas WHERE factura_id = ?`, [f.id]);
        await releerLineasFactura({ factura: f, getToken: getDriveAccessToken, dbRun });
        const ahora = await dbGet(
          `SELECT count(*)::int AS n, count(*) FILTER (WHERE descuento_pct IS NOT NULL)::int AS con_dto
             FROM factura_lineas WHERE factura_id = ?`, [f.id]);
        r.leidas++;
        if (ahora?.con_dto) r.conDescuento++;
        r.detalles.push({ id: f.id, proveedor: f.proveedor, fecha: f.fecha,
          lineas: ahora?.n || 0, antes: antes?.n || 0, descuentos: ahora?.con_dto || 0 });
      } catch (e) {
        // Que falle una NO la marca como ilegible: su detalle de antes sigue guardado y sigue
        // valiendo. Lo único que pasa es que se queda sin los descuentos.
        r.fallidas++;
        r.detalles.push({ id: f.id, proveedor: f.proveedor, fecha: f.fecha, error: e.message });
        console.error(`[facturas] repaso líneas #${f.id}:`, e.message);
      }
    }

    const quedan = await dbGet(
      `SELECT count(*)::int AS n FROM facturas
        WHERE COALESCE(lineas_version, 1) < ? AND drive_url IS NOT NULL
          AND lineas_estado IN ('ok','dudas','descuadre') ${scope ? "AND local = ?" : ""}`,
      scope ? [VERSION_LINEAS, scope] : [VERSION_LINEAS]);
    res.json({ ok: true, ...r, quedan: Math.max(0, (quedan?.n || 0) - saltar.length - r.fallidas) });
  } catch (e) {
    console.error("[facturas] repaso líneas:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo releer: " + e.message });
  } finally {
    _releyendo = false;
  }
});

// El detalle de una factura concreta, para poder mirarlo cuando algo no cuadra.
app.get("/api/facturas/:id/lineas", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const f = await dbGet(`SELECT id, local, proveedor, numero_factura, fecha, base_imponible::float AS base_imponible,
                                  lineas_estado, lineas_aviso, drive_url FROM facturas WHERE id = ?`, [Number(req.params.id)]);
    if (!f) return res.status(404).json({ ok: false, error: "Factura no encontrada" });
    const scope = localScope(req);
    if (scope && f.local !== scope) return res.status(403).json({ ok: false, error: "Sin acceso" });
    const lineas = await dbAll(
      `SELECT id AS linea_id, orden, descripcion, cantidad::float AS cantidad, unidad, precio_unitario::float AS precio_unitario,
              importe::float AS importe, dudosa FROM factura_lineas WHERE factura_id = ? ORDER BY orden`, [f.id]);
    // La suma de las líneas, calculada aquí: es lo que hay que poner al lado de la base para
    // que «descuadre» deje de ser una etiqueta y pase a ser un número que se puede perseguir.
    const suma = Math.round(lineas.reduce((s2, l) => s2 + (Number(l.importe) || 0), 0) * 100) / 100;
    res.json({ ok: true, factura: f, lineas, suma,
      diferencia: f.base_imponible != null ? Math.round((suma - Number(f.base_imponible)) * 100) / 100 : null });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo cargar el detalle" }); }
});

// ── Fichas duplicadas ────────────────────────────────────────────────────────
// Informe primero, aplicar después, y nunca lo segundo sin lo primero. Ver
// src/modules/clientes/duplicados.js para el porqué de cada regla.
app.get("/api/clientes/duplicados", requireAuth(["direccion"]), async (req, res) => {
  try {
    const [grupos, aBorrar, avisoCorreo, resumen] = await Promise.all([
      dbAll(DUP.SQL_GRUPOS), dbAll(DUP.SQL_A_BORRAR), dbAll(DUP.SQL_AVISO_CORREO), dbGet(DUP.SQL_RESUMEN),
    ]);
    res.json({
      ok: true,
      grupos, aBorrar, avisoCorreo,
      total: Number(resumen?.total || 0),
      sinMovil: Number(resumen?.sin_movil || 0),
      personasDuplicadas: grupos.length,
      fichasABorrar: aBorrar.length,
    });
  } catch (e) {
    console.error("[clientes] duplicados:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo revisar: " + e.message });
  }
});

app.post("/api/clientes/duplicados/unificar", requireAuth(["direccion"]), async (req, res) => {
  const client = await pool.connect();
  try {
    // Se exige mandar de vuelta cuántas fichas se van a borrar, tal y como salieron en el
    // informe. Si entre medias ha entrado un lead nuevo el número no cuadra y no se aplica:
    // esto borra filas, y hacerlo sobre una foto vieja es exactamente lo que no debe pasar.
    const esperado = Number(req.body?.fichas_a_borrar);
    const ahora = await dbAll(DUP.SQL_A_BORRAR);
    if (!Number.isFinite(esperado)) return res.status(400).json({ ok: false, error: "Falta la confirmación del informe" });
    if (ahora.length !== esperado) {
      return res.status(409).json({
        ok: false,
        error: `El informe decía ${esperado} fichas y ahora hay ${ahora.length}. Vuelve a revisarlo antes de aplicar.`,
      });
    }
    if (!ahora.length) return res.json({ ok: true, borradas: 0, mensaje: "No hay nada que unificar." });

    const sufijo = DUP.sufijoCopia(new Date());
    await client.query("BEGIN");
    for (const sql of DUP.SQL_BACKUP(sufijo)) await client.query(sql);
    for (const sql of [...DUP.SQL_APLICAR, ...DUP.SQL_APLICAR_PREFS]) await client.query(sql);
    const quedan = (await client.query("SELECT COUNT(*)::int AS c FROM leads")).rows[0].c;
    await client.query("COMMIT");

    await ficAuditar("clientes", null, "unificar_duplicados", req.user.username, {
      detalle: { borradas: ahora.length, copia: sufijo, quedan } });
    console.log(`[clientes] duplicados unificados: ${ahora.length} fichas · copia en leads_backup_${sufijo}`);
    res.json({
      ok: true, borradas: ahora.length, quedan, copia: `leads_backup_${sufijo}`,
      mensaje: `${ahora.length} fichas unificadas. Copia de seguridad en leads_backup_${sufijo}.`,
    });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[clientes] unificar:", e.message);
    res.status(500).json({ ok: false, error: "No se aplicó nada (todo deshecho): " + e.message });
  } finally { client.release(); }
});

// Diagnóstico
app.get("/api/debug/estado", requireAuth(["direccion"]), async (req, res) => {
  try {
    const leads = await dbGet("SELECT COUNT(*) c FROM leads");
    const reservas = await dbGet("SELECT COUNT(*) c FROM reservas");
    const waClientes = await dbGet("SELECT COUNT(*) c FROM wa_clientes");
    const porFuente = await dbAll("SELECT fuente, COUNT(*) c FROM leads GROUP BY fuente");
    res.json({
      ok: true,
      leads_total: parseInt(leads?.c ?? 0),
      leads_por_fuente: porFuente,
      reservas_total: parseInt(reservas?.c ?? 0),
      wa_clientes_total: parseInt(waClientes?.c ?? 0),
      db_engine: "postgresql"
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/leads/export.csv", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const params = [];
    const sql = sqlContactosUnificados(req.query, params);
    const rows = await dbAll(sql, params);
    const header = "nombre,apellidos,telefono,correo,nacimiento,poblacion,genero,origen,ultima_actividad";
    const lines = rows.map((r) =>
      [r.nombre, r.apellidos, r.telefono, r.correo, r.nacimiento, r.poblacion, r.genero, r.origen, r.ultima_actividad]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="contactos.csv"`);
    res.send([header, ...lines].join("\n"));
  } catch (e) {
    res.status(500).send("Error exportando");
  }
});

// Contenidos
app.get("/api/content", async (req, res) => {
  try {
    const rows = await dbAll(`SELECT key, value FROM contents`);
    const data = {};
    rows.forEach((r) => { data[r.key] = r.value; });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error leyendo contenidos" });
  }
});

app.put("/api/content", requireAuth(["marketing", "direccion"]), async (req, res) => {
  const { key, value } = req.body;
  if (!key || typeof value !== "string") {
    return res.status(400).json({ ok: false, error: "Datos inválidos" });
  }
  const updated_at = new Date().toISOString();
  try {
    await dbRun(
      `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
      [key, value, updated_at]
    );
    return res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando contenido" });
  }
});

// ── Registro de contenidos editables (fuente única) ─────────────────────────
const WEB_LOCALES = [
  { slug: "la-tapeta-blanes", name: "La Tapeta Blanes" },
  { slug: "la-tapeta-lloret", name: "La Tapeta Lloret" },
  { slug: "la-tapeta-girona", name: "La Tapeta Girona" },
  { slug: "cooperativa", name: "Cooperativa" },
  { slug: "can-mateu", name: "Can Mateu" },
  { slug: "la-tapa-iberica", name: "La Tapa Ibérica" },
  { slug: "botiga-d-en-mateu", name: "Botiga d'en Mateu" },
  { slug: "viva-la-pepa", name: "Viva la Pepa" }
];

const LOCAL_FIELDS = [
  { suffix: "menu_pdf", label: "Carta", type: "pdf" },
  { suffix: "menu_almuerzo_pdf", label: "Menú mediodía", type: "pdf" },
  { suffix: "instagram", label: "Instagram", type: "url" },
  { suffix: "hours", label: "Horario", type: "text" },
  { suffix: "map", label: "Mapa", type: "url" },
  { suffix: "history", label: "Historia", type: "text" },
  { suffix: "gallery", label: "Galería de fotos", type: "gallery" }
];

const GLOBAL_FIELDS = {
  hero_eyebrow:       { label: "Etiqueta superior",     section: "Hero",      type: "text_i18n" },
  hero_title:         { label: "Título principal",      section: "Hero",      type: "text_i18n" },
  hero_sub:           { label: "Subtítulo",             section: "Hero",      type: "text_i18n" },
  hero_cta:           { label: "Botón 'Reservar'",      section: "Hero",      type: "text_i18n" },
  hero_cta_2:         { label: "Botón 'Ver locales'",   section: "Hero",      type: "text_i18n" },
  hero_image_url:     { label: "Imagen de fondo",       section: "Hero",      type: "image" },
  site_logo_url:      { label: "Logo del sitio",        section: "General",   type: "image" },
  companies_title:    { label: "Título sección locales",section: "Locales",   type: "text_i18n" },
  companies_sub:      { label: "Subtítulo locales",     section: "Locales",   type: "text_i18n" },
  gallery_title:      { label: "Título galería",        section: "Galería",   type: "text_i18n" },
  gallery_sub:        { label: "Subtítulo galería",     section: "Galería",   type: "text_i18n" },
  gallery_images:     { label: "Fotos de la galería",   section: "Galería",   type: "gallery" },
  reservations_title: { label: "Título reservas",       section: "Reservas",  type: "text_i18n" },
  reservations_sub:   { label: "Subtítulo reservas",    section: "Reservas",  type: "text_i18n" },
  reviews_title:      { label: "Título reseñas",        section: "Reseñas",   type: "text_i18n" },
  reviews_sub:        { label: "Valoración Google",     section: "Reseñas",   type: "text_i18n" },
  strip_title:        { label: "Franja: título",        section: "Descuento", type: "text_i18n" },
  strip_sub:          { label: "Franja: texto",         section: "Descuento", type: "text_i18n" },
  strip_cta:          { label: "Franja: botón",         section: "Descuento", type: "text_i18n" },
  popup_title:        { label: "Popup: título",         section: "Popup",     type: "text_i18n" },
  popup_text:         { label: "Popup: texto",          section: "Popup",     type: "text_i18n" },
  contact_title:      { label: "Título contacto",       section: "Contacto",  type: "text_i18n" },
  contact_text:       { label: "Texto contacto",        section: "Contacto",  type: "text_i18n" }
};

function getContentRegistry() {
  const campos = {};
  for (const [key, def] of Object.entries(GLOBAL_FIELDS)) campos[key] = { ...def, scope: "global" };
  for (const loc of WEB_LOCALES) {
    for (const f of LOCAL_FIELDS) {
      campos[`local_${loc.slug}_${f.suffix}`] = {
        label: `${f.label} de ${loc.name}`, section: loc.name, type: f.type, scope: "local", local: loc.slug
      };
    }
  }
  return { locales: WEB_LOCALES, campos };
}

function keyEnRegistro(key, campos) {
  if (campos[key]) return true;
  const m = key.match(/^(.*)_(es|ca|en)$/);
  return !!(m && campos[m[1]] && campos[m[1]].type === "text_i18n");
}

app.get("/api/content/registry", requireAuth(["marketing", "direccion"]), (req, res) => {
  res.json({ ok: true, ...getContentRegistry() });
});

app.put("/api/content/batch", requireAuth(["marketing", "direccion"]), async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items || !items.length) return res.status(400).json({ ok: false, error: "Sin cambios" });
  const { campos } = getContentRegistry();
  for (const it of items) {
    if (!it || typeof it.key !== "string" || typeof it.value !== "string") {
      return res.status(400).json({ ok: false, error: "Item inválido" });
    }
    if (!keyEnRegistro(it.key, campos)) {
      return res.status(400).json({ ok: false, error: `Campo no permitido: ${it.key}` });
    }
  }
  try {
    for (const it of items) {
      await dbRun(
        `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
        [it.key, it.value]
      );
    }
    res.json({ ok: true, count: items.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Upload
let _sharp;
async function getSharp() {
  if (_sharp === undefined) {
    try { _sharp = (await import("sharp")).default; }
    catch { _sharp = null; console.warn("[Upload] sharp no disponible; imágenes sin optimizar"); }
  }
  return _sharp;
}
const GS_AVAILABLE = (() => {
  try { execFileSync("gs", ["--version"], { stdio: "ignore" }); return true; }
  catch { return false; }
})();
if (!GS_AVAILABLE) console.warn("[Upload] ghostscript (gs) no disponible; PDFs sin comprimir");

async function optimizeUpload(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const orig = fs.statSync(filePath).size;
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      const sharp = await getSharp();
      if (!sharp) return;
      let img = sharp(filePath, { failOn: "none" }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true });
      if (ext === ".png") img = img.png({ compressionLevel: 9, palette: true });
      else if (ext === ".webp") img = img.webp({ quality: 78 });
      else img = img.jpeg({ quality: 78, mozjpeg: true });
      const out = await img.toBuffer();
      if (out.length > 0 && out.length < orig) fs.writeFileSync(filePath, out);
    } else if (ext === ".pdf" && GS_AVAILABLE) {
      const tmp = filePath + ".opt";
      execFileSync("gs", [
        "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.4", "-dPDFSETTINGS=/ebook",
        "-dNOPAUSE", "-dQUIET", "-dBATCH", `-sOutputFile=${tmp}`, filePath
      ], { stdio: "ignore", timeout: 180000 });
      if (fs.existsSync(tmp)) {
        const newSize = fs.statSync(tmp).size;
        if (newSize > 0 && newSize < orig) fs.renameSync(tmp, filePath);
        else fs.unlinkSync(tmp);
      }
    }
  } catch (e) {
    console.error("[Upload] Optimización falló (se conserva original):", e.message);
  }
}

app.post("/api/upload", requireAuth(["marketing", "rrhh", "direccion", "encargado"]), upload.array("files", 10), async (req, res) => {
  const files = req.files || [];
  for (const f of files) {
    await optimizeUpload(f.path || path.join(uploadsDir, f.filename));
  }
  const urls = files.map((f) => `/uploads/${f.filename}`);
  res.json({ ok: true, urls });
});

app.post("/api/uploads/optimize-existing", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const entries = fs.readdirSync(uploadsDir).filter(n => /\.(jpe?g|png|webp|pdf)$/i.test(n));
    const detalle = [];
    for (const name of entries) {
      const fp = path.join(uploadsDir, name);
      if (!fs.statSync(fp).isFile()) continue;
      const before = fs.statSync(fp).size;
      await optimizeUpload(fp);
      const after = fs.statSync(fp).size;
      if (after < before) detalle.push({ archivo: name, antes: Math.round(before / 1024) + " KB", despues: Math.round(after / 1024) + " KB" });
    }
    res.json({ ok: true, optimizados: detalle.length, revisados: entries.length, detalle });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Reservas
app.post("/api/reservas", async (req, res) => {
  const { local, personas, dia, hora, telefono, nombre_reserva } = req.body;
  if (!local || !personas || !dia || !hora || !telefono || !nombre_reserva) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  // La oficina y demás centros sin atención al público no admiten reservas. El formulario
  // ya no los ofrece, pero esto lo garantiza también si alguien llama a la API a mano.
  if (esLocalSinPublico(local)) {
    return res.status(400).json({ ok: false, error: "En ese centro no se pueden hacer reservas." });
  }
  const [y, m, d] = dia.split("-").map((n) => Number(n));
  const dayDate = new Date(y, m - 1, d);
  dayDate.setHours(0, 0, 0, 0);
  const nowDate = new Date();
  nowDate.setHours(0, 0, 0, 0);
  if (dayDate < nowDate) {
    return res.status(400).json({ ok: false, error: "Fecha inválida" });
  }
  if (dayDate.getTime() === nowDate.getTime()) {
    const [hh, mm] = hora.split(":").map((n) => Number(n));
    const now = new Date();
    if (hh * 60 + mm < now.getHours() * 60 + now.getMinutes()) {
      return res.status(400).json({ ok: false, error: "Hora inválida" });
    }
  }
  try {
    const bloqueo = await estaBloqueado(local, dia);
    if (bloqueo) {
      return res.status(400).json({
        ok: false,
        code: "reservas_bloqueadas",
        local,
        motivo: bloqueo.motivo || "",
        error: `En esas fechas no se aceptan reservas en ${local}${bloqueo.motivo ? ` (${bloqueo.motivo})` : ""}.`
      });
    }
  } catch (e) { console.error("Error comprobando bloqueo de reservas:", e.message); }

  try {
    const creado_en = new Date().toISOString();
    const rowRes = await dbRun(
      `INSERT INTO reservas (local, personas, dia, hora, telefono, nombre_reserva, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [local, personas, dia, hora, telefono, nombre_reserva, creado_en]
    );
    const reserva_id = rowRes.id;
    const pendiente = parseInt(personas) > 8;
    const reserva = { local, personas, dia, hora, telefono, nombre_reserva };
    upsertLeadFromReserva({ nombre_reserva, telefono });
    console.log(`[Reserva] WhatsApp listo: ${isReady()} | ${pendiente ? "PENDIENTE" : "Confirmación"} a ${telefono}`);
    if (pendiente) {
      if (isReady()) sendConfirmacionPendienteCliente(telefono, reserva);
      else guardarPendienteWA("confirmacion_pendiente", telefono, reserva);
    } else {
      if (isReady()) sendConfirmacionCliente(telefono, reserva);
      else guardarPendienteWA("confirmacion", telefono, reserva);
    }
    // Notificar grupo del local
    dbGet(`SELECT group_jid FROM wa_links WHERE local = ?`, [local]).then((row) => {
      console.log(`[Reserva] Grupo para "${local}": ${row?.group_jid || "NO CONFIGURADO"}`);
      if (row?.group_jid) {
        if (pendiente) {
          if (isReady()) sendNotificacionGrupoPendiente(row.group_jid, reserva);
          else guardarPendienteWA("grupo_pendiente", row.group_jid, reserva);
        } else {
          if (isReady()) sendNotificacionGrupo(row.group_jid, reserva);
          else guardarPendienteWA("grupo", row.group_jid, reserva);
        }
      }
    }).catch(() => {});
    return res.json({ ok: true, reserva_id, pendiente });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando reserva" });
  }
});

app.get("/api/reservas", requireAuth(["direccion", "encargado"]), async (req, res) => {
  try {
    const { from, to } = req.query;
    const scope = localScope(req);
    const local = scope || req.query.local; // encargado con local → siempre su local
    const where = [];
    const params = [];
    if (local) { where.push(`local = ?`); params.push(local); }
    if (from) { where.push(`dia >= ?`); params.push(from); }
    if (to) { where.push(`dia <= ?`); params.push(to); }
    // El historial pide de más reciente a más antigua y con tope: «todo el año pasado» de los
    // ocho locales son miles de filas, y nadie las lee. Se traen las últimas N y se dice que
    // hay más, en vez de tardar diez segundos y pintar una tabla infinita.
    const desc = String(req.query.orden || "") === "desc";
    const limite = Math.min(Math.max(Number(req.query.limit) || 0, 0), 3000);
    const sql = `SELECT * FROM reservas ${where.length ? "WHERE " + where.join(" AND ") : ""}`
      + ` ORDER BY dia ${desc ? "DESC" : "ASC"}, hora ${desc ? "DESC" : "ASC"}`
      + (limite ? ` LIMIT ${limite + 1}` : "");
    const rows = await dbAll(sql, params);
    const hayMas = limite > 0 && rows.length > limite;
    res.json({ ok: true, data: hayMas ? rows.slice(0, limite) : rows, hayMas });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error leyendo reservas" });
  }
});

app.delete("/api/reservas/:id", requireAuth(["encargado", "direccion"]), async (req, res) => {
  try {
    const reserva = await dbGet(`SELECT * FROM reservas WHERE id = ?`, [req.params.id]);
    if (!reserva) return res.status(404).json({ ok: false, error: "Reserva no encontrada" });
    const scope = localScope(req);
    if (scope && reserva.local !== scope) return res.status(403).json({ ok: false, error: "Sin permiso sobre esta reserva" });
    await dbRun("DELETE FROM reservas WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
    if (isReady()) {
      sendCancelacionCliente(reserva.telefono, reserva);
      dbGet(`SELECT group_jid FROM wa_links WHERE local = ?`, [reserva.local]).then((row) => {
        if (row?.group_jid) sendCancelacionGrupo(row.group_jid, reserva);
      }).catch(() => {});
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error eliminando reserva" });
  }
});

app.get("/api/reservas/export.csv", requireAuth(["direccion", "encargado", "contabilidad"]), async (req, res) => {
  try {
    const scope = localScope(req);
    const rows = scope
      ? await dbAll(`SELECT * FROM reservas WHERE local = ? ORDER BY creado_en DESC`, [scope])
      : await dbAll(`SELECT * FROM reservas ORDER BY creado_en DESC`);
    const header = "id,local,personas,dia,hora,telefono,nombre_reserva,creado_en";
    const lines = rows.map((r) =>
      [r.id, r.local, r.personas, r.dia, r.hora, r.telefono, r.nombre_reserva, r.creado_en]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="reservas.csv"`);
    res.send([header, ...lines].join("\n"));
  } catch (e) {
    res.status(500).send("Error exportando");
  }
});

// KPIs
app.get("/api/kpi", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const hoy = hoyISO();
    const mes = hoy.slice(0, 7);
    const mesLike = mes + "%";
    const [leads_total, leads_mes, reservas_total, reservas_hoy, reservas_mes, candidaturas,
           personas_hoy, personas_mes, reservas_por_local] = await Promise.all([
      dbGet(`SELECT COUNT(*) as v FROM leads`),
      dbGet(`SELECT COUNT(*) as v FROM leads WHERE (creado_en LIKE ? OR actualizado_en LIKE ?)`, [mesLike, mesLike]),
      dbGet(`SELECT COUNT(*) as v FROM reservas`),
      dbGet(`SELECT COUNT(*) as v FROM reservas WHERE dia = ?`, [hoy]),
      dbGet(`SELECT COUNT(*) as v FROM reservas WHERE dia LIKE ?`, [mesLike]),
      dbGet(`SELECT COUNT(*) as v FROM hr_applications`),
      dbGet(`SELECT COALESCE(SUM(CAST(personas AS INTEGER)),0) as v FROM reservas WHERE dia = ?`, [hoy]),
      dbGet(`SELECT COALESCE(SUM(CAST(personas AS INTEGER)),0) as v FROM reservas WHERE dia LIKE ?`, [mesLike]),
      dbAll(`SELECT local, COUNT(*) as total FROM reservas GROUP BY local ORDER BY total DESC`)
    ]);
    res.json({
      ok: true,
      data: {
        leads_total: parseInt(leads_total.v),
        leads_mes: parseInt(leads_mes.v),
        reservas_total: parseInt(reservas_total.v),
        reservas_hoy: parseInt(reservas_hoy.v),
        reservas_mes: parseInt(reservas_mes.v),
        candidaturas: parseInt(candidaturas.v),
        personas_hoy: parseInt(personas_hoy.v),
        personas_mes: parseInt(personas_mes.v),
        reservas_por_local
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Dashboard ejecutivo — agregado de datos reales (foto del día + "necesita tu atención").
app.get("/api/dashboard", requireAuth(["direccion", "encargado", "contabilidad"]), async (req, res, next) => {
  try {
    // Ámbito por local: un usuario con local asignado (y rol ≠ dirección) solo ve SU local.
    // Pasa por localScope: con varios establecimientos asignados hay que respetar el que se
    // esté mirando. Mirando `req.user.local` a pelo siempre salía el principal, así que
    // cambiar de local en la barra no cambiaba nada en estas pantallas.
    const locales = localesScope(req);
    if (locales.length > 1) {
      // Varios establecimientos a la vez: se pide el dashboard de CADA uno con la consulta de
      // siempre y se suman las respuestas. Uno detrás de otro y no en paralelo: cada dashboard
      // ya lanza sus consultas de cuatro en cuatro, y multiplicarlo por el número de locales
      // dejaría al pool sin conexiones para lo que sí es urgente (reservas, Sara).
      // Ver src/modules/dashboard/fusion.js.
      const partes = [];
      for (const l of locales) partes.push(await getDashboard({ get: dbGet, all: dbAll }, { whatsappConnected: isReady(), local: l }));
      return res.json({ ok: true, data: fusionarDashboards(partes, { locales, whatsappConnected: isReady() }) });
    }
    const data = await getDashboard({ get: dbGet, all: dbAll }, { whatsappConnected: isReady(), local: locales[0] || null });
    res.json({ ok: true, data });
  } catch (e) { next(e); }
});

// ── Ágora TPV: ventas y estado de integración ────────────────────────────────────
// ── Cifrado del apiToken de Ágora en reposo (AES-256-GCM). El token NUNCA sale por la API. ──
const AGORA_ENC_KEY = crypto.scryptSync(String(resolveJwtSecret() || "tapeta"), "agora-token-v1", 32);
function agoraEncToken(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", AGORA_ENC_KEY, iv);
  const ct = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return "enc:" + iv.toString("hex") + ":" + c.getAuthTag().toString("hex") + ":" + ct.toString("hex");
}
function agoraDecToken(stored) {
  if (!stored) return null;
  const s = String(stored);
  if (!s.startsWith("enc:")) return s; // compat: valores en texto plano (p. ej. sembrados del env)
  try {
    const [, ivh, tagh, cth] = s.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", AGORA_ENC_KEY, Buffer.from(ivh, "hex"));
    d.setAuthTag(Buffer.from(tagh, "hex"));
    return Buffer.concat([d.update(Buffer.from(cth, "hex")), d.final()]).toString("utf8");
  } catch { return null; }
}
// Configs activas: la BD manda; si está vacía, cae al Secret AGORA_LOCALES (compat).
async function loadAgoraConfigsFromDB() {
  const rows = await dbAll(`SELECT local, host, token, usuario, pass_enc, local_id, activo FROM agora_locales`);
  return configsFromRows((rows || []).map((r) => ({ local: r.local, host: r.host, token: agoraDecToken(r.token), usuario: r.usuario || null, password: agoraDecToken(r.pass_enc), local_id: r.local_id, activo: r.activo })));
}
async function loadAgoraConfigsActive() {
  try { const db = await loadAgoraConfigsFromDB(); if (db.length) return db; } catch { /* cae al env */ }
  return loadAgoraConfigs();
}
// Vuelca una sola vez el Secret AGORA_LOCALES a la BD (si la BD está vacía), para no perder config previa.
async function seedAgoraFromEnv() {
  try {
    if (await getConfig("agora_seed_env_v1")) return;
    const envCfgs = loadAgoraConfigs();
    if (envCfgs.length) {
      const rows = await dbAll(`SELECT local FROM agora_locales LIMIT 1`);
      if (!rows || !rows.length) {
        for (const c of envCfgs) {
          await dbRun(`INSERT INTO agora_locales (local, host, token, local_id, activo, updated_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT (local) DO NOTHING`,
            [c.local, c.host, agoraEncToken(c.token), c.localId, new Date().toISOString()]);
        }
        console.log("[Agora] Config del Secret AGORA_LOCALES volcada a la BD (" + envCfgs.length + " locales).");
      }
    }
    await setConfig("agora_seed_env_v1", "1");
  } catch (e) { console.error("[Agora] seed env→BD:", e.message); }
}

// Job de sincronización (dormido si no hay locales configurados).
/**
 * LA SINCRONIZACIÓN, CON CANDADO.
 *
 * `runAgoraSync` recorre los locales EN SERIE con 6 s de espera por TPV: dos ejecuciones
 * solapadas son minutos de peticiones repetidas. Antes no había nada que lo impidiera, y ahora
 * que se dispara también al entrar al panel harían falta veinte a la vez.
 *
 * Dos candados, porque uno solo no basta:
 *  · en memoria, que devuelve LA MISMA promesa a quien llegue mientras corre;
 *  · en la base con marca de tiempo (`agora_sync_inicio`), que es el que sobrevive a un
 *    reinicio a media sync y caduca solo a los cinco minutos.
 */
let _agoraEnCurso = null;
function lanzarAgoraSync(origen = "timer") {
  if (_agoraEnCurso) return _agoraEnCurso;
  _agoraEnCurso = (async () => {
    await setConfig("agora_sync_inicio", new Date().toISOString()).catch(() => {});
    try { await runAgoraSync(); }
    // El fallo se registra y se traga: esto se llama sin `await` desde varios sitios y una
    // promesa rechazada sin capturar tumba el proceso entero.
    catch (e) { console.error(`[Ágora] sync (${origen}):`, e.message); }
    finally { _agoraEnCurso = null; }
  })();
  return _agoraEnCurso;
}

/** Mira si toca y, si toca, la lanza. NUNCA espera a que termine. */
async function agoraSyncSiToca(origen = "timer", { forzar = false } = {}) {
  const [lastSync, inicio] = await Promise.all([getConfig("agora_last_sync"), getConfig("agora_sync_inicio")]);
  const enCurso = !!_agoraEnCurso || siguebloqueado(inicio);
  const d = debeSincronizar({ lastSync, enCurso, forzar });
  if (d.sincronizar) lanzarAgoraSync(origen);
  return { ...d, lanzada: d.sincronizar, lastSync: lastSync || null, origen };
}

async function runAgoraSync() {
  const configs = await loadAgoraConfigsActive();
  if (!configs.length) return;
  const hoy = hoyISO();
  await syncVentas({ get: dbGet, all: dbAll, run: dbRun }, {
    hoy, configs, makeClient: createAgoraClient,
    setEstado: async (local, r) => setConfig("agora_estado_" + local, JSON.stringify({ ...r, ts: new Date().toISOString() })),
  });
  await setConfig("agora_last_sync", new Date().toISOString());
}

app.get("/api/ventas", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const cond = [], params = [];
    if (req.query.local) { cond.push("local = ?"); params.push(String(req.query.local)); }
    if (req.query.from) { cond.push("dia >= ?"); params.push(String(req.query.from)); }
    if (req.query.to) { cond.push("dia <= ?"); params.push(String(req.query.to)); }
    const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
    const rows = await dbAll(`SELECT local, dia, ventas::float ventas, tickets::int tickets, comensales::int comensales, ticket_medio::float ticket_medio, base_imponible::float base_imponible, cuota_iva::float cuota_iva FROM ventas_diarias ${where} ORDER BY dia DESC LIMIT 800`, params);
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error ventas", data: [] });
  }
});

// Ventas EN VIVO por local (últimos 8 días incluido HOY, tiempo real) vía el informe global.
// Caché de 3 min para no martillear el TPV; también persiste días cerrados en ventas_diarias.
let _ventasVivoCache = { ts: 0, data: null };
async function ventasVivoData(force) {
  const ahora = Date.now();
  if (!force && _ventasVivoCache.data && (ahora - _ventasVivoCache.ts) < 3 * 60 * 1000) {
    return { cache: true, ...(_ventasVivoCache.data) };
  }
  const configs = (await loadAgoraConfigsActive()).filter((c) => c.usuario && c.password);
  const hoy = hoyISO();
  const desde = hoyMas(-7);
  const hasta = hoyMas(1); // incluye hoy
  const locales = [];
  for (const cfg of configs) {
    try {
      const dias = await createAgoraClient(cfg).getVentasRango(desde, hasta);
      locales.push({ local: cfg.local, dias, error: null });
      for (const v of dias) { // persistir días CERRADOS (< hoy) en ventas_diarias
        if (v.dia >= hoy) continue;
        try {
          await dbRun(
            `INSERT INTO ventas_diarias (local, dia, ventas, tickets, comensales, ticket_medio, base_imponible, cuota_iva, actualizado_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(local, dia) DO UPDATE SET ventas=EXCLUDED.ventas, tickets=EXCLUDED.tickets, comensales=EXCLUDED.comensales,
               ticket_medio=EXCLUDED.ticket_medio, base_imponible=EXCLUDED.base_imponible, cuota_iva=EXCLUDED.cuota_iva, actualizado_en=EXCLUDED.actualizado_en`,
            [cfg.local, v.dia, v.ventas, v.tickets, v.comensales, v.ticket_medio, v.base_imponible ?? null, v.cuota_iva ?? null, new Date().toISOString()]
          );
        } catch { /* no crítico */ }
      }
    } catch (e) {
      locales.push({ local: cfg.local, dias: [], error: (e && e.message) ? String(e.message).slice(0, 220) : "error" });
    }
  }
  const data = { hoy, desde, locales, generado: new Date().toISOString() };
  _ventasVivoCache = { ts: ahora, data };
  return { cache: false, ...data };
}
app.get("/api/agora/ventas-vivo", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const force = req.query.force === "1" || req.query.force === "true";
    res.json({ ok: true, ...(await ventasVivoData(force)) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Analítica: informes de Ágora en vivo (producto, empleado, cancelaciones…) ──────────────
// Lista de informes disponibles (para las pestañas del panel).
app.get("/api/agora/informes", requireAuth(["direccion", "contabilidad"]), (req, res) => {
  res.json({ ok: true, data: listaInformes() });
});

// Ejecuta un informe por RANGO de fechas y (opcional) local. Solo lectura. Caché 3 min por
// (local, tipo, rango). Devuelve el shape normalizado { columnas, filas, totales } para la tabla genérica.
const _informeCache = new Map();
app.get("/api/agora/informe/:tipo", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const def = getInforme(req.params.tipo);
    if (!def) return res.status(404).json({ ok: false, error: "Informe desconocido" });
    // Ámbito por local: un usuario con local asignado (y rol ≠ dirección) solo ve SU local.
    // Pasa por localScope: con varios establecimientos asignados hay que respetar el que se
    // esté mirando. Mirando `req.user.local` a pelo siempre salía el principal, así que
    // cambiar de local en la barra no cambiaba nada en estas pantallas.
    const local = localScope(req);
    const from = String(req.query.from || "").slice(0, 10);
    const to = String(req.query.to || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return res.status(400).json({ ok: false, error: "Rango inválido" });
    const force = req.query.force === "1" || req.query.force === "true";
    const ckey = `${local || "*"}|${def.key}|${from}_${to}`;
    const cached = _informeCache.get(ckey);
    if (!force && cached && (Date.now() - cached.ts) < 3 * 60 * 1000) return res.json({ ok: true, cache: true, ...cached.payload });

    const configs = (await loadAgoraConfigsActive()).filter((c) => c.usuario && c.password && (local ? c.local === local : true));
    if (!configs.length) {
      return res.json({ ok: true, data: { tipo: def.key, label: def.label, from, to, local, columnas: [], filas: [], totales: {}, sinCredenciales: true }, errores: [] });
    }
    const multi = configs.length > 1;
    let base = null;
    const errores = [];
    for (const cfg of configs) {
      try {
        const client = createAgoraClient(cfg);
        const groups = def.needs.includes("groups") ? await client.posGroups() : undefined;
        const familias = def.needs.includes("familias") ? await client.familiaIds() : undefined;
        const categorias = def.needs.includes("categorias") ? await client.categoriaIds() : undefined;
        const timeFrameGroupId = def.needs.includes("timeframe") ? await client.timeFrameGroupId() : undefined;
        const resp = await client.informe(def.clrType, def.buildExtra({ from, to, groups, familias, categorias, timeFrameGroupId }));
        const norm = def.map(resp);
        if (!base) base = { tipo: def.key, label: def.label, from, to, local, columnas: norm.columnas.slice(), ordenPor: norm.ordenPor, filas: [] };
        base.filas.push(...norm.filas.map((f) => (multi ? { local: cfg.local, ...f } : f)));
      } catch (e) { errores.push({ local: cfg.local, error: (e && e.message) ? String(e.message).slice(0, 140) : "error" }); }
    }
    if (!base) return res.json({ ok: true, data: { tipo: def.key, label: def.label, from, to, local, columnas: [], filas: [], totales: {} }, errores });
    if (multi) base.columnas = [{ key: "local", label: "Local", tipo: "texto" }, ...base.columnas];
    if (base.ordenPor) base.filas.sort((a, b) => (Number(b[base.ordenPor]) || 0) - (Number(a[base.ordenPor]) || 0));
    base.totales = calcularTotales(base.columnas, base.filas);
    const payload = { data: { ...base, generado: new Date().toISOString() }, errores };
    _informeCache.set(ckey, { ts: Date.now(), payload });
    res.json({ ok: true, cache: false, ...payload });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Ventas de un RANGO consultadas EN VIVO a Ágora (getVentasRango, cualquier rango — SIN límite de
// histórico; Ágora devuelve hasta donde haya datos). Caché 3 min por (local,rango) + timeout por
// local para no colgar el dashboard si el TPV está cerrado. Devuelve serie por día, o null si no
// hay credenciales / el TPV no responde (para que el endpoint use ventas_diarias de respaldo).
const _ventasRangoCache = new Map();
async function ventasRangoLive(local, from, to) {
  const key = `${local || "*"}|${from}_${to}`;
  const cached = _ventasRangoCache.get(key);
  if (cached && (Date.now() - cached.ts) < 3 * 60 * 1000) return cached.serie;
  const configs = (await loadAgoraConfigsActive()).filter((c) => c.usuario && c.password && (local ? c.local === local : true));
  if (!configs.length) return null;
  const conTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const results = await Promise.all(configs.map((cfg) => conTimeout(createAgoraClient(cfg).getVentasRango(from, to), 20000).then((d) => d).catch(() => null)));
  const ok = results.filter(Boolean);
  if (!ok.length) return null; // TPV cerrado/errores → respaldo en ventas_diarias
  const byDia = {};
  for (const dias of ok) for (const v of dias) { const e = byDia[v.dia] || (byDia[v.dia] = { dia: v.dia, ventas: 0, tickets: 0 }); e.ventas += v.ventas || 0; e.tickets += v.tickets || 0; }
  const serie = Object.values(byDia).map((e) => ({ dia: e.dia, ventas: Math.round(e.ventas * 100) / 100, tickets: e.tickets })).sort((a, b) => a.dia.localeCompare(b.dia));
  _ventasRangoCache.set(key, { ts: Date.now(), serie });
  return serie;
}

// Ejecuta un informe de Ágora (por clave del registro INFORMES) para local/rango y devuelve las
// filas normalizadas. Reutiliza loadAgoraConfigsActive + createAgoraClient + el mapper. Solo lectura.
// Degrada limpio: sinCredenciales si no hay config; errores[] por local caído (TPV cerrado, timeout).
async function runInformeAgora(tipoKey, { local, from, to }) {
  const def = getInforme(tipoKey);
  if (!def) return { filas: [], errores: [], sinDef: true };
  const configs = (await loadAgoraConfigsActive()).filter((c) => c.usuario && c.password && (local ? c.local === local : true));
  if (!configs.length) return { filas: [], errores: [], sinCredenciales: true };
  const conTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const filas = []; const errores = [];
  for (const cfg of configs) {
    try {
      const client = createAgoraClient(cfg);
      const groups = def.needs.includes("groups") ? await client.posGroups() : undefined;
      const familias = def.needs.includes("familias") ? await client.familiaIds() : undefined;
      const categorias = def.needs.includes("categorias") ? await client.categoriaIds() : undefined;
      const timeFrameGroupId = def.needs.includes("timeframe") ? await client.timeFrameGroupId() : undefined;
      const resp = await conTimeout(client.informe(def.clrType, def.buildExtra({ from, to, groups, familias, categorias, timeFrameGroupId })), 20000);
      const norm = def.map(resp);
      filas.push(...norm.filas.map((f) => ({ local: cfg.local, ...f })));
    } catch (e) { errores.push({ local: cfg.local, error: (e && e.message) ? String(e.message).slice(0, 140) : "error" }); }
  }
  return { filas, errores };
}
const addDaysISO = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Métricas del dashboard por RANGO de fechas [from,to] (reservas + ventas). Las ventas se consultan
// EN VIVO a Ágora (cualquier rango, sin tope de histórico); si el TPV está cerrado, usa ventas_diarias.
app.get("/api/dashboard/periodo", requireAuth(["direccion", "encargado", "contabilidad"]), async (req, res) => {
  try {
    // Ámbito por local: un usuario con local asignado (y rol ≠ dirección) solo ve SU local.
    // Pasa por localScope: con varios establecimientos asignados hay que respetar el que se
    // esté mirando. Mirando `req.user.local` a pelo siempre salía el principal, así que
    // cambiar de local en la barra no cambiaba nada en estas pantallas.
    const locales = localesScope(req);
    // El rango se valida aquí y no dentro: un rango mal escrito es un 400 («lo has pedido
    // mal»), no un 500 («se ha roto»), y esa diferencia es la que hace que un fallo se
    // entienda desde fuera.
    const f0 = String(req.query.from || "").slice(0, 10), t0 = String(req.query.to || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f0) || !/^\d{4}-\d{2}-\d{2}$/.test(t0) || f0 > t0) {
      return res.status(400).json({ ok: false, error: "Rango inválido" });
    }
    const deLosLocales = async (q) => {
      const desde = String(q.from || "").slice(0, 10), hasta = String(q.to || "").slice(0, 10);
      // Una sola vez para todos los locales del ámbito, y solo si alguno mira un local concreto.
      const empresaPartes = locales.length ? await gastoDeEmpresaPorLocal(desde, hasta) : null;
      if (locales.length > 1) {
        // Varios locales: uno a uno con la consulta de siempre y se suman (ver fusion.js).
        const partes = [];
        for (const l of locales) partes.push(await periodoDeLocal(q, l, empresaPartes));
        return fusionarPeriodo(partes);
      }
      return periodoDeLocal(q, locales[0] || null, empresaPartes);
    };

    const data = await deLosLocales(req.query);

    // ¿Con qué se compara? Solo si se pide (`comparar=1`): son las mismas consultas otra vez, y
    // el que no quiera la comparación no tiene por qué pagarlas. Una cifra sola no dice nada
    // —«17.000 €» solo significa algo al lado de con cuánto se compara— pero el periodo
    // anterior no se calcula restando días: ver `rangoAnterior` en src/modules/dashboard.
    // Va DENTRO de `data` a propósito: el panel desenvuelve `j.data` y todo lo que viaje fuera
    // se pierde por el camino sin que nadie se entere.
    if (["1", "true", "si", "sí"].includes(String(req.query.comparar || "").toLowerCase())) {
      // El preset lo sabe el panel («semana», «mes»…) y es lo que decide la regla: un rango de
      // once días puede ser «lo que va de mes» o una ventana de once días, y mirando solo las
      // fechas no hay forma de saberlo.
      const prev = rangoAnterior(f0, t0, req.query.preset);
      if (prev && data) {
        const ant = await deLosLocales({ ...req.query, from: prev.from, to: prev.to });
        data.comparacion = {
          desde: prev.from, hasta: prev.to, etiqueta: prev.etiqueta,
          reservas: variacion(data?.reservas?.total, ant?.reservas?.total),
          personas: variacion(data?.reservas?.personas, ant?.reservas?.personas),
          ventas: variacion(data?.ventas?.total, ant?.ventas?.total),
          gastos: variacion(data?.gastos?.total, ant?.gastos?.total),
          resultado: variacion(data?.resultado, ant?.resultado),
          // Los totales de antes, para poder enseñarlos al pasar el ratón sin pedirlos otra vez.
          totales: { reservas: ant?.reservas?.total ?? null, ventas: ant?.ventas?.total ?? null,
            gastos: ant?.gastos?.total ?? null, resultado: ant?.resultado ?? null },
        };
      }
    }
    return res.json({ ok: true, data });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// El gasto que es de toda una empresa (la gestoría, el seguro), repartido entre sus locales.
//
// Se calcula UNA sola vez por petición aunque se miren ocho establecimientos: es exactamente la
// misma cuenta para todos, y hacerla dentro del bucle eran tres consultas más por local en la
// pantalla que ya iba lenta. Devuelve null si no hay nada de empresa en el rango, y entonces no
// se paga ninguna consulta extra.
async function gastoDeEmpresaPorLocal(from, to) {
  const deEmpresa = await dbAll(
    `SELECT empresa, COALESCE(SUM(total),0)::float AS total FROM facturas
      WHERE ${SIN_ALBARANES} AND reparto = 'empresa' AND fecha >= ? AND fecha <= ? GROUP BY empresa`,
    [from, to]).catch(() => []);
  if (!deEmpresa.length) return null;
  const [locEmp, ventas] = await Promise.all([
    dbAll(`SELECT local, empresa FROM facturas_locales`).catch(() => []),
    dbAll(`SELECT local, COALESCE(SUM(ventas),0)::float AS ventas FROM ventas_diarias
            WHERE dia >= ? AND dia <= ? GROUP BY local`, [from, to]).catch(() => []),
  ]);
  const r = imputarGastoEmpresa({ base: [], deEmpresa, locEmp, ventas });
  return {
    porLocal: new Map(r.porLocal.map((x) => [x.local, x.total])),
    texto: (r.repartos[0] || {}).texto || "",
    sinRepartir: r.sinRepartir,
  };
}

// El cuerpo de arriba, por local, para poder pedirlo una vez por establecimiento.
async function periodoDeLocal(query, local, empresaPartes = null) {
  {
    const req = { query };
    const from = String(req.query.from || "").slice(0, 10);
    const to = String(req.query.to || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error("Rango inválido");
    const lf = local ? " AND local = ?" : "";
    const lp = local ? [local] : [];
    const resRows = await dbAll(`SELECT dia, COUNT(*)::int n, COALESCE(SUM(personas),0)::int personas FROM reservas WHERE dia >= ? AND dia <= ?${lf} GROUP BY dia ORDER BY dia`, [from, to, ...lp]);
    const hoy = hoyISO();
    let ventasSerie = [], hoyEnVivo = false, fuenteVentas = "bd";
    const live = await ventasRangoLive(local, from, to);
    if (live) {
      ventasSerie = live;
      hoyEnVivo = to >= hoy && ventasSerie.some((x) => x.dia === hoy);
      fuenteVentas = "live";
    } else {
      // Respaldo: días cerrados en ventas_diarias (+ hoy en vivo si el TPV responde).
      const venRows = await dbAll(`SELECT dia, ventas::float ventas, tickets::int tickets FROM ventas_diarias WHERE dia >= ? AND dia <= ?${lf} ORDER BY dia`, [from, to, ...lp]);
      ventasSerie = venRows.map((r) => ({ dia: r.dia, ventas: r.ventas, tickets: r.tickets }));
      if (from <= hoy && to >= hoy) {
        try {
          const vv = await ventasVivoData(false);
          for (const L of (vv.locales || [])) {
            if (local && L.local !== local) continue;
            const t = (L.dias || []).find((d) => d.dia === hoy);
            if (!t) continue; hoyEnVivo = true;
            const ex = ventasSerie.find((x) => x.dia === hoy);
            if (ex) { ex.ventas += t.ventas; ex.tickets += t.tickets; } else ventasSerie.push({ dia: hoy, ventas: t.ventas, tickets: t.tickets });
          }
          ventasSerie.sort((a, b) => a.dia.localeCompare(b.dia));
        } catch { /* si el vivo falla, seguimos con lo cerrado */ }
      }
    }
    // Gastos (facturas) del MISMO rango, para cuadrar el resultado (ventas − gastos).
    //
    // Los ALBARANES no se suman. Viven en la misma tabla que las facturas y son el papel de la
    // entrega, no un gasto aparte: su factura ya está aquí. Contarlos duplicaba el gasto de todo
    // proveedor que deja albarán, y este número se resta de las ventas para dar el resultado.
    //
    // Y lo que es de toda la EMPRESA sale de aquí cuando se mira un local, porque se le imputa
    // abajo solo su parte. Sin filtro de local no hace falta: se cuenta entero una vez.
    const gasRow = await dbGet(`SELECT COUNT(*)::int n, COALESCE(SUM(total),0)::float total, COALESCE(SUM(base_imponible),0)::float base FROM facturas WHERE ${SIN_ALBARANES} AND fecha >= ? AND fecha <= ?${local ? " AND COALESCE(reparto,'') <> 'empresa'" : ""}${lf}`, [from, to, ...lp]);
    const parteEmpresa = (local && empresaPartes) ? (empresaPartes.porLocal.get(local) || 0) : 0;
    const gastosTotal = (gasRow ? gasRow.total : 0) + parteEmpresa;
    const reservasTotal = resRows.reduce((s, r) => s + r.n, 0);
    const personasTotal = resRows.reduce((s, r) => s + r.personas, 0);
    const ventasTotal = ventasSerie.reduce((s, r) => s + (r.ventas || 0), 0);
    const ticketsTotal = ventasSerie.reduce((s, r) => s + (r.tickets || 0), 0);
    return {
      from, to, hoy, hoyEnVivo,
      reservas: { total: reservasTotal, personas: personasTotal, serie: resRows },
      ventas: { disponible: ventasSerie.length > 0, total: Math.round(ventasTotal * 100) / 100, tickets: ticketsTotal, ticket_medio: ticketsTotal ? Math.round(ventasTotal / ticketsTotal * 100) / 100 : 0, serie: ventasSerie, fuente: fuenteVentas },
      gastos: {
        // `disponible` mira también la parte imputada: un local puede no tener ninguna factura
        // propia en el rango y aun así cargar con su trozo de la gestoría.
        disponible: !!((gasRow && gasRow.n > 0) || parteEmpresa),
        total: Math.round(gastosTotal * 100) / 100,
        base: Math.round((gasRow ? gasRow.base : 0) * 100) / 100,
        n: gasRow ? gasRow.n : 0,
        empresa: Math.round(parteEmpresa * 100) / 100,
        notaEmpresa: parteEmpresa ? (empresaPartes.texto || "") : "",
      },
      resultado: (ventasSerie.length || (gasRow && gasRow.n)) ? Math.round((ventasTotal - gastosTotal) * 100) / 100 : null,
    };
  }
}

// Estado de la integración por local (NUNCA expone el token).
app.get("/api/agora/estado", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const configs = await loadAgoraConfigsActive();
    const out = [];
    for (const cfg of configs) {
      let estado = null;
      try { const raw = await getConfig("agora_estado_" + cfg.local); if (raw) estado = JSON.parse(raw); } catch { /* ignore */ }
      out.push({ ...publicConfig(cfg), estado });
    }
    const lastSync = await getConfig("agora_last_sync");
    res.json({ ok: true, configurados: configs.length, lastSync: lastSync || null, locales: out });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error estado Ágora" });
  }
});

// Configuración de Ágora por local, editable desde el panel (solo dirección). NUNCA devuelve el token.
app.get("/api/agora/locales", requireAuth(["direccion"]), async (req, res) => {
  try {
    const rows = await dbAll(`SELECT local, host, token, usuario, pass_enc, local_id, activo, updated_at FROM agora_locales ORDER BY local`);
    const lastSync = await getConfig("agora_last_sync");
    const out = [];
    for (const r of rows || []) {
      const tok = agoraDecToken(r.token);
      let estado = null;
      try { const raw = await getConfig("agora_estado_" + r.local); if (raw) estado = JSON.parse(raw); } catch { /* ignore */ }
      out.push({ local: r.local, host: r.host, local_id: r.local_id || null, activo: r.activo !== 0 && r.activo !== false, tokenSet: !!tok, tokenHint: tok ? "••••" + String(tok).slice(-4) : null, usuario: r.usuario || null, passSet: !!r.pass_enc, updated_at: r.updated_at || null, estado });
    }
    res.json({ ok: true, data: out, lastSync: lastSync || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error leyendo config Ágora" });
  }
});

// Alta/edición por local. Token/usuario/contraseña opcionales en edición (si vienen vacíos, se conserva lo actual).
app.post("/api/agora/locales", requireAuth(["direccion"]), async (req, res) => {
  try {
    const { local, host, token, usuario, password, local_id, activo } = req.body || {};
    if (!local || !host) return res.status(400).json({ ok: false, error: "Faltan local y host" });
    const localId = local_id != null && String(local_id).trim() !== "" ? String(local_id).trim() : null;
    const act = (activo === false || activo === 0 || activo === "0") ? 0 : 1;
    const now = new Date().toISOString();
    const existing = await dbGet(`SELECT token, pass_enc FROM agora_locales WHERE local = ?`, [local]);
    const tokTrim = token != null ? String(token).trim() : "";
    let tokenStored = tokTrim ? agoraEncToken(tokTrim) : (existing && existing.token ? existing.token : null);
    const passTrim = password != null ? String(password).trim() : "";
    let passStored = passTrim ? agoraEncToken(passTrim) : (existing && existing.pass_enc ? existing.pass_enc : null);
    const usuarioStored = usuario != null && String(usuario).trim() !== "" ? String(usuario).trim() : (existing ? undefined : null);
    // COALESCE de usuario: si no viene en edición, conservar el actual.
    await dbRun(
      `INSERT INTO agora_locales (local, host, token, usuario, pass_enc, local_id, activo, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (local) DO UPDATE SET host = EXCLUDED.host, token = EXCLUDED.token,
         usuario = COALESCE(EXCLUDED.usuario, agora_locales.usuario), pass_enc = EXCLUDED.pass_enc,
         local_id = EXCLUDED.local_id, activo = EXCLUDED.activo, updated_at = EXCLUDED.updated_at`,
      [String(local).trim(), String(host).trim(), tokenStored, usuarioStored === undefined ? null : usuarioStored, passStored, localId, act, now]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando config Ágora" });
  }
});

app.delete("/api/agora/locales/:local", requireAuth(["direccion"]), async (req, res) => {
  try { await dbRun(`DELETE FROM agora_locales WHERE local = ?`, [req.params.local]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: "Error eliminando config Ágora" }); }
});

// Probar conexión con el TPV de un local (ping): responde si el servidor está vivo. No expone el token.
// Mensaje concreto de qué falta en la config, en vez del genérico «falta host o token»,
// que además era falso: desde el login web el token es opcional.
function agoraFaltaQue(row) {
  const falta = [];
  if (!row || !row.host) falta.push("el host");
  if (!row || !row.usuario) falta.push("el usuario");
  if (!row || !row.pass_enc) falta.push("la contraseña");
  return falta.length ? `Falta ${falta.join(", ").replace(/, ([^,]*)$/, " y $1")} de Ágora.` : "Configuración incompleta.";
}
// Candidatos a sondear cuando un TPV es de versión antigua y no tiene el informe habitual.
// Los 8 primeros están CONFIRMADOS en los locales con Ágora 8.7.4; el resto son nombres
// plausibles de versiones viejas (si no existen, el sondeo simplemente los marca así).
const AGORA_CANDIDATOS = [
  { clr: "IGT.POS.Bus.SystemManagement.Messages.GetAllPosGroupsRequest", nota: "control: debe existir siempre" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetGlobalSalesReportRequest", nota: "el que usamos para las ventas diarias" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetPaymentMethodSalesReportRequest", nota: "ventas por método de pago (sirve para el total del día)" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetUserSalesFileReportRequest", nota: "ventas por empleado (sumando da el total)" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetProductSalesReportRequest", nota: "ventas por producto" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetTicketsByTimeFrameReportRequest", nota: "tickets por franja horaria" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetDiscountsByUserAndTypeReportRequest", nota: "descuentos" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetInvitationsByBusinessDayReportRequest", nota: "invitaciones" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetSalesReportRequest", nota: "candidato antiguo" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetDailySalesReportRequest", nota: "candidato antiguo" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetSalesByDayReportRequest", nota: "candidato antiguo" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetBusinessDayReportRequest", nota: "candidato antiguo (día de negocio)" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetCashCountReportRequest", nota: "candidato antiguo (arqueo/cierre de caja)" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetZReportRequest", nota: "candidato antiguo (informe Z)" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetInvoicesReportRequest", nota: "candidato antiguo (facturas)" },
  // Comensales: hoy `ventas_diarias.comensales` vale SIEMPRE 0 porque el informe global no los
  // trae, así que el «ticket medio» es por ticket y no por persona. Estos son los nombres con
  // los que Ágora podría tenerlo; el descubrimiento dice cuáles existen de verdad.
  { clr: "IGT.POS.Bus.Reporting.Messages.GetDinersReportRequest", nota: "comensales (si existe, se puede el ticket medio por persona)" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetDinersSalesReportRequest", nota: "comensales (variante)" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetSalesByDinersReportRequest", nota: "comensales (variante)" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetSalesSummaryReportRequest", nota: "resumen de ventas (suele traer comensales)" },
  { clr: "IGT.POS.Bus.Reporting.Messages.GetTablesReportRequest", nota: "mesas (a veces trae comensales por mesa)" },
];

// Pregunta a UN TPV qué mensajes entiende. Pensado para locales con Ágora antiguo: nos dice
// con qué informe podemos sacar la venta diaria sin tener que actualizar el TPV.
// Solo dirección. Usa las credenciales guardadas: nunca salen de aquí.
app.post("/api/agora/metodos", requireAuth(["direccion"]), async (req, res) => {
  try {
    const { local } = req.body || {};
    if (!local) return res.status(400).json({ ok: false, error: "Falta local" });
    const row = await dbGet(`SELECT local, host, token, usuario, pass_enc, local_id FROM agora_locales WHERE local = ?`, [local]);
    if (!row) return res.status(404).json({ ok: false, error: "Local no configurado" });
    const cfgs = configsFromRows([{
      local: row.local, host: row.host, token: agoraDecToken(row.token),
      usuario: row.usuario || null, password: agoraDecToken(row.pass_enc),
      local_id: row.local_id, activo: true,
    }]);
    if (!cfgs.length) return res.status(400).json({ ok: false, error: agoraFaltaQue(row) });
    const client = createAgoraClient(cfgs[0]);
    const { alive, version } = await client.pingInfo();
    if (!alive) return res.json({ ok: true, local, version: null, alive: false, metodos: [], mensaje: "El TPV no responde: el local está cerrado o inalcanzable." });
    // Rango mínimo (ayer) para que el informe no cargue al TPV; da igual lo que devuelva.
    const hasta = hoyISO();
    const desde = hoyMas(-1);
    const metodos = [];
    for (const c of AGORA_CANDIDATOS) {
      const r = await client.probarMetodo(c.clr, { From: desde, To: hasta });
      metodos.push({ ...r, nota: c.nota });
    }
    const hay = metodos.filter((m) => m.estado === "disponible").length;
    res.json({ ok: true, local, alive: true, version, metodos, mensaje: `Ágora ${version || "?"} · ${hay} de ${metodos.length} mensajes disponibles` });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || "Error sondeando el TPV").slice(0, 200) });
  }
});

app.post("/api/agora/probe", requireAuth(["direccion"]), async (req, res) => {
  try {
    const { local } = req.body || {};
    if (!local) return res.status(400).json({ ok: false, error: "Falta local" });
    const row = await dbGet(`SELECT local, host, token, usuario, pass_enc, local_id FROM agora_locales WHERE local = ?`, [local]);
    if (!row) return res.status(404).json({ ok: false, error: "Local no configurado" });
    // Hay que pasar usuario+contraseña: desde que la auth es login web, una config sin token
    // pero con credenciales es VÁLIDA. Antes se leía solo el token y "Probar conexión"
    // fallaba con «Config incompleta» en todos los locales bien configurados.
    const cfgs = configsFromRows([{
      local: row.local, host: row.host, token: agoraDecToken(row.token),
      usuario: row.usuario || null, password: agoraDecToken(row.pass_enc),
      local_id: row.local_id, activo: true,
    }]);
    if (!cfgs.length) return res.status(400).json({ ok: false, error: agoraFaltaQue(row) });
    const client = createAgoraClient(cfgs[0]);
    const { alive, version } = await client.pingInfo();
    res.json({
      ok: true, alive, version,
      mensaje: alive
        ? `El TPV respondió (servidor vivo)${version ? ` · Ágora ${version}` : ""}`
        : "Sin respuesta: el local está cerrado o inalcanzable",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error en la prueba de conexión" });
  }
});

// Diagnóstico de la API de Ágora: sondea rutas candidatas contra el TPV ABIERTO y reporta cuál
// devuelve datos (la doc de endpoints no es pública). Con el resultado se cablea la ruta real.
// Redacta el token en lo que devuelve. Solo dirección.
async function ejecutarCandidataAgora(c, token, timeoutMs = 5000) {
  const redact = (s) => (token ? String(s == null ? "" : s).split(token).join("«token»") : String(s == null ? "" : s));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const opt = { method: c.method, headers: { ...c.headers }, signal: ctrl.signal };
    if (c.body != null) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(c.body); }
    const r = await fetch(c.url, opt);
    const ct = r.headers.get("content-type") || "";
    const text = await r.text();
    let esJson = false, jsonKeys = null;
    if (text) { try { const j = JSON.parse(text); esJson = true; jsonKeys = Array.isArray(j) ? `[array x${j.length}]` : Object.keys(j).slice(0, 25); } catch { /* no-JSON */ } }
    const trimmed = text.trim();
    const esXml = !esJson && (/xml/i.test(ct) || trimmed.startsWith("<?xml") || (trimmed.startsWith("<") && !/<!doctype html|<html/i.test(trimmed)));
    return { label: c.label, method: c.method, url: redact(c.url), status: r.status, ok: r.ok, contentType: ct, esJson, esXml, jsonKeys, bodySample: redact(text.slice(0, 500)) };
  } catch (e) {
    return { label: c.label, method: c.method, url: redact(c.url), error: e && e.name === "AbortError" ? "timeout" : (e.code || e.message || "error") };
  } finally { clearTimeout(timer); }
}

app.post("/api/agora/diagnostico", requireAuth(["direccion"]), async (req, res) => {
  try {
    const { local } = req.body || {};
    if (!local) return res.status(400).json({ ok: false, error: "Falta local" });
    const row = await dbGet(`SELECT local, host, token, usuario, pass_enc, local_id FROM agora_locales WHERE local = ?`, [local]);
    if (!row) return res.status(404).json({ ok: false, error: "Local no configurado" });
    const cfgs = configsFromRows([{
      local: row.local, host: row.host, token: agoraDecToken(row.token),
      usuario: row.usuario || null, password: agoraDecToken(row.pass_enc),
      local_id: row.local_id, activo: true,
    }]);
    if (!cfgs.length) return res.status(400).json({ ok: false, error: agoraFaltaQue(row) });
    const cfg = cfgs[0];
    const hoy = hoyISO();
    const desde = (req.body.desde && String(req.body.desde)) || hoyMas(-2);
    const hasta = (req.body.hasta && String(req.body.hasta)) || hoy;
    const candidatos = candidatosDiagnostico(cfg.host, { token: cfg.token, localId: cfg.localId, desde, hasta });
    // En lotes de 8 para no saturar el servidor del TPV (embebido, pequeño).
    const resultados = [];
    for (let i = 0; i < candidatos.length; i += 8) {
      const lote = candidatos.slice(i, i + 8);
      resultados.push(...await Promise.all(lote.map((c) => ejecutarCandidataAgora(c, cfg.token))));
    }
    res.json({ ok: true, local, base: cfg.host, desde, hasta, total: resultados.length, resultados: ordenarResultados(resultados) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Descubrir las rutas reales de la API leyendo el JavaScript de la web de administración de Ágora
// (el :8984 sirve un SPA; sus scripts llaman a los endpoints de datos). Solo dirección; token redactado.
async function fetchTextTimeout(url, headers, timeoutMs = 6000, maxBytes = 500000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    const text = (await r.text()).slice(0, maxBytes);
    return { status: r.status, ok: r.ok, text };
  } finally { clearTimeout(timer); }
}

app.post("/api/agora/descubrir", requireAuth(["direccion"]), async (req, res) => {
  try {
    const { local } = req.body || {};
    if (!local) return res.status(400).json({ ok: false, error: "Falta local" });
    const row = await dbGet(`SELECT local, host, token, usuario, pass_enc, local_id FROM agora_locales WHERE local = ?`, [local]);
    if (!row) return res.status(404).json({ ok: false, error: "Local no configurado" });
    const cfgs = configsFromRows([{
      local: row.local, host: row.host, token: agoraDecToken(row.token),
      usuario: row.usuario || null, password: agoraDecToken(row.pass_enc),
      local_id: row.local_id, activo: true,
    }]);
    if (!cfgs.length) return res.status(400).json({ ok: false, error: agoraFaltaQue(row) });
    const cfg = cfgs[0];
    const token = cfg.token;
    const redact = (s) => (token ? String(s == null ? "" : s).split(token).join("«token»") : String(s == null ? "" : s));
    const headers = { "Api-Token": token };
    // 1) Raíz → HTML del SPA.
    const rootHtml = (await fetchTextTimeout(cfg.host + "/", headers)).text;
    const scripts = extraerScripts(rootHtml, cfg.host).slice(0, 12);
    const rutas = new Set(extraerRutasApi(rootHtml));
    // Los NOMBRES DE INFORME que ese Ágora conoce, sacados de su propio JavaScript. Es la
    // manera de saber qué informes existen sin adivinar: la web de administración los llama
    // todos, así que están escritos ahí. Sondear mensajes candidatos a mano es tirar a ver si
    // suena; esto es leer el índice.
    const clr = new Set(extraerClrTypes(rootHtml));
    // 2) Descargar cada script y extraer rutas y nombres de informe.
    const bajados = [];
    for (const s of scripts) {
      try {
        const r = await fetchTextTimeout(s, headers);
        extraerRutasApi(r.text).forEach((x) => rutas.add(x));
        extraerClrTypes(r.text).forEach((x) => clr.add(x));
        bajados.push({ url: redact(s), status: r.status, bytes: r.text.length });
      } catch (e) { bajados.push({ url: redact(s), error: e && e.name === "AbortError" ? "timeout" : (e.message || "error") }); }
    }
    const { api, otras } = clasificarRutas([...rutas]);
    const informes = clasificarInformes([...clr], AGORA_CANDIDATOS.map((c) => c.clr));
    res.json({ ok: true, local, base: cfg.host, scripts: bajados,
      api: api.slice(0, 120), otras: otras.slice(0, 120),
      informes,
      // La pregunta concreta que hay que contestar antes de prometer un «ticket medio por
      // comensal»: si aquí no sale nada, Ágora no da los comensales y no se puede.
      hayComensales: informes.comensales.length > 0 });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Forzar sincronización de ventas ahora mismo (solo dirección).
app.post("/api/agora/sync-now", requireAuth(["direccion"]), async (req, res) => {
  try {
    const configs = await loadAgoraConfigsActive();
    if (!configs.length) return res.json({ ok: true, configurados: 0, mensaje: "No hay locales de Ágora activos" });
    // Ya NO se espera a que termine: con ocho locales en serie y 6 s de espera por TPV, la
    // petición se quedaba colgada medio minuto y el navegador daba por muerta la pantalla.
    // `forzar`: es un botón que se pulsa a propósito, así que no le aplica la ventana de 15 min.
    const r = await agoraSyncSiToca("manual", { forzar: true });
    res.json({ ok: true, configurados: configs.length, lanzada: r.lanzada, motivo: r.motivo, lastSync: r.lastSync });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error sincronizando" });
  }
});

/**
 * EL AVISO DE QUE ALGUIEN HA ENTRADO AL PANEL. Contesta al instante: mira si el último volcado
 * de ventas pasa de 15 minutos y, si toca, lanza uno por detrás.
 *
 * NO PUEDE COLGAR DE `/api/agora`: el mapa de permisos (src/modules/usuarios/permisos.js) manda
 * todo lo que empiece por ahí al módulo «analitica», así que un encargado sin analítica se
 * comería un 403 nada más abrir el panel. Por eso vive en `/api/ventas`.
 *
 * Y contesta `ok: true` aunque no haya nada configurado o Ágora esté caído: un error aquí haría
 * saltar un aviso rojo al entrar, y esto es un recado de fondo, no algo que se haya pedido.
 */
app.post("/api/ventas/sync-ping", requireAuth([]), async (req, res) => {
  try {
    const configs = await loadAgoraConfigsActive();
    if (!configs.length) return res.json({ ok: true, lanzada: false, motivo: "sin-locales" });
    const r = await agoraSyncSiToca("panel");
    res.json({ ok: true, lanzada: r.lanzada, motivo: r.motivo, edadMin: r.edadMin, lastSync: r.lastSync });
  } catch (e) {
    console.error("[Ágora] ping:", e.message);
    res.json({ ok: true, lanzada: false, motivo: "error" });
  }
});

// RR.HH.
app.get("/api/hr/jobs", async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM hr_jobs WHERE activo=1 ORDER BY creado_en DESC`);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error jobs" });
  }
});

app.get("/api/hr/jobs/admin", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM hr_jobs ORDER BY creado_en DESC`);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error jobs" });
  }
});

app.post("/api/hr/jobs", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  const { titulo, local, tipo, descripcion, activo } = req.body;
  if (!titulo || !local || !tipo || !descripcion) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  try {
    const creado_en = new Date().toISOString();
    const row = await dbRun(
      `INSERT INTO hr_jobs (titulo, local, tipo, descripcion, activo, creado_en) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [titulo, local, tipo, descripcion, activo ? 1 : 0, creado_en]
    );
    res.json({ ok: true, id: row.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando job" });
  }
});

app.put("/api/hr/jobs/:id", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  const { titulo, local, tipo, descripcion, activo } = req.body;
  try {
    await dbRun(
      `UPDATE hr_jobs SET titulo=?, local=?, tipo=?, descripcion=?, activo=? WHERE id=?`,
      [titulo, local, tipo, descripcion, activo ? 1 : 0, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error actualizando job" });
  }
});

app.post("/api/hr/applications", (req, res, next) => {
  uploadCv.single("cv")(req, res, (err) => {
    if (err) {
      console.error("[HR] Error subiendo CV:", err.message);
      const msg = err.code === "LIMIT_FILE_SIZE" ? "El CV supera el tamaño máximo (8 MB)." : "Error subiendo el CV.";
      return res.status(400).json({ ok: false, error: msg });
    }
    next();
  });
}, async (req, res) => {
  const { nombre, email, telefono, puesto, mensaje, edad, experiencia, poblacion } = req.body;
  console.log("[HR] Candidatura recibida:", { nombre, email, telefono, puesto, edad, experiencia, poblacion, tieneCV: !!req.file });
  if (!nombre || !email || !telefono || !puesto || !edad || !experiencia || !poblacion) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  // Validar el CONTENIDO del CV (magic bytes) y publicarlo en public/uploads SOLO si es válido.
  // Si NO es válido, se descarta el adjunto pero la candidatura SÍ se guarda (no perdemos al
  // candidato). Seguridad preservada: nunca se publica un archivo cuyo contenido no coincida.
  if (req.file) {
    const fin = finalizeCvUpload({ tmpPath: req.file.path, filename: req.file.filename, originalname: req.file.originalname, publicDir: uploadsDir });
    if (!fin.ok) { console.warn("[HR] CV descartado (contenido no válido):", req.file.originalname); req.file = null; }
  }
  const cv_url = req.file ? `/uploads/${req.file.filename}` : "";
  const creado_en = new Date().toISOString();
  try {
    await dbRun(
      `INSERT INTO hr_applications (nombre, email, telefono, puesto, mensaje, cv_url, edad, experiencia, poblacion, estado, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'nuevo', ?)`,
      [nombre, email, telefono, puesto, mensaje || "", cv_url, edad || null, experiencia || null, poblacion || null, creado_en]
    );
    if (isReady()) {
      const lineas = [
        `🆕 *Nueva candidatura recibida*`,
        ``,
        `👤 *Nombre:* ${nombre}`,
        `📞 *Teléfono:* ${telefono}`,
        `📧 *Email:* ${email}`,
        `💼 *Puesto:* ${puesto}`,
        `🎂 *Edad:* ${edad} años`,
        `🏙️ *Población:* ${poblacion}`,
        `✅ *Experiencia:* ${experiencia === "si" ? "Sí" : "No"}`,
      ];
      if (mensaje) lineas.push(`💬 *Mensaje:* ${mensaje}`);
      if (req.file) lineas.push(`📎 *CV:* adjunto a continuación`);
      const numLimpio = telefono.replace(/\D/g, "").replace(/^00/, "");
      const numWA = numLimpio.startsWith("34") ? numLimpio : `34${numLimpio}`;
      const mensajePrefill = encodeURIComponent(
        `Hola ${nombre}! 👋 Te escribo en relación a tu candidatura como ${puesto} en Familia del Amor. Cuéntame un poco más sobre ti para que podamos conocernos mejor 😊`
      );
      const linkWA = `https://wa.me/${numWA}?text=${mensajePrefill}`;
      sendMensajeLibre("622065974", lineas.join("\n"))
        .then(() => {
          if (req.file) {
            const cvBuffer = fs.readFileSync(path.join(uploadsDir, req.file.filename)); // ya publicado por finalizeCvUpload
            return sendDocumentoLibre("622065974", cvBuffer, req.file.originalname, req.file.mimetype);
          }
        })
        .then(() => sendMensajeLibre("622065974", `Si quieres escribirle directamente a ${nombre}, haz clic aquí 👇\n${linkWA}`))
        .catch((e) => console.error("[HR] Error notificando candidatura a Nerea:", e.message));
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("[HR] Error DB:", e.message);
    res.status(500).json({ ok: false, error: "Error guardando candidatura" });
  }
});

app.get("/api/hr/applications", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  try {
    const { q, estado, from, to } = req.query;
    const where = [];
    const params = [];
    if (q) {
      where.push(`(nombre LIKE ? OR email LIKE ? OR telefono LIKE ? OR puesto LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (estado) { where.push(`estado = ?`); params.push(estado); }
    if (from) { where.push(`creado_en >= ?`); params.push(from); }
    if (to) { where.push(`creado_en <= ?`); params.push(to); }
    const sql = `SELECT * FROM hr_applications ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY creado_en DESC`;
    const rows = await dbAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error leyendo candidaturas" });
  }
});

app.put("/api/hr/applications/:id", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  const { estado } = req.body;
  if (!estado) return res.status(400).json({ ok: false, error: "Estado requerido" });
  try {
    await dbRun(`UPDATE hr_applications SET estado=? WHERE id=?`, [estado, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error actualizando estado" });
  }
});

// Contratar: crea la ficha/usuario copiando los datos del candidato + su CV como primer documento,
// y marca la candidatura como 'contratada'. Cierra el hueco candidatura→alta (antes era manual).
app.post("/api/hr/applications/:id/contratar", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  const { username, password, local } = req.body;
  const rol = req.body.rol === "encargado" ? "encargado" : "trabajador";
  if (!username || !password || !local) return res.status(400).json({ ok: false, error: "Faltan usuario, contraseña o local" });
  try {
    const cand = await dbGet("SELECT * FROM hr_applications WHERE id = ?", [req.params.id]);
    if (!cand) return res.status(404).json({ ok: false, error: "Candidatura no encontrada" });
    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const u = await dbRun(
      // pass_temporal: igual que en el resto de altas, la primera contraseña es prestada.
      `INSERT INTO users (username, password_hash, rol, nombre, local, telefono, email, puesto, fecha_alta, activo, pass_temporal, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, TRUE, ?) RETURNING id`,
      [username, hash, rol, cand.nombre || "", local, cand.telefono || null, cand.email || null, cand.puesto || null, now.slice(0, 10), now]);
    if (cand.cv_url) {
      await dbRun(`INSERT INTO hr_documentos (worker_id, tipo, nombre, url, sensible, autor, creado_en) VALUES (?, 'otro', ?, ?, 0, ?, ?)`,
        [u.id, "CV de la candidatura", cand.cv_url, req.user?.nombre || req.user?.username || null, now]);
    }
    await dbRun(`UPDATE hr_applications SET estado='contratada' WHERE id=?`, [req.params.id]);
    invalidarInternos();
    res.json({ ok: true, id: u.id });
  } catch (e) {
    res.status(400).json({ ok: false, error: /duplicate|unique/i.test(e.message || "") ? "Ese nombre de usuario ya existe" : "No se pudo contratar" });
  }
});

// ── RRHH: Seguimiento de trabajadores ─────────────────────────────────────
// Acceso: dirección y rol `rrhh` ven TODOS los locales; `encargado` solo el suyo (validado aquí,
// no en el front). RRHH_ROLES abre los endpoints de seguimiento también al encargado.
// Espejo en SQL de src/modules/rrhh/vigencia.js. Existen porque el filtro estaba escrito a
// mano en nueve consultas con TRES criterios distintos, y ninguna de las tres decía lo mismo.
// Los `?` van en el orden en que aparecen en el texto.
const SQL_PLANTILLA = "rol IN ('trabajador','encargado')";
// activoAhora(persona, dia): trabaja ESE día. `activo = 0` corta siempre.  ? = dia, dia
const SQL_ACTIVO_EL_DIA = `${SQL_PLANTILLA} AND COALESCE(activo,1) = 1
  AND (fecha_alta IS NULL OR fecha_alta <= ?) AND (fecha_baja IS NULL OR fecha_baja >= ?)`;
// pertenecioAlPeriodo(persona, desde, hasta): estuvo en algún momento. SIN filtro de `activo`:
// quien se fue tiene que seguir saliendo en su propio histórico.  ? = hasta, desde
const SQL_ESTUVO_ENTRE = `${SQL_PLANTILLA}
  AND (fecha_alta IS NULL OR fecha_alta <= ?) AND (fecha_baja IS NULL OR fecha_baja >= ?)`;

const RRHH_ROLES = ["rrhh", "direccion", "encargado"];
function rrhhTodoLocal(req) { return req.user && (req.user.rol === "direccion" || req.user.rol === "rrhh"); }
function rrhhLocalScope(req) { return rrhhTodoLocal(req) ? null : localScope(req); } // null = sin restricción
function rrhhPuedeLocal(req, local) {
  if (rrhhTodoLocal(req)) return true;
  return puedeLocal(req.user, local);   // cualquiera de los suyos, no solo en el que esté mirando
}
async function rrhhWorkerLocal(id) { const r = await dbGet("SELECT local FROM users WHERE id = ?", [id]); return r ? (r.local || "") : null; }

app.get("/api/rrhh/trabajadores", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const scope = rrhhLocalScope(req);
    const rows = scope
      ? await dbAll(`SELECT id, username, nombre, rol, local FROM users WHERE rol IN ('trabajador','encargado') AND local = ? ORDER BY nombre ASC`, [scope])
      : await dbAll(`SELECT id, username, nombre, rol, local FROM users WHERE rol IN ('trabajador','encargado') ORDER BY local ASC, nombre ASC`);
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// Alta de trabajador desde RRHH (no depende de POST /api/users, que es solo dirección).
// El encargado solo puede crear en SU local y con rol acotado a 'trabajador'.
app.post("/api/rrhh/trabajador", requireAuth(RRHH_ROLES), async (req, res) => {
  const { username, nombre } = req.body;
  let local = req.body.local, rol = req.body.rol || "trabajador";
  if (!username || !nombre) return res.status(400).json({ ok: false, error: "Faltan el usuario o el nombre" });
  if (esEncargado(req)) { local = localScope(req); rol = "trabajador"; }
  if (!local) return res.status(400).json({ ok: false, error: "Falta el local" });
  if (!rrhhPuedeLocal(req, local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
  if (!["trabajador", "encargado"].includes(rol)) rol = "trabajador";
  try {
    // La contraseña inicial es el propio nombre de usuario y la cuenta queda marcada como
    // «tiene que cambiarla»: hasta que lo haga, no puede hacer nada más en el panel. Sin
    // esa obligación, cuarenta altas serían cuarenta cuentas con la contraseña sabida.
    const inicial = passwordInicial(username);
    const hash = await bcrypt.hash(inicial, 10);
    const now = new Date().toISOString();
    const row = await dbRun(
      `INSERT INTO users (username, password_hash, rol, nombre, local, fecha_alta, activo, pass_temporal, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, 1, TRUE, ?) RETURNING id`,
      [username, hash, rol, nombre, local, now.slice(0, 10), now]);
    invalidarInternos();
    res.json({
      ok: true, id: row.id, username, passwordInicial: inicial,
      mensaje: `${nombre} entra con usuario y contraseña «${username}». Al entrar le pedirá cambiarla.`,
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: /duplicate|unique/i.test(e.message || "") ? "Ese usuario ya existe" : "No se pudo crear" });
  }
});

// Volver a poner la contraseña inicial (alguien que la ha olvidado). Deja la cuenta otra
// vez en «tiene que cambiarla», así que la ventana vuelve a ser corta.
app.post("/api/rrhh/trabajador/:id/reset-password", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const w = await dbGet("SELECT id, username, nombre, local FROM users WHERE id = ?", [Number(req.params.id)]);
    if (!w || !rrhhPuedeLocal(req, w.local || "")) return res.status(404).json({ ok: false, error: "No encontrado" });
    const inicial = passwordInicial(w.username);
    // `password_enc = NULL`: si quedaba una copia reversible de la contraseña vieja, se va con
    // ella. Dejarla ahí sería cerrar la puerta y olvidarse la llave puesta.
    await dbRun("UPDATE users SET password_hash = ?, password_enc = NULL, pass_temporal = TRUE, login_intentos = 0, login_bloqueado_hasta = NULL WHERE id = ?",
      [await bcrypt.hash(inicial, 10), w.id]);
    await ficAuditar("usuario", w.id, "reset_password", req.user.username, { local: w.local, workerId: w.id });
    res.json({ ok: true, mensaje: `${w.nombre} vuelve a entrar con «${inicial}» y tendrá que cambiarla.` });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo restablecer" }); }
});

// Resumen del equipo por local (plantilla, activos/bajas, antigüedad, check-ins, docs por caducar,
// cumpleaños próximos). Reutiliza la lógica pura resumenEquipoPorLocal.
app.get("/api/rrhh/resumen", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const scope = rrhhLocalScope(req);
    const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || "")) ? req.query.mes : new Date().toISOString().slice(0, 7);
    const trabajadores = scope
      ? await dbAll("SELECT id, nombre, local, activo, fecha_alta, fecha_baja, fecha_nac, telefono FROM users WHERE rol IN ('trabajador','encargado') AND local = ?", [scope])
      : await dbAll("SELECT id, nombre, local, activo, fecha_alta, fecha_baja, fecha_nac, telefono FROM users WHERE rol IN ('trabajador','encargado')");
    // Sin teléfono no les podemos escribir (ni el pulso, ni avisos). Lo rellenan ellos
    // desde su perfil, pero conviene ver de un vistazo a cuántos les falta.
    const activos = trabajadores.filter((w) => w.activo !== 0 && !w.fecha_baja);
    const sinTelefono = activos.filter((w) => !String(w.telefono || "").trim());
    const ids = trabajadores.map((w) => w.id);
    const ph = ids.map(() => "?").join(",");
    const checkins = ids.length ? await dbAll(`SELECT worker_id, realizada FROM hr_llamadas_mes WHERE mes = ? AND worker_id IN (${ph})`, [mes, ...ids]) : [];
    const docsRows = ids.length ? await dbAll(`SELECT worker_id, fecha_caducidad FROM hr_documentos WHERE worker_id IN (${ph})`, ids) : [];
    const docsPorWorker = {}; for (const d of docsRows) (docsPorWorker[d.worker_id] || (docsPorWorker[d.worker_id] = [])).push(d);
    res.json({
      ok: true,
      data: resumenEquipoPorLocal(trabajadores, checkins, docsPorWorker, hoyISO(), 30),
      mes,
      contacto: {
        activos: activos.length,
        sinTelefono: sinTelefono.length,
        quienes: sinTelefono.map((w) => ({ id: w.id, nombre: w.nombre, local: w.local })),
      },
    });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ════════════════════════ HORARIOS ════════════════════════
// Fase 0: configuración del local (áreas y tramos). El cuadrante llega en la fase 1.
// Ámbito por local reutilizando la capa ya probada de RR.HH.
const HORARIOS_ROLES = ["direccion", "rrhh", "encargado"];

// Devuelve la configuración de un local, sembrándola la primera vez. Sin esto la primera
// pantalla estaría vacía y no se podría crear nada: se siembran SALA/COCINA y los tres
// tramos del cuadrante que se venía haciendo a mano.
app.get("/api/horarios/config", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const local = rrhhLocalScope(req) || String(req.query.local || "").trim();
    if (!local) return res.status(400).json({ ok: false, error: "Falta el establecimiento" });
    if (!rrhhPuedeLocal(req, local)) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });

    const x = { run: (sql, p = []) => dbRun(sql, p) };
    await sembrarLocal(x, local, isoConOffset(Date.now()));

    const [config, areas, tramos] = await Promise.all([
      dbGet(`SELECT * FROM hor_config WHERE local = ?`, [local]),
      dbAll(`SELECT id, nombre, orden FROM hor_areas WHERE local = ? AND activo ORDER BY orden, nombre`, [local]),
      dbAll(`SELECT id, nombre, orden, inicio_min, fin_min FROM hor_tramos WHERE local = ? AND activo ORDER BY orden, inicio_min`, [local]),
    ]);
    // La semana en curso, calculada en hora de Madrid (no en UTC: ver tiempo.js).
    const hoy = instanteANegocio(Date.now(), { corteMin: config?.corte_dia_min ?? 360 });
    res.json({
      ok: true,
      local, config, areas, tramos,
      hoy: hoy.diaNegocio,
      lunes: lunesDe(hoy.diaNegocio),
      dias: diasSemana(lunesDe(hoy.diaNegocio)),
    });
  } catch (e) {
    console.error("[horarios] config:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar la configuración" });
  }
});

// Resuelve el local pedido respetando el ámbito del usuario. Devuelve null si no puede.
function horLocal(req, pedido) {
  const local = rrhhLocalScope(req) || String(pedido || "").trim();
  if (!local || !rrhhPuedeLocal(req, local)) return null;
  return local;
}

// La semana: devuelve la versión de trabajo (el borrador si lo hay, si no la publicada) y
// todo lo necesario para pintar la rejilla en una sola petición.
app.get("/api/horarios/semana", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const lunes = lunesDe(String(req.query.lunes || "")) || lunesDe(instanteANegocio(Date.now()).diaNegocio);

    const [areas, tramos, equipo] = await Promise.all([
      dbAll(`SELECT id, nombre, orden FROM hor_areas WHERE local = ? AND activo ORDER BY orden, nombre`, [local]),
      dbAll(`SELECT id, nombre, orden, inicio_min, fin_min, tipo FROM hor_tramos WHERE local = ? AND activo ORDER BY orden, inicio_min`, [local]),
      // `fecha_alta` y `fecha_baja` viajan porque la fila de fiesta se calcula: sin ellas,
      // quien entra el jueves saldría «librando» el lunes, martes y miércoles anteriores.
      // Ojo: aquí NO se filtra por fecha_baja para poder pintar la parte de la semana que sí
      // trabajó; lo decide `descansosPorDia` día a día.
      dbAll(`SELECT id, nombre, username, puesto, fecha_alta, fecha_baja FROM users
             WHERE local = ? AND COALESCE(activo,1) = 1 AND ${SQL_ESTUVO_ENTRE}
             ORDER BY nombre`, [local, sumaDias(lunes, 6), lunes]),
    ]);
    // Se trabaja siempre sobre el borrador; si no hay, se ve la publicada en solo lectura.
    const semana = await dbGet(
      `SELECT * FROM hor_semanas WHERE local = ? AND lunes = ? AND estado IN ('borrador','publicado')
       ORDER BY CASE estado WHEN 'borrador' THEN 0 ELSE 1 END LIMIT 1`, [local, lunes]
    );
    const dias = diasSemana(lunes);
    const [asignaciones, ausencias] = await Promise.all([
      semana
        ? dbAll(`SELECT * FROM hor_asignaciones WHERE semana_id = ? ORDER BY dia, inicio_min, orden`, [semana.id])
        : Promise.resolve([]),
      // Vacaciones y bajas que pisan esta semana: es lo que distingue «libra» de «está de baja».
      // Solo las de la gente de ESTE local. Sin el JOIN entraban las de todo el grupo, y de
      // ahí pasaban al snapshot publicado: las bajas médicas de Lloret acababan guardadas
      // dentro del horario de Blanes.
      dbAll(`${AUS_DEL_LOCAL}`, [local, dias[6], dias[0]]).catch(() => []),
    ]);
    // La fila de fiesta se manda ya calculada: la pantalla no la deduce por su cuenta, para
    // que no pueda decir una cosa distinta de la que dice el PDF.
    const descansos = descansosPorDia({ dias, trabajadores: equipo, asignaciones, ausencias, areas });
    res.json({ ok: true, local, lunes, dias, semana: semana || null, areas, tramos, equipo, asignaciones, ausencias, descansos });
  } catch (e) {
    console.error("[horarios] semana:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar la semana" });
  }
});

// Crea el borrador de una semana. Idempotente: si ya existe, lo devuelve.
app.post("/api/horarios/semana", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.body?.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const lunes = lunesDe(String(req.body?.lunes || ""));
    if (!lunes) return res.status(400).json({ ok: false, error: "Semana no válida" });

    const cerrada = await dbGet(`SELECT id FROM hor_semanas WHERE local = ? AND lunes = ? AND estado = 'cerrado'`, [local, lunes]);
    if (cerrada) return res.status(409).json({ ok: false, error: "Esa semana está cerrada y no se puede replanificar." });

    const ya = await dbGet(`SELECT * FROM hor_semanas WHERE local = ? AND lunes = ? AND estado = 'borrador'`, [local, lunes]);
    if (ya) return res.json({ ok: true, semana: ya, creada: false });

    const max = await dbGet(`SELECT COALESCE(MAX(version), 0) AS v FROM hor_semanas WHERE local = ? AND lunes = ?`, [local, lunes]);
    const fila = await dbRun(
      `INSERT INTO hor_semanas (local, lunes, version, estado, origen, creado_en, creado_por)
       VALUES (?, ?, ?, 'borrador', 'manual', ?, ?) RETURNING *`,
      [local, lunes, Number(max.v) + 1, isoConOffset(Date.now()), req.user.nombre || req.user.username]
    );
    res.json({ ok: true, semana: fila, creada: true });
  } catch (e) {
    console.error("[horarios] crear semana:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo crear la semana" });
  }
});

// Comprueba que la asignación es de una semana editable y del local del usuario.
async function horSemanaEditable(req, semanaId) {
  const s = await dbGet(`SELECT * FROM hor_semanas WHERE id = ?`, [semanaId]);
  if (!s) return { error: 404, mensaje: "Semana no encontrada" };
  if (!rrhhPuedeLocal(req, s.local)) return { error: 403, mensaje: "Sin acceso a este establecimiento" };
  if (s.estado !== "borrador") return { error: 409, mensaje: "Solo se puede editar el borrador. Crea una versión nueva para cambiar un horario publicado." };
  return { semana: s };
}

app.post("/api/horarios/asignacion", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const { semana_id, worker_id, dia, area_id, tramo_id, inicio_min, fin_min } = req.body || {};
    const chk = await horSemanaEditable(req, semana_id);
    if (chk.error) return res.status(chk.error).json({ ok: false, error: chk.mensaje });
    if (!worker_id || !dia) return res.status(400).json({ ok: false, error: "Faltan la persona y el día" });
    const quien = await horTrabajadorDelLocal(worker_id, chk.semana.local);
    if (quien.error) return res.status(quien.error).json({ ok: false, error: quien.mensaje });
    const ini = Number(inicio_min), fin = Number(fin_min);
    if (!Number.isInteger(ini) || !Number.isInteger(fin) || fin < ini || fin > 2160) {
      return res.status(400).json({ ok: false, error: "El horario no es válido" });
    }
    if (!diasSemana(chk.semana.lunes).includes(String(dia))) {
      return res.status(400).json({ ok: false, error: "Ese día no es de esta semana" });
    }
    if (await horEsBloqueDescanso(tramo_id)) {
      return res.status(400).json({ ok: false, error: "La fila de fiesta se calcula sola: sale quien no tiene turno ese día. Para que alguien libre, quítale el turno." });
    }
    const fila = await dbRun(
      `INSERT INTO hor_asignaciones (semana_id, local, worker_id, dia, area_id, tramo_id, inicio_min, fin_min, fin_abierto, tipo, nota, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [chk.semana.id, chk.semana.local, worker_id, dia, area_id || null, tramo_id || null, ini, fin,
       !!req.body.fin_abierto, req.body.tipo || "turno", req.body.nota || null, isoConOffset(Date.now())]
    );
    res.json({ ok: true, asignacion: fila });
  } catch (e) {
    console.error("[horarios] crear asignación:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar el turno" });
  }
});

/**
 * ¿Se le puede poner un turno a esta persona en ESTE local?
 *
 * Se comprobaba el local de la SEMANA pero no el del trabajador, así que una petición a mano
 * podía colgar el `worker_id` de Lloret en el cuadrante de Blanes: se publicaba, entraba en el
 * snapshot y luego aparecía como incidencia fantasma en la revisión del local equivocado.
 *
 * La referencia es `users.local`, NO `locales_extra`. Hoy nadie trabaja en dos sitios en la
 * misma semana, y `locales_extra` es un permiso de acceso al panel: tomarlo por autorización
 * laboral metería por la puerta de atrás el multi-local que hemos decidido no construir.
 */
async function horTrabajadorDelLocal(workerId, local) {
  const w = await dbGet(`SELECT id, nombre, local, rol, activo, fecha_alta, fecha_baja FROM users WHERE id = ?`,
    [Number(workerId) || 0]);
  if (!w) return { error: 404, mensaje: "Esa persona no existe" };
  if (!["trabajador", "encargado"].includes(w.rol)) {
    return { error: 400, mensaje: `${w.nombre || "Esa cuenta"} no es personal de sala o cocina: no se le puede poner turno.` };
  }
  if (String(w.local || "") !== String(local)) {
    return { error: 403, mensaje: `${w.nombre || "Esa persona"} no es de ${local}. Solo se puede planificar a la gente de este establecimiento.` };
  }
  return { worker: w };
}

// La fila de fiesta no admite turnos: no es un bloque horario, es el resultado de restar.
// Se comprueba en el servidor y no solo en la pantalla porque el arrastrar-y-soltar y el
// formulario mandan `tramo_id` a pelo, y un turno colgado ahí desaparecería del cuadrante.
async function horEsBloqueDescanso(tramoId) {
  if (!tramoId) return false;
  const t = await dbGet(`SELECT tipo FROM hor_tramos WHERE id = ?`, [tramoId]);
  return esTramoDescanso(t);
}

// Mover o editar un turno. Se usa también al arrastrar en la rejilla.
app.patch("/api/horarios/asignacion/:id", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const a = await dbGet(`SELECT * FROM hor_asignaciones WHERE id = ?`, [req.params.id]);
    if (!a) return res.status(404).json({ ok: false, error: "Turno no encontrado" });
    const chk = await horSemanaEditable(req, a.semana_id);
    if (chk.error) return res.status(chk.error).json({ ok: false, error: chk.mensaje });

    const campos = ["worker_id", "dia", "area_id", "tramo_id", "inicio_min", "fin_min", "fin_abierto", "tipo", "nota"];
    const sets = [], vals = [];
    for (const k of campos) {
      if (req.body[k] === undefined) continue;
      sets.push(`${k} = ?`);
      vals.push(k === "fin_abierto" ? !!req.body[k] : (req.body[k] === "" ? null : req.body[k]));
    }
    if (!sets.length) return res.json({ ok: true, asignacion: a });
    // Reasignar el turno a otra persona pasa por la misma puerta que crearlo.
    if (req.body.worker_id !== undefined) {
      const quien = await horTrabajadorDelLocal(req.body.worker_id, chk.semana.local);
      if (quien.error) return res.status(quien.error).json({ ok: false, error: quien.mensaje });
    }
    const dia = req.body.dia ?? a.dia;
    if (!diasSemana(chk.semana.lunes).includes(String(dia))) {
      return res.status(400).json({ ok: false, error: "Ese día no es de esta semana" });
    }
    // Arrastrar un turno a la fila de fiesta: misma razón que al crearlo.
    if (req.body.tramo_id !== undefined && await horEsBloqueDescanso(req.body.tramo_id)) {
      return res.status(400).json({ ok: false, error: "La fila de fiesta se calcula sola: sale quien no tiene turno ese día. Para que alguien libre, quítale el turno." });
    }
    vals.push(a.id);
    const fila = await dbRun(`UPDATE hor_asignaciones SET ${sets.join(", ")} WHERE id = ? RETURNING *`, vals);
    res.json({ ok: true, asignacion: fila });
  } catch (e) {
    console.error("[horarios] editar asignación:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo mover el turno" });
  }
});

app.delete("/api/horarios/asignacion/:id", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const a = await dbGet(`SELECT * FROM hor_asignaciones WHERE id = ?`, [req.params.id]);
    if (!a) return res.json({ ok: true });
    const chk = await horSemanaEditable(req, a.semana_id);
    if (chk.error) return res.status(chk.error).json({ ok: false, error: chk.mensaje });
    await dbRun(`DELETE FROM hor_asignaciones WHERE id = ?`, [a.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo borrar el turno" }); }
});

// Contexto para detectar conflictos: ausencias, contratos y necesidades del local.
/**
 * Turnos YA PUBLICADOS del día anterior al lunes y del siguiente al domingo.
 *
 * Solo se usan para medir el descanso entre jornadas. Se piden del horario PUBLICADO y no del
 * borrador de la semana de al lado: un borrador es una idea a medias, y avisar de un descanso
 * corto contra un turno que todavía puede cambiar sería ruido.
 */
async function horVecinas(local, dias) {
  return dbAll(
    `SELECT a.id, a.worker_id, a.dia, a.inicio_min, a.fin_min, a.tipo
       FROM hor_asignaciones a JOIN hor_semanas s ON s.id = a.semana_id
      WHERE a.local = ? AND s.estado = 'publicado' AND a.dia IN (?, ?)`,
    [local, sumaDias(dias[0], -1), sumaDias(dias[6], 1)]).catch(() => []);
}

// `estado = 'aprobada'` NO es un detalle: sin él, en cuanto alguien PIDE unas vacaciones su
// nombre aparecería en la fila de fiesta del cuadrante marcado como «vacaciones», antes de que
// nadie se las haya concedido. Una solicitud no cambia el horario hasta que se aprueba.
const AUS_DEL_LOCAL = `SELECT a.worker_id, a.tipo, a.desde, a.hasta, a.estado FROM hor_ausencias a
             JOIN users u ON u.id = a.worker_id
            WHERE u.local = ? AND a.estado = 'aprobada' AND a.desde <= ? AND a.hasta >= ?`;

async function horContexto(local, lunes, dias) {
  // Ausencias y contratos se traían SIN filtro de local: todo el grupo entraba en el motor
  // de conflictos de cada establecimiento. No llegaba a la pantalla porque los conflictos se
  // calculan sobre los turnos de la semana, pero sí llegaba al snapshot que se guarda para
  // siempre. Se filtran con un JOIN sobre `users`, que es quien sabe de qué local es cada uno.
  const [ausencias, contratos, necesidades] = await Promise.all([
    dbAll(`SELECT a.* FROM hor_ausencias a JOIN users u ON u.id = a.worker_id
            WHERE u.local = ? AND a.estado = 'aprobada' AND a.hasta >= ? AND a.desde <= ?`, [local, dias[0], dias[6]]),
    dbAll(`SELECT c.* FROM hor_contratos c JOIN users u ON u.id = c.worker_id
            WHERE u.local = ? AND c.desde <= ? AND (c.hasta IS NULL OR c.hasta >= ?)`, [local, dias[6], dias[0]]),
    dbAll(`SELECT * FROM hor_necesidades WHERE local = ?`, [local]),
  ]);
  return { ausencias, contratos, necesidades };
}

// Conflictos de una semana. Se consulta al abrirla y antes de publicar.
app.get("/api/horarios/semana/:id/conflictos", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const s = await dbGet(`SELECT * FROM hor_semanas WHERE id = ?`, [req.params.id]);
    if (!s) return res.status(404).json({ ok: false, error: "Semana no encontrada" });
    if (!rrhhPuedeLocal(req, s.local)) return res.status(403).json({ ok: false, error: "Sin acceso" });
    const dias = diasSemana(s.lunes);
    const [asignaciones, equipo, areas, tramos, ctx] = await Promise.all([
      dbAll(`SELECT * FROM hor_asignaciones WHERE semana_id = ?`, [s.id]),
      dbAll(`SELECT id, nombre, username FROM users WHERE local = ? AND rol IN ('trabajador','encargado')`, [s.local]),
      dbAll(`SELECT id, nombre FROM hor_areas WHERE local = ?`, [s.local]),
      dbAll(`SELECT id, nombre FROM hor_tramos WHERE local = ?`, [s.local]),
      horContexto(s.local, s.lunes, dias),
    ]);
    const vecinas = await horVecinas(s.local, dias);
    const conflictos = detectarConflictos({ lunes: s.lunes, asignaciones, trabajadores: equipo, areas, tramos, vecinas, ...ctx });
    res.json({ ok: true, ...resumirConflictos(conflictos), conflictos });
  } catch (e) {
    console.error("[horarios] conflictos:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron revisar los conflictos" });
  }
});

// Copiar una semana (o aplicar una plantilla) sobre el borrador. Nunca publica solo.
app.post("/api/horarios/semana/:id/copiar", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const chk = await horSemanaEditable(req, req.params.id);
    if (chk.error) return res.status(chk.error).json({ ok: false, error: chk.mensaje });
    const destino = chk.semana;
    const diasDestino = diasSemana(destino.lunes);
    const ahora = isoConOffset(Date.now());

    let lineas = [];
    if (req.body?.plantilla_id) {
      const pl = await dbGet(`SELECT * FROM hor_plantillas WHERE id = ? AND local = ?`, [req.body.plantilla_id, destino.local]);
      if (!pl) return res.status(404).json({ ok: false, error: "Plantilla no encontrada" });
      const filas = await dbAll(`SELECT * FROM hor_plantilla_lineas WHERE plantilla_id = ? ORDER BY dow, inicio_min`, [pl.id]);
      lineas = filas.filter((f) => f.worker_id).map((f) => ({ ...f, dia: diasDestino[Number(f.dow)] }));
    } else {
      const lunesOrigen = lunesDe(String(req.body?.lunes || "")) || addDiasISO(destino.lunes, -7);
      const origen = await dbGet(
        `SELECT * FROM hor_semanas WHERE local = ? AND lunes = ? AND estado IN ('publicado','borrador','sustituido','cerrado')
         ORDER BY CASE estado WHEN 'publicado' THEN 0 WHEN 'cerrado' THEN 1 ELSE 2 END, version DESC LIMIT 1`,
        [destino.local, lunesOrigen]
      );
      if (!origen) return res.status(404).json({ ok: false, error: "Esa semana no existe, no hay nada que copiar." });
      const filas = await dbAll(`SELECT * FROM hor_asignaciones WHERE semana_id = ?`, [origen.id]);
      const diasOrigen = diasSemana(origen.lunes);
      lineas = filas.map((f) => ({ ...f, dia: diasDestino[diasOrigen.indexOf(f.dia)] })).filter((f) => f.dia);
    }

    // Al copiar se COMPRUEBA quién sigue: dar de baja a alguien y que reaparezca en el
    // cuadrante de la semana que viene sería un fallo grave y silencioso.
    // Se traen TODOS con sus fechas y se decide DÍA A DÍA, no de golpe. `fecha_baja IS NULL`
    // dejaba fuera a quien causa baja el jueves: los lunes, martes y miércoles sí trabaja y
    // sus turnos tenían que copiarse. Y al revés: no basta con que esté «activo», porque
    // entonces se le copiarían también los días de después de irse.
    const equipo = await dbAll(
      `SELECT id, nombre, fecha_alta, fecha_baja, activo FROM users WHERE local = ? AND ${SQL_PLANTILLA}`,
      [destino.local]);
    const porWorker = new Map(equipo.map((w) => [String(w.id), w]));
    const { ausencias } = await horContexto(destino.local, destino.lunes, diasDestino);
    const ausente = (wid, dia) => (ausencias || []).some((a) =>
      String(a.worker_id) === String(wid) && String(a.desde) <= dia && dia <= String(a.hasta));

    const omitidos = [];
    let copiadas = 0;
    if (req.body?.reemplazar) await dbRun(`DELETE FROM hor_asignaciones WHERE semana_id = ?`, [destino.id]);
    for (const l of lineas) {
      const w = porWorker.get(String(l.worker_id));
      if (!w) { omitidos.push({ worker_id: l.worker_id, dia: l.dia, motivo: "ya no está en el equipo" }); continue; }
      if (!activoAhora(w, l.dia)) {
        omitidos.push({ worker_id: l.worker_id, nombre: w.nombre, dia: l.dia,
          motivo: w.fecha_baja ? `causó baja el ${w.fecha_baja}` : "la cuenta está desactivada" });
        continue;
      }
      if (ausente(l.worker_id, l.dia)) { omitidos.push({ worker_id: l.worker_id, dia: l.dia, motivo: "tiene una ausencia aprobada" }); continue; }
      await dbRun(
        `INSERT INTO hor_asignaciones (semana_id, local, worker_id, dia, area_id, tramo_id, inicio_min, fin_min, fin_abierto, tipo, nota, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [destino.id, destino.local, l.worker_id, l.dia, l.area_id, l.tramo_id, l.inicio_min, l.fin_min, !!l.fin_abierto, l.tipo || "turno", l.nota || null, ahora]
      );
      copiadas++;
    }
    await dbRun(`UPDATE hor_semanas SET origen = ? WHERE id = ?`,
      [req.body?.plantilla_id ? `plantilla:${req.body.plantilla_id}` : "copia", destino.id]);
    res.json({ ok: true, copiadas, omitidos });
  } catch (e) {
    console.error("[horarios] copiar:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo copiar" });
  }
});
const addDiasISO = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Publicar. Es una transacción: o se hace todo o no se hace nada. Sustituye la versión
// anterior, congela el snapshot con su hash y deja rastro.
app.post("/api/horarios/semana/:id/publicar", requireAuth(HORARIOS_ROLES), async (req, res) => {
  const client = await pool.connect();
  try {
    const q = (sql, p = []) => client.query(toPositional(sql), p);
    await client.query("BEGIN");
    const s = (await q(`SELECT * FROM hor_semanas WHERE id = ? FOR UPDATE`, [req.params.id])).rows[0];
    if (!s) { await client.query("ROLLBACK"); return res.status(404).json({ ok: false, error: "Semana no encontrada" }); }
    if (!rrhhPuedeLocal(req, s.local)) { await client.query("ROLLBACK"); return res.status(403).json({ ok: false, error: "Sin acceso" }); }

    const dias = diasSemana(s.lunes);
    const asignaciones = (await q(`SELECT * FROM hor_asignaciones WHERE semana_id = ?`, [s.id])).rows;
    const equipo = (await q(`SELECT id, nombre, username FROM users WHERE local = ? AND ${SQL_PLANTILLA}`, [s.local])).rows;
    // La PLANTILLA del snapshot: quien estuvo en esa semana, aunque ya se haya ido. Filtrar
    // por `activo` aquí borraría del papel a quien trabajó y luego causó baja.
    const plantilla = (await q(`SELECT id, nombre, username, fecha_alta, fecha_baja FROM users
                                WHERE local = ? AND ${SQL_ESTUVO_ENTRE}`, [s.local, dias[6], dias[0]])).rows;
    const areas = (await q(`SELECT id, nombre, orden FROM hor_areas WHERE local = ? ORDER BY orden`, [s.local])).rows;
    const tramos = (await q(`SELECT id, nombre, orden, inicio_min, fin_min, tipo FROM hor_tramos WHERE local = ? ORDER BY orden`, [s.local])).rows;
    // AQUÍ estaba el daño: este array se guarda dentro de `hor_publicaciones.snapshot`, así
    // que las vacaciones y las BAJAS MÉDICAS de todos los locales quedaban escritas para
    // siempre dentro del horario de uno solo. Un tipo='baja' es dato de salud.
    const ausencias = (await q(`SELECT a.* FROM hor_ausencias a JOIN users u ON u.id = a.worker_id
                                 WHERE u.local = ? AND a.estado = 'aprobada' AND a.hasta >= ? AND a.desde <= ?`,
      [s.local, dias[0], dias[6]])).rows;
    const contratos = (await q(`SELECT c.* FROM hor_contratos c JOIN users u ON u.id = c.worker_id
                                 WHERE u.local = ? AND c.desde <= ?`, [s.local, dias[6]])).rows;
    const necesidades = (await q(`SELECT * FROM hor_necesidades WHERE local = ?`, [s.local])).rows;

    const vecinas = (await q(
      `SELECT a.id, a.worker_id, a.dia, a.inicio_min, a.fin_min, a.tipo
         FROM hor_asignaciones a JOIN hor_semanas s2 ON s2.id = a.semana_id
        WHERE a.local = ? AND s2.estado = 'publicado' AND a.dia IN (?, ?)`,
      [s.local, sumaDias(dias[0], -1), sumaDias(dias[6], 1)])).rows;
    const conflictos = detectarConflictos({ lunes: s.lunes, asignaciones, trabajadores: equipo, areas, tramos, ausencias, contratos, necesidades, vecinas });
    const val = validarPublicacion({ estado: s.estado, conflictos, avisosAceptados: req.body?.aceptar_avisos ? true : null });
    if (!val.ok) { await client.query("ROLLBACK"); return res.status(409).json({ ok: false, ...val }); }

    const ahora = isoConOffset(Date.now());
    const quien = req.user.nombre || req.user.username;

    // El snapshot que estaba vigente hasta este momento. Se lee AQUÍ, dentro de la misma
    // transacción y antes de tocar nada, porque es contra él contra lo que se va a comparar:
    // la comunicación tiene que poder reconstruirse igual dentro de dos años, y para eso los
    // dos lados de la comparación tienen que ser datos congelados, nunca los de hoy.
    const anteriorPub = (await q(
      `SELECT p.id, p.version, p.snapshot FROM hor_publicaciones p
         JOIN hor_semanas s2 ON s2.id = p.semana_id
        WHERE s2.local = ? AND s2.lunes = ? AND s2.estado = 'publicado'
        ORDER BY p.version DESC LIMIT 1`, [s.local, s.lunes])).rows[0] || null;

    // La anterior publicada pasa a sustituida, con la hora exacta: es lo que permite
    // preguntar dentro de dos años qué horario regía un día concreto.
    await q(`UPDATE hor_semanas SET estado = 'sustituido', sustituido_en = ? WHERE local = ? AND lunes = ? AND estado = 'publicado'`,
      [ahora, s.local, s.lunes]);
    await q(`UPDATE hor_semanas SET estado = 'publicado', publicado_en = ?, publicado_por = ?, avisos_aceptados = ? WHERE id = ?`,
      [ahora, quien, conflictos.length ? JSON.stringify({ por: quien, en: ahora, avisos: conflictos.filter((c) => c.severidad === "avisa") }) : null, s.id]);

    const snapshot = construirSnapshot({ semana: s, areas, tramos, asignaciones, trabajadores: plantilla, ausencias, dias });
    const texto = serializarCanonico(snapshot);
    await q(`INSERT INTO hor_publicaciones (semana_id, local, lunes, version, snapshot, hash, publicado_en, publicado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (semana_id) DO NOTHING`,
      [s.id, s.local, s.lunes, s.version, texto, crypto.createHash("sha256").update(texto).digest("hex"), ahora, quien]);

    // ── A quién le cambia algo, y qué ────────────────────────────────────────────────────
    // Va DENTRO de la transacción de publicar a propósito. Si se hiciera después y fallara,
    // quedaría un horario publicado del que nadie se ha enterado —el peor de los dos mundos—.
    // Y si falla, no se publica: es preferible reintentar a publicar a ciegas.
    //
    // La primera publicación de una semana no genera nada: no es un cambio, es el horario.
    let comunicadas = 0;
    if (anteriorPub) {
      const cambios = cambiosPorTrabajador(JSON.parse(anteriorPub.snapshot), snapshot);
      for (const c of cambios) {
        const cuerpo = {
          worker_id: c.worker_id, lunes: s.lunes, local: s.local,
          versionAnterior: anteriorPub.version, versionNueva: s.version, dias: c.dias,
        };
        const canon = serializarCanonico(cuerpo);
        await q(
          `INSERT INTO hor_cambios_comunicados
             (local, lunes, worker_id, semana_id, publicacion_anterior_id, publicacion_nueva_id,
              version_anterior, version_nueva, diff, hash, publicado_en, creado_en)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT (publicacion_nueva_id, worker_id) DO NOTHING`,
          [s.local, s.lunes, c.worker_id, s.id, anteriorPub.id, s.id,
           anteriorPub.version, s.version, canon,
           crypto.createHash("sha256").update(canon).digest("hex"), ahora, ahora]);
        comunicadas++;
      }
    }

    await client.query("COMMIT");
    if (comunicadas) {
      await ficAuditar("horario", s.id, "comunicar_cambios", quien,
        { local: s.local, detalle: { lunes: s.lunes, version: s.version, afectados: comunicadas } }).catch(() => {});
    }
    res.json({ ok: true, version: s.version, afectados: comunicadas,
      avisos: conflictos.filter((c) => c.severidad === "avisa").length });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* ya deshecha */ }
    console.error("[horarios] publicar:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo publicar" });
  } finally { client.release(); }
});

// Crear una versión nueva a partir de la publicada, para poder cambiarla sin tocarla.
app.post("/api/horarios/semana/:id/nueva-version", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const s = await dbGet(`SELECT * FROM hor_semanas WHERE id = ?`, [req.params.id]);
    if (!s) return res.status(404).json({ ok: false, error: "Semana no encontrada" });
    if (!rrhhPuedeLocal(req, s.local)) return res.status(403).json({ ok: false, error: "Sin acceso" });
    const ya = await dbGet(`SELECT * FROM hor_semanas WHERE local = ? AND lunes = ? AND estado = 'borrador'`, [s.local, s.lunes]);
    if (ya) return res.json({ ok: true, semana: ya, creada: false });

    const max = await dbGet(`SELECT COALESCE(MAX(version),0) AS v FROM hor_semanas WHERE local = ? AND lunes = ?`, [s.local, s.lunes]);
    const ahora = isoConOffset(Date.now());
    const nueva = await dbRun(
      `INSERT INTO hor_semanas (local, lunes, version, estado, origen, creado_en, creado_por)
       VALUES (?, ?, ?, 'borrador', ?, ?, ?) RETURNING *`,
      [s.local, s.lunes, Number(max.v) + 1, `version:${s.version}`, ahora, req.user.nombre || req.user.username]
    );
    const filas = await dbAll(`SELECT * FROM hor_asignaciones WHERE semana_id = ?`, [s.id]);
    for (const f of filas) {
      await dbRun(
        `INSERT INTO hor_asignaciones (semana_id, local, worker_id, dia, area_id, tramo_id, inicio_min, fin_min, fin_abierto, tipo, nota, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nueva.id, f.local, f.worker_id, f.dia, f.area_id, f.tramo_id, f.inicio_min, f.fin_min, f.fin_abierto, f.tipo, f.nota, ahora]
      );
    }
    res.json({ ok: true, semana: nueva, creada: true, copiadas: filas.length });
  } catch (e) {
    console.error("[horarios] nueva versión:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo crear la versión" });
  }
});

// Plantillas: guardar una semana como plantilla y listarlas.
app.get("/api/horarios/plantillas", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso" });
    const filas = await dbAll(
      `SELECT p.*, (SELECT COUNT(*) FROM hor_plantilla_lineas l WHERE l.plantilla_id = p.id)::int AS lineas
       FROM hor_plantillas p WHERE p.local = ? AND p.activo ORDER BY p.nombre`, [local]);
    res.json({ ok: true, data: filas });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudieron cargar las plantillas" }); }
});

app.post("/api/horarios/plantillas", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const s = await dbGet(`SELECT * FROM hor_semanas WHERE id = ?`, [req.body?.semana_id]);
    if (!s) return res.status(404).json({ ok: false, error: "Semana no encontrada" });
    if (!rrhhPuedeLocal(req, s.local)) return res.status(403).json({ ok: false, error: "Sin acceso" });
    const nombre = String(req.body?.nombre || "").trim();
    if (!nombre) return res.status(400).json({ ok: false, error: "Ponle un nombre a la plantilla" });
    const ahora = isoConOffset(Date.now());
    const pl = await dbRun(
      `INSERT INTO hor_plantillas (local, nombre, descripcion, creado_en, creado_por) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (local, nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion RETURNING *`,
      [s.local, nombre, req.body?.descripcion || null, ahora, req.user.nombre || req.user.username]
    );
    await dbRun(`DELETE FROM hor_plantilla_lineas WHERE plantilla_id = ?`, [pl.id]);
    const dias = diasSemana(s.lunes);
    const filas = await dbAll(`SELECT * FROM hor_asignaciones WHERE semana_id = ?`, [s.id]);
    for (const f of filas) {
      const dow = dias.indexOf(f.dia);
      if (dow < 0) continue;
      await dbRun(
        `INSERT INTO hor_plantilla_lineas (plantilla_id, dow, worker_id, area_id, tramo_id, inicio_min, fin_min, fin_abierto, tipo, nota)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [pl.id, dow, f.worker_id, f.area_id, f.tramo_id, f.inicio_min, f.fin_min, f.fin_abierto, f.tipo, f.nota]
      );
    }
    res.json({ ok: true, plantilla: pl, lineas: filas.length });
  } catch (e) {
    console.error("[horarios] plantilla:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar la plantilla" });
  }
});

// PDF de una semana. Si está publicada se genera desde el SNAPSHOT congelado, no desde las
// tablas vivas: así el documento de un horario antiguo sigue diciendo lo mismo dentro de
// dos años aunque se haya renombrado un área o dado de baja a alguien.
app.get("/api/horarios/semana/:id/pdf", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const s = await dbGet(`SELECT * FROM hor_semanas WHERE id = ?`, [req.params.id]);
    if (!s) return res.status(404).json({ ok: false, error: "Semana no encontrada" });
    if (!rrhhPuedeLocal(req, s.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });

    const { buffer, layout, nombre } = await horPdfDeSemana(s);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nombre}"`);
    res.setHeader("X-Horario-Paginas", String(layout.paginas.length));
    res.send(buffer);
  } catch (e) {
    console.error("[horarios] pdf:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo generar el PDF" });
  }
});

// Construye el PDF de una semana. Compartido por la descarga y por el envío al grupo:
// tienen que ser EL MISMO documento, byte a byte, o el que se manda por WhatsApp y el que
// se imprime dejarían de ser lo mismo.
async function horPdfDeSemana(s) {
  const dias = diasSemana(s.lunes);
  const pub = await dbGet(`SELECT snapshot FROM hor_publicaciones WHERE semana_id = ?`, [s.id]);
  let areas, tramos, asignaciones, equipo, ausencias = [];
  if (pub && pub.snapshot) {
    const snap = JSON.parse(pub.snapshot);
    areas = snap.areas; tramos = snap.tramos; asignaciones = snap.asignaciones;
    // La plantilla del snapshot (v2) es la de aquel día. Si no está —snapshots v1, anteriores
    // a la fila de fiesta— se deduce de los turnos, y como esos tramos tampoco traen `tipo`
    // no se dibuja ninguna fila calculada: el PDF sale exactamente igual que el que se mandó.
    equipo = snap.plantilla || snap.asignaciones.map((a) => ({ id: a.worker_id, nombre: a.nombre }));
    ausencias = snap.ausencias || [];
  } else {
    [areas, tramos, asignaciones, equipo, ausencias] = await Promise.all([
      dbAll(`SELECT id, nombre, orden FROM hor_areas WHERE local = ? AND activo ORDER BY orden, nombre`, [s.local]),
      dbAll(`SELECT id, nombre, orden, inicio_min, fin_min, tipo FROM hor_tramos WHERE local = ? AND activo ORDER BY orden`, [s.local]),
      dbAll(`SELECT * FROM hor_asignaciones WHERE semana_id = ?`, [s.id]),
      dbAll(`SELECT id, nombre, username, fecha_alta, fecha_baja FROM users
             WHERE local = ? AND rol IN ('trabajador','encargado') AND COALESCE(activo,1) = 1`, [s.local]),
      dbAll(`SELECT a.worker_id, a.tipo, a.desde, a.hasta, a.estado FROM hor_ausencias a
             JOIN users u ON u.id = a.worker_id
            WHERE u.local = ? AND a.estado = 'aprobada' AND a.desde <= ? AND a.hasta >= ?`, [s.local, dias[6], dias[0]]).catch(() => []),
    ]);
  }
  const cuadrante = construirCuadrante({ lunes: s.lunes, tramos, areas, asignaciones, trabajadores: equipo, ausencias });
  const { buffer, layout, perdidos } = construirPdfSemana(
    { local: s.local, lunes: s.lunes, dias, bloques: cuadrante.bloques, estado: s.estado, version: s.version },
    { ahora: isoConOffset(Date.now()) }
  );
  if (perdidos.length) console.warn("[horarios] PDF con caracteres sustituidos:", [...new Set(perdidos)].join(" "));
  return { buffer, layout, dias, nombre: nombreFichero({ local: s.local, lunes: s.lunes, domingo: dias[6], version: s.version, estado: s.estado }) };
}

// ── Plantilla del local: lo que alimenta los avisos y el generador ───────────
// Necesidades (cuánta gente hace falta), contratos, ausencias y disponibilidad. Todo esto
// existía en la base desde la fase 2 pero no había forma de rellenarlo sin entrar por SQL,
// que es tanto como no tenerlo.
app.get("/api/horarios/plantilla", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const x = { run: (sql, p = []) => dbRun(sql, p) };
    await sembrarLocal(x, local, isoConOffset(Date.now()));

    const [areas, tramos, equipo, necesidades, contratos, ausencias, disponibilidad] = await Promise.all([
      dbAll(`SELECT id, nombre, orden FROM hor_areas WHERE local = ? AND activo ORDER BY orden, nombre`, [local]),
      dbAll(`SELECT id, nombre, orden, inicio_min, fin_min FROM hor_tramos WHERE local = ? AND activo ORDER BY orden, inicio_min`, [local]),
      dbAll(`SELECT id, nombre, username FROM users WHERE local = ? AND rol IN ('trabajador','encargado')
             AND COALESCE(activo,1) = 1 AND fecha_baja IS NULL ORDER BY nombre`, [local]),
      dbAll(`SELECT id, area_id, tramo_id, dow, minimo, objetivo,
                    duracion_min, ventana_inicio_min, ventana_fin_min, etiqueta
             FROM hor_necesidades WHERE local = ?`, [local]),
      dbAll(`SELECT c.id, c.worker_id, c.desde, c.hasta, c.horas_semana, c.dias_semana FROM hor_contratos c
             JOIN users u ON u.id = c.worker_id WHERE u.local = ? ORDER BY c.worker_id, c.desde DESC`, [local]),
      dbAll(`SELECT a.id, a.worker_id, a.tipo, a.desde, a.hasta, a.estado, a.motivo, a.origen,
                    a.comentario, a.respuesta, a.solicitado_por, a.resuelto_por
               FROM hor_ausencias a JOIN users u ON u.id = a.worker_id
              WHERE u.local = ? AND a.hasta >= ? ORDER BY a.desde`,
        [local, sumaDias(instanteANegocio(Date.now()).diaNegocio, -30)]),
      dbAll(`SELECT d.id, d.worker_id, d.dow, d.inicio_min, d.fin_min, d.preferencia,
                    d.origen, d.autor, d.actualizado_en
               FROM hor_disponibilidad d JOIN users u ON u.id = d.worker_id
              WHERE u.local = ? ORDER BY d.worker_id, d.dow`, [local]),
    ]);
    res.json({ ok: true, local, areas, tramos, equipo, necesidades, contratos, ausencias, disponibilidad,
      // Solo lectura: si hay contratos pisándose, que se vean. No se arreglan solos.
      contratosSolapados: contratosSolapados(contratos) });
  } catch (e) {
    console.error("[horarios] plantilla:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar la configuración" });
  }
});

// Las necesidades se guardan enteras de una vez: es una rejilla, y guardarla celda a celda
// dejaría medio configurado un local si se cae la conexión a la mitad.
app.put("/api/horarios/necesidades", requireAuth(HORARIOS_ROLES), async (req, res) => {
  const client = await pool.connect();
  try {
    const local = horLocal(req, req.body?.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const filas = Array.isArray(req.body?.necesidades) ? req.body.necesidades : [];

    await client.query("BEGIN");
    const q = (sql, p = []) => client.query(toPositional(sql), p);
    await q(`DELETE FROM hor_necesidades WHERE local = ?`, [local]);
    const ahora = isoConOffset(Date.now());
    let n = 0;
    for (const f of filas) {
      const minimo = Math.max(0, Math.round(Number(f.minimo) || 0));
      const objetivo = f.objetivo == null || f.objetivo === "" ? null : Math.max(minimo, Math.round(Number(f.objetivo)));
      if (!minimo && !objetivo) continue;          // celda vacía: no se guarda una fila de ceros
      const dow = Number(f.dow);
      if (!(dow >= 0 && dow <= 6)) continue;

      // Refuerzo: dura lo que dure y cae donde quepa dentro de su ventana. No tiene tramo.
      const duracion = Math.round(Number(f.duracion_min) || 0);
      const vIni = f.ventana_inicio_min == null ? null : Math.round(Number(f.ventana_inicio_min));
      const vFin = f.ventana_fin_min == null ? null : Math.round(Number(f.ventana_fin_min));
      if (duracion > 0) {
        if (!Number.isFinite(vIni) || !Number.isFinite(vFin) || vFin - vIni < duracion) {
          // `throw`, no `return`: un `return` aquí dentro salía de la función con la
          // transacción abierta, y el `finally` devolvía al pool una conexión con un DELETE
          // sin confirmar. La siguiente petición que la cogiera heredaba esa transacción.
          const err = new Error("Un refuerzo necesita una horquilla al menos tan larga como su duración");
          err.publico = 400;
          throw err;
        }
      }

      await q(`INSERT INTO hor_necesidades (local, area_id, tramo_id, dow, minimo, objetivo,
                                            duracion_min, ventana_inicio_min, ventana_fin_min, etiqueta, creado_en)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [local, Number(f.area_id), duracion > 0 ? null : Number(f.tramo_id), dow, minimo, objetivo,
         duracion > 0 ? duracion : null, duracion > 0 ? vIni : null, duracion > 0 ? vFin : null,
         f.etiqueta ? String(f.etiqueta).slice(0, 60) : null, ahora]);
      n++;
    }
    await client.query("COMMIT");
    res.json({ ok: true, guardadas: n });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    if (e.publico) return res.status(e.publico).json({ ok: false, error: e.message });
    console.error("[horarios] necesidades:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron guardar las necesidades" });
  } finally { client.release(); }
});

// Los turnos del local (hor_tramos). Editables: los que se siembran al empezar son un
// punto de partida, no una verdad. Cada casa tiene los suyos y suponerlos sale caro,
// porque de ellos cuelgan las necesidades, el generador y lo que escribe el PDF.
app.put("/api/horarios/tramos", requireAuth(HORARIOS_ROLES), async (req, res) => {
  const client = await pool.connect();
  try {
    const local = horLocal(req, req.body?.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const filas = Array.isArray(req.body?.tramos) ? req.body.tramos : [];
    if (!filas.length) return res.status(400).json({ ok: false, error: "Tiene que quedar al menos un turno" });

    for (const t of filas) {
      const ini = Number(t.inicio_min), fin = Number(t.fin_min);
      if (!String(t.nombre || "").trim()) return res.status(400).json({ ok: false, error: "Todos los turnos necesitan un nombre" });
      if (!Number.isFinite(ini) || !Number.isFinite(fin) || fin <= ini) {
        return res.status(400).json({ ok: false, error: `«${t.nombre}»: la hora de salida tiene que ser posterior a la de entrada` });
      }
      // Hasta 2160 = 36:00, que permite un turno que acabe de madrugada del día siguiente.
      if (fin > 2160) return res.status(400).json({ ok: false, error: `«${t.nombre}»: no puede acabar más allá de las 12:00 del día siguiente` });
    }

    await client.query("BEGIN");
    const q = (sql, p = []) => client.query(toPositional(sql), p);
    const ahora = isoConOffset(Date.now());
    const vivos = [];
    for (const [i, t] of filas.entries()) {
      const nombre = String(t.nombre).trim().slice(0, 40);
      if (t.id) {
        // Se ACTUALIZA, no se borra y recrea: las asignaciones ya escritas apuntan a este
        // id, y recrearlo dejaría huérfanos los cuadrantes de semanas pasadas.
        await q(`UPDATE hor_tramos SET nombre = ?, inicio_min = ?, fin_min = ?, orden = ? WHERE id = ? AND local = ?`,
          [nombre, Number(t.inicio_min), Number(t.fin_min), i, Number(t.id), local]);
        vivos.push(Number(t.id));
      } else {
        const r = await q(`INSERT INTO hor_tramos (local, nombre, orden, inicio_min, fin_min, creado_en)
                           VALUES (?,?,?,?,?,?) ON CONFLICT (local, nombre) DO UPDATE
                           SET inicio_min = EXCLUDED.inicio_min, fin_min = EXCLUDED.fin_min, orden = EXCLUDED.orden, activo = TRUE
                           RETURNING id`,
          [local, nombre, i, Number(t.inicio_min), Number(t.fin_min), ahora]);
        vivos.push(Number(r.rows[0].id));
      }
    }
    // Quitar un turno lo DESACTIVA, no lo borra: los cuadrantes antiguos siguen apuntando
    // a él y el PDF de una semana de hace un año tiene que poder seguir contando la verdad.
    await q(`UPDATE hor_tramos SET activo = FALSE WHERE local = ? AND id <> ALL(?::int[])`, [local, vivos]);
    await client.query("COMMIT");
    res.json({ ok: true, tramos: vivos.length });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[horarios] tramos:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron guardar los turnos" });
  } finally { client.release(); }
});

// Las áreas del local (SALA, COCINA… o BARRA, TERRAZA, OFFICE). Mismo trato que los
// turnos: editables, porque suponerlas es el mismo error. Quitar una la desactiva.
app.put("/api/horarios/areas", requireAuth(HORARIOS_ROLES), async (req, res) => {
  const client = await pool.connect();
  try {
    const local = horLocal(req, req.body?.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const filas = Array.isArray(req.body?.areas) ? req.body.areas : [];
    if (!filas.length) return res.status(400).json({ ok: false, error: "Tiene que quedar al menos un área" });
    if (filas.some((a) => !String(a.nombre || "").trim())) {
      return res.status(400).json({ ok: false, error: "Todas las áreas necesitan un nombre" });
    }

    await client.query("BEGIN");
    const q = (sql, p = []) => client.query(toPositional(sql), p);
    const ahora = isoConOffset(Date.now());
    const vivos = [];
    for (const [i, a] of filas.entries()) {
      const nombre = String(a.nombre).trim().slice(0, 40);
      if (a.id) {
        await q(`UPDATE hor_areas SET nombre = ?, orden = ? WHERE id = ? AND local = ?`, [nombre, i, Number(a.id), local]);
        vivos.push(Number(a.id));
      } else {
        const r = await q(`INSERT INTO hor_areas (local, nombre, orden, creado_en) VALUES (?,?,?,?)
                           ON CONFLICT (local, nombre) DO UPDATE SET orden = EXCLUDED.orden, activo = TRUE
                           RETURNING id`, [local, nombre, i, ahora]);
        vivos.push(Number(r.rows[0].id));
      }
    }
    await q(`UPDATE hor_areas SET activo = FALSE WHERE local = ? AND id <> ALL(?::int[])`, [local, vivos]);
    await client.query("COMMIT");
    res.json({ ok: true, areas: vivos.length });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[horarios] areas:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron guardar las áreas" });
  } finally { client.release(); }
});

// Contrato. Cambiar de 20 a 30 horas NO edita la fila vieja: se cierra la anterior y se
// abre una nueva. Si no, recalcular un mes pasado usaría el contrato de hoy y saldrían
// desviaciones que nunca existieron.
app.post("/api/horarios/contrato", requireAuth(["direccion", "rrhh"]), async (req, res) => {
  try {
    const w = await dbGet(`SELECT id, nombre, local FROM users WHERE id = ?`, [Number(req.body?.worker_id || 0)]);
    if (!w || !rrhhPuedeLocal(req, w.local || "")) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    const horas = Number(req.body?.horas_semana);
    const desde = String(req.body?.desde || "");
    if (!(horas > 0 && horas <= 60)) return res.status(400).json({ ok: false, error: "Las horas semanales tienen que estar entre 1 y 60" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return res.status(400).json({ ok: false, error: "Falta la fecha desde la que vale" });

    const ahora = isoConOffset(Date.now());
    // Se cierra el anterior el día antes: dos contratos vigentes a la vez darían dos
    // respuestas distintas a "cuántas horas tiene contratadas".
    // `desde < ?` dejaba vivo el contrato que empezaba el MISMO día, y quedaban dos vigentes.
    // Con `<=`, el que se reemplaza el mismo día queda cerrado el día antes de empezar: no se
    // borra —sigue en el histórico con quién y cuándo lo puso— pero deja de estar vigente,
    // que es exactamente lo que significa sustituirlo antes de que llegara a aplicarse.
    await dbRun(`UPDATE hor_contratos SET hasta = ? WHERE worker_id = ? AND hasta IS NULL AND desde <= ?`,
      [sumaDias(desde, -1), w.id, desde]);
    await dbRun(`INSERT INTO hor_contratos (worker_id, desde, hasta, horas_semana, dias_semana, creado_en, creado_por)
                 VALUES (?,?,NULL,?,?,?,?)`,
      [w.id, desde, horas, req.body?.dias_semana ? Number(req.body.dias_semana) : null, ahora, req.user.username]);
    // Si en la base había ya contratos pisándose de antes, se DICE y no se toca nada: con dos
    // solapados no se puede saber cuál se quiso poner, y elegir por el usuario escribiría en
    // una nómina una cifra que nadie ha decidido.
    const suyos = await dbAll(`SELECT id, worker_id, desde, hasta, horas_semana FROM hor_contratos WHERE worker_id = ? ORDER BY desde, id`, [w.id]);
    const solapados = contratosSolapados(suyos);
    res.json({
      ok: true, solapados,
      mensaje: `${w.nombre}: ${horas} h/semana desde el ${desde}.`
        + (solapados.length ? ` OJO: le quedan ${solapados.length} contrato(s) pisándose de antes; revísalos.` : ""),
    });
  } catch (e) {
    console.error("[horarios] contrato:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar el contrato" });
  }
});

app.post("/api/horarios/ausencia", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const w = await dbGet(`SELECT id, nombre, local FROM users WHERE id = ?`, [Number(req.body?.worker_id || 0)]);
    if (!w || !rrhhPuedeLocal(req, w.local || "")) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    const { tipo, desde, hasta } = { tipo: String(req.body?.tipo || ""), desde: String(req.body?.desde || ""), hasta: String(req.body?.hasta || "") };
    if (!["vacaciones", "baja", "permiso", "asuntos_propios"].includes(tipo)) return res.status(400).json({ ok: false, error: "Tipo no válido" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return res.status(400).json({ ok: false, error: "Faltan las fechas" });
    if (hasta < desde) return res.status(400).json({ ok: false, error: "La fecha de fin es anterior a la de inicio" });

    // ADJUDICADA: la mete un responsable y nace aprobada. Obligar a dirección a solicitarse a
    // sí misma una baja para luego aprobársela sería un trámite inventado.
    const ahora = isoConOffset(Date.now());
    const estado = ["pendiente", "aprobada"].includes(String(req.body?.estado)) ? String(req.body.estado) : "aprobada";
    const fila = await dbRun(
      `INSERT INTO hor_ausencias (worker_id, local, tipo, desde, hasta, estado, origen, motivo, autor,
                                  resuelto_por, resuelto_en, creado_en)
       VALUES (?,?,?,?,?,?, 'adjudicada', ?,?,?,?,?) RETURNING id`,
      [w.id, w.local, tipo, desde, hasta, estado,
       req.body?.motivo ? String(req.body.motivo).slice(0, 300) : null, req.user.username,
       estado === "aprobada" ? req.user.username : null, estado === "aprobada" ? ahora : null, ahora]);
    await ficAuditar("ausencia", fila.id, "adjudicar", req.user.username,
      { local: w.local, workerId: w.id, detalle: { tipo, desde, hasta, estado } });

    // Si ya tenía turnos dentro, se DICE. No se borra ninguno: ver el comentario de resolver.
    const aviso = await horTurnosEnAusencia(w.id, desde, hasta);
    res.json({ ok: true, id: fila.id, avisoTurnos: aviso.total ? aviso : null,
      mensaje: `${w.nombre}: ${tipo} del ${desde} al ${hasta}.` });
  } catch (e) {
    console.error("[horarios] ausencia:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar la ausencia" });
  }
});

/**
 * Quitar una ausencia. NO la borra: la deja `cancelada`.
 *
 * Un DELETE aquí perdía el rastro de que existió, de quién la puso y de por qué. Y con el
 * circuito nuevo sería peor: se borraría también que alguien la pidió y que se le aprobó.
 * La ruta sigue siendo DELETE porque es lo que llama el panel, pero lo que hace es cancelar.
 */
app.delete("/api/horarios/ausencia/:id", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const a = await dbGet(`SELECT a.id, a.estado, a.worker_id, u.local FROM hor_ausencias a JOIN users u ON u.id = a.worker_id WHERE a.id = ?`, [Number(req.params.id)]);
    if (!a || !rrhhPuedeLocal(req, a.local || "")) return res.status(404).json({ ok: false, error: "No encontrada" });
    if (a.estado === "cancelada") return res.json({ ok: true });
    await dbRun(`UPDATE hor_ausencias SET estado = 'cancelada', cancelado_por = ?, cancelado_en = ? WHERE id = ?`,
      [req.user.username, isoConOffset(Date.now()), a.id]);
    await ficAuditar("ausencia", a.id, "cancelar", req.user.username,
      { local: a.local, workerId: a.worker_id, detalle: { estadoAnterior: a.estado } });
    res.json({ ok: true, mensaje: "Ausencia cancelada. Se conserva en el histórico." });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo cancelar" }); }
});

/**
 * Los turnos que una persona tiene dentro de unas fechas, con el estado de su semana.
 *
 * Se consulta al aprobar o adjudicar una ausencia para poder AVISAR. No borra nada: un turno
 * publicado se mandó al grupo y hay gente organizada con él, y uno en borrador lo tiene que
 * quitar quien cuadra la semana, que sabe con quién lo va a tapar.
 */
async function horTurnosEnAusencia(workerId, desde, hasta) {
  const filas = await dbAll(
    `SELECT a.id, a.worker_id, a.dia, a.tipo, s.estado AS estado_semana, s.lunes
       FROM hor_asignaciones a JOIN hor_semanas s ON s.id = a.semana_id
      WHERE a.worker_id = ? AND a.dia BETWEEN ? AND ? AND s.estado IN ('borrador','publicado')`,
    [workerId, desde, hasta]).catch(() => []);
  return turnosDurante(filas, { worker_id: workerId, desde, hasta });
}

/** La bandeja: lo que hay que resolver, y el histórico si se pide. */
app.get("/api/horarios/ausencias", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const estado = ["pendiente", "aprobada", "rechazada", "cancelada"].includes(String(req.query.estado || ""))
      ? String(req.query.estado) : null;
    // Por defecto, lo que sigue teniendo efecto o está por decidir: el histórico completo se
    // pide a propósito. Una bandeja con dos años de ausencias canceladas no es una bandeja.
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || "")) ? String(req.query.desde) : sumaDias(hoyISO(), -90);

    const filas = await dbAll(
      `SELECT a.*, u.nombre FROM hor_ausencias a JOIN users u ON u.id = a.worker_id
        WHERE u.local = ? ${estado ? "AND a.estado = ?" : ""} AND a.hasta >= ?
        ORDER BY CASE a.estado WHEN 'pendiente' THEN 0 ELSE 1 END, a.desde DESC, a.id DESC
        LIMIT 300`,
      estado ? [local, estado, desde] : [local, desde]);

    // El encargado no ve la nota interna de una baja: es dato de salud y para cuadrar la
    // semana no aporta nada. RR.HH. y dirección sí.
    const verSensible = rrhhTodoLocal(req);
    res.json({ ok: true, local, resumen: resumirBandeja(filas),
      data: filas.map((a) => paraResponsable(a, { verSensible })) });
  } catch (e) {
    console.error("[horarios] ausencias:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron cargar las ausencias" });
  }
});

/**
 * Aprobar o rechazar. Atómico: la condición `estado = 'pendiente'` va DENTRO del UPDATE.
 *
 * Sin eso, dos encargados mirando la misma bandeja podrían aprobar y rechazar la misma
 * solicitud casi a la vez y ganaría el último en escribir, sin que ninguno se enterara.
 */
app.post("/api/horarios/ausencia/:id/resolver", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const a = await dbGet(
      `SELECT a.*, u.local AS local_worker, u.nombre FROM hor_ausencias a JOIN users u ON u.id = a.worker_id WHERE a.id = ?`,
      [Number(req.params.id) || 0]);
    if (!a || !rrhhPuedeLocal(req, a.local_worker || "")) return res.status(404).json({ ok: false, error: "No encontrada" });
    // Nadie resuelve lo suyo, ni siquiera dirección: es la única regla de este circuito que no
    // depende del rol.
    if (Number(a.worker_id) === Number(req.user.id)) {
      return res.status(403).json({ ok: false, error: "No puedes resolver tu propia solicitud." });
    }

    const accion = String(req.body?.accion || "");
    if (!["aprobar", "rechazar"].includes(accion)) return res.status(400).json({ ok: false, error: "Acción no válida" });
    const t = transitar(a.estado, accion);
    if (t.error) return res.status(409).json({ ok: false, error: t.error, estado: a.estado });

    const respuesta = String(req.body?.respuesta || "").trim().slice(0, 300) || null;
    const ahora = isoConOffset(Date.now());
    const fila = await dbRun(
      `UPDATE hor_ausencias SET estado = ?, resuelto_por = ?, resuelto_en = ?, respuesta = ?
        WHERE id = ? AND estado = 'pendiente' RETURNING *`,
      [t.estado, req.user.username, ahora, respuesta, a.id]);
    if (!fila) {
      const ahoraEs = await dbGet(`SELECT estado FROM hor_ausencias WHERE id = ?`, [a.id]);
      return res.status(409).json({ ok: false,
        error: `Alguien la ha resuelto antes que tú: ahora está ${ahoraEs?.estado}.`, estado: ahoraEs?.estado });
    }
    await ficAuditar("ausencia", a.id, accion, req.user.username, {
      local: a.local_worker, workerId: a.worker_id,
      detalle: { tipo: a.tipo, desde: a.desde, hasta: a.hasta, respuesta } });

    // Al aprobar se mira si le quedan turnos dentro. Se AVISA; no se toca ninguno.
    const aviso = t.estado === "aprobada" ? await horTurnosEnAusencia(a.worker_id, a.desde, a.hasta) : { total: 0 };
    res.json({
      ok: true, estado: t.estado,
      avisoTurnos: aviso.total ? aviso : null,
      mensaje: `${a.nombre}: ${ETIQUETA_TIPO[a.tipo] || a.tipo} del ${a.desde} al ${a.hasta} — ${t.estado}.`,
    });
  } catch (e) {
    console.error("[horarios] resolver ausencia:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo resolver" });
  }
});

// Disponibilidad de una persona: se guarda entera, como las necesidades.
app.put("/api/horarios/disponibilidad/:workerId", requireAuth(HORARIOS_ROLES), async (req, res) => {
  const client = await pool.connect();
  try {
    const w = await dbGet(`SELECT id, nombre, local FROM users WHERE id = ?`, [Number(req.params.workerId)]);
    if (!w || !rrhhPuedeLocal(req, w.local || "")) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    const filas = Array.isArray(req.body?.franjas) ? req.body.franjas : [];

    await client.query("BEGIN");
    const q = (sql, p = []) => client.query(toPositional(sql), p);
    await q(`DELETE FROM hor_disponibilidad WHERE worker_id = ?`, [w.id]);
    const ahora = isoConOffset(Date.now());
    let n = 0;
    for (const f of filas) {
      const dow = Number(f.dow);
      if (!(dow >= 0 && dow <= 6)) continue;
      if (!["disponible", "prefiere", "no_disponible"].includes(f.preferencia)) continue;
      if (f.preferencia === "disponible") continue;   // es el valor por defecto: no se guarda
      await q(`INSERT INTO hor_disponibilidad (worker_id, dow, inicio_min, fin_min, preferencia,
                                              origen, autor, creado_en, actualizado_en)
               VALUES (?,?,?,?,?, 'administrativo', ?, ?, ?)`,
        [w.id, dow, Number(f.inicio_min) || 0, Number(f.fin_min) || 1560, f.preferencia, req.user.username, ahora, ahora]);
      n++;
    }
    await client.query("COMMIT");
    await ficAuditar("disponibilidad", w.id, "guardar_administrativa", req.user.username,
      { local: w.local, workerId: w.id, detalle: { franjas: n } }).catch(() => {});
    res.json({ ok: true, guardadas: n,
      mensaje: `Disponibilidad de ${w.nombre} guardada. Queda marcada como cambiada por administración.` });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ ok: false, error: "No se pudo guardar la disponibilidad" });
  } finally { client.release(); }
});

// ── El generador ─────────────────────────────────────────────────────────────
// Escribe un BORRADOR y ya está: no publica, no manda nada y no toca ninguna versión
// publicada. Lo que sale de aquí lo revisa una persona, que sabe cosas que no están en
// ninguna tabla (que hoy hay bautizo, que fulano está de bajón, que el sábado viene un
// autocar). Además devuelve por qué ha puesto a cada uno y qué no ha podido cubrir.
app.post("/api/horarios/generar", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.body?.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const lunes = lunesDe(String(req.body?.lunes || ""));
    if (!lunes) return res.status(400).json({ ok: false, error: "Falta la semana" });

    const [cfg, areas, tramos, trabajadores, necesidades, ausencias, contratos, disponibilidad] = await Promise.all([
      dbGet(`SELECT descanso_min_horas FROM hor_config WHERE local = ?`, [local]),
      dbAll(`SELECT id, nombre, orden FROM hor_areas WHERE local = ? AND activo ORDER BY orden, nombre`, [local]),
      dbAll(`SELECT id, nombre, orden, inicio_min, fin_min FROM hor_tramos WHERE local = ? AND activo ORDER BY orden`, [local]),
      dbAll(`SELECT id, nombre, username FROM users WHERE local = ? AND rol IN ('trabajador','encargado')
             AND COALESCE(activo,1) = 1 AND fecha_baja IS NULL ORDER BY nombre`, [local]),
      dbAll(`SELECT * FROM hor_necesidades WHERE local = ?`, [local]),
      // `local IS NULL` recogía las filas antiguas… y también cualquiera cuyo local se
      // hubiera perdido. El JOIN con `users` es el criterio de verdad.
      // Solo las aprobadas. El solver además lo comprueba por su cuenta —y hay un test que lo
      // sujeta— pero acotarlo aquí evita que una solicitud pendiente llegue siquiera a
      // planteárselo.
      dbAll(`SELECT a.* FROM hor_ausencias a JOIN users u ON u.id = a.worker_id
              WHERE u.local = ? AND a.estado = 'aprobada'`, [local]),
      dbAll(`SELECT c.* FROM hor_contratos c JOIN users u ON u.id = c.worker_id WHERE u.local = ?`, [local]),
      dbAll(`SELECT d.* FROM hor_disponibilidad d JOIN users u ON u.id = d.worker_id WHERE u.local = ?`, [local]),
    ]);
    if (!necesidades.length) {
      return res.status(409).json({ ok: false, error: "Antes hay que decir cuánta gente hace falta cada día. Sin eso no hay nada que generar." });
    }

    const r = generarSemana({
      lunes, areas, tramos, trabajadores, necesidades, ausencias, contratos, disponibilidad,
      objetivos: req.body?.solo_minimos !== true,
      ajustes: cfg?.descanso_min_horas ? { descansoHoras: Number(cfg.descanso_min_horas) } : {},
    });
    // Solo se PROPONE. Guardar es otra petición, y es la que decide la persona.
    res.json({ ok: true, local, lunes, ...r });
  } catch (e) {
    console.error("[horarios] generar:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo generar la propuesta" });
  }
});

// Aceptar la propuesta: la escribe en el borrador. Nunca sobre una semana publicada —
// para eso está «Cambiar horario», que clona en una versión nueva.
app.post("/api/horarios/generar/aceptar", requireAuth(HORARIOS_ROLES), async (req, res) => {
  const client = await pool.connect();
  try {
    const local = horLocal(req, req.body?.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const lunes = lunesDe(String(req.body?.lunes || ""));
    const propuestas = Array.isArray(req.body?.asignaciones) ? req.body.asignaciones : [];
    if (!lunes || !propuestas.length) return res.status(400).json({ ok: false, error: "No hay nada que guardar" });

    await client.query("BEGIN");
    const q = (sql, p = []) => client.query(toPositional(sql), p);
    const ahora = isoConOffset(Date.now());

    let semana = (await q(`SELECT * FROM hor_semanas WHERE local = $1 AND lunes = $2 AND estado = 'borrador'`, [local, lunes])).rows[0];
    if (!semana) {
      const pub = (await q(`SELECT max(version) AS v FROM hor_semanas WHERE local = $1 AND lunes = $2`, [local, lunes])).rows[0];
      semana = (await q(
        `INSERT INTO hor_semanas (local, lunes, version, estado, origen, creado_en, creado_por)
         VALUES ($1,$2,$3,'borrador',$4,$5,$6) RETURNING *`,
        [local, lunes, Number(pub?.v || 0) + 1, ORIGEN_SOLVER, ahora, req.user.username])).rows[0];
    } else if (req.body?.reemplazar) {
      // Reemplazar borra lo que hubiera en el BORRADOR, nunca nada publicado.
      await q(`DELETE FROM hor_asignaciones WHERE semana_id = $1`, [semana.id]);
      await q(`UPDATE hor_semanas SET origen = $1 WHERE id = $2`, [ORIGEN_SOLVER, semana.id]);
    }

    // La propuesta da la vuelta por el navegador antes de volver, así que el `worker_id` que
    // llega aquí es del cliente: se comprueba contra la plantilla del local igual que en el
    // alta manual de un turno. Una sola consulta para todos, no una por línea.
    const suyos = new Set((await q(`SELECT id FROM users WHERE local = ? AND ${SQL_PLANTILLA}`, [local]))
      .rows.map((w) => String(w.id)));
    let n = 0;
    const rechazadas = [];
    for (const a of propuestas) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.dia || ""))) continue;
      if (!diasSemana(lunes).includes(String(a.dia))) { rechazadas.push({ dia: a.dia, motivo: "no es de esta semana" }); continue; }
      if (!suyos.has(String(Number(a.worker_id)))) { rechazadas.push({ worker_id: a.worker_id, motivo: "no es de este establecimiento" }); continue; }
      const ini = Number(a.inicio_min), fin = Number(a.fin_min);
      if (!Number.isInteger(ini) || !Number.isInteger(fin) || fin < ini || fin > 2160) { rechazadas.push({ dia: a.dia, motivo: "horario no válido" }); continue; }
      await q(
        `INSERT INTO hor_asignaciones (semana_id, local, worker_id, dia, area_id, tramo_id, inicio_min, fin_min, tipo, nota, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'turno',$9,$10)`,
        [semana.id, local, Number(a.worker_id), a.dia, a.area_id ?? null, a.tramo_id ?? null,
         ini, fin, a.porque ? String(a.porque).slice(0, 200) : null, ahora]);
      n++;
    }
    await client.query("COMMIT");
    await ficAuditar("horario", semana.id, "generar", req.user.username, { local, detalle: { lunes, turnos: n } });
    res.json({ ok: true, semana_id: semana.id, guardadas: n, rechazadas,
      mensaje: `${n} turnos en el borrador. Revísalo antes de publicar.${rechazadas.length ? ` (${rechazadas.length} descartados por no encajar.)` : ""}` });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[horarios] aceptar propuesta:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar la propuesta" });
  } finally {
    client.release();
  }
});

// Mandar el cuadrante al grupo de WhatsApp del local.
//
// NO se hace solo al publicar, y es a propósito: publicar y avisar son dos decisiones
// distintas. Se publica varias veces mientras se cuadra la semana, y cada publicación
// disparando un mensaje al grupo sería ruido que la gente acabaría silenciando — y
// entonces no se enteraría del que sí importa.
app.post("/api/horarios/semana/:id/whatsapp", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const s = await dbGet(`SELECT * FROM hor_semanas WHERE id = ?`, [req.params.id]);
    if (!s) return res.status(404).json({ ok: false, error: "Semana no encontrada" });
    if (!rrhhPuedeLocal(req, s.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    // Solo lo publicado: mandar un borrador al grupo es mandar un horario que va a cambiar.
    if (s.estado !== "publicado") return res.status(409).json({ ok: false, error: "Publica la semana antes de mandarla al grupo" });

    const cfg = await dbGet(`SELECT wa_grupo_jid FROM hor_config WHERE local = ?`, [s.local]);
    const grupo = String(req.body?.grupo_jid || cfg?.wa_grupo_jid || "").trim();
    if (!grupo) return res.status(400).json({ ok: false, error: "Elige primero a qué grupo de WhatsApp se manda el horario de este local" });
    if (!isReady()) return res.status(503).json({ ok: false, error: "WhatsApp no está conectado ahora mismo" });

    const { buffer, dias, nombre } = await horPdfDeSemana(s);
    const texto = `📅 *Horario del ${fechaLarga(dias[0])} al ${fechaLarga(dias[6])}*\n${s.local}` +
      (s.version > 1 ? `\n\n⚠️ Es la versión ${s.version}: sustituye a la anterior.` : "") +
      `\n\nCada uno lo tiene también en su perfil, en familiadelamor.org.`;
    await sendMensajeAGrupo(grupo, texto);
    await sendDocumentoAGrupo(grupo, buffer, nombre, "application/pdf");

    // Se recuerda el grupo elegido para no volver a preguntarlo cada semana.
    if (!cfg?.wa_grupo_jid) await dbRun(`UPDATE hor_config SET wa_grupo_jid = ? WHERE local = ?`, [grupo, s.local]);
    await ficAuditar("horario", s.id, "enviar_grupo", req.user.username, {
      local: s.local, detalle: { lunes: s.lunes, version: s.version, grupo } });

    res.json({ ok: true, mensaje: `Horario mandado al grupo.` });
  } catch (e) {
    console.error("[horarios] whatsapp:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo mandar al grupo: " + e.message });
  }
});

// Grupos disponibles, para poder elegir el del local desde el panel.
app.get("/api/horarios/grupos", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso" });
    const cfg = await dbGet(`SELECT wa_grupo_jid FROM hor_config WHERE local = ?`, [local]);
    if (!isReady()) return res.json({ ok: true, conectado: false, elegido: cfg?.wa_grupo_jid || null, grupos: [] });
    const grupos = await getGroups();
    res.json({ ok: true, conectado: true, elegido: cfg?.wa_grupo_jid || null, grupos });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudieron cargar los grupos" }); }
});

const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fechaLarga(iso) {
  const [, m, d] = String(iso || "").split("-");
  return d ? `${Number(d)} de ${MESES_LARGO[Number(m) - 1]}` : String(iso || "");
}

/**
 * Quién se ha enterado del cambio. Visibilidad operativa, no un CRM.
 *
 * Se puede pedir por semana (`?lunes=`) o por una publicación concreta (`?publicacion=`), que
 * es lo que permite mirar el histórico: «en la V2 hubo 4 afectados y 3 lo confirmaron», aunque
 * después exista una V3.
 */
app.get("/api/horarios/comunicaciones", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso" });
    const lunes = lunesDe(String(req.query.lunes || "")) || null;
    const pub = Number(req.query.publicacion) || null;
    if (!lunes && !pub) return res.status(400).json({ ok: false, error: "Falta la semana" });

    // El `local` de la consulta manda SIEMPRE. Pedir una publicación de otro establecimiento
    // por su id no devuelve nada: la fila lleva su propio local y aquí se cruza con el del
    // ámbito, que `horLocal` ya ha forzado al del encargado.
    const filas = await dbAll(
      `SELECT c.id, c.worker_id, c.version_anterior, c.version_nueva, c.publicacion_nueva_id,
              c.diff, c.publicado_en, c.entendido_en, u.nombre
         FROM hor_cambios_comunicados c LEFT JOIN users u ON u.id = c.worker_id
        WHERE c.local = ? ${pub ? "AND c.publicacion_nueva_id = ?" : "AND c.lunes = ?"}
        ORDER BY c.version_nueva DESC, u.nombre`,
      [local, pub || lunes]);

    const data = filas.map((f) => {
      let d = {};
      try { d = JSON.parse(f.diff); } catch { /* ilegible: se enseña el resto igual */ }
      return {
        id: f.id, worker_id: f.worker_id, nombre: f.nombre || "—",
        versionAnterior: f.version_anterior, versionNueva: f.version_nueva,
        publicacionId: f.publicacion_nueva_id, publicadoEn: f.publicado_en,
        entendidoEn: f.entendido_en,
        // Lo justo para que el responsable sepa de qué va: qué días le cambiaron y cómo. Ni el
        // motivo, ni nada más: no lo necesita.
        dias: (Array.isArray(d.dias) ? d.dias : []).map((x) => ({ dia: x.dia, tipo: x.tipo })),
      };
    });
    res.json({
      ok: true, local,
      resumen: { afectados: data.length, entendidos: data.filter((x) => x.entendidoEn).length,
        pendientes: data.filter((x) => !x.entendidoEn).length },
      data,
    });
  } catch (e) {
    console.error("[horarios] comunicaciones:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron cargar las confirmaciones" });
  }
});

// Histórico de versiones de una semana. Contesta "qué horario vio el equipo".
app.get("/api/horarios/historico", requireAuth(HORARIOS_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso" });
    const lunes = lunesDe(String(req.query.lunes || ""));
    const filas = await dbAll(
      `SELECT s.id, s.version, s.estado, s.origen, s.publicado_en, s.publicado_por, s.sustituido_en, s.creado_en, p.hash
       FROM hor_semanas s LEFT JOIN hor_publicaciones p ON p.semana_id = s.id
       WHERE s.local = ? AND s.lunes = ? ORDER BY s.version DESC`, [local, lunes]);
    res.json({ ok: true, data: filas });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo cargar el histórico" }); }
});

// ════════════════════════ FICHAJES (kiosco) ════════════════════════
// Registro de jornada del RD-ley 8/2019. Tres reglas que gobiernan todo lo de abajo:
//
//   1. LA HORA LA PONE EL SERVIDOR. El reloj de la tablet se guarda solo como `desfase_ms`
//      para diagnóstico. Si la hora la pusiera el cliente, una tablet con la fecha mal
//      —o alguien que la cambia a propósito— reescribiría la nómina.
//   2. fic_eventos NO SE MODIFICA NUNCA. Corregir es escribir otra fila. La única columna
//      que se actualiza es `anulado_por`. Hay un test que lee este fichero y falla si
//      aparece cualquier otro UPDATE o un DELETE.
//   3. NUNCA se rechaza registrar algo que ha pasado de verdad. Si alguien ficha la salida
//      sin haber fichado la entrada, se guarda igual y se marca como incidencia.
const FICHAJES_ROLES = ["direccion", "rrhh", "encargado"];

const ficHash = (t) => crypto.createHash("sha256").update(String(t || "")).digest("hex");
const ficToken = () => generarToken((n) => crypto.randomBytes(n));

// El ticket de kiosco: se emite al acertar el PIN y vale dos minutos. Sirve para que la
// persona no tenga que teclear el PIN dos veces (una para ver su estado y otra para fichar).
// Va firmado y lleva dentro el dispositivo, así que un ticket de una tablet no vale en otra.
const FIC_TICKET_MS = 120000;
// Un fichaje que se quedó en la cola de la tablet puede tardar horas en subir: si se
// aplicara la caducidad normal, se perdería. El ticket sigue firmado y sigue atado a ESA
// tablet, así que lo que prueba —que la persona tecleó su PIN— sigue siendo cierto.
const FIC_TICKET_OFFLINE_MS = 48 * 3600 * 1000;
function ficFirmar(cuerpo) {
  return crypto.createHmac("sha256", JWT_SECRET).update("fichar:" + cuerpo).digest("hex").slice(0, 32);
}
function ficEmitirTicket(workerId, dispId, ahoraMs) {
  const cuerpo = `${workerId}.${dispId}.${ahoraMs + FIC_TICKET_MS}`;
  return `${cuerpo}.${ficFirmar(cuerpo)}`;
}
function ficLeerTicket(ticket, dispId, ahoraMs, { gracia = 0 } = {}) {
  const partes = String(ticket || "").split(".");
  if (partes.length !== 4) return null;
  const [wk, disp, exp, firma] = partes;
  const esperada = ficFirmar(`${wk}.${disp}.${exp}`);
  // Comparación en tiempo constante: si no, se puede adivinar la firma byte a byte.
  if (firma.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  if (Number(disp) !== Number(dispId)) return null;
  if (!(Number(exp) + gracia > ahoraMs)) return null;
  return { workerId: Number(wk) };
}

// Traduce un instante real al día de negocio del local (corte configurable, 06:00 por
// defecto): una salida a las 02:10 del domingo pertenece al sábado.
async function ficMomento(local, ahoraMs) {
  const cfg = await dbGet(`SELECT corte_dia_min FROM hor_config WHERE local = ?`, [local]);
  return instanteANegocio(ahoraMs, { corteMin: cfg?.corte_dia_min ?? 360 });
}

const ficEventosDe = (workerId, dia) => dbAll(
  `SELECT id, tipo, ocurrido_en, epoch_ms, anulado_por FROM fic_eventos
   WHERE worker_id = ? AND dia_negocio = ? ORDER BY epoch_ms ASC, id ASC`, [workerId, dia]);

async function ficAuditar(entidad, entidadId, accion, autor, extra = {}) {
  await dbRun(
    `INSERT INTO fic_auditoria (entidad, entidad_id, accion, local, worker_id, autor, detalle, creado_en)
     VALUES (?,?,?,?,?,?,?,?)`,
    [entidad, entidadId ?? null, accion, extra.local || null, extra.workerId ?? null,
     autor, extra.detalle ? JSON.stringify(extra.detalle) : null, isoConOffset(Date.now())]);
}

// ── Kiosco: público, sin sesión, con el token del dispositivo en la URL ──────
// Mismo molde que el pulso: sin cookies, sin JWT, rate limit por IP y el token nunca
// se guarda en claro (en la base solo su hash).
async function ficDispositivo(token) {
  return dbGet(
    `SELECT id, local, nombre, activo FROM fic_dispositivos WHERE token_hash = ? AND activo AND revocado_en IS NULL`,
    [ficHash(token)]);
}

// La tablet arranca: quién puede fichar aquí y cómo está cada uno ahora mismo.
// Deliberadamente NO devuelve teléfonos, correos ni nada más que el nombre: esta pantalla
// está a la vista de todo el mundo en la barra.
app.get("/api/fichar/:token", async (req, res) => {
  if (!pulsoRateLimit(req, res, 60)) return;
  try {
    const disp = await ficDispositivo(req.params.token);
    if (!disp) return res.status(404).json({ ok: false, error: "Este dispositivo no está dado de alta" });

    const ahora = Date.now();
    const m = await ficMomento(disp.local, ahora);
    // Solo la plantilla de ESTE local: no se puede fichar en un local que no es el tuyo
    // (si alguien cubre fuera, lo mete el encargado a mano con motivo).
    const equipo = await dbAll(
      // `fecha_baja IS NULL` dejaba fuera a quien tiene la baja puesta para dentro de una
      // semana: sigue viniendo a trabajar y no podía fichar. Ahora se compara con el día.
      `SELECT id, nombre, pin_hash IS NOT NULL AS tiene_pin FROM users
       WHERE local = ? AND ${SQL_ACTIVO_EL_DIA}
       ORDER BY nombre ASC`, [disp.local, m.diaNegocio, m.diaNegocio]);

    const eventos = await dbAll(
      `SELECT worker_id, id, tipo, ocurrido_en, epoch_ms, anulado_por FROM fic_eventos
       WHERE local = ? AND dia_negocio = ? ORDER BY epoch_ms ASC, id ASC`, [disp.local, m.diaNegocio]);
    const porPersona = new Map();
    for (const e of eventos) {
      if (!porPersona.has(e.worker_id)) porPersona.set(e.worker_id, []);
      porPersona.get(e.worker_id).push(e);
    }

    dbRun(`UPDATE fic_dispositivos SET ultimo_visto = ? WHERE id = ?`, [m.iso, disp.id]).catch(() => {});

    res.json({
      ok: true,
      local: disp.local, dispositivo: disp.nombre,
      dia: m.diaNegocio, hora: m.hora.slice(0, 5), servidorMs: ahora,
      equipo: equipo.map((w) => ({
        id: w.id, nombre: w.nombre, tienePin: !!w.tiene_pin,
        estado: estadoDe(porPersona.get(w.id) || []),
      })),
    });
  } catch (e) {
    console.error("[fichar] inicio:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar el kiosco" });
  }
});

// PIN. Rate limit MUY corto: es el único sitio del sistema sin sesión que acepta un secreto.
app.post("/api/fichar/:token/pin", async (req, res) => {
  if (!pulsoRateLimit(req, res, 12)) return;
  try {
    const disp = await ficDispositivo(req.params.token);
    if (!disp) return res.status(404).json({ ok: false, error: "Este dispositivo no está dado de alta" });

    const workerId = Number(req.body?.worker_id || 0);
    const pin = String(req.body?.pin || "");
    const worker = await dbGet(
      `SELECT id, nombre, local, pin_hash, pin_temporal, pin_intentos, pin_bloqueado_hasta FROM users WHERE id = ?`, [workerId]);
    // Mismo mensaje si no existe, si es de otro local o si no tiene PIN: la pantalla del
    // kiosco no debe servir para averiguar quién trabaja dónde.
    if (!worker || worker.local !== disp.local || !worker.pin_hash) {
      return res.status(401).json({ ok: false, error: "PIN incorrecto." });
    }

    const ahora = Date.now();
    // El bloqueo se mira ANTES de bcrypt: si no, cada intento seguiría costando ~100 ms
    // de CPU y el bloqueo no frenaría nada.
    const bloqueo = estadoBloqueo(worker, ahora);
    if (bloqueo.bloqueado) return res.status(429).json({ ok: false, error: bloqueo.mensaje, segundos: bloqueo.segundos });

    if (!(await bcrypt.compare(pin, worker.pin_hash))) {
      const f = pinTrasFallo(worker, ahora);
      await dbRun(`UPDATE users SET pin_intentos = ?, pin_bloqueado_hasta = ? WHERE id = ?`,
        [f.pin_intentos, f.pin_bloqueado_hasta, worker.id]);
      if (f.bloqueado) {
        await ficAuditar("pin", worker.id, "bloqueo", "kiosco", {
          local: disp.local, workerId: worker.id, detalle: { intentos: f.pin_intentos, segundos: f.segundos, dispositivo: disp.id } });
      }
      return res.status(401).json({ ok: false, error: f.mensaje });
    }

    const ok = pinTrasAcierto();
    await dbRun(`UPDATE users SET pin_intentos = ?, pin_bloqueado_hasta = ? WHERE id = ?`,
      [ok.pin_intentos, ok.pin_bloqueado_hasta, worker.id]);

    const m = await ficMomento(disp.local, ahora);
    const eventos = await ficEventosDe(worker.id, m.diaNegocio);
    const estado = estadoDe(eventos);
    res.json({
      ok: true,
      ticket: ficEmitirTicket(worker.id, disp.id, ahora),
      nombre: worker.nombre,
      pinTemporal: !!worker.pin_temporal,
      estado, acciones: accionesPermitidas(estado),
      // Con `hastaMs`: al trabajador le importa lo que LLEVA, no lo que tiene cerrado.
      jornada: calcularJornada(eventos, { hastaMs: ahora }),
      hoy: eventos.filter((e) => !e.anulado_por).map((e) => ({ tipo: e.tipo, hora: String(e.ocurrido_en).slice(11, 16) })),
    });
  } catch (e) {
    console.error("[fichar] pin:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo comprobar el PIN" });
  }
});

// El fichaje. La hora sale de Date.now() aquí dentro; lo que manda el cliente es
// únicamente su reloj (para guardarlo como desfase) y un id de idempotencia.
app.post("/api/fichar/:token/evento", async (req, res) => {
  if (!pulsoRateLimit(req, res, 30)) return;
  try {
    const disp = await ficDispositivo(req.params.token);
    if (!disp) return res.status(404).json({ ok: false, error: "Este dispositivo no está dado de alta" });

    const ahora = Date.now();
    // Un fichaje que estuvo en la cola: la tablet lo marca al subirlo.
    const enDiferido = !!req.body?.offline;
    const sesion = ficLeerTicket(req.body?.ticket, disp.id, ahora, { gracia: enDiferido ? FIC_TICKET_OFFLINE_MS : 0 });
    if (!sesion) return res.status(401).json({ ok: false, error: "Vuelve a introducir tu PIN." });

    const tipo = String(req.body?.tipo || "");
    if (!["entrada", "salida", "pausa_inicio", "pausa_fin"].includes(tipo)) {
      return res.status(400).json({ ok: false, error: "Acción no válida" });
    }
    const worker = await dbGet(`SELECT id, nombre, local FROM users WHERE id = ?`, [sesion.workerId]);
    if (!worker || worker.local !== disp.local) return res.status(403).json({ ok: false, error: "Sin acceso" });

    // Idempotencia: la tablet manda el mismo id si reintenta. La UNIQUE de la columna es
    // la que de verdad lo garantiza; esto solo evita el error feo en el caso normal.
    const clave = String(req.body?.cliente_id || "").slice(0, 64) || null;
    if (clave) {
      const ya = await dbGet(`SELECT id, tipo, ocurrido_en FROM fic_eventos WHERE idempotencia_key = ?`, [clave]);
      if (ya) return res.json({ ok: true, repetido: true, evento: ya });
    }

    // ── La hora ──────────────────────────────────────────────────────────────
    // En el caso normal la pone el servidor y punto. En un fichaje en diferido eso sería
    // mentira: una salida de las 02:10 que sube a las 09:00 quedaría registrada a las 09:00.
    // Así que se usa la de la tablet, PERO se guarda `origen='kiosco_offline'` y el desfase,
    // de modo que se vea de dónde salió esa hora. Se prefiere un dato marcado a un dato
    // falso; lo que no se hace nunca es dejar que el reloj del cliente pase por el del
    // servidor sin que se note.
    const clienteMs = Number(req.body?.cliente_ms);
    let cuando = ahora, origen = "kiosco", desfase = Number.isFinite(clienteMs) ? clienteMs - ahora : null;
    if (enDiferido) {
      if (!Number.isFinite(clienteMs)) return res.status(400).json({ ok: false, error: "Falta la hora del fichaje" });
      // Fuera de una ventana razonable no se acepta: una tablet con la fecha en 2019 —o en
      // el futuro— reescribiría la nómina, y eso es exactamente lo que hay que impedir.
      if (clienteMs > ahora + 5 * 60000 || clienteMs < ahora - FIC_TICKET_OFFLINE_MS) {
        console.warn(`[fichar] hora fuera de rango en dispositivo ${disp.id}: desfase ${Math.round((clienteMs - ahora) / 60000)} min`);
        return res.status(409).json({ ok: false, error: "La tablet tiene la hora mal. Avisa a tu encargado: el fichaje no se ha perdido, hay que meterlo a mano." });
      }
      cuando = clienteMs; origen = "kiosco_offline";
    }

    const m = await ficMomento(disp.local, cuando);
    const eventos = await ficEventosDe(worker.id, m.diaNegocio);
    const v = evaluarFichaje(eventos, tipo, cuando);
    if (!v.registrar) {
      return res.status(v.duplicado ? 200 : 409).json({
        ok: !!v.duplicado, duplicado: !!v.duplicado, error: v.duplicado ? undefined : v.mensaje,
        mensaje: v.mensaje, estado: v.estado, acciones: accionesPermitidas(v.estado),
      });
    }

    // Salir estando en pausa la cierra: se escribe el pausa_fin ANTES de la salida, con la
    // misma hora, y marcado como automático para que se vea que no lo pulsó nadie.
    const filas = [];
    if (v.cierraPausa) filas.push({ tipo: "pausa_fin", motivo: "cierre automático al fichar la salida", clave: clave ? clave + ":p" : null });
    filas.push({ tipo, motivo: v.incidencia ? "salida sin entrada registrada" : null, clave });

    let ultimo = null;
    for (const f of filas) {
      ultimo = await dbRun(
        `INSERT INTO fic_eventos (worker_id, local, tipo, ocurrido_en, epoch_ms, dia_negocio, minuto_local,
                                  origen, dispositivo_id, autor, motivo, idempotencia_key, desfase_ms, creado_en)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id, tipo, ocurrido_en`,
        [worker.id, disp.local, f.tipo, m.iso, cuando, m.diaNegocio, m.minutoNegocio,
         origen, disp.id, null, f.motivo, f.clave, Number.isFinite(desfase) ? desfase : null,
         // `creado_en` es CUÁNDO LLEGÓ, no cuándo pasó: en un fichaje en diferido son
         // horas distintas, y esa diferencia es justo lo que hay que poder ver.
         isoConOffset(ahora)]);
    }
    if (v.incidencia) {
      await ficAuditar("evento", ultimo?.id, "incidencia:" + v.incidencia, "kiosco",
        { local: disp.local, workerId: worker.id, detalle: { tipo, dia: m.diaNegocio } });
    }

    // ── Un fichaje que llega a un periodo YA CERRADO ────────────────────────────────────
    // No se rechaza: la persona trabajó y eso pasó de verdad; tirarlo sería borrar una prueba
    // por un problema administrativo nuestro. Y tampoco muta nada de lo cerrado, sin que haga
    // falta ningún estado nuevo: `fic_jornadas` es una proyección que se recalcula, la bolsa
    // solo la escriben `validar` y `cerrar` —y las dos comprueban el cierre— y la firma de la
    // validación deja de coincidir sola, así que la jornada vuelve a la lista de revisión
    // marcada como caducada.
    //
    // Lo único que faltaba era que se VIERA. Queda en auditoría, y se le dice a la persona.
    const cerrado = await ficBloqueoPorCierre(disp.local, m.diaNegocio);
    if (cerrado) {
      await ficAuditar("evento", ultimo?.id, "en_periodo_cerrado", "kiosco", {
        local: disp.local, workerId: worker.id,
        detalle: { tipo, dia: m.diaNegocio, diferido: enDiferido, llegado: isoConOffset(ahora) },
      });
      console.warn(`[fichar] fichaje de ${worker.nombre} del ${m.diaNegocio} llega con el periodo ya cerrado`);
    }

    const despues = await ficEventosDe(worker.id, m.diaNegocio);
    const estado = estadoDe(despues);
    res.json({
      ok: true, evento: ultimo, hora: m.hora.slice(0, 5), estado,
      acciones: accionesPermitidas(estado), incidencia: v.incidencia || null,
      diferido: enDiferido,
      // La tablet lo dice sin alarmar: el fichaje está guardado y lo que queda por hacer es
      // administrativo, no cosa suya.
      periodoCerrado: !!cerrado,
      avisoPeriodo: cerrado ? "Queda registrado. Ese mes ya estaba cerrado, así que lo tiene que revisar tu encargado." : null,
      mensaje: v.mensaje || null, jornada: calcularJornada(despues, { hastaMs: ahora }),
    });
  } catch (e) {
    // La UNIQUE de idempotencia saltando es un reintento, no un fallo.
    if (String(e.message || "").includes("idempotencia")) return res.json({ ok: true, repetido: true });
    console.error("[fichar] evento:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo registrar el fichaje" });
  }
});

// ── Panel: quién está dentro, tablets y PINes ────────────────────────────────
app.get("/api/fichajes/hoy", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });

    const m = await ficMomento(local, Date.now());
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dia || "")) ? String(req.query.dia) : m.diaNegocio;
    const eventos = await dbAll(
      `SELECT e.worker_id, e.id, e.tipo, e.ocurrido_en, e.epoch_ms, e.origen, e.motivo, e.anulado_por, u.nombre
       FROM fic_eventos e LEFT JOIN users u ON u.id = e.worker_id
       WHERE e.local = ? AND e.dia_negocio = ? ORDER BY e.epoch_ms ASC, e.id ASC`, [local, dia]);

    const porPersona = new Map();
    for (const e of eventos) {
      if (!porPersona.has(e.worker_id)) porPersona.set(e.worker_id, { id: e.worker_id, nombre: e.nombre || "—", eventos: [] });
      porPersona.get(e.worker_id).eventos.push(e);
    }
    // Un día distinto del que corre ya no puede recibir más fichajes: lo que falte, falta.
    const diaCerrado = dia !== m.diaNegocio;
    const ahoraMs = Date.now();
    const personas = [...porPersona.values()].map((p) => ({
      id: p.id, nombre: p.nombre,
      estado: estadoDe(p.eventos),
      // Del día en curso se enseña lo que la persona LLEVA (`hastaMs`); de un día pasado,
      // solo lo fichado. Nunca se guarda: es la pantalla, no el registro.
      jornada: calcularJornada(p.eventos, diaCerrado ? {} : { hastaMs: ahoraMs }),
      // El aviso lo decide el servidor, que es quien sabe qué hora es: a media tarde
      // TODO el que está dentro tiene la jornada abierta y marcarlos a todos sería ruido.
      faltaSalida: faltaLaSalida(calcularJornada(p.eventos), { diaCerrado, ahoraMs }),
      eventos: p.eventos.map((e) => ({
        id: e.id, tipo: e.tipo, hora: String(e.ocurrido_en).slice(11, 16),
        origen: e.origen, motivo: e.motivo, anulado: !!e.anulado_por,
      })),
    })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    res.json({
      ok: true, local, dia, hora: m.hora.slice(0, 5),
      dentro: personas.filter((p) => p.estado !== "fuera").length,
      personas,
    });
  } catch (e) {
    console.error("[fichajes] hoy:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar el registro" });
  }
});

app.get("/api/fichajes/dispositivos", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const filas = await dbAll(
      `SELECT id, nombre, activo, ultimo_visto, creado_en, creado_por, revocado_en FROM fic_dispositivos
       WHERE local = ? ORDER BY revocado_en IS NOT NULL, nombre ASC`, [local]);
    res.json({ ok: true, data: filas });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudieron cargar los dispositivos" }); }
});

// Alta o regeneración de tablet. El token se enseña UNA VEZ, junto con su QR: en la base
// solo queda el hash, así que si se pierde hay que regenerarlo (y el anterior deja de valer).
async function ficEmitirDispositivo(req, res, { id = null, local = null, nombre = null }) {
  const token = ficToken();
  const ahora = isoConOffset(Date.now());
  let fila;
  if (id) {
    fila = await dbRun(`UPDATE fic_dispositivos SET token_hash = ?, activo = TRUE, revocado_en = NULL, revocado_por = NULL
                        WHERE id = ? RETURNING id, local, nombre`, [ficHash(token), id]);
  } else {
    fila = await dbRun(`INSERT INTO fic_dispositivos (local, nombre, token_hash, creado_en, creado_por)
                        VALUES (?,?,?,?,?) RETURNING id, local, nombre`,
      [local, nombre, ficHash(token), ahora, req.user.username]);
  }
  await ficAuditar("dispositivo", fila.id, id ? "regenerar" : "alta", req.user.username, { local: fila.local });

  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  const url = `${base}/fichar.html?t=${token}`;
  let qr = null;
  try { qr = await QRCode.toDataURL(url, { width: 320, margin: 1 }); } catch { /* el enlace basta */ }
  res.json({ ok: true, dispositivo: fila, url, qr, aviso: "Guarda este enlace: no se vuelve a mostrar." });
}

app.post("/api/fichajes/dispositivos", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.body?.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const nombre = String(req.body?.nombre || "").trim().slice(0, 60);
    if (!nombre) return res.status(400).json({ ok: false, error: "Ponle un nombre (por ejemplo, «Tablet de la barra»)" });
    await ficEmitirDispositivo(req, res, { local, nombre });
  } catch (e) {
    console.error("[fichajes] alta dispositivo:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo dar de alta el dispositivo" });
  }
});

app.post("/api/fichajes/dispositivos/:id/regenerar", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const d = await dbGet(`SELECT id, local FROM fic_dispositivos WHERE id = ?`, [Number(req.params.id)]);
    if (!d || !rrhhPuedeLocal(req, d.local)) return res.status(404).json({ ok: false, error: "No encontrado" });
    await ficEmitirDispositivo(req, res, { id: d.id });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo regenerar el enlace" }); }
});

// Revocar, no borrar: los eventos que se ficharon en esa tablet siguen apuntando a ella y
// la fila tiene que seguir existiendo para poder decir dónde se fichó.
app.post("/api/fichajes/dispositivos/:id/revocar", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const d = await dbGet(`SELECT id, local FROM fic_dispositivos WHERE id = ?`, [Number(req.params.id)]);
    if (!d || !rrhhPuedeLocal(req, d.local)) return res.status(404).json({ ok: false, error: "No encontrado" });
    await dbRun(`UPDATE fic_dispositivos SET activo = FALSE, revocado_en = ?, revocado_por = ? WHERE id = ?`,
      [isoConOffset(Date.now()), req.user.username, d.id]);
    await ficAuditar("dispositivo", d.id, "revocar", req.user.username, { local: d.local });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo revocar" }); }
});

// PIN de un trabajador. Se guarda con bcrypt (unidireccional): a diferencia de la
// contraseña del panel, un PIN no se puede recuperar, solo sustituir. Si se pudiera leer,
// cualquiera con acceso al panel podría fichar en nombre de otro.
app.put("/api/fichajes/pin/:workerId", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const w = await dbGet(`SELECT id, nombre, local FROM users WHERE id = ?`, [Number(req.params.workerId)]);
    if (!w || !rrhhPuedeLocal(req, w.local || "")) return res.status(404).json({ ok: false, error: "No encontrado" });

    const pin = String(req.body?.pin || "");
    const v = validarFormatoPin(pin);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });

    await dbRun(
      `UPDATE users SET pin_hash = ?, pin_temporal = TRUE, pin_actualizado_en = ?, pin_intentos = 0, pin_bloqueado_hasta = NULL WHERE id = ?`,
      [await bcrypt.hash(pin, 10), isoConOffset(Date.now()), w.id]);
    // En auditoría queda QUIÉN lo cambió y CUÁNDO. El PIN, evidentemente, no.
    await ficAuditar("pin", w.id, "asignar", req.user.username, { local: w.local, workerId: w.id });
    res.json({ ok: true, mensaje: `PIN asignado a ${w.nombre}. Dile que lo cambie desde su perfil.` });
  } catch (e) {
    console.error("[fichajes] pin:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo asignar el PIN" });
  }
});

// El propio trabajador cambia su PIN desde su perfil (aquí sí se exige el actual, salvo
// que sea el temporal que le acaba de dar el encargado).
app.put("/api/mi-pin", requireAuth(), async (req, res) => {
  try {
    const yo = await dbGet(`SELECT id, local, pin_hash, pin_temporal FROM users WHERE id = ?`, [req.user.id]);
    if (!yo) return res.status(404).json({ ok: false, error: "No encontrado" });

    const nuevo = String(req.body?.pin || "");
    const v = validarFormatoPin(nuevo);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });

    if (yo.pin_hash && !yo.pin_temporal) {
      if (!(await bcrypt.compare(String(req.body?.actual || ""), yo.pin_hash))) {
        return res.status(401).json({ ok: false, error: "El PIN actual no es correcto." });
      }
    }
    await dbRun(
      `UPDATE users SET pin_hash = ?, pin_temporal = FALSE, pin_actualizado_en = ?, pin_intentos = 0, pin_bloqueado_hasta = NULL WHERE id = ?`,
      [await bcrypt.hash(nuevo, 10), isoConOffset(Date.now()), yo.id]);
    await ficAuditar("pin", yo.id, "cambio_propio", req.user.username, { local: yo.local, workerId: yo.id });
    res.json({ ok: true, mensaje: "PIN actualizado." });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo cambiar el PIN" }); }
});

// ── Jornadas, incidencias y validación ───────────────────────────────────────
// La jornada NO es fuente de verdad: es una proyección que se vuelve a calcular cada vez
// que se pide, cruzando fic_eventos (el reloj) con hor_asignaciones de la semana PUBLICADA
// (el plan). Lo único que se guarda como decisión humana es `min_validado`, con su firma.

// El cuadrante publicado de un día. Si la semana no está publicada, no hay plan: eso NO es
// un error, es que ese día se trabajó sin cuadrante y las incidencias lo dirán.
async function ficPlanDelDia(local, dia) {
  const semana = await dbGet(
    `SELECT id FROM hor_semanas WHERE local = ? AND lunes = ? AND estado = 'publicado'`, [local, lunesDe(dia)]);
  if (!semana) return { semanaId: null, asignaciones: [] };
  const asignaciones = await dbAll(
    `SELECT id, worker_id, inicio_min, fin_min, fin_abierto, tipo FROM hor_asignaciones
     WHERE semana_id = ? AND dia = ?`, [semana.id, dia]);
  return { semanaId: semana.id, asignaciones };
}

// Calcula la jornada de una persona y un día, y deja la proyección guardada para poder
// listar pendientes sin recalcular medio mes. Devuelve el objeto completo.
async function ficCalcularJornada(local, workerId, dia, { cfg = null } = {}) {
  const conf = cfg || await dbGet(`SELECT corte_dia_min, tolerancia_min, hora_cierre_min FROM hor_config WHERE local = ?`, [local]);
  const eventos = await dbAll(
    `SELECT id, tipo, ocurrido_en, epoch_ms, minuto_local, origen, motivo, autor, anulado_por
     FROM fic_eventos WHERE worker_id = ? AND dia_negocio = ? ORDER BY epoch_ms ASC, id ASC`, [workerId, dia]);
  const { semanaId, asignaciones } = await ficPlanDelDia(local, dia);

  const hoy = instanteANegocio(Date.now(), { corteMin: conf?.corte_dia_min ?? 360 });
  const j = construirJornada({
    eventos,
    asignaciones: asignaciones.filter((a) => Number(a.worker_id) === Number(workerId)),
    toleranciaMin: conf?.tolerancia_min ?? 10,
    horaCierreMin: conf?.hora_cierre_min ?? null,
    diaCerrado: dia < hoy.diaNegocio,
  });

  const guardada = await dbGet(`SELECT min_validado, firma_eventos, validado_en, validado_por, validado_nota FROM fic_jornadas WHERE worker_id = ? AND dia_negocio = ?`, [workerId, dia]);
  const firma = firmaDeEventos(eventos);
  // Validación caducada: se validó, y DESPUÉS cambió el registro. No se borra la
  // validación (es una decisión humana con nombre), se marca para que se vuelva a mirar.
  const validacionCaducada = !!(guardada && guardada.min_validado != null && guardada.firma_eventos !== firma);

  await dbRun(
    `INSERT INTO fic_jornadas (worker_id, local, dia_negocio, semana_id, min_planificado, min_fichado, min_pausa,
                               incidencias, requiere_revision, calculado_en)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (worker_id, dia_negocio) DO UPDATE SET
       local = EXCLUDED.local, semana_id = EXCLUDED.semana_id,
       min_planificado = EXCLUDED.min_planificado, min_fichado = EXCLUDED.min_fichado,
       min_pausa = EXCLUDED.min_pausa, incidencias = EXCLUDED.incidencias,
       requiere_revision = EXCLUDED.requiere_revision, calculado_en = EXCLUDED.calculado_en`,
    [workerId, local, dia, semanaId, j.minPlanificado, j.minFichado, j.minPausa,
     JSON.stringify(j.incidencias.map((i) => ({ tipo: i.tipo, nivel: i.nivel, minutos: i.minutos ?? null }))),
     j.requiereRevision || validacionCaducada, isoConOffset(Date.now())]);

  return {
    ...j, dia, workerId, semanaId,
    eventos: eventos.map((e) => ({
      id: e.id, tipo: e.tipo, hora: String(e.ocurrido_en).slice(11, 16), minuto: e.minuto_local,
      origen: e.origen, motivo: e.motivo, autor: e.autor, anulado: !!e.anulado_por,
    })),
    validacion: guardada && guardada.min_validado != null
      ? { minutos: guardada.min_validado, en: guardada.validado_en, por: guardada.validado_por, nota: guardada.validado_nota, caducada: validacionCaducada }
      : null,
  };
}

/**
 * Calcula TODAS las jornadas de un periodo con un número fijo de consultas.
 *
 * ANTES: `ficCalcularJornada` por cada pareja (persona, día). Cada una hacía cinco viajes a la
 * base —eventos, semana publicada, asignaciones, jornada guardada y el UPSERT—, en serie. Un
 * mes de quince personas son unas cuatrocientas parejas: dos mil consultas para pintar una
 * pantalla. Con cincuenta personas, seis mil.
 *
 * AHORA: siete consultas, pasen las parejas que pasen, y el cálculo en memoria con las MISMAS
 * funciones puras. No se ha tocado ni una regla: `construirJornada` y `firmaDeEventos` son las
 * de siempre, y los datos que reciben son exactamente los mismos que recibían.
 *
 * DOS DETALLES QUE PARECEN MENORES Y NO LO SON:
 *
 *   · Los eventos se traen por (worker_id, dia_negocio) y NO por local. Es lo que hacía el
 *     cálculo de una jornada, y cambiarlo alteraría el resultado de quien fichara en dos
 *     sitios el mismo día: se le partiría la jornada en dos mitades sin que nadie lo pidiera.
 *   · Las parejas salen de quien FICHÓ o TENÍA TURNO. Un día sin turno y sin fichajes no es
 *     una jornada, es un día libre, y meterlo daría cientos de filas vacías que revisar.
 */
async function ficCalcularPeriodo(local, desde, hasta, { cfg = null, soloWorker = null } = {}) {
  const conf = cfg || await dbGet(`SELECT corte_dia_min, tolerancia_min, hora_cierre_min FROM hor_config WHERE local = ?`, [local]);
  const corte = conf?.corte_dia_min ?? 360;
  const hoy = instanteANegocio(Date.now(), { corteMin: corte });

  // ── 1 y 2: quién tiene algo que mirar ────────────────────────────────────────────────
  const filtroW = soloWorker ? " AND worker_id = ?" : "";
  const [fichados, planificados] = await Promise.all([
    dbAll(`SELECT DISTINCT worker_id, dia_negocio AS dia FROM fic_eventos
            WHERE local = ? AND dia_negocio BETWEEN ? AND ?${filtroW}`,
      soloWorker ? [local, desde, hasta, soloWorker] : [local, desde, hasta]),
    dbAll(`SELECT DISTINCT a.worker_id, a.dia FROM hor_asignaciones a
             JOIN hor_semanas s ON s.id = a.semana_id
            WHERE a.local = ? AND s.estado = 'publicado' AND a.tipo = 'turno' AND a.dia BETWEEN ? AND ?
              ${soloWorker ? "AND a.worker_id = ?" : ""}`,
      soloWorker ? [local, desde, hasta, soloWorker] : [local, desde, hasta]),
  ]);
  const pares = new Map();
  for (const r of [...fichados, ...planificados]) {
    pares.set(`${r.worker_id}|${r.dia}`, { worker_id: Number(r.worker_id), dia: r.dia });
  }
  if (!pares.size) return { filas: [], hoy, conf };
  const ids = [...new Set([...pares.values()].map((x) => x.worker_id))];

  // ── 3 a 7: todo lo demás, de golpe ───────────────────────────────────────────────────
  const [eventos, asignaciones, guardadas, nombres, cierres] = await Promise.all([
    // Sin filtro de local, a propósito (ver la cabecera).
    dbAll(`SELECT id, worker_id, dia_negocio, tipo, ocurrido_en, epoch_ms, minuto_local, origen, motivo, autor, anulado_por
             FROM fic_eventos WHERE worker_id = ANY(?) AND dia_negocio BETWEEN ? AND ?
            ORDER BY worker_id, dia_negocio, epoch_ms ASC, id ASC`, [ids, desde, hasta]),
    dbAll(`SELECT a.id, a.worker_id, a.dia, a.inicio_min, a.fin_min, a.fin_abierto, a.tipo, a.semana_id
             FROM hor_asignaciones a JOIN hor_semanas s ON s.id = a.semana_id
            WHERE s.local = ? AND s.estado = 'publicado' AND a.dia BETWEEN ? AND ?
              AND a.worker_id = ANY(?)`, [local, desde, hasta, ids]),
    dbAll(`SELECT worker_id, dia_negocio, min_validado, firma_eventos, validado_en, validado_por, validado_nota
             FROM fic_jornadas WHERE worker_id = ANY(?) AND dia_negocio BETWEEN ? AND ?`, [ids, desde, hasta]),
    // Por id y no por local: quien cambió de establecimiento tiene que seguir leyéndose en el
    // histórico del anterior (Fase 0).
    dbAll(`SELECT id, nombre FROM users WHERE id = ANY(?)`, [ids]),
    ficCierresDe(local),
  ]);

  const evPorPar = new Map();
  for (const e of eventos) {
    const k = `${e.worker_id}|${e.dia_negocio}`;
    if (!evPorPar.has(k)) evPorPar.set(k, []);
    evPorPar.get(k).push(e);
  }
  const asigPorPar = new Map();
  const semanaPorDia = new Map();
  for (const a of asignaciones) {
    const k = `${a.worker_id}|${a.dia}`;
    if (!asigPorPar.has(k)) asigPorPar.set(k, []);
    asigPorPar.get(k).push(a);
    if (!semanaPorDia.has(a.dia)) semanaPorDia.set(a.dia, a.semana_id);
  }
  const guardadaPorPar = new Map(guardadas.map((g) => [`${g.worker_id}|${g.dia_negocio}`, g]));
  const nombrePorId = new Map(nombres.map((u) => [u.id, u.nombre]));

  // ── El cálculo, en memoria y con las funciones de siempre ────────────────────────────
  const filas = [];
  for (const { worker_id, dia } of pares.values()) {
    const k = `${worker_id}|${dia}`;
    const evs = evPorPar.get(k) || [];
    const asigs = asigPorPar.get(k) || [];
    const j = construirJornada({
      eventos: evs,
      asignaciones: asigs,
      toleranciaMin: conf?.tolerancia_min ?? 10,
      horaCierreMin: conf?.hora_cierre_min ?? null,
      diaCerrado: dia < hoy.diaNegocio,
    });
    const g = guardadaPorPar.get(k) || null;
    const validacion = g && g.min_validado != null
      ? { minutos: g.min_validado, firma: g.firma_eventos, en: g.validado_en, por: g.validado_por, nota: g.validado_nota }
      : null;
    if (!mereceSalir(j, { validacion, eventos: evs })) continue;

    const firma = firmaDeEventos(evs);
    const c = clasificarJornada({
      jornada: j, eventos: evs, validacion, firmaActual: firma,
      diaCerrado: dia < hoy.diaNegocio,
      periodoCerrado: estaCerrado(cierres, local, dia),
    });
    filas.push({
      worker_id, dia, nombre: nombrePorId.get(worker_id) || "—",
      semanaId: semanaPorDia.get(dia) || null,
      jornada: j, eventos: evs, firma, validacion,
      estado: c.estado, puedeLote: c.puedeLote, motivo: c.motivo,
      minPlanificado: j.minPlanificado, minFichado: j.minFichado,
      minPausa: j.minPausa, minEfectivo: j.minEfectivo, minDesviacion: j.minDesviacion,
      incidencias: j.incidencias,
    });
  }
  return { filas, hoy, conf, cierres };
}

/**
 * Guarda la proyección de un lote de jornadas de una vez.
 *
 * `fic_jornadas` no es fuente de verdad —se recalcula entera— pero sí se guarda para poder
 * listar pendientes sin rehacer medio mes, y `min_planificado` es lo que lee la bolsa al
 * apuntar. Antes era un UPSERT por pareja; aquí van en bloques de doscientas.
 */
async function ficGuardarProyeccion(local, filas) {
  const ahora = isoConOffset(Date.now());
  const TROZO = 200;
  for (let i = 0; i < filas.length; i += TROZO) {
    const trozo = filas.slice(i, i + TROZO);
    const valores = [], params = [];
    for (const f of trozo) {
      valores.push("(?,?,?,?,?,?,?,?,?,?)");
      params.push(f.worker_id, local, f.dia, f.semanaId, f.jornada.minPlanificado, f.jornada.minFichado, f.jornada.minPausa,
        JSON.stringify(f.jornada.incidencias.map((x) => ({ tipo: x.tipo, nivel: x.nivel, minutos: x.minutos ?? null }))),
        // `requiere_revision` es el MISMO valor que escribía el cálculo de una jornada: sus
        // incidencias de nivel revisar, o una validación que ha caducado.
        f.jornada.requiereRevision || f.estado === CADUCADA, ahora);
    }
    await dbRun(
      `INSERT INTO fic_jornadas (worker_id, local, dia_negocio, semana_id, min_planificado, min_fichado, min_pausa,
                                 incidencias, requiere_revision, calculado_en)
       VALUES ${valores.join(",")}
       ON CONFLICT (worker_id, dia_negocio) DO UPDATE SET
         local = EXCLUDED.local, semana_id = EXCLUDED.semana_id,
         min_planificado = EXCLUDED.min_planificado, min_fichado = EXCLUDED.min_fichado,
         min_pausa = EXCLUDED.min_pausa, incidencias = EXCLUDED.incidencias,
         requiere_revision = EXCLUDED.requiere_revision, calculado_en = EXCLUDED.calculado_en`,
      params);
  }
}

app.get("/api/fichajes/jornada", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const dia = String(req.query.dia || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return res.status(400).json({ ok: false, error: "Falta el día" });
    const w = await dbGet(`SELECT id, nombre, local FROM users WHERE id = ?`, [Number(req.query.worker || 0)]);
    if (!w || w.local !== local) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    res.json({ ok: true, trabajador: { id: w.id, nombre: w.nombre }, ...(await ficCalcularJornada(local, w.id, dia)) });
  } catch (e) {
    console.error("[fichajes] jornada:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo calcular la jornada" });
  }
});

// Lo que hay que revisar de un periodo. Recalcula todos los días con actividad —fichada o
// planificada— para que no se cuele un turno que nadie fichó y del que no hay ninguna fila.
app.get("/api/fichajes/revision", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const cfg = await dbGet(`SELECT corte_dia_min, tolerancia_min, hora_cierre_min FROM hor_config WHERE local = ?`, [local]);
    const hoy = instanteANegocio(Date.now(), { corteMin: cfg?.corte_dia_min ?? 360 });
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.hasta || "")) ? String(req.query.hasta) : hoy.diaNegocio;
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || "")) ? String(req.query.desde) : sumaDias(hasta, -13);

    const { filas } = await ficCalcularPeriodo(local, desde, hasta, { cfg });
    // La proyección se guarda igual que antes, pero de doscientas en doscientas.
    if (filas.length) await ficGuardarProyeccion(local, filas);

    res.json({
      ok: true, local, desde, hasta,
      // El resumen sale de la MISMA clasificación que decide el lote: si el botón dice 184,
      // el lote toca 184. Dos reglas separadas acabarían diciendo números distintos.
      resumen: resumirRevision(filas),
      data: filas
        .sort((a, b) => b.dia.localeCompare(a.dia) || a.nombre.localeCompare(b.nombre, "es"))
        .map((f) => ({
          worker_id: f.worker_id, nombre: f.nombre, dia: f.dia,
          estado: f.estado, puedeLote: f.puedeLote, motivo: f.motivo,
          minPlanificado: f.minPlanificado, minFichado: f.minFichado,
          minPausa: f.minPausa, minEfectivo: f.minEfectivo, minDesviacion: f.minDesviacion,
          // Se mandan las horas de plan y de reloj para poder enseñar la comparación sin
          // tener que abrir la jornada.
          plan: f.jornada.plan.map((t) => ({ inicio: t.inicio, fin: t.fin, abierto: !!t.abierto })),
          fichado: f.jornada.fichado.map((t) => ({ inicio: t.inicio, fin: t.fin, pausa: t.pausa || 0 })),
          requiereRevision: f.jornada.requiereRevision,
          validado: f.validacion ? f.validacion.minutos : null,
          validadoPor: f.validacion ? f.validacion.por : null,
          validacionCaducada: f.estado === CADUCADA,
          incidencias: f.incidencias.map((i) => ({ tipo: i.tipo, nivel: i.nivel, texto: i.texto, minutos: i.minutos ?? null })),
        })),
    });
  } catch (e) {
    console.error("[fichajes] revision:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar la revisión" });
  }
});

// ── Correcciones ─────────────────────────────────────────────────────────────
// Añadir un fichaje a mano. NO se copia lo planificado: quien corrige escribe la hora y
// el motivo, y ambos quedan con su nombre. `origen='manual'` distingue para siempre esta
// fila de la que puso una persona en la tablet.
const MOTIVO_MIN = 5;
app.post("/api/fichajes/evento", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const w = await dbGet(`SELECT id, nombre, local FROM users WHERE id = ?`, [Number(req.body?.worker_id || 0)]);
    if (!w || !rrhhPuedeLocal(req, w.local || "")) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });

    const dia = String(req.body?.dia || "");
    const tipo = String(req.body?.tipo || "");
    const motivo = String(req.body?.motivo || "").trim();
    const minuto = aMinutos(String(req.body?.hora || ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return res.status(400).json({ ok: false, error: "Falta el día" });
    if (!["entrada", "salida", "pausa_inicio", "pausa_fin"].includes(tipo)) return res.status(400).json({ ok: false, error: "Acción no válida" });
    if (minuto == null) return res.status(400).json({ ok: false, error: "La hora tiene que ser HH:MM (admite 26:00 para la madrugada)" });
    if (motivo.length < MOTIVO_MIN) return res.status(400).json({ ok: false, error: "Escribe el motivo: es lo que hace que la corrección valga como prueba" });

    // Periodo cerrado = nómina ya pagada. No se toca sin reabrirlo a propósito.
    const bloqueo = await ficBloqueoPorCierre(w.local, dia);
    if (bloqueo) return res.status(409).json({ ok: false, error: bloqueo });

    const cfg = await dbGet(`SELECT corte_dia_min FROM hor_config WHERE local = ?`, [w.local]);
    const corte = cfg?.corte_dia_min ?? 360;
    if (minuto < corte || minuto >= corte + 1440) {
      return res.status(400).json({ ok: false, error: `Ese día de trabajo va de las ${deMinutos(corte)} a las ${deMinutos(corte + 1440)} del día siguiente` });
    }
    // El minuto local pasa de 1440 en la madrugada; el instante real es del día siguiente.
    const { epochMs } = epochDeLocal(minuto >= 1440 ? sumaDias(dia, 1) : dia, minuto % 1440);

    const ev = await dbRun(
      `INSERT INTO fic_eventos (worker_id, local, tipo, ocurrido_en, epoch_ms, dia_negocio, minuto_local,
                                origen, autor, motivo, creado_en)
       VALUES (?,?,?,?,?,?,?,'manual',?,?,?) RETURNING id, tipo, ocurrido_en`,
      [w.id, w.local, tipo, isoConOffset(epochMs), epochMs, dia, minuto, req.user.username, motivo, isoConOffset(Date.now())]);

    await dbRun(
      `INSERT INTO fic_correcciones (worker_id, local, dia_negocio, accion, evento_nuevo_id, motivo, autor, creado_en)
       VALUES (?,?,?,'anadir',?,?,?,?)`,
      [w.id, w.local, dia, ev.id, motivo, req.user.username, isoConOffset(Date.now())]);
    await ficAuditar("evento", ev.id, "anadir_manual", req.user.username, { local: w.local, workerId: w.id, detalle: { dia, tipo, minuto, motivo } });

    res.json({ ok: true, evento: ev, jornada: await ficCalcularJornada(w.local, w.id, dia) });
  } catch (e) {
    console.error("[fichajes] evento manual:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo registrar la corrección" });
  }
});

// Anular. `anulado_por` es LA ÚNICA columna de fic_eventos que se actualiza en todo el
// sistema, y aquí está el único sitio donde ocurre. La fila original se queda entera.
app.post("/api/fichajes/evento/:id/anular", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const ev = await dbGet(`SELECT id, worker_id, local, tipo, dia_negocio, anulado_por FROM fic_eventos WHERE id = ?`, [Number(req.params.id)]);
    if (!ev || !rrhhPuedeLocal(req, ev.local)) return res.status(404).json({ ok: false, error: "Fichaje no encontrado" });
    if (ev.anulado_por) return res.status(409).json({ ok: false, error: "Ese fichaje ya estaba anulado" });
    const bloqueo = await ficBloqueoPorCierre(ev.local, ev.dia_negocio);
    if (bloqueo) return res.status(409).json({ ok: false, error: bloqueo });

    const motivo = String(req.body?.motivo || "").trim();
    if (motivo.length < MOTIVO_MIN) return res.status(400).json({ ok: false, error: "Escribe el motivo: sin él, anular un fichaje es borrar una prueba" });

    const corr = await dbRun(
      `INSERT INTO fic_correcciones (worker_id, local, dia_negocio, accion, evento_anulado_id, motivo, autor, creado_en)
       VALUES (?,?,?,'anular',?,?,?,?) RETURNING id`,
      [ev.worker_id, ev.local, ev.dia_negocio, ev.id, motivo, req.user.username, isoConOffset(Date.now())]);
    // Se apunta a la corrección, no al usuario: desde la fila anulada se llega al motivo.
    await dbRun(`UPDATE fic_eventos SET anulado_por = ? WHERE id = ?`, [corr.id, ev.id]);
    await ficAuditar("evento", ev.id, "anular", req.user.username, { local: ev.local, workerId: ev.worker_id, detalle: { motivo, correccion: corr.id } });

    res.json({ ok: true, jornada: await ficCalcularJornada(ev.local, ev.worker_id, ev.dia_negocio) });
  } catch (e) {
    console.error("[fichajes] anular:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo anular" });
  }
});

app.get("/api/fichajes/correcciones", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const filas = await dbAll(
      `SELECT c.*, u.nombre FROM fic_correcciones c LEFT JOIN users u ON u.id = c.worker_id
       WHERE c.local = ? ${req.query.dia ? "AND c.dia_negocio = ?" : ""} ORDER BY c.id DESC LIMIT 200`,
      req.query.dia ? [local, String(req.query.dia)] : [local]);
    res.json({ ok: true, data: filas });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudieron cargar las correcciones" }); }
});

// ── Validación ───────────────────────────────────────────────────────────────
// «Estas son las horas que se pagan». Firmada: queda quién, cuándo y sobre QUÉ eventos.
// Si después cambia el registro, la firma deja de coincidir y la jornada vuelve a la lista.
/**
 * Escribe UNA validación y la lleva a la bolsa. La usan la validación individual y la de lote,
 * y son exactamente las mismas dos operaciones en el mismo orden.
 *
 * Existe porque estaba pegada al endpoint individual: copiarla en el del lote habría creado dos
 * caminos que empiezan iguales y acaban divergiendo, y el sitio donde eso se nota es la nómina.
 *
 * `soloSiSinValidar` es el candado del lote. La condición `min_validado IS NULL` va DENTRO del
 * UPDATE, así que dos peticiones simultáneas —o un doble clic en el botón— no pueden validar
 * dos veces la misma jornada: la segunda no toca ninguna fila y se sabe porque no vuelve nada.
 * La bolsa además es idempotente por su cuenta (la clave lleva la firma de los eventos), así
 * que aquí hay dos frenos y no uno.
 */
async function ficEscribirValidacion({ local, workerId, dia, minutos, nota, autor, firma, soloSiSinValidar = false }) {
  const fila = await dbRun(
    `UPDATE fic_jornadas SET min_validado = ?, firma_eventos = ?, validado_en = ?, validado_por = ?,
            validado_nota = ?, requiere_revision = FALSE
      WHERE worker_id = ? AND dia_negocio = ?${soloSiSinValidar ? " AND min_validado IS NULL" : ""}
      RETURNING worker_id`,
    [minutos, firma, isoConOffset(Date.now()), autor, nota || null, workerId, dia]);
  if (!fila) return { escrita: false, motivo: "ya_validada" };

  await ficAuditar("jornada", null, "validar", autor, {
    local, workerId, detalle: { dia, minutos, nota: nota || null, lote: !!soloSiSinValidar } });

  // Validar es lo que mete horas en la bolsa. Mismo mecanismo que siempre: la diferencia entre
  // lo validado y lo que tocaba según el cuadrante, con su clave de idempotencia.
  const bolsa = await ficApuntarJornada(local, workerId, dia, { autor });
  return { escrita: true, bolsa };
}

app.post("/api/fichajes/validar", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const w = await dbGet(`SELECT id, nombre, local FROM users WHERE id = ?`, [Number(req.body?.worker_id || 0)]);
    if (!w || !rrhhPuedeLocal(req, w.local || "")) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    const dia = String(req.body?.dia || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return res.status(400).json({ ok: false, error: "Falta el día" });
    const bloqueo = await ficBloqueoPorCierre(w.local, dia);
    if (bloqueo) return res.status(409).json({ ok: false, error: bloqueo });

    const j = await ficCalcularJornada(w.local, w.id, dia);
    // Por defecto se valida lo FICHADO menos las pausas. Se puede poner otro número —hay
    // acuerdos que no salen del reloj—, pero entonces hace falta explicarlo.
    const propuesto = j.minEfectivo;
    const minutos = req.body?.minutos == null ? propuesto : Math.max(0, Math.round(Number(req.body.minutos)));
    if (!Number.isFinite(minutos)) return res.status(400).json({ ok: false, error: "Los minutos no son un número" });
    const nota = String(req.body?.nota || "").trim();
    if (minutos !== propuesto && nota.length < MOTIVO_MIN) {
      return res.status(400).json({ ok: false, error: `Vas a validar ${deMinutos(minutos, { formato: "absoluto" })} en lugar de las ${deMinutos(propuesto, { formato: "absoluto" })} fichadas: explica por qué` });
    }
    if (j.requiereRevision && !req.body?.aceptar_incidencias) {
      return res.status(409).json({ ok: false, error: "Esta jornada tiene incidencias sin resolver", incidencias: j.incidencias });
    }

    const eventos = await dbAll(`SELECT id, tipo, epoch_ms, anulado_por FROM fic_eventos WHERE worker_id = ? AND dia_negocio = ?`, [w.id, dia]);
    // Sin `soloSiSinValidar`: aquí SÍ se puede volver a validar una jornada ya validada, que es
    // lo que hace falta cuando una validación caduca y hay que rehacerla.
    const { bolsa } = await ficEscribirValidacion({
      local: w.local, workerId: w.id, dia, minutos, nota, autor: req.user.username,
      firma: firmaDeEventos(eventos),
    });

    res.json({ ok: true, minutos, bolsa, mensaje: `Jornada de ${w.nombre} validada: ${deMinutos(minutos, { formato: "absoluto" })}.` });
  } catch (e) {
    console.error("[fichajes] validar:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo validar" });
  }
});

/**
 * Validar de golpe las jornadas que no necesitan que nadie decida nada.
 *
 * NO SE FÍA DE LA LISTA QUE MANDE EL NAVEGADOR. Vuelve a calcular el periodo entero aquí y
 * ahora, y solo toca lo que EN ESTE MOMENTO sale como `lista_para_validar`. Si mientras la
 * persona miraba la pantalla llegó un fichaje, se cerró el periodo o apareció una incidencia,
 * esa jornada se queda fuera y se dice por qué. La lista del cliente solo puede RECORTAR lo
 * que se valida, nunca ampliarlo: sirve para que el botón haga exactamente lo que prometía.
 *
 * NO ES TODO O NADA. Si una jornada se cae, las demás entran igual: un lote de doscientas que
 * se deshace entero porque una cambió obliga a repetirlo sin saber cuál era, y eso acaba en
 * que nadie valida.
 */
app.post("/api/fichajes/validar-lote", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.body?.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const cfg = await dbGet(`SELECT corte_dia_min, tolerancia_min, hora_cierre_min FROM hor_config WHERE local = ?`, [local]);
    const hoy = instanteANegocio(Date.now(), { corteMin: cfg?.corte_dia_min ?? 360 });
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.hasta || "")) ? String(req.body.hasta) : hoy.diaNegocio;
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.desde || "")) ? String(req.body.desde) : sumaDias(hasta, -13);

    // Se recalcula TODO otra vez. Es la única forma de no validar sobre una foto vieja.
    const { filas } = await ficCalcularPeriodo(local, desde, hasta, { cfg });
    if (filas.length) await ficGuardarProyeccion(local, filas);

    let candidatas = candidatasDeLote(filas);
    // Si el cliente manda una lista, se INTERSECA: nunca añade, solo acota.
    const pedidas = Array.isArray(req.body?.jornadas) ? req.body.jornadas : null;
    if (pedidas) {
      const quiere = new Set(pedidas.map((x) => `${Number(x.worker_id)}|${String(x.dia)}`));
      candidatas = candidatas.filter((f) => quiere.has(`${f.worker_id}|${f.dia}`));
    }
    if (!candidatas.length) {
      return res.json({ ok: true, validadas: 0, omitidas: [], resumen: resumirRevision(filas),
        mensaje: "No hay ninguna jornada lista para validar en estas fechas." });
    }

    // Última comprobación, lo más pegada posible a la escritura: se releen los eventos de las
    // candidatas y se compara la firma. Si una recibió un fichaje entre el cálculo y esto, su
    // firma ya no coincide y se queda fuera. Una sola consulta para todas.
    const ids = [...new Set(candidatas.map((f) => f.worker_id))];
    const frescos = await dbAll(
      `SELECT id, worker_id, dia_negocio, tipo, epoch_ms, anulado_por FROM fic_eventos
        WHERE worker_id = ANY(?) AND dia_negocio BETWEEN ? AND ? ORDER BY worker_id, dia_negocio, epoch_ms, id`,
      [ids, desde, hasta]);
    const frescosPorPar = new Map();
    for (const e of frescos) {
      const k = `${e.worker_id}|${e.dia_negocio}`;
      if (!frescosPorPar.has(k)) frescosPorPar.set(k, []);
      frescosPorPar.get(k).push(e);
    }

    const omitidas = [];
    let validadas = 0, minutos = 0;
    for (const f of candidatas) {
      const firmaAhora = firmaDeEventos(frescosPorPar.get(`${f.worker_id}|${f.dia}`) || []);
      if (firmaAhora !== f.firma) {
        omitidas.push({ worker_id: f.worker_id, nombre: f.nombre, dia: f.dia, motivo: "cambió mientras se validaba" });
        continue;
      }
      // Los minutos son los mismos que propondría la validación individual: lo fichado menos
      // las pausas. El lote NO redondea nada — la tolerancia sirve para clasificar una
      // incidencia, no para cambiar en silencio el tiempo que alguien trabajó.
      const r = await ficEscribirValidacion({
        local, workerId: f.worker_id, dia: f.dia, minutos: f.minEfectivo,
        nota: null, autor: req.user.username, firma: f.firma, soloSiSinValidar: true,
      });
      if (!r.escrita) {
        omitidas.push({ worker_id: f.worker_id, nombre: f.nombre, dia: f.dia, motivo: "ya estaba validada" });
        continue;
      }
      validadas++; minutos += f.minEfectivo;
    }

    await ficAuditar("jornada", null, "validar_lote", req.user.username, {
      local, detalle: { desde, hasta, validadas, omitidas: omitidas.length } });

    const partes = [`${validadas} ${validadas === 1 ? "jornada validada" : "jornadas validadas"}`];
    if (omitidas.length) partes.push(`${omitidas.length} ${omitidas.length === 1 ? "cambió" : "cambiaron"} mientras se procesaban y sigue${omitidas.length === 1 ? "" : "n"} pendiente${omitidas.length === 1 ? "" : "s"}`);
    res.json({ ok: true, validadas, minutos, omitidas, mensaje: partes.join(". ") + "." });
  } catch (e) {
    console.error("[fichajes] validar-lote:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo validar el lote" });
  }
});

// ── Bolsa de horas, cierre de periodo y export legal ─────────────────────────
// La bolsa es un LIBRO: el saldo es SUM(minutos) y no hay ninguna columna `saldo`.
// El cierre es lo que impide que corregir un día de marzo en noviembre cambie una nómina
// ya pagada sin que nadie se entere.

const ficCierresDe = (local) => dbAll(
  `SELECT local, etiqueta, desde, hasta, cerrado_en, cerrado_por, reabierto_en FROM fic_cierres WHERE local = ?`, [local]);

async function ficPeriodoDe(local, dia) {
  const cfg = await dbGet(`SELECT dia_inicio_periodo FROM hor_config WHERE local = ?`, [local]);
  return periodoDe(dia, { diaInicio: cfg?.dia_inicio_periodo ?? 1 });
}

// Guardia que se llama ANTES de tocar nada de un día. Devuelve el mensaje si está cerrado.
async function ficBloqueoPorCierre(local, dia) {
  return motivoBloqueo(await ficCierresDe(local), local, dia);
}

// Lleva al libro la diferencia entre lo VALIDADO y lo que tocaba según el cuadrante.
// A la bolsa solo va lo validado: mientras una jornada esté sin revisar, sus horas no
// entran en el saldo de nadie. Si no, el saldo se movería solo cada vez que alguien ficha.
async function ficApuntarJornada(local, workerId, dia, { autor = "sistema" } = {}) {
  const j = await dbGet(
    `SELECT min_planificado, min_validado, firma_eventos FROM fic_jornadas WHERE worker_id = ? AND dia_negocio = ?`,
    [workerId, dia]);
  if (!j || j.min_validado == null) return { apuntado: false, motivo: "sin validar" };

  const periodo = await ficPeriodoDe(local, dia);
  const existentes = await dbAll(
    `SELECT id, concepto, minutos, clave_idem, referencia_id FROM fic_bolsa_movimientos
     WHERE worker_id = ? AND dia = ? ORDER BY id`, [workerId, dia]);

  const { insertar, sinCambios } = movimientosParaJornada({
    workerId, local, dia, periodo: periodo.etiqueta,
    minutos: Number(j.min_validado) - Number(j.min_planificado || 0),
    firma: j.firma_eventos, existentes, autor,
    nota: `Validado ${j.min_validado} min sobre ${j.min_planificado || 0} planificados`,
  });
  if (sinCambios) return { apuntado: false, motivo: "sin cambios" };

  const ahora = isoConOffset(Date.now());
  for (const m of insertar) {
    // ON CONFLICT DO NOTHING sobre la clave: dos recálculos a la vez no duplican.
    await dbRun(
      `INSERT INTO fic_bolsa_movimientos (worker_id, local, dia, periodo, concepto, minutos, clave_idem, referencia_id, nota, autor, creado_en)
       VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (clave_idem) DO NOTHING`,
      [m.worker_id, m.local, m.dia, m.periodo, m.concepto, m.minutos, m.clave_idem, m.referencia_id ?? null, m.nota ?? null, m.autor, ahora]);
  }
  return { apuntado: true, movimientos: insertar.length };
}

// Saldo por persona de un periodo, con el arrastre de lo anterior.
app.get("/api/fichajes/bolsa", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const cfg = await dbGet(`SELECT dia_inicio_periodo, corte_dia_min FROM hor_config WHERE local = ?`, [local]);
    const hoy = instanteANegocio(Date.now(), { corteMin: cfg?.corte_dia_min ?? 360 });
    const p = periodoDe(/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dia || "")) ? String(req.query.dia) : hoy.diaNegocio,
      { diaInicio: cfg?.dia_inicio_periodo ?? 1 });

    const [delPeriodo, anteriores, gente, cierres, tardios] = await Promise.all([
      dbAll(`SELECT worker_id, concepto, minutos FROM fic_bolsa_movimientos WHERE local = ? AND periodo = ?`, [local, p.etiqueta]),
      dbAll(`SELECT worker_id, sum(minutos) AS min FROM fic_bolsa_movimientos
             WHERE local = ? AND periodo < ? GROUP BY worker_id`, [local, p.etiqueta]),
      // Quien se fue con horas a favor tiene que seguir saliendo hasta que se le liquiden:
      // desaparecer de la pantalla no le quita el saldo, solo lo esconde.
      // La plantilla del periodo MÁS cualquiera que tenga movimientos en este local, aunque
      // ya no sea de aquí. Quien se cambió de establecimiento con saldo pendiente en el
      // anterior desaparecía de esa pantalla, y sus horas con él.
      dbAll(`SELECT id, nombre FROM users
              WHERE (local = ? AND ${SQL_ESTUVO_ENTRE})
                 OR id IN (SELECT DISTINCT worker_id FROM fic_bolsa_movimientos WHERE local = ?)
              ORDER BY nombre`,
        [local, p.hasta, p.desde, local]),
      ficCierresDe(local),
      // Fichajes que aterrizaron DESPUÉS de cerrar este periodo: una tablet que subió su cola
      // tarde. No han cambiado nada de lo cerrado —la bolsa solo la escriben validar y cerrar,
      // y las dos comprueban el cierre— pero alguien tiene que decidir si se reabre.
      dbGet(`SELECT COUNT(*)::int AS n FROM fic_eventos e
              JOIN fic_cierres c ON c.local = e.local AND c.reabierto_en IS NULL
                                AND e.dia_negocio BETWEEN c.desde AND c.hasta
             WHERE e.local = ? AND c.etiqueta = ? AND e.creado_en > c.cerrado_en`, [local, p.etiqueta])
        .catch(() => ({ n: 0 })),
    ]);

    const porPersona = new Map();
    for (const m of delPeriodo) {
      if (!porPersona.has(m.worker_id)) porPersona.set(m.worker_id, []);
      porPersona.get(m.worker_id).push(m);
    }
    const arrastre = new Map(anteriores.map((r) => [r.worker_id, Number(r.min) || 0]));

    const personas = gente.map((w) => {
      const movs = porPersona.get(w.id) || [];
      const delMes = saldoDe(movs);
      const antes = arrastre.get(w.id) || 0;
      return { id: w.id, nombre: w.nombre, arrastre: antes, periodo: delMes, saldo: antes + delMes, movimientos: movs.length };
    });

    // Jornadas del periodo todavía sin validar: sus horas NO están en ningún saldo, y hay
    // que decirlo o el número de arriba parece completo cuando no lo es.
    const pend = await dbGet(
      `SELECT count(*)::int AS n FROM fic_jornadas WHERE local = ? AND dia_negocio BETWEEN ? AND ? AND min_validado IS NULL`,
      [local, p.desde, p.hasta]);

    res.json({
      ok: true, local, periodo: p, personas,
      sinValidar: pend?.n || 0,
      cerrado: estaCerrado(cierres, local, p.hasta),
      cierre: cierres.find((c) => c.etiqueta === p.etiqueta && !c.reabierto_en) || null,
      llegadosTrasCerrar: Number(tardios?.n) || 0,
    });
  } catch (e) {
    console.error("[fichajes] bolsa:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo calcular la bolsa" });
  }
});

app.get("/api/fichajes/bolsa/:workerId", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const w = await dbGet(`SELECT id, nombre, local FROM users WHERE id = ?`, [Number(req.params.workerId)]);
    if (!w || !rrhhPuedeLocal(req, w.local || "")) return res.status(404).json({ ok: false, error: "No encontrado" });
    // DOS consultas a propósito. El saldo es `SUM(minutos)` de TODAS las filas y no admite
    // recortes; la lista que se pinta sí, porque nadie lee dos mil movimientos. Antes se
    // calculaba el saldo sobre las 500 últimas, así que el modal podía decir un número y la
    // tabla de al lado otro, y el bueno era el de la tabla.
    const [total, movs] = await Promise.all([
      dbGet(`SELECT COALESCE(SUM(minutos),0)::int AS saldo, COUNT(*)::int AS n
               FROM fic_bolsa_movimientos WHERE worker_id = ?`, [w.id]),
      dbAll(`SELECT id, dia, periodo, concepto, minutos, nota, autor, referencia_id, creado_en
               FROM fic_bolsa_movimientos WHERE worker_id = ? ORDER BY periodo DESC, id DESC LIMIT 500`, [w.id]),
    ]);
    res.json({
      ok: true, trabajador: { id: w.id, nombre: w.nombre },
      saldo: Number(total?.saldo) || 0,
      movimientos: Number(total?.n) || 0,
      // Se dice cuántos se han dejado fuera: una lista recortada en silencio hace dudar del
      // saldo, que es justo el número que no se puede poner en duda.
      recortado: (Number(total?.n) || 0) > movs.length,
      data: movs,
    });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo cargar el libro" }); }
});

// Ajuste manual: «te debo dos horas de la fiesta mayor». Va al libro como una fila más,
// con motivo y con nombre, y se puede señalar para siempre.
app.post("/api/fichajes/bolsa/ajuste", requireAuth(["direccion", "rrhh"]), async (req, res) => {
  try {
    const w = await dbGet(`SELECT id, nombre, local FROM users WHERE id = ?`, [Number(req.body?.worker_id || 0)]);
    if (!w || !rrhhPuedeLocal(req, w.local || "")) return res.status(404).json({ ok: false, error: "No encontrado" });
    const minutos = Math.round(Number(req.body?.minutos));
    const nota = String(req.body?.nota || "").trim();
    if (!Number.isFinite(minutos) || minutos === 0) return res.status(400).json({ ok: false, error: "Pon los minutos (en negativo si se le descuentan)" });
    if (nota.length < MOTIVO_MIN) return res.status(400).json({ ok: false, error: "Explica el ajuste: dentro de seis meses nadie se acordará" });

    const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.dia || "")) ? String(req.body.dia) : instanteANegocio(Date.now()).diaNegocio;
    const bloqueo = await ficBloqueoPorCierre(w.local, dia);
    if (bloqueo) return res.status(409).json({ ok: false, error: bloqueo });
    const p = await ficPeriodoDe(w.local, dia);

    await dbRun(
      `INSERT INTO fic_bolsa_movimientos (worker_id, local, dia, periodo, concepto, minutos, clave_idem, nota, autor, creado_en)
       VALUES (?,?,?,?, 'ajuste', ?,?,?,?,?)`,
      [w.id, w.local, dia, p.etiqueta, minutos, `ajuste:${w.id}:${dia}:${crypto.randomBytes(6).toString("hex")}`,
       nota, req.user.username, isoConOffset(Date.now())]);
    await ficAuditar("bolsa", w.id, "ajuste", req.user.username, { local: w.local, workerId: w.id, detalle: { minutos, dia, nota } });
    res.json({ ok: true, mensaje: `Ajuste de ${minutos > 0 ? "+" : ""}${minutos} min anotado a ${w.nombre}.` });
  } catch (e) {
    console.error("[fichajes] ajuste:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo anotar el ajuste" });
  }
});

// ── Cierre ───────────────────────────────────────────────────────────────────
app.post("/api/fichajes/cerrar", requireAuth(["direccion", "rrhh"]), async (req, res) => {
  try {
    const local = horLocal(req, req.body?.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const cfg = await dbGet(`SELECT dia_inicio_periodo, corte_dia_min FROM hor_config WHERE local = ?`, [local]);
    const p = periodoDe(String(req.body?.dia || instanteANegocio(Date.now(), { corteMin: cfg?.corte_dia_min ?? 360 }).diaNegocio),
      { diaInicio: cfg?.dia_inicio_periodo ?? 1 });
    if (!p) return res.status(400).json({ ok: false, error: "Periodo no válido" });

    const hoy = instanteANegocio(Date.now(), { corteMin: cfg?.corte_dia_min ?? 360 }).diaNegocio;
    if (p.hasta >= hoy) return res.status(409).json({ ok: false, error: "Ese periodo todavía no ha terminado" });
    if (estaCerrado(await ficCierresDe(local), local, p.hasta)) return res.status(409).json({ ok: false, error: "Ese periodo ya está cerrado" });

    // No se cierra con jornadas sin validar: cerrar significa "estas son las horas", y con
    // días a medias no lo son. Se puede forzar, pero hay que decirlo a propósito.
    const pend = await dbAll(
      `SELECT j.worker_id, j.dia_negocio, u.nombre FROM fic_jornadas j LEFT JOIN users u ON u.id = j.worker_id
       WHERE j.local = ? AND j.dia_negocio BETWEEN ? AND ? AND j.min_validado IS NULL ORDER BY j.dia_negocio`,
      [local, p.desde, p.hasta]);
    if (pend.length && !req.body?.forzar) {
      return res.status(409).json({
        ok: false, error: `Quedan ${pend.length} ${pend.length === 1 ? "jornada" : "jornadas"} sin validar en este periodo`,
        pendientes: pend.slice(0, 20),
      });
    }

    // Antes de cerrar se apunta al libro TODO lo validado del periodo: el cierre tiene que
    // reflejar lo que se decidió, no lo que hubiera apuntado quien pasara por la pantalla.
    const validadas = await dbAll(
      `SELECT worker_id, dia_negocio FROM fic_jornadas WHERE local = ? AND dia_negocio BETWEEN ? AND ? AND min_validado IS NOT NULL`,
      [local, p.desde, p.hasta]);
    for (const v of validadas) await ficApuntarJornada(local, v.worker_id, v.dia_negocio, { autor: req.user.username });

    const resumen = await dbAll(
      `SELECT b.worker_id, u.nombre, sum(b.minutos)::int AS minutos FROM fic_bolsa_movimientos b
       LEFT JOIN users u ON u.id = b.worker_id
       WHERE b.local = ? AND b.periodo = ? GROUP BY b.worker_id, u.nombre ORDER BY u.nombre`, [local, p.etiqueta]);
    const cuerpo = { local, periodo: p, resumen, generado: isoConOffset(Date.now()) };
    const hash = crypto.createHash("sha256").update(serializarCanonico(cuerpo)).digest("hex");

    await dbRun(
      `INSERT INTO fic_cierres (local, etiqueta, desde, hasta, resumen, hash, cerrado_en, cerrado_por)
       VALUES (?,?,?,?,?,?,?,?)`,
      [local, p.etiqueta, p.desde, p.hasta, JSON.stringify(cuerpo), hash, isoConOffset(Date.now()), req.user.username]);
    await ficAuditar("cierre", null, "cerrar", req.user.username, { local, detalle: { periodo: p.etiqueta, hash, forzado: !!req.body?.forzar, sinValidar: pend.length } });

    res.json({ ok: true, periodo: p, hash, resumen, mensaje: `Periodo ${p.etiqueta} cerrado.` });
  } catch (e) {
    console.error("[fichajes] cerrar:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cerrar el periodo" });
  }
});

// Reabrir. Se puede, pero con motivo y dejando la fila anterior intacta: el cierre no se
// borra, se marca como reabierto. Así queda para siempre que ese mes se tocó después.
app.post("/api/fichajes/reabrir", requireAuth(["direccion"]), async (req, res) => {
  try {
    const local = horLocal(req, req.body?.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const motivo = String(req.body?.motivo || "").trim();
    if (motivo.length < MOTIVO_MIN) return res.status(400).json({ ok: false, error: "Escribe por qué se reabre un periodo ya cerrado" });
    const c = await dbGet(`SELECT id, etiqueta FROM fic_cierres WHERE local = ? AND etiqueta = ? AND reabierto_en IS NULL`,
      [local, String(req.body?.etiqueta || "")]);
    if (!c) return res.status(404).json({ ok: false, error: "Ese periodo no está cerrado" });

    await dbRun(`UPDATE fic_cierres SET reabierto_en = ?, reabierto_por = ?, reabierto_motivo = ? WHERE id = ?`,
      [isoConOffset(Date.now()), req.user.username, motivo, c.id]);
    await ficAuditar("cierre", c.id, "reabrir", req.user.username, { local, detalle: { periodo: c.etiqueta, motivo } });
    res.json({ ok: true, mensaje: `Periodo ${c.etiqueta} reabierto. Queda constancia.` });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo reabrir" }); }
});

app.get("/api/fichajes/cierres", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    res.json({ ok: true, data: await dbAll(
      `SELECT c.id, c.etiqueta, c.desde, c.hasta, c.hash, c.cerrado_en, c.cerrado_por,
              c.reabierto_en, c.reabierto_por, c.reabierto_motivo,
              (SELECT COUNT(*)::int FROM fic_eventos e
                WHERE e.local = c.local AND e.dia_negocio BETWEEN c.desde AND c.hasta
                  AND e.creado_en > c.cerrado_en) AS llegados_tras_cerrar
         FROM fic_cierres c WHERE c.local = ? ORDER BY c.desde DESC`, [local]) });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudieron cargar los cierres" }); }
});

// ── Export legal ─────────────────────────────────────────────────────────────
// «Disponible para la persona trabajadora, sus representantes y la Inspección» (art. 34.9
// ET). CSV con punto y coma y BOM para que Excel en español lo abra bien a la primera:
// un export que hay que pelear con el asistente de importación no está disponible de nada.
app.get("/api/fichajes/export", requireAuth(FICHAJES_ROLES), async (req, res) => {
  try {
    const local = horLocal(req, req.query.local);
    if (!local) return res.status(403).json({ ok: false, error: "Sin acceso a este establecimiento" });
    const cfg = await dbGet(`SELECT dia_inicio_periodo, corte_dia_min FROM hor_config WHERE local = ?`, [local]);
    const p = periodoDe(String(req.query.dia || instanteANegocio(Date.now(), { corteMin: cfg?.corte_dia_min ?? 360 }).diaNegocio),
      { diaInicio: cfg?.dia_inicio_periodo ?? 1 });
    const soloWorker = Number(req.query.worker || 0) || null;

    const eventos = await dbAll(
      `SELECT e.worker_id, u.nombre, u.dni, e.dia_negocio, e.tipo, e.ocurrido_en, e.minuto_local, e.origen, e.autor, e.motivo, e.anulado_por
       FROM fic_eventos e LEFT JOIN users u ON u.id = e.worker_id
       WHERE e.local = ? AND e.dia_negocio BETWEEN ? AND ? ${soloWorker ? "AND e.worker_id = ?" : ""}
       ORDER BY u.nombre, e.dia_negocio, e.epoch_ms, e.id`,
      soloWorker ? [local, p.desde, p.hasta, soloWorker] : [local, p.desde, p.hasta]);

    // El CSV se construye en src/modules/fichajes/export.js, con sus tests: es un documento
    // que puede acabar delante de un inspector, y un punto y coma dentro de un motivo que
    // parta una fila haría que el fichero contase otra cosa.
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nombreFicheroRegistro(local, p.etiqueta)}"`);
    res.send(construirCsv(eventos));
    await ficAuditar("export", null, "descargar", req.user.username, { local, detalle: { periodo: p.etiqueta, filas: eventos.length, worker: soloWorker } });
  } catch (e) {
    console.error("[fichajes] export:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo generar el export" });
  }
});

// ── Autoservicio: lo que cada uno ve de SÍ MISMO ─────────────────────────────
// El art. 34.9 del ET obliga a que el registro esté a disposición de la persona
// trabajadora. Estas dos rutas son esa disposición, y no dependen de que nadie le mande
// nada: entra con su usuario y lo ve. Ninguna acepta un `worker_id`: siempre es req.user.id.

app.get("/api/mi-cuadrante", requireAuth(), async (req, res) => {
  try {
    const yo = await dbGet(`SELECT id, nombre, local FROM users WHERE id = ?`, [req.user.id]);
    if (!yo || !yo.local) return res.json({ ok: true, sinLocal: true, semanas: [] });

    const cfg = await dbGet(`SELECT corte_dia_min FROM hor_config WHERE local = ?`, [yo.local]);
    const hoy = instanteANegocio(Date.now(), { corteMin: cfg?.corte_dia_min ?? 360 });
    const lunes = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.lunes || "")) ? lunesDe(String(req.query.lunes)) : lunesDe(hoy.diaNegocio);

    // SOLO lo publicado. Un borrador es una idea a medias del encargado: enseñárselo a la
    // gente haría que se organizaran con horarios que todavía pueden cambiar.
    const semana = await dbGet(
      `SELECT id, version, publicado_en FROM hor_semanas WHERE local = ? AND lunes = ? AND estado = 'publicado'`,
      [yo.local, lunes]);

    const dias = diasSemana(lunes);
    if (!semana) return res.json({ ok: true, local: yo.local, lunes, dias, hoy: hoy.diaNegocio, publicado: false, turnos: [] });

    const filas = await dbAll(
      `SELECT a.dia, a.inicio_min, a.fin_min, a.fin_abierto, a.tipo, a.nota, ar.nombre AS area, t.nombre AS tramo
       FROM hor_asignaciones a
       LEFT JOIN hor_areas ar ON ar.id = a.area_id
       LEFT JOIN hor_tramos t ON t.id = a.tramo_id
       WHERE a.semana_id = ? AND a.worker_id = ? ORDER BY a.dia, a.inicio_min`, [semana.id, yo.id]);

    res.json({
      ok: true, local: yo.local, lunes, dias, hoy: hoy.diaNegocio, publicado: true,
      version: semana.version, publicadoEn: semana.publicado_en,
      turnos: filas.map((f) => ({
        dia: f.dia, tipo: f.tipo, area: f.area, tramo: f.tramo, nota: f.nota,
        inicio: deMinutos(f.inicio_min), fin: f.fin_abierto ? null : deMinutos(f.fin_min),
        finAbierto: !!f.fin_abierto,
        minutos: f.tipo === "turno" ? Number(f.fin_min) - Number(f.inicio_min) : 0,
      })),
    });
  } catch (e) {
    console.error("[mi-cuadrante]:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar tu cuadrante" });
  }
});

// Mi registro de jornada. Se enseña lo FICHADO, no lo planificado, y se dice cuál de los
// dos es cada cosa: es su prueba, y tiene que poder discutirla si no cuadra.
app.get("/api/mi-registro", requireAuth(), async (req, res) => {
  try {
    const yo = await dbGet(`SELECT id, nombre, local FROM users WHERE id = ?`, [req.user.id]);
    if (!yo || !yo.local) return res.json({ ok: true, sinLocal: true, dias: [] });

    const cfg = await dbGet(`SELECT corte_dia_min, dia_inicio_periodo FROM hor_config WHERE local = ?`, [yo.local]);
    const hoy = instanteANegocio(Date.now(), { corteMin: cfg?.corte_dia_min ?? 360 });
    const p = periodoDe(/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dia || "")) ? String(req.query.dia) : hoy.diaNegocio,
      { diaInicio: cfg?.dia_inicio_periodo ?? 1 });

    const [eventos, jornadas, movimientos] = await Promise.all([
      dbAll(`SELECT dia_negocio, tipo, ocurrido_en, origen, motivo, anulado_por FROM fic_eventos
             WHERE worker_id = ? AND dia_negocio BETWEEN ? AND ? ORDER BY dia_negocio, epoch_ms, id`,
        [yo.id, p.desde, p.hasta]),
      dbAll(`SELECT dia_negocio, min_planificado, min_fichado, min_pausa, min_validado, validado_por, validado_en
             FROM fic_jornadas WHERE worker_id = ? AND dia_negocio BETWEEN ? AND ?`, [yo.id, p.desde, p.hasta]),
      dbAll(`SELECT minutos FROM fic_bolsa_movimientos WHERE worker_id = ?`, [yo.id]),
    ]);

    const porDia = new Map();
    for (const j of jornadas) porDia.set(j.dia_negocio, { dia: j.dia_negocio, ...j, eventos: [] });
    for (const e of eventos) {
      if (!porDia.has(e.dia_negocio)) porDia.set(e.dia_negocio, { dia: e.dia_negocio, eventos: [] });
      porDia.get(e.dia_negocio).eventos.push({
        tipo: e.tipo, hora: String(e.ocurrido_en).slice(11, 16),
        // Se dice cuáles metió una persona a mano y por qué: es la parte que puede querer
        // discutir, y esconderla sería justo lo contrario de ponerlo a su disposición.
        aMano: e.origen === "manual", motivo: e.motivo, anulado: !!e.anulado_por,
      });
    }
    const dias = [...porDia.values()]
      .map((d) => ({
        dia: d.dia,
        minPlanificado: d.min_planificado ?? null,
        minFichado: d.min_fichado ?? null,
        minValidado: d.min_validado ?? null,
        validadoPor: d.validado_por || null,
        eventos: d.eventos,
      }))
      .sort((a, b) => b.dia.localeCompare(a.dia));

    res.json({
      ok: true, local: yo.local, periodo: p, dias,
      totalFichado: dias.reduce((s, d) => s + (d.minFichado || 0), 0),
      totalValidado: dias.reduce((s, d) => s + (d.minValidado || 0), 0),
      saldoBolsa: saldoDe(movimientos),
    });
  } catch (e) {
    console.error("[mi-registro]:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar tu registro" });
  }
});

// Su propio registro en CSV, con el mismo formato que el que se entrega a la Inspección.
app.get("/api/mi-registro/csv", requireAuth(), async (req, res) => {
  try {
    const yo = await dbGet(`SELECT id, nombre, dni, local FROM users WHERE id = ?`, [req.user.id]);
    if (!yo) return res.status(404).json({ ok: false, error: "No encontrado" });
    const cfg = await dbGet(`SELECT corte_dia_min, dia_inicio_periodo FROM hor_config WHERE local = ?`, [yo.local]);
    const hoy = instanteANegocio(Date.now(), { corteMin: cfg?.corte_dia_min ?? 360 });
    const p = periodoDe(/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dia || "")) ? String(req.query.dia) : hoy.diaNegocio,
      { diaInicio: cfg?.dia_inicio_periodo ?? 1 });

    const eventos = await dbAll(
      `SELECT dia_negocio, tipo, ocurrido_en, origen, autor, motivo, anulado_por FROM fic_eventos
       WHERE worker_id = ? AND dia_negocio BETWEEN ? AND ? ORDER BY dia_negocio, epoch_ms, id`,
      [yo.id, p.desde, p.hasta]);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nombreFicheroRegistro(yo.nombre || "mi-registro", p.etiqueta)}"`);
    res.send(construirCsv(eventos.map((e) => ({ ...e, nombre: yo.nombre, dni: yo.dni }))));
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo generar tu registro" }); }
});

// ════════════════════════ CAMBIOS DE MI HORARIO ════════════════════════
// Publicar una versión nueva ya dejaba constancia de todo; lo que faltaba era que la persona a
// la que le cambia el turno se entere. El PDF del grupo decía «⚠️ Es la versión 2» y nada más:
// ni qué cambió, ni a quién le afectaba.
//
// `Entendido` NO decide nada. El horario es oficial desde que se publica, lo pulse o no lo
// pulse nadie. Solo deja constancia de que lo vio.

/** Sus cambios: lo que tiene sin ver y lo último que ya confirmó. */
app.get("/api/mi-horario/cambios", requireAuth(), async (req, res) => {
  try {
    const filas = await dbAll(
      `SELECT id, lunes, version_anterior, version_nueva, diff, publicado_en, entendido_en
         FROM hor_cambios_comunicados WHERE worker_id = ?
        ORDER BY publicado_en DESC, id DESC LIMIT 40`, [req.user.id]);
    const pinta = (f) => {
      let d = {};
      try { d = JSON.parse(f.diff); } catch { /* una fila ilegible no puede tumbar la pantalla */ }
      return {
        id: f.id, lunes: f.lunes, versionAnterior: f.version_anterior, versionNueva: f.version_nueva,
        publicadoEn: f.publicado_en, entendidoEn: f.entendido_en,
        dias: Array.isArray(d.dias) ? d.dias : [],
      };
    };
    const todos = filas.map(pinta);
    res.json({
      ok: true,
      // Lo que tiene que mirar, de lo más reciente a lo más antiguo. Una comunicación vieja sin
      // confirmar NO se borra ni se da por vista: se enseña detrás de la última.
      pendientes: todos.filter((f) => !f.entendidoEn),
      confirmados: todos.filter((f) => f.entendidoEn).slice(0, 10),
    });
  } catch (e) {
    console.error("[mi-horario] cambios:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron cargar los cambios" });
  }
});

/**
 * «Entendido». Registra que lo vio, y nada más.
 *
 * NO publica, no valida, no toca asignaciones, ni el snapshot, ni fichajes, ni la bolsa.
 *
 * El `worker_id` sale del token y la condición `entendido_en IS NULL` va DENTRO del UPDATE:
 * dos pestañas del mismo móvil pulsando a la vez escriben una sola confirmación, y la segunda
 * lo sabe porque no vuelve ninguna fila. Confirmar la V2 no confirma la V3: son filas
 * distintas y cada una lleva su propio diff congelado.
 */
app.post("/api/mi-horario/cambios/:id/entendido", requireAuth(), async (req, res) => {
  try {
    const fila = await dbRun(
      `UPDATE hor_cambios_comunicados SET entendido_en = ?, entendido_por = ?
        WHERE id = ? AND worker_id = ? AND entendido_en IS NULL
        RETURNING id, entendido_en`,
      [isoConOffset(Date.now()), req.user.username, Number(req.params.id) || 0, req.user.id]);
    if (!fila) {
      const y = await dbGet(`SELECT worker_id, entendido_en FROM hor_cambios_comunicados WHERE id = ?`,
        [Number(req.params.id) || 0]);
      if (!y || Number(y.worker_id) !== Number(req.user.id)) return res.status(404).json({ ok: false, error: "No encontrado" });
      // Ya estaba confirmado: pulsar dos veces no es un error, es un dedo.
      return res.json({ ok: true, entendidoEn: y.entendido_en, repetido: true });
    }
    res.json({ ok: true, entendidoEn: fila.entendido_en });
  } catch (e) {
    console.error("[mi-horario] entendido:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo registrar" });
  }
});

// ════════════════════════ MIS AUSENCIAS Y MI DISPONIBILIDAD ════════════════════════
// Los dos circuitos que el backend ya entendía a medias: `hor_ausencias` llevaba desde el
// principio bloqueando la planificación cuando estaba aprobada, y `hor_disponibilidad` la leía
// el generador. Lo que no existía era la puerta por la que entra el trabajador.

/** Sus ausencias. Solo las suyas, y sin las notas internas de nadie. */
app.get("/api/mis-ausencias", requireAuth(), async (req, res) => {
  try {
    const filas = await dbAll(
      `SELECT * FROM hor_ausencias WHERE worker_id = ? ORDER BY desde DESC, id DESC LIMIT 100`, [req.user.id]);
    res.json({ ok: true, data: filas.map(paraTrabajador), tipos: TIPOS_SOLICITABLES.map((t) => ({ valor: t, etiqueta: ETIQUETA_TIPO[t] })) });
  } catch (e) {
    console.error("[mis-ausencias]:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron cargar tus ausencias" });
  }
});

/**
 * Pedir una ausencia. Nace `pendiente` y `solicitada`.
 *
 * `worker_id` sale del TOKEN, nunca del cuerpo: si viniera de fuera, cualquiera podría pedir
 * vacaciones en nombre de otro.
 */
app.post("/api/mis-ausencias", requireAuth(), async (req, res) => {
  try {
    const yo = await dbGet(`SELECT id, nombre, local, rol, activo, fecha_alta, fecha_baja FROM users WHERE id = ?`, [req.user.id]);
    if (!yo || !yo.local) return res.status(400).json({ ok: false, error: "Tu cuenta no tiene establecimiento asignado. Díselo a tu responsable." });

    const v = sanearSolicitud(req.body || {}, { hoy: hoyISO() });
    if (v.error) return res.status(400).json({ ok: false, error: v.error });

    // Pedir las mismas fechas dos veces no es un error del sistema, es un despiste: se dice.
    const suyas = await dbAll(`SELECT id, desde, hasta, estado, tipo FROM hor_ausencias WHERE worker_id = ?`, [yo.id]);
    const choques = solapesVivos({ id: null, desde: v.desde, hasta: v.hasta }, suyas);
    if (choques.length) {
      const c = choques[0];
      return res.status(409).json({ ok: false,
        error: `Ya tienes una ausencia ${c.estado === "pendiente" ? "pedida" : "aprobada"} del ${c.desde} al ${c.hasta}.` });
    }

    const ahora = isoConOffset(Date.now());
    const fila = await dbRun(
      `INSERT INTO hor_ausencias (worker_id, local, tipo, desde, hasta, estado, origen,
                                  comentario, solicitado_por, solicitado_en, autor, creado_en)
       VALUES (?,?,?,?,?,'pendiente','solicitada',?,?,?,?,?) RETURNING *`,
      [yo.id, yo.local, v.tipo, v.desde, v.hasta, v.comentario, req.user.username, ahora, req.user.username, ahora]);
    await ficAuditar("ausencia", fila.id, "solicitar", req.user.username,
      { local: yo.local, workerId: yo.id, detalle: { tipo: v.tipo, desde: v.desde, hasta: v.hasta, dias: v.dias } });

    res.json({ ok: true, ausencia: paraTrabajador(fila), mensaje: "Solicitud enviada. Tu responsable la verá en su panel." });
  } catch (e) {
    console.error("[mis-ausencias] crear:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo enviar la solicitud" });
  }
});

/**
 * Cancelar la suya, solo mientras siga pendiente. NUNCA se borra: se queda como `cancelada`
 * con quién y cuándo, porque «lo pedí y me arrepentí» también es parte de la historia.
 */
app.post("/api/mis-ausencias/:id/cancelar", requireAuth(), async (req, res) => {
  try {
    // La condición va DENTRO del UPDATE: si otro la acaba de aprobar, no hay carrera que valga.
    const fila = await dbRun(
      `UPDATE hor_ausencias SET estado = 'cancelada', cancelado_por = ?, cancelado_en = ?
        WHERE id = ? AND worker_id = ? AND estado = 'pendiente' AND origen = 'solicitada'
        RETURNING *`,
      [req.user.username, isoConOffset(Date.now()), Number(req.params.id) || 0, req.user.id]);
    if (!fila) {
      const a = await dbGet(`SELECT estado, worker_id FROM hor_ausencias WHERE id = ?`, [Number(req.params.id) || 0]);
      if (!a || Number(a.worker_id) !== Number(req.user.id)) return res.status(404).json({ ok: false, error: "No encontrada" });
      return res.status(409).json({ ok: false,
        error: a.estado === "aprobada"
          ? "Ya te la han aprobado. Para deshacerla, háblalo con tu responsable: el cuadrante ya cuenta con ella."
          : `Esa solicitud ya está ${a.estado}.` });
    }
    await ficAuditar("ausencia", fila.id, "cancelar_propia", req.user.username,
      { local: fila.local, workerId: req.user.id, detalle: { desde: fila.desde, hasta: fila.hasta } });
    res.json({ ok: true, ausencia: paraTrabajador(fila), mensaje: "Solicitud cancelada." });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo cancelar" }); }
});

/** Su disponibilidad declarada. */
app.get("/api/mi-disponibilidad", requireAuth(), async (req, res) => {
  try {
    const filas = await dbAll(
      `SELECT id, dow, inicio_min, fin_min, preferencia, origen, autor, actualizado_en
         FROM hor_disponibilidad WHERE worker_id = ? ORDER BY dow, inicio_min`, [req.user.id]);
    res.json({ ok: true, data: filas });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo cargar tu disponibilidad" }); }
});

/**
 * Guardar la suya. Entera, como la de Horarios: es una rejilla de siete días y guardarla día a
 * día dejaría media semana escrita si se cae la conexión.
 *
 * `disponible` NO se guarda: es el valor por defecto y ocupar una fila por cada día en que
 * alguien puede trabajar llenaría la tabla de nada.
 */
app.put("/api/mi-disponibilidad", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const franjas = Array.isArray(req.body?.franjas) ? req.body.franjas.slice(0, 40) : [];
    await client.query("BEGIN");
    const q = (sql, p = []) => client.query(toPositional(sql), p);
    await q(`DELETE FROM hor_disponibilidad WHERE worker_id = ?`, [req.user.id]);
    const ahora = isoConOffset(Date.now());
    let n = 0;
    for (const f of franjas) {
      const dow = Number(f.dow);
      if (!(dow >= 0 && dow <= 6)) continue;
      if (!["prefiere", "no_disponible"].includes(f.preferencia)) continue;
      const ini = Number.isFinite(Number(f.inicio_min)) ? Math.max(0, Math.round(Number(f.inicio_min))) : 0;
      const fin = Number.isFinite(Number(f.fin_min)) ? Math.min(2160, Math.round(Number(f.fin_min))) : 1560;
      if (fin <= ini) continue;
      await q(`INSERT INTO hor_disponibilidad (worker_id, dow, inicio_min, fin_min, preferencia, origen, autor, creado_en, actualizado_en)
               VALUES (?,?,?,?,?, 'trabajador', ?, ?, ?)`,
        [req.user.id, dow, ini, fin, f.preferencia, req.user.username, ahora, ahora]);
      n++;
    }
    await client.query("COMMIT");
    await ficAuditar("disponibilidad", req.user.id, "guardar_propia", req.user.username,
      { workerId: req.user.id, detalle: { franjas: n } }).catch(() => {});
    res.json({ ok: true, guardadas: n, mensaje: "Disponibilidad guardada." });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[mi-disponibilidad]:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar" });
  } finally { client.release(); }
});

// ════════════════════════ PULSO ANÓNIMO DEL EQUIPO ════════════════════════
// Ver el comentario del esquema (initDB) y src/modules/rrhh/pulso.js: las respuestas y
// las invitaciones viven en tablas que nunca se cruzan, y el k-anonimato se aplica AQUÍ,
// en el servidor, no en el panel.
const PULSO_VERSION = 1;
const PULSO_PREGUNTAS = [
  { key: "p1", texto: "¿Cómo has estado este mes en el trabajo?", min: "Muy mal", max: "Muy bien", obligatoria: true },
  { key: "p2", texto: "¿Te has sentido escuchado y apoyado por tu responsable?", min: "Nada", max: "Mucho", obligatoria: true },
  { key: "p3", texto: "¿Recomendarías a un amigo trabajar aquí?", min: "No", max: "Sin duda", obligatoria: false },
];
// Van fijas en código, NO en hr_preguntas_mes (que es editable cada mes): cambiar las
// preguntas rompería la serie temporal, que es justo lo que se quiere mirar.

const pulsoHash = (t) => crypto.createHash("sha256").update(String(t || "")).digest("hex");
const pulsoToken = () => generarToken((n) => crypto.randomBytes(n));

// Antiabuso sencillo, sin dependencias nuevas (mismo patrón que el debounce de WhatsApp).
const _pulsoHits = new Map();
function pulsoRateLimit(req, res, max) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?";
  const clave = String(ip).split(",")[0].trim() + ":" + req.method;
  const ahora = Date.now();
  const reg = _pulsoHits.get(clave) || { n: 0, desde: ahora };
  if (ahora - reg.desde > 60000) { reg.n = 0; reg.desde = ahora; }
  reg.n += 1; _pulsoHits.set(clave, reg);
  if (_pulsoHits.size > 5000) _pulsoHits.clear(); // techo de memoria
  if (reg.n > max) { res.status(429).json({ ok: false, error: "Demasiadas peticiones, espera un minuto" }); return false; }
  return true;
}

// Público: el trabajador abre el enlace. NO devuelve nombre ni local — solo si vale o no.
app.get("/api/pulso/:token", async (req, res) => {
  if (!pulsoRateLimit(req, res, 20)) return;
  try {
    const inv = await dbGet(
      `SELECT mes, caduca_en, usado FROM pulso_invitaciones WHERE token_hash = ?`,
      [pulsoHash(req.params.token)]
    );
    if (!inv) return res.status(404).json({ ok: false, error: "Este enlace no es válido." });
    const hoy = hoyISO();
    if (inv.usado) return res.status(410).json({ ok: false, error: "Ya has contestado este mes. ¡Gracias!" });
    // El enlace NO caduca. `caduca_en` es hasta cuándo se insiste con los recordatorios, no
    // hasta cuándo vale: quien estaba de vacaciones esos días es justo de quien más falta hace
    // saber cómo está. Se avisa de que el mes ya se cerró, pero se deja contestar.
    res.json({ ok: true, mes: inv.mes, version: PULSO_VERSION, preguntas: PULSO_PREGUNTAS,
      fueraDePlazo: inv.caduca_en < hoy });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo abrir el formulario" }); }
});

// Público: guarda la respuesta. La invitación se marca usada y la respuesta se escribe en
// la OTRA tabla, sin nada que las enlace. Va en transacción para que no pueda pasar una
// cosa sin la otra (dbRun no soporta transacciones: aquí sí se coge un cliente del pool).
app.post("/api/pulso/:token", async (req, res) => {
  if (!pulsoRateLimit(req, res, 5)) return;
  const num1a5 = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };
  const p1 = num1a5(req.body?.p1), p2 = num1a5(req.body?.p2);
  const p3 = req.body?.p3 == null || req.body?.p3 === "" ? null : num1a5(req.body.p3);
  if (!p1 || !p2) return res.status(400).json({ ok: false, error: "Faltan las dos primeras respuestas" });
  if (req.body?.p3 && p3 === null) return res.status(400).json({ ok: false, error: "Respuesta no válida" });
  const comentario = String(req.body?.comentario || "").trim().slice(0, 2000) || null;
  const idioma = ["es", "ca", "en"].includes(req.body?.idioma) ? req.body.idioma : "es";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = (sql, p = []) => client.query(toPositional(sql), p);
    // Bloqueamos la invitación para que dos envíos simultáneos no cuelen dos respuestas.
    const inv = (await q(
      `SELECT id, mes, local, caduca_en, usado FROM pulso_invitaciones WHERE token_hash = ? FOR UPDATE`,
      [pulsoHash(req.params.token)]
    )).rows[0];
    const hoy = hoyISO();
    if (!inv) { await client.query("ROLLBACK"); return res.status(404).json({ ok: false, error: "Este enlace no es válido." }); }
    if (inv.usado) { await client.query("ROLLBACK"); return res.status(410).json({ ok: false, error: "Ya has contestado este mes. ¡Gracias!" }); }
    // Sin comprobar el plazo: una respuesta que llega tarde cuenta para SU mes, que es de lo
    // que hablaba. Un mes ya mirado puede ganar una respuesta más — eso lo completa, no lo
    // estropea. Y NO se marca cuál llegó tarde: en un equipo pequeño, «esta llegó fuera de
    // plazo» puede señalar a quien estuvo de baja, y estas respuestas son anónimas.

    await q(`UPDATE pulso_invitaciones SET usado = 1 WHERE id = ?`, [inv.id]);
    await q(
      `INSERT INTO pulso_respuestas (mes, local, version, p1, p2, p3, comentario, idioma) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [inv.mes, inv.local || "—", PULSO_VERSION, p1, p2, p3, comentario, idioma]
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* ya estaba deshecha */ }
    console.error("[pulso] Error guardando respuesta:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar. Inténtalo de nuevo." });
  } finally {
    client.release();
  }
});

// Público: «quiero que hablemos». Es la ÚNICA parte del formulario que lleva nombre, y la
// persona la marca a sabiendas. Va aparte del envío de la encuesta y NO consume el token:
// pedir hablar y contestar son independientes, y quien pide hablar sin contestar debe
// seguir pudiendo contestar después (y seguir contando como pendiente en los recordatorios).
app.post("/api/pulso/:token/contacto", async (req, res) => {
  if (!pulsoRateLimit(req, res, 5)) return;
  const conQuien = ["direccion", "rrhh", "encargado"].includes(req.body?.con_quien) ? req.body.con_quien : "direccion";
  const mensaje = String(req.body?.mensaje || "").trim().slice(0, 2000) || null;
  try {
    const inv = await dbGet(
      `SELECT i.id, i.mes, i.local, i.caduca_en, i.worker_id, u.nombre
       FROM pulso_invitaciones i JOIN users u ON u.id = i.worker_id
       WHERE i.token_hash = ?`, [pulsoHash(req.params.token)]
    );
    if (!inv) return res.status(404).json({ ok: false, error: "Este enlace no es válido." });
    const hoy = hoyISO();

    // Una petición por persona y mes: si insiste, se actualiza el mensaje en vez de duplicar.
    const previa = await dbGet(`SELECT id FROM pulso_contactos WHERE worker_id = ? AND mes = ? AND atendido = 0`, [inv.worker_id, inv.mes]);
    if (previa) {
      await dbRun(`UPDATE pulso_contactos SET con_quien = ?, mensaje = ?, creado_en = ? WHERE id = ?`,
        [conQuien, mensaje, new Date().toISOString(), previa.id]);
    } else {
      await dbRun(
        `INSERT INTO pulso_contactos (mes, worker_id, nombre, local, con_quien, mensaje) VALUES (?, ?, ?, ?, ?, ?)`,
        [inv.mes, inv.worker_id, inv.nombre, inv.local, conQuien, mensaje]
      );
    }
    res.json({ ok: true });
    avisarPeticionHablar().catch(() => {});
  } catch (e) {
    console.error("[pulso] contacto:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo enviar. Inténtalo de nuevo." });
  }
});

// Aviso inmediato a dirección, SIN NOMBRE. El nombre vive en el panel, no en el WhatsApp
// del móvil personal: por la pantalla de bloqueo pasa mucha gente.
async function avisarPeticionHablar() {
  try {
    const tel = await getConfig("pulso_aviso_telefono");
    if (!tel || !isReady()) return;
    await sendMensajeLibre(tel, "Alguien del equipo ha pedido hablar contigo.\n\nEstá en el panel → RR. HH. → Pulso del equipo.");
  } catch (e) { console.error("[pulso] aviso:", e.message); }
}

// ── Panel: solo dirección y RR.HH. ────────────────────────────────────────
// El ENCARGADO no entra: la pregunta 2 va sobre él, y en un local pequeño ver la media
// de su equipo es leer las respuestas de su gente. Si el equipo sospecha que su jefe
// directo lo verá, no contesta con sinceridad y el dato no vale nada.
const PULSO_ROLES = ["direccion", "rrhh"];
const mesValido = (m) => (/^\d{4}-\d{2}$/.test(String(m || "")) ? m : null);

// Agregados. AQUÍ se aplica el k-anonimato, no en el panel: un frontend manipulado no
// puede sacar más de lo que devuelva esto.
app.get("/api/rrhh/pulso/resumen", requireAuth(PULSO_ROLES), async (req, res) => {
  try {
    const mes = mesValido(req.query.mes) || mesAnterior(new Date().toISOString().slice(0, 7));
    const meses = ultimosMeses(mes, 12);
    // Solo columnas públicas: ni worker, ni token, ni fecha (no existen en esta tabla).
    const filas = await dbAll(
      `SELECT mes, local, p1, p2, p3, comentario FROM pulso_respuestas WHERE mes = ANY(?::text[])`,
      [meses]
    );
    const delMes = filas.filter((f) => f.mes === mes);
    const agregado = agregarPorLocal(delMes);
    const comentarios = puedeMostrarComentarios(delMes.length)
      ? barajar(delMes.map((f) => f.comentario).filter((c) => c && c.trim()))
      : [];
    res.json({
      ok: true, mes, preguntas: PULSO_PREGUNTAS,
      ...agregado,
      comentarios,
      serie: serieMensual(filas, meses),
    });
  } catch (e) {
    console.error("[pulso] resumen:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar el pulso" });
  }
});

// Participación: QUIÉN ha contestado. Endpoint aparte a propósito — dos tablas, dos
// endpoints, ningún sitio de la API donde se puedan cruzar.
app.get("/api/rrhh/pulso/participacion", requireAuth(PULSO_ROLES), async (req, res) => {
  try {
    const mes = mesValido(req.query.mes) || mesAnterior(new Date().toISOString().slice(0, 7));
    const filas = await dbAll(
      `SELECT i.usado, i.enviado_en, u.nombre, u.local
       FROM pulso_invitaciones i JOIN users u ON u.id = i.worker_id
       WHERE i.mes = ? ORDER BY u.local, u.nombre`, [mes]
    );
    res.json({
      ok: true, mes,
      invitados: filas.length,
      respondidos: filas.filter((f) => f.usado).length,
      pendientes: filas.filter((f) => !f.usado).map((f) => ({ nombre: f.nombre, local: f.local, enviado: !!f.enviado_en })),
    });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo cargar la participación" }); }
});

// Peticiones de hablar. Es la única lista del pulso con nombres, y es legítima: la persona
// los dio a propósito. No lleva NADA de sus respuestas.
app.get("/api/rrhh/pulso/contactos", requireAuth(PULSO_ROLES), async (req, res) => {
  try {
    const soloPendientes = String(req.query.pendientes || "") === "1";
    const filas = await dbAll(
      `SELECT id, mes, nombre, local, con_quien, mensaje, atendido, atendido_por, atendido_en, creado_en
       FROM pulso_contactos ${soloPendientes ? "WHERE atendido = 0" : ""}
       ORDER BY atendido ASC, creado_en DESC LIMIT 100`
    );
    res.json({ ok: true, data: filas, pendientes: filas.filter((f) => !f.atendido).length });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudieron cargar las peticiones" }); }
});

app.put("/api/rrhh/pulso/contacto/:id", requireAuth(PULSO_ROLES), async (req, res) => {
  try {
    await dbRun(`UPDATE pulso_contactos SET atendido = 1, atendido_por = ?, atendido_en = ? WHERE id = ?`,
      [req.user.nombre || req.user.username, new Date().toISOString(), req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo marcar" }); }
});

// Configuración del pulso. Solo dirección: decide si se manda solo, qué día y el tope.
const PULSO_CONFIG = ["pulso_auto", "pulso_dia", "pulso_base_url", "pulso_aviso_telefono", "wa_max_diario"];
app.get("/api/rrhh/pulso/config", requireAuth(["direccion"]), async (req, res) => {
  try {
    const out = {};
    for (const k of PULSO_CONFIG) out[k] = await getConfig(k);
    const hoy = hoyISO();
    out.enviados_hoy = Number((await getConfig("wa_enviados_" + hoy)) || 0);
    res.json({ ok: true, data: out });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo cargar la configuración" }); }
});
app.put("/api/rrhh/pulso/config", requireAuth(["direccion"]), async (req, res) => {
  try {
    for (const k of PULSO_CONFIG) {
      if (req.body[k] === undefined) continue;
      await setConfig(k, String(req.body[k] ?? "").trim());
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo guardar" }); }
});

// El trabajador pide su propio enlace desde su espacio (perdió el WhatsApp, lo borró…).
// Rota el token: el anterior deja de valer, y el que se devuelve solo se ve una vez.
app.post("/api/pulso/mi-enlace", requireAuth(), async (req, res) => {
  try {
    const mes = mesAnterior(new Date().toISOString().slice(0, 7));
    const inv = await dbGet(`SELECT id, usado, caduca_en FROM pulso_invitaciones WHERE worker_id = ? AND mes = ?`, [req.user.id, mes]);
    if (!inv) return res.status(404).json({ ok: false, error: "Este mes todavía no hay ninguna encuesta para ti." });
    if (inv.usado) return res.status(410).json({ ok: false, error: "Ya has contestado este mes. ¡Gracias!" });
    const token = pulsoToken();
    await dbRun(`UPDATE pulso_invitaciones SET token_hash = ? WHERE id = ?`, [pulsoHash(token), inv.id]);
    const base = (await getConfig("pulso_base_url")) || process.env.PUBLIC_URL || "";
    res.json({ ok: true, mes, url: `${String(base).replace(/\/+$/, "")}/pulso.html?t=${token}` });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo generar el enlace" }); }
});

// Genera las invitaciones del mes y las manda por WhatsApp. Solo dirección.
app.post("/api/rrhh/pulso/enviar", requireAuth(["direccion"]), async (req, res) => {
  try {
    const mes = mesValido(req.body?.mes) || mesAnterior(new Date().toISOString().slice(0, 7));
    const caduca = finDePlazo(mes);
    const equipo = await dbAll(
      `SELECT id, nombre, local, telefono FROM users
       WHERE rol IN ('trabajador','encargado') AND COALESCE(activo,1) = 1 AND fecha_baja IS NULL`
    );
    const conTel = equipo.filter((w) => String(w.telefono || "").replace(/\D/g, "").length >= 9);
    const sinTel = equipo.filter((w) => !conTel.includes(w));
    const nuevos = [];
    for (const w of conTel) {
      const token = pulsoToken();
      const r = await dbRun(
        `INSERT INTO pulso_invitaciones (worker_id, mes, local, token_hash, caduca_en)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT (worker_id, mes) DO NOTHING RETURNING id`,
        [w.id, mes, w.local || null, pulsoHash(token), caduca]
      );
      if (r && r.id) nuevos.push({ ...w, token, invitacionId: r.id });
    }
    // Respondemos ya: el envío por WhatsApp puede tardar (jitter entre mensajes).
    res.json({
      ok: true, mes, generadas: nuevos.length,
      yaTenian: conTel.length - nuevos.length,
      sinTelefono: sinTel.map((w) => ({ nombre: w.nombre, local: w.local })),
    });
    enviarPulsoLote(nuevos, mes).catch((e) => console.error("[pulso] envío:", e.message));
  } catch (e) {
    console.error("[pulso] enviar:", e.message);
    res.status(500).json({ ok: false, error: "No se pudieron generar las invitaciones" });
  }
});

// Crea las invitaciones que falten para un mes. Idempotente por (worker_id, mes).
// Devuelve cuántas se crearon nuevas.
async function asegurarInvitacionesPulso(mes) {
  const caduca = caducidadMes(mes);
  const equipo = await dbAll(
    `SELECT id, local, telefono FROM users
     WHERE rol IN ('trabajador','encargado') AND COALESCE(activo,1) = 1 AND fecha_baja IS NULL
       AND LENGTH(regexp_replace(COALESCE(telefono,''), '[^0-9]', '', 'g')) >= 9`
  );
  let n = 0;
  for (const w of equipo) {
    const r = await dbRun(
      `INSERT INTO pulso_invitaciones (worker_id, mes, local, token_hash, caduca_en)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT (worker_id, mes) DO NOTHING RETURNING id`,
      [w.id, mes, w.local || null, pulsoHash(pulsoTokenTmp(w.id, mes)), caduca]
    );
    if (r && r.id) n += 1;
  }
  return n;
}
// El token en claro solo existe en el momento de enviarlo. Para las invitaciones creadas
// por el job, se genera aquí y se guarda su hash; si el envío falla, se regenera al
// reintentar (ver despacharPulsoPendientes), porque el token en claro ya no está.
const _pulsoPendientesToken = new Map();
function pulsoTokenTmp(workerId, mes) {
  const t = pulsoToken();
  _pulsoPendientesToken.set(`${workerId}:${mes}`, t);
  return t;
}

// Manda las invitaciones que aún no han salido. Se llama en cada tick: si WhatsApp estaba
// caído, se recupera solo. Rota el token al reenviar (el anterior no se guardó en claro).
async function despacharPulsoPendientes() {
  const hoy = hoyISO();
  const pendientes = await dbAll(
    `SELECT i.id, i.worker_id, i.mes, u.nombre, u.telefono
     FROM pulso_invitaciones i JOIN users u ON u.id = i.worker_id
     WHERE i.enviado_en IS NULL AND i.usado = 0 AND i.caduca_en >= ?
       AND LENGTH(regexp_replace(COALESCE(u.telefono,''), '[^0-9]', '', 'g')) >= 9
     ORDER BY i.id LIMIT 200`, [hoy]
  );
  if (!pendientes.length) return;

  // Antes de nada: si hay una campaña de marketing programada para hoy, esperamos. Dos
  // ráfagas el mismo día desde el mismo número es justo lo que dispara un baneo.
  const hayCampana = await dbGet(
    `SELECT id FROM campanas_wa WHERE estado = 'programada' AND programada_para LIKE ? LIMIT 1`, [hoy + "%"]
  );
  if (hayCampana) { console.log("[pulso] Hay una campaña programada hoy: pospongo el envío"); return; }

  // TOPE DIARIO REAL. `dividirPorTope` existía, estaba testeada e importada... y no se
  // llamaba desde ningún sitio: hasta ahora no había ningún límite de mensajes al día.
  const yaHoy = Number((await getConfig("wa_enviados_" + hoy)) || 0);
  const maxDiario = Number(await getConfig("wa_max_diario")) || 40;
  const { aEnviar, pospuestos } = dividirPorTope(pendientes, { maxDiario, yaEnviadosHoy: yaHoy });
  if (pospuestos.length) console.log(`[pulso] Tope diario (${maxDiario}): ${pospuestos.length} se quedan para mañana`);
  if (!aEnviar.length) return;

  const lote = aEnviar.map((p) => {
    const clave = `${p.worker_id}:${p.mes}`;
    let token = _pulsoPendientesToken.get(clave);
    if (!token) token = null; // se regenera abajo
    return { ...p, invitacionId: p.id, token };
  });
  for (const inv of lote) {
    if (!inv.token) {
      // Token perdido (reinicio del proceso): generamos uno nuevo y actualizamos el hash.
      inv.token = pulsoToken();
      await dbRun(`UPDATE pulso_invitaciones SET token_hash = ? WHERE id = ?`, [pulsoHash(inv.token), inv.invitacionId]);
    }
    _pulsoPendientesToken.delete(`${inv.worker_id}:${inv.mes}`);
  }
  await enviarPulsoLote(lote, lote[0].mes);
}

// Envío propio, NO enviarLoteWA: ese escribe en campana_envios (marketing) y meter ahí los
// teléfonos del equipo sería mezclar RR.HH. con la base de clientes.
async function enviarPulsoLote(invitaciones, mes) {
  if (!invitaciones.length) return;
  const base = (await getConfig("pulso_base_url")) || process.env.PUBLIC_URL || "https://familiadelamor.org";
  const nombreMes = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" })
    .format(new Date(mes + "-15T12:00:00Z"));
  for (const inv of invitaciones) {
    const url = `${String(base).replace(/\/+$/, "")}/pulso.html?t=${inv.token}`;
    const texto = `Hola ${String(inv.nombre || "").split(" ")[0]} 👋\n\n`
      + `¿Cómo ha ido ${nombreMes}? Son dos preguntas y menos de un minuto.\n\n`
      + `${url}\n\n`
      + `Es anónimo: sabemos que has contestado, para no darte la lata con recordatorios, `
      + `pero no sabemos qué has contestado.\n\n`
      + `No respondas a este mensaje, usa el enlace.`;
    try {
      if (!isReady()) throw new Error("WhatsApp no conectado");
      await sendMensajeLibre(inv.telefono, texto);
      await contarEnvioWA();
      await dbRun(`UPDATE pulso_invitaciones SET enviado_en = ?, enviado_error = NULL WHERE id = ?`, [new Date().toISOString(), inv.invitacionId]);
    } catch (e) {
      await dbRun(`UPDATE pulso_invitaciones SET enviado_error = ? WHERE id = ?`, [String(e.message).slice(0, 200), inv.invitacionId]);
    }
    await new Promise((r) => setTimeout(r, delayConJitter()));
  }
}

app.get("/api/rrhh/trabajador/:id/notas", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const wl = await rrhhWorkerLocal(req.params.id);
    if (wl === null) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    if (!rrhhPuedeLocal(req, wl)) return res.status(403).json({ ok: false, error: "Sin acceso a este trabajador" });
    const rows = await dbAll(
      `SELECT * FROM hr_worker_notes WHERE worker_id = ? ORDER BY creado_en DESC`,
      [req.params.id]
    );
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/rrhh/trabajador/:id/nota", requireAuth(RRHH_ROLES), async (req, res) => {
  const { tipo = "nota", contenido, autor } = req.body;
  if (!contenido) return res.status(400).json({ ok: false, error: "Falta contenido" });
  try {
    const wl = await rrhhWorkerLocal(req.params.id);
    if (wl === null) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    if (!rrhhPuedeLocal(req, wl)) return res.status(403).json({ ok: false, error: "Sin acceso a este trabajador" });
    const row = await dbRun(
      `INSERT INTO hr_worker_notes (worker_id, tipo, contenido, autor, creado_en) VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [req.params.id, tipo, contenido, autor || null, new Date().toISOString()]
    );
    res.json({ ok: true, id: row.id });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.delete("/api/rrhh/nota/:id", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const nota = await dbGet(`SELECT worker_id FROM hr_worker_notes WHERE id = ?`, [req.params.id]);
    if (!nota) return res.json({ ok: true });
    const wl = await rrhhWorkerLocal(nota.worker_id);
    if (!rrhhPuedeLocal(req, wl)) return res.status(403).json({ ok: false, error: "Sin acceso a esta nota" });
    await dbRun(`DELETE FROM hr_worker_notes WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.get("/api/rrhh/preguntas/:mes", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT * FROM hr_preguntas_mes WHERE mes = ? ORDER BY orden ASC`,
      [req.params.mes]
    );
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.put("/api/rrhh/preguntas/:mes", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  const { preguntas } = req.body;
  if (!Array.isArray(preguntas)) return res.status(400).json({ ok: false });
  const mes = req.params.mes;
  try {
    await dbRun(`DELETE FROM hr_preguntas_mes WHERE mes = ?`, [mes]);
    if (!preguntas.length) return res.json({ ok: true });
    for (let i = 0; i < preguntas.length; i++) {
      await dbRun(`INSERT INTO hr_preguntas_mes (mes, orden, pregunta) VALUES (?, ?, ?)`, [mes, i, preguntas[i]]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.get("/api/rrhh/llamadas/:mes", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const scope = rrhhLocalScope(req);
    const rows = scope
      ? await dbAll(`SELECT l.* FROM hr_llamadas_mes l JOIN users u ON u.id = l.worker_id WHERE l.mes = ? AND u.local = ?`, [req.params.mes, scope])
      : await dbAll(`SELECT * FROM hr_llamadas_mes WHERE mes = ?`, [req.params.mes]);
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/rrhh/llamada", requireAuth(RRHH_ROLES), async (req, res) => {
  const { worker_id, mes, respuestas, comentario_libre, autor } = req.body;
  if (!worker_id || !mes) return res.status(400).json({ ok: false, error: "Faltan datos" });
  const wl = await rrhhWorkerLocal(worker_id);
  if (wl === null) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
  if (!rrhhPuedeLocal(req, wl)) return res.status(403).json({ ok: false, error: "Sin acceso a este trabajador" });
  const ahora = new Date().toISOString();
  const respJson = respuestas ? JSON.stringify(respuestas) : null;
  try {
    await dbRun(
      `INSERT INTO hr_llamadas_mes (worker_id, mes, realizada, fecha_llamada, respuestas, comentario_libre, autor, creado_en)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)
       ON CONFLICT(worker_id, mes) DO UPDATE SET
         realizada=1, fecha_llamada=EXCLUDED.fecha_llamada,
         respuestas=EXCLUDED.respuestas, comentario_libre=EXCLUDED.comentario_libre,
         autor=EXCLUDED.autor`,
      [worker_id, mes, ahora, respJson, comentario_libre || null, autor || null, ahora]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── RRHH: ficha del trabajador (datos + timeline + documentos) ────────────────
const HR_CAMPOS_DIR = ["telefono", "email", "dni", "puesto", "fecha_nac", "fecha_alta", "fecha_baja", "foto_url", "activo"];
const HR_CAMPOS_ENC = ["telefono", "email", "puesto", "fecha_nac", "foto_url"]; // encargado: sin DNI/alta/baja/activo
function esEncargado(req) { return req.user && req.user.rol === "encargado"; }

// ── Mi perfil: lo único que cada uno puede tocar de SÍ MISMO ────────────────
// El usuario y la contraseña los crea la empresa; aquí el trabajador solo completa
// sus datos de contacto. El teléfono es el que usaremos para escribirle, así que lo
// pone él: ni hay que perseguir 42 números ni se quedan desactualizados.
// La lista es CERRADA a propósito: nadie puede cambiarse el rol, el local ni el alta.
const MI_PERFIL_CAMPOS = ["telefono", "email", "fecha_nac"];

app.get("/api/mi-perfil", requireAuth(), async (req, res) => {
  try {
    const u = await dbGet(
      `SELECT id, username, nombre, rol, local, telefono, email, puesto, fecha_nac, fecha_alta, foto_url, activo
       FROM users WHERE id = ?`, [req.user.id]
    );
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    const hoy = hoyISO();
    // Si tiene PIN y si es el provisional que le dio el encargado. El PIN no sale de la
    // base ni hasheado: solo se dice si existe, para poder ofrecerle cambiarlo.
    const pin = await dbGet(`SELECT pin_hash IS NOT NULL AS tiene, pin_temporal FROM users WHERE id = ?`, [req.user.id])
      .catch(() => null);
    res.json({ ok: true, data: { ...u, antiguedad: rrhhAntiguedad(u.fecha_alta, hoy), editables: MI_PERFIL_CAMPOS, pin } });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo cargar el perfil" }); }
});

app.put("/api/mi-perfil", requireAuth(), async (req, res) => {
  try {
    const sets = [], vals = [];
    for (const k of MI_PERFIL_CAMPOS) {
      if (req.body[k] === undefined) continue;
      let v = req.body[k] === "" ? null : String(req.body[k]).trim();
      if (k === "telefono" && v) {
        const digitos = v.replace(/\D/g, "");
        if (digitos.length < 9) return res.status(400).json({ ok: false, error: "El teléfono no parece correcto" });
      }
      if (k === "fecha_nac" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return res.status(400).json({ ok: false, error: "Fecha de nacimiento inválida" });
      }
      sets.push(`${k} = ?`); vals.push(v);
    }
    if (!sets.length) return res.json({ ok: true });
    vals.push(req.user.id);
    await dbRun(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, vals);
    invalidarInternos(); // el teléfono acaba de cambiar: Sara debe dejar de contestarle
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: "No se pudo guardar" }); }
});

app.get("/api/rrhh/trabajador/:id/ficha", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const w = await dbGet("SELECT id, username, nombre, rol, local, telefono, email, dni, puesto, fecha_nac, fecha_alta, fecha_baja, foto_url, agora_username, activo, pass_temporal, pass_cambiada_en, creado_en FROM users WHERE id = ?", [req.params.id]);
    if (!w) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    if (!rrhhPuedeLocal(req, w.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este trabajador" });
    const notas = await dbAll("SELECT * FROM hr_worker_notes WHERE worker_id = ? ORDER BY creado_en DESC", [w.id]);
    const checkins = await dbAll("SELECT * FROM hr_llamadas_mes WHERE worker_id = ? ORDER BY mes DESC", [w.id]);
    let documentos = (await dbAll("SELECT * FROM hr_documentos WHERE worker_id = ? ORDER BY creado_en DESC", [w.id])).map(docParaPanel);
    // El encargado NO ve DNI ni documentos sensibles (RGPD).
    if (esEncargado(req)) { w.dni = null; documentos = documentos.filter((d) => !(d.sensible === 1 || d.sensible === true)); }
    const hoy = hoyISO();
    res.json({
      ok: true,
      trabajador: w,
      antiguedad: rrhhAntiguedad(w.fecha_alta, hoy),
      timeline: construyeTimeline(notas, checkins, documentos),
      documentos,
      alertasDoc: documentosPorCaducar(documentos, hoy, 30),
      enlazadoAgora: !!w.agora_username,
      // Solo si TIENE PIN y desde cuándo; el PIN en sí no sale de la base ni hasheado.
      pin: await dbGet(
        `SELECT pin_hash IS NOT NULL AS tiene, pin_temporal, pin_actualizado_en, pin_bloqueado_hasta FROM users WHERE id = ?`,
        [w.id]).catch(() => null),
    });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.put("/api/rrhh/trabajador/:id", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const w = await dbGet("SELECT id, local FROM users WHERE id = ?", [req.params.id]);
    if (!w) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    if (!rrhhPuedeLocal(req, w.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este trabajador" });
    const campos = esEncargado(req) ? HR_CAMPOS_ENC : HR_CAMPOS_DIR;
    const sets = [], vals = [];
    for (const c of campos) if (req.body[c] !== undefined) { sets.push(`${c} = ?`); vals.push(req.body[c] === "" ? null : req.body[c]); }
    if (req.body.nombre !== undefined) { sets.push("nombre = ?"); vals.push(String(req.body.nombre).trim()); }
    if (!sets.length) return res.json({ ok: true });
    vals.push(w.id);
    await dbRun(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, vals);
    invalidarInternos(); // el teléfono puede haber cambiado

    // ── Si se le ha dado de baja, ¿le quedan turnos por delante? ────────────────────────
    // NO se borra ninguno. Un turno publicado se mandó al grupo y hay gente organizada con
    // él: quitarlo por detrás sería cambiar en silencio un horario oficial, que es
    // exactamente lo que este módulo nunca hace. Lo que sí se puede hacer es AVISAR, y
    // separar lo que está en un borrador —que se arregla sin consecuencias— de lo que ya se
    // publicó, que necesita una versión nueva.
    const daDeBaja = req.body.fecha_baja !== undefined || req.body.activo !== undefined;
    let avisoTurnos = null;
    if (daDeBaja) {
      const persona = await dbGet("SELECT id, activo, fecha_alta, fecha_baja FROM users WHERE id = ?", [w.id]);
      if (!activoAhora(persona, hoyISO()) || persona.fecha_baja) {
        const futuras = await dbAll(
          `SELECT a.id, a.dia, s.estado, s.lunes FROM hor_asignaciones a
             JOIN hor_semanas s ON s.id = a.semana_id
            WHERE a.worker_id = ? AND s.estado IN ('borrador','publicado') AND a.dia >= ?
            ORDER BY a.dia`,
          [w.id, persona.fecha_baja || hoyISO()]).catch(() => []);
        const r = turnosTrasLaBaja(futuras.map((x) => ({ ...x, worker_id: w.id })), persona);
        if (r.total) {
          avisoTurnos = {
            total: r.total,
            enBorrador: r.borrador.length,
            publicados: r.publicados.length,
            semanas: [...new Set(futuras.map((x) => x.lunes))],
            mensaje: r.publicados.length
              ? `Le quedan ${r.total} turno(s) después de la baja, y ${r.publicados.length} están en semanas YA PUBLICADAS. No se han tocado: para quitarlos hay que crear una versión nueva de esa semana y volver a publicarla.`
              : `Le quedan ${r.total} turno(s) después de la baja, todos en borrador. No se han tocado: quítalos desde el cuadrante.`,
          };
          await ficAuditar("usuario", w.id, "baja_con_turnos_futuros", req.user.username,
            { local: w.local, workerId: w.id, detalle: avisoTurnos }).catch(() => {});
        }
      }
    }
    res.json({ ok: true, avisoTurnos });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/api/rrhh/trabajador/:id/documentos", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const wl = await rrhhWorkerLocal(req.params.id);
    if (wl === null) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    if (!rrhhPuedeLocal(req, wl)) return res.status(403).json({ ok: false, error: "Sin acceso a este trabajador" });
    let docs = (await dbAll("SELECT * FROM hr_documentos WHERE worker_id = ? ORDER BY creado_en DESC", [req.params.id])).map(docParaPanel);
    if (esEncargado(req)) docs = docs.filter((d) => !(d.sensible === 1 || d.sensible === true));
    res.json({ ok: true, data: docs, alertas: documentosPorCaducar(docs, hoyISO(), 30) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Subida de documento endurecida (magic-bytes, como el CV). Encargado: solo documentos NO sensibles.
app.post("/api/rrhh/trabajador/:id/documento", requireAuth(RRHH_ROLES), (req, res, next) => {
  uploadCv.single("archivo")(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.code === "LIMIT_FILE_SIZE" ? "El archivo supera 8 MB." : "Error subiendo el archivo." });
    next();
  });
}, async (req, res) => {
  try {
    const wl = await rrhhWorkerLocal(req.params.id);
    if (wl === null) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    if (!rrhhPuedeLocal(req, wl)) return res.status(403).json({ ok: false, error: "Sin acceso a este trabajador" });
    if (!req.file) return res.status(400).json({ ok: false, error: "Falta el archivo" });
    // Se valida el CONTENIDO igual que antes (magic bytes) y se publica en `uploads`… y de
    // ahí se traslada al directorio privado. Se reaprovecha `finalizeCvUpload` para no tener
    // dos validaciones de fichero distintas, que es como acaban divergiendo.
    const fin = finalizeCvUpload({ tmpPath: req.file.path, filename: req.file.filename, originalname: req.file.originalname, publicDir: uploadsDir });
    if (!fin.ok) return res.status(400).json({ ok: false, error: "Archivo no válido (tipo o contenido)" });
    try { fs.renameSync(path.join(uploadsDir, req.file.filename), path.join(rrhhDocsDir, req.file.filename)); }
    catch (e) {
      // Si no se puede sacar de `public/`, NO se guarda: quedaría un DNI accesible por URL,
      // que es justo lo que este cambio viene a cerrar.
      try { fs.unlinkSync(path.join(uploadsDir, req.file.filename)); } catch { /* ya no está */ }
      console.error("[rrhh] documento a privado:", e.message);
      return res.status(500).json({ ok: false, error: "No se pudo guardar el documento de forma segura" });
    }
    const sensible = esEncargado(req) ? 0 : (req.body.sensible === "1" || req.body.sensible === "true" || req.body.sensible === true ? 1 : 0);
    const row = await dbRun(
      `INSERT INTO hr_documentos (worker_id, tipo, nombre, url, sensible, fecha_emision, fecha_caducidad, autor, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [req.params.id, String(req.body.tipo || "otro"), req.body.nombre || req.file.originalname, `rrhh:${req.file.filename}`, sensible, req.body.fecha_emision || null, req.body.fecha_caducidad || null, req.user?.nombre || req.user?.username || null, new Date().toISOString()]);
    res.json({ ok: true, id: row.id, url: `/api/rrhh/documento/${row.id}/archivo` });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/**
 * El fichero de un documento de RR.HH. La única puerta.
 *
 * Repite las tres comprobaciones del listado —quién eres, de qué local es esa persona y si el
 * documento es sensible— porque esconder la URL en la pantalla no protege nada: lo que protege
 * es que el fichero no esté servido desde `public/`.
 */
/** Lo que se manda al panel: la url pasa a ser la del endpoint, nunca la ruta del fichero. */
const docParaPanel = (d) => ({ ...d, url: `/api/rrhh/documento/${d.id}/archivo` });

app.get("/api/rrhh/documento/:id/archivo", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const doc = await dbGet("SELECT id, worker_id, nombre, url, sensible FROM hr_documentos WHERE id = ?", [Number(req.params.id) || 0]);
    if (!doc) return res.status(404).json({ ok: false, error: "Documento no encontrado" });
    const wl = await rrhhWorkerLocal(doc.worker_id);
    if (wl === null || !rrhhPuedeLocal(req, wl)) return res.status(403).json({ ok: false, error: "Sin acceso a este trabajador" });
    if (esEncargado(req) && (doc.sensible === 1 || doc.sensible === true)) {
      return res.status(403).json({ ok: false, error: "Este documento es confidencial" });
    }

    // Dos formas de `url` conviven a propósito: `rrhh:<fichero>` es la nueva, en el directorio
    // privado; `/uploads/<fichero>` es la de los documentos de antes, que se sirven igual
    // mientras la migración no los haya trasladado. En ninguno de los dos casos se acepta una
    // ruta del cliente: el nombre sale de la base y se le quita todo lo que no sea el fichero.
    const guardada = String(doc.url || "");
    const fichero = path.basename(guardada.startsWith("rrhh:") ? guardada.slice(5) : guardada);
    if (!fichero || fichero === "." || fichero === "..") return res.status(404).json({ ok: false, error: "Documento no encontrado" });
    const candidatos = [path.join(rrhhDocsDir, fichero), path.join(uploadsDir, fichero)];
    const ruta = candidatos.find((c) => fs.existsSync(c));
    if (!ruta) return res.status(404).json({ ok: false, error: "El archivo ya no está" });

    // `inline` para poder mirarlo sin descargar, y sin caché compartida: es documentación
    // personal y no puede quedarse en la caché de un proxy.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(fichero).replace(/[^\w.\-]/g, "_")}"`);
    res.sendFile(ruta);
  } catch (e) {
    console.error("[rrhh] servir documento:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo abrir el documento" });
  }
});

app.delete("/api/rrhh/documento/:id", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const doc = await dbGet("SELECT worker_id, sensible, url FROM hr_documentos WHERE id = ?", [req.params.id]);
    if (!doc) return res.json({ ok: true });
    const wl = await rrhhWorkerLocal(doc.worker_id);
    if (!rrhhPuedeLocal(req, wl)) return res.status(403).json({ ok: false, error: "Sin acceso" });
    if (esEncargado(req) && (doc.sensible === 1 || doc.sensible === true)) return res.status(403).json({ ok: false, error: "Documento sensible" });
    await dbRun("DELETE FROM hr_documentos WHERE id = ?", [req.params.id]);
    // El fichero también, y solo el del directorio privado: en `public/uploads` puede haber
    // quedado el original de antes de la migración y borrarlo a ciegas es tocar el disco de
    // otro módulo. El huérfano de `uploads` lo limpia la migración, no esto.
    const suelto = String(doc.url || "");
    if (suelto.startsWith("rrhh:")) {
      try { fs.unlinkSync(path.join(rrhhDocsDir, path.basename(suelto.slice(5)))); } catch { /* ya no estaba */ }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── RRHH: enlace con operadores de Ágora + rendimiento por empleado (solo lectura) ──
// Descubre los operadores que han facturado (informe `empleado`) y propone a qué perfil enlazarlos.
app.get("/api/rrhh/agora/operadores", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const scope = rrhhLocalScope(req); // encargado → su local; dirección/rrhh → todos (o ?local)
    const local = scope || (req.query.local ? String(req.query.local).trim() : null);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || "")) ? req.query.to : hoyISO();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || "")) ? req.query.from : addDaysISO(to, -90);
    const r = await runInformeAgora("empleado", { local, from, to });
    if (r.sinCredenciales) return res.json({ ok: true, operadores: [], sinCredenciales: true, from, to });
    const userNames = [...new Set(r.filas.map((f) => f.empleado).filter(Boolean))];
    const perfiles = await dbAll(`SELECT id, nombre, agora_username, local FROM users WHERE rol IN ('trabajador','encargado')${scope ? " AND local = ?" : ""}`, scope ? [scope] : []);
    const operadores = emparejaOperadores(userNames, perfiles);
    res.json({ ok: true, operadores, from, to, sinDatos: !userNames.length, errores: r.errores });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Enlaza (1:1) un UserName de Ágora con un perfil. Libera el enlace previo de ese UserName si lo hubiera.
app.post("/api/rrhh/agora/enlazar", requireAuth(RRHH_ROLES), async (req, res) => {
  const agora = String(req.body.agora_username || "").trim();
  const worker_id = req.body.worker_id;
  if (!worker_id) return res.status(400).json({ ok: false, error: "Falta el trabajador" });
  try {
    const wl = await rrhhWorkerLocal(worker_id);
    if (wl === null) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    if (!rrhhPuedeLocal(req, wl)) return res.status(403).json({ ok: false, error: "Sin acceso a este trabajador" });
    if (!agora) { await dbRun("UPDATE users SET agora_username = NULL WHERE id = ?", [worker_id]); return res.json({ ok: true, desenlazado: true }); }
    await dbRun("UPDATE users SET agora_username = NULL WHERE agora_username = ? AND id <> ?", [agora, worker_id]);
    await dbRun("UPDATE users SET agora_username = ? WHERE id = ?", [agora, worker_id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Rendimiento del trabajador (ventas/cancelaciones) desde Ágora, si tiene enlace. Solo lectura.
app.get("/api/rrhh/trabajador/:id/rendimiento", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const w = await dbGet("SELECT id, local, agora_username FROM users WHERE id = ?", [req.params.id]);
    if (!w) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    if (!rrhhPuedeLocal(req, w.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este trabajador" });
    if (!w.agora_username) return res.json({ ok: true, enlazado: false, fila: null });
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || "")) ? req.query.to : hoyISO();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || "")) ? req.query.from : addDaysISO(to, -30);
    const r = await runInformeAgora("empleado", { local: w.local, from, to });
    if (r.sinCredenciales) return res.json({ ok: true, enlazado: true, sinCredenciales: true, from, to });
    const fila = rendimientoDeEmpleado(r.filas, w.agora_username);
    res.json({ ok: true, enlazado: true, fila, from, to, sinDatos: !fila, errores: r.errores });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Mantenimiento — enforcement por establecimiento gated por PERMISOS_V2 (Iteración 4).
// Con el flag ausente (por defecto) el comportamiento es IDÉNTICO al anterior, incluidos los
// mensajes de error 500. Toda la autorización vive en el servicio (no en la ruta).
const maintDb = { get: dbGet, all: dbAll, run: dbRun };
app.get("/api/maintenance", requireAuth(["encargado", "direccion"]), async (req, res, next) => {
  try {
    const scope = localScope(req);
    const r = await listMaintenanceIssues(maintDb, req.user, { enabled: permisosV2Enabled(), local: scope || req.query.local });
    if (r.code === "OK") { const data = scope ? (r.data || []).filter((x) => x.local === scope) : r.data; return res.json({ ok: true, data }); }
    if (r.code === "FORBIDDEN") return res.status(403).json({ ok: false, error: "Sin permiso para este recurso" });
    return next(new Error("maintenance_list_internal"));
  } catch (e) { if (!permisosV2Enabled()) return res.status(500).json({ ok: false, error: "Error incidencias" }); next(e); }
});

app.post("/api/maintenance", requireAuth(["encargado", "direccion"]), async (req, res, next) => {
  try {
    const scope = localScope(req);
    const local = scope || req.body.local; // encargado con local → siempre su local
    const { titulo, descripcion, foto_url } = req.body;
    const r = await createMaintenanceIssue(maintDb, req.user, { local, titulo, descripcion, foto_url }, { enabled: permisosV2Enabled() });
    if (r.code === "OK") return res.json({ ok: true, id: r.id });
    if (r.code === "VALIDATION_ERROR") return res.status(400).json({ ok: false, error: r.reason === "invalid_local" ? "Establecimiento no válido" : "Faltan campos" });
    if (r.code === "FORBIDDEN") return res.status(403).json({ ok: false, error: "Sin permiso para este recurso" });
    return next(new Error("maintenance_create_internal"));
  } catch (e) { if (!permisosV2Enabled()) return res.status(500).json({ ok: false, error: "Error guardando incidencia" }); next(e); }
});

app.put("/api/maintenance/:id", requireAuth(["encargado", "direccion"]), async (req, res, next) => {
  try {
    const scope = localScope(req);
    if (scope) { const row = await dbGet("SELECT local FROM maintenance_issues WHERE id = ?", [req.params.id]); if (row && row.local !== scope) return res.status(403).json({ ok: false, error: "Sin permiso sobre esta incidencia" }); }
    const r = await updateMaintenanceIssueStatus(maintDb, req.user, req.params.id, { estado: req.body.estado }, { enabled: permisosV2Enabled() });
    if (r.code === "OK") return res.json({ ok: true });
    if (r.code === "VALIDATION_ERROR") return res.status(400).json({ ok: false, error: r.reason === "invalid_id" ? "ID no válido" : "Estado requerido" });
    if (r.code === "FORBIDDEN") return res.status(403).json({ ok: false, error: "Sin permiso para este recurso" });
    if (r.code === "NOT_FOUND") return res.status(404).json({ ok: false, error: "Incidencia no encontrada" });
    return next(new Error("maintenance_update_internal"));
  } catch (e) { if (!permisosV2Enabled()) return res.status(500).json({ ok: false, error: "Error actualizando incidencia" }); next(e); }
});

// ════════════════════════ INVENTARIOS ════════════════════════
// Flujo: local → proveedor → contar productos → comparar con stock necesario → proponer pedido.
// Aislamiento por local SIEMPRE en backend (puedeAccederLocal). Solo lectura sobre facturas/Ágora.
const INV_ROLES = ["direccion", "encargado"];
const hoyMMDD = () => new Date().toISOString().slice(5, 10);
const invBool = (v, def = true) => (v === undefined || v === null) ? def : !(v === false || v === 0 || v === "false" || v === "0" || v === "");
const invNum = (v) => { const n = Number(v); return isFinite(n) && n >= 0 ? n : 0; };
async function invProveedor(id) { return dbGet("SELECT * FROM inv_proveedores WHERE id = ?", [id]); }
async function invSesionRow(id) { return dbGet("SELECT * FROM inv_sesiones WHERE id = ?", [id]); }
async function invPedidoRow(id) { return dbGet("SELECT * FROM inv_pedidos WHERE id = ?", [id]); }
async function invProductosDe(proveedorId, soloActivos = true) {
  return dbAll(`SELECT * FROM inv_productos WHERE proveedor_id = ? ${soloActivos ? "AND activo = TRUE" : ""} ORDER BY orden, nombre`, [proveedorId]);
}

// 1) Locales a los que el usuario tiene acceso (paso 1 del flujo).
app.get("/api/inventario/locales", requireAuth(INV_ROLES), (req, res) => {
  res.json({ ok: true, data: localesAccesibles(req) });
});

// 2) Proveedores de un local (tarjetas): nº productos, último inventario, inventario en curso.
app.get("/api/inventario/proveedores", requireAuth(INV_ROLES), async (req, res) => {
  const local = String(req.query.local || "").trim();
  if (!puedeAccederLocal(req, local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
  try {
    const rows = await dbAll(`
      SELECT p.*,
        (SELECT COUNT(*) FROM inv_productos pr WHERE pr.proveedor_id = p.id AND pr.activo = TRUE) AS n_productos,
        (SELECT MAX(finalizado_en) FROM inv_sesiones s WHERE s.proveedor_id = p.id AND s.estado = 'finalizado') AS ultimo_inventario,
        (SELECT COUNT(*) FROM inv_sesiones s WHERE s.proveedor_id = p.id AND s.estado = 'en_curso') AS en_curso
      FROM inv_proveedores p WHERE p.local = ? ORDER BY p.orden, p.nombre`, [local]);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Sugerencias de proveedores ya vistos en facturas de compra (para no duplicar al configurar).
app.get("/api/inventario/facturas-proveedores", requireAuth(INV_ROLES), async (req, res) => {
  const local = String(req.query.local || "").trim();
  if (!puedeAccederLocal(req, local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
  try {
    const rows = await dbAll(`SELECT DISTINCT proveedor FROM facturas WHERE local = ? AND proveedor IS NOT NULL AND TRIM(proveedor) <> '' ORDER BY proveedor LIMIT 200`, [local]);
    res.json({ ok: true, data: (rows || []).map((r) => r.proveedor) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Crear / editar / borrar proveedor (configuración).
app.post("/api/inventario/proveedores", requireAuth(INV_ROLES), async (req, res) => {
  const local = String(req.body.local || "").trim();
  const nombre = String(req.body.nombre || "").trim();
  if (!puedeAccederLocal(req, local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
  if (!nombre) return res.status(400).json({ ok: false, error: "Falta el nombre del proveedor" });
  try {
    const row = await dbRun(
      `INSERT INTO inv_proveedores (local, nombre, activo, orden, factura_proveedor, creado_en) VALUES (?, ?, TRUE, ?, ?, ?) RETURNING id`,
      [local, nombre, invNum(req.body.orden), req.body.factura_proveedor || null, new Date().toISOString()]);
    res.json({ ok: true, id: row.id });
  } catch (e) { res.status(400).json({ ok: false, error: "Ese proveedor ya existe en el local o datos inválidos" }); }
});
app.put("/api/inventario/proveedores/:id", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const p = await invProveedor(req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: "Proveedor no encontrado" });
    if (!puedeAccederLocal(req, p.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
    const nombre = req.body.nombre !== undefined ? String(req.body.nombre).trim() : p.nombre;
    await dbRun(`UPDATE inv_proveedores SET nombre = ?, activo = ?, orden = ?, factura_proveedor = ? WHERE id = ?`,
      [nombre || p.nombre, invBool(req.body.activo, p.activo), invNum(req.body.orden ?? p.orden), req.body.factura_proveedor ?? p.factura_proveedor, p.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.delete("/api/inventario/proveedores/:id", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const p = await invProveedor(req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: "Proveedor no encontrado" });
    if (!puedeAccederLocal(req, p.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
    await dbRun("DELETE FROM inv_proveedores WHERE id = ?", [p.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Productos de un proveedor (configuración por local).
app.get("/api/inventario/productos", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const p = await invProveedor(req.query.proveedor_id);
    if (!p) return res.status(404).json({ ok: false, error: "Proveedor no encontrado" });
    if (!puedeAccederLocal(req, p.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
    const rows = await invProductosDe(p.id, false);
    res.json({ ok: true, data: rows, proveedor: { id: p.id, nombre: p.nombre, local: p.local } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
function invProductoPayload(body, prev = {}) {
  const temp = body.temporada_stock;
  return {
    nombre: body.nombre !== undefined ? String(body.nombre).trim() : prev.nombre,
    unidad: (body.unidad !== undefined ? String(body.unidad).trim() : prev.unidad) || "unidades",
    stock_minimo: invNum(body.stock_minimo ?? prev.stock_minimo),
    stock_objetivo: invNum(body.stock_objetivo ?? prev.stock_objetivo),
    temporada_stock: (temp === "" || temp === null || temp === undefined) ? (prev.temporada_stock ?? null) : invNum(temp),
    temporada_inicio: (body.temporada_inicio ?? prev.temporada_inicio) || null,
    temporada_fin: (body.temporada_fin ?? prev.temporada_fin) || null,
    activo: invBool(body.activo, prev.activo ?? true),
    orden: invNum(body.orden ?? prev.orden),
    observaciones: (body.observaciones ?? prev.observaciones) || null,
    agora_product_id: (body.agora_product_id ?? prev.agora_product_id) || null,
  };
}
app.post("/api/inventario/productos", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const p = await invProveedor(req.body.proveedor_id);
    if (!p) return res.status(404).json({ ok: false, error: "Proveedor no encontrado" });
    if (!puedeAccederLocal(req, p.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
    const d = invProductoPayload(req.body);
    if (!d.nombre) return res.status(400).json({ ok: false, error: "Falta el nombre del producto" });
    if (!esMMDDValido(d.temporada_inicio) || !esMMDDValido(d.temporada_fin)) return res.status(400).json({ ok: false, error: "Fechas de temporada inválidas (MM-DD)" });
    const row = await dbRun(
      `INSERT INTO inv_productos (proveedor_id, local, nombre, unidad, stock_minimo, stock_objetivo, temporada_stock, temporada_inicio, temporada_fin, activo, orden, observaciones, agora_product_id, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [p.id, p.local, d.nombre, d.unidad, d.stock_minimo, d.stock_objetivo, d.temporada_stock, d.temporada_inicio, d.temporada_fin, d.activo, d.orden, d.observaciones, d.agora_product_id, new Date().toISOString()]);
    res.json({ ok: true, id: row.id });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.put("/api/inventario/productos/:id", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const prod = await dbGet("SELECT * FROM inv_productos WHERE id = ?", [req.params.id]);
    if (!prod) return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    if (!puedeAccederLocal(req, prod.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
    const d = invProductoPayload(req.body, prod);
    if (!d.nombre) return res.status(400).json({ ok: false, error: "Falta el nombre del producto" });
    if (!esMMDDValido(d.temporada_inicio) || !esMMDDValido(d.temporada_fin)) return res.status(400).json({ ok: false, error: "Fechas de temporada inválidas (MM-DD)" });
    await dbRun(
      `UPDATE inv_productos SET nombre=?, unidad=?, stock_minimo=?, stock_objetivo=?, temporada_stock=?, temporada_inicio=?, temporada_fin=?, activo=?, orden=?, observaciones=?, agora_product_id=? WHERE id=?`,
      [d.nombre, d.unidad, d.stock_minimo, d.stock_objetivo, d.temporada_stock, d.temporada_inicio, d.temporada_fin, d.activo, d.orden, d.observaciones, d.agora_product_id, prod.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.delete("/api/inventario/productos/:id", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const prod = await dbGet("SELECT * FROM inv_productos WHERE id = ?", [req.params.id]);
    if (!prod) return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    if (!puedeAccederLocal(req, prod.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
    await dbRun("DELETE FROM inv_productos WHERE id = ?", [prod.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── El catálogo de un proveedor: qué se le puede añadir sin escribirlo a mano ────────────────
//
// Montar un proveedor con cuarenta referencias eran cuarenta modales de diez campos, escribiendo
// una lista que YA existe en dos sitios: sus facturas y, muchas veces, el mismo proveedor montado
// en otro local. Esto las junta y deja marcar las que se quieran.
//
// LO QUE NO DEVUELVE, y es deliberado: ni importe, ni precio, ni número de factura. Inventarios lo
// usa un ENCARGADO, que hoy no puede ver Compras. El nombre de lo que se compra no es sensible
// —es lo que descarga del camión— pero a cuánto nos lo cobran, sí. No es una opción que se pueda
// configurar mal: esas columnas no están en el SELECT.
app.get("/api/inventario/proveedores/:id/catalogo", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const p = await invProveedor(req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: "Proveedor no encontrado" });
    if (!puedeAccederLocal(req, p.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });

    // Dirección ve todos los locales —lo pidió así—; un encargado, solo los suyos: el de Tordera
    // no tiene por qué saber qué se compra en Girona. La rama es EXPLÍCITA porque un array vacío
    // en `= ANY(?)` significa «ninguno», no «todos».
    const restringido = req.user?.rol !== "direccion";
    const susLocales = restringido ? localesDe(req.user) : [];
    if (restringido && !susLocales.length) return res.status(403).json({ ok: false, error: "Sin locales asignados" });

    // Ventana de 18 meses (~548 días): un proveedor de cinco años devuelve productos que ya no se
    // compran, y la lista deja de servir para elegir.
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || "")) ? req.query.desde : addDaysISO(hoyISO(), -548);
    const buscado = String(p.factura_proveedor || p.nombre || "").trim();

    const [conocidos, existentes] = await Promise.all([
      dbAll(`SELECT DISTINCT proveedor FROM facturas WHERE proveedor IS NOT NULL AND TRIM(proveedor) <> ''`).catch(() => []),
      invProductosDe(p.id, false),
    ]);
    const variantes = variantesDeProveedor(buscado, conocidos.map((x) => x.proveedor));

    // Lo comprado. Misma agrupación que «Qué compramos» —incluido el diccionario, para que dos
    // escrituras ya unificadas salgan como UN producto y con el nombre bueno— y recortada a lo
    // que hace falta aquí.
    const filas = await dbAll(
      `SELECT COALESCE('p:' || a.producto_id::text, l.clave)              AS clave,
              (array_agg(COALESCE(p2.nombre, l.descripcion)
                         ORDER BY f.fecha DESC NULLS LAST, l.id DESC))[1] AS descripcion,
              count(*)::int                                              AS veces,
              MAX(f.fecha)                                               AS ultima,
              (array_agg(DISTINCT l.unidad)
                 FILTER (WHERE COALESCE(l.unidad,'') <> ''))             AS unidades,
              array_agg(DISTINCT f.local)                                AS locales
         FROM factura_lineas l
         JOIN facturas f ON f.id = l.factura_id
         LEFT JOIN producto_alias a ON a.clave = l.clave AND a.producto_id IS NOT NULL
         LEFT JOIN productos_canonicos p2 ON p2.id = a.producto_id
        WHERE COALESCE(f.dup_estado,'') <> 'duda' AND COALESCE(l.clave,'') <> ''
          AND f.proveedor = ANY(?) AND f.fecha >= ?
          ${restringido ? "AND f.local = ANY(?)" : ""}
          AND NOT ${ALBARAN_YA_CONTADO}
        GROUP BY 1
        ORDER BY veces DESC, ultima DESC NULLS LAST
        LIMIT 300`,
      restringido ? [variantes, desde, susLocales] : [variantes, desde]).catch(() => []);

    const deFacturas = (filas || []).map((r) => ({
      nombre: r.descripcion, clave_producto: r.clave, veces: r.veces, ultima: r.ultima,
      // La unidad de la factura es la de COMPRA; la del inventario, la de CONTEO. Se compra en
      // cajas y se cuenta en botellas. Va como sugerencia, y cuando no se reconoce va `null`
      // para que la pantalla lo marque en vez de rellenarlo en silencio.
      unidad_sugerida: unidadSugerida(r.unidades || []),
      locales: r.locales || [],
    }));

    // El mismo proveedor montado en otro local. Traen unidad y stock decididos por una persona,
    // así que valen más que cualquier deducción nuestra.
    const otrosProv = await dbAll(
      `SELECT id, local, nombre FROM inv_proveedores WHERE id <> ?${restringido ? " AND local = ANY(?)" : ""}`,
      restringido ? [p.id, susLocales] : [p.id]).catch(() => []);
    const gemelos = (otrosProv || []).filter((x) => x.local !== p.local
      && variantesDeProveedor(p.nombre, [x.nombre]).length > 1);
    const deOtros = gemelos.length
      ? await dbAll(`SELECT id, local, nombre, unidad, stock_minimo, stock_objetivo, temporada_stock,
                            temporada_inicio, temporada_fin, observaciones, clave_producto
                       FROM inv_productos WHERE proveedor_id = ANY(?) AND activo = TRUE ORDER BY orden, nombre`,
          [gemelos.map((x) => x.id)]).catch(() => [])
      : [];

    const fus = fusionarFuentes(deFacturas, deOtros);
    res.json({
      ok: true,
      proveedor: { id: p.id, nombre: p.nombre, local: p.local, factura_proveedor: p.factura_proveedor || null },
      buscado: {
        nombre: buscado, variantes, desde,
        locales: restringido ? susLocales : [],
        // Si no se ha encontrado nada, lo más probable es que el nombre del inventario no sea el
        // de las facturas («Grau» vs «VINS I LICORS GRAU SA»). Se PROPONE, no se adivina:
        // «Grau» también está dentro de «Graupera SL», y una lista del proveedor equivocado no se
        // nota hasta que alguien pide una caja de algo que ese señor no vende.
        sugerencias: deFacturas.length ? [] : sugerenciasDeProveedor(buscado, conocidos.map((x) => x.proveedor)).slice(0, 6),
      },
      facturas: marcarYaConfigurados(fus.facturas, existentes),
      otros_locales: marcarYaConfigurados(fus.otrosLocales, existentes),
      ya_configurados: existentes.length,
    });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Alta de VARIOS productos de una vez. Una transacción: un lote de cuarenta que se queda a medias
// deja a quien lo hizo sin saber qué entró, y su reacción será volver a darle y duplicar la
// primera mitad.
app.post("/api/inventario/productos/lote", requireAuth(INV_ROLES), async (req, res) => {
  const client = await pool.connect();
  try {
    const p = await invProveedor(req.body?.proveedor_id);
    if (!p) return res.status(404).json({ ok: false, error: "Proveedor no encontrado" });
    if (!puedeAccederLocal(req, p.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });

    // Las líneas con `copiar_de` se resuelven EN EL SERVIDOR leyendo el producto de origen y
    // comprobando el permiso sobre SU local. Si esos valores viajaran desde el navegador, el
    // panel sería la fuente de la verdad de un dato que ya está en la base.
    const pedidas = Array.isArray(req.body?.productos) ? req.body.productos.slice(0, TOPE_LOTE + 1) : [];
    const aCopiar = pedidas.filter((x) => x && x.copiar_de).map((x) => x.copiar_de);
    const origenes = aCopiar.length
      ? await dbAll(`SELECT * FROM inv_productos WHERE id = ANY(?)`, [aCopiar]).catch(() => []) : [];
    const porId = new Map(origenes.map((o) => [String(o.id), o]));
    const lineas = [];
    for (const x of pedidas) {
      if (!x || !x.copiar_de) { lineas.push(x); continue; }
      const o = porId.get(String(x.copiar_de));
      if (!o) return res.status(400).json({ ok: false, error: "Un producto a copiar ya no existe. Vuelve a abrir la lista." });
      if (!puedeAccederLocal(req, o.local)) return res.status(403).json({ ok: false, error: "Sin acceso al local de origen" });
      lineas.push({
        nombre: o.nombre, unidad: o.unidad, clave_producto: o.clave_producto || null,
        stock_objetivo: o.stock_objetivo, stock_minimo: o.stock_minimo, temporada_stock: o.temporada_stock,
        temporada_inicio: o.temporada_inicio, temporada_fin: o.temporada_fin, observaciones: o.observaciones,
      });
    }

    // Todo se valida ANTES de abrir la transacción: un nombre vacío devuelve un 400 diciendo qué
    // línea, con CERO escrituras. Lo que no puede pasar es que entren 37 y falten 3 sin saber
    // cuáles.
    const existentesPrev = await invProductosDe(p.id, false);
    const prev = normalizarLote(lineas, { existentes: existentesPrev, stockDefecto: req.body?.stock_objetivo_defecto });
    if (prev.errores.length) {
      return res.status(400).json({ ok: false, error: prev.errores[0].motivo, errores: prev.errores });
    }

    await client.query("BEGIN");
    const q = (sql, par = []) => client.query(toPositional(sql), par);
    // En READ COMMITTED, dos peticiones a la vez colarían el mismo producto dos veces. Esto las
    // pone en fila por una línea de código.
    await q(`SELECT id FROM inv_proveedores WHERE id = ? FOR UPDATE`, [p.id]);

    // Se relee DENTRO de la transacción: la comprobación de antes es de comodidad, y sin esta la
    // protección contra duplicados sería cosmética (dos pestañas abiertas la saltan).
    const dentro = (await q(`SELECT * FROM inv_productos WHERE proveedor_id = ?`, [p.id])).rows;
    const { altas, reactivar, omitidos } = normalizarLote(lineas, { existentes: dentro, stockDefecto: req.body?.stock_objetivo_defecto });

    // El orden en que se ven en la lista suele ser el del albarán, que es el orden en que se
    // cuenta el almacén. Naciendo todos con 0 se perdía.
    const maxOrden = Number((await q(`SELECT COALESCE(MAX(orden),0) AS m FROM inv_productos WHERE proveedor_id = ?`, [p.id])).rows[0]?.m) || 0;
    const ahora = new Date().toISOString();
    const ids = [];
    for (let i = 0; i < altas.length; i++) {
      const d = altas[i];
      const row = await q(
        `INSERT INTO inv_productos (proveedor_id, local, nombre, unidad, stock_minimo, stock_objetivo,
           temporada_stock, temporada_inicio, temporada_fin, activo, orden, observaciones, clave_producto, creado_en)
         VALUES (?,?,?,?,?,?,?,?,?,TRUE,?,?,?,?) RETURNING id`,
        [p.id, p.local, d.nombre, d.unidad, d.stock_minimo, d.stock_objetivo, d.temporada_stock,
         d.temporada_inicio, d.temporada_fin, maxOrden + i + 1, d.observaciones, d.clave_producto, ahora]);
      ids.push(row.rows[0].id);
    }
    for (const r of reactivar) await q(`UPDATE inv_productos SET activo = TRUE WHERE id = ?`, [r.id]);
    await client.query("COMMIT");

    res.json({ ok: true, creados: altas.length, reactivados: reactivar.length, omitidos, ids });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* la conexión ya estaba mal */ }
    res.status(500).json({ ok: false, error: e.message });
  } finally { client.release(); }
});

// 3-5) Sesión de conteo: obtiene (o crea) el inventario EN CURSO del proveedor y sus productos
// con la cantidad ya introducida (recuperación de inventarios a medias).
app.get("/api/inventario/sesion", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const p = await invProveedor(req.query.proveedor_id);
    if (!p) return res.status(404).json({ ok: false, error: "Proveedor no encontrado" });
    if (!puedeAccederLocal(req, p.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
    let sesion = await dbGet("SELECT * FROM inv_sesiones WHERE proveedor_id = ? AND estado = 'en_curso' ORDER BY id DESC LIMIT 1", [p.id]);
    if (!sesion) {
      const row = await dbRun("INSERT INTO inv_sesiones (local, proveedor_id, estado, usuario, creado_en) VALUES (?, ?, 'en_curso', ?, ?) RETURNING id", [p.local, p.id, req.user?.username || null, new Date().toISOString()]);
      sesion = await invSesionRow(row.id);
    }
    const productos = await invProductosDe(p.id, true);
    const lineas = await dbAll("SELECT producto_id, cantidad, observacion FROM inv_lineas WHERE sesion_id = ?", [sesion.id]);
    const byId = {}; for (const l of (lineas || [])) byId[l.producto_id] = l;
    const hoy = hoyMMDD();
    const data = productos.map((pr) => ({
      ...pr, necesario: invStockNecesario(pr, hoy),
      cantidad: byId[pr.id] ? Number(byId[pr.id].cantidad) : null,
      observacion: byId[pr.id]?.observacion || "",
    }));
    res.json({ ok: true, sesion, proveedor: { id: p.id, nombre: p.nombre, local: p.local }, productos: data });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 5) Guardado automático de una cantidad contada (nunca negativa).
app.post("/api/inventario/sesion/:id/linea", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const sesion = await invSesionRow(req.params.id);
    if (!sesion) return res.status(404).json({ ok: false, error: "Inventario no encontrado" });
    if (!puedeAccederLocal(req, sesion.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
    if (sesion.estado !== "en_curso") return res.status(409).json({ ok: false, error: "El inventario ya está finalizado" });
    const prod = await dbGet("SELECT id, proveedor_id FROM inv_productos WHERE id = ?", [req.body.producto_id]);
    if (!prod || prod.proveedor_id !== sesion.proveedor_id) return res.status(400).json({ ok: false, error: "Producto no válido para este inventario" });
    const cantidad = invSanitizarCantidad(req.body.cantidad);
    await dbRun(
      `INSERT INTO inv_lineas (sesion_id, producto_id, cantidad, observacion, actualizado_en) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (sesion_id, producto_id) DO UPDATE SET cantidad = EXCLUDED.cantidad, observacion = EXCLUDED.observacion, actualizado_en = EXCLUDED.actualizado_en`,
      [sesion.id, prod.id, cantidad, req.body.observacion || null, new Date().toISOString()]);
    res.json({ ok: true, cantidad });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 6) Revisión: contado vs. necesario, diferencia y cantidad a pedir. No modifica la sesión.
app.get("/api/inventario/sesion/:id/revision", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const sesion = await invSesionRow(req.params.id);
    if (!sesion) return res.status(404).json({ ok: false, error: "Inventario no encontrado" });
    if (!puedeAccederLocal(req, sesion.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
    const prov = await invProveedor(sesion.proveedor_id);
    const productos = await invProductosDe(sesion.proveedor_id, true);
    const lineas = await dbAll("SELECT producto_id, cantidad FROM inv_lineas WHERE sesion_id = ?", [sesion.id]);
    const cant = {}; for (const l of (lineas || [])) cant[l.producto_id] = Number(l.cantidad);
    const revision = invConstruirRevision(productos, cant, hoyMMDD());
    const pedido = await dbGet("SELECT id, estado FROM inv_pedidos WHERE sesion_id = ? AND estado <> 'CANCELLED' ORDER BY id DESC LIMIT 1", [sesion.id]);
    res.json({ ok: true, sesion, proveedor: prov ? { id: prov.id, nombre: prov.nombre, local: prov.local } : null, revision, pedido_existente: pedido || null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 7) Generar propuesta de pedido (DRAFT) desde el inventario. Idempotente: si ya existe un
// pedido no cancelado para esta sesión, lo devuelve (evita duplicados). Finaliza la sesión.
app.post("/api/inventario/pedido", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const sesion = await invSesionRow(req.body.sesion_id);
    if (!sesion) return res.status(404).json({ ok: false, error: "Inventario no encontrado" });
    if (!puedeAccederLocal(req, sesion.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
    const existente = await dbGet("SELECT id FROM inv_pedidos WHERE sesion_id = ? AND estado <> 'CANCELLED' ORDER BY id DESC LIMIT 1", [sesion.id]);
    if (existente) return res.json({ ok: true, id: existente.id, existente: true });
    const productos = await invProductosDe(sesion.proveedor_id, true);
    const lineasCont = await dbAll("SELECT producto_id, cantidad FROM inv_lineas WHERE sesion_id = ?", [sesion.id]);
    const cant = {}; for (const l of (lineasCont || [])) cant[l.producto_id] = Number(l.cantidad);
    const revision = invConstruirRevision(productos, cant, hoyMMDD());
    const lineas = invLineasPedido(revision);
    if (!lineas.length) return res.status(400).json({ ok: false, error: "No hay nada que pedir (todo cubierto)" });
    const now = new Date().toISOString();
    const ped = await dbRun("INSERT INTO inv_pedidos (local, proveedor_id, sesion_id, estado, usuario, creado_en, actualizado_en) VALUES (?, ?, ?, 'DRAFT', ?, ?, ?) RETURNING id",
      [sesion.local, sesion.proveedor_id, sesion.id, req.user?.username || null, now, now]);
    for (const l of lineas) {
      await dbRun("INSERT INTO inv_pedido_lineas (pedido_id, producto_id, nombre, unidad, stock_contado, stock_necesario, cantidad_sugerida, cantidad_final, observacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [ped.id, l.producto_id, l.nombre, l.unidad, l.stock_contado, l.stock_necesario, l.cantidad_sugerida, l.cantidad_final, l.observacion]);
    }
    if (sesion.estado === "en_curso") await dbRun("UPDATE inv_sesiones SET estado = 'finalizado', finalizado_en = ? WHERE id = ?", [now, sesion.id]);
    res.json({ ok: true, id: ped.id });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 8) Pedidos (historial) del local + detalle + edición de borrador y cambio de estado.
app.get("/api/inventario/pedidos", requireAuth(INV_ROLES), async (req, res) => {
  const local = String(req.query.local || "").trim();
  if (!puedeAccederLocal(req, local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
  try {
    const rows = await dbAll(`
      SELECT ped.*, prov.nombre AS proveedor_nombre,
        (SELECT COUNT(*) FROM inv_pedido_lineas pl WHERE pl.pedido_id = ped.id) AS n_lineas,
        (SELECT COALESCE(SUM(cantidad_final), 0) FROM inv_pedido_lineas pl WHERE pl.pedido_id = ped.id) AS total_unidades
      FROM inv_pedidos ped LEFT JOIN inv_proveedores prov ON prov.id = ped.proveedor_id
      WHERE ped.local = ? ORDER BY ped.creado_en DESC LIMIT 200`, [local]);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.get("/api/inventario/pedido/:id", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const ped = await invPedidoRow(req.params.id);
    if (!ped) return res.status(404).json({ ok: false, error: "Pedido no encontrado" });
    if (!puedeAccederLocal(req, ped.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
    const prov = await invProveedor(ped.proveedor_id);
    const lineas = await dbAll("SELECT * FROM inv_pedido_lineas WHERE pedido_id = ? ORDER BY id", [ped.id]);
    res.json({ ok: true, pedido: ped, proveedor: prov ? { id: prov.id, nombre: prov.nombre, local: prov.local } : null, lineas });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.put("/api/inventario/pedido/:id", requireAuth(INV_ROLES), async (req, res) => {
  try {
    const ped = await invPedidoRow(req.params.id);
    if (!ped) return res.status(404).json({ ok: false, error: "Pedido no encontrado" });
    if (!puedeAccederLocal(req, ped.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
    const now = new Date().toISOString();
    // Cambio de estado (DRAFT→APPROVED/CANCELLED, APPROVED→CANCELLED). Historial no se reescribe.
    if (req.body.estado !== undefined) {
      const nuevo = String(req.body.estado);
      if (!esEstadoPedidoValido(nuevo)) return res.status(400).json({ ok: false, error: "Estado no válido" });
      const permitido = (ped.estado === "DRAFT" && (nuevo === "APPROVED" || nuevo === "CANCELLED")) || (ped.estado === "APPROVED" && nuevo === "CANCELLED") || nuevo === ped.estado;
      if (!permitido) return res.status(409).json({ ok: false, error: `Transición ${ped.estado} → ${nuevo} no permitida` });
      await dbRun("UPDATE inv_pedidos SET estado = ?, actualizado_en = ? WHERE id = ?", [nuevo, now, ped.id]);
    }
    if (req.body.observaciones !== undefined) await dbRun("UPDATE inv_pedidos SET observaciones = ?, actualizado_en = ? WHERE id = ?", [req.body.observaciones || null, now, ped.id]);
    // Edición de líneas solo en borrador.
    const esBorrador = ped.estado === "DRAFT" && (req.body.estado === undefined || req.body.estado === "DRAFT");
    if (esBorrador && Array.isArray(req.body.lineas)) {
      for (const l of req.body.lineas) {
        const linea = await dbGet("SELECT id FROM inv_pedido_lineas WHERE id = ? AND pedido_id = ?", [l.id, ped.id]);
        if (!linea) continue;
        await dbRun("UPDATE inv_pedido_lineas SET cantidad_final = ?, observacion = ? WHERE id = ?", [invSanitizarCantidad(l.cantidad_final), l.observacion || null, linea.id]);
      }
    }
    if (esBorrador && Array.isArray(req.body.eliminar)) {
      for (const lid of req.body.eliminar) await dbRun("DELETE FROM inv_pedido_lineas WHERE id = ? AND pedido_id = ?", [lid, ped.id]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Historial de inventarios finalizados del local (con el pedido generado, si lo hay).
app.get("/api/inventario/historial", requireAuth(INV_ROLES), async (req, res) => {
  const local = String(req.query.local || "").trim();
  if (!puedeAccederLocal(req, local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
  try {
    const rows = await dbAll(`
      SELECT s.id, s.proveedor_id, prov.nombre AS proveedor_nombre, s.estado, s.usuario, s.creado_en, s.finalizado_en,
        (SELECT COUNT(*) FROM inv_lineas l WHERE l.sesion_id = s.id) AS n_contados,
        (SELECT id FROM inv_pedidos p WHERE p.sesion_id = s.id AND p.estado <> 'CANCELLED' ORDER BY id DESC LIMIT 1) AS pedido_id
      FROM inv_sesiones s LEFT JOIN inv_proveedores prov ON prov.id = s.proveedor_id
      WHERE s.local = ? AND s.estado = 'finalizado' ORDER BY s.finalizado_en DESC LIMIT 200`, [local]);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Comunicados
app.get("/api/announcements", requireAuth(), async (req, res) => {
  try {
    const { local, rol } = req.query;
    const where = [];
    const params = [];
    if (local) { where.push(`local = ?`); params.push(local); }
    if (rol) { where.push(`rol = ?`); params.push(rol); }
    const sql = `SELECT * FROM announcements ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY creado_en DESC`;
    const rows = await dbAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error anuncios" });
  }
});

app.post("/api/announcements", requireAuth(["encargado", "direccion"]), async (req, res) => {
  const { local, rol, mensaje } = req.body;
  if (!local || !rol || !mensaje) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  try {
    const creado_en = new Date().toISOString();
    const row = await dbRun(
      `INSERT INTO announcements (local, rol, mensaje, creado_en) VALUES (?, ?, ?, ?) RETURNING id`,
      [local, rol, mensaje, creado_en]
    );
    res.json({ ok: true, id: row.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando anuncio" });
  }
});

// WhatsApp
app.get("/api/whatsapp/status", requireAuth(["direccion", "encargado", "marketing"]), (req, res) => {
  res.json({ ok: true, connected: isReady() });
});

app.get("/api/whatsapp/groups", requireAuth(["direccion", "encargado"]), async (req, res) => {
  const groups = await getGroups();
  res.json({ ok: true, data: groups });
});

app.post("/api/whatsapp/link", requireAuth(["direccion", "encargado"]), async (req, res) => {
  const { local, groupId } = req.body;
  if (!local || !groupId) return res.status(400).json({ ok: false, error: "Faltan campos" });
  const updated_at = new Date().toISOString();
  try {
    await dbRun(
      `INSERT INTO wa_links (local, group_jid, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(local) DO UPDATE SET group_jid=EXCLUDED.group_jid, updated_at=EXCLUDED.updated_at`,
      [local, groupId, updated_at]
    );
    await dbRun(
      `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
      [`whatsapp_group_${local}`, groupId, updated_at]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando" });
  }
});

app.get("/api/whatsapp/qr", requireAuth(["direccion", "encargado", "marketing"]), async (req, res) => {
  if (isReady()) return res.json({ ok: true, connected: true });
  const dataUrl = await getQRImage();
  if (!dataUrl) {
    // Si la reconexión estaba pausada (QR caducado), fuerza un QR nuevo.
    const relanzado = forceReconnect();
    return res.json({ ok: true, connected: false, qr: null, regenerando: relanzado });
  }
  res.json({ ok: true, connected: false, qr: dataUrl });
});

app.get("/api/whatsapp/links", requireAuth(["direccion", "encargado"]), async (req, res) => {
  try {
    const rows = await dbAll(`SELECT local, group_jid FROM wa_links ORDER BY local`);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error" });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/whatsapp/test", requireAuth(["direccion"]), async (req, res) => {
  const { telefono } = req.body;
  if (!telefono) return res.status(400).json({ ok: false, error: "Falta telefono" });
  await sendConfirmacionCliente(telefono, {
    local: "La Tapeta - Blanes",
    dia: "2026-05-20",
    hora: "14:00",
    personas: 2,
    nombre_reserva: "Prueba WhatsApp"
  });
  res.json({ ok: true, mensaje: `Mensaje de prueba enviado a ${telefono}` });
});

app.get("/api/contactos", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const params = [];
    const sql = sqlContactosUnificados(req.query, params);
    const rows = await dbAll(sql, params);
    res.json({ ok: true, data: rows, total: rows.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Poblaciones distintas (para el selector del filtro de Clientes). Vienen de los leads.
// Se declara ANTES de "/api/contactos/:telefono" para que no lo capture esa ruta.
app.get("/api/contactos/poblaciones", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const rows = await dbAll("SELECT DISTINCT TRIM(poblacion) AS poblacion FROM leads WHERE poblacion IS NOT NULL AND TRIM(poblacion) <> '' ORDER BY poblacion");
    res.json({ ok: true, data: (rows || []).map((r) => r.poblacion) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Match por los últimos 9 dígitos del teléfono (robusto al formato +34 / espacios).
const MATCH_TEL9 = (col) => `RIGHT(regexp_replace(${col}, '[^0-9]', '', 'g'), 9) = RIGHT(regexp_replace(?, '[^0-9]', '', 'g'), 9)`;

/**
 * EL EXTRACTOR. Una vez al día lee lo que ha contado la gente por WhatsApp y deja PROPUESTAS
 * en su ficha. No confirma nada: eso lo hace una persona con la frase delante.
 *
 * De noche y por tandas, no en cada mensaje: cuesta dinero por conversación, y lo que alguien
 * cuenta de sí mismo no caduca en unas horas. Se recuerda por dónde iba (`hechos_ultimo_id`),
 * así que un reinicio no vuelve a leer —ni a pagar— lo mismo.
 */
const EXTRACTOR_TOOL = {
  name: "apuntar_hechos",
  description: "Apunta lo que el cliente ha contado DE SÍ MISMO en la conversación.",
  input_schema: {
    type: "object",
    properties: {
      hechos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            etiqueta: { type: "string", enum: Object.keys(ETIQUETAS) },
            valor: { type: "string", description: "Corto y en minúsculas: «celíaca», «martes», «vive en Girona»" },
            texto_original: { type: "string", description: "La frase EXACTA del cliente de la que sale. Sin ella no vale." },
          },
          required: ["etiqueta", "valor", "texto_original"],
        },
      },
    },
    required: ["hechos"],
  },
};

const EXTRACTOR_SISTEMA = `Lees conversaciones de clientes de un grupo de restaurantes y apuntas lo que cuentan DE SÍ MISMOS, para que quien les atienda la próxima vez lo sepa.

REGLAS:
- SOLO lo que la persona dice de SÍ MISMA. «Mi amiga es celíaca» NO se apunta: la celíaca es la amiga, no quien escribe. Ante la duda, no apuntes.
- Cada hecho lleva la frase EXACTA de la que sale, copiada tal cual. Si no puedes copiar una frase que lo diga, ese hecho no existe.
- No deduzcas ni interpretes de más. «Ayer cenamos fenomenal» no es una preferencia; «siempre venimos los martes» sí.
- No apuntes datos de contacto (teléfono, email, dirección), ni nada sobre salud que no sea una dieta o alergia alimentaria dicha por ella misma, ni opiniones sobre el servicio: para eso están las reseñas.
- Si no hay nada que apuntar, devuelve la lista vacía. Es la respuesta correcta la mayoría de las veces.`;

let _extrayendo = false;
async function extraerHechosDeConversaciones({ tanda = 40 } = {}) {
  if (_extrayendo || !process.env.ANTHROPIC_API_KEY) return { saltado: true };
  _extrayendo = true;
  const resumen = { conversaciones: 0, propuestos: 0, descartados: 0 };
  try {
    const desde = Number(await getConfig("hechos_ultimo_id")) || 0;
    const filas = await dbAll(
      `SELECT id, telefono, mensaje FROM whatsapp_messages
        WHERE id > ? AND COALESCE(mensaje,'') <> '' ORDER BY id LIMIT 400`, [desde]);
    if (!filas.length) return resumen;
    const ultimoId = filas[filas.length - 1].id;

    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    for (const conv of conversacionesParaLeer(filas, { maxConversaciones: tanda })) {
      // A quien se ha dado de baja no se le lee nada: pidió que le dejaran en paz.
      const pref = await dbGet(`SELECT baja FROM marketing_prefs WHERE ${MATCH_TEL9("telefono")}`, [conv.telefono]);
      if (pref?.baja) continue;
      resumen.conversaciones++;
      try {
        const resp = await ai.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 700,
          system: EXTRACTOR_SISTEMA,
          tools: [EXTRACTOR_TOOL],
          tool_choice: { type: "tool", name: "apuntar_hechos" },
          messages: [{ role: "user", content: conv.mensajes.map((m) => `Cliente: ${m}`).join("\n") }],
        });
        // Cortado por el tope: el último «hecho» puede ser media frase, y aquí eso se guardaría
        // como algo que sabemos de una persona. Se salta la conversación entera y no vuelve —el
        // marcador avanza igual—, pero perder un hecho es mucho menos malo que apuntar medio:
        // lo que se guarda aquí acaba diciendo que alguien es celíaco.
        if (seCorto(resp)) { console.warn(`[hechos] respuesta cortada en ${conv.telefono}: la salto`); continue; }
        const uso = (resp.content || []).find((c) => c.type === "tool_use");
        const crudos = Array.isArray(uso?.input?.hechos) ? uso.input.hechos : [];
        // El saneado manda: descarta etiquetas inventadas, hechos sin frase, y marca los que
        // suenan a que hablan de otra persona.
        const limpios = crudos.map((h) => sanearHecho(h, { fuente: "whatsapp" })).filter(Boolean);
        resumen.descartados += crudos.length - limpios.length;
        const yaHay = await dbAll(`SELECT etiqueta, valor FROM cliente_hechos WHERE ${MATCH_TEL9("telefono")}`, [conv.telefono]);
        const ahora = isoConOffset(Date.now());
        for (const h of hechosNuevos(limpios, yaHay)) {
          await dbRun(
            `INSERT INTO cliente_hechos (telefono, etiqueta, valor, texto_original, fuente, estado, atribucion_dudosa, creado_en, creado_por)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [conv.telefono, h.etiqueta, h.valor, h.texto_original, h.fuente, h.estado, h.atribucion_dudosa, ahora, "Sara"]);
          resumen.propuestos++;
        }
      } catch (e) { console.error("[hechos] conversación:", e.message); }
    }
    // Se avanza el marcador PASE LO QUE PASE con las conversaciones sueltas: si una falla y
    // nos quedamos atrás, mañana se vuelve a leer entera y se paga otra vez.
    await setConfig("hechos_ultimo_id", ultimoId);
    if (resumen.propuestos) console.log(`[hechos] ${resumen.propuestos} propuesta(s) de ${resumen.conversaciones} conversación(es)`);
    return resumen;
  } catch (e) {
    console.error("[hechos] extractor:", e.message);
    return { ...resumen, error: e.message };
  } finally { _extrayendo = false; }
}

// Cada seis horas, y la primera vez a los cinco minutos de arrancar: ni urgente ni caro.
setTimeout(() => { extraerHechosDeConversaciones().catch(() => {}); }, 5 * 60 * 1000);
setInterval(() => { extraerHechosDeConversaciones().catch(() => {}); }, 6 * 60 * 60 * 1000);

// Para poder lanzarlo a mano y ver qué saca, sin esperar seis horas.
app.post("/api/hechos/extraer", requireAuth(["direccion"]), async (req, res) => {
  const r = await extraerHechosDeConversaciones({ tanda: Math.min(Number(req.body?.tanda) || 15, 40) });
  res.json({ ok: true, ...r });
});

/**
 * TODAS las propuestas pendientes, de todos los clientes.
 *
 * Sin esto el extractor sería trabajo que nadie ve: deja propuestas en fichas que hay que
 * abrir una a una para enterarse. Aquí se repasan seguidas, con la frase delante.
 */
app.get("/api/hechos/propuestos", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const filas = await dbAll(
      `SELECT h.*, COALESCE(l.nombre, r.nombre_reserva) AS nombre
         FROM cliente_hechos h
         LEFT JOIN LATERAL (SELECT nombre FROM leads l2 WHERE RIGHT(regexp_replace(l2.telefono,'[^0-9]','','g'),9) = RIGHT(regexp_replace(h.telefono,'[^0-9]','','g'),9) LIMIT 1) l ON TRUE
         LEFT JOIN LATERAL (SELECT nombre_reserva FROM reservas r2 WHERE RIGHT(regexp_replace(r2.telefono,'[^0-9]','','g'),9) = RIGHT(regexp_replace(h.telefono,'[^0-9]','','g'),9) ORDER BY r2.creado_en DESC LIMIT 1) r ON TRUE
        WHERE h.estado = 'propuesto'
        ORDER BY h.atribucion_dudosa DESC, h.creado_en DESC LIMIT 200`);
    res.json({ ok: true, data: filas, etiquetas: ETIQUETAS });
  } catch (e) {
    console.error("[hechos] propuestos:", e.message);
    res.json({ ok: true, data: [] });
  }
});

// ── Lo que sabemos de un cliente ────────────────────────────────────────────
// El cuaderno: se lee en su ficha, se escribe a mano y —más adelante— lo irá proponiendo la
// IA a partir de lo que la gente cuenta por WhatsApp. Ver src/modules/clientes/hechos.js.
app.get("/api/contactos/:telefono/hechos", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const filas = await dbAll(
      `SELECT * FROM cliente_hechos WHERE ${MATCH_TEL9("telefono")} ORDER BY creado_en DESC`, [req.params.telefono]);
    res.json({ ok: true, data: filas, grupos: agruparHechos(filas), etiquetas: ETIQUETAS });
  } catch (e) {
    console.error("[hechos] listar:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar", data: [], grupos: [] });
  }
});

app.post("/api/contactos/:telefono/hechos", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const h = sanearHecho(req.body, { fuente: "panel" });
    if (!h) return res.status(400).json({ ok: false, error: "Falta la etiqueta o lo que sabemos" });
    const ahora = isoConOffset(Date.now());
    const quien = req.user?.nombre || req.user?.username || null;
    const fila = await dbRun(
      `INSERT INTO cliente_hechos (telefono, etiqueta, valor, texto_original, fuente, estado, atribucion_dudosa, creado_en, creado_por, confirmado_por, confirmado_en)
       VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      [req.params.telefono, h.etiqueta, h.valor, h.texto_original, h.fuente, h.estado, h.atribucion_dudosa, ahora, quien, quien, ahora]);
    res.json({ ok: true, id: fila?.id });
  } catch (e) {
    console.error("[hechos] crear:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar" });
  }
});

// Confirmar o descartar una propuesta. No se borra al descartar: si se borrara, la misma
// conversación volvería a proponer lo mismo mañana y habría que decidirlo otra vez.
app.patch("/api/hechos/:id", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const estado = String(req.body?.estado || "");
    if (!["confirmado", "descartado"].includes(estado)) return res.status(400).json({ ok: false, error: "Estado no válido" });
    await dbRun(`UPDATE cliente_hechos SET estado = ?, confirmado_por = ?, confirmado_en = ? WHERE id = ?`,
      [estado, req.user?.nombre || req.user?.username || null, isoConOffset(Date.now()), Number(req.params.id)]);
    res.json({ ok: true });
  } catch { res.status(500).json({ ok: false, error: "No se pudo actualizar" }); }
});

app.delete("/api/hechos/:id", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try { await dbRun(`DELETE FROM cliente_hechos WHERE id = ?`, [Number(req.params.id)]); res.json({ ok: true }); }
  catch { res.status(500).json({ ok: false, error: "No se pudo borrar" }); }
});

// Ficha de un contacto: datos, visitas/reservas, estado WhatsApp y consentimiento.
app.get("/api/contactos/:telefono", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const tel = req.params.telefono;
    // Si el contacto está duplicado, gana la ficha más completa (y a igualdad, la más
    // reciente). Antes era un LIMIT 1 sin orden: salía una cualquiera, a veces la vacía.
    const lead = await dbGet(
      `SELECT nombre, apellidos, telefono, correo, nacimiento, poblacion, genero, fuente, creado_en, actualizado_en
       FROM leads WHERE ${MATCH_TEL9("telefono")}
       ORDER BY (COALESCE(nacimiento, '') <> '')::int + (COALESCE(poblacion, '') <> '')::int
              + (COALESCE(correo, '') <> '')::int + (COALESCE(apellidos, '') <> '')::int DESC,
              COALESCE(actualizado_en, creado_en) DESC
       LIMIT 1`,
      [tel]
    );
    const reservas = await dbAll(`SELECT local, dia, hora, personas, creado_en FROM reservas WHERE ${MATCH_TEL9("telefono")} ORDER BY dia DESC, hora DESC LIMIT 50`, [tel]);
    const prefs = await dbGet(`SELECT correo, opt_in_wa, opt_in_email, baja, idioma FROM marketing_prefs WHERE ${MATCH_TEL9("telefono")} LIMIT 1`, [tel]);
    const wa = await dbGet(`SELECT nombre, ultima_interaccion FROM wa_clientes WHERE ${MATCH_TEL9("telefono")} ORDER BY ultima_interaccion DESC LIMIT 1`, [tel]);
    const nombre = lead?.nombre || (reservas[0]?.local ? (reservas[0].nombre_reserva || "") : "") || wa?.nombre || "";
    res.json({
      ok: true,
      data: {
        telefono: tel,
        nombre, apellidos: lead?.apellidos || "", correo: lead?.correo || prefs?.correo || "",
        poblacion: lead?.poblacion || "", nacimiento: lead?.nacimiento || "", genero: lead?.genero || null,
        origen: lead ? "lead" : "reserva",
        visitas: reservas.length,
        ultimo_local: reservas[0]?.local || "",
        reservas,
        es_contacto_wa: !!wa,
        wa_ultima: wa?.ultima_interaccion || null,
        prefs: prefs || { opt_in_wa: 0, opt_in_email: 0, baja: 0, idioma: null },
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Editar consentimiento/idioma de un contacto.
app.patch("/api/contactos/prefs", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const { telefono } = req.body;
  if (!telefono) return res.status(400).json({ ok: false, error: "Falta teléfono" });
  try {
    const campos = {};
    for (const k of ["opt_in_wa", "opt_in_email", "baja"]) if (req.body[k] !== undefined) campos[k] = req.body[k] ? 1 : 0;
    for (const k of ["idioma", "correo"]) if (req.body[k] !== undefined) campos[k] = req.body[k] || null;
    await setMarketingPref(telefono, campos);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Mensaje INDIVIDUAL por WhatsApp a un contacto (desde la ficha de Clientes).
app.post("/api/contactos/mensaje", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) return res.status(400).json({ ok: false, error: "Faltan datos" });
  if (!isReady()) return res.status(503).json({ ok: false, error: "WhatsApp no conectado" });
  try {
    await sendMensajeLibre(telefono, mensaje);
    const digits = String(telefono).replace(/\D/g, "");
    const jid = formatTelefonoES(telefono) + "@s.whatsapp.net";
    addSaraToHistorial(jid, mensaje);
    await dbRun(`INSERT INTO whatsapp_messages (jid, telefono, mensaje, respuesta, tipo) VALUES (?, ?, '[Equipo]', ?, 'manual')`, [jid, digits, mensaje]);
    await dbRun(`INSERT INTO wa_clientes (jid, telefono, ultima_interaccion) VALUES (?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT) ON CONFLICT(jid) DO UPDATE SET ultima_interaccion = EXTRACT(EPOCH FROM NOW())::BIGINT`, [jid, digits]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Carga un adjunto (subido vía /api/upload → /uploads/xxx) desde disco como buffer.
function cargarAdjunto(url) {
  try {
    if (!url) return null;
    const nombre = path.basename(String(url).split("?")[0]);
    const fp = path.join(uploadsDir, nombre);
    if (!fs.existsSync(fp)) return null;
    const ext = (nombre.split(".").pop() || "").toLowerCase();
    const mime = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : (ext === "jpg" || ext === "jpeg") ? "image/jpeg" : ext === "webp" ? "image/webp" : "application/octet-stream";
    return { buffer: fs.readFileSync(fp), filename: nombre, mimetype: mime };
  } catch { return null; }
}

// Traduce un texto (plantilla, con variables) a un idioma, con caché en BD y validación:
// si la traducción pierde alguna variable {..} o la IA falla, devuelve el ORIGINAL (nunca rompe).
async function traducirTexto(texto, idioma) {
  const id = normalizarIdioma(idioma);
  if (!id || !necesitaTraduccion(id)) return texto;
  const hash = hashTexto(texto);
  try {
    const cached = await dbGet("SELECT texto_traducido FROM traducciones WHERE idioma = ? AND hash = ?", [id, hash]);
    if (cached) return cached.texto_traducido;
  } catch { /* noop */ }
  if (!process.env.ANTHROPIC_API_KEY) return texto;
  try {
    const { system, messages } = construirTraduccionRequest(texto, id);
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await ai.messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 800, system, messages });
    const out = extractText(resp).trim();
    if (!out || !placeholdersIntactos(texto, out)) return texto; // variables rotas → fallback seguro
    try { await dbRun("INSERT INTO traducciones (idioma, hash, texto_original, texto_traducido) VALUES (?, ?, ?, ?) ON CONFLICT (idioma, hash) DO NOTHING", [id, hash, texto, out]); } catch { /* noop */ }
    return out;
  } catch (e) { console.error("[i18n] traducir:", e.message); return texto; }
}

// Precalcula la plantilla traducida para cada idioma presente entre los contactos.
// Devuelve un resolver (contacto) → texto en su idioma (fallback: original).
async function construirResolverIdioma(mensaje, contactos) {
  const idiomas = idiomasPresentes(contactos, IDIOMA_BASE).filter((i) => necesitaTraduccion(i));
  const mapa = { [IDIOMA_BASE]: mensaje };
  for (const idi of idiomas) mapa[idi] = await traducirTexto(mensaje, idi);
  return (c) => mapa[idiomaDeContacto(c, IDIOMA_BASE)] || mensaje;
}

// Hash corto y estable de un texto (reutiliza crypto, ya importado para facturas).
function hashTexto(texto) { return crypto.createHash("sha256").update(String(texto || "")).digest("hex").slice(0, 32); }

// Envío de un LOTE por WhatsApp con ritmo (jitter) — reutilizado por masivo y campañas.
// Si hay campanaId, registra cada destinatario en campana_envios y cierra la campaña.
// adjunto opcional { buffer, filename, mimetype } → imagen con pie o documento + texto.
// resolverMensaje opcional (contacto)→texto: para traducir por idioma antes de aplicar variables.
// Cuenta un mensaje enviado hoy. Es lo que hace que `dividirPorTope` signifique algo:
// sin este contador, el tope solo miraría los mensajes del pulso e ignoraría las campañas,
// que son las que de verdad pueden quemar el número.
async function contarEnvioWA(n = 1) {
  try {
    const hoy = hoyISO();
    const clave = "wa_enviados_" + hoy;
    await setConfig(clave, String(Number((await getConfig(clave)) || 0) + n));
  } catch { /* nunca debe tumbar un envío */ }
}

async function enviarLoteWA({ contactos, mensaje, campanaId = null, adjunto = null, minMs = 6000, maxMs = 15000, resolverMensaje = null }) {
  let enviados = 0, errores = 0;
  for (const c of contactos) {
    let estado = "enviado", err = null;
    try {
      const base = resolverMensaje ? resolverMensaje(c) : mensaje;
      const texto = aplicarVariables(base, c);
      if (adjunto && adjunto.buffer) await sendMediaLibre(c.telefono, adjunto.buffer, adjunto.filename, adjunto.mimetype, texto);
      else await sendMensajeLibre(c.telefono, texto);
      enviados++;
      await contarEnvioWA(); // el tope diario solo es real si lo cuentan TODOS los caminos
    }
    catch (e) { errores++; estado = "error"; err = (e && e.message) ? String(e.message).slice(0, 200) : "error"; }
    if (campanaId) {
      try { await dbRun(`INSERT INTO campana_envios (campana_id, telefono, nombre, estado, error) VALUES (?, ?, ?, ?, ?)`, [campanaId, c.telefono, `${c.nombre || ""} ${c.apellidos || ""}`.trim(), estado, err]); } catch { /* noop */ }
    }
    await new Promise((r) => setTimeout(r, delayConJitter(minMs, maxMs)));
  }
  if (campanaId) {
    try { await dbRun(`UPDATE campanas_wa SET total_enviados=?, total_errores=?, estado='enviada', finalizado_en=CURRENT_TIMESTAMP WHERE id=?`, [enviados, errores, campanaId]); } catch { /* noop */ }
  }
  return { enviados, errores };
}

// Segmenta desde el segmento guardado y envía una campaña (usado al enviar ya y por el scheduler).
async function dispatchCampana(campanaId) {
  const camp = await dbGet(`SELECT * FROM campanas_wa WHERE id = ?`, [campanaId]);
  if (!camp) return { ok: false };
  if (!isReady()) return { ok: false, motivo: "wa_off" };
  let seg = {}; try { seg = JSON.parse(camp.segmento_json || "{}"); } catch { /* noop */ }
  const params = []; const sql = sqlContactosUnificados(seg, params);
  const contactos = await dbAll(sql, params);
  const { aptos } = filtrarEnviablesWA(contactos, { soloOptIn: !!seg.soloOptIn });
  await dbRun(`UPDATE campanas_wa SET estado='enviando' WHERE id = ?`, [campanaId]);
  const resolverMensaje = seg.traducir ? await construirResolverIdioma(camp.mensaje, aptos) : null;
  enviarLoteWA({ contactos: aptos, mensaje: camp.mensaje, campanaId, adjunto: cargarAdjunto(camp.adjunto_url), resolverMensaje });
  return { ok: true, enviables: aptos.length };
}

// Mensaje MASIVO al conjunto filtrado (excluye SIEMPRE bajas; consentimiento opcional).
app.post("/api/contactos/mensaje-masivo", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const { mensaje, nombre_campana, soloOptIn } = req.body;
  if (!mensaje) return res.status(400).json({ ok: false, error: "Falta el mensaje" });
  if (!isReady()) return res.status(503).json({ ok: false, error: "WhatsApp no conectado" });
  try {
    const params = [];
    const sql = sqlContactosUnificados(req.body, params);
    const contactos = await dbAll(sql, params);
    const { aptos, omitidos } = filtrarEnviablesWA(contactos, { soloOptIn: !!soloOptIn });
    if (!aptos.length) return res.json({ ok: true, total: contactos.length, enviables: 0, omitidos, aviso: "No hay destinatarios enviables (revisa bajas/consentimiento)." });
    const segmento = { q: req.body.q, genero: req.body.genero, poblacion: req.body.poblacion, local: req.body.local, cumple_mes: req.body.cumple_mes };
    const row = await dbRun(`INSERT INTO campanas_wa (nombre, segmento_json, mensaje, total_enviados) VALUES (?, ?, ?, 0) RETURNING id`,
      [nombre_campana || ("Mensaje rápido " + hoyISO()), JSON.stringify(segmento), mensaje]);
    const campanaId = row.id;
    res.json({ ok: true, total: contactos.length, enviables: aptos.length, omitidos, campana_id: campanaId });
    enviarLoteWA({ contactos: aptos, mensaje, campanaId });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── CAMPAÑAS WHATSAPP ─────────────────────────────────────────────────
app.post("/api/campanas/preview", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const params = [];
    const sql = sqlContactosUnificados({ ...req.body, excluir_baja: 1 }, params);
    const rows = await dbAll(sql, params);
    const { aptos, omitidos } = filtrarEnviablesWA(rows, { soloOptIn: !!req.body.soloOptIn });
    const aptosSet = new Set(aptos.map((c) => c.telefono));
    // Lista editable (nombre/teléfono + si es enviable) para "ver/editar destinatarios". Cap 500.
    const lista = rows.slice(0, 500).map((c) => ({ nombre: c.nombre, apellidos: c.apellidos, telefono: c.telefono, enviable: aptosSet.has(c.telefono) }));
    res.json({ ok: true, total: rows.length, enviables: aptos.length, omitidos, muestra: rows.slice(0, 5), lista });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/campanas/enviar", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const { nombre_campana, mensaje, genero, poblacion, local, cumple_mes } = req.body;
  if (!mensaje || !nombre_campana) return res.status(400).json({ ok: false, error: "Faltan campos" });
  if (!isReady()) return res.status(503).json({ ok: false, error: "WhatsApp no conectado" });

  try {
    const params = [];
    const sql = sqlContactosUnificados(req.body, params);
    const contactos = await dbAll(sql, params);
    if (!contactos.length) return res.json({ ok: false, error: "No hay contactos con ese filtro" });

    const segmento = { genero, poblacion, local, cumple_mes };
    const campanaRow = await dbRun(
      `INSERT INTO campanas_wa (nombre, segmento_json, mensaje, total_enviados) VALUES (?, ?, ?, 0) RETURNING id`,
      [nombre_campana, JSON.stringify(segmento), mensaje]
    );
    const campanaId = campanaRow.id;
    res.json({ ok: true, total: contactos.length, campana_id: campanaId });

    // Enviar en background con delay
    (async () => {
      let enviados = 0, errores = 0;
      for (const c of contactos) {
        try {
          const texto = mensaje
            .replace(/\{nombre\}/gi, c.nombre)
            .replace(/\{apellidos\}/gi, c.apellidos)
            .replace(/\{nombre_completo\}/gi, `${c.nombre} ${c.apellidos}`);
          await sendMensajeLibre(c.telefono, texto);
          enviados++;
        } catch (_) { errores++; }
        await new Promise(r => setTimeout(r, 4000));
      }
      await dbRun(
        `UPDATE campanas_wa SET total_enviados=?, total_errores=?, finalizado_en=CURRENT_TIMESTAMP WHERE id=?`,
        [enviados, errores, campanaId]
      );
      console.log(`📣 Campaña "${nombre_campana}" completada: ${enviados} enviados, ${errores} errores`);
    })();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/campanas", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM campanas_wa ORDER BY creado_en DESC LIMIT 50`);
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// Crear una campaña: guardar borrador, programar o enviar ya (según `accion`).
app.post("/api/campanas", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const { nombre, mensaje, asunto = null, canal = "whatsapp", plantilla_id = null, accion = "borrador", programada_para = null, soloOptIn = false, adjunto_url = null } = req.body || {};
  if (!nombre || !mensaje) return res.status(400).json({ ok: false, error: "Faltan nombre y mensaje" });
  if (canal !== "whatsapp") return res.status(400).json({ ok: false, error: "El canal email aún no está disponible" });
  try {
    const seg = { q: req.body.q, genero: req.body.genero, poblacion: req.body.poblacion, local: req.body.local, cumple_mes: req.body.cumple_mes, con_email: req.body.con_email, con_telefono: req.body.con_telefono, idioma: req.body.idioma, origen: req.body.origen, from: req.body.from, to: req.body.to,
      // Los tres nuevos: quién vino de verdad, la edad y el cumpleaños por días. Si no se
      // guardan en el segmento, la campaña programada se enviaría a otra gente que la que se
      // vio al crearla — y eso no se nota hasta que ya ha salido.
      reservo_from: req.body.reservo_from, reservo_to: req.body.reservo_to,
      edad_min: req.body.edad_min, edad_max: req.body.edad_max, cumple_en_dias: req.body.cumple_en_dias, excluir_telefonos: Array.isArray(req.body.excluir_telefonos) ? req.body.excluir_telefonos : [], traducir: !!req.body.traducir, excluir_baja: 1, soloOptIn: !!soloOptIn };
    // Recuento de enviables para informar
    const params = []; const contactos = await dbAll(sqlContactosUnificados(seg, params), params);
    const { aptos, omitidos } = filtrarEnviablesWA(contactos, { soloOptIn: !!soloOptIn });
    let estado = "borrador";
    if (accion === "programar" && programada_para) estado = "programada";
    else if (accion === "enviar") estado = "enviando";
    const row = await dbRun(
      `INSERT INTO campanas_wa (nombre, segmento_json, mensaje, asunto, canal, plantilla_id, estado, programada_para, adjunto_url, total_enviados) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0) RETURNING id`,
      [nombre, JSON.stringify(seg), mensaje, asunto, canal, plantilla_id, estado, accion === "programar" ? programada_para : null, adjunto_url]
    );
    const id = row.id;
    if (accion === "enviar") {
      if (!isReady()) { await dbRun(`UPDATE campanas_wa SET estado='borrador' WHERE id=?`, [id]); return res.status(503).json({ ok: false, error: "WhatsApp no conectado", campana_id: id }); }
      res.json({ ok: true, campana_id: id, estado: "enviando", enviables: aptos.length, omitidos });
      const resolverMensaje = seg.traducir ? await construirResolverIdioma(mensaje, aptos) : null;
      enviarLoteWA({ contactos: aptos, mensaje, campanaId: id, adjunto: cargarAdjunto(adjunto_url), resolverMensaje });
      return;
    }
    res.json({ ok: true, campana_id: id, estado, enviables: aptos.length, omitidos });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Detalle de una campaña con resultados por destinatario.
app.get("/api/campanas/:id", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    // Un id que no es un número no se le pasa a la base: Postgres contesta «invalid input
    // syntax for type integer» y eso sale por pantalla como un error del sistema. Pasó de
    // verdad —una llamada mal hecha a /api/campanas/redactar cayó aquí— y lo que se leyó fue
    // un mensaje de Postgres en medio de Campañas.
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ ok: false, error: "No existe" });
    const camp = await dbGet(`SELECT * FROM campanas_wa WHERE id = ?`, [req.params.id]);
    if (!camp) return res.status(404).json({ ok: false, error: "No existe" });
    const envios = await dbAll(`SELECT telefono, nombre, estado, error, enviado_en FROM campana_envios WHERE campana_id = ? ORDER BY id DESC LIMIT 500`, [req.params.id]);
    res.json({ ok: true, data: { campana: camp, envios, resumen: resumenEnvios(envios) } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Disparar el envío de una campaña existente (borrador/programada).
app.post("/api/campanas/:id/enviar", requireAuth(["direccion", "marketing"]), async (req, res) => {
  if (!isReady()) return res.status(503).json({ ok: false, error: "WhatsApp no conectado" });
  try {
    const r = await dispatchCampana(req.params.id);
    if (!r.ok) return res.status(400).json({ ok: false, error: r.motivo === "wa_off" ? "WhatsApp no conectado" : "No se pudo enviar" });
    res.json({ ok: true, enviables: r.enviables });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/campanas/:id", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try { await dbRun(`DELETE FROM campanas_wa WHERE id = ?`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Editar una campaña en borrador/programada (nombre, mensaje, audiencia, adjunto, fecha).
app.patch("/api/campanas/:id", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const camp = await dbGet(`SELECT * FROM campanas_wa WHERE id = ?`, [req.params.id]);
    if (!camp) return res.status(404).json({ ok: false, error: "No existe" });
    if (!["borrador", "programada"].includes(camp.estado)) return res.status(409).json({ ok: false, error: "Solo se pueden editar campañas en borrador o programadas" });
    const b = req.body || {};
    let seg = {}; try { seg = JSON.parse(camp.segmento_json || "{}"); } catch { /* noop */ }
    // Campos de segmentación editables (los que llegan se reemplazan).
    for (const k of ["q", "genero", "poblacion", "local", "cumple_mes", "con_email", "con_telefono", "idioma", "origen", "from", "to"]) {
      if (b[k] !== undefined) seg[k] = b[k];
    }
    if (b.excluir_telefonos !== undefined) seg.excluir_telefonos = Array.isArray(b.excluir_telefonos) ? b.excluir_telefonos : [];
    if (b.soloOptIn !== undefined) seg.soloOptIn = !!b.soloOptIn;
    if (b.traducir !== undefined) seg.traducir = !!b.traducir;
    seg.excluir_baja = 1;
    const nombre = b.nombre !== undefined ? b.nombre : camp.nombre;
    const mensaje = b.mensaje !== undefined ? b.mensaje : camp.mensaje;
    const adjunto_url = b.adjunto_url !== undefined ? b.adjunto_url : camp.adjunto_url;
    const programada_para = b.programada_para !== undefined ? b.programada_para : camp.programada_para;
    const estado = programada_para ? "programada" : "borrador";
    await dbRun(`UPDATE campanas_wa SET nombre=?, mensaje=?, segmento_json=?, adjunto_url=?, programada_para=?, estado=? WHERE id=?`,
      [nombre, mensaje, JSON.stringify(seg), adjunto_url, programada_para || null, estado, req.params.id]);
    res.json({ ok: true, estado });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── AUDIENCIAS GUARDADAS ──────────────────────────────────────────────
app.get("/api/audiencias", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try { res.json({ ok: true, data: await dbAll(`SELECT * FROM audiencias ORDER BY creado_en DESC`) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.post("/api/audiencias", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const { nombre, filtros } = req.body || {};
  if (!nombre || !filtros || typeof filtros !== "object") return res.status(400).json({ ok: false, error: "Faltan nombre y filtros" });
  try { const row = await dbRun(`INSERT INTO audiencias (nombre, filtros_json) VALUES (?, ?) RETURNING id`, [nombre, JSON.stringify(filtros)]); res.json({ ok: true, id: row.id }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.delete("/api/audiencias/:id", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try { await dbRun(`DELETE FROM audiencias WHERE id = ?`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Detecta el idioma de los clientes a partir de sus mensajes de WhatsApp y lo cachea en
// marketing_prefs.idioma. Solo rellena los que NO tienen idioma; castellano no se guarda (es el base).
app.post("/api/contactos/detectar-idiomas", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const rows = await dbAll(`SELECT telefono, string_agg(mensaje, ' ') AS textos FROM whatsapp_messages WHERE mensaje IS NOT NULL AND mensaje <> '' GROUP BY telefono`, []);
    let revisados = 0, actualizados = 0;
    for (const r of rows) {
      revisados++;
      const tel = formatTelefonoES(r.telefono); if (!tel) continue;
      const pref = await dbGet(`SELECT idioma FROM marketing_prefs WHERE RIGHT(regexp_replace(telefono,'[^0-9]','','g'),9) = RIGHT(regexp_replace(?,'[^0-9]','','g'),9)`, [tel]);
      if (pref && pref.idioma) continue; // ya tiene idioma → respetamos (editable en la ficha)
      const idi = detectarIdioma(r.textos);
      if (!idi || idi === IDIOMA_BASE) continue; // sin señal clara o castellano → nada que guardar
      await setMarketingPref(tel, { idioma: idi });
      actualizados++;
    }
    res.json({ ok: true, revisados, actualizados });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── PLANTILLAS DE MENSAJE ─────────────────────────────────────────────
app.get("/api/plantillas", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try { res.json({ ok: true, data: await dbAll(`SELECT * FROM plantillas_mensaje ORDER BY creado_en DESC`) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.post("/api/plantillas", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const { nombre, cuerpo, canal = "whatsapp", asunto = null, idioma = "es" } = req.body || {};
  if (!nombre || !cuerpo) return res.status(400).json({ ok: false, error: "Faltan nombre y cuerpo" });
  try { const row = await dbRun(`INSERT INTO plantillas_mensaje (nombre, canal, asunto, cuerpo, idioma) VALUES (?, ?, ?, ?, ?) RETURNING id`, [nombre, canal, asunto, cuerpo, idioma]); res.json({ ok: true, id: row.id }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.delete("/api/plantillas/:id", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try { await dbRun(`DELETE FROM plantillas_mensaje WHERE id = ?`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Config de la automatización de cumpleaños (on/off + plantilla).
/**
 * Apuntar un filtro que no tenemos. Lo escribe una persona («no encuentro cómo filtrar por…»)
 * y más adelante lo escribirá también el traductor de campañas cuando no sepa traducir algo.
 *
 * La clave es el texto normalizado: pedir «gente con hijos» y «con hijos» tiene que sumar en
 * la misma línea, o la lista se convierte en cien peticiones de una vez cada una.
 */
/**
 * DE UNA FRASE A UNA CAMPAÑA.
 *
 * Laura escribe «quiero felicitar y regalar un café a los que cumplen años esta semana» y esto
 * devuelve una PROPUESTA: a quién, cuánta gente es y qué mensaje. No envía nada.
 *
 * El reparto de trabajo es el que importa:
 *   · el modelo TRADUCE la frase a filtros y redacta el mensaje;
 *   · el servidor DECIDE qué filtros son de verdad (`sanearSegmento`) y CUENTA la gente con la
 *     misma consulta que usará al enviar.
 * Así el número que se lee antes de dar a enviar es el número de verdad, no uno que ha dicho
 * un modelo — que es la diferencia entre una propuesta que se puede aprobar y una que no.
 *
 * Y lo que no se puede traducir se DICE y se APUNTA en la libreta: pedir «españoles» y recibir
 * en silencio «idioma español» haría creer que se ha filtrado por nacionalidad.
 */
const CAMPANA_TOOL = {
  name: "proponer_campana",
  description: "Propone una campaña de WhatsApp a partir de lo que ha pedido la persona de marketing.",
  input_schema: {
    type: "object",
    properties: {
      nombre: { type: "string", description: "Nombre corto de la campaña, para la lista" },
      mensaje: { type: "string", description: "El mensaje de WhatsApp, en español, tuteando, sin emojis de más y sin inventar ofertas ni precios que no se hayan pedido" },
      segmento: {
        type: "object",
        description: "Solo estos campos. Lo que no se pueda expresar aquí NO se pone en ningún sitio: va en no_traducido.",
        properties: {
          genero: { type: "string", enum: ["hombre", "mujer"] },
          poblacion: { type: "string" },
          local: { type: "string", description: "Nombre EXACTO de un establecimiento de la lista" },
          origen: { type: "string", enum: ["lead", "reserva"], description: "lead = tiene ficha con datos; reserva = solo ha reservado" },
          idioma: { type: "string", enum: ["es", "ca", "en"] },
          edad_min: { type: "integer" }, edad_max: { type: "integer" },
          cumple_mes: { type: "string", description: "MM" },
          cumple_en_dias: { type: "integer", description: "0 = hoy, 7 = esta semana" },
          reservo_from: { type: "string", description: "AAAA-MM-DD" },
          reservo_to: { type: "string", description: "AAAA-MM-DD" },
          con_email: { type: "boolean" }, sin_email: { type: "boolean" },
          sin_nacimiento: { type: "boolean", description: "No sabemos su fecha de nacimiento" },
          sin_poblacion: { type: "boolean" },
        },
      },
      no_traducido: {
        type: "array", items: { type: "string" },
        description: "Cada cosa que ha pedido y NO se puede expresar con los campos de arriba, con sus palabras. P. ej. «que sean españoles» (no guardamos nacionalidad) o «que tengan hijos».",
      },
      explicacion: { type: "string", description: "Una frase explicando por qué ese segmento" },
    },
    required: ["nombre", "mensaje", "segmento"],
  },
};

app.post("/api/campanas/redactar", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const texto = String(req.body?.texto || "").trim().slice(0, 1000);
    if (!texto) return res.status(400).json({ ok: false, error: "Cuéntame qué campaña quieres hacer" });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ ok: false, error: "La IA no está configurada" });
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const hoy = hoyISO();
    const sistema = `Eres quien prepara campañas de WhatsApp para Familia del Amor, un grupo de restauración de la Costa Brava.
Hoy es ${hoy}. Los establecimientos, con su nombre EXACTO: ${INV_LOCALES.join(" | ")}.
Traduce lo que te piden a los campos de la herramienta y redacta el mensaje.
REGLAS QUE NO SE SALTAN:
- Las fechas relativas las resuelves tú a fechas concretas: «el mes pasado» son del 1 al último día del mes anterior a hoy.
- NO inventes ofertas, precios, descuentos ni horarios que no te hayan dicho. Si te piden «regalar un café», el café se regala; nada más.
- Si algo de lo que piden NO se puede expresar con los campos disponibles, NO lo aproximes con otro campo parecido: ponlo en "no_traducido" con las palabras de quien lo pidió.
- El mensaje: español, de tú, dos o tres frases, sin emojis de relleno y sin prometer nada que no se haya pedido. Si hace falta que la persona conteste algo, pídelo claro.`;

    const resp = await ai.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: sistema,
      tools: [CAMPANA_TOOL],
      tool_choice: { type: "tool", name: "proponer_campana" },
      messages: [{ role: "user", content: texto }],
    });
    // Si se cortó por el tope de tokens, el mensaje llega a medias y el segmento puede venir
    // incompleto. Proponer eso es peor que no proponer nada: la campaña PARECE buena y se
    // enviaría un WhatsApp cortado a mitad de frase a cientos de personas.
    if (seCorto(resp)) {
      console.warn("[campanas] la respuesta se cortó por max_tokens");
      return res.status(502).json({ ok: false, error: "La respuesta se ha cortado. Prueba a pedirlo más corto." });
    }
    const uso = (resp.content || []).find((c) => c.type === "tool_use");
    if (!uso) {
      // Lo que contestó en vez de usar la herramienta es LO ÚNICO con lo que se puede depurar
      // esto luego; sin ello solo queda «no supo», que no dice nada.
      const dijo = (resp.content || []).filter((c) => c.type === "text").map((c) => c.text).join(" ").slice(0, 300);
      console.warn(`[campanas] sin herramienta (stop=${resp.stop_reason}). Contestó: ${dijo || "(nada)"}`);
      return res.status(502).json({ ok: false, error: "No he sabido convertir eso en una campaña. Prueba a decirlo de otra manera." });
    }

    const { segmento, descartados } = sanearSegmento(uso.input?.segmento || {}, { locales: INV_LOCALES });
    // Nunca se escribe a quien se ha dado de baja, lo pida quien lo pida.
    const seg = { ...segmento, excluir_baja: 1 };
    const params = [];
    const contactos = await dbAll(sqlContactosUnificados(seg, params), params);
    const { aptos, omitidos } = filtrarEnviablesWA(contactos, { soloOptIn: false });

    // Lo que no se ha podido traducir va a la libreta: es la lista que dirá qué datos merece
    // la pena empezar a pedir.
    const noTraducido = [...(Array.isArray(uso.input?.no_traducido) ? uso.input.no_traducido : []),
      ...descartados.map((d) => `${d.campo}: ${d.valor} (${d.motivo})`)];
    for (const q of noTraducido.slice(0, 5)) {
      const clave = claveFalta(q);
      if (!clave) continue;
      const ahora = isoConOffset(Date.now());
      await dbRun(
        `INSERT INTO marketing_faltan (clave, que_pidieron, contexto, veces, primera_vez, ultima_vez, quien)
         VALUES (?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT (clave) DO UPDATE SET veces = marketing_faltan.veces + 1, ultima_vez = EXCLUDED.ultima_vez`,
        [clave, String(q).slice(0, 200), texto.slice(0, 300), ahora, ahora, req.user?.nombre || req.user?.username || null]
      ).catch(() => { /* la libreta nunca puede tumbar la propuesta */ });
    }

    res.json({
      ok: true,
      nombre: String(uso.input?.nombre || "Campaña").slice(0, 120),
      mensaje: String(uso.input?.mensaje || "").slice(0, 1500),
      explicacion: String(uso.input?.explicacion || "").slice(0, 400),
      segmento,
      descripcion: describirSegmento(segmento),
      // Los números los da la consulta, no el modelo.
      total: contactos.length,
      enviables: aptos.length,
      omitidos,
      noTraducido,
    });
  } catch (e) {
    console.error(`[campanas] redactar (${e.status || "sin status"}):`, e.message);
    res.status(500).json({ ok: false, error: mensajeDeErrorIA(e, "la propuesta") });
  }
});

app.post("/api/marketing/faltan", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const que = String(req.body?.que || "").trim().slice(0, 200);
    if (!que) return res.status(400).json({ ok: false, error: "¿Qué filtro te falta?" });
    const clave = claveFalta(que);
    if (!clave) return res.status(400).json({ ok: false, error: "Escríbelo con un poco más de detalle" });
    const ahora = isoConOffset(Date.now());
    const quien = req.user?.nombre || req.user?.username || null;
    await dbRun(
      `INSERT INTO marketing_faltan (clave, que_pidieron, contexto, veces, primera_vez, ultima_vez, quien)
       VALUES (?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT (clave) DO UPDATE SET veces = marketing_faltan.veces + 1, ultima_vez = EXCLUDED.ultima_vez,
         contexto = COALESCE(EXCLUDED.contexto, marketing_faltan.contexto)`,
      [clave, que, String(req.body?.contexto || "").trim().slice(0, 300) || null, ahora, ahora, quien]);
    res.json({ ok: true });
  } catch (e) {
    console.error("[marketing] faltan:", e.message);
    res.status(500).json({ ok: false, error: "No se pudo apuntar" });
  }
});

app.get("/api/marketing/faltan", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const data = await dbAll(`SELECT * FROM marketing_faltan LIMIT 200`);
    res.json({ ok: true, data: ordenarFaltas(data) });
  } catch { res.json({ ok: true, data: [] }); }
});

app.delete("/api/marketing/faltan/:id", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try { await dbRun(`DELETE FROM marketing_faltan WHERE id = ?`, [Number(req.params.id)]); res.json({ ok: true }); }
  catch { res.status(500).json({ ok: false, error: "No se pudo quitar" }); }
});

app.get("/api/campanas-config", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try { res.json({ ok: true, cumple_auto: (await getConfig("cumple_auto")) === "1", cumple_plantilla: (await getConfig("cumple_plantilla")) || "" }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.post("/api/campanas-config", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    if (req.body.cumple_auto !== undefined) await setConfig("cumple_auto", req.body.cumple_auto ? "1" : "0");
    if (req.body.cumple_plantilla !== undefined) await setConfig("cumple_plantilla", String(req.body.cumple_plantilla || ""));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/whatsapp/send", requireAuth(["direccion"]), async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) return res.status(400).json({ ok: false, error: "Faltan datos" });
  if (!isReady()) return res.status(503).json({ ok: false, error: "WhatsApp no conectado" });
  try {
    await sendMensajeLibre(telefono, mensaje);
    const jid = telefono.replace(/\D/g, "").replace(/^00/, "").replace(/^(?!34)([679])/, "34$1") + "@s.whatsapp.net";
    addSaraToHistorial(jid, mensaje);
    await dbRun(
      `INSERT INTO whatsapp_messages (jid, telefono, mensaje, respuesta, tipo) VALUES (?, ?, '[Equipo]', ?, 'manual')`,
      [jid, telefono.replace(/\D/g, ""), mensaje]
    );
    await dbRun(
      `INSERT INTO wa_clientes (jid, telefono, ultima_interaccion)
       VALUES (?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
       ON CONFLICT(jid) DO UPDATE SET ultima_interaccion = EXTRACT(EPOCH FROM NOW())::BIGINT`,
      [jid, telefono.replace(/\D/g, "")]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/whatsapp/mensajes", requireAuth(["direccion"]), async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT w.*, COALESCE(l.nombre || ' ' || COALESCE(l.apellidos,''), w.telefono) AS nombre_contacto
       FROM whatsapp_messages w
       LEFT JOIN leads l ON l.telefono = w.telefono
       ORDER BY w.creado_en ASC`
    );
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// ── Configurador conversacional de Sara ─────────────────────────────────────
const SARA_LOCALES = [
  "La Tapeta - Blanes", "Cooperativa - Blanes", "La Tapeta - Lloret",
  "La Tapeta - Girona", "Can Mateu - Tordera", "La Tapa Ibérica - Tordera",
  "Botiga d'en Mateu - Tordera"
];

async function getSaraEstado() {
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const instrucciones = (await getConfig("sara_instrucciones")) || "";
  const bloqueos = await dbAll(`SELECT * FROM bloqueos_reservas WHERE hasta::date >= ?::date ORDER BY desde`, [hoy]);
  const reglas = await dbAll(`SELECT * FROM sara_respuestas WHERE activo = 1 ORDER BY id DESC`);
  return { instrucciones, bloqueos, reglas };
}

async function getDocsDisponibles() {
  const rows = await dbAll(
    `SELECT key, value FROM contents WHERE key LIKE 'local_%menu%pdf' AND value IS NOT NULL AND value != ''`
  );
  return rows.map(r => ({ key: r.key, url: r.value }));
}

const SARA_PROPOSAL_TOOLS = [
  {
    name: "proponer_instrucciones",
    description: "Propone fijar/actualizar el texto de instrucciones generales de comportamiento de Sara (reemplaza el texto anterior).",
    input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] }
  },
  {
    name: "proponer_bloqueo",
    description: "Propone bloquear reservas en un local (o 'Todos') entre dos fechas (YYYY-MM-DD).",
    input_schema: {
      type: "object",
      properties: {
        local: { type: "string" },
        desde: { type: "string", description: "YYYY-MM-DD" },
        hasta: { type: "string", description: "YYYY-MM-DD" },
        motivo: { type: "string" }
      },
      required: ["local", "desde", "hasta"]
    }
  },
  {
    name: "proponer_regla_documento",
    description: "Propone que Sara envíe un documento/carta PDF cuando se cumpla un disparador. documento_url debe ser una URL de las cartas ya subidas.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "Nombre corto de la regla" },
        disparadores: { type: "string", description: "Cuándo enviarlo (ej. 'preguntan por la carta de Blanes')" },
        documento_url: { type: "string" },
        respuesta: { type: "string", description: "Texto opcional que Sara diga además de enviar el PDF" },
        local: { type: "string" }
      },
      required: ["tema", "disparadores", "documento_url"]
    }
  },
  {
    name: "proponer_respuesta_texto",
    description: "Propone una respuesta de texto configurada (sin documento) para un tema/disparador.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string" },
        disparadores: { type: "string" },
        respuesta: { type: "string" }
      },
      required: ["tema", "disparadores", "respuesta"]
    }
  },
  {
    name: "proponer_eliminar",
    description: "Propone eliminar un bloqueo o una regla por su id.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["bloqueo", "regla"] },
        id: { type: "integer" }
      },
      required: ["tipo", "id"]
    }
  },
  {
    name: "proponer_set_contenido",
    description: "Coloca/actualiza un contenido de la web en una 'key' EXACTA del catálogo: una carta/menú PDF, una imagen o un enlace. Ej: poner una carta subida como carta de un local (key local_<slug>_menu_pdf, value = URL subida).",
    input_schema: {
      type: "object",
      properties: { key: { type: "string" }, value: { type: "string" } },
      required: ["key", "value"]
    }
  },
  {
    name: "proponer_set_texto",
    description: "Cambia un texto editable de la web (títulos, subtítulos, textos) para un idioma. Usa una 'key' de tipo texto del catálogo.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        texto: { type: "string" },
        idioma: { type: "string", enum: ["es", "ca", "en"] }
      },
      required: ["key", "texto"]
    }
  },
  {
    name: "proponer_anadir_galeria",
    description: "Añade una o varias fotos (URLs subidas) a una galería del catálogo (galería de un local o galería general).",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        urls: { type: "array", items: { type: "string" } }
      },
      required: ["key", "urls"]
    }
  }
];

app.get("/api/sara/estado", requireAuth(["marketing", "direccion"]), async (req, res) => {
  try {
    res.json({ ok: true, ...(await getSaraEstado()) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/sara/chat", requireAuth(["marketing", "direccion"]), async (req, res) => {
  try {
    const mensajes = Array.isArray(req.body?.mensajes) ? req.body.mensajes.slice(-20) : [];
    if (!mensajes.length) return res.status(400).json({ ok: false, error: "Sin mensajes" });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: "IA no configurada" });
    const adjuntos = Array.isArray(req.body?.adjuntos) ? req.body.adjuntos.filter(u => typeof u === "string" && u).slice(0, 5) : [];

    const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
    const estado = await getSaraEstado();
    const docs = await getDocsDisponibles();
    const resumenEstado =
      `INSTRUCCIONES ACTUALES: ${estado.instrucciones || "(ninguna)"}\n` +
      `BLOQUEOS ACTIVOS: ${estado.bloqueos.map(b => `#${b.id} ${b.local} ${b.desde}→${b.hasta}${b.motivo ? " ("+b.motivo+")" : ""}`).join("; ") || "(ninguno)"}\n` +
      `REGLAS: ${estado.reglas.map(r => `#${r.id} ${r.tema}${r.documento_url ? " [PDF]" : ""}`).join("; ") || "(ninguna)"}\n` +
      `CARTAS/MENÚS PDF YA SUBIDOS: ${docs.map(d => `${d.key} → ${d.url}`).join("; ") || "(ninguna subida aún)"}`;

    const { locales: regLocales } = getContentRegistry();
    const globalCat = Object.entries(GLOBAL_FIELDS).map(([k, d]) => `  ${k}: ${d.label} (${d.type})`).join("\n");
    const localFieldsCat = LOCAL_FIELDS.map(f => `  local_<slug>_${f.suffix}: ${f.label} (${f.type})`).join("\n");
    const slugsCat = regLocales.map(l => `${l.slug} = ${l.name}`).join(" | ");
    const catalogo = `CATÁLOGO DE CONTENIDOS EDITABLES (usa la 'key' EXACTA):\nGlobales:\n${globalCat}\nPor local (sustituye <slug>):\n${localFieldsCat}\nSlugs de local: ${slugsCat}`;

    const adjuntoTxt = adjuntos.length
      ? `\n\nARCHIVO(S) QUE EL USUARIO ACABA DE SUBIR (usa estas URLs como 'value'): ${adjuntos.join(", ")}`
      : "";

    const system = `Eres el asistente de configuración de "Sara", el chatbot de WhatsApp del grupo de restaurantes Familia del Amor. Ayudas al equipo de marketing a cambiar el comportamiento de Sara y el contenido de la web SIN tocar código.

Hoy es ${hoy} (zona Europe/Madrid). Locales de reserva (nombres EXACTOS): ${SARA_LOCALES.join(" | ")}. Para bloquear todos, usa "Todos".

${resumenEstado}

${catalogo}

REGLAS:
- Cuando el usuario pida un cambio, resume en una frase clara qué vas a hacer Y llama a la herramienta de propuesta correspondiente con datos concretos. NO apliques nada tú: solo propones; el sistema pedirá confirmación.
- Resuelve fechas relativas a fechas concretas YYYY-MM-DD usando la fecha de hoy.
- COLOCAR ARCHIVOS/CONTENIDO: si el usuario sube un archivo y te dice dónde va (ej. "como carta de La Tapeta Blanes"), usa proponer_set_contenido con la key EXACTA del catálogo (ej. local_la-tapeta-blanes_menu_pdf) y value = la URL subida. Para textos usa proponer_set_texto (idioma es/ca/en, por defecto es). Para añadir fotos a una galería usa proponer_anadir_galeria con las URLs subidas.
- Usa SIEMPRE una key EXACTA del catálogo. Si no encuentras el destino o falta info (local, qué campo), pregunta. No inventes keys ni URLs.
- Habla en español, cercano y breve.`;

    const mensajesLLM = mensajes.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }));
    if (adjuntoTxt && mensajesLLM.length) {
      const last = mensajesLLM[mensajesLLM.length - 1];
      if (last.role === "user") last.content += adjuntoTxt;
    }

    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await ai.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system,
      tools: SARA_PROPOSAL_TOOLS,
      messages: mensajesLLM
    });

    let reply = "";
    let proposal = null;
    for (const block of response.content) {
      if (block.type === "text") reply += block.text;
      if (block.type === "tool_use" && !proposal) proposal = { tipo: block.name, datos: block.input };
    }
    if (!reply.trim()) reply = proposal ? "Te propongo este cambio, ¿lo confirmo?" : "¿En qué quieres que ayude con Sara?";
    res.json({ ok: true, reply: reply.trim(), proposal });
  } catch (e) {
    console.error("Error en /api/sara/chat:", e.message);
    res.status(500).json({ ok: false, error: "Error del asistente" });
  }
});

app.post("/api/sara/aplicar", requireAuth(["marketing", "direccion"]), async (req, res) => {
  try {
    const { tipo, datos } = req.body?.proposal || {};
    if (!tipo || !datos) return res.status(400).json({ ok: false, error: "Propuesta inválida" });
    const fechaOk = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

    if (tipo === "proponer_instrucciones") {
      await setConfig("sara_instrucciones", String(datos.texto || "").slice(0, 4000));
    } else if (tipo === "proponer_bloqueo") {
      const local = datos.local === "Todos" ? "Todos" : datos.local;
      if (local !== "Todos" && !SARA_LOCALES.includes(local)) return res.status(400).json({ ok: false, error: "Local no válido" });
      if (!fechaOk(datos.desde) || !fechaOk(datos.hasta)) return res.status(400).json({ ok: false, error: "Fechas no válidas" });
      const [desde, hasta] = datos.desde <= datos.hasta ? [datos.desde, datos.hasta] : [datos.hasta, datos.desde];
      await dbRun(`INSERT INTO bloqueos_reservas (local, desde, hasta, motivo) VALUES (?, ?, ?, ?)`,
        [local, desde, hasta, (datos.motivo || "").slice(0, 200) || null]);
    } else if (tipo === "proponer_regla_documento") {
      if (!datos.tema || !datos.documento_url) return res.status(400).json({ ok: false, error: "Faltan datos de la regla" });
      await dbRun(`INSERT INTO sara_respuestas (tema, disparadores, respuesta, documento_url, local, activo) VALUES (?, ?, ?, ?, ?, 1)`,
        [String(datos.tema).slice(0, 120), (datos.disparadores || "").slice(0, 400) || null, (datos.respuesta || "").slice(0, 1000) || null, String(datos.documento_url).slice(0, 500), datos.local || null]);
    } else if (tipo === "proponer_respuesta_texto") {
      if (!datos.tema || !datos.respuesta) return res.status(400).json({ ok: false, error: "Faltan datos de la respuesta" });
      await dbRun(`INSERT INTO sara_respuestas (tema, disparadores, respuesta, activo) VALUES (?, ?, ?, 1)`,
        [String(datos.tema).slice(0, 120), (datos.disparadores || "").slice(0, 400) || null, String(datos.respuesta).slice(0, 1000)]);
    } else if (tipo === "proponer_eliminar") {
      const id = parseInt(datos.id);
      if (!id) return res.status(400).json({ ok: false, error: "id no válido" });
      if (datos.tipo === "bloqueo") await dbRun(`DELETE FROM bloqueos_reservas WHERE id = ?`, [id]);
      else if (datos.tipo === "regla") await dbRun(`DELETE FROM sara_respuestas WHERE id = ?`, [id]);
      else return res.status(400).json({ ok: false, error: "Tipo a eliminar no válido" });
    } else if (tipo === "proponer_set_contenido") {
      const { campos } = getContentRegistry();
      if (!keyEnRegistro(datos.key, campos)) return res.status(400).json({ ok: false, error: "Campo no permitido: " + datos.key });
      await dbRun(
        `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
        [datos.key, String(datos.value || "").slice(0, 2000)]
      );
    } else if (tipo === "proponer_set_texto") {
      const { campos } = getContentRegistry();
      const base = campos[datos.key];
      if (!base || base.type !== "text_i18n") return res.status(400).json({ ok: false, error: "Campo de texto no válido" });
      const idioma = ["es", "ca", "en"].includes(datos.idioma) ? datos.idioma : "es";
      await dbRun(
        `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
        [`${datos.key}_${idioma}`, String(datos.texto || "").slice(0, 2000)]
      );
    } else if (tipo === "proponer_anadir_galeria") {
      const { campos } = getContentRegistry();
      const base = campos[datos.key];
      if (!base || base.type !== "gallery") return res.status(400).json({ ok: false, error: "Galería no válida" });
      const nuevas = Array.isArray(datos.urls) ? datos.urls.filter(u => typeof u === "string" && u.trim()) : [];
      if (!nuevas.length) return res.status(400).json({ ok: false, error: "Sin URLs" });
      const row = await dbGet("SELECT value FROM contents WHERE key = ?", [datos.key]);
      const actual = (row?.value || "").trim();
      const combinado = (actual ? actual + "\n" : "") + nuevas.join("\n");
      await dbRun(
        `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
        [datos.key, combinado]
      );
    } else {
      return res.status(400).json({ ok: false, error: "Tipo de propuesta desconocido" });
    }
    res.json({ ok: true, ...(await getSaraEstado()) });
  } catch (e) {
    console.error("Error en /api/sara/aplicar:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/sara/bloqueo/:id", requireAuth(["marketing", "direccion"]), async (req, res) => {
  try { await dbRun(`DELETE FROM bloqueos_reservas WHERE id = ?`, [parseInt(req.params.id)]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.delete("/api/sara/regla/:id", requireAuth(["marketing", "direccion"]), async (req, res) => {
  try { await dbRun(`DELETE FROM sara_respuestas WHERE id = ?`, [parseInt(req.params.id)]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/", (req, res) => res.redirect("/login.html"));

const shutdown = (signal) => {
  console.log(`${signal} recibido, cerrando servidor...`);
  setTimeout(() => { process.exit(0); }, 5000).unref();
  server.closeAllConnections?.();
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

async function guardarPendienteWA(tipo, destino, reserva) {
  try {
    await dbRun(
      `INSERT INTO pending_whatsapp (tipo, destino, reserva_json) VALUES (?, ?, ?)`,
      [tipo, destino, JSON.stringify(reserva)]
    );
    console.log(`📥 Mensaje WA guardado como pendiente: ${tipo} → ${destino}`);
  } catch (err) {
    console.error("Error guardando pendiente WA:", err.message);
  }
}

async function procesarPendientesWA() {
  try {
    const rows = await dbAll(`SELECT * FROM pending_whatsapp ORDER BY creado_en ASC`);
    if (!rows || !rows.length) return;
    console.log(`📨 Procesando ${rows.length} mensajes WhatsApp pendientes...`);
    for (const row of rows) {
      try {
        const reserva = JSON.parse(row.reserva_json);
        if (row.tipo === "confirmacion") await sendConfirmacionCliente(row.destino, reserva);
        else if (row.tipo === "confirmacion_pendiente") await sendConfirmacionPendienteCliente(row.destino, reserva);
        else if (row.tipo === "grupo") await sendNotificacionGrupo(row.destino, reserva);
        else if (row.tipo === "grupo_pendiente") await sendNotificacionGrupoPendiente(row.destino, reserva);
        await dbRun(`DELETE FROM pending_whatsapp WHERE id = ?`, [row.id]);
        console.log(`✅ Pendiente WA enviado (id ${row.id})`);
      } catch (e) {
        console.error(`Error enviando pendiente WA ${row.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error("Error procesando pendientes WA:", e.message);
  }
}

// Manejador de errores global (Iteración 1A): respuesta 500 genérica sin filtrar internos,
// y log seguro en servidor. Debe registrarse DESPUÉS de todas las rutas.
app.use(errorHandler);

const server = app.listen(PORT, async () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);

  // Inicializar esquema PostgreSQL
  try {
    await initDB();
    DB_LISTA = true;   // a partir de aquí la API puede contestar de verdad
  } catch (e) {
    console.error("[DB] Error inicializando esquema:", e.message);
    process.exit(1);
  }

  // Restaurar datos desde KV (idempotente, solo importa los que falten)
  try { await restoreFromKV(); } catch (e) { console.error("[KV] Error en restore:", e.message); }

  // Volcar una sola vez el Secret AGORA_LOCALES a la BD (fuente de verdad ahora editable desde el panel)
  try { await seedAgoraFromEnv(); } catch (e) { console.error("[Agora] Error en seed env→BD:", e.message); }

  setOnReserva(async (reserva, jid) => {
    const { local, personas, dia, hora, telefono, nombre_reserva, pendiente } = reserva;
    if (!local || !personas || !dia || !hora || !telefono || !nombre_reserva) return;
    try {
      const bloqueo = await estaBloqueado(local, dia);
      if (bloqueo) {
        console.log(`[Reserva WA] Bloqueada por config: ${local} ${dia}`);
        return { ok: false, motivo: bloqueo.motivo || "fechas no disponibles" };
      }
    } catch (e) { console.error("Error comprobando bloqueo (WA):", e.message); }
    const creado_en = new Date().toISOString();
    try {
      const rowRes = await dbRun(
        `INSERT INTO reservas (local, personas, dia, hora, telefono, nombre_reserva, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [local, personas, dia, hora, telefono, nombre_reserva, creado_en]
      );
      const reservaId = rowRes.id;
      if (jid) {
        await dbRun(
          `INSERT INTO wa_clientes (jid, nombre, telefono, ultima_interaccion)
           VALUES (?, ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
           ON CONFLICT(jid) DO UPDATE SET
             nombre = COALESCE(wa_clientes.nombre, EXCLUDED.nombre),
             telefono = COALESCE(wa_clientes.telefono, EXCLUDED.telefono),
             ultima_interaccion = EXCLUDED.ultima_interaccion`,
          [jid, nombre_reserva, telefono]
        );
      }
      console.log(`📅 Reserva WhatsApp guardada (id ${reservaId}): ${nombre_reserva} en ${local}${pendiente ? " [PENDIENTE]" : ""}`);
      upsertLeadFromReserva({ nombre_reserva, telefono });

      const row = await dbGet(`SELECT group_jid FROM wa_links WHERE local = ?`, [local]);
      if (row?.group_jid) {
        if (pendiente) {
          if (isReady()) sendNotificacionGrupoPendiente(row.group_jid, reserva);
          else guardarPendienteWA("grupo", row.group_jid, { ...reserva, _pendiente: true });
        } else {
          if (isReady()) sendNotificacionGrupo(row.group_jid, reserva);
          else guardarPendienteWA("grupo", row.group_jid, reserva);
        }
      }

      // Programar follow-up al día siguiente a las 11h (solo reservas confirmadas)
      if (!pendiente) {
        const jidFu = telefono.replace(/\D/g, "").replace(/^00/, "").replace(/^(?!34)([679])/, "34$1") + "@s.whatsapp.net";
        const [y, m, d] = dia.split("-").map(Number);
        const nextDay = new Date(y, m - 1, d + 1);
        const sendAt = `${nextDay.getFullYear()}-${String(nextDay.getMonth()+1).padStart(2,"0")}-${String(nextDay.getDate()).padStart(2,"0")}T11:00:00`;
        await dbRun(
          `INSERT INTO followup_scheduled (jid, nombre, local, dia, send_at) VALUES (?, ?, ?, ?, ?)`,
          [jidFu, nombre_reserva, local, dia, sendAt]
        );
      }
    } catch (e) {
      console.error("Error guardando reserva WhatsApp:", e.message);
    }
  });

  // Grupos de WhatsApp por defecto (autorreparable, no pisa re-enlaces manuales)
  const DEFAULT_WA_LINKS = [
    { local: "La Tapeta - Blanes", group_jid: "120363393125503294@g.us" },
    { local: "La Tapeta - Lloret", group_jid: "34620403964-1593424370@g.us" },
    { local: "La Tapeta - Girona", group_jid: "447341020476-1606230930@g.us" },
    { local: "Cooperativa - Blanes", group_jid: "120363393125503294@g.us" },
    { local: "Can Mateu - Tordera", group_jid: "120363044574117454@g.us" },
    { local: "La Tapa Ibérica - Tordera", group_jid: "34620403964-1589730214@g.us" },
    { local: "Botiga d'en Mateu - Tordera", group_jid: "120363202050821128@g.us" }
  ];
  const DEFAULT_FACTURAS_GRUPOS = [
    { local: "Can Mateu - Tordera", group_jid: "120363409005830308@g.us" },
    { local: "Cooperativa - Blanes", group_jid: "120363427741609402@g.us" },
    { local: "La Tapa Ibérica - Tordera", group_jid: "120363407996132022@g.us" },
    { local: "La Tapeta - Girona", group_jid: "120363426106267540@g.us" },
    { local: "La Tapeta - Lloret", group_jid: "120363409899742012@g.us" }
  ];
  try {
    for (const { local, group_jid } of DEFAULT_WA_LINKS) {
      await dbRun(`INSERT INTO wa_links (local, group_jid, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(local) DO NOTHING`, [local, group_jid]);
      await dbRun(`INSERT INTO contents (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING`, [`whatsapp_group_${local}`, group_jid]);
    }
    for (const { local, group_jid } of DEFAULT_FACTURAS_GRUPOS) {
      const existe = await dbGet(`SELECT 1 FROM facturas_grupos WHERE local = ?`, [local]);
      if (!existe) await dbRun(`INSERT INTO facturas_grupos (local, group_jid) VALUES (?, ?) ON CONFLICT(group_jid) DO NOTHING`, [local, group_jid]);
    }
    console.log("[Defaults] Grupos de WhatsApp por defecto asegurados (reservas + facturas)");
  } catch (e) { console.error("[Defaults] Error asegurando grupos por defecto:", e.message); }

  // Post-restore: rellenar empresa en facturas que quedaron vacías
  try {
    await dbRun(
      `UPDATE facturas SET empresa = (
         SELECT fl.empresa FROM facturas_locales fl WHERE fl.local = facturas.local
       )
       WHERE (empresa IS NULL OR empresa = 'Sin empresa asignada')
       AND EXISTS (SELECT 1 FROM facturas_locales fl WHERE fl.local = facturas.local)`
    );
  } catch (e) { console.error("[Migration] empresa post-restore fix:", e.message); }

  setOnReady(procesarPendientesWA);

  // Semilla única: Fiesta Mayor de Blanes 2026
  try {
    const yaSembrado = await getConfig("seed_fiesta_mayor_2026");
    if (!yaSembrado) {
      for (const local of ["La Tapeta - Blanes", "Cooperativa - Blanes"]) {
        await dbRun(
          `INSERT INTO bloqueos_reservas (local, desde, hasta, motivo) VALUES (?, ?, ?, ?)`,
          [local, "2026-07-23", "2026-07-27", "Fiesta mayor"]
        );
      }
      await setConfig("seed_fiesta_mayor_2026", "done");
      console.log("[Seed] Bloqueo Fiesta Mayor Blanes 2026 creado (Blanes + Cooperativa, 23–27 jul)");
    }
  } catch (e) { console.error("[Seed] Error sembrando Fiesta Mayor:", e.message); }

  // Migración única: separar La Tapeta en 3 ciudades
  try {
    const yaMigrado = await getConfig("seed_split_latapeta_v1");
    if (!yaMigrado) {
      const CAMPOS = ["instagram", "menu_pdf", "menu_almuerzo_pdf", "gallery", "hours", "map", "history"];
      const copiarContenido = async (origenSlug, destinoSlug) => {
        for (const campo of CAMPOS) {
          const origen = await dbGet("SELECT value FROM contents WHERE key = ?", [`local_${origenSlug}_${campo}`]);
          if (!origen || !origen.value) continue;
          const destKey = `local_${destinoSlug}_${campo}`;
          const existe = await dbGet("SELECT value FROM contents WHERE key = ? AND value != ''", [destKey]);
          if (existe) continue;
          await dbRun(
            `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
            [destKey, origen.value]
          );
        }
      };
      for (const ciudad of ["la-tapeta-blanes", "la-tapeta-lloret", "la-tapeta-girona"]) {
        await copiarContenido("la-tapeta", ciudad);
      }
      await copiarContenido("botiga-mateu", "botiga-d-en-mateu");
      await setConfig("seed_split_latapeta_v1", "done");
      console.log("[Seed] La Tapeta separada en 3 ciudades y contenidos migrados");
    }
  } catch (e) { console.error("[Seed] Error migrando split La Tapeta:", e.message); }

  // Enviar mensajes de seguimiento post-visita (cada 5 min)
  setInterval(async () => {
    if (!isReady()) return;
    try {
      const ahora = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Madrid" }).replace(" ", "T");
      const pendientes = await dbAll(
        `SELECT * FROM followup_scheduled WHERE sent = 0 AND send_at <= ?`, [ahora]
      );
      for (const row of pendientes) {
        try {
          const nombre = row.nombre.split(" ")[0];
          const msg =
            `¡Hola ${nombre}! 😊 Soy Sara, del equipo de Familia del Amor.\n\n` +
            `Ayer estuviste en ${row.local} y queríamos saber cómo te fue. ¿Todo bien? ` +
            `Si hay algo en lo que podamos mejorar, o simplemente quieres compartir tu experiencia, ` +
            `aquí estamos 🙏\n\n¡Gracias y hasta pronto!`;
          await sendMensajeLibre(row.jid.split("@")[0], msg);
          await dbRun(`UPDATE followup_scheduled SET sent = 1 WHERE id = ?`, [row.id]);
          markAwaitingFollowup(row.jid, { nombre: row.nombre, local: row.local, dia: row.dia });
          console.log(`📤 Follow-up enviado a ${row.jid}`);
        } catch (e) {
          console.error(`Error enviando follow-up a ${row.jid}:`, e.message);
        }
      }
    } catch (e) {
      console.error("Error procesando follow-ups:", e.message);
    }
  }, 5 * 60 * 1000);

  // Campañas programadas (despacho a su hora) + automatización de cumpleaños (cada 5 min).
  setInterval(async () => {
    if (!isReady()) return;
    // 1) Campañas con estado 'programada' cuya hora ya llegó.
    try {
      const ahora = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Madrid" }).replace(" ", "T");
      const prog = await dbAll(`SELECT id FROM campanas_wa WHERE estado = 'programada' AND programada_para IS NOT NULL AND programada_para <= ?`, [ahora]);
      for (const c of prog) { try { await dispatchCampana(c.id); } catch (e) { console.error("[campaña programada]", e.message); } }
    } catch (e) { console.error("[scheduler campañas]", e.message); }

    // 2) Cumpleaños: una sola vez al día, en la franja 10:xx (Madrid), si está activado.
    try {
      if ((await getConfig("cumple_auto")) !== "1") return;
      const hora = new Date().toLocaleTimeString("sv-SE", { timeZone: "Europe/Madrid" });
      if (!hora.startsWith("10:")) return;
      const hm = hoyMadrid();
      if ((await getConfig("cumple_last")) === hm.iso) return;
      await setConfig("cumple_last", hm.iso); // marca ANTES de enviar (evita duplicados si reintenta)
      const plantilla = (await getConfig("cumple_plantilla")) || "¡Feliz cumpleaños, {nombre}! 🎉 Te esperamos en Familia del Amor.";
      const leads = await dbAll(
        `SELECT l.nombre, l.apellidos, l.telefono, l.nacimiento, COALESCE(mp.baja, 0) AS baja
         FROM leads l LEFT JOIN marketing_prefs mp
           ON RIGHT(regexp_replace(mp.telefono, '[^0-9]', '', 'g'), 9) = RIGHT(regexp_replace(l.telefono, '[^0-9]', '', 'g'), 9)
         WHERE l.nacimiento IS NOT NULL AND l.nacimiento <> '' AND l.telefono IS NOT NULL AND l.telefono <> ''`
      );
      const dest = leads.filter((l) => !(l.baja === 1 || l.baja === true) && esCumpleHoy(l.nacimiento, hm));
      if (!dest.length) return;
      const row = await dbRun(`INSERT INTO campanas_wa (nombre, segmento_json, mensaje, canal, estado, total_enviados) VALUES (?, ?, ?, 'whatsapp', 'enviando', 0) RETURNING id`,
        [`🎂 Cumpleaños ${hm.iso}`, JSON.stringify({ auto: "cumple" }), plantilla]);
      enviarLoteWA({ contactos: dest, mensaje: plantilla, campanaId: row.id });
      console.log(`🎂 Cumpleaños: enviando felicitación a ${dest.length} contacto(s)`);
    } catch (e) { console.error("[cumpleaños]", e.message); }
  }, 5 * 60 * 1000);

  // ── Pulso del equipo: generación y despacho, en pasos SEPARADOS ────────────
  // La separación no es cosmética. En cada redespliegue de Replit se cae la sesión de
  // WhatsApp, y el día 1 a las 11:00 es perfectamente posible que esté caída. Por eso el
  // flag de idempotencia marca la GENERACIÓN (que solo toca la BD y siempre funciona), y
  // el despacho se reintenta en cada tick hasta que haya sesión. Si marcáramos el envío,
  // un redespliegue a deshora dejaría al equipo sin recibir nada ese mes.
  setInterval(async () => {
    try {
      if ((await getConfig("pulso_auto")) !== "1") return;
      const hm = hoyMadrid();
      const [anio, mesN, diaN] = hm.iso.split("-").map(Number);
      const hora = new Date().toLocaleTimeString("sv-SE", { timeZone: "Europe/Madrid" });
      const mesEvaluado = mesAnterior(`${anio}-${String(mesN).padStart(2, "0")}`);

      // 1) Día 1, franja 11:xx → crear las invitaciones del mes que acaba de cerrar.
      const diaEnvio = Number(await getConfig("pulso_dia")) || 1;
      if (diaN === diaEnvio && hora.startsWith("11:") && (await getConfig("pulso_last_gen")) !== mesEvaluado) {
        await setConfig("pulso_last_gen", mesEvaluado); // ANTES de generar, como en cumpleaños
        const n = await asegurarInvitacionesPulso(mesEvaluado);
        console.log(`💬 Pulso ${mesEvaluado}: ${n} invitación(es) creadas`);
      }

      // 2) Día 8 → recordatorio a quien no haya contestado (una sola vez por mes).
      if (diaN === 8 && hora.startsWith("11:") && (await getConfig("pulso_last_rec")) !== mesEvaluado) {
        await setConfig("pulso_last_rec", mesEvaluado);
        await dbRun(`UPDATE pulso_invitaciones SET enviado_en = NULL, recordatorio_en = ?
                     WHERE mes = ? AND usado = 0 AND enviado_en IS NOT NULL`, [new Date().toISOString(), mesEvaluado]);
      }

      // 3) Despacho: en CADA tick, si hay sesión. Recupera lo que quedó pendiente.
      if (!isReady()) return;
      await despacharPulsoPendientes();
    } catch (e) { console.error("[pulso scheduler]", e.message); }
  }, 5 * 60 * 1000);

  // ── Números de la casa: Sara no les responde ───────────────────────────────
  // Sara está escrita para clientes de restaurante. Si un trabajador escribe al número de
  // empresa, sin esto le ofrece mesa y además lo da de alta como lead de marketing.
  // Caché de 10 min: son 40-50 filas y se consulta en cada mensaje entrante.
  let _internosSet = null, _internosTs = 0;
  const INTERNOS_TTL_MS = 10 * 60 * 1000;
  async function cargarTelefonosInternos() {
    const rows = await dbAll(
      `SELECT telefono FROM users WHERE COALESCE(telefono, '') <> '' AND COALESCE(activo, 1) = 1`
    );
    return new Set((rows || []).map((r) => clave9(r.telefono)).filter(Boolean));
  }
  async function telefonosInternos() {
    if (_internosSet && Date.now() - _internosTs < INTERNOS_TTL_MS) return _internosSet;
    try {
      _internosSet = await cargarTelefonosInternos();
      _internosTs = Date.now();
    } catch (e) {
      console.error("[internos] No se pudo cargar la lista:", e.message);
      // Si falla, conservamos la anterior; si no había ninguna, Set vacío = no se excluye a nadie.
      if (!_internosSet) _internosSet = new Set();
    }
    return _internosSet;
  }
  // Se llama al dar de alta o editar un trabajador, para no esperar al TTL.
  invalidarInternos = () => { _internosTs = 0; };
  setTelefonoInterno(async (telefono) => esTelefonoInterno(telefono, await telefonosInternos()));

  setOnMessage(async ({ jid, texto, respuesta, historico = false, interno = false }) => {
    const telefono = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
    try {
      await dbRun(
        `INSERT INTO whatsapp_messages (jid, telefono, mensaje, respuesta, historico, tipo) VALUES (?, ?, ?, ?, ?, ?)`,
        [jid, telefono, texto, respuesta, historico ? 1 : 0, interno ? "interno" : "intercambio"]
      );
      // Los de la casa NO entran en wa_clientes (que es la agenda de clientes de WhatsApp)
      // ni pasan por la lógica de marketing: el mensaje queda guardado y nada más.
      if (interno) return;
      await dbRun(
        `INSERT INTO wa_clientes (jid, telefono, ultima_interaccion)
         VALUES (?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
         ON CONFLICT(jid) DO UPDATE SET ultima_interaccion = EXTRACT(EPOCH FROM NOW())::BIGINT`,
        [jid, telefono]
      );
      // Opt-out de marketing: si el cliente escribe BAJA/STOP, se le excluye de envíos masivos.
      if (!historico && jid.endsWith("@s.whatsapp.net")) {
        const norm = String(texto || "").trim().toUpperCase();
        if (["BAJA", "STOP", "NO MOLESTAR", "DAR DE BAJA", "UNSUBSCRIBE"].includes(norm)) {
          try {
            await setMarketingPref(telefono, { baja: 1 });
            // Darse de baja no es solo dejar de recibir: lo que hayamos ido apuntando sobre
            // esa persona se borra con ella. Guardar el cuaderno de alguien que ha pedido que
            // le dejes en paz es exactamente lo que no se debe hacer.
            await dbRun(`DELETE FROM cliente_hechos WHERE ${MATCH_TEL9("telefono")}`, [telefono]).catch(() => {});
            console.log(`🔕 Opt-out marketing: ${telefono}`);
          } catch (e) { console.error("Opt-out:", e.message); }
        }
      }
    } catch (e) { console.error("Error guardando mensaje WA:", e.message); }
  });

  setOnContactoLead(({ telefono, nombre }) => {
    upsertLead({ nombre: nombre || "", telefono, fuente: "whatsapp" });
  });

  setHistorialLoader(async (jid) => {
    const rows = await dbAll(
      `SELECT mensaje, respuesta, COALESCE(tipo, 'intercambio') AS tipo
       FROM whatsapp_messages
       WHERE jid = ?
         AND respuesta != '(sin respuesta registrada)'
         AND creado_en::timestamptz > NOW() - INTERVAL '4 hours'
       ORDER BY id DESC LIMIT 20`,
      [jid]
    );
    const historial = [];
    for (const r of rows.reverse()) {
      if (r.tipo === "saliente" || r.tipo === "manual") {
        historial.push({ role: "user", content: "[El cliente recibió un mensaje del equipo de Familia del Amor]" });
        historial.push({ role: "assistant", content: r.respuesta });
      } else {
        historial.push({ role: "user", content: r.mensaje });
        historial.push({ role: "assistant", content: r.respuesta });
      }
    }
    return historial;
  });

  setPerfilLoader(async (jid) => {
    const row = await dbGet(`SELECT nombre, telefono, notas, ultima_interaccion FROM wa_clientes WHERE jid = ?`, [jid]);
    return row || null;
  });

  setReservaLoader(async (telefono) => {
    try {
      const clave = (telefono || "").replace(/\D/g, "");
      if (clave.length < 9) return null;
      const cola = clave.slice(-9);
      const rows = await dbAll(
        `SELECT local, dia, hora, personas, nombre_reserva, telefono
         FROM reservas WHERE dia::date >= CURRENT_DATE - INTERVAL '1 day'
         ORDER BY creado_en DESC LIMIT 200`
      );
      for (const r of rows) {
        if ((r.telefono || "").replace(/\D/g, "").endsWith(cola)) return r;
      }
      return null;
    } catch (e) {
      console.error("Error en reservaLoader:", e.message);
      return null;
    }
  });

  setOnCancelarReserva(async ({ telefono, dia, local }, jid) => {
    try {
      const clave = (telefono || "").replace(/\D/g, "");
      if (clave.length < 9 || !dia) return { ok: false, motivo: "faltan datos" };
      const cola = clave.slice(-9);
      const rows = await dbAll(
        `SELECT * FROM reservas WHERE dia = ?${local ? " AND local = ?" : ""} ORDER BY creado_en DESC`,
        local ? [dia, local] : [dia]
      );
      const reserva = rows.find(r => (r.telefono || "").replace(/\D/g, "").endsWith(cola));
      if (!reserva) return { ok: false, motivo: "no encontrada" };

      await dbRun(`DELETE FROM reservas WHERE id = ?`, [reserva.id]);
      console.log(`🗑️ Reserva cancelada por Sara (id ${reserva.id}): ${reserva.nombre_reserva} en ${reserva.local} ${reserva.dia}`);

      const row = await dbGet(`SELECT group_jid FROM wa_links WHERE local = ?`, [reserva.local]);
      if (row?.group_jid && isReady()) sendCancelacionGrupo(row.group_jid, reserva);

      return { ok: true, reserva };
    } catch (e) {
      console.error("Error cancelando reserva (WA):", e.message);
      return { ok: false, motivo: e.message };
    }
  });

  setSaraConfigLoader(async () => {
    try {
      const partes = [];
      const instr = await getConfig("sara_instrucciones");
      if (instr && instr.trim()) {
        partes.push(`INSTRUCCIONES DEL EQUIPO (síguelas siempre que apliquen):\n${instr.trim()}`);
      }
      const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
      const bloqueos = await dbAll(
        `SELECT local, desde, hasta, motivo FROM bloqueos_reservas WHERE hasta::date >= ?::date ORDER BY desde`, [hoy]
      );
      if (bloqueos.length) {
        const lineas = bloqueos.map(b => `- ${b.local}: del ${b.desde} al ${b.hasta}${b.motivo ? ` (${b.motivo})` : ""}`).join("\n");
        partes.push(`RESERVAS NO DISPONIBLES en estos locales y fechas. NUNCA ofrezcas, sugieras ni registres una reserva que caiga en estos rangos. Si el cliente pregunta por reservar en estas fechas o locales, tu PRIMERA frase debe decir directamente que ese día no hay reservas (NO empieces diciendo que sí y luego te corrijas). Recuérdaselo con amabilidad y ofrécele otra fecha u otro local que sí acepte:\n${lineas}`);
      }
      const docs = await dbAll(
        `SELECT id, tema, disparadores, respuesta FROM sara_respuestas WHERE activo = 1 AND documento_url IS NOT NULL AND documento_url != '' ORDER BY id`
      );
      if (docs.length) {
        const lineas = docs.map(d => `- id ${d.id}: ${d.tema}${d.disparadores ? ` — cuándo enviarlo: ${d.disparadores}` : ""}${d.respuesta ? ` — di también: ${d.respuesta}` : ""}`).join("\n");
        partes.push(`DOCUMENTOS DISPONIBLES para enviar con la herramienta enviar_documento (usa el id exacto; envíalo A LA PRIMERA en cuanto el cliente pida algo que encaje, sin derivar al teléfono ni esperar a que insista):\n${lineas}`);
      }
      const respTexto = await dbAll(
        `SELECT tema, disparadores, respuesta FROM sara_respuestas WHERE activo = 1 AND (documento_url IS NULL OR documento_url = '') AND respuesta IS NOT NULL AND respuesta != '' ORDER BY id`
      );
      if (respTexto.length) {
        const lineas = respTexto.map(d => `- ${d.tema}${d.disparadores ? ` (cuándo: ${d.disparadores})` : ""}: ${d.respuesta}`).join("\n");
        partes.push(`RESPUESTAS CONFIGURADAS:\n${lineas}`);
      }
      return partes.length ? `--- CONFIGURACIÓN DEL EQUIPO ---\n${partes.join("\n\n")}` : "";
    } catch (e) {
      console.error("Error construyendo config de Sara:", e.message);
      return "";
    }
  });

  setDocumentoResolver(async (documentoId) => {
    try {
      const row = await dbGet(`SELECT documento_url FROM sara_respuestas WHERE id = ? AND activo = 1`, [documentoId]);
      if (!row || !row.documento_url) return null;
      const url = row.documento_url;
      let buffer;
      if (/^https?:\/\//i.test(url)) {
        const r = await fetch(url);
        if (!r.ok) return null;
        buffer = Buffer.from(await r.arrayBuffer());
      } else {
        const filePath = path.join(__dirname, "public", url.replace(/^\//, ""));
        if (!fs.existsSync(filePath)) return null;
        buffer = fs.readFileSync(filePath);
      }
      const filename = (url.split("/").pop() || "documento.pdf").split("?")[0];
      const mimetype = filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
      return { buffer, filename, mimetype };
    } catch (e) {
      console.error("Error resolviendo documento:", e.message);
      return null;
    }
  });

  setOnMensajeSaliente(async ({ jid, mensaje, esManual = false }) => {
    const telefono = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
    const tipo     = esManual ? "manual" : "saliente";
    const origen   = esManual ? "[Operador]" : "[Sistema]";
    try {
      await dbRun(
        `INSERT INTO whatsapp_messages (jid, telefono, mensaje, respuesta, tipo) VALUES (?, ?, ?, ?, ?)`,
        [jid, telefono, origen, mensaje, tipo]
      );
      await dbRun(
        `INSERT INTO wa_clientes (jid, telefono, ultima_interaccion)
         VALUES (?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
         ON CONFLICT(jid) DO UPDATE SET ultima_interaccion = EXTRACT(EPOCH FROM NOW())::BIGINT`,
        [jid, telefono]
      );
    } catch (e) { console.error("Error guardando mensaje saliente WA:", e.message); }
  });

  setOnActualizarPerfil(async (jid, { campo, valor }) => {
    const telefono = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
    try {
      if (campo === "nombre") {
        await dbRun(
          `INSERT INTO wa_clientes (jid, telefono, nombre, ultima_interaccion)
           VALUES (?, ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
           ON CONFLICT(jid) DO UPDATE SET nombre = ?, ultima_interaccion = EXTRACT(EPOCH FROM NOW())::BIGINT`,
          [jid, telefono, valor, valor]
        );
      } else if (campo === "nota") {
        const row = await dbGet(`SELECT notas FROM wa_clientes WHERE jid = ?`, [jid]);
        let notas = {};
        if (row?.notas) { try { notas = JSON.parse(row.notas); } catch {} }
        notas[Date.now()] = valor;
        const notasJson = JSON.stringify(notas);
        await dbRun(
          `INSERT INTO wa_clientes (jid, telefono, notas, ultima_interaccion)
           VALUES (?, ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
           ON CONFLICT(jid) DO UPDATE SET notas = ?, ultima_interaccion = EXTRACT(EPOCH FROM NOW())::BIGINT`,
          [jid, telefono, notasJson, notasJson]
        );
      }
    } catch (e) { console.error("Error actualizando perfil WA:", e.message); }
  });

  setOnGroupAttachment(async ({ groupJid, senderJid, buffer, mimeType, filename, caption }) => {
    const grupo = await dbGet("SELECT local FROM facturas_grupos WHERE group_jid = ?", [groupJid]);
    if (!grupo) return;

    const local = grupo.local;
    console.log(`[Facturas] Documento recibido en grupo ${local} de ${senderJid}`);

    try {
      await sendMensajeAGrupo(groupJid, `⏳ Procesando documento para *${local}*...`);

      const result = await procesarFactura({
        buffer, mimeType, filename, local, caption,
        getToken: getDriveAccessToken,
        dbGet, dbAll, dbRun,
        backupFn: null
      });

      const { datos, driveUrl, sheetUrl } = result;
      const tipoLabel = datos.tipo === "albaran" ? "Albarán" : datos.tipo === "ticket" ? "Ticket" : "Factura";
      const totalStr = datos.total != null ? `${Number(datos.total).toFixed(2)} €` : "importe no detectado";
      const provStr = datos.proveedor || "proveedor no detectado";

      await sendMensajeAGrupo(groupJid,
        `✅ *${tipoLabel} registrado · ${local}*\n\n` +
        `🏢 ${provStr}\n` +
        `💶 ${totalStr}` + (datos.porcentaje_iva ? ` (IVA ${datos.porcentaje_iva}%)` : "") + `\n` +
        `📅 ${datos.fecha || "fecha no detectada"}\n\n` +
        `📁 Drive: ${driveUrl}\n` +
        `📊 Sheet: ${sheetUrl || `https://docs.google.com/spreadsheets/d/${result.sheetId}`}`
      );
    } catch (err) {
      if (err instanceof FacturaDuplicadaError) {
        console.warn("[Facturas] Duplicado detectado:", err.message);
        await sendMensajeAGrupo(groupJid,
          `⚠️ *Documento duplicado · ${local}*\n\n` +
          `${err.message}\n\n` +
          `El documento NO se ha registrado de nuevo.`
        ).catch(() => {});
      } else {
        console.error("[Facturas] Error procesando documento:", err.message);
        await sendMensajeAGrupo(groupJid,
          `❌ No he podido procesar el documento: ${err.message.slice(0, 120)}\n\nRevisa que Google Drive esté conectado en el panel.`
        ).catch(() => {});
      }
    }
  });

  initWhatsApp();

  // Polling de Gmail: primer check a los 30 segundos, luego cada 5 minutos
  setTimeout(pollGmail, 30 * 1000);
  setInterval(pollGmail, 5 * 60 * 1000);
  // Ingesta por Drive (carpeta vigilada por local). Dormido si no hay carpetas configuradas.
  setTimeout(pollDriveFacturas, 45 * 1000);
  setInterval(pollDriveFacturas, 5 * 60 * 1000);
  // Cola de reintentos de volcado a Sheets: reproyecta desde la BD lo que quedó sin sincronizar.
  const reintentarSheets = async () => {
    try {
      if (!(await getConfig("google_drive_refresh_token"))) return; // sin Google, nada que hacer aún
      const pend = await dbGet("SELECT COUNT(*) AS n FROM facturas WHERE COALESCE(sheet_synced,0)=0", []);
      if (!pend || Number(pend.n) === 0) return;
      const r = await reproyectarPendientes({ getToken: getDriveAccessToken, dbGet, dbAll, dbRun });
      await setConfig("facturas_ultimo_reintento", new Date().toISOString());
      console.log(`[Facturas] Reintento de volcado: ${r.sincronizados} sincronizadas, ${r.fallidos} grupos con error`);
    } catch (e) { console.error("[Facturas] reintento volcado:", e.message); }
  };
  setTimeout(reintentarSheets, 90 * 1000);
  setInterval(reintentarSheets, 10 * 60 * 1000);

  // ── Resumen mensual por WhatsApp: día 10 de cada mes a las 9:00h (Madrid) ──
  const MESES_CAP = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  async function enviarResumenMensualFacturas() {
    try {
      const prev = new Date();
      prev.setDate(1);
      prev.setMonth(prev.getMonth() - 1);
      const mesIdx = prev.getMonth();
      const año    = prev.getFullYear();
      const mesLabel   = `${MESES_CAP[mesIdx]} ${año}`;
      const yearMonth  = `${año}-${String(mesIdx + 1).padStart(2, "0")}`;

      const rows = await dbAll(
        `SELECT local, COUNT(*) AS num_docs,
           ROUND(SUM(COALESCE(base_imponible,0))::NUMERIC,2) AS base,
           ROUND(SUM(COALESCE(cuota_iva,0))::NUMERIC,2) AS iva,
           ROUND(SUM(COALESCE(total,0))::NUMERIC,2) AS total
         FROM facturas
         WHERE TO_CHAR(fecha::date, 'YYYY-MM') = ?
         GROUP BY local ORDER BY total DESC`,
        [yearMonth]
      );

      if (!rows.length) {
        console.log(`[Resumen] Sin facturas para ${mesLabel} — resumen omitido`);
        return;
      }

      const fmt  = n => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sumB = rows.reduce((s, r) => s + (Number(r.base)  || 0), 0);
      const sumI = rows.reduce((s, r) => s + (Number(r.iva)   || 0), 0);
      const sumT = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
      const sumD = rows.reduce((s, r) => s + (Number(r.num_docs) || 0), 0);

      let msg = `*📊 Resumen de facturas — ${mesLabel}*\n\n`;
      for (const r of rows) {
        msg += `*${r.local}*\n`;
        msg += `  ${r.num_docs} doc${r.num_docs !== 1 ? "s" : ""} · Base: ${fmt(r.base)} € · IVA: ${fmt(r.iva)} € · *Total: ${fmt(r.total)} €*\n\n`;
      }
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `*TOTAL · ${sumD} documentos*\n`;
      msg += `  Base imponible: ${fmt(sumB)} €\n`;
      msg += `  IVA soportado:  ${fmt(sumI)} €\n`;
      msg += `  *Total gastos:  ${fmt(sumT)} €*`;

      await sendMensajeLibre("622149946", msg);
      await dbRun(
        "INSERT INTO config (key, value, updated_at) VALUES ('resumen_mensual_ultimo', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at",
        [yearMonth]
      );
      console.log(`[Resumen] ✅ Resumen ${mesLabel} enviado a 622149946`);
    } catch (err) {
      console.error("[Resumen]", err.message);
    }
  }

  // Chequeo cada hora; dispara solo el día 10 a las 9:00h si aún no se envió este mes
  setInterval(async () => {
    try {
      if (!isReady()) return;
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
      if (now.getDate() !== 10 || now.getHours() !== 9) return;
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevYM = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      const ultimo = await dbGet("SELECT value FROM config WHERE key = 'resumen_mensual_ultimo'");
      if (ultimo?.value === prevYM) return;
      await enviarResumenMensualFacturas();
    } catch (e) { console.error("[Resumen cron]", e.message); }
  }, 60 * 60 * 1000);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Puerto ${PORT} ocupado. Esperando y reintentando...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT);
    }, 2000);
  } else {
    console.error("Error del servidor:", err.message);
  }
});
