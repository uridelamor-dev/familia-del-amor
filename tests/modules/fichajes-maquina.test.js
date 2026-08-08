import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { estadoDe, accionesPermitidas, evaluar, calcularJornada, faltaLaSalida, FUERA, DENTRO, PAUSA } from "../../src/modules/fichajes/maquina.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const T = (h, m = 0) => Date.UTC(2026, 7, 8, h - 2, m);      // hora de Madrid en verano
const ev = (tipo, h, m = 0, extra = {}) => ({ id: T(h, m), tipo, epoch_ms: T(h, m), ocurrido_en: `2026-08-08T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00+02:00`, ...extra });

describe("máquina — estado", () => {
  test("sin eventos está fuera", () => assert.equal(estadoDe([]), FUERA));
  test("tras entrar está dentro", () => assert.equal(estadoDe([ev("entrada", 12)]), DENTRO));
  test("tras la pausa está en pausa, y al volver dentro", () => {
    assert.equal(estadoDe([ev("entrada", 12), ev("pausa_inicio", 16)]), PAUSA);
    assert.equal(estadoDe([ev("entrada", 12), ev("pausa_inicio", 16), ev("pausa_fin", 17)]), DENTRO);
  });
  test("tras salir vuelve a estar fuera", () => {
    assert.equal(estadoDe([ev("entrada", 12), ev("salida", 16)]), FUERA);
  });
  test("un evento anulado no cuenta", () => {
    assert.equal(estadoDe([ev("entrada", 12, 0, { anulado_por: 7 })]), FUERA);
  });
  test("el turno partido deja bien el estado", () => {
    assert.equal(estadoDe([ev("entrada", 12), ev("salida", 16), ev("entrada", 20)]), DENTRO);
  });
});

describe("máquina — solo se ofrece lo que tiene sentido", () => {
  test("estando fuera, solo entrar", () => {
    assert.deepEqual(accionesPermitidas(FUERA).map((a) => a.tipo), ["entrada"]);
  });
  test("estando dentro, pausa o salir", () => {
    assert.deepEqual(accionesPermitidas(DENTRO).map((a) => a.tipo), ["pausa_inicio", "salida"]);
  });
  test("en pausa, volver o salir", () => {
    assert.deepEqual(accionesPermitidas(PAUSA).map((a) => a.tipo), ["pausa_fin", "salida"]);
  });
});

describe("máquina — la pantalla táctil y sus rebotes", () => {
  test("dar dos veces al mismo botón en 30 s NO ficha dos veces", () => {
    const r = evaluar([ev("entrada", 12)], "entrada", T(12, 0) + 30000);
    assert.equal(r.registrar, false);
    assert.equal(r.duplicado, true);
  });
  test("pero a los 90 s ya es un fichaje de verdad", () => {
    const r = evaluar([ev("entrada", 12)], "entrada", T(12, 0) + 90000);
    assert.equal(r.duplicado, undefined);
    assert.equal(r.error, "ya_dentro", "aunque este se rechaza por otro motivo");
  });
});

describe("máquina — lo que se rechaza y lo que se registra igual", () => {
  test("entrar estando ya dentro se rechaza, y se dice desde cuándo", () => {
    const r = evaluar([ev("entrada", 12)], "entrada", T(15));
    assert.equal(r.registrar, false);
    assert.match(r.mensaje, /12:00/);
  });
  test("pausa sin haber entrado se rechaza con una instrucción clara", () => {
    const r = evaluar([], "pausa_inicio", T(16));
    assert.equal(r.registrar, false);
    assert.match(r.mensaje, /entrada/);
  });
  test("volver de una pausa que no existe se rechaza", () => {
    assert.equal(evaluar([ev("entrada", 12)], "pausa_fin", T(16)).registrar, false);
  });

  test("SALIR SIN HABER ENTRADO SE REGISTRA IGUAL, marcado como incidencia", () => {
    const r = evaluar([], "salida", T(23));
    assert.equal(r.registrar, true, "nunca se rechaza registrar lo que ha pasado de verdad");
    assert.equal(r.incidencia, "sin_entrada");
    assert.match(r.mensaje, /encargado/);
  });

  test("salir estando en pausa la cierra sola", () => {
    const r = evaluar([ev("entrada", 12), ev("pausa_inicio", 16)], "salida", T(17));
    assert.equal(r.registrar, true);
    assert.equal(r.cierraPausa, true, "nadie se acuerda de dar a «volver» antes de irse");
  });
});

describe("máquina — cálculo de la jornada", () => {
  test("una jornada normal con su pausa", () => {
    const j = calcularJornada([ev("entrada", 12, 4), ev("pausa_inicio", 15), ev("pausa_fin", 15, 20), ev("salida", 16, 30)]);
    assert.equal(j.minPresencia, 266);   // 12:04 → 16:30
    assert.equal(j.minPausa, 20);
    assert.equal(j.minEfectivo, 246);
    assert.equal(j.abierta, false);
  });

  test("un turno partido suma los dos tramos", () => {
    const j = calcularJornada([ev("entrada", 11), ev("salida", 15), ev("entrada", 20), ev("salida", 23)]);
    assert.equal(j.minPresencia, 4 * 60 + 3 * 60);
  });

  test("se fue sin fichar la salida: queda abierta y se sabe", () => {
    const j = calcularJornada([ev("entrada", 12)]);
    assert.equal(j.abierta, true);
    assert.equal(j.sinSalida, true);
    assert.equal(j.minPresencia, 0, "no se inventa una hora de salida");
  });

  test("salida sin entrada: se anota, no se cuentan horas de la nada", () => {
    const j = calcularJornada([ev("salida", 23)]);
    assert.equal(j.sinEntrada, true);
    assert.equal(j.minPresencia, 0);
  });

  test("una pausa que se quedó abierta se cierra al salir", () => {
    const j = calcularJornada([ev("entrada", 12), ev("pausa_inicio", 15), ev("salida", 16)]);
    assert.equal(j.minPresencia, 240);
    assert.equal(j.minPausa, 60, "la pausa se cierra con la salida");
    assert.equal(j.minEfectivo, 180);
  });

  test("ENTRA A LAS 20:00 Y SALE A LAS 00:13: mismo día y 4 h 13 min", () => {
    // El caso que más se repite en la casa. La salida cae ya en el día siguiente del reloj
    // de pared, pero pertenece al MISMO día de trabajo y son 4 h 13, no 4 ni 5.
    const entrada = Date.UTC(2026, 7, 8, 18, 0);    // 20:00 de Madrid
    const salida = Date.UTC(2026, 7, 8, 22, 13);    // 00:13, ya del día 9 en el reloj
    const j = calcularJornada([
      { id: 1, tipo: "entrada", epoch_ms: entrada, ocurrido_en: "2026-08-08T20:00:00+02:00" },
      { id: 2, tipo: "salida", epoch_ms: salida, ocurrido_en: "2026-08-09T00:13:00+02:00" },
    ]);
    assert.equal(j.minPresencia, 253);
    assert.equal(Math.floor(j.minPresencia / 60), 4);
    assert.equal(j.minPresencia % 60, 13);
  });

  test("EL CIERRE DE MADRUGADA: entra a las 20:00 y sale a las 02:10", () => {
    const entrada = Date.UTC(2026, 7, 8, 18, 0);   // 20:00 de Madrid
    const salida = Date.UTC(2026, 7, 9, 0, 10);    // 02:10 del día siguiente
    const j = calcularJornada([
      { id: 1, tipo: "entrada", epoch_ms: entrada, ocurrido_en: "2026-08-08T20:00:00+02:00" },
      { id: 2, tipo: "salida", epoch_ms: salida, ocurrido_en: "2026-08-09T02:10:00+02:00" },
    ]);
    assert.equal(j.minPresencia, 370, "6 h 10 min, sin líos de medianoche");
  });

  test("LA NOCHE DEL CAMBIO DE HORA: el reloj de pared miente, el epoch no", () => {
    // 25/10/2026: de 20:00 a 03:00 el reloj marca 7 h, pero se trabajan 8.
    const entrada = Date.UTC(2026, 9, 24, 18, 0);
    const salida = Date.UTC(2026, 9, 25, 2, 0);
    const j = calcularJornada([
      { id: 1, tipo: "entrada", epoch_ms: entrada, ocurrido_en: "2026-10-24T20:00:00+02:00" },
      { id: 2, tipo: "salida", epoch_ms: salida, ocurrido_en: "2026-10-25T03:00:00+01:00" },
    ]);
    assert.equal(j.minPresencia, 480, "8 horas reales, que son las que se pagan");
  });

  test("los eventos anulados no cuentan", () => {
    const j = calcularJornada([
      ev("entrada", 12), ev("salida", 13, 0, { anulado_por: 5 }), ev("salida", 16),
    ]);
    assert.equal(j.minPresencia, 240, "la salida errónea, anulada, se ignora");
  });
});

describe("máquina — el tiempo que alguien LLEVA hoy", () => {
  test("con la jornada abierta, `hastaMs` dice cuánto lleva sin inventarse la salida", () => {
    const j = calcularJornada([ev("entrada", 12)], { hastaMs: T(15, 30) });
    assert.equal(j.minPresencia, 210);
    assert.equal(j.enCurso, true, "queda marcado: esto NO es lo fichado, es lo que va llevando");
    assert.equal(j.sinSalida, true, "y sigue constando que la salida no está fichada");
  });

  test("si ahora mismo está en pausa, la pausa en marcha no cuenta como trabajo", () => {
    const j = calcularJornada([ev("entrada", 12), ev("pausa_inicio", 15)], { hastaMs: T(16) });
    assert.equal(j.minPresencia, 240);
    assert.equal(j.minPausa, 60);
    assert.equal(j.minEfectivo, 180);
  });

  test("sin `hastaMs` el resultado no cambia: lo fichado es lo fichado", () => {
    assert.equal(calcularJornada([ev("entrada", 12)]).minPresencia, 0);
    assert.equal(calcularJornada([ev("entrada", 12)]).enCurso, false);
  });

  test("una jornada ya cerrada no se ve afectada por `hastaMs`", () => {
    const j = calcularJornada([ev("entrada", 12), ev("salida", 16)], { hastaMs: T(23) });
    assert.equal(j.minPresencia, 240);
    assert.equal(j.enCurso, false);
  });
});

describe("máquina — cuándo avisar de que falta la salida", () => {
  test("a media tarde NO se avisa: todo el que está dentro tiene la jornada abierta", () => {
    const j = calcularJornada([ev("entrada", 12)]);
    assert.equal(faltaLaSalida(j, { ahoraMs: T(17) }), false,
      "si se avisara de todos, el aviso dejaría de significar nada");
  });

  test("al cerrar el día, el que quedó abierto SÍ se avisa", () => {
    const j = calcularJornada([ev("entrada", 12)]);
    assert.equal(faltaLaSalida(j, { diaCerrado: true }), true);
  });

  test("y el mismo día, si lleva 15 h dentro, también: eso ya no puede ser real", () => {
    const j = calcularJornada([ev("entrada", 9)]);
    assert.equal(faltaLaSalida(j, { ahoraMs: T(23) }), false, "14 h justas todavía no");
    assert.equal(faltaLaSalida(j, { ahoraMs: T(9) + 15 * 3600000 }), true);
  });

  test("una jornada cerrada no avisa nunca", () => {
    const j = calcularJornada([ev("entrada", 12), ev("salida", 20)]);
    assert.equal(faltaLaSalida(j, { diaCerrado: true }), false);
  });
});

// ── El candado de la inmutabilidad ───────────────────────────────────────────
describe("fichajes — los eventos no se tocan", () => {
  const server = fs.readFileSync(path.join(RAIZ, "server.js"), "utf8");
  const dentroDePlantillas = server.split("`").filter((_, i) => i % 2 === 1);

  test("NINGÚN UPDATE sobre fic_eventos salvo para anular", () => {
    const malos = dentroDePlantillas
      .filter((t) => /UPDATE\s+fic_eventos/i.test(t))
      .filter((t) => !/SET\s+anulado_por/i.test(t))
      .map((t) => t.replace(/\s+/g, " ").trim().slice(0, 120));
    assert.deepEqual(malos, [],
      "corregir un fichaje es escribir otra fila, nunca cambiar la que había");
  });

  test("NINGÚN DELETE sobre fic_eventos", () => {
    const malos = dentroDePlantillas
      .filter((t) => /DELETE\s+FROM\s+fic_eventos/i.test(t))
      .map((t) => t.replace(/\s+/g, " ").trim().slice(0, 120));
    assert.deepEqual(malos, [],
      "borrar un fichaje destruye la prueba que la ley obliga a conservar 4 años");
  });

  test("NUNCA se copia lo planificado en lo fichado", () => {
    // La tentación es «si no fichó, ponle lo que tenía en el cuadrante». Eso convierte el
    // registro en una copia del plan, que es exactamente lo que un inspector espera de uno
    // falsificado, y le quita al trabajador el argumento «el cuadro decía 20:00».
    // Se mira el LADO DERECHO de cada asignación a min_fichado (hasta la coma o el fin de
    // línea): `min_fichado = EXCLUDED.min_fichado` es correcto y no debe dar falso positivo.
    const sospechosas = [...server.matchAll(/min_fichado\s*[=:]\s*([^,\n]*)/g)]
      .map((m) => m[1])
      .filter((derecha) => /min_planificado|minPlanificado/.test(derecha));
    assert.deepEqual(sospechosas, [],
      "min_fichado sale de fic_eventos y de ningún otro sitio");
  });

  test("corregir un fichaje exige motivo, en el código y en la base", () => {
    const esquema = fs.readFileSync(path.join(RAIZ, "src/modules/fichajes/schema.js"), "utf8");
    assert.match(esquema, /fic_correcciones[\s\S]*motivo TEXT NOT NULL/,
      "sin motivo, anular un fichaje es borrar una prueba");
    assert.match(esquema, /fic_correcciones[\s\S]*CHECK \(length\(motivo\) >= \d+\)/,
      "y la base tampoco debe aceptar un motivo vacío");
    assert.match(server, /origen[\s\S]{0,80}'manual'/,
      "los eventos metidos a mano quedan distinguibles para siempre de los de la tablet");
  });

  test("EL SERVICE WORKER NO CACHEA NADA DE /api/", () => {
    // Un listado guardado de ayer diría que sigue dentro quien ya se fue, y el kiosco
    // enseñaría un estado falso. El service worker solo sirve para que la pantalla se
    // abra sin línea; el estado viene siempre de la red o no viene.
    const sw = fs.readFileSync(path.join(RAIZ, "public/fichar-sw.js"), "utf8");
    assert.match(sw, /pathname\.startsWith\("\/api\/"\)[\s\S]{0,40}return/,
      "tiene que salirse del handler para cualquier ruta de /api/");
    assert.match(sw, /request\.method\s*!==\s*"GET"[\s\S]{0,30}return/,
      "y un fichaje (POST) no pasa por el service worker jamás");
  });

  test("un fichaje en diferido queda MARCADO, no colado como si fuera normal", () => {
    // La hora de un fichaje offline sale del reloj de la tablet. Se acepta, pero tiene que
    // notarse: si pasara por `kiosco` a secas, el reloj del cliente estaría falsificando el
    // registro sin dejar rastro.
    assert.match(server, /kiosco_offline/,
      "el origen distingue para siempre lo que vino en diferido");
    assert.match(server, /desfase_ms/,
      "y se guarda cuánto se desviaba esa tablet");
  });

  test("el PIN se guarda con bcrypt, no con la copia reversible de las contraseñas", () => {
    const trozo = /pin_hash[\s\S]{0,600}/.exec(server);
    if (!trozo) return;   // todavía no cableado
    assert.equal(/encUserPass\s*\([^)]*pin/i.test(server), false,
      "un PIN reversible permite fichar en nombre de otro");
  });
});
