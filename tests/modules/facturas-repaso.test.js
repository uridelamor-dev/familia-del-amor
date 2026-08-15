import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repasarLote, resumenRepaso, pideRelecturaDeLineas, avisosGuardados, comoDocumento, VERSION_LINEAS }
  from "../../src/modules/facturas/repaso.js";

const F = (id, extra = {}) => ({
  id, local: "La Tapeta - Blanes", proveedor: "Distribucions Girona SL", nif: "B17972860",
  fecha: "2026-06-10", numero_factura: "2026/" + id,
  base_imponible: 100, porcentaje_iva: 21, cuota_iva: 21, total: 121,
  dup_estado: null, revisar: null, ...extra,
});

// ── Qué hay que volver a leer con el modelo ────────────────────────────────

describe("qué facturas piden que se relea el detalle", () => {
  test("una leída con la versión de antes de los descuentos, sí", () => {
    assert.equal(pideRelecturaDeLineas({ drive_url: "http://drive/x", lineas_estado: "ok" }), true);
  });
  test("una ya leída con lo nuevo, no: releerla sería pagar otra vez por lo mismo", () => {
    assert.equal(pideRelecturaDeLineas({ drive_url: "http://drive/x", lineas_estado: "ok", lineas_version: VERSION_LINEAS }), false);
  });
  test("sin archivo en Drive no hay de dónde releer", () => {
    assert.equal(pideRelecturaDeLineas({ lineas_estado: "ok" }), false);
  });
  test("las que nunca se leyeron son del OTRO botón: aquí no se tocan", () => {
    // «Leer las N que faltan» ya las cubre. Meterlas también aquí sería contarlas dos veces
    // en dos sitios y dejar al usuario sin saber cuál de los dos avanza.
    assert.equal(pideRelecturaDeLineas({ drive_url: "http://drive/x", lineas_estado: null }), false);
  });
  test("el gasto estructural y lo ilegible se quedan como están", () => {
    assert.equal(pideRelecturaDeLineas({ drive_url: "http://drive/x", lineas_estado: "no_aplica" }), false);
    assert.equal(pideRelecturaDeLineas({ drive_url: "http://drive/x", lineas_estado: "no_leible" }), false);
  });
});

// ── Coherencia sobre lo ya guardado ────────────────────────────────────────

describe("los avisos de coherencia, hacia atrás", () => {
  test("una factura vieja que no cuadra se marca ahora, aunque entrara antes de la comprobación", () => {
    const r = repasarLote([F(1, { total: 150 })]);
    assert.equal(r.revisiones.length, 1);
    assert.match(r.revisiones[0].textos[0], /pero el total dice 150\.00 €/);
    assert.equal(r.revisiones[0].grave, true);
  });

  test("si ya cuadra no se dice nada: el repaso no puede llenar la lista de ruido", () => {
    assert.deepEqual(repasarLote([F(1), F(2), F(3)]).revisiones, []);
  });

  test("un aviso que ya estaba guardado y sigue igual NO cuenta como cambio", () => {
    // Repasar dos veces seguidas tiene que dar 0 cambios la segunda vez: si no, cada repaso
    // parecería haber encontrado algo y nadie volvería a mirarlos.
    const uno = repasarLote([F(1, { total: 150 })]);
    const guardada = F(1, { total: 150, revisar: JSON.stringify(uno.revisiones[0].textos) });
    assert.deepEqual(repasarLote([guardada]).revisiones, []);
  });

  test("un aviso que ya no toca se retira: se corrigió el importe a mano y el aviso sobra", () => {
    const guardada = F(1, { revisar: JSON.stringify(["Algo que ya no pasa"]) });
    const r = repasarLote([guardada]);
    assert.equal(r.revisiones.length, 1);
    assert.deepEqual(r.revisiones[0].textos, [], "se queda sin avisos");
    assert.equal(resumenRepaso(r).avisosQuitados, 1);
  });

  test("el NIF se compara con el de siempre, y para eso la columna `nif` es la del proveedor", () => {
    // La traducción de columnas importa: `revisarCoherencia` espera `nif_proveedor`, y sin
    // traducir, este aviso —de los que más pesan— no saltaría jamás en el repaso.
    assert.equal(comoDocumento({ nif: "B17972860" }).nif_proveedor, "B17972860");
    const filas = [F(1), F(2), F(3, { nif: "B17972868" })];
    const r = repasarLote(filas);
    assert.equal(r.revisiones.length, 1);
    assert.equal(r.revisiones[0].id, 3);
    assert.match(r.revisiones[0].textos[0], /siempre ha venido con el NIF B17972860/);
  });

  test("cada factura se juzga con lo que había ANTES que ella, no con todo el historial", () => {
    // Si se usara el historial entero, la primera factura de un proveedor se compararía con
    // facturas que en su día no existían y saltarían avisos que nunca habrían saltado. El
    // repaso tiene que dejarlas como si hubieran entrado ese día.
    const filas = [F(1, { nif: "B00000001" }), F(2), F(3)];
    const r = repasarLote(filas);
    assert.equal(r.revisiones.length, 0, "la primera no tiene con qué compararse; las otras dos tampoco (hacen falta 2 NIF previos)");
  });
});

// ── Duplicados sobre lo ya guardado ────────────────────────────────────────

describe("las repetidas que ya están dentro", () => {
  test("la misma factura metida dos veces se caza, y se apunta la SEGUNDA", () => {
    // La primera es la buena por definición: es la que llevaba más tiempo contando.
    const r = repasarLote([F(1, { numero_factura: "418" }), F(2, { numero_factura: "418" })]);
    assert.equal(r.sospechas.length, 1);
    assert.equal(r.sospechas[0].id, 2);
    assert.equal(r.sospechas[0].contraId, 1);
    assert.equal(r.sospechas[0].veredicto, "duplicada");
    assert.match(r.sospechas[0].resumen, /Mismo proveedor, mismo número de factura/);
  });

  test("se cazan aunque el proveedor esté escrito distinto, si el NIF es el mismo", () => {
    const r = repasarLote([F(1, { numero_factura: "418" }), F(2, { numero_factura: "418", proveedor: "DISTRIBUCIONS GIRONA, S.L." })]);
    assert.equal(r.sospechas.length, 1);
  });

  test("y aunque a una le falte el NIF, si el nombre es el mismo", () => {
    // Pasa constantemente: el NIF se lee en una y en la otra no. Buscando solo por NIF se
    // escapan justo las parejas peor leídas, que son las que más se repiten.
    const r = repasarLote([F(1, { numero_factura: "418" }), F(2, { numero_factura: "418", nif: null })]);
    assert.equal(r.sospechas.length, 1);
  });

  test("dos facturas distintas del mismo día no se tocan: eso es un martes normal", () => {
    const r = repasarLote([F(1, { total: 121, numero_factura: "418" }), F(2, { total: 340, numero_factura: "419" })]);
    assert.deepEqual(r.sospechas, []);
  });

  test("la que ya tiene veredicto no se vuelve a preguntar", () => {
    const yaVista = F(2, { numero_factura: "418", dup_estado: "distinta" });
    const r = repasarLote([F(1, { numero_factura: "418" }), yaVista]);
    assert.deepEqual(r.sospechas, [], "alguien ya decidió que son distintas");
  });

  test("una que ya está apartada tampoco se vuelve a apartar", () => {
    const r = repasarLote([F(1, { numero_factura: "418" }), F(2, { numero_factura: "418", dup_estado: "duda" })]);
    assert.deepEqual(r.sospechas, []);
  });

  test("con tres iguales se apuntan la segunda y la tercera, cada una contra una anterior", () => {
    const r = repasarLote([F(1, { numero_factura: "418" }), F(2, { numero_factura: "418" }), F(3, { numero_factura: "418" })]);
    assert.deepEqual(r.sospechas.map((s) => s.id), [2, 3]);
  });

  test("nunca se apunta la primera: apartar la vieja sería mover un mes ya cerrado", () => {
    const r = repasarLote([F(1, { numero_factura: "418" }), F(2, { numero_factura: "418" })]);
    assert.ok(!r.sospechas.some((s) => s.id === 1));
  });

  test("fuera de la ventana de días no hay sospecha: es la cuota de todos los meses", () => {
    const r = repasarLote([F(1, { fecha: "2026-01-15", numero_factura: "1" }), F(2, { fecha: "2026-02-15", numero_factura: "2" })]);
    assert.deepEqual(r.sospechas, []);
  });
});

// ── Lo que se cuenta ───────────────────────────────────────────────────────

describe("el resumen", () => {
  test("distingue avisos nuevos, cambiados y retirados, y las certezas", () => {
    const r = repasarLote([
      F(1, { numero_factura: "418" }),
      F(2, { numero_factura: "418" }),                       // repetida
      F(3, { total: 150, numero_factura: "9" }),             // no cuadra
      // De otro mes: mismo importe que la 1 pero lejos, así que no es sospechosa; lo suyo
      // es que arrastra un aviso que ya no toca.
      F(4, { numero_factura: "10", fecha: "2026-09-01", revisar: JSON.stringify(["viejo"]) }),
    ]);
    const s = resumenRepaso(r);
    assert.equal(s.avisosNuevos, 1);
    assert.equal(s.avisosQuitados, 1);
    assert.equal(s.graves, 1);
    assert.equal(s.sospechas, 1);
    assert.equal(s.certezas, 1);
  });

  test("un `revisar` corrupto no revienta el repaso entero", () => {
    assert.deepEqual(avisosGuardados({ revisar: "{no es json" }), []);
    assert.doesNotThrow(() => repasarLote([F(1, { revisar: "{roto" })]));
  });

  test("sin facturas no hay nada que decir", () => {
    assert.deepEqual(repasarLote([]), { revisiones: [], sospechas: [] });
    assert.equal(resumenRepaso().sospechas, 0);
  });
});

// ── Cableado en el servidor ────────────────────────────────────────────────

describe("server.js — el repaso está cableado y no borra nada", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const bloque = server.slice(server.indexOf("// ── Repaso de las facturas ya guardadas"),
                              server.indexOf("// El detalle de una factura concreta"));

  test("hay endpoint para mirar, para aplicar y para releer el detalle", () => {
    assert.match(server, /app\.get\("\/api\/facturas\/repaso"/);
    assert.match(server, /app\.post\("\/api\/facturas\/repaso"/);
    assert.match(server, /app\.post\("\/api\/facturas\/repaso\/lineas"/);
  });

  test("mirar es solo mirar: el GET no escribe en la base", () => {
    const get = bloque.slice(bloque.indexOf('app.get("/api/facturas/repaso"'), bloque.indexOf('app.post("/api/facturas/repaso"'));
    assert.doesNotMatch(get, /UPDATE|DELETE|INSERT/i, "si mirar cambiara algo, nadie podría mirar antes de decidir");
  });

  test("una repetida se APARTA, nunca se borra: las dos ya han contado en un mes cerrado", () => {
    assert.match(bloque, /dup_estado = 'duda'/);
    assert.doesNotMatch(bloque, /DELETE FROM facturas\b/i);
  });

  test("solo se aparta lo que no tiene ya un veredicto de una persona", () => {
    assert.match(bloque, /dup_estado IS NULL/);
  });

  test("el repaso respeta el local del usuario", () => {
    assert.match(bloque, /localScope\(req\)/);
  });
});

// ── Cableado en el panel ───────────────────────────────────────────────────

describe("el panel — el botón está donde se busca y no dispara nada solo", () => {
  const app = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("el botón vive en Compras → Configuración y llama al repaso", () => {
    assert.match(app, /data-act="fac-repaso"/);
    assert.match(app, /act === "fac-repaso"\) facRepaso\(\)/);
  });

  test("abrirlo solo MIRA: la primera petición no escribe", () => {
    const fn = /async function facRepaso\(\)[\s\S]*?\n}/.exec(app)[0];
    assert.match(fn, /apiRaw\("\/api\/facturas\/repaso"\)/);
    assert.doesNotMatch(fn, /apiSend\("POST"/, "aplicar es otro botón, y tiene que serlo");
  });

  test("las que fallan al releer se apuntan para no volver a tropezar con ellas", () => {
    const fn = /async function facRepasoLineas\([\s\S]*?\n}/.exec(app)[0];
    assert.match(fn, /saltar\.push\(d\.id\)/);
    assert.match(fn, /\{ tanda: 10, saltar, alcance \}/);
  });

  test("y con «todas» se apuntan TAMBIÉN las que salen bien, o no termina nunca", () => {
    // Releer no cambia el filtro cuando el alcance no es «las que faltan»: sin apuntar las
    // buenas, la tanda siguiente volvería a coger las mismas y esto daría vueltas para siempre.
    const fn = /async function facRepasoLineas\([\s\S]*?\n}/.exec(app)[0];
    assert.match(fn, /d\.error \|\| alcance !== "faltan"/);
  });

  test("el alcance se elige a sabiendas: con cuántas hay en cada uno", () => {
    // «Al día» no quiere decir «bien»: una lectura cortada guardó lo que llegó y quedó marcada
    // igual que las buenas.
    assert.match(app, /function facElegirAlcance/);
    assert.match(app, /Estar «al día» no quiere decir estar bien/);
  });

  test("se puede parar a la mitad: son cientos de descargas", () => {
    const fn = /async function facRepasoLineas\([\s\S]*?\n}/.exec(app)[0];
    assert.match(fn, /parar = true/);
  });
});
