// El pase de la wallet: qué dice y qué lleva dentro el código de barras.
//
// EL TEST DE ESTE FICHERO ES EL DEL CÓDIGO DE BARRAS. La tablet de la barra escanea el QR y saca
// el `t=` con `normalizarEntrada()`; si el mensaje del pase no tiene esa forma, la tarjeta se
// guarda bien, se ve bien, y el día que un cliente la enseñe no la lee nadie. Se comprueba
// contra la función de verdad, no contra una copia del formato.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { urlTarjeta, urlAlta, puedeIrAWallet, pasePlanoApple, objetoGoogle,
         nombreArchivoPase, COLOR_FONDO_HEX } from "../../src/modules/wallet/wallet.js";
import { normalizarEntrada } from "../../src/modules/promos/promos.js";

const BASE = "https://familiadelamor.org";
const QR = { clase: "carnet", token: "aB3-_xYz1234567890abcdefgh", codigo: "12345678", nombre: "Marta" };
const CFG_APPLE = { pass_type_id: "pass.org.familiadelamor.tarjeta", team_id: "ABCDE12345" };
const CFG_GOOGLE = { issuer_id: "3388000000012345678" };

describe("el enlace de la tarjeta", () => {
  test("la tablet de la barra sabe leerlo", () => {
    // Contra la función real del escáner, no contra una expresión regular copiada.
    const leido = normalizarEntrada(urlTarjeta(BASE, QR.token));
    assert.deepEqual(leido, { tipo: "token", valor: QR.token });
  });

  test("no se duplica la barra si la base ya la trae", () => {
    assert.equal(urlTarjeta(BASE + "/", "T"), `${BASE}/tarjeta.html?t=T`);
  });

  test("el enlace del cartel lleva el local dentro, codificado", () => {
    assert.equal(urlAlta(BASE, "La Tapeta - Blanes"),
      `${BASE}/alta.html?l=La%20Tapeta%20-%20Blanes`);
    assert.equal(urlAlta(BASE), `${BASE}/alta.html`);
  });
});

describe("qué puede ir a la wallet", () => {
  test("solo el carné, y solo si vale", () => {
    assert.equal(puedeIrAWallet(QR, "valido"), true);
    assert.equal(puedeIrAWallet(QR, "anulado"), false);
    // Un cupón caduca y se gasta, y un pase gastado que sigue en el móvil con la misma cara que
    // uno nuevo es una discusión en barra garantizada.
    assert.equal(puedeIrAWallet({ ...QR, clase: "cupon" }, "valido"), false);
    assert.equal(puedeIrAWallet(null, "valido"), false);
  });
});

describe("pass.json de Apple", () => {
  const pase = pasePlanoApple({ qr: QR, cfg: CFG_APPLE, base: BASE });

  test("el código de barras lleva el enlace de la tarjeta", () => {
    assert.equal(pase.barcodes[0].message, urlTarjeta(BASE, QR.token));
    assert.deepEqual(normalizarEntrada(pase.barcodes[0].message), { tipo: "token", valor: QR.token });
  });

  test("la codificación del mensaje es la que exige Apple", () => {
    assert.equal(pase.barcodes[0].messageEncoding, "iso-8859-1");
    assert.equal(pase.barcodes[0].format, "PKBarcodeFormatQR");
  });

  test("el QR lleva debajo SU LECTURA ALTERNATIVA, no la URL", () => {
    // ── QUÉ ES `altText` ──────────────────────────────────────────────────────────────────
    //
    // Apple lo define como «la versión legible del código, por si el código no se escanea». Aquí
    // eso es EXACTAMENTE el número de socio: cuando la cámara de la tablet no lee, el camarero
    // teclea los ocho dígitos.
    //
    // Nunca la URL: el contenido literal del código lleva el token dentro, y eso ni se teclea ni
    // se enseña.
    //
    // Estuvo, se quitó porque repetía el número que tenía justo encima, y vuelve ahora que ese
    // número se ha ido a la cabecera. De paso le da suelo al código.
    assert.equal(pase.barcodes[0].altText, "1234 5678");
    assert.ok(!pase.barcodes[0].altText.includes("http"), "el altText enseña la URL");
    assert.ok(!pase.barcodes[0].altText.includes(QR.token), "el altText enseña el token");
  });

  test("lleva los campos que iOS exige para no rechazarlo", () => {
    for (const k of ["formatVersion", "passTypeIdentifier", "teamIdentifier", "organizationName",
                     "description", "serialNumber"]) {
      assert.ok(pase[k], `falta ${k}`);
    }
    assert.equal(pase.serialNumber, QR.token);
    assert.ok(pase.storeCard, "tiene que ser storeCard: es una tarjeta de fidelidad, no un cupón");
  });

  test("NO declara servicio web: no existe todavía", () => {
    // Declararlos sin el servicio detrás hace que iOS reintente contra un 404 cada vez que el
    // pase aparece en pantalla.
    assert.equal(pase.webServiceURL, undefined);
    assert.equal(pase.authenticationToken, undefined);
  });

  test("la cara dice, en este orden: qué número tiene, de quién es y de qué casa", () => {
    // El número arriba a la derecha —discreto, como una referencia—, el nombre grande sobre el
    // verde, y el lema solo y centrado cerrando la composición.
    // El número arriba a la derecha y SIN RÓTULO: con «SOCIO» encima eran dos masas que
    // aplastaban la firma manuscrita de al lado.
    assert.deepEqual(pase.storeCard.headerFields,
      [{ key: "socio", label: "", value: "1234 5678" }]);
    assert.deepEqual(pase.storeCard.primaryFields,
      [{ key: "titular", label: "TARJETA DE CLIENTE", value: "Marta" }]);
    // Las dos filas de datos, VACÍAS a propósito: son para lo que CAMBIA, y con todo apagado no
    // cambia nada. El lema se fue al dibujo de la banda y nada lo sustituye — el hueco es aire.
    assert.deepEqual(pase.storeCard.secondaryFields, []);
    assert.deepEqual(pase.storeCard.auxiliaryFields, []);
  });

  test("sin `logoText`: el logotipo YA dice «Familia Del Amor»", () => {
    // Era el texto repetido: la firma manuscrita arriba y, al lado, lo mismo en tipografía del
    // sistema.
    assert.equal(pase.logoText, undefined);
  });

  test("un carné sin nombre no deja el sitio grande en blanco, ni repite el número", () => {
    // Sin nombre, el número OCUPA el sitio grande. Entonces ni la cabecera ni el `altText` lo
    // vuelven a decir: es el mismo motivo por el que el `altText` se había quitado —el número
    // estaría repetido a un centímetro de sí mismo—.
    const p = pasePlanoApple({ qr: { ...QR, nombre: "" }, cfg: CFG_APPLE, base: BASE });
    assert.deepEqual(p.storeCard.primaryFields,
      [{ key: "socio", label: "TARJETA DE CLIENTE", value: "1234 5678" }]);
    assert.deepEqual(p.storeCard.headerFields, []);
    assert.deepEqual(p.storeCard.secondaryFields, []);
    assert.equal(p.barcodes[0].altText, undefined);
    const veces = JSON.stringify(p).split("1234 5678").length - 1;
    assert.equal(veces, 1, "el número sale más de una vez");
  });

  test("ningún texto de la cara se repite", () => {
    const sc = pase.storeCard;
    const textos = [...sc.primaryFields, ...sc.secondaryFields, ...sc.auxiliaryFields]
      .flatMap(f => [f.label, f.value])
      .concat(pase.logoText, pase.barcodes[0].altText)
      .filter(Boolean)
      .map(t => String(t).toLowerCase());
    assert.equal(new Set(textos).size, textos.length, `hay texto repetido: ${textos.join(" · ")}`);
  });

  test("los locales con coordenadas salen como `locations`, y como mucho diez", () => {
    const muchos = Array.from({ length: 14 }, (_, i) => ({ local: `Sitio ${i}`, lat: 41 + i / 100, lon: 2.8 }));
    const p = pasePlanoApple({ qr: QR, cfg: CFG_APPLE, base: BASE, locales: muchos });
    assert.equal(p.locations.length, 10, "Apple no admite más de diez");

    // Un local sin coordenadas no se cuela con `undefined` dentro.
    const p2 = pasePlanoApple({ qr: QR, cfg: CFG_APPLE, base: BASE,
      locales: [{ local: "Sin coordenadas" }, { local: "Blanes", lat: 41.67, lon: 2.79 }] });
    assert.equal(p2.locations.length, 1);
    assert.equal(p2.locations[0].latitude, 41.67);
  });

  test("sin locales no aparece la clave `locations` vacía", () => {
    assert.equal(pase.locations, undefined);
  });

  test("el archivo que se descarga no lleva acentos ni espacios", () => {
    assert.match(nombreArchivoPase(), /^[a-z0-9.-]+\.pkpass$/);
  });
});

describe("objeto de Google Wallet", () => {
  const carga = objetoGoogle({ qr: QR, cfg: CFG_GOOGLE, base: BASE });

  test("lleva la clase Y el objeto: así Google los crea al guardar", () => {
    // Es lo que evita tener que llamar a la API de Google desde el servidor.
    assert.equal(carga.loyaltyClasses.length, 1);
    assert.equal(carga.loyaltyObjects.length, 1);
    assert.equal(carga.loyaltyObjects[0].classId, carga.loyaltyClasses[0].id);
  });

  test("el código de barras es el mismo enlace que en Apple", () => {
    assert.equal(carga.loyaltyObjects[0].barcode.value, urlTarjeta(BASE, QR.token));
    assert.equal(carga.loyaltyObjects[0].barcode.type, "QR_CODE");
    assert.equal(carga.loyaltyObjects[0].barcode.alternateText, "1234 5678");
  });

  test("el id del objeto solo usa caracteres que Google admite", () => {
    // Solo [a-zA-Z0-9._-]. El token es base64url, así que encaja; si alguien cambiara el
    // generador de tokens a base64 normal, los `+` y `/` romperían esto y aquí saltaría.
    const id = carga.loyaltyObjects[0].id;
    assert.match(id, /^[A-Za-z0-9._-]+$/);
    assert.ok(id.startsWith(CFG_GOOGLE.issuer_id + "."));
  });

  test("el color de fondo va en hexadecimal (Google) y no en rgb() (Apple)", () => {
    assert.match(carga.loyaltyClasses[0].hexBackgroundColor, /^#[0-9A-Fa-f]{6}$/);
    assert.equal(carga.loyaltyClasses[0].hexBackgroundColor, COLOR_FONDO_HEX);
  });
});
