import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { tocaRecalcular, segmentoDe, edadDelCalculo, SQL_RECALCULO, SQL_PODAR,
         DIAS_DORMIDO, DIAS_PERDIDO, HUECO_ESTACIONAL } from "../../src/modules/clientes/metricas.js";

const HOY = "2026-08-31";

test("tocaRecalcular: contra una marca, no contra un temporizador", () => {
  // En Replit el proceso se reinicia tanto que un setInterval largo no se dispara nunca.
  assert.equal(tocaRecalcular({ ultimo: null, ahora: "2026-08-31T12:00:00Z" }), true);
  assert.equal(tocaRecalcular({ ultimo: "2026-08-31T11:00:00Z", ahora: "2026-08-31T12:00:00Z" }), false);
  assert.equal(tocaRecalcular({ ultimo: "2026-08-31T05:00:00Z", ahora: "2026-08-31T12:00:00Z" }), true);
});

test("una marca ilegible se trata como si no hubiera", () => {
  assert.equal(tocaRecalcular({ ultimo: "vete a saber", ahora: "2026-08-31T12:00:00Z" }), true);
});

test("sin reloj no se decide nada", () => {
  assert.equal(tocaRecalcular({ ultimo: null, ahora: null }), false);
});

test("quien no ha venido nunca", () => {
  const s = segmentoDe({ visitas: 0 }, { hoy: HOY });
  assert.equal(s.segmento, "nunca");
  assert.match(s.etiqueta, /No ha venido nunca/);
});

test("una visita es «nuevo»: la segunda es la que convierte a un cliente en cliente", () => {
  const s = segmentoDe({ visitas: 1, visitas_12m: 1, ultima_visita: "2026-08-20" }, { hoy: HOY });
  assert.equal(s.segmento, "nuevo");
});

test("cuatro visitas en el año es «habitual»", () => {
  const s = segmentoDe({ visitas: 9, visitas_12m: 4, ultima_visita: "2026-08-20" }, { hoy: HOY });
  assert.equal(s.segmento, "habitual");
  assert.match(s.etiqueta, /4 visitas este año/);
});

test("tres meses sin venir: dormido; seis: perdido", () => {
  const dormido = segmentoDe({ visitas: 3, visitas_12m: 2, ultima_visita: "2026-05-01", hueco_max: 30 }, { hoy: HOY });
  assert.equal(dormido.segmento, "dormido");
  assert.ok(dormido.diasSinVenir >= DIAS_DORMIDO);

  const perdido = segmentoDe({ visitas: 3, visitas_12m: 0, ultima_visita: "2025-09-01", hueco_max: 30 }, { hoy: HOY });
  assert.equal(perdido.segmento, "perdido");
  assert.ok(perdido.diasSinVenir >= DIAS_PERDIDO);
});

test("EL VERANEANTE NO ESTÁ PERDIDO", () => {
  // Blanes y Lloret son costa. Quien viene cada agosto lleva 300 días sin aparecer en junio y
  // sigue siendo un cliente fiel. Mandarle un «te echamos de menos» en marzo es la forma de que
  // te marque como pesado. Se reconoce porque ya se ausentó así antes y volvió.
  const v = segmentoDe({ visitas: 4, visitas_12m: 1, ultima_visita: "2025-08-15", hueco_max: 367 }, { hoy: HOY });
  assert.equal(v.segmento, "estacional");
  assert.equal(v.estacional, true);
  assert.notEqual(v.segmento, "perdido");
  assert.match(v.etiqueta, /por temporadas/);
});

test("pero un hueco corto no le salva de estar perdido", () => {
  const v = segmentoDe({ visitas: 4, visitas_12m: 0, ultima_visita: "2025-08-15", hueco_max: 40 }, { hoy: HOY });
  assert.equal(v.segmento, "perdido");
});

test("el umbral estacional es un año largo, no cualquier hueco", () => {
  assert.ok(HUECO_ESTACIONAL >= 300, "por debajo de eso, un parón de invierno se leería como temporada");
});

test("sin fecha de hoy no se inventa una recencia", () => {
  const s = segmentoDe({ visitas: 3, visitas_12m: 1, ultima_visita: "2026-01-01" }, {});
  assert.equal(s.diasSinVenir, null);
  assert.equal(s.segmento, "recurrente");
});

test("la etiqueta de tiempo se lee en meses cuando son muchos días", () => {
  assert.match(segmentoDe({ visitas: 2, ultima_visita: "2026-08-01", hueco_max: 10 }, { hoy: HOY }).etiqueta, /días|visitas/);
  const largo = segmentoDe({ visitas: 2, visitas_12m: 0, ultima_visita: "2025-02-01", hueco_max: 10 }, { hoy: HOY });
  assert.match(largo.etiqueta, /más de un año/);
});

test("edadDelCalculo dice de cuándo es el dato", () => {
  assert.equal(edadDelCalculo({ calculadoEn: "2026-08-31T12:00:00Z", ahora: "2026-08-31T12:00:30Z" }), "hace un momento");
  assert.equal(edadDelCalculo({ calculadoEn: "2026-08-31T08:00:00Z", ahora: "2026-08-31T12:00:00Z" }), "hace 4 horas");
  assert.equal(edadDelCalculo({ calculadoEn: "2026-08-29T12:00:00Z", ahora: "2026-08-31T12:00:00Z" }), "hace 2 días");
  assert.equal(edadDelCalculo({}), null);
});

describe("lo que el SQL tiene que garantizar", () => {
  test("una reserva futura NO cuenta como visita", () => {
    // Sin esto, quien acaba de reservar para Navidad aparecería como el cliente más reciente.
    assert.match(SQL_RECALCULO, /AND dia <= \$1/);
  });

  test("se identifica por los últimos 9 dígitos, como en toda la casa", () => {
    assert.match(SQL_RECALCULO, /RIGHT\(regexp_replace\(telefono, '\[\^0-9\]', '', 'g'\), 9\) AS tel9/);
  });

  test("no se reescriben filas que no han cambiado", () => {
    // Sin esto son decenas de miles de filas tocadas cada seis horas para dejarlas igual, y en
    // Neon eso es hinchazón y limpieza constante para nada.
    assert.match(SQL_RECALCULO, /IS DISTINCT FROM/);
  });

  test("el gasto lleva su suelo y su techo", () => {
    assert.match(SQL_RECALCULO, /LEAST\(GREATEST\(/);
    // Y el techo del ticket medio, que es la cota que se sostiene sola.
    assert.match(SQL_RECALCULO, /v\.ventas::numeric \/ NULLIF\(v\.tickets, 0\)\), \$3\), \$4\) AS pc_max/);
  });

  test("el hueco entre visitas se calcula por persona, no en global", () => {
    assert.match(SQL_RECALCULO, /PARTITION BY tel9 ORDER BY dia/);
  });

  test("y los que se quedan sin reservas se van de la tabla", () => {
    // Pasa al cancelar la única reserva de alguien o al unificar fichas repetidas.
    assert.match(SQL_PODAR, /DELETE FROM cliente_metricas/);
    assert.match(SQL_PODAR, /NOT EXISTS/);
  });
});
