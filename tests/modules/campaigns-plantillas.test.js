import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLANTILLAS, GRUPOS, porId, porGrupo, variablesDe, variablesDesconocidas, VARIABLES } from "../../src/modules/campaigns/plantillas.js";
import { aplicarVariables } from "../../src/modules/messaging/queue.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("plantillas — que estén completas", () => {
  test("cada una tiene id, nombre, grupo, cuándo usarla y mensaje", () => {
    for (const p of PLANTILLAS) {
      for (const k of ["id", "nombre", "grupo", "cuando", "mensaje"]) {
        assert.ok(String(p[k] || "").trim(), `«${p.id || "?"}» no tiene ${k}`);
      }
    }
  });
  test("los ids no se repiten", () => {
    assert.equal(new Set(PLANTILLAS.map((p) => p.id)).size, PLANTILLAS.length);
  });
  test("hay unas cuantas, no dos de compromiso", () => {
    assert.ok(PLANTILLAS.length >= 8, `solo hay ${PLANTILLAS.length}`);
    assert.ok(GRUPOS.length >= 4);
  });
});

describe("plantillas — los mensajes se sostienen solos", () => {
  test("TODAS usan {nombre}: un «Hola» seco a un cliente de años se nota", () => {
    for (const p of PLANTILLAS) assert.match(p.mensaje, /\{nombre\}/, `«${p.id}»`);
  });

  test("NINGUNA usa una variable que no existe", () => {
    // Una variable inventada se queda escrita tal cual en el WhatsApp del cliente.
    for (const p of PLANTILLAS) {
      assert.deepEqual(variablesDesconocidas(p.mensaje), [], `«${p.id}» usa variables que no existen`);
    }
  });

  test("las variables se sustituyen de verdad, sin dejar llaves sueltas", () => {
    for (const p of PLANTILLAS) {
      const final = aplicarVariables(p.mensaje, { nombre: "Ana", apellidos: "Ruiz", local: "La Tapeta - Blanes" });
      assert.equal(/[{}]/.test(final), false, `«${p.id}» deja llaves: ${final}`);
      assert.match(final, /Ana/);
    }
  });

  test("con el nombre vacío el mensaje sigue leyéndose (pasa: hay fichas sin nombre)", () => {
    for (const p of PLANTILLAS) {
      const final = aplicarVariables(p.mensaje, { nombre: "", local: "La Tapeta" });
      assert.equal(/[{}]/.test(final), false);
      assert.equal(/\s{2,}/.test(final), false, `«${p.id}» deja dobles espacios: ${final}`);
      assert.equal(/^[,!?.]/.test(final), false, `«${p.id}» empieza con un signo suelto: ${final}`);
    }
  });

  test("caben en un WhatsApp: nada de tochos", () => {
    for (const p of PLANTILLAS) {
      assert.ok(p.mensaje.length <= 320, `«${p.id}» tiene ${p.mensaje.length} caracteres`);
      assert.ok(p.mensaje.length >= 60, `«${p.id}» se queda en nada`);
    }
  });

  test("cada mensaje propone algo, no solo saluda", () => {
    // Una pregunta, una invitación o una instrucción. Un texto que no propone nada gasta
    // el único permiso que tienes para escribirle a alguien.
    for (const p of PLANTILLAS) {
      const proponeAlgo = /\?|responde|dilo|dínoslo|avísanos|escríbenos|pásate|te esperamos|te invitamos|te guardamos|reserv/i.test(p.mensaje);
      assert.ok(proponeAlgo, `«${p.id}» no propone nada: ${p.mensaje}`);
    }
  });

  test("ninguna promete un descuento con número: eso se decide al lanzarla", () => {
    for (const p of PLANTILLAS) {
      assert.equal(/\d+\s*%|\d+\s*€\s*de descuento/i.test(p.mensaje), false,
        `«${p.id}» lleva una cifra metida; los porcentajes se ponen al lanzar, no en la plantilla`);
    }
  });
});

describe("plantillas — el panel dice lo mismo que el módulo", () => {
  // El panel no puede importar ESM, así que lleva una copia. Es exactamente el tipo de
  // espejo que se desincroniza en cuanto alguien toca uno de los dos.
  const app = fs.readFileSync(path.join(RAIZ, "public/panel/app.js"), "utf8");
  const bloque = /const CAMP_PLANTILLAS = \[[\s\S]*?\n\];/.exec(app);

  test("el panel tiene su copia", () => {
    assert.ok(bloque, "no se encuentra CAMP_PLANTILLAS en app.js");
  });

  test("MISMAS PLANTILLAS, mismos ids y mismos mensajes", () => {
    for (const p of PLANTILLAS) {
      assert.ok(bloque[0].includes(`id:"${p.id}"`), `falta «${p.id}» en el panel`);
      // El mensaje entero, palabra por palabra: si alguien retoca el texto en un sitio y
      // no en el otro, lo que se manda deja de ser lo que se lee al elegir la plantilla.
      assert.ok(bloque[0].includes(p.mensaje), `el mensaje de «${p.id}» no coincide con el del panel`);
    }
  });

  test("y el panel no se inventa ninguna que el módulo no tenga", () => {
    const idsPanel = [...bloque[0].matchAll(/id:"([a-z0-9-]+)"/g)].map((m) => m[1]);
    assert.deepEqual(idsPanel.sort(), PLANTILLAS.map((p) => p.id).sort());
  });
});

describe("plantillas — buscarlas", () => {
  test("por id", () => {
    assert.equal(porId("cumple-mes").nombre, "Cumpleaños del mes");
    assert.equal(porId("no-existe"), null);
  });
  test("por grupo", () => {
    assert.ok(porGrupo("Recuperar clientes").length >= 2);
    assert.deepEqual(porGrupo("Inventado"), []);
  });
});

describe("plantillas — detectar variables mal escritas", () => {
  test("las reconoce todas", () => {
    assert.deepEqual(variablesDe("Hola {nombre}, en {local}"), ["{nombre}", "{local}"]);
  });
  test("y avisa de las que no existen", () => {
    assert.deepEqual(variablesDesconocidas("Hola {nombre}, tu mesa es la {mesa}"), ["{mesa}"]);
    assert.deepEqual(variablesDesconocidas("Hola {nombre}"), []);
  });
  test("no distingue mayúsculas, como aplicarVariables", () => {
    assert.deepEqual(variablesDesconocidas("Hola {NOMBRE}"), []);
  });
  test("la lista de variables es la misma que entiende el envío", () => {
    const final = aplicarVariables(VARIABLES.join(" "), { nombre: "Ana", apellidos: "Ruiz", local: "Blanes" });
    assert.equal(/[{}]/.test(final), false, "alguna variable del catálogo no la entiende el envío");
  });
});
