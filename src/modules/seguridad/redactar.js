// Redacción de lo que se escribe en los logs. PURO: sin dependencias, sin efectos.
//
// POR QUÉ EXISTE, con nombres y apellidos: `initWhatsApp()` hacía
// `connectToWhatsApp().catch(err => console.error("Error iniciando WhatsApp:", err))`. Era la
// única línea del fichero que imprimía el error ENTERO en vez de su `.message`, y bastó con que
// libsignal fallara al abrir una sesión guardada para que Node volcase el grafo completo del
// objeto: `SessionEntry`, claves privadas, claves raíz, pares efímeros y cadenas. En los logs de
// producción, que cualquiera con acceso al panel de Replit puede leer.
//
// La lección no es «esa línea estaba mal». Es que **un objeto de error de una librería de
// criptografía no se puede imprimir**, nunca, y que el código no debería depender de que alguien
// se acuerde de poner `.message`. De ahí este módulo: hay UNA forma de escribir un error en un
// log, y no admite objetos.

/**
 * Nombres de campo que no se imprimen jamás. En minúsculas; la comparación ignora mayúsculas.
 *
 * Los primeros son de libsignal y de Baileys —los que aparecieron en el incidente— y el resto son
 * los sospechosos habituales. Es deliberadamente generosa: en un log, redactar de más cuesta una
 * depuración algo más lenta; redactar de menos cuesta rotar las credenciales de la empresa.
 */
export const CLAVES_SENSIBLES = new Set([
  // libsignal / Baileys
  "privkey", "pubkey", "rootkey", "basekey", "chainkey", "ephemeralkeypair", "keypair",
  "signedprekey", "prekey", "prekeys", "identitykey", "signedidentitykey", "noisekey",
  "advsecretkey", "senderkey", "messagekeys", "sessionentry", "session", "sessions",
  "pairingephemeralkeypair", "myidentitykey", "theiridentitykey", "signalidentities",
  // credenciales y sesión, en general
  "creds", "credentials", "credential", "key", "keys", "secret", "token", "password", "passwd",
  "pass", "cookie", "authorization", "auth", "apikey", "api_key", "accesstoken", "refreshtoken",
  "clientsecret", "privatekey", "cert", "p12", "pfx",
]);

/** Clases enteras que no se inspeccionan: se sustituyen por su nombre y ya. */
export const CLASES_SENSIBLES = new Set(["SessionEntry", "SessionRecord", "SessionBuilder", "SessionCipher"]);

/** Un nombre de campo sospechoso aunque no esté en la lista: `algo_token`, `xKeyPair`, `authHeader`… */
const PATRON_SENSIBLE = /(priv|secret|token|password|passwd|cookie|auth|apikey|api_key|cred)/i;
const PATRON_CLAVE = /key(pair|s)?$/i;

export const REDACTADO = "[redactado]";

export function esClaveSensible(nombre) {
  const n = String(nombre || "").toLowerCase();
  if (CLAVES_SENSIBLES.has(n)) return true;
  return PATRON_SENSIBLE.test(n) || PATRON_CLAVE.test(n);
}

const esBytes = (v) =>
  (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) || ArrayBuffer.isView(v) || v instanceof ArrayBuffer;

/**
 * Una copia del valor apta para un log.
 *
 * Recorta por profundidad, por número de claves y por longitud de texto, además de tapar los
 * campos sensibles. Los tres límites importan: un objeto de Baileys tiene miles de nodos, y un
 * log de veinte mil líneas es tan inútil como uno vacío — con el agravante de que nadie lo lee y
 * ahí es donde se esconden las claves.
 *
 * Los bytes NUNCA se imprimen, ni siquiera truncados: media clave sigue siendo media clave.
 */
export function redactar(valor, { profundidad = 3, maxTexto = 200, maxClaves = 40, maxArray = 20 } = {}) {
  const vistos = new WeakSet();

  const paso = (v, resto) => {
    if (v === null || v === undefined) return v;
    if (esBytes(v)) return `[bytes:${v.byteLength ?? v.length ?? "?"}]`;

    const t = typeof v;
    if (t === "string") return v.length > maxTexto ? v.slice(0, maxTexto) + "…" : v;
    if (t === "number" || t === "boolean" || t === "bigint") return v;
    if (t === "function") return "[función]";
    if (t === "symbol") return "[símbolo]";

    if (v instanceof Error) return resumenError(v);
    if (v instanceof Date) return v.toISOString();

    // Una clase de sesión no se abre ni un nivel: dentro solo hay material criptográfico.
    const clase = v.constructor && v.constructor.name;
    if (clase && CLASES_SENSIBLES.has(clase)) return `[${clase} redactado]`;

    if (resto <= 0) return "[…]";
    if (vistos.has(v)) return "[circular]";
    vistos.add(v);

    if (Array.isArray(v)) {
      const corte = v.slice(0, maxArray).map((x) => paso(x, resto - 1));
      if (v.length > maxArray) corte.push(`[…${v.length - maxArray} más]`);
      return corte;
    }

    const out = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n >= maxClaves) { out["…"] = `[${Object.keys(v).length - maxClaves} claves más]`; break; }
      out[k] = esClaveSensible(k) ? REDACTADO : paso(v[k], resto - 1);
      n++;
    }
    return out;
  };

  return paso(valor, profundidad);
}

/**
 * Lo ÚNICO que se puede sacar de un error a un log.
 *
 * Nombre, mensaje y códigos. Nada más: ni `cause`, ni propiedades sueltas, ni la pila —que en
 * Node puede arrastrar variables capturadas en el mensaje de un `assert`.
 *
 * `statusCode` y `code` sí salen porque son justo lo que hace falta para diagnosticar una
 * desconexión (el 401, el 408, el `loggedOut`) y no revelan nada.
 */
export function resumenError(err) {
  if (err === null || err === undefined) return { name: "Error", message: "sin detalle" };
  if (typeof err === "string") return { name: "Error", message: err.slice(0, 200) };

  const r = {
    name: String(err.name || "Error").slice(0, 60),
    message: String(err.message || err).slice(0, 200),
  };
  if (err.code !== undefined) r.code = String(err.code).slice(0, 40);
  const status = err.statusCode ?? err.status ?? err.output?.statusCode;
  if (status !== undefined) r.statusCode = Number(status) || String(status).slice(0, 10);
  return r;
}

/**
 * Un error de BASE DE DATOS, para un log. Como `lineaError`, pero SIN el mensaje.
 *
 * POR QUÉ HACE FALTA OTRA: `lineaError` sí imprime `.message`, y el de PostgreSQL no es un texto
 * genérico — lleva dentro lo que ha fallado, literalmente:
 *
 *   duplicate key value violates unique constraint "fid_integraciones_token_hash_key"
 *   connect ECONNREFUSED 10.20.30.40:5432
 *   password authentication failed for user "neondb_owner"
 *   Key (token_hash)=(9f2a1c…) already exists.
 *
 * Es decir: el hash de un token, la IP y el puerto del servidor, el usuario de la base. Nada de
 * eso puede acabar en un log que se lee desde el panel de un proveedor.
 *
 * Lo que SÍ sale es el `code` de PostgreSQL —`23505`, `42P01`, `57014`—, que es exactamente lo que
 * hace falta para saber qué pasó y no dice nada de nadie.
 */
export function lineaErrorSql(contexto, err) {
  const nombre = String((err && err.name) || "Error").slice(0, 60);
  const code = err && err.code !== undefined ? String(err.code).slice(0, 10) : null;
  const rutina = err && err.routine !== undefined ? String(err.routine).slice(0, 40) : null;
  return `${contexto}: ${nombre}${code ? ` · code=${code}` : ""}${rutina ? ` · ${rutina}` : ""}`;
}

/** La línea que se escribe. Devuelve texto, no un objeto: así no hay forma de que se expanda. */
export function lineaError(contexto, err) {
  const r = resumenError(err);
  const extra = [r.code && `code=${r.code}`, r.statusCode && `status=${r.statusCode}`].filter(Boolean).join(" ");
  return `${contexto}: ${r.name}: ${r.message}${extra ? " · " + extra : ""}`;
}
