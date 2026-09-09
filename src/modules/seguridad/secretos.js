// Cifrado de secretos en reposo. PURO salvo por el `crypto` de Node.
//
// Guarda dos cosas: las credenciales de los TPV de Ágora (`agora_locales.token`, `.pass_enc`) y
// los certificados de firma de la wallet (`wallet_config.datos_enc`). Son las únicas claves de
// terceros que este sistema custodia, y las tres viven en la base de datos.
//
// AES-256-GCM: cifra y además autentica, así que un valor manipulado en la base no se descifra
// «a otra cosa» — falla, y se puede contar.
//
// ── EL FORMATO v2 ───────────────────────────────────────────────────────────────────────────
//
//     enc:v2:<kid>:<iv>:<tag>:<ciphertext>
//            └ 12 hex  └──── base64url ────┘
//
// `kid` identifica QUÉ clave cifró el valor (ver clave-datos.js). Es lo que permite rotar sin
// adivinar: con dos claves cargadas, cada valor dice cuál le toca, y se puede migrar poco a poco
// en vez de todo a la vez con el servicio parado.
//
// El dominio («agora-token-v1», «wallet-v1») NO va en la cadena: va como datos autenticados
// adicionales del GCM. El efecto es el mismo que tenían las sales del formato viejo —un secreto
// de Ágora no se abre con el contexto de la wallet— pero sin gastar una clave distinta por uso.
//
// ── QUÉ SE LEE Y QUÉ SE ESCRIBE ─────────────────────────────────────────────────────────────
//
// Se LEEN tres formas: v2, el formato legado (ver legado-inseguro.js) y el texto en claro, que
// existió de verdad —hubo tokens sembrados desde la variable AGORA_LOCALES sin cifrar— y romperlo
// al leer habría dejado los TPV sin conexión sin decir por qué.
//
// Se ESCRIBE una sola: v2. Aquí no hay función que produzca formato legado, y ésa es la única
// garantía que aguanta: no se puede llamar a lo que no existe.

import { descifrarLegado, pareceLegado } from "./legado-inseguro.js";
import crypto from "crypto";

/** Los contextos de uso. Coinciden con las sales del formato viejo, para poder pensar en uno solo. */
export const DOMINIOS = { AGORA: "agora-token-v1", WALLET: "wallet-v1" };

export const V2_PREFIJO = "enc:v2:";
const RE_V2 = /^enc:v2:([0-9a-f]{12}):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]*)$/;

const b64u = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Lo que se autentica junto al texto: versión, clave y uso. Atarlos impide reutilizar un
 *  criptograma de un sitio en otro aunque comparta clave. */
const datosAsociados = (kid, dominio) => Buffer.from(`v2|${kid}|${dominio}`, "utf8");

/**
 * En qué formato está un valor guardado, sin necesidad de ninguna clave.
 *
 * La distinción que importa es «corrupto» frente a «claro»: algo que empieza por `enc:` y no
 * casa con ningún formato NO es texto en claro, es un valor roto. Devolverlo tal cual sería
 * mandarle a Ágora una cadena `enc:...` como si fuera la contraseña.
 */
export function formatoDe(guardado) {
  if (guardado === null || guardado === undefined || guardado === "") return "vacio";
  const s = String(guardado);
  if (RE_V2.test(s)) return "v2";
  if (pareceLegado(s)) return "legado";
  if (s.startsWith("enc:")) return "corrupto";
  return "claro";
}

/** El `kid` que declara un valor v2, sin descifrarlo. `null` si no es v2. */
export function kidDeValor(guardado) {
  const m = RE_V2.exec(String(guardado ?? ""));
  return m ? m[1] : null;
}

class SinClave extends Error {
  constructor(msg) { super(msg); this.name = "SinClave"; this.code = "SIN_CLAVE"; }
}

function exigeLlavero(llavero, quien) {
  if (!llavero || typeof llavero !== "object" || !("actual" in llavero)) {
    // R01 entró por una conversión silenciosa. Aquí no se convierte nada: o es un llavero o no.
    throw new TypeError(`${quien} espera un llavero de clave-datos.js, no una clave suelta`);
  }
}

/**
 * Cifra. Siempre en v2, siempre con la clave actual.
 *
 * Si no hay clave, LANZA. No devuelve el texto en claro, ni un `null` que el llamante pueda
 * guardar sin mirar: guardar en claro una contraseña de TPV porque faltaba un Secret sería un
 * fallo mucho peor que el error que se ve al intentarlo.
 */
export function cifrar(plano, llavero, dominio) {
  exigeLlavero(llavero, "cifrar");
  if (!dominio) throw new TypeError("cifrar necesita saber para qué es (DOMINIOS.AGORA, DOMINIOS.WALLET…)");
  if (!plano) return null;
  if (!llavero.actual) throw new SinClave("no hay DATA_ENC_KEY: no se puede guardar un secreto nuevo");

  const { clave, kid } = llavero.actual;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", clave, iv);
  c.setAAD(datosAsociados(kid, dominio));
  const ct = Buffer.concat([c.update(String(plano), "utf8"), c.final()]);
  return `${V2_PREFIJO}${kid}:${b64u(iv)}:${b64u(c.getAuthTag())}:${b64u(ct)}`;
}

/**
 * Abre un valor guardado y CUENTA LO QUE PASA.
 *
 * Devuelve `{ ok, valor, formato, motivo }` en vez de una cadena o `null`, y esa es toda la
 * diferencia: con `null` no se distingue «este local no tiene contraseña» de «la contraseña
 * está ahí pero no la sabemos descifrar». Lo primero es normal; lo segundo es una incidencia
 * que hay que ver en el panel antes de que alguien la descubra porque el TPV dejó de sincronizar.
 *
 * `valor` solo se rellena cuando se ha podido leer. `motivo` nunca contiene datos.
 */
export function abrir(guardado, llavero, dominio) {
  exigeLlavero(llavero, "abrir");
  const formato = formatoDe(guardado);
  const s = guardado === null || guardado === undefined ? "" : String(guardado);

  if (formato === "vacio") return { ok: true, valor: null, formato, motivo: null };
  if (formato === "claro") return { ok: true, valor: s, formato, motivo: null };
  if (formato === "corrupto") return { ok: false, valor: null, formato, motivo: "formato_no_reconocido" };

  if (formato === "legado") {
    const v = descifrarLegado(s, dominio);
    return v === null
      ? { ok: false, valor: null, formato, motivo: "no_descifra" }
      : { ok: true, valor: v, formato, motivo: null };
  }

  const [, kid, ivs, tags, cts] = RE_V2.exec(s);
  const candidata = [llavero.actual, llavero.anterior].find((k) => k && k.kid === kid);
  if (!candidata) return { ok: false, valor: null, formato, motivo: "kid_desconocido" };

  try {
    const d = crypto.createDecipheriv("aes-256-gcm", candidata.clave, deB64u(ivs));
    d.setAAD(datosAsociados(kid, dominio));
    d.setAuthTag(deB64u(tags));
    const v = Buffer.concat([d.update(deB64u(cts)), d.final()]).toString("utf8");
    return { ok: true, valor: v, formato, motivo: null };
  } catch {
    return { ok: false, valor: null, formato, motivo: "no_descifra" };
  }
}

/** Atajo para quien solo quiere el valor. `null` tanto si no hay como si no abre. */
export function descifrar(guardado, llavero, dominio) {
  return abrir(guardado, llavero, dominio).valor;
}

/** «••••1234»: lo justo para reconocer cuál de dos certificados está cargado, sin enseñar nada.
 *  Se usa en el panel, donde el secreto NUNCA sale por la API. */
export function pista(plano) {
  const s = String(plano || "");
  return s.length > 4 ? "••••" + s.slice(-4) : "••••";
}
