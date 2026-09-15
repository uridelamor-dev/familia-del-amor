// LA BAJA, EJECUTADA. Una base de mentira que hace LO MISMO que la de verdad.
//
// El otro fichero (`baja.test.js`) lee el código y blinda invariantes. Este lo ejecuta: emite un
// enlace, lo abre como lo abriría un bot, lo confirma, lo vuelve a confirmar, mete una carrera con
// el worker y vuelve a apuntar a la misma persona. Son los casos que un test de texto no ve.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { nuevoToken, huella, tokenPlausible, enlaceBaja, conPieDeBaja, pieBaja, decidir }
  from "../src/modules/fidelizacion/baja.js";

/**
 * La casa en pequeño: las cuatro tablas que toca una baja y las operaciones que hace el servidor.
 * Cada método copia la consulta real, incluida la condición que va en el `WHERE`.
 */
function casa() {
  const bajas = [];            // fid_bajas
  const prefs = new Map();     // marketing_prefs: telefono → { baja }
  const consent = [];          // fid_consentimientos
  const cola = [];             // cap_cola
  const enviados = [];
  let reloj = 0;
  const ahora = () => `2026-09-15T10:${String(reloj++).padStart(2, "0")}:00+02:00`;

  const casa = {
    bajas, prefs, consent, cola, enviados,

    /** Alguien se apunta: consentimiento nuevo y explícito. */
    apuntar(tel, { campana = "esmorzar-girona", politica = 1 } = {}) {
      consent.push({ telefono: tel, campana, politica_version: politica,
        texto: "Omplint aquest formulari…", creado_en: ahora(), baja_en: null });
      // Apuntarse NO quita una baja anterior por sí solo: eso lo decide quien llama.
      return consent[consent.length - 1];
    },

    /** Encolar una comunicación: un token por mensaje, y el enlace dentro del texto. */
    encolar(tel, { comunicacion = 1, idioma = "ca", base = "https://familiadelamor.org" } = {}) {
      const token = nuevoToken();
      const url = enlaceBaja(base, token);
      if (!url) return null;                       // sin enlace no sale el mensaje
      bajas.push({ id: bajas.length + 1, token_hash: huella(token), telefono: tel,
        comunicacion_id: comunicacion, creado_en: ahora(), confirmado_en: null, descartados: 0 });
      cola.push({ id: cola.length + 1, telefono: tel, estado: "pendiente", pausado: false,
        texto: conPieDeBaja("Hola!", url, { pie: pieBaja(idioma) }) });
      return { token, url };
    },

    /** GET /baixa — SOLO MIRA. */
    abrir(token) {
      const fila = tokenPlausible(token)
        ? bajas.find((b) => b.token_hash === huella(token)) : null;
      return decidir(fila || null, { confirmar: false });
    },

    /** POST /baixa — la baja de verdad. */
    confirmar(token) {
      const fila = tokenPlausible(token)
        ? bajas.find((b) => b.token_hash === huella(token)) : null;
      const d = decidir(fila || null, { confirmar: true });
      if (!d.aplicar) return d;

      // SOLO GANA UNA: la condición va en el WHERE.
      if (fila.confirmado_en) return { estado: "ya_estaba", aplicar: false, codigo: 200 };
      fila.confirmado_en = ahora();

      prefs.set(tel9(fila.telefono), { baja: 1 });
      for (const c of consent) if (tel9(c.telefono) === tel9(fila.telefono) && !c.baja_en) {
        c.baja_en = fila.confirmado_en; c.baja_origen = "enlace";
      }
      const pendientes = cola.filter((m) => m.telefono === fila.telefono && m.estado === "pendiente");
      fila.descartados = pendientes.length;
      for (const m of pendientes) { m.estado = "descartado"; m.pausado = false; }
      return { estado: "vale", aplicar: true, codigo: 200, descartados: fila.descartados };
    },

    /** El worker: lee un lote y, antes de mandar cada uno, vuelve a mirar fila Y baja. */
    async vaciar({ entre = null } = {}) {
      const lote = cola.filter((m) => m.estado === "pendiente" && !m.pausado);
      if (entre) await entre();
      for (const m of lote) {
        const vivo = cola.find((x) => x.id === m.id);
        if (!vivo || vivo.estado !== "pendiente" || vivo.pausado) continue;
        // LA SEGUNDA COMPROBACIÓN, la que gana la carrera de verdad.
        const pref = prefs.get(tel9(vivo.telefono));
        if (pref && Number(pref.baja) === 1) { vivo.estado = "descartado"; continue; }
        vivo.estado = "enviado";
        enviados.push(vivo.id);
      }
      return enviados.length;
    },

    /** ¿Se le puede escribir? Es lo que consulta toda la casa. */
    puedeRecibir(tel) {
      const p = prefs.get(tel9(tel));
      return !(p && Number(p.baja) === 1);
    },
  };
  return casa;
}
const tel9 = (t) => String(t || "").replace(/[^0-9]/g, "").slice(-9);

const TEL = "600111222";

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("el camino normal", () => {
  test("se apunta, se le encola, abre el enlace y confirma", async () => {
    const c = casa();
    c.apuntar(TEL);
    const { token, url } = c.encolar(TEL);
    assert.ok(url.startsWith("https://"));
    assert.ok(c.cola[0].texto.includes(url), "el mensaje no lleva el enlace");

    assert.equal(c.abrir(token).estado, "vale");
    assert.equal(c.confirmar(token).estado, "vale");

    assert.equal(c.puedeRecibir(TEL), false, "sigue pudiendo recibir mensajes");
    assert.equal(c.consent[0].baja_en !== null, true, "el consentimiento sigue abierto");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("EL ENLACE RASTREADO POR UN BOT", () => {
  test("abrirlo cien veces NO da de baja a nadie", async () => {
    // Es el caso real: WhatsApp dibuja la vista previa, el antivirus del trabajo lo comprueba,
    // el buscador lo indexa. Ninguno pulsa el botón.
    const c = casa();
    c.apuntar(TEL);
    const { token } = c.encolar(TEL);
    for (let i = 0; i < 100; i++) assert.equal(c.abrir(token).estado, "vale");

    assert.equal(c.puedeRecibir(TEL), true, "UN BOT HA DADO DE BAJA A ALGUIEN");
    assert.equal(c.bajas[0].confirmado_en, null);
    // Y el mensaje sigue en la cola, listo para salir.
    await c.vaciar();
    assert.deepEqual(c.enviados, [1]);
  });

  test("y después de que el bot lo abra, la persona todavía puede darse de baja", () => {
    const c = casa();
    c.apuntar(TEL);
    const { token } = c.encolar(TEL);
    c.abrir(token); c.abrir(token);
    assert.equal(c.confirmar(token).estado, "vale");
    assert.equal(c.puedeRecibir(TEL), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("DOBLE BAJA", () => {
  test("confirmar dos veces da el mismo resultado y NO mueve la fecha", () => {
    const c = casa();
    c.apuntar(TEL);
    const { token } = c.encolar(TEL);

    assert.equal(c.confirmar(token).estado, "vale");
    const primera = c.bajas[0].confirmado_en;

    for (let i = 0; i < 5; i++) {
      const r = c.confirmar(token);
      assert.equal(r.estado, "ya_estaba");
      assert.equal(r.aplicar, false);
    }
    assert.equal(c.bajas[0].confirmado_en, primera, "se ha movido la fecha de baja");
    // Y el libro de consentimientos no ha ganado filas de baja repetidas.
    assert.equal(c.consent.filter((x) => x.baja_en).length, 1);
  });

  test("dos enlaces distintos de la misma persona: el segundo dice «ya estaba»", () => {
    // Cada mensaje lleva su token. Si recibió tres, tiene tres enlaces válidos.
    const c = casa();
    c.apuntar(TEL);
    const a = c.encolar(TEL, { comunicacion: 1 });
    const b = c.encolar(TEL, { comunicacion: 2 });

    assert.equal(c.confirmar(a.token).estado, "vale");
    assert.equal(c.confirmar(b.token).estado, "vale", "el segundo enlace debería aplicar su propia fila");
    // Los dos quedan confirmados, pero la persona solo está de baja una vez.
    assert.equal(c.prefs.get(tel9(TEL)).baja, 1);
    assert.equal(c.consent.filter((x) => x.baja_en).length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("TOKEN INVÁLIDO", () => {
  test("lo que no existe y lo que no tiene forma contestan IGUAL", () => {
    // Si se distinguieran, probando enlaces se sabría cuáles son de verdad.
    const c = casa();
    c.apuntar(TEL); c.encolar(TEL);
    for (const malo of ["", "abc", nuevoToken(), "../../etc", "a".repeat(200), null]) {
      const r = c.abrir(malo);
      assert.equal(r.estado, "no_existe", String(malo));
      assert.equal(r.codigo, 404);
    }
  });

  test("y no dan de baja a nadie", () => {
    const c = casa();
    c.apuntar(TEL); c.encolar(TEL);
    for (const malo of ["", "abc", nuevoToken()]) assert.equal(c.confirmar(malo).aplicar, false);
    assert.equal(c.puedeRecibir(TEL), true);
  });

  test("un token de otra persona da de baja a ESA otra persona, no a quien lo abre", () => {
    const c = casa();
    c.apuntar(TEL); c.apuntar("600999888");
    const mio = c.encolar(TEL);
    c.encolar("600999888");
    c.confirmar(mio.token);
    assert.equal(c.puedeRecibir(TEL), false);
    assert.equal(c.puedeRecibir("600999888"), true, "se ha dado de baja a quien no era");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("LOS MENSAJES PENDIENTES", () => {
  test("los que no han salido se descartan; los enviados NO se tocan", async () => {
    const c = casa();
    c.apuntar(TEL);
    const uno = c.encolar(TEL, { comunicacion: 1 });
    await c.vaciar();                                  // el primero sale
    assert.deepEqual(c.enviados, [1]);

    c.encolar(TEL, { comunicacion: 2 });
    c.encolar(TEL, { comunicacion: 3 });
    const r = c.confirmar(uno.token);
    assert.equal(r.descartados, 2);

    // El enviado sigue diciendo que se envió: un WhatsApp entregado no se retira, y reescribir
    // el registro sería mentir sobre lo que pasó.
    assert.equal(c.cola[0].estado, "enviado");
    assert.deepEqual(c.cola.slice(1).map((m) => m.estado), ["descartado", "descartado"]);

    await c.vaciar();
    assert.deepEqual(c.enviados, [1], "ha salido un mensaje después de la baja");
  });

  test("no toca los mensajes de OTRA persona", async () => {
    const c = casa();
    c.apuntar(TEL); c.apuntar("600999888");
    const mio = c.encolar(TEL);
    c.encolar("600999888");
    c.confirmar(mio.token);
    await c.vaciar();
    assert.deepEqual(c.enviados, [2], "se han descartado mensajes ajenos");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("LA CARRERA CON EL WORKER", () => {
  test("darse de baja MIENTRAS el worker procesa corta el resto del lote", async () => {
    // El lote ya está leído en memoria. Sin la segunda comprobación, los mensajes saldrían igual.
    const c = casa();
    c.apuntar(TEL);
    const t = c.encolar(TEL, { comunicacion: 1 });
    c.encolar(TEL, { comunicacion: 2 });
    c.encolar(TEL, { comunicacion: 3 });

    await c.vaciar({ entre: () => c.confirmar(t.token) });
    assert.deepEqual(c.enviados, [], "SE HA ENVIADO UN MENSAJE DESPUÉS DE LA BAJA");
  });

  test("y lo que se escape del descarte lo frena la comprobación de baja", async () => {
    // Se simula el hueco: la baja se marca pero el descarte no llega a aplicarse.
    const c = casa();
    c.apuntar(TEL);
    c.encolar(TEL);
    c.prefs.set(tel9(TEL), { baja: 1 });          // solo la baja global, sin tocar la cola
    await c.vaciar();
    assert.deepEqual(c.enviados, [], "el worker ha mandado a alguien de baja");
    assert.equal(c.cola[0].estado, "descartado");
  });

  test("dos ejecuciones simultáneas del worker no duplican", async () => {
    const c = casa();
    c.apuntar(TEL);
    c.encolar(TEL); c.encolar(TEL);
    await Promise.all([c.vaciar(), c.vaciar()]);
    assert.equal(new Set(c.enviados).size, c.enviados.length, "un mensaje ha salido dos veces");
  });

  test("dos confirmaciones a la vez aplican la baja UNA sola vez", () => {
    const c = casa();
    c.apuntar(TEL);
    const t = c.encolar(TEL);
    const r = [c.confirmar(t.token), c.confirmar(t.token)];
    assert.deepEqual(r.map((x) => x.estado), ["vale", "ya_estaba"]);
    assert.equal(c.consent.filter((x) => x.baja_en).length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("VOLVER A APUNTARSE", () => {
  test("apuntarse otra vez NO quita la baja por sí solo", () => {
    // Rellenar el formulario crea un consentimiento nuevo; que eso levante la baja es una
    // decisión aparte, y tiene que ser explícita. Un alta que reactivara sola convertiría
    // cualquier sorteo en una forma de volver a escribir a quien pidió que le dejaran en paz.
    const c = casa();
    c.apuntar(TEL);
    const t = c.encolar(TEL);
    c.confirmar(t.token);
    assert.equal(c.puedeRecibir(TEL), false);

    c.apuntar(TEL, { campana: "otra-campanya" });
    assert.equal(c.puedeRecibir(TEL), false, "un alta nueva ha reactivado a alguien de baja");
  });

  test("el consentimiento nuevo queda registrado aparte, con su fecha y su campaña", () => {
    const c = casa();
    c.apuntar(TEL);
    const t = c.encolar(TEL);
    c.confirmar(t.token);
    c.apuntar(TEL, { campana: "otra-campanya", politica: 2 });

    assert.equal(c.consent.length, 2);
    const [viejo, nuevo] = c.consent;
    assert.ok(viejo.baja_en, "el consentimiento viejo no se cerró");
    assert.equal(nuevo.baja_en, null);
    assert.equal(nuevo.campana, "otra-campanya");
    assert.equal(nuevo.politica_version, 2, "no se guarda qué política aceptó esta vez");
    // Y el viejo NO se reescribe: el libro es de solo añadir.
    assert.equal(viejo.campana, "esmorzar-girona");
    assert.equal(viejo.politica_version, 1);
  });

  test("la baja anterior se conserva: es la prueba de que pidió que le dejaran en paz", () => {
    const c = casa();
    c.apuntar(TEL);
    const t = c.encolar(TEL);
    c.confirmar(t.token);
    const cuando = c.bajas[0].confirmado_en;
    c.apuntar(TEL);
    assert.equal(c.bajas[0].confirmado_en, cuando);
  });
});
