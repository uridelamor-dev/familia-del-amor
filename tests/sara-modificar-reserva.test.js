import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// LO QUE PASABA: la herramienta `modificar_reserva` existe desde el principio —descrita, con su
// esquema y su manejador—, y NUNCA funcionó. `whatsapp.js` pide un resolver con
// `setOnModificarReserva` y `server.js` no lo registraba: cada «en vez de 2 seremos 4» acababa
// en «ha habido un problema técnico». No daba error en ninguna pantalla y nadie lo supo.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const wa = readFileSync(new URL("../whatsapp.js", import.meta.url), "utf8");

describe("las herramientas que Sara ofrece están conectadas de verdad", () => {
  test("TODO setOnX que exporta whatsapp.js se registra en server.js", () => {
    // El candado general, no solo el de esta vez: una herramienta cuyo resolver no se registra
    // le contesta al cliente con un error técnico, y desde dentro no se ve nada raro.
    const exportados = [...wa.matchAll(/export function (setOn[A-Za-z]+)\(/g)].map((m) => m[1]);
    assert.ok(exportados.length >= 4, `esperaba varios setOn*, encontré ${exportados.length}`);
    const sinRegistrar = exportados.filter((fn) => !new RegExp(`\\b${fn}\\(`).test(server));
    assert.deepEqual(sinRegistrar, [],
      `whatsapp.js espera estos resolvers y server.js no los registra: ${sinRegistrar.join(", ")}`);
  });

  test("modificar_reserva, en concreto", () => {
    assert.match(server, /setOnModificarReserva\(async \(input, jid\) => \{/);
  });
});

describe("una modificación sigue las mismas reglas que una reserva nueva", () => {
  const fn = server.slice(server.indexOf("setOnModificarReserva(async"), server.indexOf("setSaraConfigLoader(async"));

  test("se comprueba el bloqueo del día de DESTINO, no el del actual", () => {
    // Si mirara el día actual, bastaría crear una reserva en un día libre y moverla al cerrado.
    assert.match(fn, /const destino = cambios\.dia \|\| reserva\.dia/);
    assert.match(fn, /estaBloqueado\(reserva\.local, destino\)/);
  });

  test("y la fecha y la hora, contra la hora de Madrid", () => {
    assert.match(fn, /validarModificacion\(\{/);
    assert.match(fn, /hoy: hoyISO\(\)/);
    assert.match(fn, /instanteMadrid\(new Date\(\)\)/,
      "instanteMadrid() sin argumento devuelve «Invalid Date» y la validación dejaría pasar todo");
  });

  test("la reserva se busca por los últimos 9 dígitos, como en el resto de la casa", () => {
    // «+34 612 345 678» y «612345678» son la misma persona.
    assert.match(fn, /clave\.slice\(-9\)/);
    assert.match(fn, /\.endsWith\(cola\)/);
  });

  test("un grupo grande queda pendiente del local, igual que al reservar", () => {
    assert.match(fn, /pendiente: quedaPendiente\(actualizada\.personas\)/);
  });

  test("el local se entera, con el antes y el después", () => {
    assert.match(fn, /sendModificacionGrupo\(row\.group_jid, actualizada, detalle\)/);
    assert.match(fn, /antes: reserva\[k\] \?\? "—", despues: cambios\[k\]/);
  });
});

describe("lo que se le dice al cliente es verdad", () => {
  const manejador = wa.slice(wa.indexOf('if (name === "modificar_reserva")'), wa.indexOf('if (name === "enviar_documento")'));

  test("un día bloqueado NO se contesta con «no encuentro tu reserva»", () => {
    // La reserva existe; lo que no se puede es moverla a ese día. Decirle a alguien que no
    // tiene reserva cuando sí la tiene es la forma de que cuelgue y llame enfadado.
    assert.match(manejador, /bloqueado: "Ese día el local no acepta reservas/);
    assert.match(manejador, /fecha_pasada: "Ese día ya ha pasado/);
    assert.match(manejador, /hora_pasada: "Esa hora ya ha pasado hoy/);
  });

  test("y no se da por cerrado un grupo grande", () => {
    assert.match(manejador, /if \(resultado\.pendiente\)/);
    assert.match(manejador, /PENDIENTE de que el local lo confirme/);
  });

  test("«sin cambios» sigue teniendo su respuesta propia", () => {
    assert.match(manejador, /"sin cambios": "No se indicó ningún cambio/);
  });
});
