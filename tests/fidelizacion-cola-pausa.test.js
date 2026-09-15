// PAUSAR TIENE QUE PARAR DE VERDAD.
//
// ── EL FALLO QUE ESTO ARREGLA ────────────────────────────────────────────────────────────────
//
// «Pausar» marcaba la comunicación y nada más. El worker de `cap_cola` seguía recogiendo todo lo
// que ya estuviera encolado, así que el freno no frenaba: se pulsaba, la pantalla decía «Pausada»
// y los mensajes seguían saliendo. Es la peor forma de tener un freno, porque nadie vuelve a
// mirarlo hasta que el daño está hecho.
//
// ── CÓMO SE ARREGLA, Y POR QUÉ ASÍ ───────────────────────────────────────────────────────────
//
// Una columna `pausado` en `cap_cola`, APARTE del estado:
//
//   · No puede ser `descartado`, que es definitivo y es lo que hace «Cancelar».
//   · No puede vivir solo en quien produjo el mensaje: el worker lee de la cola y no sabe de dónde
//     vino cada fila.
//   · Reanudar es quitar la marca. No se toca `estado` ni `intentos`, así que no se duplica nada.
//
// Y se comprueba DOS VECES: en el `SELECT` del lote y otra vez justo antes de mandar cada mensaje.
// La segunda es la que gana la carrera de verdad: el lote se leyó hace un momento y alguien puede
// haber pulsado «Pausar» mientras salían los primeros.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const cola = readFileSync(new URL("../src/modules/captacion/schema.js", import.meta.url), "utf8");
const ruta = (firma) => {
  const i = server.indexOf(firma);
  if (i < 0) throw new Error(`no existe la ruta ${firma}`);
  return server.slice(i, server.indexOf("\n});", i) + 4);
};
const worker = server.slice(server.indexOf("async function capVaciarCola()"),
                            server.indexOf("async function capVaciarCola()") + 4000);

/**
 * Una cola de mentira con un worker que hace LO MISMO que el de verdad: lee un lote, y antes de
 * mandar cada fila vuelve a mirarla. Es donde se pueden meter las carreras.
 */
function colaFalsa(filas) {
  const t = filas.map((f) => ({ estado: "pendiente", pausado: false, intentos: 0, ...f }));
  const enviados = [];
  return {
    filas: t, enviados,
    /** El lote, con el mismo `WHERE` que el worker real. */
    lote: () => t.filter((f) => f.estado === "pendiente" && !f.pausado),
    /** Manda un lote. `entre` se ejecuta después de leerlo y antes de mandar: ahí va la carrera. */
    async vaciar({ entre = null } = {}) {
      const lote = this.lote();
      if (entre) await entre();
      for (const fila of lote) {
        // LA SEGUNDA COMPROBACIÓN. Sin ella, lo que ya estaba en memoria saldría igual.
        const vivo = t.find((x) => x.id === fila.id);
        if (!vivo || vivo.estado !== "pendiente" || vivo.pausado) continue;
        vivo.estado = "enviado";
        enviados.push(vivo.id);
      }
      return enviados.length;
    },
    pausar: (com) => t.forEach((f) => { if (f.token.startsWith(`com:${com}:`) && f.estado === "pendiente") f.pausado = true; }),
    reanudar: (com) => t.forEach((f) => { if (f.token.startsWith(`com:${com}:`) && f.estado === "pendiente") f.pausado = false; }),
    cancelar: (com) => t.forEach((f) => {
      if (f.token.startsWith(`com:${com}:`) && f.estado === "pendiente") { f.estado = "descartado"; f.pausado = false; }
    }),
  };
}

const tres = () => colaFalsa([
  { id: 1, token: "com:7:600111111" }, { id: 2, token: "com:7:600222222" },
  { id: 3, token: "com:7:600333333" }, { id: 4, token: "cap:otra:600444444" },
]);

describe("el worker NO recoge lo pausado", () => {
  test("el SELECT del lote lo filtra", () => {
    assert.match(worker, /WHERE estado = 'pendiente' AND NOT pausado AND proximo_ms <= \?/);
  });

  test("y se vuelve a mirar JUSTO ANTES de mandar cada mensaje", () => {
    // Es la que gana la carrera: el lote se leyó hace un momento.
    assert.match(worker, /const vivo = await dbGet\(`SELECT estado, pausado FROM cap_cola WHERE id = \?`/);
    assert.match(worker, /if \(!vivo \|\| vivo\.estado !== "pendiente" \|\| vivo\.pausado\) continue;/);
    // Y va ANTES de cualquier envío.
    const iMira = worker.indexOf("const vivo = await dbGet");
    const iManda = worker.indexOf("sendMensajeLibre");
    assert.ok(iMira > 0 && iManda > iMira, "se manda antes de volver a mirar");
  });

  test("la columna existe, es aditiva y nace en FALSE", () => {
    assert.match(cola, /ADD COLUMN IF NOT EXISTS pausado BOOLEAN NOT NULL DEFAULT FALSE/);
    // Y hay índice para que filtrar no cueste: es la consulta que corre cada 30 segundos.
    assert.match(cola, /idx_cap_cola_listos[\s\S]{0,120}WHERE estado = 'pendiente' AND NOT pausado/);
  });
});

describe("pausar, reanudar y cancelar", () => {
  test("PAUSAR detiene lo pendiente de ESA comunicación y no toca las demás", async () => {
    const c = tres();
    c.pausar(7);
    await c.vaciar();
    assert.deepEqual(c.enviados, [4], "ha enviado mensajes de una comunicación pausada");
  });

  test("REANUDAR continúa con los pendientes, sin duplicar", async () => {
    const c = tres();
    c.pausar(7);
    await c.vaciar();                       // solo sale el ajeno
    c.reanudar(7);
    await c.vaciar();
    assert.deepEqual(c.enviados, [4, 1, 2, 3]);
    // Y una tercera pasada no manda nada más: ya están en `enviado`.
    await c.vaciar();
    assert.equal(c.enviados.length, 4, "se han duplicado envíos al reanudar");
  });

  test("CANCELAR descarta lo pendiente, y reanudar después no lo resucita", async () => {
    const c = tres();
    c.cancelar(7);
    c.reanudar(7);                          // quitar la pausa no revive lo descartado
    await c.vaciar();
    assert.deepEqual(c.enviados, [4]);
    assert.deepEqual(c.filas.filter((f) => f.estado === "descartado").map((f) => f.id), [1, 2, 3]);
  });

  test("LO QUE YA SE ENVIÓ NO SE ALTERA", async () => {
    const c = tres();
    await c.vaciar();                        // salen los cuatro
    assert.equal(c.enviados.length, 4);
    c.pausar(7); c.cancelar(7);
    // Ninguno cambia de estado: las tres operaciones llevan `AND estado = 'pendiente'`.
    assert.ok(c.filas.every((f) => f.estado === "enviado"), "se ha tocado algo ya enviado");
    assert.ok(c.filas.every((f) => !f.pausado), "se ha pausado algo ya enviado");
  });
});

describe("las carreras", () => {
  test("PAUSAR MIENTRAS EL WORKER PROCESA corta el resto del lote", async () => {
    // El lote ya está leído en memoria. Sin la segunda comprobación, los tres saldrían igual.
    const c = tres();
    await c.vaciar({ entre: () => c.pausar(7) });
    assert.deepEqual(c.enviados, [4], "el lote ya leído se ha enviado a pesar de la pausa");
  });

  test("CANCELAR mientras procesa hace lo mismo", async () => {
    const c = tres();
    await c.vaciar({ entre: () => c.cancelar(7) });
    assert.deepEqual(c.enviados, [4]);
  });

  test("DOS EJECUCIONES SIMULTÁNEAS del worker no duplican", async () => {
    // El worker real tiene además un cerrojo en memoria (`capColaCorriendo`), pero la garantía de
    // verdad es que cada fila pasa a `enviado` y la segunda pasada ya no la ve.
    const c = tres();
    await Promise.all([c.vaciar(), c.vaciar()]);
    assert.equal(new Set(c.enviados).size, c.enviados.length, "un mensaje ha salido dos veces");
  });

  test("y el worker real tiene su propio cerrojo de reentrada", () => {
    assert.match(server, /let capColaCorriendo = false;/);
    assert.match(worker, /if \(capColaCorriendo\) return;/);
  });
});

describe("las rutas tocan la cola de verdad, no solo la etiqueta", () => {
  const pausa = ruta('app.post("/api/fidelizacion/comunicaciones/:id/pausa"');
  const cancelar = ruta('app.post("/api/fidelizacion/comunicaciones/:id/cancelar"');

  test("pausar marca `pausado` en `cap_cola`, no solo el estado de la comunicación", () => {
    assert.match(pausa, /UPDATE cap_cola SET pausado = \?\s*WHERE token LIKE \? AND estado = 'pendiente'/);
    assert.match(pausa, /`com:\$\{c\.id\}:%`/);
    assert.match(pausa, /LA PAUSA VA A LA COLA, NO SOLO A LA ETIQUETA/);
  });

  test("y SOLO lo pendiente: lo enviado no se altera", () => {
    for (const r of [pausa, cancelar]) {
      const ups = [...r.matchAll(/UPDATE cap_cola SET[^`]*/g)].map((m) => m[0]);
      assert.ok(ups.length >= 1);
      for (const u of ups) assert.match(u, /estado = 'pendiente'/, `un UPDATE alcanza a lo ya enviado: ${u}`);
    }
  });

  test("cancelar es DEFINITIVO y limpia la marca de pausa", () => {
    // Si dejara `pausado = true` sobre algo descartado, reanudar después lo resucitaría.
    assert.match(cancelar, /estado = 'descartado', pausado = FALSE/);
  });

  test("reanudar devuelve la comunicación a «enviando» si había algo en cola", () => {
    assert.match(pausa, /const vuelveA = pausar \? "pausada" : \(\(tocados\?\.n \|\| 0\) > 0 \? "enviando" : "aprobada"\)/);
  });

  test("pausar y reanudar son de Dirección y Marketing; cancelar, solo de Dirección", () => {
    // Pausar es el freno y conviene que lo pueda pulsar quien esté mirando. Cancelar tira mensajes
    // a la basura y es irreversible.
    assert.match(server, /app\.post\("\/api\/fidelizacion\/comunicaciones\/:id\/pausa", requireAuth\(PROMOS_ROLES\)/);
    assert.match(server, /app\.post\("\/api\/fidelizacion\/comunicaciones\/:id\/cancelar", requireAuth\(\["direccion"\]\)/);
  });

  test("y las dos quedan auditadas con cuántos mensajes tocaron", () => {
    assert.match(pausa, /ficAuditar\("fidelizacion", c\.id, pausar \? "comunicacion_pausada" : "comunicacion_reanudada"/);
    assert.match(pausa, /en_cola: tocados\?\.n \|\| 0/);
    assert.match(cancelar, /descartados: r \? r\.n : 0/);
  });
});
