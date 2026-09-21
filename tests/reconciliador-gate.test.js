// UN DESPLIEGUE NO PUEDE ESCRIBIRLE A NADIE POR SU CUENTA.
//
// ── LAS DOS COSAS QUE HAY QUE MANTENER SEPARADAS ────────────────────────────────────────────
//
//   A) Que las altas NUEVAS lleguen. Eso tiene que funcionar en cuanto se publique, y NO pasa
//      por el reconciliador: el alta escribe su fila dentro de su propia transacción, antes de
//      contestar al formulario.
//   B) Recuperar altas VIEJAS. Eso significa escribirle hoy a gente que se apuntó hace semanas,
//      a una campaña que puede haber terminado. No lo puede decidir un despliegue.
//
// Si el reconciliador naciera abierto, el primer Publish mezclaría las dos: a los cinco minutos
// empezarían a salir mensajes antiguos sin que nadie los hubiera autorizado. Este fichero es el
// candado de esa separación.
//
// ── Y NO SALE NI UN MENSAJE AL EJECUTARLO ───────────────────────────────────────────────────
//
// No se importa `whatsapp.js` en ninguna línea, no se abre ningún socket y no se arranca el
// servidor. Lo único que se ejecuta de verdad es la decisión del gate, que es una función pura.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { historicoAbierto, GATE_HISTORICO } from "../src/modules/captacion/recuperacion.js";

const SERVER = readFileSync(new URL("../server.js", import.meta.url), "utf8");

/**
 * El cuerpo de un bloque, contando llaves desde su ancla. LANZA si el ancla no está.
 *
 * ── DÓNDE EMPIEZA EL CUERPO, QUE NO ES OBVIO ────────────────────────────────────────────────
 *
 * Hay dos formas y las dos aparecen en `server.js`:
 *   · `function f({ a, b }) { … }` — la primera llave es el destructuring, no el cuerpo.
 *   · `app.post("/x", auth, async (q, r) => { … })` — la del cuerpo va DENTRO de los paréntesis
 *     de `app.post(`, así que nunca está a profundidad cero de paréntesis.
 *
 * Una versión anterior buscaba «la primera llave a profundidad cero» y en el segundo caso no la
 * encontraba: devolvía entonces el RESTO DEL FICHERO. Las aserciones seguían pasando, porque
 * encontraban lo que buscaban en cualquier otro sitio, y dos mutaciones deliberadas se colaron
 * sin que nadie se enterara. Por eso se busca primero la flecha.
 */
function bloque(texto, ancla) {
  const i = texto.indexOf(ancla);
  if (i === -1) throw new Error(`ancla no encontrada: «${ancla}»`);
  const flecha = texto.slice(i, i + 400).search(/=>\s*\{/);
  let abre = -1;
  if (flecha >= 0) {
    abre = texto.indexOf("{", i + flecha);
  } else {
    let par = 0;
    for (let k = i; k < texto.length; k++) {
      const c = texto[k];
      if (c === "(") par += 1;
      else if (c === ")") par -= 1;
      else if (c === "{" && par === 0) { abre = k; break; }
    }
  }
  if (abre === -1) throw new Error(`no se encuentra el cuerpo de «${ancla}»`);
  let prof = 0, j = abre;
  for (; j < texto.length; j += 1) {
    if (texto[j] === "{") prof += 1;
    else if (texto[j] === "}") { prof -= 1; if (prof === 0) { j += 1; break; } }
  }
  if (prof !== 0) throw new Error(`bloque sin cerrar en «${ancla}»`);
  return texto.slice(i, j);
}

const RECONCILIADOR = bloque(SERVER, "async function capReconciliar()");
const ALTA_CLASICA = bloque(SERVER, 'app.post("/api/captacion", async');
const ALTA_FORM = bloque(SERVER, 'app.post("/api/publico/formulario/:clave"');
const WORKER = bloque(SERVER, "async function capVaciarCola()");

/**
 * El reconciliador, con su decisión y sin su base: mismas ramas, mismo orden.
 *
 * Se simula para poder EJECUTAR la propiedad que importa —que con la puerta cerrada no se escribe
 * nada— en vez de solo leerla en el fuente. La correspondencia con el servidor la sostienen las
 * pruebas de cableado de más abajo.
 */
function reconciliar({ configuracion, huerfanos = [] }) {
  const escritas = [];
  const abierto = historicoAbierto(configuracion);
  if (!huerfanos.length) return { mirados: 0, encolados: 0, gate: abierto, escritas };
  if (!abierto) return { mirados: huerfanos.length, encolados: 0, gate: false, escritas };
  for (const h of huerfanos) escritas.push({ campana: h.campana, qr_id: h.id });
  return { mirados: huerfanos.length, encolados: escritas.length, gate: true, escritas };
}

const VIEJOS = [
  { id: 1, campana: "esmorzar-antiguo", telefono: "600000001" },
  { id: 2, campana: "esmorzar-antiguo", telefono: "600000002" },
  { id: 3, campana: "sopar-de-marzo", telefono: "600000003" },
];

// ═════════════════════════════════════════════════════════════════════════════════════════════

describe("1 · con la puerta cerrada no se encola NADA histórico", () => {
  test("sin configuración —que es como nace— no se escribe una sola fila", () => {
    for (const sinValor of [undefined, null, ""]) {
      const r = reconciliar({ configuracion: sinValor, huerfanos: VIEJOS });
      assert.equal(r.gate, false);
      assert.equal(r.encolados, 0, "un despliegue ha encolado mensajes antiguos por su cuenta");
      assert.deepEqual(r.escritas, []);
    }
  });

  test("solo la cadena exacta «1» abre: todo lo demás cierra", () => {
    assert.equal(historicoAbierto("1"), true);
    for (const v of ["0", "", " 1", "1 ", "true", "si", "SI", "yes", 1, true, {}, [], null, undefined]) {
      assert.equal(historicoAbierto(v), false,
        `«${String(v)}» abre la recuperación histórica, y no debería`);
    }
  });

  test("un error leyendo la configuración deja la puerta CERRADA", () => {
    // El servidor hace `getConfig(...).catch(() => null)`, así que un fallo de lectura llega aquí
    // como `null`. Una base que no contesta no puede ser motivo para escribirle a nadie.
    assert.equal(historicoAbierto(null), false);
    assert.equal(reconciliar({ configuracion: null, huerfanos: VIEJOS }).encolados, 0);
  });

  test("pero SIGUE CONTANDO: el censo sale gratis y sin escribir", () => {
    const r = reconciliar({ configuracion: "0", huerfanos: VIEJOS });
    assert.equal(r.mirados, 3, "cerrada, la puerta no puede dejar de mirar: hay que saber cuántos son");
    assert.equal(r.encolados, 0);
  });
});

describe("2 · las altas NUEVAS no pasan por esa puerta", () => {
  test("ningún camino de alta consulta el gate ni llama al reconciliador", () => {
    for (const [nombre, texto] of [["clásica", ALTA_CLASICA], ["configurable", ALTA_FORM]]) {
      assert.ok(!texto.includes(GATE_HISTORICO) && !texto.includes("CAP_GATE_HISTORICO"),
        `el alta ${nombre} mira el gate histórico: apagarlo dejaría sin mensaje a quien se apunta HOY`);
      assert.ok(!/capReconciliar\(/.test(texto),
        `el alta ${nombre} delega en el reconciliador en vez de encolar ella misma`);
    }
  });

  test("y las dos siguen escribiendo su fila antes de responder", () => {
    for (const [nombre, texto] of [["clásica", ALTA_CLASICA], ["configurable", ALTA_FORM]]) {
      const encola = texto.indexOf("INSERT INTO cap_cola");
      assert.ok(encola > 0, `el alta ${nombre} ya no encola`);
      assert.ok(encola < texto.lastIndexOf("res.json"),
        `el alta ${nombre} responde antes de dejar la fila`);
    }
  });
});

describe("3 · el worker sigue sacando lo que haya en la cola", () => {
  test("no mira el gate histórico: saca filas, vengan de donde vengan", () => {
    // Se comprueban las DOS formas de nombrarlo —la clave literal y la constante— porque una
    // mutación que colara el gate aquí usaría la constante, y buscar solo la cadena la dejaría
    // pasar. Pasó al probarlo.
    assert.ok(!WORKER.includes(GATE_HISTORICO) && !WORKER.includes("CAP_GATE_HISTORICO"),
      "el worker mira el gate histórico: apagarlo pararía también las altas nuevas");
    assert.match(WORKER, /estado = 'pendiente'/, "el worker ya no busca lo pendiente");
  });

  test("sus tres frenos de siempre siguen siendo los mismos", () => {
    // El gate nuevo NO es un cuarto freno del worker: es una puerta del reconciliador. Si se
    // colara aquí, apagar la recuperación histórica dejaría de enviar todo lo demás.
    assert.match(WORKER, /captacion_cola_parada/, "falta el interruptor de pánico");
    assert.match(WORKER, /if \(!isReady\(\)\) return/, "falta el freno de WhatsApp caído");
    assert.match(WORKER, /capHayCupo\(cupoTipo\)/, "falta el freno del cupo diario");
  });
});

describe("4 · con la puerta abierta, el comportamiento es el de antes", () => {
  test("encola a todos los huérfanos, uno por cupón", () => {
    const r = reconciliar({ configuracion: "1", huerfanos: VIEJOS });
    assert.equal(r.gate, true);
    assert.equal(r.encolados, 3);
    assert.deepEqual(r.escritas.map((e) => e.qr_id), [1, 2, 3]);
  });

  test("y respeta la campaña de cada uno: no los mezcla", () => {
    const r = reconciliar({ configuracion: "1", huerfanos: VIEJOS });
    assert.deepEqual(r.escritas.map((e) => e.campana),
      ["esmorzar-antiguo", "esmorzar-antiguo", "sopar-de-marzo"]);
  });

  test("sin huérfanos no escribe nada, esté abierta o cerrada", () => {
    for (const c of ["1", "0"]) {
      assert.equal(reconciliar({ configuracion: c, huerfanos: [] }).encolados, 0);
    }
  });
});

describe("el cableado del gate en el servidor", () => {
  test("la puerta se consulta ANTES de escribir nada", () => {
    const decide = RECONCILIADOR.indexOf("recHistoricoAbierto(");
    const escribe = RECONCILIADOR.indexOf("capEncolarAlta(");
    assert.ok(decide > 0, "el reconciliador ya no consulta el gate");
    assert.ok(escribe > 0, "el reconciliador ya no encola");
    assert.ok(decide < escribe, "se escribe antes de mirar si está permitido");
    const corta = RECONCILIADOR.indexOf("if (!abierto)");
    assert.ok(corta > decide && corta < escribe,
      "falta la salida temprana con la puerta cerrada: la única barrera sería una condición suelta");
  });

  test("falla cerrado: el `catch` de la lectura devuelve algo que NO abre", () => {
    assert.match(RECONCILIADOR, /getConfig\(CAP_GATE_HISTORICO\)\.catch\(\(\) => null\)/,
      "un error leyendo la configuración tiene que dejar la puerta cerrada");
  });

  test("avisa una sola vez por arranque, no cada cinco minutos", () => {
    // 288 avisos al día dejan de leerse, y este dice algo que hay que DECIDIR, no vigilar.
    assert.match(RECONCILIADOR, /if \(!capAvisoHistorico\)/,
      "el aviso de la puerta cerrada se repite en cada pasada");
    assert.match(RECONCILIADOR, /censo-campana\.mjs --descubrir/,
      "el aviso no dice cómo mirar a cuántos afecta antes de decidir");
  });

  test("se puede abrir y cerrar, solo dirección y dejando rastro", () => {
    const mando = bloque(SERVER, 'app.post("/api/captacion/reconciliar/historico"');
    assert.match(mando, /requireAuth\(\["direccion"\]\)/,
      "abrir la recuperación histórica manda mensajes a gente real: no puede hacerlo cualquiera");
    assert.match(mando, /ficAuditar\("captacion"[\s\S]*?req\.user\.username/,
      "tiene que quedar escrito quién lo abrió");
    assert.match(mando, /activo === true/,
      "solo un `true` explícito abre: un cuerpo vacío no puede encender esto");
    assert.match(mando, /esperando: r\.mirados/,
      "tiene que decir a cuántos afecta, para poder mirarlo antes de decidir");
  });

  test("el reconciliador sigue sin emitir códigos ni mandar nada", () => {
    assert.ok(!/proEmitir\(/.test(RECONCILIADOR), "emite códigos nuevos");
    assert.ok(!/sendMensajeLibre|proEnviarWA/.test(RECONCILIADOR),
      "manda por su cuenta, saltándose el ritmo y el tope diario");
  });

  test("y no toca Wallet, Meta ni el interruptor de la tarjeta", () => {
    for (const prohibido of ["TARJETA_ACTIVA", "wallet_", "walVaciarCola", "apnsAvisar", "fbq", "PIXEL"]) {
      assert.ok(!RECONCILIADOR.includes(prohibido), `el reconciliador toca «${prohibido}»`);
    }
  });
});

describe("5 · ejecutar estos tests no puede mandar un mensaje", () => {
  test("este fichero no importa nada que pueda enviar", () => {
    const yo = readFileSync(new URL("./reconciliador-gate.test.js", import.meta.url), "utf8");
    const importa = [...yo.matchAll(/from\s*["']([^"']+)["']|await import\(\s*["']([^"']+)["']/g)]
      .map((m) => m[1] || m[2]);
    assert.deepEqual(importa.filter((x) => /whatsapp|baileys|server\.js$/.test(x)), [],
      "importa algo que abre un socket o arranca el servidor");
    assert.deepEqual(importa.sort(),
      ["../src/modules/captacion/recuperacion.js", "node:assert/strict", "node:fs", "node:test"]);
  });

  test("lo único que se ejecuta de verdad es una función pura", () => {
    // `historicoAbierto` no toca red, ni disco, ni reloj: con la misma entrada da siempre lo
    // mismo. El resto de este fichero lee texto.
    assert.equal(historicoAbierto("1"), historicoAbierto("1"));
    assert.equal(typeof historicoAbierto, "function");
    assert.equal(historicoAbierto.length, 1, "si algún día recibe un cliente de base, esto avisa");
  });
});
