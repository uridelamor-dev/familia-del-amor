// LA PUERTA DE LAS PROMOCIONES DE ÁGORA, SEPARADA DE LA DE PUNTOS.
//
// ── QUÉ SE BLINDA AQUÍ ───────────────────────────────────────────────────────────────────────
//
//   · LOS DOS SISTEMAS NO SE ENCIENDEN ENTRE SÍ. Encender promociones no concede ni un punto, y
//     encender los puntos no ofrece ni una promoción. Compartir un interruptor es la forma más
//     rápida de que un día alguien encienda lo que no quería.
//
//   · UN FALLO LEYENDO LA CONFIGURACIÓN CIERRA EL SISTEMA. Si no sabemos si podemos regalar un
//     desayuno, la respuesta es que no.
//
//   · APAGAR SIEMPRE SE PUEDE. Un freno que depende de que se cumplan requisitos no es un freno.
//
//   · LA ELECCIÓN DEL REWARD ES DETERMINISTA. Con dos promociones empatadas, la que se ofrece no
//     puede depender del orden en que la base devolvió las filas.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ESTADOS, INTERRUPTORES, APAGADOS, REQUISITOS, evaluarPuerta, puedeTransitar,
  CONFIRMACION_EXIGIDA, confirmacionValida, puedeEncender, aplicarPuerta,
} from "../src/modules/fidelizacion/puerta-promos.js";
import {
  NIVEL, nivelDe, compararPromos, elegirPromo, ganaLaPromo, elegible,
} from "../src/modules/fidelizacion/promos.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
const agora = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const puertaPuntos = readFileSync(new URL("../src/modules/fidelizacion/puerta.js", import.meta.url), "utf8");

// EL `/*` TIENE QUE EMPEZAR LA LÍNEA.
//
// Con `/\/\*[\s\S]*?\*\//g` a secas, el `"*/*"` de `express.raw({ type: "*/*" })` abría un bloque
// que no cerraba hasta 371 000 caracteres después: se comía el 28 % de `server.js` y cualquier
// `assert.ok(!...)` sobre esa zona pasaba sin comprobar nada.
//
// Todos los bloques de verdad de esta casa son JSDoc al principio de línea, así que basta con
// exigirlo — y así un `*/*` dentro de una cadena sobrevive, que es lo que tiene que pasar.
const sinComentarios = (t) => t.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");

/** El contexto con todo cumplido. Cada test rompe lo que quiere mirar. */
const TODO_OK = Object.freeze({
  promosVigentes: 1, promosSinLocal: 0, promosCodigoInvalido: 0, promosSinComprobar: 0,
  promosDerechoSinVia: 0, localesSinIntegracion: 0, revisionesPromo: 0,
});

// ── NACEN APAGADOS ───────────────────────────────────────────────────────────────────────────

describe("apagados de fábrica", () => {
  test("los dos interruptores nacen en false", () => {
    assert.deepEqual(APAGADOS, { promociones_ofrecer: false, promociones_consumir: false });
  });

  test("y están congelados: nadie los cambia por debajo", () => {
    assert.throws(() => { APAGADOS.promociones_ofrecer = true; }, TypeError);
    assert.throws(() => { INTERRUPTORES.push("otro"); }, TypeError);
    assert.throws(() => { ESTADOS.push("otro"); }, TypeError);
  });

  test("sin nada guardado, la puerta es «apagado»", () => {
    assert.equal(evaluarPuerta(null, TODO_OK).estado, "apagado");
    assert.equal(evaluarPuerta({}, TODO_OK).estado, "apagado");
  });

  test("un estado guardado que no reconocemos se trata como apagado", () => {
    // Un valor raro en la base no puede abrir nada.
    for (const malo of ["activo ", "ACTIVO", "sombra", "no_preparado", "cualquier_cosa", 1, null]) {
      assert.equal(evaluarPuerta({ estado: malo }, TODO_OK).estado, "apagado", `abrió con ${malo}`);
    }
  });
});

// ── EL CANDADO FINAL ─────────────────────────────────────────────────────────────────────────

describe("aplicarPuerta: lo guardado es una intención", () => {
  const TODO_ON = { promociones_ofrecer: true, promociones_consumir: true };

  test("con la puerta abierta, pasa lo que hay guardado", () => {
    assert.deepEqual(aplicarPuerta(TODO_ON, "activo"), TODO_ON);
  });

  test("con la puerta en cualquier otro estado, todo apagado", () => {
    for (const e of ["apagado", "listo_para_activar", "pausado", "inventado", undefined, null]) {
      assert.deepEqual(aplicarPuerta(TODO_ON, e), APAGADOS, `se coló con la puerta en ${e}`);
    }
  });

  test("PAUSAR CORTA AL INSTANTE aunque los interruptores sigan guardados en 1", () => {
    // Pausar no apaga los interruptores: los tapa. Así reanudar deja las cosas como estaban.
    assert.deepEqual(aplicarPuerta(TODO_ON, "pausado"), APAGADOS);
  });

  test("consumir sin ofrecer no es un estado posible, ni con la puerta abierta", () => {
    const r = aplicarPuerta({ promociones_ofrecer: false, promociones_consumir: true }, "activo");
    assert.equal(r.promociones_consumir, false);
  });

  test("sin nada guardado tampoco se abre nada", () => {
    assert.deepEqual(aplicarPuerta(null, "activo"), APAGADOS);
    assert.deepEqual(aplicarPuerta({}, "activo"), APAGADOS);
  });
});

// ── MOVER LOS INTERRUPTORES ──────────────────────────────────────────────────────────────────

describe("puedeEncender", () => {
  test("APAGAR SIEMPRE SE PUEDE, esté como esté la puerta", () => {
    for (const e of ["apagado", "listo_para_activar", "activo", "pausado", "inventado"]) {
      for (const k of INTERRUPTORES) {
        assert.equal(puedeEncender(k, false, { estadoPuerta: e }).ok, true,
          `no se pudo apagar ${k} con la puerta en ${e}`);
      }
    }
  });

  test("encender exige la puerta abierta", () => {
    for (const e of ["apagado", "listo_para_activar", "pausado"]) {
      const r = puedeEncender("promociones_ofrecer", true, { estadoPuerta: e });
      assert.equal(r.ok, false, `se encendió con la puerta en ${e}`);
      assert.match(r.error, /puestas en producción/i);
    }
    assert.equal(puedeEncender("promociones_ofrecer", true, { estadoPuerta: "activo" }).ok, true);
  });

  test("consumir NO se puede encender si ofrecer está apagado", () => {
    const r = puedeEncender("promociones_consumir", true,
      { estadoPuerta: "activo", guardados: { promociones_ofrecer: false } });
    assert.equal(r.ok, false);
    assert.match(r.error, /ofrecer/i);
  });

  test("con ofrecer encendido, consumir sí", () => {
    assert.equal(puedeEncender("promociones_consumir", true,
      { estadoPuerta: "activo", guardados: { promociones_ofrecer: true } }).ok, true);
  });

  test("un interruptor que no existe se rechaza", () => {
    for (const k of ["conceder", "ofrecer", "consumir", "sombra", "fid_conceder"]) {
      assert.equal(puedeEncender(k, true, { estadoPuerta: "activo" }).ok, false,
        `aceptó «${k}», que es del programa de puntos`);
    }
  });
});

// ── LA CONFIRMACIÓN ──────────────────────────────────────────────────────────────────────────

describe("la confirmación escrita", () => {
  test("es «ACTIVAR PROMOCIONES», distinta de la de puntos", () => {
    assert.equal(CONFIRMACION_EXIGIDA, "ACTIVAR PROMOCIONES");
    // Si fueran iguales se podría activar una pegando la confirmación de la otra.
    assert.match(puertaPuntos, /CONFIRMACION_EXIGIDA = "ACTIVAR"/);
    assert.notEqual(CONFIRMACION_EXIGIDA, "ACTIVAR");
  });

  test("la de puntos NO vale para promociones", () => {
    assert.equal(confirmacionValida("ACTIVAR"), false);
  });

  test("se acepta escrita con holgura, pero escrita", () => {
    for (const t of ["ACTIVAR PROMOCIONES", " activar promociones ", "Activar   Promociones"]) {
      assert.equal(confirmacionValida(t), true, `rechazó «${t}»`);
    }
    for (const t of ["", "  ", "si", "ACTIVARPROMOCIONES", "ACTIVAR PROMOCION", null, undefined]) {
      assert.equal(confirmacionValida(t), false, `aceptó «${t}»`);
    }
  });
});

// ── LOS REQUISITOS ───────────────────────────────────────────────────────────────────────────

describe("los requisitos los comprueba el servidor", () => {
  test("con todo cumplido se puede activar", () => {
    const e = evaluarPuerta({ estado: "apagado" }, TODO_OK);
    assert.equal(e.puede_activar, true);
    assert.deepEqual(e.pendientes, []);
  });

  test("están los siete que se pidieron", () => {
    assert.deepEqual(REQUISITOS.map((r) => r.id), [
      "promo_publicada", "promo_con_local", "codigo_valido", "codigo_comprobado",
      "derecho_concedible", "integracion_confirmada", "sin_revisiones_promo",
    ]);
  });

  test("cada uno falla por su cuenta, y dice qué hacer", () => {
    const rompe = {
      promo_publicada: { promosVigentes: 0 },
      promo_con_local: { promosSinLocal: 1 },
      codigo_valido: { promosCodigoInvalido: 1 },
      codigo_comprobado: { promosSinComprobar: 1 },
      derecho_concedible: { promosDerechoSinVia: 1 },
      integracion_confirmada: { localesSinIntegracion: 1 },
      sin_revisiones_promo: { revisionesPromo: 2 },
    };
    for (const [id, malo] of Object.entries(rompe)) {
      const e = evaluarPuerta({ estado: "apagado" }, { ...TODO_OK, ...malo });
      assert.equal(e.puede_activar, false, `${id} no bloqueó`);
      const r = e.requisitos.find((x) => x.id === id);
      assert.equal(r.ok, false, `${id} salió cumplido`);
      assert.ok(r.motivo && r.motivo.length > 20, `${id} no explica qué hacer`);
    }
  });

  test("un contexto vacío no puede activar nada", () => {
    // Si el servidor no pudo armar el contexto, no se abre la puerta por defecto.
    const e = evaluarPuerta({ estado: "apagado" }, {});
    assert.equal(e.puede_activar, false);
  });

  test("activa pero incumpliendo se marca como incoherente y NO se cierra sola", () => {
    const e = evaluarPuerta({ estado: "activo" }, { ...TODO_OK, promosVigentes: 0 });
    assert.equal(e.estado, "activo", "cerrarla sola dejaría un premio aplicado sin poder cobrar");
    assert.equal(e.incoherente, true);
  });
});

// ── LAS TRANSICIONES ─────────────────────────────────────────────────────────────────────────

describe("transiciones", () => {
  test("PAUSAR desde activo siempre se puede, incumpliendo o no", () => {
    assert.equal(puedeTransitar("activo", "pausado", { puedeActivar: false }).ok, true);
  });

  test("activar exige pasar por «listo para activar» y cumplir", () => {
    assert.equal(puedeTransitar("apagado", "activo", { puedeActivar: true }).ok, false);
    assert.equal(puedeTransitar("listo_para_activar", "activo", { puedeActivar: false }).ok, false);
    assert.equal(puedeTransitar("listo_para_activar", "activo", { puedeActivar: true }).ok, true);
  });

  test("reanudar desde pausado vuelve a exigir los requisitos", () => {
    assert.equal(puedeTransitar("pausado", "activo", { puedeActivar: false }).ok, false);
    assert.equal(puedeTransitar("pausado", "activo", { puedeActivar: true }).ok, true);
  });

  test("apagar desde activo obliga a pausar primero", () => {
    assert.equal(puedeTransitar("activo", "apagado", { puedeActivar: true }).ok, false);
    assert.equal(puedeTransitar("pausado", "apagado", {}).ok, true);
  });

  test("no existen los estados del programa de puntos", () => {
    for (const e of ["sombra", "no_preparado"]) {
      assert.equal(puedeTransitar("apagado", e, { puedeActivar: true }).ok, false, `aceptó ${e}`);
      assert.ok(!ESTADOS.includes(e));
    }
  });
});

// ── LOS DOS SISTEMAS NO SE TOCAN ─────────────────────────────────────────────────────────────

describe("promociones y puntos son sistemas distintos", () => {
  const s = sinComentarios(server);

  test("los interruptores de promociones no son los de puntos", () => {
    assert.deepEqual([...INTERRUPTORES], ["promociones_ofrecer", "promociones_consumir"]);
    for (const k of INTERRUPTORES) {
      assert.ok(!["conceder", "ofrecer", "consumir", "sombra"].includes(k));
    }
  });

  test("`fidPromoInterruptores` no lee ni una clave del programa de puntos", () => {
    const i = s.indexOf("async function fidPromoInterruptores()");
    const j = s.indexOf("async function fidPromoPuertaGuardada()");
    assert.ok(i > 0 && j > i);
    const fn = s.slice(i, j);
    assert.ok(!/fid_conceder|fid_ofrecer|fid_consumir|FID_SW_DEFECTO|FID_INTERRUPTORES/.test(fn),
      "lee algo del programa de puntos");
    assert.match(fn, /FROM fid_puerta_promos WHERE id = 1/);
    assert.ok(!/FROM fid_puerta\b/.test(fn), "mira la puerta de puntos");
  });

  test("ACTIVAR PROMOCIONES NO ENCIENDE PUNTOS: su ruta no toca ninguna clave de puntos", () => {
    const i = s.indexOf('app.post("/api/fidelizacion/promociones/interruptores"');
    const j = s.indexOf('app.get("/api/fidelizacion/puerta"');
    assert.ok(i > 0 && j > i);
    const ruta = s.slice(i, j);
    assert.ok(!/fid_conceder|fid_ofrecer|fid_consumir|fid_sombra/.test(ruta));
    assert.ok(!/UPDATE fid_puerta\b|INSERT INTO fid_puerta\b/.test(ruta), "mueve la puerta de puntos");
  });

  test("ACTIVAR PUNTOS NO ENCIENDE PROMOCIONES: su ruta no toca las claves nuevas", () => {
    const i = s.indexOf('app.post("/api/fidelizacion/interruptores"');
    assert.ok(i > 0);
    const ruta = s.slice(i, i + 1800);
    assert.ok(!/promociones_ofrecer|promociones_consumir|fid_puerta_promos/.test(ruta));
  });

  test("y la puerta de puntos tampoco se mueve desde la de promociones", () => {
    const i = s.indexOf('app.post("/api/fidelizacion/promociones/puerta"');
    const j = s.indexOf('app.post("/api/fidelizacion/promociones/interruptores"');
    const ruta = s.slice(i, j);
    assert.match(ruta, /UPDATE fid_puerta_promos SET/);
    assert.ok(!/UPDATE fid_puerta SET/.test(ruta));
  });

  test("el programa de puntos sigue apagado y en no_preparado", () => {
    assert.match(s, /FID_SW_DEFECTO = Object\.freeze\(\{ sombra: true, conceder: false, ofrecer: false, consumir: false \}\)/);
    assert.match(s, /if \(!out\.conceder\) \{ out\.ofrecer = false; out\.consumir = false; \}/);
    assert.match(esquema, /INSERT INTO fid_puerta \(id, estado, actualizado_en\) VALUES \(1, 'no_preparado', \?\)/);
  });

  test("la tabla de la puerta de promociones nace apagada y es otra tabla", () => {
    assert.match(esquema, /CREATE TABLE IF NOT EXISTS fid_puerta_promos/);
    assert.match(esquema, /estado TEXT NOT NULL DEFAULT 'apagado'/);
    assert.match(esquema, /INSERT INTO fid_puerta_promos \(id, estado, actualizado_en\) VALUES \(1, 'apagado', \?\)/);
    assert.ok(!/INSERT INTO fid_puerta_promos[\s\S]{0,120}'activo'/.test(esquema),
      "una migración no puede activar promociones");
  });

  test("ninguna migración enciende un interruptor de promociones", () => {
    assert.ok(!/fid_promociones_ofrecer|fid_promociones_consumir/.test(sinComentarios(esquema)));
  });
});

// ── QUIÉN PUEDE QUÉ ──────────────────────────────────────────────────────────────────────────

describe("permisos", () => {
  const s = sinComentarios(server);

  test("SOLO DIRECCIÓN activa, pausa o mueve interruptores", () => {
    for (const r of ["/api/fidelizacion/promociones/puerta",
                     "/api/fidelizacion/promociones/interruptores"]) {
      const i = s.indexOf(`app.post("${r}"`);
      assert.ok(i > 0, `no está POST ${r}`);
      assert.match(s.slice(i, i + 130), /requireAuth\(\["direccion"\]\)/, r);
    }
  });

  test("Marketing lo VE, para saber qué le falta", () => {
    const i = s.indexOf('app.get("/api/fidelizacion/promociones/puerta"');
    assert.ok(i > 0);
    assert.match(s.slice(i, i + 130), /requireAuth\(PROMOS_ROLES\)/);
    assert.match(s.slice(i, i + 900), /puede_cambiar: req\.user\.rol === "direccion"/);
  });

  test("Marketing SÍ puede seguir configurando y publicando promociones", () => {
    assert.match(s, /app\.post\("\/api\/fidelizacion\/promos", requireAuth\(PROMOS_ROLES\)/);
  });

  test("el panel dice quién puede qué cuando no eres Dirección", () => {
    assert.match(panel, /Marketing configura y publica las promociones; <b>solo Dirección<\/b>/);
  });
});

// ── EL ORDEN DE LOS REWARDS ──────────────────────────────────────────────────────────────────

const promo = (extra) => ({ clave: "p", version: 1, estado: "publicada", local: "Girona",
  tipo: "oferta_agora", codigo_agora: "X", codigo_comprobado_en: "2026-01-01",
  reward_id: "fidp:x", limite_cuenta: 1, limite_total: 0, coste_puntos: 0, compra_minima: 0,
  prioridad: 0, dias: "[]", ...extra });

describe("cuál de todos se ofrece", () => {
  test("los tres niveles, en este orden", () => {
    assert.equal(NIVEL.CON_DERECHO, 0);
    assert.equal(NIVEL.GENERAL, 1);
    assert.equal(NIVEL.PUNTOS, 2);
  });

  test("una promoción concedida individualmente gana a una general", () => {
    const mia = promo({ clave: "esmorzar", requiere_derecho: true });
    const gen = promo({ clave: "general", requiere_derecho: false, prioridad: 99 });
    // Ni siquiera con una prioridad altísima: el nivel manda sobre la prioridad.
    assert.equal(elegirPromo([gen, mia]).clave, "esmorzar");
    assert.equal(elegirPromo([mia, gen]).clave, "esmorzar");
  });

  test("Y GANA AL DESCUENTO POR PUNTOS: es lo que se pierde si no se usa", () => {
    assert.equal(ganaLaPromo(promo({ requiere_derecho: true })), true);
    assert.equal(ganaLaPromo(promo({ requiere_derecho: false })), true);
    assert.equal(ganaLaPromo(null), false);
    assert.equal(nivelDe(promo({ requiere_derecho: true })) < NIVEL.PUNTOS, true);
  });

  test("dentro del mismo nivel manda la prioridad configurada", () => {
    const baja = promo({ clave: "baja", prioridad: 1 });
    const alta = promo({ clave: "alta", prioridad: 5 });
    assert.equal(elegirPromo([baja, alta]).clave, "alta");
    assert.equal(elegirPromo([alta, baja]).clave, "alta");
  });

  test("empatada la prioridad, gana LA QUE ANTES CADUCA", () => {
    const pronto = promo({ clave: "pronto", hasta: "2026-10-05" });
    const tarde = promo({ clave: "tarde", hasta: "2026-12-31" });
    assert.equal(elegirPromo([tarde, pronto]).clave, "pronto");
    assert.equal(elegirPromo([pronto, tarde]).clave, "pronto");
  });

  test("una sin fecha de final desempata la última: no se pierde", () => {
    const sinFin = promo({ clave: "sinfin", hasta: null });
    const conFin = promo({ clave: "confin", hasta: "2026-12-31" });
    assert.equal(elegirPromo([sinFin, conFin]).clave, "confin");
  });

  test("LA ELECCIÓN NO DEPENDE DEL ORDEN DE LA CONSULTA", () => {
    // Es la prueba que importa: el mismo conjunto, en cualquier orden, da siempre lo mismo.
    const lista = [
      promo({ clave: "c", prioridad: 3, hasta: "2026-12-01" }),
      promo({ clave: "a", prioridad: 3, hasta: "2026-11-01" }),
      promo({ clave: "b", prioridad: 7, hasta: "2026-12-31", requiere_derecho: true }),
      promo({ clave: "d", prioridad: 9, hasta: "2026-10-01" }),
    ];
    const esperado = elegirPromo(lista).clave;
    assert.equal(esperado, "b", "debería ganar la de derecho individual");
    // 24 permutaciones de 4 elementos: todas tienen que dar lo mismo.
    const permutar = (a) => a.length <= 1 ? [a]
      : a.flatMap((x, i) => permutar([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r]));
    for (const orden of permutar(lista)) {
      assert.equal(elegirPromo(orden).clave, esperado, "la elección cambió con el orden");
    }
  });

  test("el desempate final es total: dos iguales se ordenan siempre igual", () => {
    const x = promo({ clave: "aa", version: 1 });
    const y = promo({ clave: "ab", version: 1 });
    assert.ok(compararPromos(x, y) < 0);
    assert.ok(compararPromos(y, x) > 0);
    // Misma clave, versión distinta: gana la más nueva.
    const v1 = promo({ clave: "z", version: 1 });
    const v2 = promo({ clave: "z", version: 2 });
    assert.equal(elegirPromo([v1, v2]).version, 2);
  });

  test("sin candidatas, nada", () => {
    assert.equal(elegirPromo([]), null);
    assert.equal(elegirPromo(null), null);
    assert.equal(elegirPromo([null, undefined]), null);
  });
});

// ── EL CABLEADO DEL ESCANEO ──────────────────────────────────────────────────────────────────

describe("qué hace la barra al escanear un carné", () => {
  const s = sinComentarios(server);
  const ruta = s.slice(s.indexOf('app.get("/api/fidelizacion/agora/:token/member/:memberId"'),
                       s.indexOf('app.post("/api/fidelizacion/agora/:token/factura"'));

  test("se leen los DOS juegos de interruptores, por separado", () => {
    assert.match(ruta, /const sw = await fidInterruptores\(\);/);
    assert.match(ruta, /const swPromo = await fidPromoInterruptores\(\);/);
  });

  test("las promociones se ofrecen con SU interruptor, no con el de puntos", () => {
    assert.match(ruta, /if \(swPromo\.promociones_ofrecer\) \{/);
  });

  test("con puntos apagados, las promociones se siguen pudiendo ofrecer", () => {
    // La condición de entrada es un O, no un Y: basta con que uno de los dos esté encendido.
    assert.match(ruta, /if \(\(sw\.ofrecer \|\| swPromo\.promociones_ofrecer\) && !esperaConfirmacion\)/);
  });

  test("el descuento por puntos va DESPUÉS y solo si no hay promoción", () => {
    assert.match(ruta, /if \(!rewards && sw\.ofrecer\) \{/);
    const iPromo = ruta.indexOf("swPromo.promociones_ofrecer");
    const iPuntos = ruta.indexOf("if (!rewards && sw.ofrecer)");
    assert.ok(iPromo > 0 && iPuntos > iPromo, "los puntos tienen que ir después");
  });

  test("la promoción se ELIGE, no se coge la primera de la consulta", () => {
    assert.match(ruta, /promoElegida = fidElegirPromo\(elegibles\)/);
    assert.ok(!/ORDER BY prioridad DESC, id DESC/.test(ruta),
      "ordenar en SQL deja el desempate en manos de la base");
  });

  test("ENSEÑAR NO CONSUME: la ruta no escribe en el libro de usos", () => {
    assert.ok(!/INSERT INTO fid_promo_usos/.test(ruta));
    assert.ok(!/INSERT INTO fid_promo_derechos/.test(ruta), "ni concede derechos al escanear");
  });

  test("se sigue exigiendo el Workplace confirmado antes de ofrecer nada", () => {
    assert.match(ruta, /esperaConfirmacion = !integ\.fila\.workplace_confirmado_en/);
  });
});

describe("qué hace el cierre de factura", () => {
  const a = sinComentarios(agora);
  const s = sinComentarios(server);

  test("consumir una promoción usa SU interruptor, no el de puntos", () => {
    assert.match(a, /if \(!programa\?\.promociones\?\.promociones_consumir\)/);
    assert.match(a, /promo_consumir_apagado/);
  });

  test("con el interruptor apagado se rechaza ANTES de escribir el uso", () => {
    const i = a.indexOf("promo_consumir_apagado");
    const j = a.indexOf("INSERT INTO fid_promo_usos");
    assert.ok(i > 0 && j > i);
  });

  test("si no llega el juego de interruptores, se supone apagado", () => {
    // `programa?.promociones?.` con encadenamiento opcional: sin el campo, `undefined` ⇒ rechaza.
    assert.match(a, /programa\?\.promociones\?\./);
  });

  test("el servidor los lee en su propio try: un fallo no abre el otro sistema", () => {
    assert.match(s, /let sw = FID_SW_DEFECTO, swPromo = \{ \.\.\.FID_PROMO_APAGADOS \}/);
    assert.match(s, /try \{ swPromo = await fidPromoInterruptores\(\); \}/);
  });

  test("y viajan a la transacción junto a los de puntos, sin mezclarse", () => {
    assert.match(s, /programa: \{ regla: reglaHoy, interruptores: sw, promociones: swPromo,/);
  });
});

// ── ELEGIBILIDAD CON LOS INTERRUPTORES DE POR MEDIO ──────────────────────────────────────────

describe("un cliente sin derecho no recibe la promoción", () => {
  const CTX = { ahora: "2026-10-01T09:00:00+02:00", local: "Girona" };

  test("con derecho sí, sin derecho no", () => {
    const p = promo({ requiere_derecho: true, desde: "2026-09-01", hasta: "2026-10-31" });
    assert.equal(elegible(p, { ...CTX, derechos: 1 }).ok, true);
    const sin = elegible(p, { ...CTX, derechos: 0 });
    assert.equal(sin.ok, false);
    assert.equal(sin.motivo, "sin_derecho");
  });

  test("y entonces la que se ofrece es la general, si la hay", () => {
    // Lo que llega a `elegirPromo` ya viene filtrado por `elegible`: sin derecho, esa no entra.
    const gen = promo({ clave: "general", requiere_derecho: false });
    assert.equal(elegirPromo([gen]).clave, "general");
  });
});

// ── EL PANEL ─────────────────────────────────────────────────────────────────────────────────

describe("el panel separa las dos puestas en producción", () => {
  test("la tarjeta de promociones existe y dice que no es la de puntos", () => {
    assert.match(panel, /Promociones de Ágora · puesta en producción/);
    assert.match(panel, /<b>No es el programa de puntos<\/b>/);
    assert.match(panel, /Encender esto <b>no enciende los puntos<\/b>/);
  });

  test("tiene sus propios estados, distintos de los de puntos", () => {
    assert.match(panel, /const FIDG_PP_TXT = \{/);
    assert.match(panel, /apagado:\s+\["Apagado"/);
    assert.match(panel, /FIDG_PUERTA_TXT/, "la de puntos sigue existiendo aparte");
  });

  test("pide la confirmación propia, no la de puntos", () => {
    assert.match(panel, /Escribe ACTIVAR PROMOCIONES para confirmar/);
    assert.match(panel, /ESTO NO ENCIENDE EL PROGRAMA DE PUNTOS/);
  });

  test("llama a sus propias rutas", () => {
    assert.match(panel, /"\/api\/fidelizacion\/promociones\/puerta"/);
    assert.match(panel, /"\/api\/fidelizacion\/promociones\/interruptores"/);
  });

  test("«consumir» sale bloqueado mientras no se esté ofreciendo", () => {
    assert.match(panel, /<b>Hace falta ofrecer primero\.<\/b>/);
    assert.match(panel, /<span class="pill">bloqueado<\/span>/);
  });
});
