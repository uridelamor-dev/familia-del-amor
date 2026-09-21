// VOLVER A APUNTARSE DESPUÉS DE UNA BAJA, Y QUÉ SALE ANTES DE LA COLA.
//
// ── LOS DOS AGUJEROS QUE ESTO TAPA ───────────────────────────────────────────────────────────
//
// 1. Quien se dio de baja y VOLVÍA a rellenar el formulario se quedaba sin su código: el alta se
//    guardaba, el carné se creaba, el mensaje se encolaba… y el worker lo descartaba porque
//    `marketing_prefs.baja` seguía a 1. Esa persona acababa de pedir el código y no le llegaba.
//
// 2. El tope diario es GLOBAL —y debe serlo, porque protege el número—, pero la cola iba por
//    orden de llegada. Una campaña comercial de trescientos agotaba el cupo y el carné de quien
//    se apuntó a las ocho de la tarde no salía hasta el día siguiente.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cupoPorPrioridad, hayCupoParaAlgo, cuantasSacar, RESERVA_ALTAS }
  from "../src/modules/captacion/cola.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const esquemaCap = readFileSync(new URL("../src/modules/captacion/schema.js", import.meta.url), "utf8");
const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|--)/.test(l)).join("\n");
const ruta = (firma) => {
  const i = server.indexOf(firma);
  if (i < 0) throw new Error(`no existe la ruta ${firma}`);
  return server.slice(i, server.indexOf("\n});", i) + 4);
};
const ALTA = ruta('app.post("/api/publico/formulario/:clave"');
const BAJA = ruta('app.post("/baixa"');
const WORKER = server.slice(server.indexOf("async function capVaciarCola()"),
                            server.indexOf("async function capVaciarCola()") + 7000);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · REINSCRIPCIÓN DESPUÉS DE UNA BAJA
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * La casa en pequeño. Hace LO MISMO que el servidor: el alta reactiva, la baja desactiva, y el
 * worker vuelve a mirar antes de mandar. Con esto se puede recorrer alta → baja → alta entera.
 */
function casa() {
  const consent = [];            // fid_consentimientos, de solo añadir
  const bajas = [];              // fid_bajas
  const prefs = new Map();       // marketing_prefs
  const carnes = [];             // pro_qr
  const cola = [];               // cap_cola
  const enviados = [];
  let reloj = 0;
  const t9 = (t) => String(t).replace(/[^0-9]/g, "").slice(-9);
  const ahora = () => `2026-09-15T10:${String(reloj++).padStart(2, "0")}:00+02:00`;

  const c = {
    consent, bajas, prefs, carnes, cola, enviados,

    /** POST del formulario, con consentimiento aceptado y WhatsApp comprobado. */
    apuntar(tel, { clave = "esmorzar-girona", version = 1 } = {}) {
      const cuando = ahora();
      // 1. lead (aquí no hace falta: lo que importa es el resto)
      // 2. consentimiento, SIEMPRE una fila nueva
      consent.push({ telefono: tel, formulario_clave: clave, formulario_version: version,
        texto: "Omplint aquest formulari…", creado_en: cuando, baja_en: null, baja_origen: null });
      // 3. reactivar: es la única vía que pone baja = 0
      prefs.set(t9(tel), { baja: 0, opt_in_wa: 1, updated_at: cuando });
      // 4. carné: se REUTILIZA el que ya tenga
      let qr = carnes.find((x) => t9(x.telefono) === t9(tel) && !x.anulado_en);
      if (!qr) { qr = { id: carnes.length + 1, telefono: tel, anulado_en: null, enviado_en: null }; carnes.push(qr); }
      // 5. cola, con clave idempotente y prioridad 0. `ciclo` = cuántas bajas confirmadas lleva:
      //    es lo que distingue «volver a apuntarse» de «pulsar dos veces».
      const ciclo = bajas.filter((b) => t9(b.telefono) === t9(tel) && b.confirmado_en).length;
      const token = `alta:${clave}:v${version}:${clave}:${t9(tel)}:${qr.id}:c${ciclo}`;
      if (!cola.some((m) => m.token === token)) {
        cola.push({ id: cola.length + 1, token, telefono: tel, estado: "pendiente", pausado: false,
          prioridad: 0, qr_id: qr.id, creado_en: cuando });
      }
      return { qr, token };
    },

    /** POST /baixa confirmado. */
    darDeBaja(tel) {
      const cuando = ahora();
      bajas.push({ telefono: tel, confirmado_en: cuando });
      prefs.set(t9(tel), { ...(prefs.get(t9(tel)) || {}), baja: 1, updated_at: cuando });
      for (const x of consent) if (t9(x.telefono) === t9(tel) && !x.baja_en) { x.baja_en = cuando; x.baja_origen = "enlace"; }
      for (const m of cola) if (m.telefono === tel && m.estado === "pendiente") m.estado = "descartado";
      return cuando;
    },

    /** Una comunicación comercial: prioridad 1. */
    encolarComercial(tel, id = 1) {
      cola.push({ id: cola.length + 1, token: `com:${id}:${tel}`, telefono: tel, estado: "pendiente",
        pausado: false, prioridad: 1, qr_id: null, creado_en: ahora() });
    },

    pausarComercial(id) {
      for (const m of cola) if (m.token.startsWith(`com:${id}:`) && m.estado === "pendiente") m.pausado = true;
    },

    /** El worker, con el MISMO orden, cupo y comprobaciones que el de verdad. */
    async vaciar({ max = 40, usados = 0, entre = null } = {}) {
      const cupo = cupoPorPrioridad({ max, usados });
      if (!hayCupoParaAlgo(cupo)) return enviados;
      const lote = cola.filter((m) => m.estado === "pendiente" && !m.pausado)
        .sort((a, b) => a.prioridad - b.prioridad || a.id - b.id);
      if (entre) await entre();
      let gastados = 0;
      for (const m of lote) {
        const esAlta = m.prioridad === 0;
        const quedan = (esAlta ? cupo.altas : cupo.comercial) - gastados;
        if (quedan <= 0) { if (!esAlta) continue; break; }
        // Se vuelve a mirar, y se RECLAMA la fila: dos workers no la cogen los dos.
        const vivo = cola.find((x) => x.id === m.id);
        if (!vivo || vivo.estado !== "pendiente" || vivo.pausado || vivo.cogida) continue;
        vivo.cogida = true;
        // Y la baja, justo antes de mandar.
        const p = prefs.get(t9(vivo.telefono));
        if (p && Number(p.baja) === 1) { vivo.estado = "descartado"; vivo.cogida = false; continue; }
        vivo.estado = "enviado"; vivo.enviado_en = ahora(); vivo.cogida = false;
        const qr = carnes.find((x) => x.id === vivo.qr_id);
        if (qr) qr.enviado_en = vivo.enviado_en;
        enviados.push(vivo.token);
        gastados += 1;
      }
      return enviados;
    },

    puedeRecibir: (tel) => { const p = prefs.get(t9(tel)); return !(p && Number(p.baja) === 1); },
  };
  return c;
}
const TEL = "600111222";

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("ALTA → BAJA → NUEVA ALTA", () => {
  test("el recorrido entero, con todo lo que tiene que quedar", async () => {
    const c = casa();

    // ── 1. Se apunta ──
    const primera = c.apuntar(TEL);
    await c.vaciar();
    assert.equal(c.enviados.length, 1, "no le llegó su código la primera vez");
    assert.equal(c.carnes.length, 1);

    // ── 2. Se da de baja ──
    const cuandoBaja = c.darDeBaja(TEL);
    assert.equal(c.puedeRecibir(TEL), false);
    assert.equal(c.consent[0].baja_en, cuandoBaja, "el consentimiento no se cerró");

    // ── 3. Vuelve a apuntarse ──
    const segunda = c.apuntar(TEL);

    // UN SOLO CLIENTE Y UN SOLO CARNÉ: el de siempre, reutilizado.
    assert.equal(c.carnes.length, 1, "se ha creado un segundo carné");
    assert.equal(segunda.qr.id, primera.qr.id, "el carné no es el mismo");

    // DOS CONSENTIMIENTOS HISTÓRICOS, y el viejo intacto.
    assert.equal(c.consent.length, 2);
    assert.equal(c.consent[0].baja_en, cuandoBaja, "se ha reescrito el consentimiento viejo");
    assert.equal(c.consent[1].baja_en, null, "el nuevo nace cerrado");
    // Y la baja anterior sigue escrita: es la prueba de que en su día lo pidió.
    assert.equal(c.bajas.length, 1);
    assert.equal(c.bajas[0].confirmado_en, cuandoBaja);

    // REACTIVADA, y con el canal puesto.
    assert.equal(c.puedeRecibir(TEL), true, "sigue de baja después de volver a apuntarse");
    assert.equal(c.prefs.get("600111222").opt_in_wa, 1);

    // NUEVA COLA: su código vuelve a salir, y con una clave distinta de la primera.
    assert.notEqual(segunda.token, primera.token, "la clave idempotente no distingue las dos altas");
    await c.vaciar();
    assert.equal(c.enviados.length, 2, "no le ha vuelto a llegar el código");
    assert.equal(c.enviados[1], segunda.token);
  });

  test("y repetir el POST de la segunda alta NO duplica nada", async () => {
    const c = casa();
    c.apuntar(TEL); await c.vaciar();
    c.darDeBaja(TEL);
    c.apuntar(TEL); c.apuntar(TEL); c.apuntar(TEL);   // tres veces: recarga, doble clic…
    assert.equal(c.carnes.length, 1, "se han creado carnés de más");
    assert.equal(c.cola.filter((m) => m.prioridad === 0).length, 2, "se ha encolado de más");
    await c.vaciar();
    assert.equal(c.enviados.length, 2);
  });

  test("sin volver a apuntarse, sigue de baja y no se le manda nada", async () => {
    const c = casa();
    c.apuntar(TEL); await c.vaciar();
    c.darDeBaja(TEL);
    c.encolarComercial(TEL);
    await c.vaciar();
    assert.equal(c.enviados.length, 1, "le ha salido algo estando de baja");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("LA REACTIVACIÓN SOLO OCURRE AL COMPLETAR EL FORMULARIO", () => {
  test("es la ÚNICA línea de toda la casa que pone baja = 0", () => {
    // Un enlace reenviado por un grupo no puede reactivar a nadie.
    const escrituras = sinComentarios(server)
      .split("\n").filter((l) => /baja\s*=\s*0\b/.test(l) && !/COALESCE/.test(l));
    assert.equal(escrituras.length, 1, `hay ${escrituras.length} sitios que reactivan:\n${escrituras.join("\n")}`);
    assert.ok(ALTA.includes(escrituras[0].trim()), "la reactivación no está en el alta");
  });

  test("y va DESPUÉS de aceptar el consentimiento y de comprobar WhatsApp", () => {
    const iConsent = ALTA.indexOf("if (b.consentimiento !== true)");
    const iWa = ALTA.indexOf("if (f.exige_whatsapp)");
    const iReact = ALTA.indexOf("INSERT INTO marketing_prefs (telefono, opt_in_wa, baja, idioma, updated_at)");
    assert.ok(iConsent > 0 && iReact > iConsent, "reactiva antes de comprobar el consentimiento");
    assert.ok(iWa > 0 && iReact > iWa, "reactiva antes de comprobar WhatsApp");
  });

  test("dentro de la MISMA transacción que el consentimiento", () => {
    // Si el consentimiento no se guarda, la reactivación tampoco: no puede quedar alguien
    // reactivado sin la fila que lo justifica.
    // El recorte LANZA si el ancla no está. Cuando el comentario que la marcaba se reescribió,
    // `indexOf` devolvió -1, el recorte se tragó la SEGUNDA transacción del alta —la del carné y
    // su mensaje, que sí escribe en `fid_bajas` y debe hacerlo— y el candado dio un falso
    // positivo. Lo que vigila es la transacción del LEAD, y solo esa.
    const tx = (() => {
      const fin = ALTA.indexOf("// ── 3 y 4. EL CARNÉ Y SU MENSAJE");
      if (fin < 0) throw new Error("no se encuentra el final de la transacción del lead");
      return ALTA.slice(ALTA.indexOf("await fidTransaccion("), fin);
    })();
    assert.match(tx, /INSERT INTO fid_consentimientos/);
    assert.match(tx, /INSERT INTO marketing_prefs \(telefono, opt_in_wa, baja, idioma, updated_at\)/);
  });

  test("NINGÚN GET reactiva: ni la vista previa ni abrir el enlace de baja", () => {
    const GET_FORM = ruta('app.get("/api/publico/formulario/:clave"');
    const GET_BAJA = ruta('app.get("/baixa"');
    for (const [n, r] of [["GET del formulario", GET_FORM], ["GET de baja", GET_BAJA]]) {
      const cuerpo = sinComentarios(r);
      assert.ok(!/marketing_prefs/.test(cuerpo), `${n} toca marketing_prefs`);
      for (const e of ["INSERT ", "UPDATE ", "dbRun("]) {
        assert.ok(!cuerpo.includes(e), `${n} hace ${e.trim()}`);
      }
    }
  });

  test("y el POST de baja NO tiene vuelta atrás", () => {
    const cuerpo = sinComentarios(BAJA);
    assert.ok(!/baja = 0|baja = FALSE|reactivar/.test(cuerpo), "el enlace de baja puede reactivar");
    assert.match(cuerpo, /UPDATE marketing_prefs SET baja = 1/);
  });

  test("lo anterior no se borra: el libro es de solo añadir", () => {
    // El recorte LANZA si el ancla no está. Cuando el comentario que la marcaba se reescribió,
    // `indexOf` devolvió -1, el recorte se tragó la SEGUNDA transacción del alta —la del carné y
    // su mensaje, que sí escribe en `fid_bajas` y debe hacerlo— y el candado dio un falso
    // positivo. Lo que vigila es la transacción del LEAD, y solo esa.
    const tx = (() => {
      const fin = ALTA.indexOf("// ── 3 y 4. EL CARNÉ Y SU MENSAJE");
      if (fin < 0) throw new Error("no se encuentra el final de la transacción del lead");
      return ALTA.slice(ALTA.indexOf("await fidTransaccion("), fin);
    })();
    assert.ok(!/UPDATE fid_consentimientos|DELETE FROM fid_consentimientos/.test(tx),
      "el alta reescribe consentimientos anteriores");
    // SIN COMENTARIOS: el de la reactivación explica que la fila de `fid_bajas` NO se toca, y esa
    // palabra no puede hacer fallar al candado que comprueba justo eso.
    assert.ok(!/fid_bajas/.test(sinComentarios(tx)), "la transacción del alta toca el registro de bajas");
    // El alta ya NO escribe en `fid_bajas`: su mensaje es una entrega y no lleva enlace de baja,
    // así que un token ahí no serviría para darse de baja de nada. Lo único que sigue tocando esa
    // tabla es la LECTURA del ciclo, que distingue «volvió tras una baja» de «pulsó dos veces».
    const usos = [...ALTA.matchAll(/(INSERT INTO|UPDATE|DELETE FROM) fid_bajas[^`]*/g)].map((m) => m[0]);
    assert.deepEqual(usos, [], "el alta escribe en el registro de bajas");
    assert.match(ALTA, /SELECT COUNT\(\*\)::int AS n FROM fid_bajas/,
      "se ha perdido el recuento de ciclos: quien vuelve tras una baja se quedaría sin su código");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · PRIORIDAD, TOPE, PAUSA Y CONCURRENCIA
// ═════════════════════════════════════════════════════════════════════════════════════════════

describe("EL ALTA VA DELANTE DE LO COMERCIAL", () => {
  test("aunque se encole la última", async () => {
    const c = casa();
    for (let i = 0; i < 5; i++) c.encolarComercial(`60000000${i}`, 1);
    const alta = c.apuntar(TEL);                 // el último en llegar
    await c.vaciar();
    assert.equal(c.enviados[0], alta.token, `salió antes: ${c.enviados[0]}`);
  });

  test("la cola se ordena por prioridad Y LUEGO por llegada", () => {
    assert.match(WORKER, /ORDER BY prioridad ASC, proximo_ms ASC LIMIT 50/);
  });

  test("es una COLUMNA, no un `LIKE` sobre el token", () => {
    // El orden de la cola no puede depender de cómo se escriba un identificador.
    assert.match(esquemaCap, /ADD COLUMN IF NOT EXISTS prioridad SMALLINT NOT NULL DEFAULT 1/);
    assert.match(esquemaCap, /idx_cap_cola_listos\s*\n?\s*ON cap_cola \(prioridad, proximo_ms\)/);
    assert.ok(!/prioridad[^\n]*LIKE/.test(WORKER), "la prioridad se deduce de un LIKE");
  });

  test("TODO lo que es un alta encola con prioridad 0, y solo lo comercial se queda sin ella", () => {
    // Tres sitios encolan altas: el formulario histórico, el configurable y la recuperación de
    // lo que nunca salió. Quien rellena uno espera igual que quien rellena el otro, y quien
    // lleva semanas esperando su código no puede ir detrás de una campaña de trescientos.
    //
    // Antes esto exigía que fueran EXACTAMENTE dos. Ese número escrito a mano no protegía nada:
    // un cuarto encolado nuevo con prioridad 1 —lo comercial— habría hecho fallar el test por el
    // recuento sin que nadie mirara la prioridad, y un tercero correcto lo hacía fallar también.
    // Lo que importa no es cuántos son, sino que NINGUNO que sea un alta use otra prioridad.
    const inserts = [...server.matchAll(/INSERT INTO cap_cola \(token[^`]*`,?\s*\n?\s*\[[^\]]*\]/g)].map((m) => m[0]);
    const conPrioridad = inserts.filter((i) => /prioridad\)/.test(i));
    assert.ok(conPrioridad.length >= 3,
      `solo ${conPrioridad.length} encolados declaran prioridad; deberían hacerlo los tres tipos de alta`);
    // Dos formas de escribir lo mismo: `VALUES (…,0)` y `SELECT ?,…,0 WHERE NOT EXISTS`. La
    // segunda existe porque el camino clásico no puede usar `ON CONFLICT` —su `token` es público
    // y por tanto aleatorio— y resuelve la idempotencia por identidad en el propio INSERT.
    for (const i of conPrioridad) {
      assert.ok(/,0\)/.test(i) || /,\s*0\s*\n/.test(i),
        "un alta encola con una prioridad que no es 0:\n" + i.slice(0, 200));
    }

    // Y el de comunicaciones NO la lleva: se queda en el 1 por defecto.
    const sinPrioridad = inserts.filter((i) => !/prioridad\)/.test(i));
    assert.equal(sinPrioridad.length, 1,
      "hay más de un encolado sin prioridad: solo el comercial puede quedarse sin ella");
    assert.ok(/com:/.test(server.slice(server.indexOf(sinPrioridad[0]) - 400, server.indexOf(sinPrioridad[0]))),
      "el encolado sin prioridad no es el comercial");
  });

  test("la recuperación encola como un alta, no como una comunicación", () => {
    // Si la recuperación encolara con prioridad 1 iría detrás de cualquier campaña, y son
    // precisamente las personas que llevan más tiempo esperando.
    const i = server.indexOf('app.post("/api/captacion/campanas/:clave/recuperar"');
    assert.ok(i > 0, "no se encuentra el endpoint de recuperación");
    const bloque = server.slice(i, i + 6000);
    const insert = bloque.match(/INSERT INTO cap_cola \(token[^`]*`/);
    assert.ok(insert, "la recuperación ya no encola en cap_cola");
    assert.match(insert[0], /prioridad\)/, "la recuperación no declara prioridad");
    assert.match(bloque, /VALUES \(\?,\?,\?,\?,\?,\?,\?,0\)/, "la recuperación no encola con prioridad 0");
  });
});

describe("EL TOPE ES GLOBAL, PERO CON RESERVA PARA ALTAS", () => {
  test("lo comercial se para antes; las altas llegan al tope", () => {
    const c = cupoPorPrioridad({ max: 40, usados: 0 });
    assert.equal(c.altas, 40);
    assert.equal(c.comercial, 30);
    assert.equal(c.reserva, RESERVA_ALTAS);
  });

  test("con lo comercial agotado, el alta SIGUE saliendo", async () => {
    const c = casa();
    for (let i = 0; i < 40; i++) c.encolarComercial(`6000000${i}`, 1);
    const alta = c.apuntar(TEL);
    // 30 usados: comercial a cero, altas con 10 de margen.
    await c.vaciar({ max: 40, usados: 30 });
    assert.ok(c.enviados.includes(alta.token), "el alta se quedó sin salir con la reserva libre");
  });

  test("y el worker NO se para cuando lo comercial se agota", () => {
    // Pararse ahí era lo que dejaba sin carné a quien acababa de apuntarse.
    assert.match(WORKER, /if \(!capHayCupo\(cupoTipo\)\) return;/);
    assert.match(WORKER, /if \(!esAlta\) continue;/);
    assert.equal(hayCupoParaAlgo({ altas: 5, comercial: 0 }), true);
    assert.equal(hayCupoParaAlgo({ altas: 0, comercial: 0 }), false);
  });

  test("NO ES UNA VÍA ILIMITADA: las altas siguen dentro del tope global", async () => {
    const c = casa();
    for (let i = 0; i < 20; i++) c.apuntar(`60011122${i}`, { clave: "x" });
    await c.vaciar({ max: 40, usados: 40 });        // cupo agotado del todo
    assert.equal(c.enviados.length, 0, "ha salido algo con el tope global agotado");
    assert.equal(cupoPorPrioridad({ max: 40, usados: 40 }).altas, 0);
  });

  test("la reserva nunca se come el cupo entero", () => {
    // Con topes pequeños, guardar diez habría dejado lo comercial a cero siempre.
    assert.equal(cupoPorPrioridad({ max: 4, usados: 0 }).comercial, 2);
    assert.equal(cupoPorPrioridad({ max: 10, usados: 0 }).comercial, 5);
    assert.equal(cupoPorPrioridad({ max: 0, usados: 0 }).reserva, 0);
  });

  test("y sigue habiendo ritmo entre mensajes", () => {
    assert.match(WORKER, /capCuantasSacar\(/);
    assert.equal(cuantasSacar({ pendientes: 100, cupoQuedan: 100 }), 12);
  });
});

describe("PAUSAR UNA CAMPAÑA COMERCIAL NO DETIENE UN ALTA", () => {
  test("el alta sale igual con la campaña pausada", async () => {
    const c = casa();
    for (let i = 0; i < 3; i++) c.encolarComercial(`6000000${i}`, 7);
    const alta = c.apuntar(TEL);
    c.pausarComercial(7);
    await c.vaciar();
    assert.deepEqual(c.enviados, [alta.token], `salió algo pausado: ${c.enviados.join(", ")}`);
  });

  test("porque la pausa se aplica por la clave de SU comunicación, no a toda la cola", () => {
    const pausa = ruta('app.post("/api/fidelizacion/comunicaciones/:id/pausa"');
    assert.match(pausa, /WHERE token LIKE \? AND estado = 'pendiente'/);
    assert.match(pausa, /`com:\$\{c\.id\}:%`/);
    // Y una clave de alta nunca empieza por `com:`.
    assert.match(ALTA, /`alta:\$\{clave\}/);
  });

  test("y cancelar tampoco lo toca", () => {
    const cancelar = ruta('app.post("/api/fidelizacion/comunicaciones/:id/cancelar"');
    for (const u of [...cancelar.matchAll(/UPDATE cap_cola SET[^`]*/g)].map((m) => m[0])) {
      assert.match(u, /token LIKE/, "cancelar alcanza a toda la cola");
    }
  });
});

describe("LA DOBLE EJECUCIÓN NO DUPLICA", () => {
  test("dos pasadas a la vez mandan cada mensaje UNA vez", async () => {
    const c = casa();
    const a = c.apuntar(TEL);
    c.encolarComercial("600999888");
    await Promise.all([c.vaciar(), c.vaciar()]);
    assert.equal(new Set(c.enviados).size, c.enviados.length, "un mensaje ha salido dos veces");
    assert.ok(c.enviados.includes(a.token));
  });

  test("la fila se RECLAMA antes de mandar, con la condición en el WHERE", () => {
    // `capColaCorriendo` solo protege DENTRO de un proceso. Con dos instancias —un despliegue
    // solapado— los dos leerían la misma fila `pendiente` y los dos la mandarían.
    assert.match(WORKER, /UPDATE cap_cola SET proximo_ms = \? WHERE id = \? AND estado = 'pendiente' AND proximo_ms = \?\s*\n?\s*RETURNING id/);
    assert.match(WORKER, /if \(!cogida\) continue;/);
  });

  test("es un ARRENDAMIENTO: si el proceso muere, la fila se reintenta sola", () => {
    // Un estado `enviando` habría obligado a tocar el CHECK de la tabla, que es de las
    // migraciones que bloquean un despliegue.
    assert.match(server, /const CAP_ARRIENDO_MS = \d+;/);
    assert.match(WORKER, /Date\.now\(\) \+ CAP_ARRIENDO_MS/);
    assert.match(esquemaCap, /CHECK \(estado IN \('pendiente','enviado','fallido','descartado'\)\)/);
  });

  test("y se reclama DESPUÉS de mirar pausa y ANTES de mandar", () => {
    const iVivo = WORKER.indexOf("SELECT estado, pausado FROM cap_cola WHERE id = ?");
    const iCoger = WORKER.indexOf("UPDATE cap_cola SET proximo_ms = ? WHERE id = ?");
    const iBaja = WORKER.indexOf("SELECT baja FROM marketing_prefs");
    const iMandar = WORKER.indexOf("sendMensajeLibre");
    assert.ok(iVivo > 0 && iCoger > iVivo, "se reclama antes de mirar la pausa");
    assert.ok(iBaja > iCoger, "se mira la baja antes de reclamar");
    assert.ok(iMandar > iBaja, "se manda antes de mirar la baja");
  });

  test("y sigue el cerrojo de reentrada del propio proceso", () => {
    assert.match(server, /let capColaCorriendo = false;/);
    assert.match(WORKER, /if \(capColaCorriendo\) return;/);
  });
});

describe("nada de esto enciende nada", () => {
  test("ni puntos ni puerta", () => {
    for (const p of ["fid_puerta", "fid_movimientos", "aplicarPrograma", "conceder"]) {
      assert.ok(!ALTA.includes(p), `el alta toca ${p}`);
      assert.ok(!WORKER.includes(p), `el worker toca ${p}`);
    }
  });

  test("y el mensaje del alta es una ENTREGA: ya no lleva enlace de baja", () => {
    // La regla se invirtió a propósito. Antes llevaba pie porque «lleva un descuento dentro»;
    // ahora no, porque la persona rellenó el formulario hace diez segundos PARA recibir ese
    // código y no se la ha metido en ninguna lista. Las comunicaciones comerciales posteriores
    // sí lo llevan, y eso tiene su propio test en `mensaje-entrega-sin-baja`.
    assert.match(ALTA, /tipo: FID_TIPO_MENSAJE\.ENTREGA/,
      "el mensaje del alta ha dejado de declararse como entrega");
    const codigo = ALTA.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    assert.ok(!/fidConPieBaja|if \(!urlBaja\) return/.test(codigo),
      "la entrega vuelve a componer un enlace de baja, o a bloquearse si no puede componerlo");
  });
});
