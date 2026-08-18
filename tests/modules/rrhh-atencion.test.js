// FASE 8 — la bandeja operativa, en lo puro.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { construirAtencion, agrupar, ordenar, NIVELES, GRUPOS, FUERA_A_PROPOSITO } from "../../src/modules/rrhh/atencion.js";

const HOY = "2026-08-18";
const L = "Blanes";

describe("solo entra lo que se puede resolver", () => {
  test("sin nada que hacer, la bandeja está vacía", () => {
    assert.deepEqual(construirAtencion({ hoy: HOY, local: L }), []);
    assert.equal(agrupar([]).total, 0);
  });

  test("NINGÚN saldo de bolsa entra, y está escrito por qué", () => {
    // No existe una regla de negocio que diga cuándo un saldo «hay que resolverlo».
    // Inventar un umbral aquí sería una alerta que nadie ha pedido sobre un número que se
    // decide una vez al mes.
    const r = construirAtencion({ hoy: HOY, local: L });
    assert.ok(!r.some((a) => /bolsa|saldo|horas a favor/i.test(a.texto)));
    assert.ok(FUERA_A_PROPOSITO.includes("saldo de bolsa"));
  });

  test("ni un trabajador activo con todo en orden", () => {
    assert.ok(FUERA_A_PROPOSITO.includes("trabajador activo sin incidencias"));
    assert.ok(FUERA_A_PROPOSITO.includes("contrato correcto"));
    assert.ok(FUERA_A_PROPOSITO.includes("ausencia aprobada sin conflicto"));
  });
});

describe("cada asunto lleva a donde se resuelve", () => {
  const r = construirAtencion({
    hoy: HOY, local: L,
    jornadas: [{ worker_id: 7, nombre: "Juan Pérez", dia: "2026-08-17", motivo: "sin fichar la salida" }],
    ausenciasPendientes: [{ id: 3, worker_id: 8, nombre: "Marta Ruiz", tipo: "vacaciones", tipo_etiqueta: "Vacaciones", desde: "2026-09-10", hasta: "2026-09-20" }],
    turnosTrasBaja: [{ worker_id: 9, nombre: "Pedro Gil", fecha_baja: "2026-08-10", lunes: "2026-08-24", turnos: 2, local: L }],
    contratosSolapados: [{ worker_id: 10, nombre: "Ana Soto", n: 2 }],
    sinAreas: [{ id: 11, nombre: "Luis Vega", local: L }],
    documentos: [{ id: 20, worker_id: 12, nombre: "Eva Mora", doc: "DNI", fecha_caducidad: "2026-08-30", diasRestantes: 12, estado: "porCaducar" }],
  });

  test("todos tienen destino y etiqueta", () => {
    assert.equal(r.length, 6);
    for (const a of r) {
      assert.ok(a.accion && a.accion.destino, `«${a.texto}» no lleva a ninguna parte`);
      assert.ok(a.accion.etiqueta, "sin etiqueta de botón");
      assert.ok(a.texto.length > 10, "el texto no dice nada");
    }
  });

  test("la jornada lleva a Revisión CON la persona y el día", () => {
    const a = r.find((x) => x.tipo === "jornada_revisar");
    assert.equal(a.accion.destino, "revision");
    assert.equal(a.accion.worker_id, 7);
    assert.equal(a.accion.dia, "2026-08-17");
    assert.match(a.texto, /Juan Pérez · sin fichar la salida/);
  });

  test("los turnos tras una baja llevan a LA SEMANA, no a «Horarios»", () => {
    // El sistema sabe exactamente cuál es. Obligar a buscarla es el trabajo que esto quita.
    const a = r.find((x) => x.tipo === "turnos_tras_baja");
    assert.equal(a.accion.destino, "horarios");
    assert.equal(a.accion.lunes, "2026-08-24");
    assert.equal(a.accion.local, L);
    assert.equal(a.nivel, "bloqueo", "hay un cuadrante publicado con alguien que ya no está");
  });

  test("el documento lleva a SUS documentos, no a la ficha entera", () => {
    const a = r.find((x) => x.tipo === "documento_caduca");
    assert.equal(a.accion.destino, "documentos");
    assert.equal(a.accion.worker_id, 12);
    assert.match(a.texto, /caduca en 12 día/);
  });

  test("las áreas llevan a donde se configuran, con el local puesto", () => {
    const a = r.find((x) => x.tipo === "sin_areas");
    assert.equal(a.accion.destino, "areas");
    assert.equal(a.accion.local, L);
  });

  test("y cada asunto tiene una clave estable", () => {
    const claves = r.map((a) => a.clave);
    assert.equal(new Set(claves).size, claves.length, "hay claves repetidas");
    for (const c of claves) assert.match(c, /^[a-z]+:/);
  });
});

describe("el orden sale de lo que cuesta ignorarlo", () => {
  test("primero lo que bloquea, después lo que espera decisión", () => {
    const r = construirAtencion({
      hoy: HOY, local: L,
      documentos: [{ id: 1, worker_id: 1, nombre: "A", doc: "DNI", fecha_caducidad: "2026-08-25", diasRestantes: 7, estado: "porCaducar" }],
      jornadas: [{ worker_id: 2, nombre: "B", dia: "2026-08-17", motivo: "x" }],
      contratosSolapados: [{ worker_id: 3, nombre: "C", n: 2 }],
    });
    assert.deepEqual(r.map((a) => a.nivel), ["bloqueo", "decision", "aviso"]);
  });

  test("dentro del mismo nivel, primero lo más cercano", () => {
    const r = construirAtencion({
      hoy: HOY, local: L,
      jornadas: [{ worker_id: 1, nombre: "A", dia: "2026-08-17", motivo: "x" },
                 { worker_id: 2, nombre: "B", dia: "2026-08-10", motivo: "y" }],
    });
    assert.deepEqual(r.map((a) => a.fecha), ["2026-08-10", "2026-08-17"]);
  });

  test("UNA AUSENCIA QUE EMPIEZA YA sube a bloqueo", () => {
    // Una solicitud para dentro de tres meses puede esperar. Una que empieza el lunes que
    // viene y sigue sin respuesta es un problema: el cuadrante ya se está haciendo.
    const lejos = construirAtencion({ hoy: HOY, local: L,
      ausenciasPendientes: [{ id: 1, worker_id: 1, nombre: "A", tipo: "vacaciones", desde: "2026-12-01", hasta: "2026-12-10" }] });
    const cerca = construirAtencion({ hoy: HOY, local: L,
      ausenciasPendientes: [{ id: 2, worker_id: 2, nombre: "B", tipo: "vacaciones", desde: "2026-08-22", hasta: "2026-08-30" }] });
    assert.equal(lejos[0].nivel, "decision");
    assert.equal(cerca[0].nivel, "bloqueo");
    assert.match(cerca[0].texto, /empieza en 4 día/);
  });

  test("y una que YA empezó lo dice a gritos", () => {
    const r = construirAtencion({ hoy: HOY, local: L,
      ausenciasPendientes: [{ id: 3, worker_id: 3, nombre: "C", tipo: "vacaciones", desde: "2026-08-15", hasta: "2026-08-20" }] });
    assert.match(r[0].texto, /YA HA EMPEZADO/);
    assert.equal(r[0].nivel, "bloqueo");
  });

  test("un documento VENCIDO es bloqueo; uno que caduca, aviso", () => {
    const r = construirAtencion({ hoy: HOY, local: L, documentos: [
      { id: 1, worker_id: 1, nombre: "A", doc: "DNI", fecha_caducidad: "2026-08-01", diasRestantes: -17, estado: "vencido" },
      { id: 2, worker_id: 2, nombre: "B", doc: "Carnet", fecha_caducidad: "2026-09-05", diasRestantes: 18, estado: "porCaducar" }]});
    assert.equal(r[0].nivel, "bloqueo");
    assert.match(r[0].texto, /VENCIDO desde el 2026-08-01/);
    assert.equal(r[1].nivel, "aviso");
  });
});

describe("agrupada para pintarla", () => {
  const r = construirAtencion({
    hoy: HOY, local: L,
    jornadas: [{ worker_id: 1, nombre: "A", dia: "2026-08-17", motivo: "x" }],
    ausenciasPendientes: [{ id: 1, worker_id: 2, nombre: "B", tipo: "vacaciones", desde: "2026-12-01", hasta: "2026-12-10" }],
    sinAreas: [{ id: 3, nombre: "C", local: L }],
  });
  const g = agrupar(r);

  test("el total y los bloqueos se dicen aparte", () => {
    assert.equal(g.total, 3);
    assert.equal(g.bloqueos, 0);
  });
  test("los grupos vacíos no se pintan", () => {
    assert.deepEqual(g.grupos.map((x) => x.clave), ["fichajes", "ausencias", "equipo"]);
    assert.ok(!g.grupos.some((x) => x.clave === "horarios"));
  });
  test("y salen en el orden de siempre, no en el que llegaron", () => {
    assert.deepEqual(GRUPOS.map((x) => x.clave), ["fichajes", "ausencias", "horarios", "equipo"]);
  });
  test("los niveles tienen un orden explícito", () => {
    assert.ok(NIVELES.bloqueo < NIVELES.decision && NIVELES.decision < NIVELES.aviso);
  });
});

describe("no se rompe con datos raros", () => {
  test("sin fecha de hoy no revienta", () => {
    const r = construirAtencion({ local: L, ausenciasPendientes: [{ id: 1, worker_id: 1, nombre: "A", tipo: "x", desde: "2026-09-01", hasta: "2026-09-05" }] });
    assert.equal(r.length, 1);
    assert.equal(r[0].nivel, "decision");
  });
  test("listas vacías o ausentes dan bandeja vacía", () => {
    assert.deepEqual(construirAtencion({}), []);
    assert.deepEqual(construirAtencion({ jornadas: [], documentos: [] }), []);
  });
  test("ordenar es estable con asuntos sin fecha", () => {
    const r = ordenar([{ nivel: "aviso", grupo: "equipo" }, { nivel: "bloqueo", grupo: "equipo" }]);
    assert.equal(r[0].nivel, "bloqueo");
  });
});
