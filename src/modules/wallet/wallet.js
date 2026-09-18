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
// EL VERDE OSCURO ES EL PROTAGONISTA. `labelColor` pinta TODOS los rótulos —«TARJETA DE CLIENTE»,
// «PUNTOS», «VALES»— y es el único color que Apple deja meter además del fondo y el texto. Con el
// verde de marca (47,107,79) los rótulos quedaban grisáceos sobre el crema; este otro es el mismo
// tono de la banda, y así el pase entero tiene UN verde, no dos parecidos.
export const COLOR_ETIQUETA = "rgb(30, 64, 52)";
export const COLOR_ETIQUETA_HEX = "#1E4034";
export const ORGANIZACION = "Familia del Amor";

/**
 * EL LEMA DE LA CASA. Es lo ÚNICO estático que se pone para ocupar sitio.
 *
 * Apple reserva la fila secundaria y la auxiliar aunque estén vacías, así que con el programa de
 * puntos apagado quedaba un hueco grande entre el número de socio y el QR.
 *
 * Lo que NO se hace es rellenarlo con «0 puntos» o «0 vales»: sería un marcador que no existe, y
 * el día que se encienda el programa parecería que el cliente ha perdido algo. Se rellena con algo
 * que es VERDAD siempre y que además es de la marca.
 *
 * Sale de `textos.lema` si algún día se configura desde el panel; mientras, este.
 */
export const LEMA = "MENJAR · BEURE · COMPARTIR";

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
 * A su derecha, en `headerFields`, EL NÚMERO DE SOCIO. Esa esquina estaba vacía y la firma
 * quedaba sola en media cabecera; además es donde cualquier tarjeta de fidelización lo pone. Va
 * discreto —«SOCIO» y el número— porque el protagonista es el nombre, no la referencia.
 *
 * Debajo, el sitio grande (`primaryFields`) lo ocupa EL NOMBRE del titular con «TARJETA DE
 * CLIENTE» como rótulo: así se dice qué es la tarjeta sin gastar una línea aparte.
 *
 * El lema va SOLO en su fila y CENTRADO. Compartía línea con el número de socio y se leía como
 * un dato más de la ficha; centrado y sin nada al lado se lee como lo que es, una firma de marca.
 *
 * El código de barras SÍ lleva `altText`, con el número de socio. Es la lectura alternativa que
 * define Apple —lo que se teclea cuando la cámara no lee— y de paso le da suelo al código.
 *
 * ── LO QUE NO SE HACE: RELLENAR EL HUECO ─────────────────────────────────────────────────────
 *
 * Apple ancla el código abajo, así que con los puntos y las promociones apagados queda una franja
 * de crema vacía. NO se llena con datos de adorno —«socio desde», «dónde vale»— solo porque el
 * hueco exista. Esos ya están en el reverso, y una tarjeta que respira se lee mejor que una ficha
 * llena. El hueco es aire, y es una decisión.
 */
// ── CÓMO SE REPARTE LA CARA CUANDO EL PASE YA SABE COSAS ─────────────────────────────────────
//
// EL DISEÑO APROBADO NO SE TOCA. La primera versión de esto subía los puntos al sitio grande y
// bajaba el nombre al reverso — y eso es rehacer el pase, no ampliarlo. Lo aprobado es:
//
//   headerFields      «SOCIO» y el número, arriba a la derecha
//   primaryFields     el titular, con «TARJETA DE CLIENTE» de rótulo
//   secondaryFields   lo que cambia: puntos y próximo premio
//   auxiliaryFields   vales, o el lema centrado si esa fila se queda vacía
//   sin `logoText`, con `altText` bajo el QR, crema + tinta + verde, nueve imágenes
//
// Los puntos y los regalos entran POR `secondaryFields` y `auxiliaryFields`. Si no cupieran, lo
// que se recorta es lo nuevo, nunca el titular ni el número.
//
// LOS DOS CAMINOS —con estado y sin él— COMPONEN LA CARA IGUAL: misma cabecera, mismo campo
// principal y el mismo lema centrado. Antes el camino sin estado devolvía la cara antigua byte a
// byte, y eso era correcto mientras el rediseño estaba a medias; ahora sería un segundo diseño
// escondido detrás de una puerta, y el día que alguien la abriera la tarjeta cambiaría de aspecto
// sin que nadie hubiera tocado el diseño. Lo que cambia entre los dos caminos son LOS DATOS.

/** `2026-10-01T09:00:00+02:00` → `01/10/2026`. Sin fecha válida, nada: un «Invalid Date» en el
 *  reverso de un carné es peor que no decir cuándo se hizo la foto. */
function fechaDeIso(iso) {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/** «1 punto» / «28 puntos». Un «1 puntos» en el carné de alguien se nota. */
const punt = (n) => `${Number(n) || 0} ${Number(n) === 1 ? "punto" : "puntos"}`;

/** Recorta sin partir palabras a lo bruto: un campo del pase que desborda se ve peor que uno corto. */
function recortar(txt, max) {
  const s = String(txt ?? "").trim();
  if (s.length <= max) return s;
  const corte = s.slice(0, max - 1);
  const esp = corte.lastIndexOf(" ");
  return (esp > max * 0.6 ? corte.slice(0, esp) : corte) + "…";
}

/**
 * Los locales donde vale la tarjeta, sacados de la configuración REAL del panel.
 *
 * NO se escribe ninguna lista fija: los locales cambian y una lista a mano en el código se queda
 * vieja sin que nadie se entere. Si no hay ninguno configurado, se dice lo genérico.
 */
function dondeValeLaTarjeta(locales) {
  const nombres = [...new Set((locales || [])
    .map((l) => nombreCorto(String(l?.local || l || "")).trim())
    .filter(Boolean))];
  if (!nombres.length) return "En cualquiera de nuestros locales.";
  if (nombres.length === 1) return `En ${nombres[0]}.`;
  return `En ${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}.`;
}

/** Un enlace con TEXTO, no la dirección cruda. Dentro va el token del carné. */
const enlaceCon = (texto, url) =>
  ({ attributedValue: `<a href="${url}">${texto}</a>`, value: texto });

function camposDe({ qr, base, promo, estado, textos, congelado = false, locales = [] }) {
  const codigo = codigoLegible(qr.codigo);
  const enlace = urlTarjeta(base, qr.token);
  const ayuda = textos.ayuda || "Enséñala cuando vengas y te reconocemos al momento.";

  const primaryFields = qr.nombre
    ? [{ key: "titular", label: "TARJETA DE CLIENTE", value: recortar(qr.nombre, 26) }]
    : [{ key: "socio", label: "TARJETA DE CLIENTE", value: codigo }];

  // ── EL NÚMERO DE SOCIO, ARRIBA A LA DERECHA ───────────────────────────────────────────────
  //
  // `headerFields` es la fila del logotipo, y estaba VACÍA: la firma quedaba sola a la izquierda
  // y media cabecera en blanco. Es además donde cualquier tarjeta de fidelización pone el número.
  //
  // Va DISCRETO a propósito —rótulo corto y el número y nada más—: el protagonista de la cara es
  // el nombre del cliente, en cuerpo grande sobre el verde. El número es una referencia.
  //
  // SOLO SI HAY NOMBRE. Sin nombre, el campo principal YA enseña el código, y repetirlo dos veces
  // en la misma pantalla es justo lo que se está quitando de en medio.
  const headerFields = qr.nombre ? [{ key: "socio", label: "SOCIO", value: codigo }] : [];

  /** El lema, solo en su fila y CENTRADO. Es marca, no un dato del cliente: si se alinea como los
   *  demás campos, se lee como si fuera otro valor más de la ficha. */
  const lemaCentrado = () => ({
    key: "lema", label: "", value: String(textos.lema || LEMA),
    textAlignment: "PKTextAlignmentCenter",
  });

  // ── EL PASE DE SIEMPRE ────────────────────────────────────────────────────────────────────
  if (!estado) {
    return {
      headerFields,
      primaryFields,
      secondaryFields: [],
      auxiliaryFields: [lemaCentrado()],
      backFields: [
        { key: "que-es", label: "Cómo usar tu tarjeta", value: ayuda },
        { key: "donde", label: "Dónde vale", value: dondeValeLaTarjeta(locales) },
        { key: "cuenta", label: "Tu tarjeta",
          ...enlaceCon("Ver mi tarjeta", enlace) },
      ],
    };
  }

  const pt = estado.puntos || {};
  const pr = estado.premios || {};

  // ══ LA CARA ═══════════════════════════════════════════════════════════════════════════════
  //
  // CUATRO HUECOS para lo que CAMBIA: puntos, próximo premio y vales. Se meten los que existan y
  // se reparten de dos en dos: los dos primeros arriba, los dos siguientes abajo.
  //
  // Así el sitio de cada cosa NO DEPENDE de lo que haya encendido. Antes el lema saltaba de la
  // fila de abajo a la cabecera al encender los puntos, y el cliente veía mudarse un texto.
  //
  // EL NÚMERO DE SOCIO YA NO ESTÁ AQUÍ: se ha ido a la cabecera. No es un dato que cambie, y
  // ocupando la primera fila empujaba el lema a compartir línea con él.
  //
  // Y NO SE RELLENA POR RELLENAR. Con todo apagado esta zona se queda casi vacía, y está bien: el
  // hueco que deja Apple encima del código se llena con aire, no con datos de adorno. Una tarjeta
  // que respira se lee mejor que una ficha.
  const huecos = [];
  if (pt.activo) {
    huecos.push({ key: "puntos", label: "PUNTOS", value: String(pt.saldo ?? 0) });
    if (Number.isFinite(pt.faltan) && pt.faltan > 0) {
      huecos.push({ key: "faltan", label: "PRÓXIMO PREMIO", value: `Te faltan ${pt.faltan}` });
    } else if (pt.canjeable) {
      // «¡Ya lo tienes!» era ambiguo: ¿tiene el premio o los puntos? Esto dice qué hacer.
      huecos.push({ key: "faltan", label: "PRÓXIMO PREMIO", value: "Puedes canjearlo" });
    }
  }
  // CON LOS PUNTOS APAGADOS NO SE PONE NADA. Ni un «0» —un marcador que no existe hace que el día
  // que se encienda parezca que el cliente ha perdido algo— ni el texto de preparación recortado.
  if (pr.cantidad > 0) {
    huecos.push({ key: "vales", label: "VALES", value: String(pr.cantidad) });
  }

  const secondaryFields = huecos.slice(0, 2);
  const auxiliaryFields = huecos.slice(2, 4);
  // El lema SOLO cuando la fila de abajo se queda vacía, y siempre en ese mismo sitio. Es lo
  // único estático que se pone, y es verdad siempre.
  if (!auxiliaryFields.length) auxiliaryFields.push(lemaCentrado());

  // ══ LOS DETALLES ══════════════════════════════════════════════════════════════════════════
  //
  // El reverso de Wallet es una lista que pinta el sistema: sin imágenes, sin columnas y sin
  // separadores. Lo único que se puede diseñar es QUÉ se dice y EN QUÉ ORDEN. Tres bloques:
  //
  //   1. LO TUYO         lo personal y lo que cambia. Es a lo que se le da la vuelta a la tarjeta.
  //   2. CÓMO SE USA     instrucciones y condiciones. No cambian.
  //   3. ADMINISTRATIVO  enlaces, privacidad, contacto y la fecha del dato.
  const backFields = [];

  // ── 1 · LO TUYO ───────────────────────────────────────────────────────────────────────────
  if (pt.activo) {
    backFields.push({ key: "puntos-detalle", label: "Tus puntos",
      value: Number.isFinite(pt.faltan) && pt.faltan > 0
        ? `Tienes ${punt(pt.saldo)}. Te faltan ${pt.faltan} para tu próximo premio.`
        : pt.canjeable
          ? `Tienes ${punt(pt.saldo)}. Ya puedes canjear tu próximo premio.`
          : `Tienes ${punt(pt.saldo)}.` });

    if (pt.proxima_caducidad && pt.caducan > 0) {
      backFields.push({ key: "caducan", label: "Caducan pronto",
        value: `${punt(pt.caducan)} caducan el ${fechaDeIso(pt.proxima_caducidad)}.` });
    }
  }

  if (pr.cantidad > 0) {
    backFields.push({ key: "vales", label: "Tus vales",
      value: pr.cantidad === 1 ? "Tienes 1 vale sin usar." : `Tienes ${pr.cantidad} vales sin usar.` });
    for (const [i, v] of (pr.disponibles || []).slice(0, 4).entries()) {
      // EL DETALLE DE CADA VALE NO PUEDE CONTRADECIR AL «DÓNDE VALE» DE ABAJO. La tarjeta vale en
      // todos los locales; este vale concreto puede que solo en uno, y hay que decirlo así.
      const partes = [];
      if (v.solo_aqui && v.local) partes.push(`Solo en ${nombreCorto(v.local)}`);
      if (v.horario) partes.push(v.horario);
      if (v.hasta_texto) partes.push(`hasta el ${v.hasta_texto}`);
      backFields.push({ key: `vale-${i}`, label: recortar(v.nombre, 60),
        value: partes.length ? partes.join(" · ") : "Válido en cualquiera de nuestros locales." });
    }
  }

  // ── 2 · CÓMO SE USA ───────────────────────────────────────────────────────────────────────
  backFields.push({ key: "que-es", label: "Cómo usar tu tarjeta", value: ayuda });
  if (pt.activo && textos.como_ganar) {
    backFields.push({ key: "como-ganar", label: "Cómo ganar puntos", value: String(textos.como_ganar) });
  }
  // ── CON EL PROGRAMA APAGADO NO SE NOMBRA SIQUIERA ─────────────────────────────────────────
  //
  // Nada de «Programa de puntos: en preparación». Para el cliente esa funcionalidad TODAVÍA NO
  // EXISTE, y anunciar algo que no puede usar es prometer una fecha que no tenemos. Cuando se
  // encienda aparecerán los puntos, el próximo premio, cómo ganarlos y la caducidad — todo a la
  // vez y ya funcionando.
  //
  // El texto de preparación sigue configurándose en el panel y sigue saliendo en la TARJETA WEB,
  // que es donde tiene sentido: allí el cliente ha entrado a mirar su cuenta.
  backFields.push({ key: "donde", label: "Dónde vale", value: dondeValeLaTarjeta(locales) });
  if (textos.condiciones) {
    backFields.push({ key: "condiciones", label: "Condiciones", value: String(textos.condiciones) });
  }

  // ── 3 · ADMINISTRATIVO ────────────────────────────────────────────────────────────────────
  //
  // Los enlaces van con TEXTO, no con la dirección: dentro de la del carné viaja el token, y un
  // cliente enseñándole el reverso a alguien no tiene por qué enseñarle eso.
  backFields.push({ key: "cuenta", label: "Tu tarjeta",
    ...enlaceCon("Ver mis puntos y mis vales", enlace) });
  if (textos.privacidad_url) {
    backFields.push({ key: "privacidad", label: "Privacidad",
      ...enlaceCon("Política de privacidad", String(textos.privacidad_url)) });
  }
  if (textos.contacto) {
    backFields.push({ key: "contacto", label: "Contacto", value: String(textos.contacto) });
  }
  // Y LO ÚLTIMO: de cuándo son estos datos. Solo si el pase no se refresca solo.
  if (congelado && (pt.activo || pr.cantidad > 0)) {
    const dia = fechaDeIso(estado?.actualizado_en);
    backFields.push({ key: "al-dia", label: "Actualizado",
      value: dia ? `Estos datos son del ${dia}.` : "Abre el enlace de arriba para verlos al día." });
  }

  return { headerFields, primaryFields, secondaryFields, auxiliaryFields, backFields };
}

export function pasePlanoApple({ qr, cfg = {}, base = "", promo = null, locales = [],
                                 estado = null, servicio = null, textos = {},
                                 congelado = false } = {}) {
  const codigo = codigoLegible(qr.codigo);
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
      // ── LA LECTURA ALTERNATIVA ──────────────────────────────────────────────────────────────
      //
      // Apple la define como «la versión legible del código, por si el código no se escanea», y
      // eso es EXACTAMENTE lo que hace falta aquí: cuando la cámara de la tablet no lee, el
      // camarero teclea los ocho dígitos. El número de socio es esa lectura alternativa.
      //
      // NO se pone la URL: el contenido literal del código es un enlace con el token dentro, y
      // eso ni se teclea ni se enseña.
      //
      // Estuvo puesto, se quitó porque repetía el número que tenía justo encima, y ahora vuelve:
      // el número se ha ido a la cabecera, así que ya no hay nada duplicado al lado. Además le da
      // suelo al código, que sin nada debajo flota en medio del crema.
      //
      // SOLO SI HAY NOMBRE, y es el mismo motivo por el que se quitó. Sin nombre, el número ES el
      // campo principal —en cuerpo grande, en mitad de la tarjeta— y volvería a estar repetido.
      ...(qr.nombre && codigo ? { altText: codigo } : {}),
    }],

    storeCard: camposDe({ qr, base, promo, estado, textos, congelado, locales }),
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
