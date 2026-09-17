// EL SIMULADOR DE PROMOCIONES: TRES FALLOS REALES, REPRODUCIDOS Y BLINDADOS.
//
//   1. LA CASILLA QUE SE PERDÍA. El panel manda `codigo_comprobado` (booleano) y el validador lee
//      `codigo_comprobado_en` (la fecha). La ruta de guardar traducía entre los dos nombres; la de
//      simular, no. Resultado: con la casilla marcada en pantalla, Simular seguía contestando «el
//      código de Ágora no se ha comprobado».
//
//   2. «TODAVÍA NO HA EMPEZADO» EN UNA PROMOCIÓN QUE SÍ HABÍA EMPEZADO. No era la zona horaria:
//      `enMadrid` y `vigente` son correctos y hay tests que lo demuestran aquí abajo. Era un
//      escenario que movía el reloj a `1999-01-01` sin decirlo. Alguien simulaba el 16 de
//      septiembre, leía «todavía no ha empezado» y daba por hecho que su promoción no arrancaba.
//
//   3. `sin_derecho` REPETIDO CINCO VECES. `elegible()` se para en el primer motivo —correcto en
//      la barra— así que una promoción con derecho individual pintaba la misma frase en saldo,
//      mínimo, unidades, cuenta y en la cuenta elegible. No se podía ver si el resto estaba bien.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  diagnosticar, simularPromo, CUMPLE, puedePublicar, vigente, enMadrid, elegible,
} from "../src/modules/fidelizacion/promos.js";
import { isoConOffset } from "../src/modules/horarios/tiempo.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** La promoción del informe: empieza HOY, de 07:00 a 23:59, y se simula a las 21:01. */
const CUANDO = "2026-09-16T21:01:00+02:00";
const PROMO = Object.freeze({
  clave: "esmorzar-girona-premio", estado: "publicada", local: "La Tapeta Girona",
  tipo: "oferta_agora", codigo_agora: "ESMORZAR_GIRONA", reward_id: "fidp:x",
  nombre: "Esmorzar", texto_camarero: "Esmorzar", texto_cliente: "Esmorzar",
  requiere_derecho: true, desde: "2026-09-16", hasta: "", hora_desde: "07:00", hora_hasta: "23:59",
  dias: "[]", grupos: "[]", limite_cuenta: 1, limite_total: 0, coste_puntos: 0, compra_minima: 0,
});
const CTX = Object.freeze({ ahora: CUANDO, local: "La Tapeta Girona", derechos: 1 });

// ── 1 · LA CASILLA QUE SE PERDÍA ─────────────────────────────────────────────────────────────

describe("«He comprobado que ese código existe en Ágora» llega hasta el validador", () => {
  test("el validador lee la FECHA, no el booleano — son dos nombres de lo mismo", () => {
    const base = { ...PROMO, codigo_comprobado_en: null };
    // Con el booleano crudo, el validador no ve nada: es EXACTAMENTE el fallo del informe.
    assert.ok(puedePublicar({ ...base, codigo_comprobado: true }).falta
      .some((f) => /no se ha comprobado/i.test(f)),
      "el validador debería seguir leyendo `codigo_comprobado_en`");
    // Con la fecha, no falta nada.
    assert.deepEqual(puedePublicar({ ...base, codigo_comprobado_en: CUANDO }).falta, []);
  });

  test("LA RUTA DE SIMULAR TRADUCE el booleano a fecha, igual que la de guardar", () => {
    const s = sinComentarios(server);
    const ruta = s.slice(s.indexOf('app.post("/api/fidelizacion/promos/simular"'),
                         s.indexOf('app.get("/api/fidelizacion/campanas/propuesta/:clave"'));
    assert.match(ruta, /codigo_comprobado_en: b\.codigo_comprobado \? isoConOffset\(Date\.now\(\)\)/,
      "la ruta de simular no traduce la casilla");
  });

  test("y la traducción va DESPUÉS de `...b`, o el booleano crudo la pisaría", () => {
    const s = sinComentarios(server);
    const ruta = s.slice(s.indexOf('app.post("/api/fidelizacion/promos/simular"'),
                         s.indexOf('app.get("/api/fidelizacion/campanas/propuesta/:clave"'));
    const iSpread = ruta.indexOf("{ ...b, estado: \"publicada\"");
    const iTrad = ruta.indexOf("codigo_comprobado_en: b.codigo_comprobado");
    assert.ok(iSpread > 0 && iTrad > iSpread, "el orden deja que `...b` sobrescriba la traducción");
  });

  test("las dos rutas usan la MISMA traducción", () => {
    const s = sinComentarios(server);
    const veces = [...s.matchAll(/codigo_comprobado_en: b\.codigo_comprobado \? isoConOffset\(Date\.now\(\)\)/g)];
    assert.equal(veces.length, 2, "guardar y simular tienen que traducir igual");
  });

  test("un `codigo_comprobado_en` que ya venga en el cuerpo se respeta", () => {
    const s = sinComentarios(server);
    assert.match(s, /\(b\.codigo_comprobado_en \|\| null\)/,
      "copiar una versión ya comprobada no puede perder su fecha");
  });
});

// ── 2 · LA FECHA ─────────────────────────────────────────────────────────────────────────────

describe("«todavía no ha empezado» el mismo día que empieza", () => {
  test("LA ZONA HORARIA ESTÁ BIEN: 21:01 en Madrid es el día 16", () => {
    const m = enMadrid(CUANDO);
    assert.deepEqual(m, { fecha: "2026-09-16", hora: "21:01", dia: 3 });
  });

  test("y la cadena entera —epoch → isoConOffset → enMadrid— también", () => {
    // 19:01 UTC son las 21:01 en Madrid (CEST, +02:00). El servidor de Replit va en UTC.
    const iso = isoConOffset(Date.UTC(2026, 8, 16, 19, 1, 0));
    assert.equal(iso, "2026-09-16T21:01:00+02:00");
    assert.equal(enMadrid(iso).fecha, "2026-09-16");
  });

  test("una promoción que empieza HOY está vigente HOY a las 21:01", () => {
    const v = vigente(PROMO, { ahora: CUANDO, local: "La Tapeta Girona" });
    assert.equal(v.ok, true, `dijo «${v.motivo}» el mismo día que empieza`);
  });

  test("con `hasta` vacío o nulo tampoco caduca", () => {
    for (const hasta of ["", null, undefined]) {
      assert.equal(vigente({ ...PROMO, hasta }, { ahora: CUANDO, local: "La Tapeta Girona" }).ok, true);
    }
  });

  test("el horario 07:00–23:59 incluye las 21:01", () => {
    assert.equal(vigente(PROMO, { ahora: CUANDO, local: "La Tapeta Girona" }).ok, true);
    // Y sigue cerrando a su hora: a las 23:59 en punto ya ha terminado.
    assert.equal(vigente(PROMO, { ahora: "2026-09-16T23:59:00+02:00", local: "La Tapeta Girona" }).motivo,
      "fuera_de_horario");
    assert.equal(vigente(PROMO, { ahora: "2026-09-16T06:59:00+02:00", local: "La Tapeta Girona" }).motivo,
      "aun_no_es_la_hora");
  });

  test("EL ESCENARIO FUERA DE PLAZO YA NO USA 1999", () => {
    // Era la causa: un escenario que movía el reloj sin decirlo, y cuya respuesta —«todavía no ha
    // empezado»— se leía como un veredicto sobre hoy.
    const s = sinComentarios(server);
    const ruta = s.slice(s.indexOf('app.post("/api/fidelizacion/promos/simular"'),
                         s.indexOf('app.get("/api/fidelizacion/campanas/propuesta/:clave"'));
    assert.ok(!ruta.includes("1999-01-01"), "sigue habiendo una fecha fija de 1999");
    assert.match(ruta, /diaAntes\(String\(promo\.desde\)\.slice\(0, 10\)\)/,
      "la fecha fuera de plazo tiene que salir de la propia promoción");
    assert.match(ruta, /el día antes de empezar/);
    assert.match(ruta, /el día después de terminar/);
  });

  test("y el escenario DICE qué fecha ha usado", () => {
    const s = sinComentarios(server);
    assert.match(s, /cambia: `se escanea el \$\{fueraFecha\.fecha\} — \$\{fueraFecha\.que\}`/);
  });

  test("sin fechas configuradas, ese escenario ni aparece", () => {
    const s = sinComentarios(server);
    assert.match(s, /\.\.\.\(fueraFecha\s*\n?\s*\? \[\{ \.\.\.base, nombre: "Fuera de fecha"/);
    assert.match(s, /let fueraFecha = null;/);
  });
});

// ── 3 · CADA REQUISITO CON SU RESULTADO ──────────────────────────────────────────────────────

describe("el diagnóstico separa los requisitos", () => {
  test("una cuenta que se lo lleva cumple todas sus líneas", () => {
    const d = diagnosticar(PROMO, { ...CTX, usos: 0, usosTotales: 0 });
    assert.equal(d.ok, true);
    assert.ok(d.requisitos.every((r) => r.estado === CUMPLE.OK), JSON.stringify(d.requisitos));
  });

  test("SIN DERECHO, las demás líneas siguen dando SU resultado real", () => {
    // Es el fallo del informe: antes las cinco decían «no se apuntó».
    const d = diagnosticar(PROMO, { ...CTX, derechos: 0, usos: 0, usosTotales: 0 });
    assert.equal(d.ok, false);
    assert.equal(d.motivo, "sin_derecho");

    const porId = Object.fromEntries(d.requisitos.map((r) => [r.id, r]));
    assert.equal(porId.derecho.estado, CUMPLE.FALLA, "el derecho sí tiene que fallar");
    assert.equal(porId.vigencia.estado, CUMPLE.OK, "la vigencia no depende del derecho");
    assert.equal(porId.usos_cuenta.estado, CUMPLE.OK, "los usos no dependen del derecho");
    assert.equal(porId.unidades.estado, CUMPLE.OK, "las unidades no dependen del derecho");

    // Y NINGUNA línea repite la explicación del derecho.
    const repetidas = d.requisitos.filter((r) => r.id !== "derecho")
      .filter((r) => /se apunt|derecho/i.test(String(r.detalle)));
    assert.deepEqual(repetidas, [], "una línea que no es la del derecho lo usa de explicación");
  });

  test("cada tope falla solo en su línea", () => {
    const conTopes = { ...PROMO, limite_cuenta: 1, limite_total: 50, coste_puntos: 10, compra_minima: 5 };
    const falla = (ctx, id) => {
      const d = diagnosticar(conTopes, { ...CTX, usos: 0, usosTotales: 0, saldo: 100,
        importeCentimos: 999999, ...ctx });
      const malas = d.requisitos.filter((r) => r.estado === CUMPLE.FALLA).map((r) => r.id);
      assert.deepEqual(malas, [id], `${id}: fallaron ${malas.join(", ") || "ninguna"}`);
    };
    falla({ usos: 1 }, "usos_cuenta");
    falla({ usosTotales: 50 }, "unidades");
    falla({ saldo: 0 }, "puntos");
    falla({ importeCentimos: 0 }, "compra_minima");
    falla({ derechos: 0 }, "derecho");
    falla({ local: "Otro" }, "vigencia");
  });

  test("las líneas llevan el número real, no solo un símbolo", () => {
    const d = diagnosticar({ ...PROMO, limite_cuenta: 3, limite_total: 50, coste_puntos: 10 },
      { ...CTX, usos: 1, usosTotales: 12, saldo: 4 });
    const porId = Object.fromEntries(d.requisitos.map((r) => [r.id, r]));
    assert.match(porId.usos_cuenta.detalle, /1 de 3/);
    assert.match(porId.unidades.detalle, /12 de 50/);
    assert.match(porId.puntos.detalle, /4 de 10/);
    assert.match(porId.vigencia.detalle, /2026-09-16 a las 21:01/);
  });

  test("«NO EVALUADO» solo donde de verdad no se puede saber", () => {
    // Al ofrecer el premio la cuenta está abierta: no hay importe con el que comparar.
    const d = diagnosticar({ ...PROMO, compra_minima: 5 }, { ...CTX, importeCentimos: null });
    const min = d.requisitos.find((r) => r.id === "compra_minima");
    assert.equal(min.estado, CUMPLE.NO_EVALUADO);
    assert.match(min.detalle, /no evaluado/i);
    assert.match(min.detalle, /al cerrar la factura/i);
    // Y no se cuenta como un fallo: el veredicto lo sigue dando `elegible`.
    assert.equal(d.ok, true);
  });

  test("las líneas que no aplican no se pintan", () => {
    // Sin coste en puntos no hay línea de puntos; sin mínimo, no hay línea de mínimo; y en una
    // promoción general no hay línea de derecho.
    const d = diagnosticar({ ...PROMO, requiere_derecho: false }, { ...CTX, derechos: 0 });
    const ids = d.requisitos.map((r) => r.id);
    assert.deepEqual(ids, ["vigencia", "usos_cuenta", "unidades"]);
  });

  test("el veredicto del diagnóstico es SIEMPRE el de `elegible`", () => {
    // El simulador no puede contestar una cosa distinta de la que pasará en la barra.
    for (const ctx of [{ derechos: 0 }, { usos: 5 }, { local: "Otro" }, {}]) {
      const c = { ...CTX, usos: 0, usosTotales: 0, ...ctx };
      const d = diagnosticar(PROMO, c), e = elegible(PROMO, c);
      assert.equal(d.ok, e.ok);
      assert.equal(d.motivo, e.motivo);
    }
  });
});

// ── LOS ESCENARIOS ───────────────────────────────────────────────────────────────────────────

describe("los escenarios dicen qué cambian", () => {
  const base = { ahora: CUANDO, local: "La Tapeta Girona", usos: 0, usosTotales: 0,
                 saldo: 100000, importeCentimos: 999999, derechos: 1 };

  test("`simularPromo` devuelve los requisitos y el «cambia» de cada uno", () => {
    const r = simularPromo(PROMO, [
      { ...base, nombre: "Cuenta elegible", cambia: "nada" },
      { ...base, nombre: "Alguien que no se apuntó", derechos: 0, cambia: "sin derecho" },
    ]);
    assert.equal(r.length, 2);
    assert.equal(r[0].ok, true);
    assert.equal(r[0].cambia, "nada");
    assert.ok(Array.isArray(r[0].requisitos) && r[0].requisitos.length > 0);
    assert.equal(r[1].ok, false);
    assert.equal(r[1].motivo, "sin_derecho");
  });

  test("EL ESCENARIO DE REFERENCIA TIENE DERECHO si la promoción lo exige", () => {
    // Sin esto, «Cuenta elegible» fallaba siempre y no había con qué comparar el resto.
    const s = sinComentarios(server);
    assert.match(s, /derechos: exigeDerecho \? 1 : 0/);
    assert.match(s, /const exigeDerecho = !!promo\.requiere_derecho;/);
  });

  test("y hay un escenario explícito de «no se apuntó», solo si aplica", () => {
    const s = sinComentarios(server);
    assert.match(s, /nombre: "Alguien que no se apuntó", derechos: 0/);
    assert.match(s, /\.\.\.\(exigeDerecho/);
  });

  test("SOLO SALEN LOS ESCENARIOS QUE ESA PROMOCIÓN PUEDE FALLAR", () => {
    // Un escenario llamado «Unidades agotadas» que contesta «SÍ se lo lleva» porque la promoción
    // no tiene tope no es una prueba: hace dudar de las líneas que sí importan.
    const s = sinComentarios(server);
    assert.match(s, /\.\.\.\(Number\.isFinite\(topeTotal\) && topeTotal > 0/);
    assert.match(s, /\.\.\.\(cuestaPuntos > 0/);
    assert.match(s, /\.\.\.\(minimo > 0/);
    assert.match(s, /\.\.\.\(Number\.isFinite\(topeCuenta\) && topeCuenta > 0/);
    assert.match(s, /\.\.\.\(promo\.local/);
  });

  test("todos los escenarios llevan su `cambia`", () => {
    const s = sinComentarios(server);
    // Se ancla en CÓDIGO, no en un comentario: `sinComentarios` los ha quitado, `indexOf` daba
    // -1 y el corte se comía media ruta.
    const i = s.indexOf("const escenarios = [");
    const j = s.indexOf("const productos = [];", i);
    assert.ok(i > 0 && j > i, "no se ha podido acotar la lista de escenarios");
    const ruta = s.slice(i, j);
    const nombres = [...ruta.matchAll(/nombre: "([^"]+)"/g)].map((m) => m[1]);
    const cambios = [...ruta.matchAll(/cambia: [`"]/g)];
    assert.ok(nombres.length >= 6, `solo ${nombres.length} escenarios`);
    assert.equal(cambios.length, nombres.length, "hay un escenario sin decir qué cambia");
  });

  test("simular NO escribe nada en ninguna parte", () => {
    const s = sinComentarios(server);
    const ruta = s.slice(s.indexOf('app.post("/api/fidelizacion/promos/simular"'),
                         s.indexOf('app.get("/api/fidelizacion/campanas/propuesta/:clave"'));
    for (const w of ["INSERT INTO", "UPDATE ", "DELETE FROM", "setConfig("]) {
      assert.ok(!ruta.includes(w), `simular ejecuta ${w}`);
    }
  });
});

// ── EL PANEL ─────────────────────────────────────────────────────────────────────────────────

describe("el panel pinta los requisitos", () => {
  test("una línea por requisito, no una por escenario", () => {
    assert.match(panel, /\(e\.requisitos \|\| \[\]\)\.map\(\(q\) =>/);
    assert.match(panel, /const marca = \{ ok: "✔", falla: "✖", no_evaluado: "·" \};/);
  });

  test("y enseña qué cambia cada escenario", () => {
    assert.match(panel, /e\.cambia \? ` <span class="mut">— \$\{esc\(e\.cambia\)\}<\/span>` : ""/);
  });

  test("dice la hora de Madrid con la que ha simulado", () => {
    assert.match(panel, /Hora de Madrid: \$\{esc\(j\.madrid\.fecha\)\} a las \$\{esc\(j\.madrid\.hora\)\}/);
  });

  test("usa una variable de color que EXISTE", () => {
    // `var(--line)` no está definida en ninguna hoja de la casa: el borde salía del color del
    // texto. La variable buena es `--border`.
    assert.ok(!panel.includes("var(--line)"), "usa una variable de color que no existe");
    assert.match(panel, /border-top:1px solid var\(--border\)/);
  });
});
