// AVISAR A WALLET DE QUE UN PASE HA CAMBIADO.
//
// ── POR QUÉ CERTIFICADO Y NO CLAVE `.p8` ─────────────────────────────────────────────────────
//
// Porque la guía de Apple lo dice con todas las letras:
//
//     «You use the same certificate and private key for sending push notifications as for
//      signing passes.»
//     — Wallet Developer Guide · Updating a Pass
//
// Es decir: el MISMO `.p12` del Pass Type ID que ya tenemos guardado y cifrado para firmar el
// pase sirve para hablar con APNs. No hay que crear ninguna clave nueva en Apple Developer, no
// hay Key ID, no hay Team ID por separado y no hay un secreto más que custodiar.
//
// Node puede firmar ES256 sin dependencias, así que la otra opción también era técnicamente
// posible. No es motivo suficiente: reutilizar lo que ya existe y está probado tiene menos
// piezas que puedan fallar, y cada secreto nuevo es un sitio más donde equivocarse.
//
// ── EL AVISO VA VACÍO, Y ES OBLIGATORIO QUE LO VAYA ──────────────────────────────────────────
//
//     «Send a push notification with an empty JSON dictionary as its payload to each push token.»
//
// Y la razón está en la propia guía: los avisos no se garantizan y VARIOS SE FUNDEN EN UNO. Si
// dentro fueran los puntos, el nombre o el premio, esa información se perdería al fundirse. El
// aviso solo dice «mira otra vez»; el pase al día lo pide el dispositivo después, por HTTPS.
//
// Además de correcto, es lo que hay que hacer con los datos de alguien: por el aviso no viaja ni
// un punto ni un nombre.

import http2 from "node:http2";

/**
 * LOS DOS ENTORNOS, CERRADOS.
 *
 * No se acepta una URL escrita en el panel: un campo de texto que decide a qué servidor se manda
 * el certificado de cliente es un sitio donde alguien pega la dirección equivocada —o una ajena—
 * y nosotros le tendemos el certificado. Solo estas dos.
 */
export const ENDPOINTS = Object.freeze({
  produccion: "https://api.push.apple.com:443",
  sandbox: "https://api.sandbox.push.apple.com:443",
});

export const ENTORNOS = Object.freeze(Object.keys(ENDPOINTS));

/** Un entorno que no reconozcamos es producción NO: es un error. Mezclarlos no falla, ignora. */
export function endpointDe(entorno) {
  const e = String(entorno || "");
  return Object.prototype.hasOwnProperty.call(ENDPOINTS, e) ? ENDPOINTS[e] : null;
}

/**
 * QUÉ HACER CON LA RESPUESTA DE APNs. Puro, para poder probarlo entero sin red.
 *
 * ── CUATRO DESENLACES, Y LA DIFERENCIA ENTRE ELLOS CUESTA DINERO ─────────────────────────────
 *
 *   hecho        entregado a APNs. No significa que el usuario lo vea: significa que lo hemos
 *                entregado, que es lo único que podemos saber.
 *
 *   invalidar    EL DISPOSITIVO YA NO TIENE ESE PASE. Se borra su token y se dan de baja sus
 *                registros. Solo dos motivos llegan aquí, y los dos dicen lo mismo: ese token
 *                está muerto.
 *                  · 410 `Unregistered`     el pase se quitó del móvil.
 *                  · 400 `BadDeviceToken`   el token no es un token válido.
 *
 *   config       ALGO NUESTRO ESTÁ MAL, y el dispositivo NO tiene la culpa. Se CONSERVA el
 *                registro y el token, y NO se reintenta: reintentar no arregla un certificado ni
 *                un topic. Lo arregla una persona mirando el panel.
 *                  · 400 `DeviceTokenNotForTopic`  el token es de otro topic → casi siempre es
 *                        que estamos hablando con el APNs equivocado (sandbox contra producción)
 *                        o con el certificado de otro Pass Type ID. INVALIDAR AQUÍ SERÍA EL
 *                        ERROR CARO: borraría los tokens buenos de toda la clientela por una
 *                        casilla mal puesta, y habría que pedirles a todos que se volvieran a
 *                        bajar el carné.
 *                  · 403 cualquier motivo          el certificado no sirve o ha caducado.
 *                  · 400 `BadTopic`, `PayloadEmpty` y demás 400 deterministas: el mismo mensaje
 *                        volvería a fallar igual. No se reintenta y no se culpa al dispositivo.
 *
 *   reintentar   FALLO TRANSITORIO. 429, 5xx, un corte. Se vuelve a intentar con espera creciente
 *                y con tope.
 */
export function clasificar(estado, cuerpo) {
  const razon = (() => {
    try { return String(JSON.parse(String(cuerpo || "{}")).reason || ""); } catch { return ""; }
  })();
  if (estado === 200) return { ok: true, accion: "hecho", razon: null };

  // El token está muerto. Son los dos ÚNICOS casos.
  if (estado === 410) return { ok: false, accion: "invalidar", razon: razon || "Unregistered" };
  if (estado === 400 && razon === "BadDeviceToken") {
    return { ok: false, accion: "invalidar", razon };
  }

  // Configuración nuestra. El registro se conserva.
  if (estado === 403) return { ok: false, accion: "config", razon: razon || "Forbidden" };
  if (estado === 400) return { ok: false, accion: "config", razon: razon || "BadRequest" };

  // 429, 5xx y lo que no reconozcamos: transitorio.
  return { ok: false, accion: "reintentar", razon: razon || `http_${estado}` };
}

/** La espera antes del siguiente intento. Crece y tiene techo: 30 s, 2, 8, 30 min, y ahí se queda. */
export const ESPERAS_MS = Object.freeze([30_000, 120_000, 480_000, 1_800_000]);
export const MAX_INTENTOS = ESPERAS_MS.length;

export function proximoIntento(intentos, ahoraMs) {
  const i = Math.max(0, Math.min(ESPERAS_MS.length - 1, Number(intentos) || 0));
  return Number(ahoraMs) + ESPERAS_MS[i];
}

/**
 * MANDA EL AVISO. Una conexión, varios tokens.
 *
 * `conectar` se inyecta para poder probar contra un servidor HTTP/2 de mentira levantado en el
 * propio test. NUNCA se llama a Apple desde las pruebas.
 *
 * `cert` y `clave` son PEM en memoria. No se escriben en disco aquí: quien los tenga que extraer
 * del `.p12` lo hace con temporales 0600 y los borra en su `finally`.
 */
export async function avisar({
  tokens = [], passTypeId = "", entorno = "produccion",
  cert = null, clave = null, conectar = null, timeoutMs = 10_000,
} = {}) {
  const destino = endpointDe(entorno);
  if (!destino) throw new Error("entorno de APNs no reconocido");
  if (!passTypeId) throw new Error("falta el topic");
  if (!cert || !clave) throw new Error("falta el certificado de cliente");

  const lista = [...new Set((tokens || []).filter(Boolean).map(String))];
  if (!lista.length) return [];

  const abrir = conectar || ((url, opciones) => http2.connect(url, opciones));
  const sesion = abrir(destino, { cert, key: clave });

  const resultados = [];
  try {
    await new Promise((ok, mal) => {
      let listo = false;
      sesion.once("connect", () => { listo = true; ok(); });
      sesion.once("error", (e) => { if (!listo) mal(e); });
      setTimeout(() => { if (!listo) mal(new Error("tiempo agotado conectando con APNs")); }, timeoutMs);
    });

    for (const token of lista) {
      resultados.push(await new Promise((ok) => {
        let cerrado = false;
        const fin = (r) => { if (!cerrado) { cerrado = true; ok({ token, ...r }); } };
        try {
          const req = sesion.request({
            ":method": "POST",
            ":path": `/3/device/${token}`,
            // EL TOPIC ES EL PASS TYPE IDENTIFIER. No el bundle de una app: no hay app.
            "apns-topic": passTypeId,
            // `background` y prioridad 5: es un aviso silencioso para que el pase se actualice,
            // no una notificación que despierte a nadie.
            "apns-push-type": "background",
            "apns-priority": "5",
            "content-type": "application/json",
          });
          let cuerpo = "", estado = 0;
          req.on("response", (h) => { estado = Number(h[":status"]) || 0; });
          req.on("data", (c) => { if (cuerpo.length < 2048) cuerpo += c; });
          req.on("end", () => fin(clasificar(estado, cuerpo)));
          req.on("error", (e) => fin({ ok: false, accion: "reintentar", razon: e.code || "error" }));
          req.setTimeout(timeoutMs, () => { try { req.close(); } catch { /* ya cerrada */ }
            fin({ ok: false, accion: "reintentar", razon: "timeout" }); });
          // EL CUERPO VA VACÍO. Ver arriba: no es una simplificación, es el protocolo.
          req.end("{}");
        } catch (e) {
          fin({ ok: false, accion: "reintentar", razon: e.code || "error" });
        }
      }));
    }
  } finally {
    try { sesion.close(); } catch { /* ya estaba cerrada */ }
  }
  return resultados;
}
