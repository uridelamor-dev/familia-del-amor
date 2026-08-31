import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aplicarVariables, localDeContacto, CASA } from "../src/modules/messaging/queue.js";

// EL FALLO: {local} salió VACÍO en todas las campañas enviadas hasta hoy. `aplicarVariables` lo
// buscaba en `contacto.local` o `contacto.ultimo_local`, y la consulta de contactos no devolvía
// ninguna de las dos. La plantilla de cumpleaños llegaba como «Desde queremos celebrarlo
// contigo». Las diez plantillas del catálogo usan {local}, así que no se escapó ninguna.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

describe("de dónde sale el nombre del local en un mensaje", () => {
  test("el de la campaña manda sobre el de la persona", () => {
    // Escribiendo «a los de Can Mateu», el mensaje dice Can Mateu aunque esa persona fuera
    // una vez a Blanes: se le habla desde la casa que le escribe.
    assert.equal(localDeContacto({ local: "Can Mateu - Tordera", ultimo_local: "La Tapeta - Blanes" }),
      "Can Mateu - Tordera");
  });

  test("sin local de campaña, el suyo", () => {
    assert.equal(localDeContacto({ ultimo_local: "La Tapeta - Blanes" }), "La Tapeta - Blanes");
  });

  test("y si no tiene ninguno, el nombre de la casa — NUNCA un hueco", () => {
    // Un lead que nunca ha reservado, en una campaña sin filtro de local. Sin respaldo, la
    // frase se rompe, y el hueco no se ve al escribirla: se ve al leerla el cliente.
    assert.equal(localDeContacto({}), CASA);
    assert.equal(localDeContacto({ local: "", ultimo_local: null }), CASA);
  });

  test("la frase de cumpleaños sale entera en los tres casos", () => {
    const p = "¡Felicidades, {nombre}! 🎂 Desde {local} queremos celebrarlo contigo.";
    for (const c of [{ nombre: "Erika", local: "Can Mateu - Tordera" },
                     { nombre: "Erika", ultimo_local: "La Tapeta - Blanes" },
                     { nombre: "Erika" }]) {
      const texto = aplicarVariables(p, c);
      assert.doesNotMatch(texto, /Desde queremos/, `se ha quedado el hueco: ${texto}`);
      assert.doesNotMatch(texto, /\{local\}/, "la variable no se ha sustituido");
      assert.match(texto, /Desde \S/);
    }
  });

  test("ninguna plantilla del catálogo puede quedar con la variable sin sustituir", () => {
    // La comprobación que nadie hizo: pasar las diez por la función con un contacto pelado.
    const { PLANTILLAS } = require0();
    for (const pl of PLANTILLAS) {
      const texto = aplicarVariables(pl.mensaje, { nombre: "Ana" });
      assert.doesNotMatch(texto, /\{[a-z_]+\}/i, `${pl.id} deja una variable sin sustituir: ${texto}`);
      assert.doesNotMatch(texto, /\s{2,}/, `${pl.id} deja un hueco doble: ${texto}`);
    }
  });
});

describe("el servidor devuelve el dato que la función necesita", () => {
  test("la consulta de contactos trae ultimo_local", () => {
    const fn = server.slice(server.indexOf("function sqlContactosUnificados"), server.indexOf("function setMarketingPref"));
    assert.match(fn, /AS ultimo_local/,
      "sin esta columna, {local} vuelve a salir vacío en todas las campañas");
  });

  test("y la del cumpleaños automático también", () => {
    // Esta no pasa por sqlContactosUnificados y es justo la que más usa {local}.
    const job = server.slice(server.indexOf('getConfig("cumple_auto")'), server.indexOf("🎂 Cumpleaños: enviando"));
    assert.match(job, /AS ultimo_local/);
  });

  test("los cuatro caminos de envío pasan el local de la campaña", () => {
    // Campaña programada, campaña «enviar ya», mensaje masivo desde Clientes y cumpleaños.
    const llamadas = server.match(/enviarLoteWA\(\{[^}]*\}/g) || [];
    assert.ok(llamadas.length >= 4, `esperaba al menos 4 envíos, hay ${llamadas.length}`);
    assert.match(server, /localCampana: seg\.local/);
    assert.match(server, /localCampana: req\.body\.local/);
  });
});

// Import diferido: `plantillas.js` es ESM y se lee dentro del test para no romper el describe.
function require0() {
  const txt = readFileSync(new URL("../src/modules/campaigns/plantillas.js", import.meta.url), "utf8");
  const mensajes = [...txt.matchAll(/id: "([a-z-]+)",[\s\S]*?mensaje: "((?:[^"\\]|\\.)*)"/g)]
    .map((m) => ({ id: m[1], mensaje: JSON.parse(`"${m[2]}"`) }));
  assert.ok(mensajes.length >= 10, `esperaba 10 plantillas, encontré ${mensajes.length}`);
  return { PLANTILLAS: mensajes };
}
