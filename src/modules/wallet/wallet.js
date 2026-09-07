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
 * `primaryFields` va VACÍO por lo mismo: lo único que merecería ese sitio son las visitas, y un
 * número congelado el día que se guardó el pase es peor que ningún número.
 */
export function pasePlanoApple({ qr, cfg = {}, base = "", promo = null, locales = [] } = {}) {
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
    logoText: ORGANIZACION,
    sharingProhibited: true,   // la tarjeta es de una persona: compartirla duplicaría identidades

    barcodes: [{
      format: "PKBarcodeFormatQR",
      message: urlTarjeta(base, qr.token),
      // iso-8859-1 es lo que exige Apple; el mensaje es una URL, así que todo es ASCII.
      messageEncoding: "iso-8859-1",
      // Si la cámara no lo lee, el camarero teclea esto. Es el mismo número que sale en la
      // página, agrupado igual.
      altText: codigoLegible(qr.codigo),
    }],

    storeCard: {
      primaryFields: [],
      secondaryFields: qr.nombre
        ? [{ key: "titular", label: "TITULAR", value: String(qr.nombre) }]
        : [],
      auxiliaryFields: [
        { key: "codigo", label: "CÓDIGO", value: codigoLegible(qr.codigo) },
      ],
      backFields: [
        { key: "que-es", label: "Tu tarjeta",
          value: "Enséñala cuando vengas y te reconocemos al momento. Tus visitas y tus descuentos están en el enlace de abajo." },
        { key: "donde", label: "Dónde vale", value: promo ? dondeVale(promo.locales) : dondeVale("") },
        { key: "cuenta", label: "Tus visitas y descuentos", value: urlTarjeta(base, qr.token) },
      ],
    },
  };

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
