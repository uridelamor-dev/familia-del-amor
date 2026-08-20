import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tonoDeArea, areaDePersona, colorDePersona, TONOS_AREA } from "../../src/modules/horarios/colores.js";

describe("cada área tiene su color, y siempre el mismo", () => {
  test("las de la casa", () => {
    for (const n of ["SALA", "BARRA", "COCINA"]) assert.equal(typeof tonoDeArea(n), "number", n);
    assert.notEqual(tonoDeArea("SALA"), tonoDeArea("BARRA"));
    assert.notEqual(tonoDeArea("BARRA"), tonoDeArea("COCINA"));
    assert.notEqual(tonoDeArea("SALA"), tonoDeArea("COCINA"));
  });

  test("da igual cómo se escriba: mayúsculas, acentos o espacios", () => {
    for (const v of ["sala", "SALA", " Sala ", "SALÁ"]) assert.equal(tonoDeArea(v), TONOS_AREA.sala);
  });

  test("estable: el mismo nombre da siempre el mismo color", () => {
    // Un color que cambia entre pantallas no informa de nada.
    const a = tonoDeArea("REPARTO A DOMICILIO");
    for (let i = 0; i < 5; i++) assert.equal(tonoDeArea("REPARTO A DOMICILIO"), a);
  });

  test("un área inventada también tiene el suyo", () => {
    assert.equal(typeof tonoDeArea("OBRADOR"), "number");
    assert.notEqual(tonoDeArea("OBRADOR"), tonoDeArea("BODEGA"));
  });

  test("«SALA 2» es de la familia de SALA", () => {
    assert.equal(tonoDeArea("SALA 2"), TONOS_AREA.sala);
    assert.equal(tonoDeArea("Barra de arriba"), TONOS_AREA.barra);
  });

  test("NUNCA el verde de la marca ni el rojo de los avisos", () => {
    // Un área de esos colores parecería un estado —«correcto», «peligro»— y no un sitio.
    const nombres = ["SALA", "BARRA", "COCINA", "TERRAZA", "OFFICE", "OBRADOR", "BODEGA",
                     "REPARTO", "ALMACEN", "PISCINA", "JARDIN", "ZZZ", "a", "área rara 123"];
    for (const n of nombres) {
      const t = tonoDeArea(n);
      assert.ok(!(t >= 130 && t <= 170), `${n} sale verde (${t})`);
      assert.ok(!(t <= 20 || t >= 345), `${n} sale rojo (${t})`);
    }
  });

  test("sin nombre no hay color, y no se inventa", () => {
    for (const v of ["", null, undefined, "   "]) assert.equal(tonoDeArea(v), null);
  });
});

describe("el color de una persona sale de su área principal", () => {
  const SALA = { id: 1, nombre: "SALA" }, COCINA = { id: 2, nombre: "COCINA", principal: true };

  test("manda la principal, esté donde esté en la lista", () => {
    assert.equal(areaDePersona([SALA, COCINA]).nombre, "COCINA");
    assert.equal(areaDePersona([COCINA, SALA]).nombre, "COCINA");
  });

  test("sin principal, la primera", () => {
    assert.equal(areaDePersona([SALA, { id: 2, nombre: "BARRA" }]).nombre, "SALA");
  });

  test("quien no tiene área no se pinta de nada", () => {
    // Inventarle un color diría que es de un sitio; lo que pasa es que no se ha decidido.
    assert.equal(areaDePersona([]), null);
    assert.equal(colorDePersona([]), null);
    assert.equal(colorDePersona(null), null);
  });

  test("colorDePersona da nombre y tono, que es lo que pinta la etiqueta", () => {
    const c = colorDePersona([SALA, COCINA]);
    assert.equal(c.nombre, "COCINA");
    assert.equal(c.tono, TONOS_AREA.cocina);
  });

  test("no revienta con basura en la lista", () => {
    assert.doesNotThrow(() => colorDePersona([null, undefined, {}, "SALA"]));
  });
});
