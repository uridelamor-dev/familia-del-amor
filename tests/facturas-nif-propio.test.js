import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { corregirEmisorReceptor, esNuestraPorNombre } from "../src/modules/facturas/emisor.js";
import { gruposDuplicados } from "../src/modules/facturas/proveedores-duplicados.js";

// EL CASO REAL: cinco proveedores que no tienen nada que ver —TRANSGOURMET, EUROCONTA,
// ALUMINIS JORDI DOMENECH, Gràfiques Blanes y GRENKE— aparecían agrupados como «la misma
// empresa» porque compartían NIF. Y ese NIF era EL NUESTRO. La pantalla ofrecía un botón que
// habría fusionado treinta y una facturas de empresas distintas en una sola ficha.
const NUESTRAS = [{ empresa: "DEL AMOR URIEL SLU", cif: "B70799135" }];
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("nuestro CIF nunca se guarda como NIF de un proveedor", () => {
  test("el nombre bien leído y NUESTRO CIF en su casilla: se quita el NIF", () => {
    // Es el caso más silencioso: el nombre está bien, y lo que se cuela es el CIF. Antes
    // `esNuestra` decía «sí» por el CIF, caía en «los dos parecen nuestros» y SE GUARDABA.
    const r = corregirEmisorReceptor({
      proveedor: "TRANSGOURMET", nif_proveedor: "B70799135",
      nombre_receptor: "DEL AMOR URIEL SLU", nif_receptor: "B70799135" }, NUESTRAS);
    assert.equal(r.datos.nif_proveedor, null, "no puede guardarse nuestro CIF ahí");
    assert.equal(r.datos.proveedor, "TRANSGOURMET", "el nombre estaba bien: no se toca");
    assert.equal(r.corregido, true);
    assert.match(r.aviso, /es NUESTRO CIF/);
  });

  test("y se dice, en vez de arreglarlo callando", () => {
    const r = corregirEmisorReceptor({ proveedor: "EUROCONTA", nif_proveedor: "B-70.799.135",
      nombre_receptor: "DEL AMOR URIEL SLU", nif_receptor: "B70799135" }, NUESTRAS);
    assert.equal(r.datos.nif_proveedor, null, "da igual cómo esté escrito el CIF");
    assert.match(r.aviso, /ponlo tú si lo tienes/);
  });

  test("los papeles cambiados DE VERDAD se siguen corrigiendo como antes", () => {
    // Aquí el nombre del proveedor también somos nosotros: eso sí es una confusión de papeles,
    // y la respuesta correcta es intercambiar, no borrar.
    const r = corregirEmisorReceptor({
      proveedor: "DEL AMOR URIEL SLU", nif_proveedor: "B70799135",
      nombre_receptor: "EUROCONTA assessoria", nif_receptor: "B17000000" }, NUESTRAS);
    assert.equal(r.datos.proveedor, "EUROCONTA assessoria");
    assert.equal(r.datos.nif_proveedor, "B17000000");
    assert.match(r.aviso, /Se leyó al revés/);
  });

  test("y una factura correcta no se toca", () => {
    const r = corregirEmisorReceptor({ proveedor: "TRANSGOURMET", nif_proveedor: "A08000006",
      nombre_receptor: "DEL AMOR URIEL SLU", nif_receptor: "B70799135" }, NUESTRAS);
    assert.equal(r.datos.nif_proveedor, "A08000006");
    assert.equal(r.aviso, null);
  });

  test("`esNuestraPorNombre` es lo que separa los dos casos", () => {
    assert.equal(esNuestraPorNombre("DEL AMOR URIEL SLU", NUESTRAS), true);
    assert.equal(esNuestraPorNombre("TRANSGOURMET", NUESTRAS), false);
  });
});

describe("y tampoco agrupa proveedores en la pantalla de repetidos", () => {
  const filas = [
    { proveedor: "TRANSGOURMET", nif: "B70799135", facturas: 12, gasto: 3000 },
    { proveedor: "EUROCONTA assessoria", nif: "B70799135", facturas: 6, gasto: 900 },
    { proveedor: "GRENKE ALQUILER S.L.", nif: "B70799135", facturas: 4, gasto: 1640 },
    { proveedor: "Vins Grau", nif: "A17000000", facturas: 3, gasto: 500 },
    { proveedor: "VINS I LICORS GRAU SA", nif: "A17000000", facturas: 2, gasto: 400 },
  ];

  test("sin saber cuáles son nuestros, los junta a todos — que es lo que pasaba", () => {
    const g = gruposDuplicados(filas);
    assert.ok(g.some((x) => x.otros.length >= 2), "reproduce el fallo original");
  });

  test("SABIÉNDOLO, ese grupo desaparece", () => {
    // Que dos proveedores compartan NUESTRO CIF no dice nada de ellos: dice que la lectura
    // falló. Unir por eso habría fusionado treinta y una facturas ajenas.
    const g = gruposDuplicados(filas, { nuestrosCif: ["B70799135"] });
    const nombres = g.flatMap((x) => [x.sugerido.proveedor, ...x.otros.map((o) => o.proveedor)]);
    assert.ok(!nombres.includes("TRANSGOURMET"), "sigue proponiendo unir empresas distintas");
  });

  test("pero el repetido de VERDAD se mantiene", () => {
    // Cerrar el falso positivo no puede costar los que sí lo son.
    const g = gruposDuplicados(filas, { nuestrosCif: ["B70799135"] });
    const nombres = g.flatMap((x) => [x.sugerido.proveedor, ...x.otros.map((o) => o.proveedor)]);
    assert.ok(nombres.includes("Vins Grau") && nombres.includes("VINS I LICORS GRAU SA"));
  });

  test("y el servidor le pasa los CIF de la casa", () => {
    const ep = server.slice(server.indexOf('app.get("/api/facturas/proveedores-duplicados"'), server.indexOf('app.post("/api/facturas/nif-propio/limpiar"'));
    assert.match(ep, /SELECT DISTINCT cif FROM facturas_locales/);
    assert.match(ep, /gruposDuplicados\(filas, \{ nuestrosCif: nuestros \}\)/);
  });
});

describe("las que ya están mal guardadas se pueden limpiar", () => {
  test("se dice cuántas son y a qué proveedores afecta", () => {
    const ep = server.slice(server.indexOf('app.get("/api/facturas/proveedores-duplicados"'), server.indexOf('app.post("/api/facturas/nif-propio/limpiar"'));
    assert.match(ep, /conNifNuestro/);
    assert.match(app, /Hay \$\{num\(mal\.n\)\}.*con un CIF vuestro como NIF del proveedor/);
  });

  test("y el botón BORRA el NIF, no lo sustituye por otro", () => {
    // Sin NIF se ve que falta; con el nuestro, no se ve nada. Inventar uno sería peor.
    const ep = server.slice(server.indexOf('app.post("/api/facturas/nif-propio/limpiar"'), server.indexOf('app.put("/api/facturas/proveedor"'));
    assert.match(ep, /UPDATE facturas SET nif = NULL WHERE/);
    assert.ok(!/SET nif = '/.test(ep), "no se puede poner otro NIF a ciegas");
  });

  test("solo toca las que llevan un CIF NUESTRO, y nada más de esas facturas", () => {
    const ep = server.slice(server.indexOf('app.post("/api/facturas/nif-propio/limpiar"'), server.indexOf('app.put("/api/facturas/proveedor"'));
    assert.match(ep, /FROM facturas_locales WHERE cif IS NOT NULL/);
    assert.equal((ep.match(/UPDATE facturas SET/g) || []).length, 1, "solo un UPDATE, y solo del NIF");
  });

  test("y se cuenta antes de tocar nada, para poder decirlo", () => {
    const ep = server.slice(server.indexOf('app.post("/api/facturas/nif-propio/limpiar"'), server.indexOf('app.put("/api/facturas/proveedor"'));
    const iCount = ep.indexOf("SELECT count(*)::int AS n");
    const iUpdate = ep.indexOf("UPDATE facturas SET nif = NULL");
    assert.ok(iCount > 0 && iCount < iUpdate, "el recuento tiene que ir antes del borrado");
  });

  test("y avisa de que es masivo antes de hacerlo", () => {
    const fn = app.slice(app.indexOf("async function facLimpiarNifPropio()"), app.indexOf("async function facGmailAhora("));
    assert.match(fn, /confirmModal\(/);
    assert.match(fn, /danger: true/);
    assert.match(fn, /No se cambia nada más de esas facturas/);
  });
});

describe("y tampoco entramos como PROVEEDOR de nosotros mismos", () => {
  test("los nombres de los establecimientos se reconocen solos", async () => {
    // En una factura ponemos «LA TAPETA» o «CAN MATEU», no «DEL AMOR URIEL SLU»: el nombre
    // fiscal es el del registro, no con el que existimos de cara al mundo. Sin esto, esas
    // facturas entraban con NOSOTROS como proveedor y acababan en «de qué es cada proveedor».
    const { LOCALES } = await import("../src/modules/facturas/local-canonico.js");
    const { nombresPropios, esNuestra } = await import("../src/modules/facturas/emisor.js");
    const propios = nombresPropios(LOCALES);
    for (const n of ["LA TAPETA", "LA TAPA IBERICA", "P.AYLLON/CAN MATEU", "Can Mateu"]) {
      assert.equal(esNuestra(n, null, NUESTRAS, propios), "propio", n);
    }
  });

  test("la barra y el punto separan igual que un espacio", async () => {
    // «P.AYLLON/CAN MATEU» son tres palabras, no una. Sin normalizar la barra, un nombre
    // nuestro pegado a otra cosa no se reconocía.
    const { LOCALES } = await import("../src/modules/facturas/local-canonico.js");
    const { nombresPropios, esNuestra } = await import("../src/modules/facturas/emisor.js");
    assert.equal(esNuestra("P.AYLLON/CAN MATEU", null, NUESTRAS, nombresPropios(LOCALES)), "propio");
  });

  test("PERO UN PROVEEDOR DE VERDAD NO SE TOCA", async () => {
    // La regla es «es», no «contiene»: cerrar el falso positivo no puede costar proveedores
    // buenos. «Tapetería García» no somos nosotros por llevar «tapet» dentro.
    const { LOCALES } = await import("../src/modules/facturas/local-canonico.js");
    const { nombresPropios, esNuestra } = await import("../src/modules/facturas/emisor.js");
    const propios = nombresPropios(LOCALES);
    for (const n of ["TRANSGOURMET", "Sumgel", "JOAN MARGÓ CANUDAS", "VALLES AUTHENTIC SLU",
                     "Tapetería García", "DAVID ESCOBAR ARENAS", "SURTI & BAR"]) {
      assert.equal(esNuestra(n, null, NUESTRAS, propios), null, n);
    }
  });

  test("y lo que no se puede adivinar se APRENDE, una sola vez", () => {
    // «DEL AMOR SALINAS, MATEO» es un nombre fiscal de persona: no está en ninguna lista, y
    // parecerse a un apellido no basta —hay proveedores que se llaman como personas—.
    assert.match(server, /CREATE TABLE IF NOT EXISTS facturas_somos_nosotros/);
    assert.match(server, /app\.post\("\/api\/facturas\/somos-nosotros"/);
    assert.match(app, /data-act="fac-somos"/);
  });

  test("marcarlo NO borra las facturas: las señala", () => {
    // Quién emitió esas facturas sigue sin saberse, y eso lo tiene que mirar una persona con
    // el papel delante. Borrarlas sería perder el gasto.
    const ep = server.slice(server.indexOf('app.post("/api/facturas/somos-nosotros"'), server.indexOf('app.post("/api/facturas/nif-propio/limpiar"'));
    assert.ok(!/DELETE FROM facturas/.test(ep), "no se puede borrar una factura por esto");
    assert.match(ep, /UPDATE facturas SET revisar = \?/);
    assert.match(ep, /somos nosotros, no un proveedor/);
  });

  test("y el alta usa esa lista, no solo el nombre fiscal", () => {
    const fact = readFileSync(new URL("../facturas.js", import.meta.url), "utf8");
    assert.match(fact, /SELECT nombre FROM facturas_somos_nosotros/);
    assert.match(fact, /nombresPropios\(LOCALES, marcados\.map/);
    assert.match(fact, /corregirEmisorReceptor\(datos, nuestras, propios\)/);
  });
});
