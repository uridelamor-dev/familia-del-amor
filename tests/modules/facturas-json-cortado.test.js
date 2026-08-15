import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repararJsonCortado, extraerJson } from "../../src/modules/facturas/json-cortado.js";

describe("una respuesta cortada no puede perder la factura entera", () => {
  test("el caso real: el array de líneas se corta a media descripción", () => {
    // Esto es exactamente lo que pasó con DDI PROVEA: «Expected ',' or ']' after array element
    // in JSON at position 9099». La respuesta topó con el límite de tokens.
    const cortado = `{"proveedor":"DDI PROVEA, S.L.","total":1250.40,"lineas":[
      {"descripcion":"VIRUTA IBERICA GAS 1,5 KGS","cantidad":75,"precio_unitario":22,"importe":1650},
      {"descripcion":"JAMON RESERVA","cantidad":2,"precio_unitario":95,"importe":190},
      {"descripcion":"LOMO EMBUCHADO CAÑA`;
    const r = repararJsonCortado(cortado);
    assert.equal(r.ok, true);
    assert.equal(r.recortado, true);
    assert.equal(r.valor.proveedor, "DDI PROVEA, S.L.");
    assert.equal(r.valor.lineas.length, 2, "se salvan las dos líneas ENTERAS");
    assert.equal(r.valor.lineas[0].importe, 1650);
  });

  test("no se inventa la línea que quedó a medias", () => {
    // La línea incompleta se tira: media descripción sin cantidad ni importe no es un dato, y
    // completarla sería inventar lo que nos han cobrado.
    const r = repararJsonCortado(`{"lineas":[{"descripcion":"A","importe":10},{"descripcion":"B","imp`);
    assert.equal(r.valor.lineas.length, 1);
    assert.deepEqual(r.valor.lineas[0], { descripcion: "A", importe: 10 });
  });

  test("se corta dentro de una cadena, con comillas y comas dentro", () => {
    // «VIRUTA IBERICA GAS 1,5 KGS» tiene una coma: si el corte se hiciera por comas a lo bruto,
    // partiría la descripción por la mitad.
    const r = repararJsonCortado(`{"lineas":[{"descripcion":"GAS 1,5 KGS","importe":22}],"nota":"a med`);
    assert.equal(r.ok, true);
    assert.equal(r.valor.lineas[0].descripcion, "GAS 1,5 KGS");
    assert.equal(r.valor.nota, undefined, "lo que no llegó entero, no está");
  });

  test("una clave sin su valor tampoco cuela", () => {
    const r = repararJsonCortado(`{"proveedor":"Grau","total":100,"lineas"`);
    assert.equal(r.ok, true);
    assert.equal(r.valor.total, 100);
    assert.ok(!("lineas" in r.valor));
  });

  test("un JSON entero se devuelve tal cual y NO se marca como recortado", () => {
    const r = repararJsonCortado(`{"a":1,"b":[1,2,3]}`);
    assert.equal(r.ok, true);
    assert.equal(r.recortado, false);
    assert.deepEqual(r.valor, { a: 1, b: [1, 2, 3] });
  });

  test("lo que no es JSON roto sino basura, se dice", () => {
    assert.equal(repararJsonCortado("").ok, false);
    assert.equal(repararJsonCortado("no soy json").ok, false);
    assert.equal(repararJsonCortado("{]").ok, false);
    assert.equal(repararJsonCortado(null).ok, false);
  });

  test("nunca lanza, pase lo que pase", () => {
    for (const basura of ["{", "[", '{"', '{"a":', "}}}", '{"a":"\\', "{{{{{{"]) {
      assert.doesNotThrow(() => repararJsonCortado(basura), `con ${JSON.stringify(basura)}`);
    }
  });
});

describe("sacar el JSON de la respuesta del modelo", () => {
  test("se salta el texto de cortesía de delante", () => {
    const r = extraerJson('Aquí tienes los datos:\n\n{"proveedor":"Grau","total":50}');
    assert.equal(r.ok, true);
    assert.equal(r.valor.proveedor, "Grau");
  });

  test("y aun así rescata si viene cortado", () => {
    const r = extraerJson('Vale:\n{"proveedor":"Grau","lineas":[{"d":"A"},{"d":"B"},{"d":');
    assert.equal(r.ok, true);
    assert.equal(r.valor.lineas.length, 2);
  });

  test("EL CASO REAL: el modelo envuelve la respuesta en un bloque de markdown", () => {
    // ```json … ``` — cortar desde la primera llave hasta el final se lleva el cierre del
    // bloque, y `JSON.parse` falla por lo que sobra detrás aunque el JSON esté entero. Se
    // veía como «no está cortado», que es exactamente lo que era.
    const conBloque = '```json\n{ "tipo": "factura", "proveedor": "DDI PROVEA, S.L.",\n' +
      '  "lineas": [{"descripcion":"VIRUTA IBERICA","importe":1650}] }\n```';
    const r = extraerJson(conBloque);
    assert.equal(r.ok, true);
    assert.equal(r.recortado, false, "está entero: no hay nada que recortar");
    assert.equal(r.valor.proveedor, "DDI PROVEA, S.L.");
    assert.equal(r.valor.lineas.length, 1);
  });

  test("y si viene cortado DENTRO del bloque, también se salva lo entero", () => {
    const r = extraerJson('```json\n{"proveedor":"DDI","lineas":[{"d":"A","importe":10},{"d":"B","impor');
    assert.equal(r.ok, true);
    assert.equal(r.recortado, true);
    assert.equal(r.valor.lineas.length, 1);
  });

  test("una coletilla detrás del JSON tampoco tumba la lectura", () => {
    const r = extraerJson('{"a":1}\n\nEspero que te sirva.');
    assert.equal(r.ok, true);
    assert.deepEqual(r.valor, { a: 1 });
  });

  test("sin JSON, se dice que no hay", () => {
    assert.equal(extraerJson("no puedo leer este documento").motivo, "no hay JSON");
  });
});

describe("cableado con la lectura de facturas", () => {
  const facturas = readFileSync(new URL("../../facturas.js", import.meta.url), "utf8");

  test("se pide sitio de sobra para una factura larga", () => {
    // 4096 se quedaba corto con un proveedor de treinta líneas y la respuesta llegaba cortada.
    // Haiku 4.5 admite hasta 64.000 de salida; 16.000 va sobrado y no arriesga el tiempo de
    // espera de una petición sin streaming.
    const m = /max_tokens:\s*(\d+)/.exec(facturas);
    assert.ok(m, "falta max_tokens");
    assert.ok(Number(m[1]) >= 16000, `max_tokens es ${m[1]}, demasiado poco para una factura larga`);
  });

  test("y se MIRA el aviso de que se ha cortado, en vez de dejar que reviente el parseo", () => {
    // El modelo avisa con stop_reason: "max_tokens". Sin mirarlo, el fallo salía como
    // «Expected ',' or ']' … at position 9099», que no dice nada a quien lo lee.
    assert.match(facturas, /stop_reason === "max_tokens"/);
    assert.match(facturas, /se ha cortado|se cortó/i);
  });

  test("si se corta, se guarda lo que llegó entero en vez de perder la factura", () => {
    assert.match(facturas, /extraerJson|repararJsonCortado/);
  });
});
