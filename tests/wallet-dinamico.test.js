// EL PASE QUE SE ACTUALIZA SOLO.
//
// ── LAS CUATRO COSAS QUE NO PUEDEN ROMPERSE ──────────────────────────────────────────────────
//
//   · LA IDENTIDAD. El QR y el `serialNumber` son los de siempre. Wallet es otra ventana al mismo
//     carné, no un carné nuevo: ni otro cliente, ni otro saldo, ni otra identidad para Ágora.
//
//   · EL DISEÑO APROBADO. El titular manda en `primaryFields` y el número de socio en
//     `secondaryFields`. Los puntos y los regalos entran por la fila auxiliar, que estaba libre.
//     La primera versión de esto subía los puntos arriba y bajaba el nombre al reverso — eso es
//     rehacer el pase, no ampliarlo.
//
//   · APNs NO DECIDE NADA. Si Apple está caída, la factura sigue cerrada y los puntos concedidos.
//
//   · NADA NACE ENCENDIDO. Ni la puerta, ni los registros, ni los avisos. Y `tarjeta_activa`
//     manda por encima de todo: con la tarjeta apagada, esta puerta no abre nada por detrás.
//
// APNs SIEMPRE SIMULADO. Ni un solo test habla con Apple.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { pasePlanoApple, urlTarjeta } from "../src/modules/wallet/wallet.js";
import { proyectarCarne, huellaVisible, fechaCorta } from "../src/modules/tarjeta/proyeccion.js";
import {
  tokenDeCabecera, igualSeguro, dispositivoValido, serialValido, passTypeValido,
  normalizarPushToken, leerAlta, etiquetaNumero, respuestaSeriales, leerLogs, redactarLog, MAX,
} from "../src/modules/wallet/passkit.js";
import {
  ESTADOS, INTERRUPTORES, APAGADOS, REQUISITOS, evaluarPuerta, puedeTransitar,
  CONFIRMACION_EXIGIDA, confirmacionValida, puedeEncender, aplicarPuerta, paseLlevaServicio,
} from "../src/modules/wallet/puerta-wallet.js";
import { clasificar, endpointDe, ENTORNOS, proximoIntento, MAX_INTENTOS, avisar }
  from "../src/modules/wallet/apns.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/tarjeta/schema.js", import.meta.url), "utf8");
const firma = readFileSync(new URL("../src/modules/wallet/firma.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
// EL `/*` TIENE QUE EMPEZAR LA LÍNEA.
//
// Con `/\/\*[\s\S]*?\*\//g` a secas, el `"*/*"` de `express.raw({ type: "*/*" })` abría un bloque
// que no cerraba hasta 371 000 caracteres después: se comía el 28 % de `server.js` y cualquier
// `assert.ok(!...)` sobre esa zona pasaba sin comprobar nada.
//
// Todos los bloques de verdad de esta casa son JSDoc al principio de línea, así que basta con
// exigirlo — y así un `*/*` dentro de una cadena sobrevive, que es lo que tiene que pasar.
const sinComentarios = (t) => t.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");

const TOKEN = "aB3-_xYz1234567890abcdefghIJKLMNOPQRSTUVW";
const QR = Object.freeze({ id: 7, clase: "carnet", token: TOKEN, codigo: "12345678", nombre: "Marta" });
const CFG = Object.freeze({ pass_type_id: "pass.com.la-tapeta.clientes", team_id: "4252TFWL5T" });
const BASE = "https://familiadelamor.org";
const AHORA = "2026-10-01T09:00:00+02:00";

const PROMO = Object.freeze({ clave: "esmorzar", estado: "publicada", local: "La Tapeta Girona",
  tipo: "oferta_agora", codigo_agora: "EG26", reward_id: "fidp:x", requiere_derecho: true,
  texto_cliente: "Esmorzar gratis", hasta: "2026-10-31", hora_desde: "07:00", hora_hasta: "11:30",
  prioridad: 0, limite_cuenta: 1, limite_total: 0, dias: "[]" });

const proy = (extra = {}) => proyectarCarne({
  qr: QR, saldo: { disponible: 72, proxima_caducidad: "2027-03-31" },
  regla: { puntos_necesarios: 100 }, promosElegibles: [],
  interruptores: { conceder: true, ofrecer: true },
  promoSw: { promociones_ofrecer: true }, cfg: {}, ahora: AHORA, ...extra });

// ── IDENTIDAD ────────────────────────────────────────────────────────────────────────────────

describe("el carné es el mismo", () => {
  const estatico = pasePlanoApple({ qr: QR, cfg: CFG, base: BASE });
  const dinamico = pasePlanoApple({ qr: QR, cfg: CFG, base: BASE, estado: proy(),
    servicio: { url: `${BASE}/api/wallet/apple`, token: "otro-secreto" } });

  test("EL QR ES IDÉNTICO antes y después", () => {
    assert.equal(estatico.barcodes[0].message, dinamico.barcodes[0].message);
    assert.equal(dinamico.barcodes[0].message, urlTarjeta(BASE, TOKEN));
    assert.equal(dinamico.barcodes[0].message, `${BASE}/tarjeta.html?t=${TOKEN}`);
    assert.equal(dinamico.barcodes[0].format, estatico.barcodes[0].format);
    assert.equal(dinamico.barcodes[0].messageEncoding, estatico.barcodes[0].messageEncoding);
  });

  test("EL SERIAL ES EL TOKEN DEL CARNÉ, y no cambia", () => {
    assert.equal(estatico.serialNumber, TOKEN);
    assert.equal(dinamico.serialNumber, TOKEN);
  });

  test("el mismo carné da siempre el mismo pase", () => {
    const otra = pasePlanoApple({ qr: QR, cfg: CFG, base: BASE, estado: proy(),
      servicio: { url: `${BASE}/api/wallet/apple`, token: "otro-secreto" } });
    assert.deepEqual(otra, dinamico);
  });

  test("el `authenticationToken` NO es el token del carné", () => {
    // Si fueran el mismo, fotografiar el QR daría permiso para hablar con el servicio del pase.
    assert.notEqual(dinamico.authenticationToken, TOKEN);
    assert.equal(dinamico.authenticationToken, "otro-secreto");
    // Y no aparece en ninguna otra parte del pase.
    const json = JSON.stringify({ ...dinamico, authenticationToken: undefined });
    assert.ok(!json.includes("otro-secreto"));
  });

  test("y no crea otra identidad: ni cliente, ni saldo, ni identificador para Ágora", () => {
    const json = JSON.stringify(dinamico);
    for (const malo of ["memberId", "MemberId", "cliente_id", "saldo_wallet", "qr_id"]) {
      assert.ok(!json.includes(malo), `el pase lleva ${malo}`);
    }
  });

  test("sin servicio, el pase es EXACTAMENTE el de antes", () => {
    assert.equal(estatico.webServiceURL, undefined);
    assert.equal(estatico.authenticationToken, undefined);
    // Y la cara no cambia ni un campo.
    assert.deepEqual(estatico.storeCard.primaryFields,
      [{ key: "titular", label: "CARNÉ DE CLIENTE", value: "Marta" }]);
    assert.deepEqual(estatico.storeCard.secondaryFields,
      [{ key: "socio", label: "NÚMERO DE SOCIO", value: "1234 5678" }]);
    assert.deepEqual(estatico.storeCard.auxiliaryFields, []);
  });
});

// ── EL DISEÑO APROBADO ───────────────────────────────────────────────────────────────────────

describe("el diseño aprobado se conserva", () => {
  const p = pasePlanoApple({ qr: QR, cfg: CFG, base: BASE, estado: proy(),
    servicio: { url: BASE, token: "s" } });

  test("el titular sigue mandando en el sitio grande", () => {
    assert.deepEqual(p.storeCard.primaryFields,
      [{ key: "titular", label: "CARNÉ DE CLIENTE", value: "Marta" }]);
  });

  test("el número de socio sigue en el segundo", () => {
    assert.deepEqual(p.storeCard.secondaryFields,
      [{ key: "socio", label: "NÚMERO DE SOCIO", value: "1234 5678" }]);
  });

  test("LOS PUNTOS Y LOS REGALOS ENTRAN POR LA FILA AUXILIAR", () => {
    const ids = p.storeCard.auxiliaryFields.map((f) => f.key);
    assert.ok(ids.includes("puntos"), `auxiliares: ${ids.join(", ")}`);
    assert.equal(p.storeCard.auxiliaryFields.find((f) => f.key === "puntos").value, "72");
  });

  test("colores, logo y ausencias siguen igual", () => {
    assert.equal(p.backgroundColor, "rgb(244, 242, 237)");
    assert.equal(p.foregroundColor, "rgb(28, 33, 31)");
    assert.equal(p.labelColor, "rgb(47, 107, 79)");
    assert.equal(p.logoText, undefined, "el logotipo ya dice el nombre");
    assert.equal(p.barcodes[0].altText, undefined, "el número ya está en la cara");
    assert.ok(p.storeCard, "sigue siendo storeCard");
    assert.equal(p.sharingProhibited, true);
  });

  test("NUNCA más de tres campos auxiliares: el cuarto los aprieta y deja de leerse", () => {
    const lleno = pasePlanoApple({ qr: QR, cfg: CFG, base: BASE,
      servicio: { url: BASE, token: "s" },
      estado: proy({ promosElegibles: [PROMO], promoSw: { promociones_ofrecer: true } }) });
    assert.ok(lleno.storeCard.auxiliaryFields.length <= 3,
      `salieron ${lleno.storeCard.auxiliaryFields.length}`);
  });

  test("un nombre larguísimo NO rompe la composición", () => {
    const largo = { ...QR, nombre: "María del Carmen Fernández-Echevarría de la Torre" };
    const q = pasePlanoApple({ qr: largo, cfg: CFG, base: BASE, estado: proy(),
      servicio: { url: BASE, token: "s" } });
    const v = q.storeCard.primaryFields[0].value;
    assert.ok(v.length <= 27, `titular de ${v.length} caracteres: ${v}`);
    assert.ok(v.endsWith("…"), "un nombre recortado tiene que decir que lo está");
    // Y sigue siendo el titular, no otra cosa.
    assert.equal(q.storeCard.primaryFields[0].label, "CARNÉ DE CLIENTE");
  });

  test("un saldo de muchos dígitos y un regalo kilométrico tampoco", () => {
    const q = pasePlanoApple({ qr: QR, cfg: CFG, base: BASE, servicio: { url: BASE, token: "s" },
      estado: proy({ saldo: { disponible: 123456, proxima_caducidad: null },
        promosElegibles: [{ ...PROMO,
          texto_cliente: "Esmorzar complet amb cafè, suc i entrepà de truita amb all i oli" }] }) });
    for (const f of q.storeCard.auxiliaryFields) {
      assert.ok(String(f.value).length <= 22, `campo largo: ${f.key} = ${f.value}`);
    }
  });

  test("sin nombre, el número ocupa el sitio grande, como siempre", () => {
    const q = pasePlanoApple({ qr: { ...QR, nombre: "" }, cfg: CFG, base: BASE, estado: proy(),
      servicio: { url: BASE, token: "s" } });
    assert.deepEqual(q.storeCard.primaryFields,
      [{ key: "socio", label: "CARNÉ DE CLIENTE", value: "1234 5678" }]);
    assert.deepEqual(q.storeCard.secondaryFields, []);
  });

  test("el reverso lleva el enlace a la tarjeta web y la privacidad", () => {
    const q = pasePlanoApple({ qr: QR, cfg: CFG, base: BASE, servicio: { url: BASE, token: "s" },
      estado: proy(), textos: { privacidad_url: "/privacitat.html", contacto: "info@ejemplo" } });
    const back = q.storeCard.backFields;
    assert.equal(back.find((f) => f.key === "cuenta").value, urlTarjeta(BASE, TOKEN));
    assert.ok(back.some((f) => f.key === "privacidad"));
    assert.ok(back.some((f) => f.key === "contacto"));
  });
});

// ── LA FIRMA ─────────────────────────────────────────────────────────────────────────────────

describe("la firma no puede volver atrás", () => {
  test("`-noattr` NUNCA vuelve a firma.js", () => {
    // Quitaba `signingTime` de la firma. OpenSSL la verificaba igual y Wallet la rechazaba con
    // «Signature must contain a signing date». El pase se podía construir y no se podía añadir.
    assert.ok(!sinComentarios(firma).includes("-noattr"), "ha vuelto `-noattr`");
  });

  test("y la firma sigue siendo PKCS#7 detached en DER, con atributos", () => {
    const f = sinComentarios(firma);
    assert.match(f, /"smime", "-sign", "-binary"/);
    assert.match(f, /"-outform", "DER"/);
    assert.match(f, /"-certfile", rWwdr/);
  });

  test("`inline` se conserva, pero NO fue la solución del fallo", () => {
    assert.match(sinComentarios(server), /Content-Disposition", `inline; filename=/);
  });
});

// ── LA PROYECCIÓN ────────────────────────────────────────────────────────────────────────────

describe("la proyección dice lo mismo en los dos sitios", () => {
  test("con puntos activos, saldo y cuánto falta", () => {
    const p = proy();
    assert.equal(p.puntos.activo, true);
    assert.equal(p.puntos.saldo, 72);
    assert.equal(p.puntos.objetivo, 100);
    assert.equal(p.puntos.faltan, 28);
    assert.equal(p.puntos.proxima_caducidad, "2027-03-31");
  });

  test("PUNTOS APAGADOS: ni un cero, que sería un saldo falso", () => {
    const p = proy({ interruptores: { conceder: false } });
    assert.equal(p.puntos.activo, false);
    assert.equal(p.puntos.saldo, null);
    assert.notEqual(p.puntos.saldo, 0);
    assert.match(p.puntos.texto, /preparaci/i);
  });

  test("el texto de preparación es configurable desde el panel", () => {
    const p = proy({ interruptores: { conceder: false },
      cfg: { texto_preparacion: "Programa de punts en preparació" } });
    assert.equal(p.puntos.texto, "Programa de punts en preparació");
  });

  test("`mostrar_puntos = false` también los esconde", () => {
    assert.equal(proy({ cfg: { mostrar_puntos: false } }).puntos.activo, false);
  });

  test("con un regalo, sale su nombre, su local y su caducidad", () => {
    const p = proy({ promosElegibles: [PROMO] });
    assert.equal(p.premios.cantidad, 1);
    assert.equal(p.premios.principal.nombre, "Esmorzar gratis");
    assert.equal(p.premios.principal.local, "La Tapeta Girona");
    assert.equal(p.premios.principal.hasta_texto, "31/10/2026");
    assert.equal(p.premios.principal.horario, "07:00–11:30");
    assert.equal(p.premios.principal.personal, true, "es de las que hay que ganarse");
  });

  test("PROMOCIONES PAUSADAS: el regalo NO se presenta como utilizable", () => {
    const p = proy({ promosElegibles: [PROMO], promoSw: { promociones_ofrecer: false } });
    assert.equal(p.premios.cantidad, 0);
    assert.equal(p.premios.principal, null);
    assert.deepEqual(p.premios.disponibles, []);
  });

  test("el premio principal se elige con LAS MISMAS REGLAS que Ágora", () => {
    const general = { ...PROMO, clave: "general", requiere_derecho: false, prioridad: 99,
      texto_cliente: "General" };
    const p = proy({ promosElegibles: [general, PROMO] });
    assert.equal(p.premios.principal.nombre, "Esmorzar gratis",
      "la que alguien se ganó va por delante, aunque la otra tenga más prioridad");
    // Y no depende del orden de la lista.
    assert.equal(proy({ promosElegibles: [PROMO, general] }).premios.principal.nombre,
      "Esmorzar gratis");
  });

  test("NO SALE NI UN DATO INTERNO", () => {
    const json = JSON.stringify(proy({ promosElegibles: [PROMO] }));
    for (const malo of ["telefono", "MemberId", "member_hash", "lote", "clave_idem", "factura",
                        "reward_id", "qr_id", "token", "version"]) {
      assert.ok(!json.includes(malo), `la proyección lleva «${malo}»: ${json.slice(0, 300)}`);
    }
  });

  test("fechaCorta no inventa fechas", () => {
    assert.equal(fechaCorta("2026-10-31"), "31/10/2026");
    for (const malo of [null, "", "mañana", "2026-13", undefined]) {
      assert.equal(fechaCorta(malo), null, `inventó con ${malo}`);
    }
  });
});

describe("la huella detecta lo VISIBLE y solo lo visible", () => {
  test("misma cara, misma huella", () => {
    assert.equal(huellaVisible(proy()), huellaVisible(proy()));
  });

  test("cambiar los puntos la mueve", () => {
    assert.notEqual(huellaVisible(proy()),
      huellaVisible(proy({ saldo: { disponible: 73, proxima_caducidad: "2027-03-31" } })));
  });

  test("ganar un regalo la mueve", () => {
    assert.notEqual(huellaVisible(proy()), huellaVisible(proy({ promosElegibles: [PROMO] })));
  });

  test("SIN CAMBIO VISIBLE NO SE MUEVE: no se despierta el móvil para nada", () => {
    // `actualizado_en` cambia en cada cálculo y no se ve en el pase.
    assert.equal(huellaVisible(proy({ ahora: "2026-10-01T09:00:00+02:00" })),
                 huellaVisible(proy({ ahora: "2026-12-25T23:59:00+01:00" })));
  });
});

// ── EL PROTOCOLO ─────────────────────────────────────────────────────────────────────────────

describe("autorización de PassKit", () => {
  test("solo `ApplePass <token>`", () => {
    assert.equal(tokenDeCabecera("ApplePass abc123"), "abc123");
    assert.equal(tokenDeCabecera("applepass abc123"), "abc123");
    for (const malo of ["Bearer abc", "ApplePass", "abc123", "", null, "ApplePass a b",
                        "ApplePass " + "x".repeat(MAX.token + 1)]) {
      assert.equal(tokenDeCabecera(malo), null, `aceptó «${malo}»`);
    }
  });

  test("la comparación es en tiempo constante", () => {
    assert.equal(igualSeguro("abc", "abc"), true);
    assert.equal(igualSeguro("abc", "abd"), false);
    assert.equal(igualSeguro("abc", "ab"), false);
    assert.equal(igualSeguro("", ""), true);
    assert.equal(igualSeguro(null, undefined), true, "los dos vacíos son iguales");
  });

  test("UN TOKEN DE OTRO PASE NO SIRVE", () => {
    assert.equal(igualSeguro("token-del-pase-A", "token-del-pase-B"), false);
  });

  test("identificadores con forma y con tope", () => {
    assert.equal(dispositivoValido("abc123"), true);
    assert.equal(serialValido(TOKEN), true);
    for (const malo of ["", "a b", "../etc", "a/b", "x".repeat(200), "<script>", null]) {
      assert.equal(dispositivoValido(malo), false, `aceptó «${malo}»`);
      assert.equal(serialValido(malo), false, `aceptó «${malo}»`);
    }
  });

  test("el passTypeIdentifier se compara con el CONFIGURADO, no con un patrón", () => {
    assert.equal(passTypeValido("pass.com.la-tapeta.clientes", CFG.pass_type_id), true);
    assert.equal(passTypeValido("pass.com.otra-casa.clientes", CFG.pass_type_id), false);
    assert.equal(passTypeValido("pass.com.la-tapeta.clientes", null), false,
      "sin configuración no se acepta nada");
    assert.equal(passTypeValido("", CFG.pass_type_id), false);
  });

  test("el pushToken es hexadecimal y se guarda en minúsculas", () => {
    assert.equal(normalizarPushToken("AABBCC"), "aabbcc");
    for (const malo of ["", "zz", "aa bb", "x".repeat(300), null, "aa-bb"]) {
      assert.equal(normalizarPushToken(malo), null, `aceptó «${malo}»`);
    }
    assert.equal(leerAlta({ pushToken: "DEADBEEF" }), "deadbeef");
    assert.equal(leerAlta({}), null);
    assert.equal(leerAlta(null), null);
  });

  test("la etiqueta es opaca y lo raro vale 0: se contesta todo, que es lo seguro", () => {
    assert.equal(etiquetaNumero("7"), 7);
    assert.equal(etiquetaNumero(undefined), 0);
    assert.equal(etiquetaNumero("mañana"), 0);
    assert.equal(etiquetaNumero("-3"), 0);
    assert.equal(etiquetaNumero("9".repeat(40)), 0);
  });

  test("sin seriales se contesta 204, no un 200 vacío", () => {
    assert.deepEqual(respuestaSeriales([]), { codigo: 204, cuerpo: null });
    const r = respuestaSeriales([{ serial: "A", etiqueta: 3 }, { serial: "B", etiqueta: 9 }]);
    assert.equal(r.codigo, 200);
    assert.equal(r.cuerpo.lastUpdated, "9");
    assert.deepEqual(r.cuerpo.serialNumbers, ["A", "B"]);
  });
});

describe("el registro de errores de Wallet", () => {
  test("TAPA EL SERIAL, que va dentro de la URL", () => {
    const r = redactarLog(`Error GET /v1/passes/pass.com.x/${TOKEN} failed`);
    assert.ok(!r.includes(TOKEN), r);
    assert.match(r, /«serial»/);
  });

  test("y el identificador del dispositivo", () => {
    const r = redactarLog("POST /v1/devices/deadbeefcafe/registrations/pass.com.x");
    assert.ok(!r.includes("deadbeefcafe"));
    assert.match(r, /«dispositivo»/);
  });

  test("tapa cualquier `?t=` suelto", () => {
    assert.ok(!redactarLog(`abrió https://x/tarjeta.html?t=${TOKEN}`).includes(TOKEN));
  });

  test("un cuerpo enorme se recorta y se limita en líneas", () => {
    const logs = Array.from({ length: 500 }, (_, i) => `linea ${i} ` + "x".repeat(9000));
    const out = leerLogs({ logs });
    assert.ok(out.length <= MAX.logLineas, `${out.length} líneas`);
    for (const l of out) assert.ok(l.length <= MAX.log, `línea de ${l.length}`);
  });

  test("un cuerpo que no es `{logs:[…]}` no revienta nada", () => {
    for (const malo of [null, {}, { logs: "x" }, [], "texto"]) {
      assert.deepEqual(leerLogs(malo), []);
    }
  });
});

// ── LA PUERTA ────────────────────────────────────────────────────────────────────────────────

const CTX_OK = Object.freeze({ tarjetaActiva: true, certificado: true, openssl: true,
  urlPublica: true, puedeCifrar: true, entornoApns: "produccion" });

describe("nada nace encendido", () => {
  test("los tres interruptores nacen apagados y están congelados", () => {
    assert.deepEqual(APAGADOS,
      { wallet_registros: false, wallet_avisos: false, wallet_visibles: false });
    assert.throws(() => { APAGADOS.wallet_registros = true; }, TypeError);
    assert.throws(() => { INTERRUPTORES.push("x"); }, TypeError);
  });

  test("la puerta nace apagada, y un estado raro se trata como apagada", () => {
    assert.equal(evaluarPuerta(null, CTX_OK).estado, "apagado");
    for (const malo of ["ACTIVO", "activo ", "sombra", 1, null]) {
      assert.equal(evaluarPuerta({ estado: malo }, CTX_OK).estado, "apagado", `abrió con ${malo}`);
    }
  });

  test("la tabla nace apagada y la migración no la mueve", () => {
    const e = sinComentarios(esquema);
    assert.match(e, /CREATE TABLE IF NOT EXISTS wallet_puerta/);
    assert.match(e, /estado TEXT NOT NULL DEFAULT 'apagado'/);
    assert.match(e, /INSERT INTO wallet_puerta \(id, estado, actualizado_en\) VALUES \(1, 'apagado', \?\)/);
    assert.ok(!/INSERT INTO wallet_puerta[\s\S]{0,120}'activo'/.test(e));
    assert.ok(!/wal_wallet_registros|wal_wallet_avisos/.test(e), "una migración enciende algo");
  });

  test("la migración es aditiva: ni DROP ni TRUNCATE", () => {
    const e = sinComentarios(esquema);
    for (const malo of ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM"]) {
      assert.ok(!e.includes(malo), `el esquema contiene ${malo}`);
    }
  });
});

describe("el candado final", () => {
  const TODO = { wallet_registros: true, wallet_avisos: true, wallet_visibles: true };

  test("con la puerta cerrada, todo apagado", () => {
    for (const e of ["apagado", "listo_para_activar", "pausado", "raro", null]) {
      assert.deepEqual(aplicarPuerta(TODO, e), APAGADOS, `se coló con ${e}`);
    }
  });

  test("PAUSAR CORTA AL INSTANTE aunque sigan guardados en 1", () => {
    assert.deepEqual(aplicarPuerta(TODO, "pausado"), APAGADOS);
  });

  test("avisar sin registros no es un estado posible", () => {
    const r = aplicarPuerta({ wallet_registros: false, wallet_avisos: true }, "activo");
    assert.equal(r.wallet_avisos, false);
  });

  test("los mensajes visibles NUNCA se encienden: no están implementados", () => {
    assert.equal(aplicarPuerta(TODO, "activo").wallet_visibles, false);
    const r = puedeEncender("wallet_visibles", true, { estadoPuerta: "activo",
      guardados: { wallet_registros: true, wallet_avisos: true } });
    assert.equal(r.ok, false);
    assert.match(r.error, /no está|implementad/i);
  });

  test("`webServiceURL` SOLO con los registros permitidos", () => {
    assert.equal(paseLlevaServicio({ wallet_registros: true }), true);
    assert.equal(paseLlevaServicio({ wallet_registros: false, wallet_avisos: true }), false);
    assert.equal(paseLlevaServicio(APAGADOS), false);
    assert.equal(paseLlevaServicio(null), false);
  });
});

describe("mover los interruptores", () => {
  test("APAGAR SIEMPRE SE PUEDE", () => {
    for (const e of ESTADOS.concat(["raro"])) {
      for (const k of INTERRUPTORES) {
        assert.equal(puedeEncender(k, false, { estadoPuerta: e }).ok, true, `${k} con ${e}`);
      }
    }
  });

  test("encender exige la puerta abierta", () => {
    for (const e of ["apagado", "listo_para_activar", "pausado"]) {
      assert.equal(puedeEncender("wallet_registros", true, { estadoPuerta: e }).ok, false);
    }
    assert.equal(puedeEncender("wallet_registros", true, { estadoPuerta: "activo" }).ok, true);
  });

  test("avisar exige registros", () => {
    const r = puedeEncender("wallet_avisos", true,
      { estadoPuerta: "activo", guardados: { wallet_registros: false } });
    assert.equal(r.ok, false);
    assert.match(r.error, /registr/i);
    assert.equal(puedeEncender("wallet_avisos", true,
      { estadoPuerta: "activo", guardados: { wallet_registros: true } }).ok, true);
  });

  test("no se acepta un interruptor de otro sistema", () => {
    for (const k of ["conceder", "ofrecer", "consumir", "promociones_ofrecer", "tarjeta_activa"]) {
      assert.equal(puedeEncender(k, true, { estadoPuerta: "activo" }).ok, false, k);
    }
  });

  test("la confirmación es propia, distinta de las otras dos", () => {
    assert.equal(CONFIRMACION_EXIGIDA, "ACTIVAR WALLET");
    assert.equal(confirmacionValida("ACTIVAR WALLET"), true);
    assert.equal(confirmacionValida(" activar   wallet "), true);
    for (const malo of ["ACTIVAR", "ACTIVAR PROMOCIONES", "OFRECER A TODOS", "", null]) {
      assert.equal(confirmacionValida(malo), false, `aceptó «${malo}»`);
    }
  });
});

describe("los requisitos los comprueba el servidor", () => {
  test("con todo cumplido se puede activar", () => {
    assert.equal(evaluarPuerta({ estado: "apagado" }, CTX_OK).puede_activar, true);
  });

  test("LA TARJETA APAGADA BLOQUEA LA PUERTA: no hay puerta trasera", () => {
    const e = evaluarPuerta({ estado: "apagado" }, { ...CTX_OK, tarjetaActiva: false });
    assert.equal(e.puede_activar, false);
    assert.equal(e.requisitos.find((r) => r.id === "tarjeta_encendida").ok, false);
  });

  test("cada requisito falla por su cuenta y dice qué hacer", () => {
    const rompe = { certificado: { certificado: false }, openssl: { openssl: false },
      url_publica: { urlPublica: false }, clave_datos: { puedeCifrar: false },
      entorno_apns: { entornoApns: null }, tarjeta_encendida: { tarjetaActiva: false } };
    for (const [id, malo] of Object.entries(rompe)) {
      const e = evaluarPuerta({ estado: "apagado" }, { ...CTX_OK, ...malo });
      const r = e.requisitos.find((x) => x.id === id);
      assert.equal(r.ok, false, `${id} salió cumplido`);
      assert.ok(r.motivo.length > 20, `${id} no explica nada`);
      assert.equal(e.puede_activar, false);
    }
    assert.deepEqual(REQUISITOS.map((r) => r.id), ["tarjeta_encendida", "certificado", "openssl",
      "url_publica", "clave_datos", "entorno_apns"]);
  });

  test("un contexto vacío no activa nada", () => {
    assert.equal(evaluarPuerta({ estado: "apagado" }, {}).puede_activar, false);
  });

  test("activa e incumpliendo: se avisa, NO se cierra sola", () => {
    const e = evaluarPuerta({ estado: "activo" }, { ...CTX_OK, certificado: false });
    assert.equal(e.estado, "activo");
    assert.equal(e.incoherente, true);
  });

  test("pausar siempre se puede; reanudar vuelve a exigir", () => {
    assert.equal(puedeTransitar("activo", "pausado", { puedeActivar: false }).ok, true);
    assert.equal(puedeTransitar("pausado", "activo", { puedeActivar: false }).ok, false);
    assert.equal(puedeTransitar("pausado", "activo", { puedeActivar: true }).ok, true);
    assert.equal(puedeTransitar("activo", "apagado", { puedeActivar: true }).ok, false);
  });
});

// ── APNs, SIEMPRE SIMULADO ───────────────────────────────────────────────────────────────────

describe("APNs", () => {
  test("los dos entornos están CERRADOS: no se acepta una URL a mano", () => {
    assert.equal(endpointDe("produccion"), "https://api.push.apple.com:443");
    assert.equal(endpointDe("sandbox"), "https://api.sandbox.push.apple.com:443");
    for (const malo of ["https://evil.example", "", null, "PRODUCCION", "__proto__", "toString"]) {
      assert.equal(endpointDe(malo), null, `aceptó «${malo}»`);
    }
    assert.deepEqual([...ENTORNOS], ["produccion", "sandbox"]);
  });

  test("un 410 invalida el registro; no se reintenta a un token muerto", () => {
    assert.deepEqual(clasificar(410, '{"reason":"Unregistered"}'),
      { ok: false, accion: "invalidar", razon: "Unregistered" });
  });

  test("un token que no es un token se invalida; uno de otro topic NO", () => {
    // `BadDeviceToken` dice que ESE token está mal. `DeviceTokenNotForTopic` dice que NOSOTROS
    // estamos hablando con el APNs o el certificado equivocados, y el token puede estar bien.
    assert.equal(clasificar(400, '{"reason":"BadDeviceToken"}').accion, "invalidar");
    assert.equal(clasificar(400, '{"reason":"DeviceTokenNotForTopic"}').accion, "config");
  });

  test("200 es entregado; 429 y 500 se reintentan; 403 es configuración", () => {
    assert.equal(clasificar(200, "").ok, true);
    assert.equal(clasificar(429, "").accion, "reintentar");
    assert.equal(clasificar(503, "").accion, "reintentar");
    assert.equal(clasificar(403, '{"reason":"InvalidProviderToken"}').accion, "config");
  });

  test("un cuerpo que no es JSON no revienta la clasificación", () => {
    assert.equal(clasificar(500, "<html>").accion, "reintentar");
    assert.equal(clasificar(500, null).accion, "reintentar");
  });

  test("la espera crece y tiene techo", () => {
    const t = 1_000_000;
    const esperas = [0, 1, 2, 3, 9].map((i) => proximoIntento(i, t) - t);
    assert.deepEqual(esperas, [30_000, 120_000, 480_000, 1_800_000, 1_800_000]);
    assert.equal(MAX_INTENTOS, 4);
  });

  test("EL AVISO VA VACÍO y el topic es el passTypeIdentifier", async () => {
    // Servidor HTTP/2 SIMULADO: se comprueba qué se manda sin hablar con Apple.
    const visto = [];
    const conectar = () => {
      const sesion = {
        once(ev, fn) { if (ev === "connect") setImmediate(fn); return sesion; },
        request(cab) {
          const req = {
            on(ev, fn) {
              if (ev === "response") setImmediate(() => fn({ ":status": 200 }));
              if (ev === "end") setImmediate(fn);
              return req;
            },
            setTimeout() { return req; },
            end(cuerpo) { visto.push({ cab, cuerpo }); },
            close() {},
          };
          return req;
        },
        close() {},
      };
      return sesion;
    };
    const r = await avisar({ tokens: ["aabb", "ccdd"], passTypeId: CFG.pass_type_id,
      entorno: "produccion", cert: "PEM", clave: "PEM", conectar });
    assert.equal(r.length, 2);
    assert.ok(r.every((x) => x.ok));
    for (const v of visto) {
      assert.equal(v.cuerpo, "{}", "el aviso NO puede llevar datos: se funden entre sí");
      assert.equal(v.cab["apns-topic"], CFG.pass_type_id);
      assert.equal(v.cab["apns-push-type"], "background");
      assert.equal(v.cab[":method"], "POST");
      assert.match(v.cab[":path"], /^\/3\/device\//);
      // Ni puntos, ni nombre, ni premios en ninguna cabecera.
      const todo = JSON.stringify(v);
      for (const malo of ["Marta", "72", "Esmorzar", "telefono"]) {
        assert.ok(!todo.includes(malo), `el aviso lleva «${malo}»`);
      }
    }
  });

  test("sin tokens no se conecta siquiera", async () => {
    let conecto = false;
    const r = await avisar({ tokens: [], passTypeId: "x", cert: "a", clave: "b",
      conectar: () => { conecto = true; } });
    assert.deepEqual(r, []);
    assert.equal(conecto, false);
  });

  test("sin certificado o con entorno raro, no se manda nada", async () => {
    await assert.rejects(() => avisar({ tokens: ["aa"], passTypeId: "x", entorno: "raro",
      cert: "a", clave: "b", conectar: () => {} }));
    await assert.rejects(() => avisar({ tokens: ["aa"], passTypeId: "x", conectar: () => {} }));
  });
});

// ── EL CABLEADO ──────────────────────────────────────────────────────────────────────────────

describe("cableado del servidor", () => {
  const s = sinComentarios(server);

  test("las cinco rutas oficiales existen, con sus métodos", () => {
    const rutas = [
      ['app.post("/api/wallet/apple/v1/devices/:dispositivo/registrations/:passTypeId/:serial"', "alta"],
      ['app.get("/api/wallet/apple/v1/devices/:dispositivo/registrations/:passTypeId"', "seriales"],
      ['app.delete("/api/wallet/apple/v1/devices/:dispositivo/registrations/:passTypeId/:serial"', "baja"],
      ['app.get("/api/wallet/apple/v1/passes/:passTypeId/:serial"', "pase"],
      ['app.post("/api/wallet/apple/v1/log"', "log"],
    ];
    for (const [r, n] of rutas) assert.ok(s.includes(r), `falta la ruta de ${n}`);
  });

  test("ninguna usa sesión ni cookies del panel", () => {
    const i = s.indexOf("EL SERVICIO WEB DE PASSKIT");
    const bloque = s.slice(i, s.indexOf("CONSTRUIR Y FIRMAR EL", i));
    assert.ok(!/requireAuth|req\.user|cookie/.test(bloque), "una ruta de PassKit usa sesión");
  });

  test("TODAS pasan por `tarjetaApagada`: el interruptor general manda", () => {
    for (const r of ["/api/wallet/apple/v1/devices", "/api/wallet/apple/v1/passes",
                     "/api/wallet/apple/v1/log"]) {
      const i = s.indexOf(`"${r}`);
      assert.ok(i > 0, r);
      assert.match(s.slice(i, i + 400), /tarjetaApagada\(res\)/, r);
    }
    // Y el candado duro, en los interruptores.
    assert.match(s, /if \(!TARJETA_ACTIVA\) return \{ \.\.\.WAL_APAGADOS \};/);
  });

  test("el alta contesta 201 nueva, 200 repetida e ignora lo demás", () => {
    const i = s.indexOf('app.post("/api/wallet/apple/v1/devices');
    const bloque = s.slice(i, s.indexOf("app.get(\"/api/wallet/apple/v1/devices", i));
    assert.match(bloque, /if \(ya && ya\.activo\) return res\.status\(200\)\.end\(\);/);
    assert.match(bloque, /res\.status\(201\)\.end\(\);/);
    assert.match(bloque, /ON CONFLICT \(dispositivo, qr_id\) DO UPDATE/);
  });

  test("con los registros apagados, el alta contesta 401 y no dice por qué", () => {
    const i = s.indexOf('app.post("/api/wallet/apple/v1/devices');
    assert.match(s.slice(i, i + 700), /if \(!sw\.wallet_registros\) return wal401\(res\);/);
  });

  test("la consulta de seriales NO pide token: lo dice la guía de Apple", () => {
    const i = s.indexOf('app.get("/api/wallet/apple/v1/devices');
    const bloque = s.slice(i, s.indexOf('app.delete("/api/wallet/apple/v1/devices', i));
    assert.ok(!bloque.includes("walAutorizar"), "pide token donde no lo hay");
    assert.match(bloque, /res\.status\(204\)\.end\(\)/);
  });

  test("la descarga soporta If-Modified-Since y 304", () => {
    const i = s.indexOf('app.get("/api/wallet/apple/v1/passes');
    const bloque = s.slice(i, i + 1800);
    assert.match(bloque, /if-modified-since/);
    assert.match(bloque, /return res\.status\(304\)\.end\(\);/);
    assert.match(bloque, /application\/vnd\.apple\.pkpass/);
    assert.match(bloque, /Last-Modified/);
  });

  test("la baja NO borra el carné ni el cliente", () => {
    const i = s.indexOf('app.delete("/api/wallet/apple/v1/devices');
    const bloque = s.slice(i, i + 1200);
    assert.match(bloque, /UPDATE wallet_registros SET activo = FALSE/);
    assert.ok(!/DELETE FROM pro_qr|DELETE FROM wallet_pases/.test(bloque));
  });

  test("respuestas uniformes: no se puede enumerar qué serial existe", () => {
    assert.match(s, /const wal401 = \(res\) => res\.status\(401\)\.end\(\);/);
    // Y la autorización hace el mismo trabajo exista o no el pase.
    assert.match(s, /const señuelo = "0"\.repeat\(43\);/);
    assert.match(s, /pkIgual\(señuelo, enviado \|\| señuelo\);/);
  });

  test("las rutas de PassKit tienen su propio freno", () => {
    assert.match(s, /pulsoRateLimit\(req, res, 60, `pk:\$\{clave\}`\)/);
    assert.match(s, /function pulsoRateLimit\(req, res, max, ambito = ""\)/);
  });

  test("el cuerpo tiene tope ANTES del parser general", () => {
    const iWal = s.indexOf('app.use("/api/wallet/apple/v1", express.json({ limit: "16kb" }))');
    const iGlobal = s.indexOf("app.use(express.json());");
    assert.ok(iWal > 0 && iWal < iGlobal, "el tope va después del parser general y no sirve");
  });
});

describe("actualizar y avisar", () => {
  const s = sinComentarios(server);

  test("`marcarPaseActualizado` NO lanza nunca", () => {
    const i = s.indexOf("async function marcarPaseActualizado(");
    const fn = s.slice(i, s.indexOf("\n}", i));
    assert.match(fn, /catch \(e\) \{/);
    assert.ok(!/throw /.test(fn), "puede lanzar y tumbar una factura");
  });

  test("SIN CAMBIO VISIBLE no se encola nada", () => {
    // La comparación vive en `aviso.js`, dentro de la transacción. Los detalles, en
    // `wallet-aviso-transaccion.test.js`.
    const m = readFileSync(new URL("../src/modules/wallet/aviso.js", import.meta.url), "utf8");
    assert.match(m, /if \(String\(pase\.huella \?\? ""\) === String\(huella \?\? ""\)\)/);
    assert.match(m, /return \{ ok: true, cambio: false, encolado: false/);
  });

  test("sin pase o sin dispositivo registrado, tampoco", () => {
    assert.match(s, /if \(!pase\) return \{ ok: false, motivo: "sin_pase" \};/);
    const m = readFileSync(new URL("../src/modules/wallet/aviso.js", import.meta.url), "utf8");
    assert.match(m, /FROM wallet_registros WHERE qr_id = \? AND activo LIMIT 1/);
    assert.match(m, /if \(!hay\) return \{ ok: true, cambio: true, encolado: false/);
  });

  test("varios cambios seguidos se agrupan en UN aviso, con la versión más reciente", () => {
    const m = readFileSync(new URL("../src/modules/wallet/aviso.js", import.meta.url), "utf8");
    // UPSERT sobre el pendiente: el segundo cambio le sube la etiqueta al primero.
    assert.match(m, /ON CONFLICT \(qr_id\) WHERE estado = 'pendiente'/);
    assert.match(m, /DO UPDATE SET etiqueta = EXCLUDED\.etiqueta/);
  });

  test("el candado es un ÍNDICE PARCIAL, no una clave de texto que haya que reescribir", () => {
    // Con una clave única había que liberarla a mano al cerrar cada aviso, y si un camino de
    // cierre se olvidaba, ese pase no volvía a recibir un aviso nunca más, en silencio.
    assert.match(sinComentarios(esquema),
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_aviso_pendiente\s*\n?\s*ON wallet_avisos \(qr_id\) WHERE estado = 'pendiente'/);
    assert.ok(!/clave_idem TEXT NOT NULL UNIQUE/.test(esquema), "`clave_idem` sigue siendo única");
    assert.ok(!/clave_idem = 'wal:'/.test(s), "un cierre sigue reescribiendo la clave");
  });

  test("LA FACTURA NO ESPERA A APNs", () => {
    // Sin `await` y después del COMMIT: si Apple está caída, la factura sigue cerrada.
    assert.match(s, /marcarPaseActualizado\(id, "factura"\)\.catch\(\(\) => \{\}\);/);
    const i = s.indexOf("await fidTransaccion(async (x) => {\n      return fidProcesarFactura");
    const j = s.indexOf('marcarPaseActualizado(id, "factura")');
    assert.ok(i > 0 && j > i, "el aviso va antes de la transacción");
  });

  test("y no se llama a APNs dentro de ninguna transacción", () => {
    const i = s.indexOf("async function walVaciarCola()");
    const fn = s.slice(i, s.indexOf("\n}\n", i));
    assert.ok(!/fidTransaccion|BEGIN/.test(fn), "el worker abre una transacción");
  });

  test("el worker no manda nada con los avisos apagados", () => {
    assert.match(s, /if \(!sw\.wallet_avisos\) return;/);
  });

  test("un token invalidado da de baja sus registros y borra el token", () => {
    assert.match(s, /invalidado_en = \?, invalidado_motivo = \?,\s*\n?\s*push_token_enc = NULL/);
    assert.match(s, /UPDATE wallet_registros SET activo = FALSE, baja_en = \?, baja_motivo = 'apns'/);
  });

  test("el barrido por configuración tiene TECHO y solo mira pases registrados", () => {
    assert.match(s, /const WAL_TECHO_BARRIDO = 500;/);
    assert.match(s, /FROM wallet_registros r WHERE r\.activo LIMIT \?/);
  });

  test("el certificado se extrae a temporales 0600 y se borran en `finally`", () => {
    const i = s.indexOf("async function walCertificado(");
    const fn = s.slice(i, s.indexOf("\n}", i));
    assert.match(fn, /mode: 0o600/);
    assert.match(fn, /finally \{/);
    assert.match(fn, /fs\.rmSync\(dir, \{ recursive: true, force: true \}\)/);
    assert.match(fn, /env:PKPASS_PW/, "la contraseña no puede ir en la línea de órdenes");
    assert.ok(!/-passin", "pass:/.test(fn), "la contraseña va visible en el proceso");
  });
});

// ── SEGURIDAD ────────────────────────────────────────────────────────────────────────────────

describe("seguridad", () => {
  const s = sinComentarios(server);

  test("el token push se guarda CIFRADO, nunca en claro", () => {
    assert.match(s, /secCifrar\(pushToken, LLAVERO, DOMINIOS\.WALLET\)/);
    assert.match(s, /if \(!LLAVERO\.puedeCifrar\) return res\.status\(503\)\.end\(\);/);
    assert.match(esquema, /push_token_enc TEXT/);
    assert.ok(!/push_token TEXT(?!_enc)/.test(esquema), "hay una columna de token en claro");
  });

  test("el `authenticationToken` también, y es distinto del token del carné", () => {
    assert.match(s, /secCifrar\(token, LLAVERO, DOMINIOS\.WALLET\)/);
    assert.match(s, /crypto\.randomBytes\(32\)\.toString\("base64url"\)/);
    assert.match(esquema, /auth_token_enc TEXT NOT NULL/);
  });

  test("NO se registra la URL completa: dentro va el serial", () => {
    const i = s.indexOf("EL SERVICIO WEB DE PASSKIT");
    const bloque = s.slice(i, s.indexOf("CONSTRUIR Y FIRMAR EL", i));
    assert.ok(!/console\.(log|warn|error)\([^)]*req\.(url|originalUrl|path)/.test(bloque));
    assert.ok(!/console\.(log|warn|error)\([^)]*serial/.test(bloque));
    assert.ok(!/console\.(log|warn|error)\([^)]*pushToken/.test(bloque));
  });

  test("la auditoría no lleva ni serial ni dispositivo entero", () => {
    const i = s.indexOf('"pase_registrado"');
    const bloque = s.slice(i - 200, i + 300);
    assert.match(bloque, /dispositivo_huella/);
    assert.ok(!/detalle: \{ serial/.test(bloque));
  });

  test("el diagnóstico del panel NO enseña ningún secreto", () => {
    const i = s.indexOf('app.get("/api/wallet/dinamico"');
    const bloque = s.slice(i, s.indexOf('app.post("/api/wallet/dinamico/puerta"', i));
    // El certificado SÍ se lee aquí —hay que abrirlo para saber cuándo caduca—, así que lo que se
    // comprueba es LO QUE SALE: el objeto de la respuesta, no el cuerpo entero de la ruta.
    const resp = bloque.slice(bloque.indexOf("res.json({"), bloque.indexOf("} catch"));
    for (const malo of ["p12_b64", "p12_pass", "auth_token_enc", "push_token_enc",
                        "serialNumber", "telefono", "push_huella", "auth_huella"]) {
      assert.ok(!resp.includes(malo), `el diagnóstico expone «${malo}»`);
    }
    // Sí enseña la caducidad, que es lo que hay que vigilar.
    assert.match(bloque, /caduca_en: info\.caduca_en/);
    // Y lo que se manda del certificado son tres escalares, nunca el material.
    assert.match(bloque, /cert = \{ caduca_en: [^;]*caducado: [^;]*dias,/);
  });

  test("administrar es SOLO de Dirección", () => {
    for (const r of ["/api/wallet/dinamico", "/api/wallet/dinamico/puerta",
                     "/api/wallet/dinamico/interruptores", "/api/wallet/dinamico/reintentar"]) {
      const i = s.indexOf(`"${r}"`);
      assert.ok(i > 0, `falta ${r}`);
      assert.match(s.slice(i, i + 90), /requireAuth\(\["direccion"\]\)/, r);
    }
  });

  test("el entorno de APNs se elige entre dos, no se escribe", () => {
    assert.match(s, /if \(!APNS_ENTORNOS\.includes\(String\(b\.entorno_apns\)\)\)/);
    assert.ok(!/entorno_apns.*https?:\/\//.test(s), "se acepta una URL a mano");
  });

  test("no hay ningún certificado ni clave en el repositorio", () => {
    // Los que existen son de PRUEBA, generados al vuelo dentro de los propios tests.
    assert.ok(!/BEGIN (RSA |EC )?PRIVATE KEY/.test(server));
    assert.ok(!/BEGIN CERTIFICATE/.test(server));
  });

  test("el token de Ágora no se toca desde aquí", () => {
    const i = s.indexOf("EL SERVICIO WEB DE PASSKIT");
    const bloque = s.slice(i, s.indexOf("CONSTRUIR Y FIRMAR EL", i));
    assert.ok(!/agora|AGORA/i.test(bloque));
  });
});

// ── GOOGLE WALLET NO SE TOCA ─────────────────────────────────────────────────────────────────

describe("Google Wallet queda fuera", () => {
  const google = readFileSync(new URL("../src/modules/wallet/google.js", import.meta.url), "utf8");
  const s = sinComentarios(server);

  test("`google.js` no sabe nada del servicio dinámico", () => {
    for (const malo of ["webServiceURL", "authenticationToken", "wallet_pases", "wallet_registros",
                        "APNs", "apns", "etiqueta", "marcarPaseActualizado"]) {
      assert.ok(!google.includes(malo), `google.js menciona «${malo}»`);
    }
  });

  test("su ruta sigue exactamente como estaba", () => {
    assert.match(s, /app\.get\("\/api\/wallet\/google\/:token"/);
    const i = s.indexOf('app.get("/api/wallet/google/:token"');
    // Hasta el `});` QUE CIERRA ESA RUTA. Un corte por número de caracteres —o hasta el siguiente
    // `app.`— se metía en el código nuevo de Apple y daba un falso positivo con funciones que no
    // son suyas.
    const bloque = s.slice(i, s.indexOf("\n});", i) + 4);
    assert.match(bloque, /res\.redirect\(302, url\)/);
    assert.match(bloque, /UPDATE pro_qr SET wallet_google_en = \?/);
    // Y NO pasa por nada del wallet dinámico.
    for (const malo of ["walInterruptores", "walProyeccion", "walConstruirPase", "wallet_pases"]) {
      assert.ok(!bloque.includes(malo), `la ruta de Google usa «${malo}»`);
    }
  });

  test("los botones de Google siguen pintándose igual", () => {
    const tj = readFileSync(new URL("../public/tarjeta.js", import.meta.url), "utf8");
    assert.match(tj, /Guardar en Google Wallet/);
    assert.match(tj, /\/api\/wallet\/google\//);
  });
});

// ── LOS PASES YA INSTALADOS ──────────────────────────────────────────────────────────────────

describe("quien ya tiene el pase", () => {
  const s = sinComentarios(server);

  test("«descargado» y «registrado» son DOS COSAS DISTINTAS", () => {
    assert.match(s, /descargado: !!qr\.wallet_apple_en/);
    assert.match(s, /registrado: !!registrado/);
  });

  test("y `wallet_apple_en` no se reescribe nunca hacia atrás", () => {
    assert.match(s, /UPDATE pro_qr SET wallet_apple_en = \? WHERE id = \? AND wallet_apple_en IS NULL/);
  });

  test("el aviso solo sale a quien de verdad le hace falta", () => {
    assert.match(s, /volver_a_anadir: !!qr\.wallet_apple_en && !registrado && !!sw\.wallet_registros/);
  });

  test("la tarjeta web lo enseña discreto, sin mandar nada a nadie", () => {
    const tj = readFileSync(new URL("../public/tarjeta.js", import.meta.url), "utf8");
    const i = tj.indexOf("function pintarAvisoPase(pase)");
    assert.ok(i > 0, "falta la función del aviso");
    const fn = tj.slice(i, tj.indexOf("\n  function ", i + 10));
    assert.match(fn, /vuelve a añadirla/);
    // NO manda nada: ni una petición, ni un mensaje. Solo pinta. (El fichero sí nombra WhatsApp en
    // otro sitio, en un texto de error que ya estaba: por eso se mira la función, no el fichero.)
    assert.ok(!/apiSend|fetch\(|whatsapp/i.test(fn), "el aviso manda algo");
  });

  test("la respuesta de la tarjeta no repite claves", () => {
    // `estado` y `wallet` ya existían: repetirlas habría dejado la tarjeta sin saber si vale.
    const i = s.indexOf("res.json({\n      ok: true,\n      vale: info.canjeable,");
    const bloque = s.slice(i, s.indexOf("    });", i));
    const claves = [...bloque.matchAll(/^      ([a-z_]+):/gm)].map((m) => m[1]);
    assert.equal(new Set(claves).size, claves.length, `repetidas en: ${claves.join(", ")}`);
    assert.ok(claves.includes("resumen") && claves.includes("pase"));
  });
});

// ── EL PANEL ─────────────────────────────────────────────────────────────────────────────────

describe("el panel", () => {
  test("distingue descargado de registrado", () => {
    assert.match(panel, /Pases descargados alguna vez/);
    assert.match(panel, /NO significa que se actualicen/);
    assert.match(panel, /Registros activos/);
  });

  test("avisa de la caducidad del certificado sin enseñarlo", () => {
    assert.match(panel, /caduca en \$\{Number\(ce\.dias\)\} día\(s\)/);
    // Se mira LA TARJETA DE DIAGNÓSTICO, no el panel entero: la pantalla de configurar Apple
    // Wallet sí sube el `.p12`, y eso es lo que tiene que hacer.
    const i = panel.indexOf("function renderWalletDinamico()");
    const fn = panel.slice(i, panel.indexOf("\nfunction promoTarjeta()", i));
    assert.ok(!/p12_b64|p12_pass|auth_token|push_token/.test(fn), "el diagnóstico toca un secreto");
  });

  test("pide su propia confirmación y dice qué NO enciende", () => {
    assert.match(panel, /Escribe ACTIVAR WALLET para confirmar/);
    assert.match(panel, /NO enciende los puntos ni las promociones/);
  });

  test("los mensajes visibles salen como pendientes, no como interruptor", () => {
    assert.match(panel, /Todavía <b>no implementados<\/b>/);
  });

  test("el `select` del entorno se escucha por `change`, no por clic", () => {
    // Elegir con el teclado no genera ningún clic: sin esto, el entorno no se podría cambiar.
    assert.match(panel, /document\.addEventListener\("change", \(e\) => \{[\s\S]{0,200}select\[data-act\]/);
    assert.match(panel, /if \(t\.tagName === "SELECT"\) return;/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
//  REVISIÓN FINAL
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ── 1 · UNA SOLA FUENTE DE VERDAD PARA LA CONTRASEÑA ─────────────────────────────────────────

describe("la contraseña del certificado sale de un solo sitio", () => {
  const s = sinComentarios(server);
  const f = sinComentarios(firma);

  test("`PKPASS_PW` NUNCA SE LEE del entorno: solo se escribe", () => {
    // Es el NOMBRE del canal por el que se le entrega la contraseña al hijo de `openssl`, no un
    // secreto guardado. Si alguien lo leyera, habría dos fuentes de verdad.
    for (const [donde, txt] of [["server.js", s], ["firma.js", f]]) {
      assert.ok(!/process\.env\.PKPASS_PW/.test(txt), `${donde} LEE PKPASS_PW del entorno`);
      assert.ok(!/env\[["']PKPASS_PW/.test(txt), `${donde} LEE PKPASS_PW del entorno`);
    }
  });

  test("y el valor viene de `wallet_config`, descifrado con DATA_ENC_KEY", () => {
    assert.match(s, /leerSecreto\(fila\.datos_enc, DOMINIOS\.WALLET, "wallet_config"\)/);
    const i = s.indexOf("async function walCertificado(cfg)");
    const fn = s.slice(i, s.indexOf("\n}", i));
    assert.match(fn, /PKPASS_PW: cfg\.p12_pass \|\| ""/);
    assert.match(fn, /Buffer\.from\(cfg\.p12_b64, "base64"\)/);
    assert.ok(!/process\.env\.[A-Z_]*P12|process\.env\.[A-Z_]*PASS/.test(fn),
      "el certificado o su contraseña salen del entorno");
  });

  test("la contraseña NUNCA va en la línea de órdenes", () => {
    // `-passin pass:<clave>` la deja en los argumentos del proceso, a la vista de cualquier `ps`.
    for (const [donde, txt] of [["server.js", s], ["firma.js", f]]) {
      assert.ok(!/-passin", *"pass:/.test(txt), `${donde} pasa la contraseña visible`);
      assert.ok(!/"pass:\$\{/.test(txt), `${donde} pasa la contraseña visible`);
    }
  });

  test("no se lee ningún secreto nuevo del entorno", () => {
    const usados = [...s.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]);
    for (const k of ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_AUTH_KEY_P8", "APNS_P8", "PKPASS_PW"]) {
      assert.ok(!usados.includes(k), `se lee un secreto nuevo: ${k}`);
    }
  });
});

// ── 2 · EL CONTRATO DE LAS CINCO RUTAS ───────────────────────────────────────────────────────
//
// Los códigos son los que Apple documenta, citados literalmente:
//
//   «If the serial number is already registered for this device, return HTTP status 200.
//    If registration succeeds, return HTTP status 201.
//    If the request is not authorized, return HTTP status 401.»
//   «If there are matching passes, return HTTP status 200… If there are no matching passes,
//    return HTTP status 204.»
//   «If disassociation succeeds, return HTTP status 200.»
//   «Your server returns the pass data or the HTTP status 304 Not Modified if the pass hasn't
//    changed. Support the If-Modified-Since caching mechanism on this endpoint.»

describe("el contrato de PassKit, contrastado con la documentación", () => {
  const s = sinComentarios(server);
  const trozo = (a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));

  test("ALTA · POST, 201 nueva / 200 repetida / 401", () => {
    const r = trozo('app.post("/api/wallet/apple/v1/devices',
                    'app.get("/api/wallet/apple/v1/devices');
    assert.match(r, /if \(ya && ya\.activo\) return res\.status\(200\)\.end\(\);/);
    assert.match(r, /res\.status\(201\)\.end\(\);/);
    assert.match(r, /return wal401\(res\);/);
    assert.match(r, /pkLeerAlta\(req\.body\)/);
    // El 400 por cuerpo inválido es NUESTRO: la especificación de Apple no lo menciona.
    assert.match(r, /return res\.status\(400\)\.end\(\);/);
  });

  test("SERIALES · GET, 200 con lista / 204 sin ella, y SIN token", () => {
    const r = trozo('app.get("/api/wallet/apple/v1/devices',
                    'app.delete("/api/wallet/apple/v1/devices');
    assert.match(r, /passesUpdatedSince/);
    assert.match(r, /res\.status\(204\)\.end\(\)/);
    assert.match(r, /res\.status\(200\)\.json\(r\.cuerpo\)/);
    assert.ok(!r.includes("walAutorizar"), "pide un token que la especificación dice que no hay");
    const c = respuestaSeriales([{ serial: "A", etiqueta: 5 }]).cuerpo;
    assert.deepEqual(Object.keys(c).sort(), ["lastUpdated", "serialNumbers"]);
    assert.equal(typeof c.lastUpdated, "string");
    assert.ok(Array.isArray(c.serialNumbers));
  });

  test("BAJA · DELETE, 200 / 401", () => {
    const r = trozo('app.delete("/api/wallet/apple/v1/devices',
                    'app.get("/api/wallet/apple/v1/passes');
    assert.match(r, /res\.status\(200\)\.end\(\);/);
    assert.match(r, /return wal401\(res\);/);
  });

  test("PASE · GET, 200 con el MIME de Apple / 304 / 401", () => {
    const r = trozo('app.get("/api/wallet/apple/v1/passes',
                    'app.post("/api/wallet/apple/v1/log');
    assert.match(r, /application\/vnd\.apple\.pkpass/);
    assert.match(r, /return res\.status\(304\)\.end\(\);/);
    assert.match(r, /if-modified-since/);
    assert.match(r, /Last-Modified/);
    assert.match(r, /return wal401\(res\);/);
  });

  test("LOG · POST, 200 siempre", () => {
    const r = s.slice(s.indexOf('app.post("/api/wallet/apple/v1/log'));
    assert.match(r.slice(0, 600), /res\.status\(200\)\.end\(\);/);
    assert.match(r.slice(0, 600), /pkLogs\(req\.body\)/);
  });

  test("`webServiceURL` + `/v1/…` da la ruta REAL, o iOS llamaría a un 404", () => {
    assert.match(s, /servicio = \{ url: `\$\{url\}\/api\/wallet\/apple`, token \}/);
    assert.ok(s.includes('app.post("/api/wallet/apple/v1/devices'));
  });
});

// ── 3 · SEGURIDAD ────────────────────────────────────────────────────────────────────────────

describe("seguridad, repaso final", () => {
  const s = sinComentarios(server);

  test("un token de OTRO pase no autoriza este serial", () => {
    const i = s.indexOf("async function walAutorizar(");
    const fn = s.slice(i, s.indexOf("\n}", i));
    assert.match(fn, /WHERE token = \? AND clase = 'carnet'/);
    assert.match(fn, /const esperado = pase \? walTokenClaro\(pase\) : null;/);
    assert.match(fn, /pkIgual\(esperado \|\| señuelo, enviado\)/);
    assert.match(fn, /return esperado \? \{ qr, pase \} : null;/);
  });

  test("un Pass Type ID ajeno se rechaza", () => {
    const i = s.indexOf("async function walAutorizar(");
    assert.match(s.slice(i, s.indexOf("\n}", i)), /pkPassType\(passTypeId, cfg\?\.pass_type_id\)/);
    assert.equal(passTypeValido("pass.com.otra.cosa", "pass.com.la-tapeta.clientes"), false);
  });

  test("un serial con forma rara ni llega a la base", () => {
    const inyeccion = "';" + " DELETE FROM x";
    for (const malo of ["../../etc/passwd", "a b", inyeccion, "x".repeat(200), "", "%00"]) {
      assert.equal(serialValido(malo), false, `pasó «${malo}»`);
    }
  });

  test("NI UN SECRETO en ninguna respuesta administrativa", () => {
    // Solo las CUATRO rutas de Dirección, no lo que venga después: un corte largo arrastraba
    // otras rutas y daba falsos positivos.
    const i = s.indexOf('app.get("/api/wallet/dinamico"');
    const j = s.indexOf('app.post("/api/wallet/dinamico/reintentar"');
    const bloque = s.slice(i, s.indexOf("\n});", j) + 4);
    const respuestas = [...bloque.matchAll(/res\.json\(\{[\s\S]*?\}\);/g)].map((m) => m[0]).join("\n");
    // Los VALORES sensibles. `wallet_dispositivos` es el nombre de una tabla dentro de un
    // `COUNT(*)`: contar cuántos hay no es enseñar ninguno, así que se buscan los campos.
    for (const malo of ["auth_token_enc", "push_token_enc", "push_huella", "auth_huella",
                        "p12_b64", "p12_pass", "telefono:", "serialNumber",
                        "d.dispositivo", "r.dispositivo", "qr.token"]) {
      assert.ok(!respuestas.includes(malo), `una respuesta de admin expone «${malo}»`);
    }
    // Lo que sí sale son contadores y estados.
    assert.match(respuestas, /contadores: \{/);
    assert.match(respuestas, /dispositivos: await c\(`SELECT COUNT/);
  });

  test("ni en la auditoría", () => {
    const a = [...s.matchAll(/ficAuditar\("wallet"[\s\S]{0,260}?\)\)?;/g)].map((m) => m[0]).join("\n");
    assert.ok(a.length > 0, "no hay auditoría de wallet");
    for (const malo of ["pushToken", "push_token", "serial", "telefono"]) {
      assert.ok(!a.includes(malo), `la auditoría lleva «${malo}»`);
    }
    assert.match(a, /dispositivo_huella/, "el dispositivo va como huella, no entero");
  });

  test("ni en ningún `console` de las rutas de PassKit", () => {
    const i = s.indexOf("EL SERVICIO WEB DE PASSKIT");
    const bloque = s.slice(i, s.indexOf("CONSTRUIR Y FIRMAR EL", i));
    for (const linea of bloque.match(/console\.\w+\([^\n]*/g) || []) {
      for (const malo of ["req.params", "serial", "dispositivo", "pushToken", "authorization"]) {
        assert.ok(!linea.includes(malo), `un console lleva «${malo}»: ${linea}`);
      }
    }
  });

  test("el pushToken está cifrado en reposo y se borra al invalidarse", () => {
    assert.match(s, /secCifrar\(pushToken, LLAVERO, DOMINIOS\.WALLET\)/);
    assert.match(s, /push_token_enc = NULL/);
    assert.ok(!/push_token[^_]/.test(sinComentarios(esquema)), "hay una columna sin cifrar");
  });

  test("el authenticationToken sigue separado de la identidad del carné", () => {
    const i = s.indexOf("async function walPaseDe(");
    const fn = s.slice(i, s.indexOf("\n}", i));
    assert.match(fn, /crypto\.randomBytes\(32\)/);
    assert.ok(!/qr\.token|qr\.codigo/.test(fn), "se deriva de la identidad del carné");
  });
});

// ── 4 · APNs: LA MATRIZ DE ERRORES ───────────────────────────────────────────────────────────

describe("APNs, matriz completa", () => {
  const casos = [
    [200, "", "hecho", "entregado a APNs"],
    [400, '{"reason":"BadDeviceToken"}', "invalidar", "el token no vale"],
    [400, '{"reason":"DeviceTokenNotForTopic"}', "config", "es el entorno o el certificado, no el token"],
    [400, '{"reason":"BadTopic"}', "config", "determinista: reintentar da lo mismo"],
    [400, '{"reason":"PayloadEmpty"}', "config", "determinista: reintentar da lo mismo"],
    [403, '{"reason":"InvalidProviderToken"}', "config", "es el certificado, no el dispositivo"],
    [410, '{"reason":"Unregistered"}', "invalidar", "el pase ya no está en ese móvil"],
    [429, '{"reason":"TooManyRequests"}', "reintentar", "transitorio"],
    [500, '{"reason":"InternalServerError"}', "reintentar", "transitorio"],
    [503, '{"reason":"ServiceUnavailable"}', "reintentar", "transitorio"],
  ];
  for (const [estado, cuerpo, accion, porque] of casos) {
    test(`${estado} → ${accion} (${porque})`, () => {
      assert.equal(clasificar(estado, cuerpo).accion, accion);
    });
  }

  test("SOLO DOS motivos invalidan un dispositivo. Ninguno más", () => {
    const invalidan = casos.filter(([, , a]) => a === "invalidar").map(([e, c]) => `${e}:${c}`);
    assert.deepEqual(invalidan, [
      '400:{"reason":"BadDeviceToken"}',
      '410:{"reason":"Unregistered"}',
    ]);
  });

  test("los transitorios se reintentan con LÍMITE", () => {
    assert.equal(MAX_INTENTOS, 4);
    const s = sinComentarios(server);
    assert.match(s, /if \(reintentar && aviso\.intentos \+ 1 < APNS_MAX_INTENTOS\)/);
    assert.match(s, /entregados \? "enviado" : "fallido"/);
  });

  test("un 403 NO se reintenta: reintentar no arregla un certificado", () => {
    assert.equal(clasificar(403, "{}").accion, "config");
    const s = sinComentarios(server);
    const i = s.indexOf("for (const r of resultados)");
    assert.ok(!/accion === "config"[\s\S]{0,80}reintentar = true/.test(s.slice(i, i + 900)));
  });

  test("EL ENDPOINT, EL TOPIC, LA RUTA Y EL CUERPO", async () => {
    const visto = [];
    let urlPedida = null, opcionesPedidas = null;
    const conectar = (url, opciones) => {
      urlPedida = url; opcionesPedidas = opciones;
      const sesion = {
        once(ev, fn) { if (ev === "connect") setImmediate(fn); return sesion; },
        request(cab) {
          const req = {
            on(ev, fn) {
              if (ev === "response") setImmediate(() => fn({ ":status": 200 }));
              if (ev === "end") setImmediate(fn);
              return req;
            },
            setTimeout() { return req; }, end(c) { visto.push({ cab, cuerpo: c }); }, close() {},
          };
          return req;
        },
        close() {},
      };
      return sesion;
    };
    await avisar({ tokens: ["a1b2"], passTypeId: "pass.com.la-tapeta.clientes",
      entorno: "produccion", cert: "CERT-PEM", clave: "KEY-PEM", conectar });
    assert.equal(urlPedida, "https://api.push.apple.com:443");
    assert.equal(opcionesPedidas.cert, "CERT-PEM");
    assert.equal(opcionesPedidas.key, "KEY-PEM");
    assert.equal(visto[0].cab[":path"], "/3/device/a1b2");
    assert.equal(visto[0].cab["apns-topic"], "pass.com.la-tapeta.clientes");
    assert.equal(visto[0].cuerpo, "{}");

    await avisar({ tokens: ["a1b2"], passTypeId: "x", entorno: "sandbox",
      cert: "C", clave: "K", conectar });
    assert.equal(urlPedida, "https://api.sandbox.push.apple.com:443",
      "producción y pruebas NO se mezclan");
  });

  test("NINGÚN TEST SALE A INTERNET", () => {
    const t = readFileSync(new URL("./wallet-dinamico.test.js", import.meta.url), "utf8");
    const llamadas = [...t.matchAll(/avisar\(\{[\s\S]{0,400}?\}\)/g)].map((m) => m[0]);
    assert.ok(llamadas.length >= 3, `solo ${llamadas.length} llamadas`);
    for (const l of llamadas) {
      assert.ok(l.includes("conectar"), `una llamada sin servidor simulado: ${l.slice(0, 70)}`);
    }
  });
});

// ── 5 · LA FIRMA ─────────────────────────────────────────────────────────────────────────────

describe("la firma, candado explícito", () => {
  const OPCION = "-" + "noattr";

  test("esa opción NO SE PASA a ningún `openssl` de firma.js", () => {
    // Quitaba `signingTime`. OpenSSL verificaba la firma igual y Wallet la rechazaba con
    // «Signature must contain a signing date».
    //
    // Se busca ENTRECOMILLADA, que es como llegaría a `execFileSync`. El fichero SÍ la nombra en
    // los comentarios que explican por qué no se usa, y eso es exactamente lo que se quiere: el
    // día que alguien piense en ponerla, lee ahí por qué no.
    assert.ok(!firma.includes(`"${OPCION}"`), `ha vuelto «${OPCION}» a un comando de firma.js`);
    assert.ok(!firma.includes(`'${OPCION}'`), `ha vuelto «${OPCION}» a un comando de firma.js`);
    // Y la explicación sigue ahí, para que no se vuelva a intentar.
    assert.match(firma, /signingTime/, "se ha borrado la explicación de por qué no se usa");
  });

  test("ni se pasa en NINGÚN otro comando del proyecto", () => {
    for (const [donde, txt] of [
      ["server.js", server],
      ["pkpass.js", readFileSync(new URL("../src/modules/wallet/pkpass.js", import.meta.url), "utf8")],
      ["apns.js", readFileSync(new URL("../src/modules/wallet/apns.js", import.meta.url), "utf8")],
    ]) {
      assert.ok(!txt.includes(`"${OPCION}"`), `«${OPCION}» se pasa en ${donde}`);
      assert.ok(!txt.includes(`'${OPCION}'`), `«${OPCION}» se pasa en ${donde}`);
    }
  });

  test("la firma sigue siendo detached, DER y con atributos firmados", () => {
    const f = sinComentarios(firma);
    assert.match(f, /"smime", "-sign", "-binary"/, "detached sobre el manifest");
    assert.match(f, /"-outform", "DER"/);
    assert.match(f, /"-signer", rCert/);
    assert.match(f, /"-inkey", rClave/);
    assert.match(f, /"-certfile", rWwdr/);
    const i = f.indexOf('"smime", "-sign"');
    for (const malo of [OPCION, "-nosmimecap", "-noverify"]) {
      assert.ok(!f.slice(i, i + 400).includes(malo), `la firma usa ${malo}`);
    }
  });

  test("`inline` se conserva — pero NO fue lo que arregló el fallo", () => {
    // El fallo era `signingTime`. `inline` es correcto por otro motivo: con `attachment`, Safari
    // en iOS manda la respuesta a su gestor de descargas en vez de ofrecerla a Wallet.
    assert.match(sinComentarios(server), /Content-Disposition", `inline; filename=/);
  });
});

// ── 6 · DESPUÉS DEL COMMIT ───────────────────────────────────────────────────────────────────

describe("el trabajo posterior al COMMIT", () => {
  const s = sinComentarios(server);
  const i = s.indexOf("async function marcarPaseActualizado(");
  const fn = s.slice(i, s.indexOf("\n}", i));

  test("captura CUALQUIER fallo por dentro y no lanza nunca", () => {
    assert.match(fn, /^async function marcarPaseActualizado\(qrId, motivo\) \{\s*\n\s*try \{/);
    assert.match(fn, /catch \(e\) \{/);
    assert.ok(!/\bthrow\b/.test(fn), "puede lanzar");
    assert.match(fn, /return \{ ok: false, motivo: "error" \};/);
  });

  test("el error que registra va SANEADO, y sin nada del carné", () => {
    assert.match(fn, /console\.error\(lineaErrorSql\("\[wallet\] marcar", e\)\)/);
    for (const linea of fn.match(/console\.\w+\([^\n]*/g) || []) {
      for (const malo of ["qr.token", "serial", "proyeccion"]) {
        assert.ok(!linea.includes(malo), `el log lleva «${malo}»: ${linea}`);
      }
    }
  });

  test("SÍ abre su propia transacción, y no toca la de la operación principal", () => {
    // Las dos escrituras —huella y aviso— tienen que ser atómicas. Pero es una transacción
    // NUEVA, abierta después del COMMIT de la factura: nada de lo que pase aquí puede deshacerla.
    assert.match(fn, /return await walTransaccion\(\(x\) =>/);
    assert.ok(!/fidTransaccion/.test(fn), "reutiliza la transacción de fidelización");
    assert.ok(!/ROLLBACK/.test(fn));
    assert.match(s, /const walTransaccion = fidCrearTransaccion\(\{ pool, toPositional \}\);/);
  });

  test("se llama SIN `await` en cada enganche", () => {
    assert.match(s, /marcarPaseActualizado\(id, "factura"\)\.catch\(\(\) => \{\}\);/);
    assert.match(s, /marcarPaseActualizado\(qrId, "derecho"\)\.catch\(\(\) => \{\}\);/);
    assert.match(s, /walRefrescarPorPromo\(p\.clave, "promo_" \+ hacia\)\.catch\(\(\) => \{\}\);/);
  });

  test("SI EL PROCESO MUERE ENTRE LAS DOS ESCRITURAS, se deshacen las dos", () => {
    // Antes eran dos `dbRun` sueltos y esto era un agujero: la huella quedaba actualizada sin
    // aviso, el reconciliador no veía diferencia y el pase se quedaba viejo sin que nadie lo
    // supiera. Ahora van en una transacción. La demostración con rollback real está en
    // `wallet-aviso-transaccion.test.js`.
    assert.match(fn, /return await walTransaccion\(\(x\) =>\s*\n?\s*walAplicarCambio\(x, \{/);
    assert.ok(!/dbRun\(`UPDATE wallet_pases/.test(fn), "queda un UPDATE suelto");
    assert.ok(!/dbRun\(\s*`INSERT INTO wallet_avisos/.test(fn), "queda un INSERT suelto");
    // La proyección se calcula FUERA: son una docena de lecturas y no pueden tener bloqueada la
    // fila del pase todo ese rato.
    const iProy = fn.indexOf("const { proyeccion }");
    const iTx = fn.indexOf("walTransaccion");
    assert.ok(iProy > 0 && iTx > iProy, "la proyección se calcula dentro de la transacción");
  });

  test("un reintento no duplica movimientos, usos ni derechos", () => {
    assert.ok(!/fid_movimientos|fid_promo_usos|fid_promo_derechos/.test(fn));
    const m = readFileSync(new URL("../src/modules/wallet/aviso.js", import.meta.url), "utf8");
    assert.ok(!/fid_movimientos|fid_promo_usos|fid_promo_derechos/.test(m));
  });
});

// ── 7 · LA POLÍTICA DICE EXACTAMENTE LO QUE HACEMOS ──────────────────────────────────────────

describe("la política v2, ni más ni menos", () => {
  const CA = readFileSync(new URL("../public/privacitat.html", import.meta.url), "utf8");
  const ES = readFileSync(new URL("../public/privacidad.html", import.meta.url), "utf8");
  const seccion = (t, id) => {
    const i = t.indexOf(`<h2 id="${id}">`);
    return t.slice(i, t.indexOf("<h2 ", i + 10)).replace(/\s+/g, " ");
  };

  test("nombra las DOS cosas que de verdad se guardan", () => {
    assert.match(seccion(CA, "wallet"), /identificador tècnic del dispositiu/i);
    assert.match(seccion(CA, "wallet"), /testimoni de notificacions/i);
    assert.match(seccion(ES, "wallet"), /identificador técnico del dispositivo/i);
    assert.match(seccion(ES, "wallet"), /testigo de notificaciones/i);
  });

  test("dice que solo sirven para mantener el carné al día", () => {
    assert.match(seccion(CA, "wallet"), /només serveixen per mantenir el carnet actualitzat/i);
    assert.match(seccion(ES, "wallet"), /solo sirven para mantener el carné actualizado/i);
  });

  test("NO menciona ubicación, seguimiento ni usos que no existen", () => {
    for (const [idioma, txt] of [["catalán", seccion(CA, "wallet")],
                                 ["castellano", seccion(ES, "wallet")]]) {
      for (const malo of [/ubicaci/i, /localitzaci/i, /geolocal/i, /seguiment/i, /seguimiento/i,
                          /publicitari/i, /publicidad/i, /perfil/i, /analítica/i, /analítiqu/i,
                          /tercers/i, /terceros/i, /venem/i, /vendemos/i, /marketing/i]) {
        assert.ok(!malo.test(txt), `la sección en ${idioma} menciona ${malo}`);
      }
    }
  });

  test("dice hasta cuándo se conserva y cuándo se borra", () => {
    assert.match(seccion(CA, "wallet"), /mentre el carnet estigui registrat/i);
    assert.match(seccion(CA, "wallet"), /s'elimina o s'invalida/i);
    assert.match(seccion(ES, "wallet"), /mientras el carné siga registrado/i);
    assert.match(seccion(ES, "wallet"), /se elimina o se invalida/i);
  });

  test("y que quitar el pase NO da de baja el carné", () => {
    assert.match(seccion(CA, "wallet"), /no dona de baixa el teu carnet/i);
    assert.match(seccion(ES, "wallet"), /no da de baja tu carné/i);
  });

  test("las dos versiones dicen LO MISMO: mismos párrafos y mismas negritas", () => {
    const ca = seccion(CA, "wallet"), es = seccion(ES, "wallet");
    assert.equal((ca.match(/<p>/g) || []).length, (es.match(/<p>/g) || []).length);
    assert.equal((ca.match(/<b>/g) || []).length, (es.match(/<b>/g) || []).length);
  });
});

// ── 8 · LO QUE NO SE HA TOCADO ───────────────────────────────────────────────────────────────

describe("inventario de lo intocable", () => {
  const s = sinComentarios(server);
  const w = readFileSync(new URL("../src/modules/wallet/wallet.js", import.meta.url), "utf8");

  test("el Pass Type ID y el Team ID salen de la CONFIGURACIÓN, no del código", () => {
    assert.ok(!s.includes("pass.com.la-tapeta.clientes"), "el Pass Type ID está en el código");
    assert.ok(!s.includes("4252TFWL5T"), "el Team ID está en el código");
    assert.match(w, /passTypeIdentifier: cfg\.pass_type_id/);
    assert.match(w, /teamIdentifier: cfg\.team_id/);
  });

  test("el QR lo compone `urlTarjeta()` y NADIE MÁS", () => {
    assert.match(w, /message: urlTarjeta\(base, qr\.token\)/);
    for (const [donde, txt] of [
      ["proyeccion.js", readFileSync(new URL("../src/modules/tarjeta/proyeccion.js", import.meta.url), "utf8")],
      ["passkit.js", readFileSync(new URL("../src/modules/wallet/passkit.js", import.meta.url), "utf8")],
      ["apns.js", readFileSync(new URL("../src/modules/wallet/apns.js", import.meta.url), "utf8")],
    ]) assert.ok(!txt.includes("tarjeta.html?t="), `${donde} compone la URL del QR por su cuenta`);
  });

  test("`serialNumber` sigue siendo `pro_qr.token`", () => {
    assert.match(w, /serialNumber: String\(qr\.token\)/);
  });

  test("las seis imágenes siguen siendo seis", () => {
    assert.match(s, /\["icon\.png", "icon@2x\.png", "icon@3x\.png",\s*\n?\s*"logo\.png", "logo@2x\.png", "logo@3x\.png"\]/);
  });

  test("`tarjeta_activa` es el interruptor de arriba", () => {
    assert.match(s, /if \(!TARJETA_ACTIVA\) return \{ \.\.\.WAL_APAGADOS \};/);
  });

  test("puntos, promociones y wallet siguen naciendo apagados", () => {
    assert.match(s, /FID_SW_DEFECTO = Object\.freeze\(\{ sombra: true, conceder: false, ofrecer: false, consumir: false \}\)/);
    assert.match(sinComentarios(esquema),
      /INSERT INTO wallet_puerta \(id, estado, actualizado_en\) VALUES \(1, 'apagado', \?\)/);
    const fid = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
    assert.match(fid, /VALUES \(1, 'no_preparado', \?\)/);
    assert.match(fid, /VALUES \(1, 'apagado', \?\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
//  CORRECCIONES FINALES
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ── 1 · EL RECONCILIADOR ─────────────────────────────────────────────────────────────────────
//
// `marcarPaseActualizado` corre después del COMMIT y sin `await`. Si el proceso muere entre el
// COMMIT y esa escritura, ese aviso SE PIERDE — y no se recupera solo: no está demostrado que
// Wallet pregunte por su cuenta sin haber recibido antes un aviso.
//
// El reconciliador es lo que convierte esa pérdida en un RETRASO.

describe("el reconciliador", () => {
  const s = sinComentarios(server);
  const i = s.indexOf("async function walReconciliar()");
  const fn = s.slice(i, s.indexOf("\n}", i));

  test("existe y corre periódicamente", () => {
    assert.ok(i > 0, "no hay reconciliador");
    assert.match(s, /setInterval\(\(\) => \{ walReconciliar\(\)\.catch\(\(\) => \{\}\); \}, 5 \* 60 \* 1000\);/);
  });

  test("SOLO mira pases con REGISTRO ACTIVO", () => {
    assert.match(fn, /FROM wallet_registros r\s*\n?\s*WHERE r\.activo/);
    // Nunca recorre `pro_qr` ni la clientela entera.
    assert.ok(!/FROM pro_qr/.test(fn), "recorre carnés que no tienen pase");
    assert.ok(!/FROM cliente_metricas|FROM leads/.test(fn));
  });

  test("va POR LOTES y con CURSOR: no se queda en los primeros para siempre", () => {
    assert.match(fn, /const WAL_LOTE = 100;|LIMIT \?/);
    assert.match(s, /const WAL_LOTE = 100;/);
    assert.match(s, /const WAL_CURSOR = "wal_recon_cursor";/);
    assert.match(fn, /getConfig\(WAL_CURSOR\)/);
    assert.match(fn, /setConfig\(WAL_CURSOR, String\(ultimo\)\)/);
    assert.match(fn, /WHERE r\.activo AND r\.qr_id > \? ORDER BY r\.qr_id LIMIT \?/);
  });

  test("y DA LA VUELTA al llegar al final", () => {
    // Sin esto el cursor se clava en el último y los primeros no se vuelven a mirar nunca — que
    // es justo el fallo del barrido por configuración, y por eso este es otro.
    assert.match(fn, /if \(!filas\.length && desde > 0\)/);
    assert.match(fn, /WHERE r\.activo ORDER BY r\.qr_id LIMIT \?/);
  });

  test("con Wallet dinámico o los avisos apagados NO hace nada", () => {
    assert.match(fn, /if \(!sw\.wallet_registros \|\| !sw\.wallet_avisos\) return \{ mirados: 0, encolados: 0 \};/);
    // Y sale ANTES de consultar nada.
    const iGuard = fn.indexOf("!sw.wallet_registros");
    const iSql = fn.indexOf("dbAll(");
    assert.ok(iGuard > 0 && iSql > iGuard, "consulta antes de comprobar los interruptores");
  });

  test("ES IDEMPOTENTE: reutiliza `marcarPaseActualizado`, no duplica la lógica", () => {
    assert.match(fn, /await marcarPaseActualizado\(f\.qr_id, "reconciliacion"\)/);
    // No recalcula la huella por su cuenta: si lo hiciera, un día las dos versiones divergirían.
    assert.ok(!/huellaVisible/.test(fn), "calcula la huella por su cuenta");
  });

  test("y lo que impide el aviso duplicado es el índice, no una clave que haya que liberar", () => {
    assert.match(sinComentarios(esquema),
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_aviso_pendiente\s*\n?\s*ON wallet_avisos \(qr_id\) WHERE estado = 'pendiente'/);
    const m = readFileSync(new URL("../src/modules/wallet/aviso.js", import.meta.url), "utf8");
    assert.match(m, /ON CONFLICT \(qr_id\) WHERE estado = 'pendiente'/);
  });

  test("NO toca puntos, promociones, Google Wallet ni la identidad del carné", () => {
    for (const malo of ["fid_movimientos", "fid_promo_usos", "fid_promo_derechos", "fid_promos",
                        "wallet_google_en", "pro_qr", "UPDATE pro_"]) {
      assert.ok(!fn.includes(malo), `el reconciliador toca «${malo}»`);
    }
    // Solo escribe en `config` (el cursor) y, a través de `marcarPaseActualizado`, en wallet_*.
    const escrituras = [...fn.matchAll(/(INSERT INTO|UPDATE|DELETE FROM) (\w+)/g)].map((m) => m[2]);
    assert.deepEqual(escrituras, [], "el reconciliador escribe tablas por su cuenta");
  });

  test("no se pisa consigo mismo si un lote tarda más que el intervalo", () => {
    assert.match(s, /let _walReconciliando = false;/);
    assert.match(fn, /if \(_walReconciliando\) return/);
    assert.match(fn, /finally \{ _walReconciliando = false; \}/);
  });

  test("SIMULACIÓN · COMMIT bien → se pierde el aviso → el reconciliador lo detecta → no duplica", () => {
    // Se reproduce la secuencia con la lógica PURA, que es la que decide: la huella guardada
    // contra la proyección actual. La base no hace falta para demostrar el mecanismo.
    const antes = proy();                                    // estado al generar el pase
    let guardada = huellaVisible(antes);                     // lo último notificado/servido
    const cola = new Map();                                  // `clave_idem` → aviso
    const QRID = 7;

    // El mismo algoritmo que `marcarPaseActualizado`, incluida su clave idempotente.
    const marcar = (actual, motivo) => {
      const nueva = huellaVisible(actual);
      if (nueva === guardada) return { cambio: false, encolado: false };
      guardada = nueva;
      const clave = `wal:${QRID}:pendiente`;
      if (cola.has(clave)) return { cambio: true, encolado: false };   // ON CONFLICT DO NOTHING
      cola.set(clave, { motivo });
      return { cambio: true, encolado: true };
    };

    // 1 · El COMMIT va bien: el cliente gana puntos y se lleva un regalo.
    const despues = proy({ saldo: { disponible: 100, proxima_caducidad: "2027-03-31" },
      promosElegibles: [PROMO] });
    assert.notEqual(huellaVisible(despues), guardada, "el estado visible SÍ ha cambiado");

    // 2 · El proceso muere aquí: `marcarPaseActualizado` NO llega a correr.
    assert.equal(cola.size, 0, "no se encoló nada, como es de esperar");
    assert.equal(guardada, huellaVisible(antes), "la huella guardada se queda vieja");

    // 3 · El reconciliador pasa y lo detecta.
    const r1 = marcar(despues, "reconciliacion");
    assert.equal(r1.cambio, true, "el reconciliador tiene que ver la diferencia");
    assert.equal(r1.encolado, true);
    assert.equal(cola.size, 1);

    // 4 · SEGUNDA PASADA sobre lo mismo: no encola otro.
    const r2 = marcar(despues, "reconciliacion");
    assert.equal(r2.cambio, false, "ya no hay diferencia que ver");
    assert.equal(r2.encolado, false);
    assert.equal(cola.size, 1, "se ha duplicado el aviso");

    // 5 · Y si además cambia otra cosa mientras el aviso sigue pendiente, tampoco duplica.
    const otra = proy({ saldo: { disponible: 101, proxima_caducidad: "2027-03-31" },
      promosElegibles: [PROMO] });
    const r3 = marcar(otra, "factura");
    assert.equal(r3.cambio, true);
    assert.equal(r3.encolado, false, "dos cambios seguidos se agrupan en UN aviso");
    assert.equal(cola.size, 1);
  });
});

// ── 2 · LA CLASIFICACIÓN DE APNs, CORREGIDA ──────────────────────────────────────────────────

describe("APNs: invalidar, configurar o reintentar", () => {
  const caso = (estado, razon) => clasificar(estado, razon ? `{"reason":"${razon}"}` : "{}").accion;

  test("SOLO DOS motivos invalidan el token", () => {
    assert.equal(caso(410, "Unregistered"), "invalidar");
    assert.equal(caso(400, "BadDeviceToken"), "invalidar");
  });

  test("`DeviceTokenNotForTopic` NO invalida: es configuración nuestra", () => {
    // Casi siempre significa que estamos hablando con el APNs equivocado —pruebas contra
    // producción— o con el certificado de otro Pass Type ID. Invalidar aquí borraría los tokens
    // BUENOS de toda la clientela por una casilla mal puesta.
    assert.equal(caso(400, "DeviceTokenNotForTopic"), "config");
    assert.notEqual(caso(400, "DeviceTokenNotForTopic"), "invalidar");
    assert.notEqual(caso(400, "DeviceTokenNotForTopic"), "reintentar");
  });

  test("un 403 es configuración y NO se reintenta", () => {
    for (const r of ["ExpiredProviderToken", "InvalidProviderToken", "Forbidden", ""]) {
      assert.equal(caso(403, r), "config", r || "(sin motivo)");
    }
  });

  test("los demás 400 deterministas tampoco se reintentan ni culpan al dispositivo", () => {
    for (const r of ["BadTopic", "PayloadEmpty", "BadPath", "MissingTopic", ""]) {
      assert.equal(caso(400, r), "config", r || "(sin motivo)");
    }
  });

  test("429 y 5xx sí se reintentan", () => {
    for (const e of [429, 500, 502, 503, 504]) assert.equal(caso(e, ""), "reintentar", String(e));
  });

  test("y el desenlace de cada código, de un vistazo", () => {
    assert.deepEqual([
      ["200", caso(200, "")],
      ["400 BadDeviceToken", caso(400, "BadDeviceToken")],
      ["400 DeviceTokenNotForTopic", caso(400, "DeviceTokenNotForTopic")],
      ["400 BadTopic", caso(400, "BadTopic")],
      ["403", caso(403, "")],
      ["410", caso(410, "Unregistered")],
      ["429", caso(429, "")],
      ["503", caso(503, "")],
    ], [
      ["200", "hecho"],
      ["400 BadDeviceToken", "invalidar"],
      ["400 DeviceTokenNotForTopic", "config"],
      ["400 BadTopic", "config"],
      ["403", "config"],
      ["410", "invalidar"],
      ["429", "reintentar"],
      ["503", "reintentar"],
    ]);
  });
});

describe("el worker trata los tres desenlaces por separado", () => {
  const s = sinComentarios(server);
  const i = s.indexOf("async function walVaciarCola()");
  const fn = s.slice(i, s.indexOf("\n}\n", i));

  test("SOLO `invalidar` borra el token y da de baja el registro", () => {
    const iInv = fn.indexOf('r.accion === "invalidar"');
    const iCfg = fn.indexOf('r.accion === "config"');
    assert.ok(iInv > 0 && iCfg > iInv, "faltan las dos ramas");
    const rama = fn.slice(iInv, iCfg);
    assert.match(rama, /push_token_enc = NULL/);
    assert.match(rama, /UPDATE wallet_registros SET activo = FALSE/);
  });

  test("`config` CONSERVA `push_token_enc` Y el registro", () => {
    const iCfg = fn.indexOf('r.accion === "config"');
    const iRet = fn.indexOf('r.accion === "reintentar"');
    assert.ok(iCfg > 0 && iRet > iCfg);
    const rama = fn.slice(iCfg, iRet);
    assert.ok(!rama.includes("push_token_enc"), "la rama de configuración toca el token");
    assert.ok(!rama.includes("wallet_registros"), "la rama de configuración da de baja el registro");
    assert.ok(!rama.includes("invalidado_en"), "la rama de configuración invalida el dispositivo");
    assert.match(rama, /bloqueo = ultimo;/);
  });

  test("y en TODO el worker solo hay UN sitio que borre un token push", () => {
    const veces = [...fn.matchAll(/push_token_enc = NULL/g)].length;
    assert.equal(veces, 1, `hay ${veces} sitios que borran el token`);
    const veces2 = [...fn.matchAll(/UPDATE wallet_registros SET activo = FALSE/g)].length;
    assert.equal(veces2, 1, `hay ${veces2} sitios que dan de baja un registro`);
  });

  test("`config` NO se reintenta: el aviso queda BLOQUEADO", () => {
    assert.match(fn, /if \(bloqueo\) \{/);
    assert.match(fn, /UPDATE wallet_avisos SET estado = 'bloqueado'/);
    // Y gana sobre reintentar: si la configuración está mal, el reintento sobra.
    const iBloq = fn.indexOf("if (bloqueo) {");
    const iRet = fn.indexOf("} else if (reintentar &&");
    assert.ok(iBloq > 0 && iRet > iBloq, "reintentar va antes que bloqueado");
  });

  test("el estado `bloqueado` existe en el esquema, separado de `fallido`", () => {
    assert.match(sinComentarios(esquema),
      /CHECK \(estado IN \('pendiente','enviado','fallido','bloqueado','descartado'\)\)/);
  });

  test("el worker NUNCA reintenta un bloqueado por su cuenta", () => {
    // Solo se reencola si una persona pulsa el botón, después de arreglar la configuración.
    assert.ok(!/estado = 'pendiente'[\s\S]{0,120}bloqueado/.test(fn),
      "el worker reencola lo bloqueado solo");
    const iRuta = s.indexOf('app.post("/api/wallet/dinamico/reintentar"');
    assert.match(s.slice(iRuta, iRuta + 900), /estados = soloConfig \? \["bloqueado"\] : \["fallido", "bloqueado"\]/);
  });
});

describe("el panel distingue los tres", () => {
  test("dispositivo inválido, error de configuración y fallo transitorio", () => {
    assert.match(panel, /\["Avisos fallidos", c\.fallidos, "Fallo transitorio/);
    assert.match(panel, /\["Avisos bloqueados", c\.bloqueados, "Error de CONFIGURACIÓN/);
    assert.match(panel, /\["Dispositivos invalidados", c\.invalidados/);
  });

  test("y el servidor los cuenta por separado", () => {
    const s = sinComentarios(server);
    assert.match(s, /fallidos: await c\(`SELECT COUNT\(\*\)::int AS n FROM wallet_avisos WHERE estado = 'fallido'`\)/);
    assert.match(s, /bloqueados: await c\(`SELECT COUNT\(\*\)::int AS n FROM wallet_avisos WHERE estado = 'bloqueado'`\)/);
    assert.match(s, /invalidados: await c\(`SELECT COUNT\(\*\)::int AS n FROM wallet_dispositivos/);
  });

  test("reintentar lo bloqueado avisa antes de gastar llamadas contra Apple", () => {
    assert.match(panel, /fallaron por CONFIGURACIÓN/);
    assert.match(panel, /¿Ya lo has corregido\?/);
  });
});
