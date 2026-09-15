// LA BAJA. PURO: sin BD, sin Express, sin red.
//
// ── LO QUE NO PUEDE PASAR, Y POR QUÉ ESTÁ DECIDIDO ASÍ ───────────────────────────────────────
//
// 1. ABRIR EL ENLACE NO DA DE BAJA A NADIE.
//
//    El enlace viaja dentro de un WhatsApp. WhatsApp —y Slack, y iMessage, y cualquier antivirus
//    corporativo— ABRE LOS ENLACES SOLO para dibujar la vista previa. Si el GET diera de baja, la
//    mitad de la gente quedaría de baja sin haber tocado nada, y nadie entendería por qué dejó de
//    recibir los descuentos. Por eso el GET solo PREGUNTA y la baja la hace el POST.
//
//    Es la misma razón por la que un enlace de «borrar» nunca puede ser un GET.
//
// 2. EL TOKEN NO SE GUARDA EN CLARO.
//
//    Un WhatsApp se reenvía y se captura. Si la base guardara el token tal cual, cualquiera que
//    leyera una fila podría dar de baja a otra persona. Se guarda la huella: sirve para reconocer
//    el enlace que llega, y de ella no se puede reconstruir el enlace.
//
// 3. DOS BAJAS SEGUIDAS SON UNA BAJA.
//
//    La gente pulsa dos veces. Un bot pulsa cien. La segunda no es un error ni cambia nada: se
//    contesta lo mismo, y la fecha de baja sigue siendo la primera —que es la que vale si alguien
//    pregunta cuándo dejó de recibir mensajes—.
//
// 4. LA PÁGINA NO ENSEÑA NI UN DATO PERSONAL.
//
//    Ni el teléfono, ni el nombre, ni siquiera parcialmente. Quien abre ese enlace puede no ser el
//    dueño del móvil: puede ser quien se lo reenviaron. Enseñar «vas a dar de baja el 6·· ··· ·22»
//    convertiría el enlace en una forma de averiguar un número.
//
// 5. VOLVER A APUNTARSE NO SE HACE DESDE AQUÍ.
//
//    No hay botón de «reactivar». Quien se dio de baja y quiere volver rellena el formulario otra
//    vez, y eso genera un consentimiento nuevo con su fecha. Un botón de deshacer en este enlace
//    dejaría que quien lo tenga reactive a alguien que pidió que le dejaran en paz.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Cuántos bytes tiene un token. 32 bytes = 256 bits: no se acierta probando. */
export const BYTES_TOKEN = 32;

/** El resultado de mirar un token, en palabras. Cerrado. */
export const ESTADOS = Object.freeze(["vale", "ya_estaba", "no_existe"]);

/**
 * Un token nuevo, en base64url: viaja en una URL sin escaparse y sin `+`, `/` ni `=`, que es lo
 * que rompe los enlaces cuando WhatsApp los recorta.
 */
export const nuevoToken = () => randomBytes(BYTES_TOKEN).toString("base64url");

/**
 * La huella de un token. SHA-256, entera.
 *
 * No se recorta: aquí no hay motivo para hacerlo —no se enseña en ninguna pantalla— y recortar
 * solo acerca la posibilidad de que dos tokens distintos den la misma huella.
 */
export const huella = (token) => createHash("sha256").update(String(token || ""), "utf8").digest("hex");

/**
 * ¿Es siquiera plausible este token? Se mira ANTES de ir a la base.
 *
 * Sirve para no convertir el endpoint en una forma de hacerle preguntas a la base de datos con
 * basura: lo que no tiene la forma de un token nuestro se rechaza sin consultar nada.
 */
export function tokenPlausible(t) {
  const s = String(t || "");
  // 32 bytes en base64url son 43 caracteres. Se acepta un pequeño margen por si algún día cambia
  // el tamaño, pero no cualquier cosa.
  return /^[A-Za-z0-9_-]{40,64}$/.test(s);
}

/** Comparación en tiempo constante de dos huellas. */
export function huellasIguales(a, b) {
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * El enlace completo que va dentro de cada mensaje.
 *
 * SIEMPRE HTTPS Y SIEMPRE ABSOLUTO. Un `/baixa?t=…` dentro de un WhatsApp no es un enlace: es
 * texto. Y `http://` lo bloquean los propios clientes de mensajería, así que se fuerza.
 */
export function enlaceBaja(base, token) {
  const raiz = String(base || "").trim().replace(/\/+$/, "").replace(/^http:\/\//i, "https://");
  if (!/^https:\/\/[^/]+/.test(raiz)) return null;
  return `${raiz}/baixa?t=${encodeURIComponent(String(token || ""))}`;
}

/**
 * Añade el enlace de baja al final del mensaje.
 *
 * Va SIEMPRE, en todas las comunicaciones, y va al final en su propia línea: dentro del texto se
 * pierde, y en medio parece parte de la oferta. Si alguien ya lo escribió a mano en la plantilla,
 * no se repite.
 */
export function conPieDeBaja(texto, enlace, { pie = "Per deixar de rebre aquests missatges:" } = {}) {
  const cuerpo = String(texto || "").trimEnd();
  if (!enlace) return cuerpo;
  if (cuerpo.includes(enlace)) return cuerpo;
  return `${cuerpo}\n\n${pie}\n${enlace}`;
}

/** El pie, en cada idioma. Lo que no esté cae en castellano. */
export const PIE_BAJA = Object.freeze({
  ca: "Per deixar de rebre aquests missatges:",
  es: "Para dejar de recibir estos mensajes:",
  en: "To stop receiving these messages:",
});
export const pieBaja = (idioma) => PIE_BAJA[String(idioma || "es")] || PIE_BAJA.es;

/**
 * Qué hay que hacer con lo que se ha encontrado en la base.
 *
 * Se decide AQUÍ y no en el endpoint para poder probar los cinco casos sin levantar nada: el
 * endpoint solo traduce esto a un código HTTP.
 *
 * `fila` es lo guardado para esa huella, o `null` si no hay nada.
 */
export function decidir(fila, { confirmar }) {
  if (!fila) return { estado: "no_existe", aplicar: false, codigo: 404 };
  if (fila.confirmado_en) {
    // YA ESTABA DE BAJA. No se vuelve a aplicar ni se mueve la fecha: la primera es la que vale.
    return { estado: "ya_estaba", aplicar: false, codigo: 200, confirmado_en: fila.confirmado_en };
  }
  // Sin confirmar todavía. Un GET solo mira; solo el POST aplica.
  return { estado: "vale", aplicar: !!confirmar, codigo: 200 };
}

/**
 * Lo que se le contesta a quien abre el enlace. LAS MISMAS PALABRAS PARA TODOS.
 *
 * Un token inválido y un token de alguien que no existe contestan igual que uno bueno recién
 * abierto: si se distinguieran, probando enlaces se sabría cuáles son de verdad. La única
 * diferencia visible es entre «te acabamos de dar de baja» y «ya estabas», que es información
 * sobre la acción que esa persona acaba de hacer, no sobre si existe.
 */
export const TEXTOS = Object.freeze({
  ca: {
    titulo: "Donar-se de baixa",
    intro: "Si ho confirmes, deixarem d'enviar-te descomptes i comunicacions de la Família del Amor.",
    aviso: "També cancel·larem els missatges que encara no hagin sortit.",
    boton: "Confirmo la baixa",
    hecha: "Fet. Ja no t'enviarem més comunicacions.",
    ya: "Ja estaves de baixa. No t'enviem res.",
    vuelta: "Si algun dia et vols tornar a apuntar, hauràs d'emplenar el formulari una altra vegada.",
    caducado: "Aquest enllaç no és vàlid. Si vols deixar de rebre missatges, escriu-nos a info@la-tapeta.com.",
    error: "Ara mateix no hem pogut fer-ho. Torna-ho a provar d'aquí a uns minuts.",
  },
  es: {
    titulo: "Darse de baja",
    intro: "Si lo confirmas, dejaremos de enviarte descuentos y comunicaciones de Familia del Amor.",
    aviso: "También cancelaremos los mensajes que todavía no hayan salido.",
    boton: "Confirmo la baja",
    hecha: "Hecho. Ya no te enviaremos más comunicaciones.",
    ya: "Ya estabas de baja. No te enviamos nada.",
    vuelta: "Si algún día te quieres volver a apuntar, tendrás que rellenar el formulario otra vez.",
    caducado: "Este enlace no es válido. Si quieres dejar de recibir mensajes, escríbenos a info@la-tapeta.com.",
    error: "Ahora mismo no hemos podido hacerlo. Inténtalo dentro de unos minutos.",
  },
});
export const textosBaja = (idioma) => TEXTOS[String(idioma || "es")] || TEXTOS.es;
