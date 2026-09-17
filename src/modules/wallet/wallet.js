// La tarjeta en la wallet del móvil. Lógica PURA: aquí se decide QUÉ dice el pase, no cómo se
// firma ni cómo se empaqueta (eso está en pkpass.js, firma.js y google.js).
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  EL CÓDIGO DE BARRAS DEL PASE SALE DE `urlTarjeta()` Y DE NINGÚN OTRO SITIO.  │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// La tablet de la barra lee el QR y saca el `t=` con `normalizarEntrada()`
// (src/modules/promos/promos.js). Si alguien compone la URL a mano dentro del pase —una barra
// de más, otro dominio, el token sin codificar— el pase se guarda perfectamente, se ve
// perfectamente, y el día que un cliente lo enseñe en la barra no lo lee nadie y no hay forma
// de saber por qué. Por eso hay una sola función y un test que falla si aparece otra.

import { dondeVale } from "../promos/promos.js";
import { codigoLegible, nombreCorto } from "../tarjeta/cuenta.js";

// El pase va sobre el CREMA de la página del cliente, no sobre el verde de la marca.
//
// No es una preferencia: el logo de Familia del Amor es un texto en tinta oscura sobre
// transparente, y sobre el verde del panel no se lee. Apple compone `logo.png` encima del
// fondo del pase tal cual, sin recuadro y sin invertir nada, así que el fondo lo decide la
// imagen que tenemos. El día que exista una versión del logo en blanco, esto puede volver al
// verde cambiando estas dos líneas.
//
// Apple quiere `rgb(r, g, b)`; Google, hexadecimal.
export const COLOR_FONDO = "rgb(244, 242, 237)";
export const COLOR_FONDO_HEX = "#F4F2ED";
export const COLOR_TEXTO = "rgb(28, 33, 31)";
export const COLOR_ETIQUETA = "rgb(47, 107, 79)";   // --brand, para los rótulos pequeños
export const ORGANIZACION = "Familia del Amor";

/** El enlace que lleva el QR de la tarjeta. LA función. */
export function urlTarjeta(base, token) {
  return `${String(base || "").replace(/\/$/, "")}/tarjeta.html?t=${encodeURIComponent(String(token || ""))}`;
}

/** El enlace del cartel que se cuelga en el local: alta con el local ya dentro. */
export function urlAlta(base, local = "") {
  const raiz = `${String(base || "").replace(/\/$/, "")}/alta.html`;
  return local ? `${raiz}?l=${encodeURIComponent(local)}` : raiz;
}

/**
 * ¿Esta fila de `pro_qr` puede ir a la wallet?
 *
 * Solo el CARNÉ, y solo si vale. Un cupón no: caduca y se gasta, y un pase gastado que sigue en
 * el móvil con la misma cara que uno nuevo es una discusión en barra garantizada. Mientras no
 * exista el servicio de actualización (que es lo único que permite tachar un pase a distancia),
 * a la wallet solo va lo que no cambia nunca.
 */
export function puedeIrAWallet(qr, estado) {
  return !!qr && qr.clase === "carnet" && estado === "valido";
}

/** Cómo se llama el archivo que se descarga. Sin acentos ni espacios: acaba en la carpeta de
 *  descargas de un móvil ajeno y algunos navegadores lo parten por el primer espacio. */
export function nombreArchivoPase() {
  return "tarjeta-familia-del-amor.pkpass";
}

/**
 * `pass.json` de Apple Wallet.
 *
 * Estilo `storeCard` —tarjeta de fidelidad— y no `coupon`: no es un descuento, es la identidad
 * del cliente.
 *
 * SIN `webServiceURL` NI `authenticationToken` a propósito. Son los dos campos que activan las
 * actualizaciones automáticas, y declararlos sin tener el servicio detrás hace que iOS
 * reintente contra un 404 cada vez que el pase aparece en pantalla. Se añadirán el día que ese
 * servicio exista; hasta entonces el pase es una foto del QR y el número de visitas vive en la
 * página, a un toque del propio código.
 *
 * ── CÓMO SE REPARTE LA CARA ──────────────────────────────────────────────────────────────────
 *
 * El logotipo de arriba ES la firma «Familia Del Amor», así que NO se pone `logoText`: decía lo
 * mismo dos veces, una escrita a mano y otra en tipografía del sistema.
 *
 * Debajo, el sitio grande (`primaryFields`) lo ocupa EL NOMBRE del titular con «CARNÉ DE
 * CLIENTE» como rótulo: así se dice qué es la tarjeta sin gastar una línea aparte. El número de
 * socio va en `secondaryFields`, con su rótulo, que es donde se busca cuando hay que teclearlo.
 *
 * El código de barras NO lleva `altText`. Lo llevaba, y repetía exactamente el número que está
 * justo encima; quitarlo deja el QR más grande y la cara más limpia.
 *
 * `auxiliaryFields` se queda vacío a propósito: con tres datos en la cara ya está dicho todo, y
 * rellenarlo solo porque existe es lo que convierte una tarjeta en un formulario.
 */
// ── CÓMO SE REPARTE LA CARA CUANDO EL PASE YA SABE COSAS ─────────────────────────────────────
//
// EL DISEÑO APROBADO NO SE TOCA. La primera versión de esto subía los puntos al sitio grande y
// bajaba el nombre al reverso — y eso es rehacer el pase, no ampliarlo. Lo aprobado es:
//
//   primaryFields     el titular, con «CARNÉ DE CLIENTE» de rótulo
//   secondaryFields   «NÚMERO DE SOCIO»
//   auxiliaryFields   vacío hasta ahora
//   sin `logoText`, sin `altText` bajo el QR, crema + tinta + verde, seis imágenes
//
// Los puntos y los regalos entran POR `auxiliaryFields` —la fila que estaba libre— y por el
// reverso. Si no cupieran, lo que se recorta es lo nuevo, nunca el titular ni el número.
//
// SIN ESTADO se devuelve exactamente lo de antes, byte a byte. Es lo que se genera mientras la
// puerta esté cerrada, y lo que garantiza que este trabajo no cambia el pase de nadie hasta que
// alguien lo encienda.

/** `2026-10-01T09:00:00+02:00` → `01/10/2026`. Sin fecha válida, nada: un «Invalid Date» en el
 *  reverso de un carné es peor que no decir cuándo se hizo la foto. */
function fechaDeIso(iso) {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/** Recorta sin partir palabras a lo bruto: un campo del pase que desborda se ve peor que uno corto. */
function recortar(txt, max) {
  const s = String(txt ?? "").trim();
  if (s.length <= max) return s;
  const corte = s.slice(0, max - 1);
  const esp = corte.lastIndexOf(" ");
  return (esp > max * 0.6 ? corte.slice(0, esp) : corte) + "…";
}

function camposDe({ qr, base, promo, estado, textos, congelado = false }) {
  const codigo = codigoLegible(qr.codigo);
  const enlace = urlTarjeta(base, qr.token);
  const ayuda = textos.ayuda || "Enséñala cuando vengas y te reconocemos al momento.";

  // ── LO QUE NO CAMBIA NUNCA ────────────────────────────────────────────────────────────────
  //
  // Un nombre muy largo se recorta aquí y no en el diseño: `storeCard` reduce el cuerpo de letra
  // hasta cierto punto y después parte la línea, y un titular partido en dos deja la tarjeta
  // descuadrada. 26 caracteres es lo que entra holgado a tamaño legible.
  const primaryFields = qr.nombre
    ? [{ key: "titular", label: "CARNÉ DE CLIENTE", value: recortar(qr.nombre, 26) }]
    : [{ key: "socio", label: "CARNÉ DE CLIENTE", value: codigo }];
  const secondaryFields = qr.nombre
    ? [{ key: "socio", label: "NÚMERO DE SOCIO", value: codigo }]
    : [];

  const backFields = [
    { key: "que-es", label: "Tu tarjeta", value: ayuda },
    { key: "donde", label: "Dónde vale", value: promo ? dondeVale(promo.locales) : dondeVale("") },
  ];

  // ── EL PASE DE SIEMPRE ────────────────────────────────────────────────────────────────────
  if (!estado) {
    backFields.push({ key: "cuenta", label: "Tus visitas y tus descuentos", value: enlace });
    return { primaryFields, secondaryFields, auxiliaryFields: [], backFields };
  }

  // ── LO NUEVO, EN LA FILA QUE ESTABA LIBRE ─────────────────────────────────────────────────
  const pt = estado.puntos || {};
  const pr = estado.premios || {};
  const aux = [];

  if (pt.activo) {
    aux.push({ key: "puntos", label: "PUNTOS", value: String(pt.saldo ?? 0) });
    if (Number.isFinite(pt.faltan) && pt.faltan > 0) {
      aux.push({ key: "faltan", label: "PRÓXIMO PREMIO", value: `Te faltan ${pt.faltan}` });
    } else if (pt.canjeable) {
      aux.push({ key: "faltan", label: "PRÓXIMO PREMIO", value: "¡Ya lo tienes!" });
    }
  }
  // CON LOS PUNTOS APAGADOS NO SE PONE NADA EN LA CARA. Ni un «0» —un marcador a cero que no
  // existe hace que el día que se encienda parezca que ha perdido lo que tenía— ni el texto de
  // preparación recortado, que en un campo de 22 caracteres queda en «Programa de puntos en…» y
  // ensucia una tarjeta que está bien como está. La explicación va entera en el reverso.

  if (pr.cantidad > 0) {
    aux.push({ key: "regalos", label: "REGALOS",
      value: `${pr.cantidad} disponible${pr.cantidad === 1 ? "" : "s"}` });
  }

  // El nombre del regalo solo si queda sitio. Tres campos auxiliares es lo que entra sin que se
  // encojan entre sí; el cuarto los aprieta y deja de leerse.
  if (pr.principal && aux.length < 3) {
    aux.push({ key: "premio", label: "REGALO", value: recortar(pr.principal.nombre, 20) });
  }

  // ── EL REVERSO: TODO LO QUE NO CABE DELANTE ───────────────────────────────────────────────
  if (pt.activo) {
    backFields.push({ key: "puntos-detalle", label: "Tus puntos",
      value: pt.objetivo
        ? `Tienes ${pt.saldo} punto${pt.saldo === 1 ? "" : "s"}. El siguiente premio son ${pt.objetivo}.`
        : `Tienes ${pt.saldo} punto${pt.saldo === 1 ? "" : "s"}.` });
    if (pt.proxima_caducidad) {
      backFields.push({ key: "caducan", label: "Próxima caducidad de puntos",
        value: String(pt.proxima_caducidad).slice(0, 10) });
    }
  } else if (pt.texto) {
    backFields.push({ key: "puntos-detalle", label: "Tus puntos", value: String(pt.texto) });
  }

  for (const [i, p] of (pr.disponibles || []).slice(0, 4).entries()) {
    const partes = [p.local || "En cualquiera de nuestros locales"];
    if (p.horario) partes.push(`de ${p.horario}`);
    if (p.hasta_texto) partes.push(`hasta el ${p.hasta_texto}`);
    backFields.push({ key: `regalo-${i}`, label: recortar(p.nombre, 60), value: partes.join(" · ") });
  }

  // Un pase SIN servicio web no se refresca solo: lo que ponga se queda congelado desde el día que
  // se bajó. Decirlo con su fecha convierte un número que engaña en una foto que se entiende — y
  // no toca la cara de la tarjeta.
  if (congelado && (pt.activo || pr.cantidad > 0)) {
    const dia = fechaDeIso(estado?.actualizado_en);
    backFields.push({ key: "al-dia", label: "Estos datos",
      value: dia
        ? `Son del ${dia}. Abre el enlace de abajo para verlos al día.`
        : "Abre el enlace de abajo para verlos al día." });
  }

  backFields.push({ key: "cuenta", label: "Tus visitas y tus descuentos", value: enlace });
  if (textos.privacidad_url) {
    backFields.push({ key: "privacidad", label: "Privacidad", value: String(textos.privacidad_url) });
  }
  if (textos.contacto) {
    backFields.push({ key: "contacto", label: "Contacto", value: String(textos.contacto) });
  }

  return { primaryFields, secondaryFields, auxiliaryFields: aux.slice(0, 3), backFields };
}

export function pasePlanoApple({ qr, cfg = {}, base = "", promo = null, locales = [],
                                 estado = null, servicio = null, textos = {},
                                 congelado = false } = {}) {
  const pase = {
    formatVersion: 1,
    passTypeIdentifier: cfg.pass_type_id,
    teamIdentifier: cfg.team_id,
    organizationName: ORGANIZACION,
    description: "Tarjeta de cliente de Familia del Amor",
    serialNumber: String(qr.token),
    backgroundColor: COLOR_FONDO,
    foregroundColor: COLOR_TEXTO,
    labelColor: COLOR_ETIQUETA,
    // Sin `logoText`: el logotipo de arriba ya dice «Familia Del Amor».
    sharingProhibited: true,   // la tarjeta es de una persona: compartirla duplicaría identidades

    barcodes: [{
      format: "PKBarcodeFormatQR",
      // EL CONTENIDO NO SE TOCA: es el mismo enlace que compone `urlTarjeta` para la web y el
      // que la tablet de la barra sabe leer. Cambiarlo aquí dejaría pases que no se validan.
      message: urlTarjeta(base, qr.token),
      // iso-8859-1 es lo que exige Apple; el mensaje es una URL, así que todo es ASCII.
      messageEncoding: "iso-8859-1",
    }],

    storeCard: camposDe({ qr, base, promo, estado, textos, congelado }),
  };

  // ── EL SERVICIO WEB, SOLO SI SE PIDE EXPRESAMENTE ─────────────────────────────────────────
  //
  // Estos dos campos son lo que hace que iOS empiece a llamarnos. Declararlos sin el servicio
  // abierto deja al iPhone reintentando contra un 401 cada vez que el pase aparece en pantalla, y
  // un pase ya bajado los conserva para siempre: no se arregla apagando nada después.
  //
  // Por eso no se ponen «por si acaso». Quien llama decide, mirando la puerta.
  if (servicio && servicio.url && servicio.token) {
    pase.webServiceURL = String(servicio.url);
    pase.authenticationToken = String(servicio.token);
  }

  // Que la tarjeta salga sola en la pantalla de bloqueo al llegar al local. Son diez sitios como
  // mucho (límite de Apple) y es lo que hace que no haya que buscarla.
  const puntos = (locales || [])
    .filter((l) => Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lon)))
    .slice(0, 10)
    .map((l) => ({
      latitude: Number(l.lat),
      longitude: Number(l.lon),
      relevantText: `Estás en ${nombreCorto(l.local)}. Enseña tu tarjeta.`,
    }));
  if (puntos.length) pase.locations = puntos;

  return pase;
}

/**
 * El JWT de «Guardar en Google Wallet» lleva DENTRO la clase y el objeto, y Google los crea al
 * guardarlo. Así no hace falta ni una sola llamada servidor-a-servidor: ni OAuth, ni refresco
 * de tokens, ni una cuota que se agote un sábado a las diez de la noche.
 *
 * El precio de eso es que cambiar la clase (el diseño) más adelante sí pide la API. Es un
 * cambio que se hace una vez al año, no cien veces al día.
 */
export function objetoGoogle({ qr, cfg = {}, base = "", promo = null } = {}) {
  const classId = `${cfg.issuer_id}.tarjeta-familia-del-amor`;
  // El id del objeto tiene que ser único y estable, y solo admite [a-zA-Z0-9._-]. El token es
  // base64url (que incluye `-` y `_`), así que encaja tal cual.
  const objectId = `${cfg.issuer_id}.${String(qr.token)}`;

  const loyaltyClass = {
    id: classId,
    issuerName: ORGANIZACION,
    programName: "Tarjeta de cliente",
    reviewStatus: "UNDER_REVIEW",
    hexBackgroundColor: COLOR_FONDO_HEX,
  };
  if (cfg.logo_url) {
    loyaltyClass.programLogo = { sourceUri: { uri: cfg.logo_url } };
  }

  const loyaltyObject = {
    id: objectId,
    classId,
    state: "ACTIVE",
    accountName: qr.nombre || "",
    accountId: String(qr.codigo),
    barcode: {
      type: "QR_CODE",
      value: urlTarjeta(base, qr.token),
      alternateText: codigoLegible(qr.codigo),
    },
    textModulesData: [{
      id: "donde",
      header: "Dónde vale",
      body: promo ? dondeVale(promo.locales) : dondeVale(""),
    }],
    linksModuleData: {
      uris: [{ uri: urlTarjeta(base, qr.token), description: "Tus visitas y descuentos", id: "cuenta" }],
    },
  };

  return { loyaltyClasses: [loyaltyClass], loyaltyObjects: [loyaltyObject] };
}
