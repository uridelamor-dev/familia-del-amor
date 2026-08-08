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
import { initWhatsApp, sendConfirmacionCliente, sendConfirmacionPendienteCliente, sendCancelacionCliente, sendMensajeLibre, sendDocumentoLibre, sendMediaLibre, sendNotificacionGrupo, sendNotificacionGrupoPendiente, sendCancelacionGrupo, getGroups, isReady, getQRImage, setOnReserva, setOnReady, setOnMessage, setHistorialLoader, markAwaitingFollowup, setPerfilLoader, setOnMensajeSaliente, setOnActualizarPerfil, addSaraToHistorial, setOnGroupAttachment, sendMensajeAGrupo, setSaraConfigLoader, setDocumentoResolver, setReservaLoader, setOnCancelarReserva, setOnContactoLead, setTelefonoInterno } from "./whatsapp.js";
import Anthropic from "@anthropic-ai/sdk";
import { procesarFactura, procesarFacturaSinLocal, asignarFacturaPendiente, FacturaDuplicadaError, migrarEstructuraDrive, reconstruirSheetMaestro, resincronizarSheetsFactura, repararTodosLosSheets, reproyectarPendientes } from "./facturas.js";
import { indexarHistorialProveedor, sugerirLocalPendiente } from "./src/modules/facturas/asignacion.js";
// Núcleo técnico portado a PostgreSQL (seguridad 1A, modelo de establecimientos, enforcement).
import { isProduction, replitEnvWarning, resolveJwtSecret, errorHandler, isAllowedCvUpload, safeUploadName, finalizeCvUpload, CV_MAX_BYTES } from "./security.js";
import { permisosV2Enabled } from "./src/core/flags.js";
import { ensureSchema as ensureEstablecimientosSchema, seedCatalogo } from "./src/db/establecimientos.migration.js";
import { listMaintenanceIssues, createMaintenanceIssue, updateMaintenanceIssueStatus } from "./src/modules/mantenimiento/maintenance.service.js";
import { getDashboard } from "./src/modules/dashboard/dashboard.service.js";
import { mapManageRow, resumenPorLocal, draftRequest, extractText, syncReviews, mensajeEstadoReseñas, buildManageQuery, queryTextSearch, elegirSugerido, normalizarUbicacionBP, normalizarPlaceResult, placeIdsConfigurados, upsertPlaceEntry, locationNamesDeLocal } from "./src/modules/reviews/reviews.service.js";
import crypto from "crypto";
import { loadAgoraConfigs, configsFromRows, publicConfig } from "./src/integrations/agora/registry.js";
import { candidatosDiagnostico, ordenarResultados } from "./src/integrations/agora/diagnostico.js";
import { extraerScripts, extraerRutasApi, clasificarRutas } from "./src/integrations/agora/descubrir.js";
import { getInforme, listaInformes, calcularTotales } from "./src/integrations/agora/reports.js";
import { CATALOGO_MODULOS, modulosDeRol, modulosEfectivos, sanearModulos } from "./src/modules/usuarios/permisos.js";
import { stockNecesario as invStockNecesario, cantidadAPedir as invCantidadAPedir, construirRevision as invConstruirRevision, lineasPropuestaPedido as invLineasPedido, sanitizarCantidad as invSanitizarCantidad, esEstadoPedidoValido, esMMDDValido } from "./src/modules/inventario/calculo.js";
import { construyeTimeline, antiguedad as rrhhAntiguedad, documentosPorCaducar, resumenEquipoPorLocal, diasHastaCumple } from "./src/modules/rrhh/ficha.js";
import { agregarPorLocal, serieMensual, puedeMostrarComentarios, barajar, mesAnterior, ultimosMeses, caducidadMes, generarToken } from "./src/modules/rrhh/pulso.js";
import { ensureSchemaHorarios, sembrarLocal } from "./src/modules/horarios/schema.js";
import { instanteANegocio, lunesDe, diasSemana, isoConOffset } from "./src/modules/horarios/tiempo.js";
import { detectarConflictos, resumirConflictos } from "./src/modules/horarios/conflictos.js";
import { validarPublicacion, construirSnapshot } from "./src/modules/horarios/versiones.js";
import { serializarCanonico } from "./src/core/canonico.js";
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
const USER_PASS_KEY = crypto.scryptSync(String(JWT_SECRET || "tapeta"), "user-pass-v1", 32);
function encUserPass(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", USER_PASS_KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}
function decUserPass(stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return null;
  try {
    const [ivh, tagh, dh] = stored.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", USER_PASS_KEY, Buffer.from(ivh, "hex"));
    d.setAuthTag(Buffer.from(tagh, "hex"));
    return Buffer.concat([d.update(Buffer.from(dh, "hex")), d.final()]).toString("utf8");
  } catch { return null; }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

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
    // local_receptor: pista del establecimiento concreto que aparece en la factura (p.ej. "(TAPETA LLORET)").
    try { await client.query(`ALTER TABLE facturas_pendientes ADD COLUMN IF NOT EXISTS local_receptor TEXT`); } catch (e) { console.error("[DB] alter facturas_pendientes local_receptor:", e.message); }
    try { await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS modulos TEXT`); } catch (e) { console.error("[DB] alter users modulos:", e.message); }
    try { await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_enc TEXT`); } catch (e) { console.error("[DB] alter users password_enc:", e.message); }
    try { await client.query(`ALTER TABLE maintenance_issues ADD COLUMN IF NOT EXISTS foto_url TEXT`); } catch (e) { console.error("[DB] alter maintenance_issues foto_url:", e.message); }

    // ── RRHH: perfil de trabajador (aditivo). Enriquece `users` con datos de personal + documentos.
    for (const col of ["telefono TEXT", "email TEXT", "dni TEXT", "puesto TEXT", "fecha_nac TEXT", "fecha_alta TEXT", "fecha_baja TEXT", "foto_url TEXT", "agora_username TEXT", "activo INTEGER DEFAULT 1"]) {
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
        await client.query(
          `INSERT INTO users (username, password_hash, rol, nombre, creado_en) VALUES ($1, $2, $3, $4, $5)`,
          [u.username, hash, u.rol, u.nombre, new Date().toISOString()]
        );
      }
      console.log("Usuarios por defecto creados. Contraseña: tapeta2024");
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
setTimeout(() => { runAgoraSync().catch((e) => console.error("Ágora sync (kickoff):", e.message)); }, 60 * 1000);
setInterval(() => { runAgoraSync().catch((e) => console.error("Ágora sync:", e.message)); }, 45 * 60 * 1000);

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
          await procesarFactura({ buffer, mimeType: f.mimeType, filename: f.name, local: c.local, canal: "Drive", getToken: getDriveAccessToken, dbGet, dbRun });
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
              getToken: getDriveAccessToken, dbGet, dbRun,
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
  res.redirect("/direccion.html?facturas=connected");
});

// ── API: estado y grupos de facturas ───────────────────────────────────────
app.get("/api/facturas/status", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const token = await getConfig("google_drive_refresh_token");
  const grupos = await dbAll("SELECT * FROM facturas_grupos ORDER BY local", []);
  let pendientesSheet = 0;
  try { const r = await dbGet("SELECT COUNT(*) AS n FROM facturas WHERE COALESCE(sheet_synced,0)=0", []); pendientesSheet = Number(r?.n || 0); } catch { /* columna nueva */ }
  res.json({ ok: true, conectado: !!token, grupos, pendientes_sheet: pendientesSheet, ultimo_reintento: (await getConfig("facturas_ultimo_reintento")) || null });
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
  try {
    await dbRun(
      "INSERT INTO facturas_grupos (local, group_jid) VALUES (?, ?) ON CONFLICT(group_jid) DO UPDATE SET local = EXCLUDED.local",
      [local, group_jid]
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
function facturasWhere(query = {}) {
  const { local, empresa, tipo, estado, from, to, q } = query;
  const cond = [], params = [];
  if (local) { cond.push("local = ?"); params.push(local); }
  if (empresa) { cond.push("empresa = ?"); params.push(empresa); }
  if (tipo) { cond.push("tipo = ?"); params.push(tipo); }
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
    const rows = await dbAll(`SELECT * FROM facturas ${where} ORDER BY fecha DESC NULLS LAST, creado_en DESC LIMIT 500`, params);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message, data: [] }); }
});

// Editar los campos de una factura (corregir lo que extrajo la IA). Re-proyecta a los Sheets.
app.patch("/api/facturas/:id", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const antes = await dbGet("SELECT local, fecha FROM facturas WHERE id = ?", [req.params.id]);
    const allowed = ["proveedor", "nif", "concepto", "fecha", "numero_factura", "tipo", "base_imponible", "porcentaje_iva", "cuota_iva", "total", "local", "empresa", "pagado"];
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
app.get("/api/facturas/export.csv", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const { where, params } = facturasWhere(req.query);
    const rows = await dbAll(`SELECT fecha, numero_factura, tipo, proveedor, nif, concepto, base_imponible, porcentaje_iva, cuota_iva, total, local, empresa, pagado FROM facturas ${where} ORDER BY fecha DESC NULLS LAST LIMIT 5000`, params);
    const header = "Fecha,Numero,Tipo,Proveedor,NIF,Concepto,Base,IVA%,Cuota,Total,Local,Empresa,Pagado";
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r) => [r.fecha, r.numero_factura, r.tipo, r.proveedor, r.nif, r.concepto, r.base_imponible, r.porcentaje_iva, r.cuota_iva, r.total, r.local, r.empresa, r.pagado ? "Sí" : "No"].map(esc).join(","));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="facturas.csv"');
    res.send([header, ...lines].join("\n"));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Subir una factura MANUALMENTE desde el panel (mismo pipeline que WhatsApp/correo/Drive).
// Subida manual: admite VARIAS facturas a la vez (campo "files"), y también el envío
// antiguo de una sola ("file"). Se procesan en secuencia (respeta límites de Drive y el
// cerrojo por hash) y se devuelve un resultado por archivo.
app.post("/api/facturas/subir", requireAuth(["direccion", "contabilidad"]), uploadFacturaMem.fields([{ name: "files", maxCount: 30 }, { name: "file", maxCount: 1 }]), async (req, res) => {
  const archivos = [...((req.files && req.files.files) || []), ...((req.files && req.files.file) || [])];
  if (!archivos.length) return res.status(400).json({ ok: false, error: "Falta el archivo" });
  const local = (req.body.local || "").trim();
  const resultados = [];
  for (const f of archivos) {
    const { buffer, mimetype, originalname } = f;
    if (!(mimetype === "application/pdf" || mimetype.startsWith("image/"))) {
      resultados.push({ filename: originalname, ok: false, error: "Solo se admiten PDF o imágenes" });
      continue;
    }
    try {
      let result;
      if (local) result = await procesarFactura({ buffer, mimeType: mimetype, filename: originalname, local, canal: "Manual", getToken: getDriveAccessToken, dbGet, dbRun });
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
  try {
    await dbRun(`INSERT INTO facturas_drive_carpetas (local, folder_id, folder_url) VALUES (?, ?, ?) ON CONFLICT(local) DO UPDATE SET folder_id = EXCLUDED.folder_id, folder_url = EXCLUDED.folder_url`,
      [local, folderId, String(folder).trim()]);
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
    const fechaPago   = nuevoPagado ? new Date().toISOString().slice(0, 10) : null;
    await dbRun("UPDATE facturas SET pagado = ?, fecha_pago = ? WHERE id = ?", [nuevoPagado, fechaPago, id]);
    res.json({ ok: true, pagado: nuevoPagado, fecha_pago: fechaPago });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/facturas/email-reglas", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const rows = await dbAll("SELECT * FROM facturas_email_reglas ORDER BY email", []);
  res.json({ ok: true, data: rows });
});

app.post("/api/facturas/email-reglas", requireAuth(["direccion"]), async (req, res) => {
  const { email, local } = req.body;
  if (!email || !local) return res.status(400).json({ ok: false, error: "Faltan email o local" });
  try {
    await dbRun(
      "INSERT INTO facturas_email_reglas (email, local) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET local = EXCLUDED.local",
      [email.trim().toLowerCase(), local]
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
  const { local } = req.body || {};
  if (!local) return res.status(400).json({ ok: false, error: "Falta local" });
  const pendienteBD = await dbGet("SELECT * FROM facturas_pendientes WHERE id = ?", [req.params.id]);
  if (!pendienteBD) return res.status(404).json({ ok: false, error: "No encontrado" });
  // Si el usuario corrigió datos en el modal, se aplican antes de asignar (van a BD y Sheet).
  const pendiente = mergePendienteEditado(pendienteBD, req.body || {});
  try {
    const result = await asignarFacturaPendiente({ pendiente, local, getToken: getDriveAccessToken, dbGet, dbAll, dbRun, backupFn: null });
    res.json({ ok: true, ...result });
    // Asegura Sheets por local + maestro consistentes con la BD (fondo, no fatal).
    (async () => { try { await resincronizarSheetsFactura({ getToken: getDriveAccessToken, dbGet, dbAll, dbRun }, local, pendiente.fecha); } catch (e) { console.error("[asignar] resync:", e.message); } })();
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
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
         WHERE TO_CHAR(fecha::date, 'YYYY') = ? AND fecha IS NOT NULL${andLocal}
         GROUP BY local, mes ORDER BY local, mes`,
        p
      ),
      dbAll(
        `SELECT MIN(proveedor) AS proveedor, COUNT(*) AS num, ROUND(SUM(COALESCE(total,0))::NUMERIC, 2) AS total
         FROM facturas
         WHERE TO_CHAR(fecha::date, 'YYYY') = ? AND proveedor IS NOT NULL AND TRIM(proveedor) != ''${andLocal}
         GROUP BY LOWER(TRIM(proveedor))
         ORDER BY total DESC LIMIT 10`,
        p
      ),
      dbAll(
        `SELECT local, COUNT(*) AS num, ROUND(SUM(COALESCE(total,0))::NUMERIC, 2) AS total
         FROM facturas
         WHERE TO_CHAR(fecha::date, 'YYYY') = ?${andLocal}
         GROUP BY local ORDER BY total DESC`,
        p
      ),
      dbGet(
        `SELECT COUNT(*) AS num_docs,
           ROUND(SUM(COALESCE(base_imponible,0))::NUMERIC, 2) AS base,
           ROUND(SUM(COALESCE(cuota_iva,0))::NUMERIC, 2) AS iva,
           ROUND(SUM(COALESCE(total,0))::NUMERIC, 2) AS total
         FROM facturas WHERE TO_CHAR(fecha::date, 'YYYY') = ?${andLocal}`,
        p
      )
    ]);
    res.json({ ok: true, data: { mensual, topProveedores, porLocal, resumenAnual, año, local: local || null } });
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
    res.redirect(`/marketing.html?google=connected&source=${r.source}&n=${r.imported + r.updated}`);
  } catch (e) {
    console.error("[Google Reviews] callback sync:", e.message);
    const msg = encodeURIComponent(String(e.message || "").slice(0, 200));
    res.redirect(`/marketing.html?google=token_ok&err=${msg}`);
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
    // Ámbito por local (encargado): restringe a las fichas de Google que corresponden a su local.
    const scope = localScope(req);
    let scopeCond = "", scopeParams = [];
    if (scope) {
      const allNames = (await dbAll(`SELECT DISTINCT location_name FROM google_reviews WHERE location_name IS NOT NULL AND location_name <> ''`)).map((r) => r.location_name);
      const matched = locationNamesDeLocal(scope, allNames);
      scopeCond = matched.length ? `location_name IN (${matched.map(() => "?").join(",")})` : "1=0";
      scopeParams = matched.length ? matched : [];
    }
    const withScope = (whereStr) => scopeCond ? (whereStr && whereStr.trim() ? `${whereStr} AND ${scopeCond}` : `WHERE ${scopeCond}`) : whereStr;
    const scopeOnly = scopeCond ? `WHERE ${scopeCond}` : "";
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
    // Resumen por local (para los chips y medias) — también acotado al ámbito del usuario.
    const allRows = await dbAll(`SELECT location_name, reply, rating FROM google_reviews ${scopeOnly}`, scopeParams);
    const resumen = resumenPorLocal((allRows || []).map((r) => ({ local: r.location_name || "—", respondida: !!(r.reply && String(r.reply).trim()), rating: r.rating })));
    const locRows = await dbAll(`SELECT DISTINCT location_name FROM google_reviews WHERE location_name IS NOT NULL AND location_name <> '' ${scopeAnd} ORDER BY location_name`, scopeParams);
    res.json({
      ok: true, data, total, offset, limit,
      hasMore: offset + data.length < total,
      contadores: { total, pendientes: parseInt(c?.pend || 0), respondidas: parseInt(c?.resp || 0) },
      resumen, locales: (locRows || []).map((l) => l.location_name),
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
      if (roles.length && !roles.includes(payload.rol)) {
        return res.status(403).json({ ok: false, error: "Sin permiso para este recurso" });
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
function localScope(req) {
  return (req.user && req.user.rol !== "direccion" && req.user.local) ? String(req.user.local).trim() : null;
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
function puedeAccederLocal(req, local) {
  const l = String(local || "").trim();
  if (!l) return false;
  if (req.user && req.user.rol === "direccion") return true;
  return l === localScope(req);
}

// Auth endpoints
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Faltan credenciales" });
  }
  try {
    // Usuario insensible a mayúsculas/minúsculas (la contraseña sí distingue). Así "Direccion"
    // y "direccion" entran igual. Se recorta espacio sobrante por si acaso.
    const user = await dbGet("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", [String(username).trim()]);
    if (!user) return res.status(401).json({ ok: false, error: "Credenciales incorrectas" });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ ok: false, error: "Credenciales incorrectas" });
    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre, local: user.local, modulos: modulosEfectivos(user.rol, user.modulos) },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ ok: true, token, rol: user.rol, nombre: user.nombre });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error de autenticación" });
  }
});

app.get("/api/auth/me", requireAuth(), (req, res) => {
  res.json({ ok: true, user: req.user });
});

// Gestión de usuarios (solo dirección)
// Catálogo de módulos del panel (para pintar checkboxes en el editor de usuarios).
app.get("/api/users/catalogo-modulos", requireAuth(["direccion"]), (req, res) => {
  res.json({ ok: true, data: CATALOGO_MODULOS });
});

app.get("/api/users", requireAuth(["direccion"]), async (req, res) => {
  try {
    const rows = await dbAll("SELECT id, username, rol, nombre, local, modulos, password_enc, creado_en FROM users ORDER BY rol");
    const data = (rows || []).map((u) => ({
      id: u.id, username: u.username, rol: u.rol, nombre: u.nombre, local: u.local, creado_en: u.creado_en,
      modulos: modulosEfectivos(u.rol, u.modulos),      // módulos que realmente puede ver
      restringido: !!(u.modulos && String(u.modulos).trim()), // tiene allowlist propia
      pass_visible: !!u.password_enc,                    // ¿hay copia recuperable para "ver"?
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
    const row = await dbRun(
      `INSERT INTO users (username, password_hash, password_enc, rol, nombre, local, modulos, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [username, hash, encUserPass(password), rol, nombre || "", local || "", mods ? JSON.stringify(mods) : null, creado_en]
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
    await dbRun(
      "UPDATE users SET rol = ?, nombre = ?, local = ?, modulos = ? WHERE id = ?",
      [rol, nombre || "", local || "", mods ? JSON.stringify(mods) : null, req.params.id]
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
    await dbRun("UPDATE users SET password_hash = ?, password_enc = ? WHERE id = ?", [hash, encUserPass(password), req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error actualizando contraseña" });
  }
});

// Ver la contraseña en claro (solo dirección). Descifra la copia AES-GCM. Las cuentas creadas
// antes de esta función no tienen copia → { disponible:false } y hay que restablecerla.
app.get("/api/users/:id/password", requireAuth(["direccion"]), async (req, res) => {
  try {
    const row = await dbGet("SELECT password_enc FROM users WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    const plain = decUserPass(row.password_enc);
    if (!plain) return res.json({ ok: true, disponible: false });
    res.json({ ok: true, disponible: true, password: plain });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error leyendo la contraseña" });
  }
});

app.delete("/api/users/:id", requireAuth(["direccion"]), async (req, res) => {
  try {
    await dbRun("DELETE FROM users WHERE id = ?", [req.params.id]);
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
  if (genero) { sql += ` AND c.genero = ?`; params.push(genero); }
  if (cumple_mes) { sql += ` AND TO_CHAR(c.nacimiento::date, 'MM') = ?`; params.push(cumple_mes.padStart(2, "0")); }
  if (filtros.from) { sql += ` AND c.ultima_actividad >= ?`; params.push(filtros.from); }
  if (filtros.to) { sql += ` AND c.ultima_actividad <= ?`; params.push(filtros.to + " 23:59:59"); }
  if (con_email) sql += ` AND c.correo IS NOT NULL AND c.correo <> ''`;
  if (con_telefono) sql += ` AND c.telefono IS NOT NULL AND c.telefono <> ''`;
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
    const sql = `SELECT * FROM reservas ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY dia ASC, hora ASC`;
    const rows = await dbAll(sql, params);
    res.json({ ok: true, data: rows });
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
    const hoy = new Date().toISOString().slice(0, 10);
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
    const local = (req.user && req.user.rol !== "direccion" && req.user.local)
      ? String(req.user.local).trim()
      : ((req.query.local && String(req.query.local).trim()) || null);
    const data = await getDashboard({ get: dbGet, all: dbAll }, { whatsappConnected: isReady(), local });
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
async function runAgoraSync() {
  const configs = await loadAgoraConfigsActive();
  if (!configs.length) return;
  const hoy = new Date().toISOString().slice(0, 10);
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
  const hoy = new Date().toISOString().slice(0, 10);
  const desde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const hasta = new Date(Date.now() + 86400000).toISOString().slice(0, 10); // incluye hoy
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
    const local = (req.user && req.user.rol !== "direccion" && req.user.local)
      ? String(req.user.local).trim()
      : ((req.query.local && String(req.query.local).trim()) || null);
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
    const local = (req.user && req.user.rol !== "direccion" && req.user.local)
      ? String(req.user.local).trim()
      : ((req.query.local && String(req.query.local).trim()) || null);
    const from = String(req.query.from || "").slice(0, 10);
    const to = String(req.query.to || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return res.status(400).json({ ok: false, error: "Rango inválido" });
    const lf = local ? " AND local = ?" : "";
    const lp = local ? [local] : [];
    const resRows = await dbAll(`SELECT dia, COUNT(*)::int n, COALESCE(SUM(personas),0)::int personas FROM reservas WHERE dia >= ? AND dia <= ?${lf} GROUP BY dia ORDER BY dia`, [from, to, ...lp]);
    const hoy = new Date().toISOString().slice(0, 10);
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
    const gasRow = await dbGet(`SELECT COUNT(*)::int n, COALESCE(SUM(total),0)::float total, COALESCE(SUM(base_imponible),0)::float base FROM facturas WHERE fecha >= ? AND fecha <= ?${lf}`, [from, to, ...lp]);
    const gastosTotal = gasRow ? gasRow.total : 0;
    const reservasTotal = resRows.reduce((s, r) => s + r.n, 0);
    const personasTotal = resRows.reduce((s, r) => s + r.personas, 0);
    const ventasTotal = ventasSerie.reduce((s, r) => s + (r.ventas || 0), 0);
    const ticketsTotal = ventasSerie.reduce((s, r) => s + (r.tickets || 0), 0);
    res.json({ ok: true, data: {
      from, to, hoy, hoyEnVivo,
      reservas: { total: reservasTotal, personas: personasTotal, serie: resRows },
      ventas: { disponible: ventasSerie.length > 0, total: Math.round(ventasTotal * 100) / 100, tickets: ticketsTotal, ticket_medio: ticketsTotal ? Math.round(ventasTotal / ticketsTotal * 100) / 100 : 0, serie: ventasSerie, fuente: fuenteVentas },
      gastos: { disponible: !!(gasRow && gasRow.n > 0), total: Math.round(gastosTotal * 100) / 100, base: Math.round((gasRow ? gasRow.base : 0) * 100) / 100, n: gasRow ? gasRow.n : 0 },
      resultado: (ventasSerie.length || (gasRow && gasRow.n)) ? Math.round((ventasTotal - gastosTotal) * 100) / 100 : null,
    } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

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
    const hasta = new Date().toISOString().slice(0, 10);
    const desde = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
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
    const hoy = new Date().toISOString().slice(0, 10);
    const desde = (req.body.desde && String(req.body.desde)) || new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
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
    // 2) Descargar cada script y extraer rutas candidatas.
    const bajados = [];
    for (const s of scripts) {
      try {
        const r = await fetchTextTimeout(s, headers);
        extraerRutasApi(r.text).forEach((x) => rutas.add(x));
        bajados.push({ url: redact(s), status: r.status, bytes: r.text.length });
      } catch (e) { bajados.push({ url: redact(s), error: e && e.name === "AbortError" ? "timeout" : (e.message || "error") }); }
    }
    const { api, otras } = clasificarRutas([...rutas]);
    res.json({ ok: true, local, base: cfg.host, scripts: bajados, api: api.slice(0, 120), otras: otras.slice(0, 120) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Forzar sincronización de ventas ahora mismo (solo dirección).
app.post("/api/agora/sync-now", requireAuth(["direccion"]), async (req, res) => {
  try {
    const configs = await loadAgoraConfigsActive();
    if (!configs.length) return res.json({ ok: true, configurados: 0, mensaje: "No hay locales de Ágora activos" });
    await runAgoraSync();
    const lastSync = await getConfig("agora_last_sync");
    res.json({ ok: true, configurados: configs.length, lastSync: lastSync || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error sincronizando" });
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
      `INSERT INTO users (username, password_hash, password_enc, rol, nombre, local, telefono, email, puesto, fecha_alta, activo, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?) RETURNING id`,
      [username, hash, encUserPass(password), rol, cand.nombre || "", local, cand.telefono || null, cand.email || null, cand.puesto || null, now.slice(0, 10), now]);
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
const RRHH_ROLES = ["rrhh", "direccion", "encargado"];
function rrhhTodoLocal(req) { return req.user && (req.user.rol === "direccion" || req.user.rol === "rrhh"); }
function rrhhLocalScope(req) { return rrhhTodoLocal(req) ? null : localScope(req); } // null = sin restricción
function rrhhPuedeLocal(req, local) {
  if (rrhhTodoLocal(req)) return true;
  const l = String(local || "").trim();
  return !!l && l === localScope(req);
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
  const { username, password, nombre } = req.body;
  let local = req.body.local, rol = req.body.rol || "trabajador";
  if (!username || !password || !nombre) return res.status(400).json({ ok: false, error: "Faltan usuario, contraseña o nombre" });
  if (esEncargado(req)) { local = localScope(req); rol = "trabajador"; }
  if (!local) return res.status(400).json({ ok: false, error: "Falta el local" });
  if (!rrhhPuedeLocal(req, local)) return res.status(403).json({ ok: false, error: "Sin acceso a este local" });
  if (!["trabajador", "encargado"].includes(rol)) rol = "trabajador";
  try {
    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const row = await dbRun(
      `INSERT INTO users (username, password_hash, password_enc, rol, nombre, local, fecha_alta, activo, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?) RETURNING id`,
      [username, hash, encUserPass(password), rol, nombre, local, now.slice(0, 10), now]);
    invalidarInternos();
    res.json({ ok: true, id: row.id });
  } catch (e) {
    res.status(400).json({ ok: false, error: /duplicate|unique/i.test(e.message || "") ? "Ese usuario ya existe" : "No se pudo crear" });
  }
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
      dbAll(`SELECT id, nombre, orden, inicio_min, fin_min FROM hor_tramos WHERE local = ? AND activo ORDER BY orden, inicio_min`, [local]),
      dbAll(`SELECT id, nombre, username, puesto FROM users
             WHERE local = ? AND rol IN ('trabajador','encargado') AND COALESCE(activo,1) = 1 AND fecha_baja IS NULL
             ORDER BY nombre`, [local]),
    ]);
    // Se trabaja siempre sobre el borrador; si no hay, se ve la publicada en solo lectura.
    const semana = await dbGet(
      `SELECT * FROM hor_semanas WHERE local = ? AND lunes = ? AND estado IN ('borrador','publicado')
       ORDER BY CASE estado WHEN 'borrador' THEN 0 ELSE 1 END LIMIT 1`, [local, lunes]
    );
    const asignaciones = semana
      ? await dbAll(`SELECT * FROM hor_asignaciones WHERE semana_id = ? ORDER BY dia, inicio_min, orden`, [semana.id])
      : [];
    res.json({ ok: true, local, lunes, dias: diasSemana(lunes), semana: semana || null, areas, tramos, equipo, asignaciones });
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
    const ini = Number(inicio_min), fin = Number(fin_min);
    if (!Number.isInteger(ini) || !Number.isInteger(fin) || fin < ini || fin > 2160) {
      return res.status(400).json({ ok: false, error: "El horario no es válido" });
    }
    if (!diasSemana(chk.semana.lunes).includes(String(dia))) {
      return res.status(400).json({ ok: false, error: "Ese día no es de esta semana" });
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
    const dia = req.body.dia ?? a.dia;
    if (!diasSemana(chk.semana.lunes).includes(String(dia))) {
      return res.status(400).json({ ok: false, error: "Ese día no es de esta semana" });
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
async function horContexto(local, lunes, dias) {
  const [ausencias, contratos, necesidades] = await Promise.all([
    dbAll(`SELECT * FROM hor_ausencias WHERE estado = 'aprobada' AND hasta >= ? AND desde <= ?`, [dias[0], dias[6]]),
    dbAll(`SELECT * FROM hor_contratos WHERE desde <= ? AND (hasta IS NULL OR hasta >= ?)`, [dias[6], dias[0]]),
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
    const conflictos = detectarConflictos({ lunes: s.lunes, asignaciones, trabajadores: equipo, areas, tramos, ...ctx });
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
    const equipo = await dbAll(
      `SELECT id, nombre FROM users WHERE local = ? AND rol IN ('trabajador','encargado')
       AND COALESCE(activo,1) = 1 AND fecha_baja IS NULL`, [destino.local]
    );
    const vivos = new Set(equipo.map((w) => String(w.id)));
    const { ausencias } = await horContexto(destino.local, destino.lunes, diasDestino);
    const ausente = (wid, dia) => (ausencias || []).some((a) =>
      String(a.worker_id) === String(wid) && String(a.desde) <= dia && dia <= String(a.hasta));

    const omitidos = [];
    let copiadas = 0;
    if (req.body?.reemplazar) await dbRun(`DELETE FROM hor_asignaciones WHERE semana_id = ?`, [destino.id]);
    for (const l of lineas) {
      if (!vivos.has(String(l.worker_id))) { omitidos.push({ worker_id: l.worker_id, dia: l.dia, motivo: "ya no está en el equipo" }); continue; }
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
    const equipo = (await q(`SELECT id, nombre, username FROM users WHERE local = ? AND rol IN ('trabajador','encargado')`, [s.local])).rows;
    const areas = (await q(`SELECT id, nombre, orden FROM hor_areas WHERE local = ? ORDER BY orden`, [s.local])).rows;
    const tramos = (await q(`SELECT id, nombre, orden, inicio_min, fin_min FROM hor_tramos WHERE local = ? ORDER BY orden`, [s.local])).rows;
    const ausencias = (await q(`SELECT * FROM hor_ausencias WHERE estado = 'aprobada' AND hasta >= ? AND desde <= ?`, [dias[0], dias[6]])).rows;
    const contratos = (await q(`SELECT * FROM hor_contratos WHERE desde <= ?`, [dias[6]])).rows;
    const necesidades = (await q(`SELECT * FROM hor_necesidades WHERE local = ?`, [s.local])).rows;

    const conflictos = detectarConflictos({ lunes: s.lunes, asignaciones, trabajadores: equipo, areas, tramos, ausencias, contratos, necesidades });
    const val = validarPublicacion({ estado: s.estado, conflictos, avisosAceptados: req.body?.aceptar_avisos ? true : null });
    if (!val.ok) { await client.query("ROLLBACK"); return res.status(409).json({ ok: false, ...val }); }

    const ahora = isoConOffset(Date.now());
    const quien = req.user.nombre || req.user.username;
    // La anterior publicada pasa a sustituida, con la hora exacta: es lo que permite
    // preguntar dentro de dos años qué horario regía un día concreto.
    await q(`UPDATE hor_semanas SET estado = 'sustituido', sustituido_en = ? WHERE local = ? AND lunes = ? AND estado = 'publicado'`,
      [ahora, s.local, s.lunes]);
    await q(`UPDATE hor_semanas SET estado = 'publicado', publicado_en = ?, publicado_por = ?, avisos_aceptados = ? WHERE id = ?`,
      [ahora, quien, conflictos.length ? JSON.stringify({ por: quien, en: ahora, avisos: conflictos.filter((c) => c.severidad === "avisa") }) : null, s.id]);

    const snapshot = construirSnapshot({ semana: s, areas, tramos, asignaciones, trabajadores: equipo, dias });
    const texto = serializarCanonico(snapshot);
    await q(`INSERT INTO hor_publicaciones (semana_id, local, lunes, version, snapshot, hash, publicado_en, publicado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (semana_id) DO NOTHING`,
      [s.id, s.local, s.lunes, s.version, texto, crypto.createHash("sha256").update(texto).digest("hex"), ahora, quien]);
    await client.query("COMMIT");
    res.json({ ok: true, version: s.version, avisos: conflictos.filter((c) => c.severidad === "avisa").length });
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
    const hoy = new Date().toISOString().slice(0, 10);
    if (inv.usado) return res.status(410).json({ ok: false, error: "Ya has contestado este mes. ¡Gracias!" });
    if (inv.caduca_en < hoy) return res.status(410).json({ ok: false, error: "Este enlace ha caducado." });
    res.json({ ok: true, mes: inv.mes, version: PULSO_VERSION, preguntas: PULSO_PREGUNTAS });
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
    const hoy = new Date().toISOString().slice(0, 10);
    if (!inv) { await client.query("ROLLBACK"); return res.status(404).json({ ok: false, error: "Este enlace no es válido." }); }
    if (inv.usado) { await client.query("ROLLBACK"); return res.status(410).json({ ok: false, error: "Ya has contestado este mes. ¡Gracias!" }); }
    if (inv.caduca_en < hoy) { await client.query("ROLLBACK"); return res.status(410).json({ ok: false, error: "Este enlace ha caducado." }); }

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
    const hoy = new Date().toISOString().slice(0, 10);
    if (inv.caduca_en < hoy) return res.status(410).json({ ok: false, error: "Este enlace ha caducado." });
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
    const hoy = new Date().toISOString().slice(0, 10);
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
    const hoy = new Date().toISOString().slice(0, 10);
    if (inv.caduca_en < hoy) return res.status(410).json({ ok: false, error: "El plazo de este mes ya ha pasado." });
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
    const caduca = caducidadMes(mes);
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
  const hoy = new Date().toISOString().slice(0, 10);
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
const hoyISO = () => new Date().toISOString().slice(0, 10);
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
    const hoy = new Date().toISOString().slice(0, 10);
    res.json({ ok: true, data: { ...u, antiguedad: rrhhAntiguedad(u.fecha_alta, hoy), editables: MI_PERFIL_CAMPOS } });
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
    const w = await dbGet("SELECT id, username, nombre, rol, local, telefono, email, dni, puesto, fecha_nac, fecha_alta, fecha_baja, foto_url, agora_username, activo, creado_en FROM users WHERE id = ?", [req.params.id]);
    if (!w) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    if (!rrhhPuedeLocal(req, w.local)) return res.status(403).json({ ok: false, error: "Sin acceso a este trabajador" });
    const notas = await dbAll("SELECT * FROM hr_worker_notes WHERE worker_id = ? ORDER BY creado_en DESC", [w.id]);
    const checkins = await dbAll("SELECT * FROM hr_llamadas_mes WHERE worker_id = ? ORDER BY mes DESC", [w.id]);
    let documentos = await dbAll("SELECT * FROM hr_documentos WHERE worker_id = ? ORDER BY creado_en DESC", [w.id]);
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
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/api/rrhh/trabajador/:id/documentos", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const wl = await rrhhWorkerLocal(req.params.id);
    if (wl === null) return res.status(404).json({ ok: false, error: "Trabajador no encontrado" });
    if (!rrhhPuedeLocal(req, wl)) return res.status(403).json({ ok: false, error: "Sin acceso a este trabajador" });
    let docs = await dbAll("SELECT * FROM hr_documentos WHERE worker_id = ? ORDER BY creado_en DESC", [req.params.id]);
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
    const fin = finalizeCvUpload({ tmpPath: req.file.path, filename: req.file.filename, originalname: req.file.originalname, publicDir: uploadsDir });
    if (!fin.ok) return res.status(400).json({ ok: false, error: "Archivo no válido (tipo o contenido)" });
    const sensible = esEncargado(req) ? 0 : (req.body.sensible === "1" || req.body.sensible === "true" || req.body.sensible === true ? 1 : 0);
    const row = await dbRun(
      `INSERT INTO hr_documentos (worker_id, tipo, nombre, url, sensible, fecha_emision, fecha_caducidad, autor, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [req.params.id, String(req.body.tipo || "otro"), req.body.nombre || req.file.originalname, `/uploads/${req.file.filename}`, sensible, req.body.fecha_emision || null, req.body.fecha_caducidad || null, req.user?.nombre || req.user?.username || null, new Date().toISOString()]);
    res.json({ ok: true, id: row.id, url: `/uploads/${req.file.filename}` });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.delete("/api/rrhh/documento/:id", requireAuth(RRHH_ROLES), async (req, res) => {
  try {
    const doc = await dbGet("SELECT worker_id, sensible FROM hr_documentos WHERE id = ?", [req.params.id]);
    if (!doc) return res.json({ ok: true });
    const wl = await rrhhWorkerLocal(doc.worker_id);
    if (!rrhhPuedeLocal(req, wl)) return res.status(403).json({ ok: false, error: "Sin acceso" });
    if (esEncargado(req) && (doc.sensible === 1 || doc.sensible === true)) return res.status(403).json({ ok: false, error: "Documento sensible" });
    await dbRun("DELETE FROM hr_documentos WHERE id = ?", [req.params.id]);
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
  if (!dataUrl) return res.json({ ok: true, connected: false, qr: null });
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
    const hoy = new Date().toISOString().slice(0, 10);
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
      [nombre_campana || ("Mensaje rápido " + new Date().toISOString().slice(0, 10)), JSON.stringify(segmento), mensaje]);
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
    const seg = { q: req.body.q, genero: req.body.genero, poblacion: req.body.poblacion, local: req.body.local, cumple_mes: req.body.cumple_mes, con_email: req.body.con_email, con_telefono: req.body.con_telefono, idioma: req.body.idioma, origen: req.body.origen, from: req.body.from, to: req.body.to, excluir_telefonos: Array.isArray(req.body.excluir_telefonos) ? req.body.excluir_telefonos : [], traducir: !!req.body.traducir, excluir_baja: 1, soloOptIn: !!soloOptIn };
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
          try { await setMarketingPref(telefono, { baja: 1 }); console.log(`🔕 Opt-out marketing: ${telefono}`); } catch (e) { console.error("Opt-out:", e.message); }
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
         AND creado_en > NOW() - INTERVAL '4 hours'
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
        dbGet, dbRun,
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
