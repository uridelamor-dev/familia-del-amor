import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { facturaConTexto } from "./helpers/pdf-falso.js";
import { extraerTextoPdf } from "../src/modules/facturas/pdf-texto.js";
import { pistasDeFecha, revisarFecha } from "../src/modules/facturas/fecha-documento.js";
import { promptExtraccion } from "../facturas.js";
import { readFileSync } from "node:fs";

// Al nivel del fichero y no dentro de un `describe`: es exactamente el fallo que tenía
// `facturas-sync` y que no se veía porque aquellos tests ni se ejecutaban.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

// EL TEST DE REGRESIÓN DEL FALLO REAL: una factura de 2026 se guardó como 2025. Recorre la
// cadena entera —PDF → capa de texto → pistas → contraste— sin gastar ni una llamada al modelo.
// El PDF se escribe aquí a mano, así que esto corre en cualquier sitio y siempre.

const PDF = facturaConTexto([
  { x: 40, y: 780, t: "DISTRIBUCIONS PROVA SL" },
  { x: 40, y: 740, t: "Factura numero 2026/00418" },
  { x: 40, y: 720, t: "Fecha: 03/12/2026" },
  { x: 40, y: 700, t: "Vencimiento: 15/01/2027" },
]);

describe("la factura de 2026 que se leyó como 2025", () => {
  const capa = extraerTextoPdf(PDF);
  const pistas = pistasDeFecha(capa.texto);

  test("del PDF se saca qué años hay escritos de verdad", () => {
    assert.equal(capa.hayTexto, true, "el PDF de prueba tiene que tener capa de texto");
    assert.deepEqual(pistas.anios.sort(), [2026, 2027]);
    assert.ok(pistas.fechas.includes("2026-12-03"));
    assert.ok(!pistas.anios.includes(2025), "2025 no está escrito en ninguna parte del documento");
  });

  test("y una lectura que dice 2025 SE CAZA", () => {
    const r = revisarFecha(
      { fecha: "2025-12-03", numero_factura: "2026/00418", total: 121 },
      { hoy: "2026-12-03", recibida: "2026-12-03", pistas });
    assert.equal(r.grave, true);
    assert.equal(r.anioProbable, 2026);
    assert.equal(r.propuesta, "2026-12-03");
  });

  test("mientras que la lectura buena pasa sin decir nada", () => {
    // Tan importante como cazar el fallo: no molestar cuando está bien.
    const r = revisarFecha(
      { fecha: "2026-12-03", numero_factura: "2026/00418", vencimiento: "2027-01-15", total: 121 },
      { hoy: "2026-12-03", recibida: "2026-12-03", pistas, vencimientoDelPapel: true });
    assert.equal(r.avisos.length, 0);
    assert.equal(r.anioProbable, null);
  });
});

describe("el prompt le dice a la IA cómo leer la fecha", () => {
  const p = promptExtraccion("2026-08-26");

  test("cuál es la fecha de emisión y cuáles NO lo son", () => {
    // Antes no decía ni una palabra de la fecha: tenía un párrafo entero para el vencimiento y
    // para esto solo el formato en el esquema JSON.
    assert.match(p, /FECHA DE EMISIÓN/);
    for (const otra of ["vencimiento", "albarán", "entrega", "impresión", "periodo facturado"]) {
      assert.ok(p.includes(otra), `no avisa de confundirla con: ${otra}`);
    }
  });

  test("el formato de aquí, que es el que cambia el trimestre si se lee al revés", () => {
    assert.match(p, /dd\/mm\/aaaa/);
    assert.match(p, /03\/12\/2026.*3 de diciembre.*NO el 12 de marzo/s);
  });

  test("y LA REGLA DE FONDO: el año se copia, no se deduce", () => {
    assert.match(p, /EL AÑO SE COPIA, NO SE DEDUCE/);
    assert.match(p, /aunque te suene lejano/);
  });

  test("la fecha de hoy entra, pero solo para descartar imposibles", () => {
    // Darla sin acotar invita a rellenar con ella cuando no encuentra ninguna, y una fecha
    // razonable pero inventada no la caza después ninguna comprobación.
    assert.match(p, /Hoy es 2026-08-26/);
    assert.match(p, /SOLO para descartar imposibles/);
    assert.match(p, /nunca para rellenar/);
  });

  test("y se inyecta, para que esto se pueda comprobar", () => {
    assert.match(promptExtraccion("2027-01-01"), /Hoy es 2027-01-01/);
    assert.ok(!promptExtraccion(null).includes("{HOY}"), "sin fecha no puede quedar el hueco sin rellenar");
  });
});

describe("corregir la fecha hace las CUATRO cosas, no la mitad", () => {
  const ep = server.slice(server.indexOf('app.post("/api/facturas/:id/fecha"'),
                          server.indexOf("// Eliminar una factura (errores)"));

  test("el dato, el vencimiento, el PDF y las hojas", () => {
    // El `PATCH` general rehacía las hojas y nada más: arreglar un año dejaba el papel
    // archivado en «Diciembre 2025» y el vencimiento en el año equivocado. La mitad del
    // trabajo, y justo la mitad que no se ve.
    assert.match(ep, /UPDATE facturas SET fecha = \?, vencimiento = \?, vencimiento_origen = \?/);
    assert.match(ep, /calcularVencimiento\(\{ fecha, vencimientoLeido: null/);
    assert.match(ep, /reubicarEnDrive\(\{ factura: \{ \.\.\.f, fecha \}/);
    assert.match(ep, /resincronizarSheetsFactura\(deps, f\.local, f\.fecha\)/);   // el mes viejo
    assert.match(ep, /resincronizarSheetsFactura\(deps, f\.local, fecha\)/);      // y el nuevo
  });

  test("pero el vencimiento LEÍDO del papel no se toca", () => {
    // Es un hecho del documento, no una cuenta nuestra.
    assert.match(ep, /if \(f\.vencimiento_origen !== "factura"\)/);
  });

  test("y si Drive o el Sheet fallan, la fecha ya está bien guardada", () => {
    // La base es la fuente de verdad; lo demás se rehace con «Reordenar Drive» y «Reparar».
    const iRes = ep.indexOf("res.json({");
    const iDrive = ep.indexOf("reubicarEnDrive(");
    assert.ok(iRes > 0 && iDrive > iRes, "el papel no puede tumbar la corrección del dato");
  });

  test("mover un archivo nunca lanza", () => {
    const fact = readFileSync(new URL("../facturas.js", import.meta.url), "utf8");
    const fn = fact.slice(fact.indexOf("export async function reubicarEnDrive("), fact.indexOf("export async function migrarEstructuraDrive("));
    assert.match(fn, /return \{ movido: false, motivo: e\.message \}/);
  });

  test("la ficha propone el año y lo aplica de un clic", () => {
    assert.match(app, /function facAvisoAnio\(f, revisar\)/);
    assert.match(app, /data-act="fac-fecha-ok"/);
    assert.match(app, /Cambiar a \$\{esc\(fechaCorta\(prop\)/);
  });

  test("avisando ANTES de lo que arrastra", () => {
    // Cambiar de trimestre un mes ya declarado no es cosmético y hay que decirlo.
    const fn = app.slice(app.indexOf("async function facCorregirFecha("), app.indexOf("async function facGmailAhora("));
    assert.match(fn, /confirmModal\(/);
    assert.match(fn, /se mueve a la carpeta de ese mes/);
    assert.match(fn, /cambia de trimestre/);
  });
});

describe("el «Repasar» que ya existe encuentra las que están mal guardadas", () => {
  test("la evidencia del PDF se guarda al dar de alta, para poder repetir el contraste", () => {
    // Sin ella habría que volver a bajar cada documento de Drive. Y además: «Repasar» reescribe
    // la columna de avisos con lo que sepa recalcular, así que un aviso que solo se puede sacar
    // con el PDF delante se borraría solo en el primer repaso.
    assert.match(server, /"fecha_pistas TEXT"/);
    const fact = readFileSync(new URL("../facturas.js", import.meta.url), "utf8");
    assert.match(fact, /datos\._pistasFecha \? JSON\.stringify\(datos\._pistasFecha\) : null/);
  });

  test("y el repaso la lee, junto a cuándo llegó el documento", () => {
    assert.match(server, /fecha_pistas, creado_en, vencimiento, vencimiento_origen, concepto/);
    const rep = readFileSync(new URL("../src/modules/facturas/repaso.js", import.meta.url), "utf8");
    assert.match(rep, /pistas: pistasGuardadas\(f\)/);
    assert.match(rep, /vencimientoDelPapel: f\.vencimiento_origen === "factura"/);
  });

  test("las que traen propuesta salen aparte, para poder ofrecer el botón", () => {
    const rep = readFileSync(new URL("../src/modules/facturas/repaso.js", import.meta.url), "utf8");
    assert.match(rep, /if \(rf\.anioProbable\) \{/);
    assert.match(rep, /return \{ revisiones, sospechas, fechas \}/);
    assert.match(server, /fechasDudosas: r\.fechas\.slice\(0, 25\)/);
  });

  test("mirar sigue siendo solo mirar", () => {
    // El GET no puede escribir: con algo que cambia el trimestre de una factura, enseñar antes
    // lo que va a pasar no es un lujo.
    const get = server.slice(server.indexOf('app.get("/api/facturas/repaso"'), server.indexOf('app.post("/api/facturas/repaso"'));
    assert.ok(!/UPDATE facturas|INSERT INTO/.test(get), "el repaso en seco está escribiendo");
  });

  test("y aplicar el repaso NUNCA cambia una fecha", () => {
    // Un año se decide de uno en uno, mirando el papel. En masa se moverían cien facturas de
    // trimestre de golpe, y eso no se deshace con un clic.
    const post = server.slice(server.indexOf('app.post("/api/facturas/repaso"'), server.indexOf('app.post("/api/facturas/repaso/lineas"'));
    assert.ok(!/SET fecha = |UPDATE facturas SET fecha/.test(post), "el repaso masivo está tocando fechas");
  });
});
