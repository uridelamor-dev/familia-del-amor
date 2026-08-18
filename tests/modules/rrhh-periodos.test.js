// FASE 7 — periodos laborales y configuración operativa, en lo puro.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  periodoAbierto, periodoActual, enPeriodo, antiguedadActual, historialLegible,
  motivoNoRecontratar, periodosSolapados, periodoInicialDe, compatibilidadUsers,
} from "../../src/modules/rrhh/periodos.js";
import { configLegible, motivoNoGuardar, PARAMETROS, AVISO_NO_RETROACTIVO } from "../../src/modules/horarios/config.js";
import { asuntosPendientes } from "../../src/modules/rrhh/ciclo.js";

const HOY = "2026-08-18";
// El caso de Uriel: Juan se fue en 2024 y volvió en 2026.
const JUAN = [
  { id: 1, worker_id: 7, local: "Blanes", fecha_alta: "2022-02-01", fecha_baja: "2024-09-30" },
  { id: 2, worker_id: 7, local: "Lloret", fecha_alta: "2026-03-15", fecha_baja: null },
];

describe("dos etapas, una sola persona", () => {
  test("la incorporación abierta es la de ahora", () => {
    assert.equal(periodoAbierto(JUAN).id, 2);
    assert.equal(periodoActual(JUAN).id, 2);
  });
  test("con todo cerrado no hay ninguna abierta", () => {
    assert.equal(periodoAbierto([JUAN[0]]), null);
    assert.equal(periodoActual([JUAN[0]]).id, 1, "pero sí la más reciente");
  });
  test("EN EL HUECO ENTRE LAS DOS NO TRABAJABA", () => {
    // Es lo que un solo `fecha_alta` no sabía contestar: en 2025 Juan no estaba aquí.
    assert.equal(enPeriodo(JUAN, "2023-06-01"), true);
    assert.equal(enPeriodo(JUAN, "2024-09-30"), true, "su último día de la primera etapa");
    assert.equal(enPeriodo(JUAN, "2024-10-01"), false);
    assert.equal(enPeriodo(JUAN, "2025-06-01"), false, "el año que no estuvo");
    assert.equal(enPeriodo(JUAN, "2026-03-14"), false);
    assert.equal(enPeriodo(JUAN, "2026-03-15"), true, "su primer día de vuelta");
  });
  test("antes de la primera tampoco", () => {
    assert.equal(enPeriodo(JUAN, "2021-12-31"), false);
  });
});

describe("LA ANTIGÜEDAD ES LA DE LA INCORPORACIÓN ACTUAL", () => {
  test("desde marzo de 2026, no desde 2022", () => {
    // Sumar los periodos daría «4 años y pico», que se lee como antigüedad reconocida y no
    // lo es: cuánta se reconoce al volver lo dice el convenio, no una función.
    const a = antiguedadActual(JUAN, HOY);
    assert.equal(a.desde, "2026-03-15");
    assert.equal(a.meses, 5);
    assert.equal(a.texto, "5 meses");
  });
  test("y no incluye ni un día de la etapa anterior", () => {
    assert.ok(antiguedadActual(JUAN, HOY).meses < 12, "se están sumando periodos");
  });
  test("años y meses se leen como una persona los diría", () => {
    assert.equal(antiguedadActual([{ id: 1, fecha_alta: "2024-03-14" }], HOY).texto, "2 años y 5 meses");
    assert.equal(antiguedadActual([{ id: 1, fecha_alta: "2025-08-18" }], HOY).texto, "1 año");
    assert.equal(antiguedadActual([{ id: 1, fecha_alta: "2026-08-01" }], HOY).texto, "menos de un mes");
    assert.equal(antiguedadActual([{ id: 1, fecha_alta: "2026-08-18" }], HOY).texto, "menos de un mes");
  });
  test("el día del mes cuenta: del 20 al 18 no es un mes entero", () => {
    assert.equal(antiguedadActual([{ id: 1, fecha_alta: "2026-07-20" }], HOY).meses, 0);
    assert.equal(antiguedadActual([{ id: 1, fecha_alta: "2026-07-18" }], HOY).meses, 1);
  });
  test("de alguien que ya se fue, se congela en su último día", () => {
    const a = antiguedadActual([JUAN[0]], HOY);
    assert.equal(a.hasta, "2024-09-30");
    assert.equal(a.cerrado, true);
  });
  test("sin periodos no se inventa nada", () => {
    assert.equal(antiguedadActual([], HOY), null);
  });
});

describe("el historial se lee de más reciente a más antiguo", () => {
  const h = historialLegible(JUAN);
  test("el orden", () => { assert.deepEqual(h.map((x) => x.id), [2, 1]); });
  test("la abierta se marca", () => {
    assert.equal(h[0].abierto, true);
    assert.equal(h[0].texto, "2026-03-15 — actual");
    assert.equal(h[1].texto, "2022-02-01 — 2024-09-30");
  });
  test("y cada una lleva SU establecimiento", () => {
    // Volvió a otro sitio. Sin guardarlo por etapa, su histórico diría que siempre fue de
    // Lloret y las horas de 2022 se leerían del local equivocado.
    assert.equal(h[0].local, "Lloret");
    assert.equal(h[1].local, "Blanes");
  });
});

describe("cuándo se puede recontratar", () => {
  test("a quien sigue en plantilla, no", () => {
    assert.match(motivoNoRecontratar(JUAN, "2026-09-01"), /sigue abierta/);
  });
  test("a quien se fue, sí", () => {
    assert.equal(motivoNoRecontratar([JUAN[0]], "2026-03-15"), null);
  });
  test("VOLVER ANTES DE HABERSE IDO NO: serían dos etapas vivas a la vez", () => {
    assert.match(motivoNoRecontratar([JUAN[0]], "2024-09-30"), /tiene que ser posterior/);
    assert.match(motivoNoRecontratar([JUAN[0]], "2024-01-01"), /tiene que ser posterior/);
    assert.equal(motivoNoRecontratar([JUAN[0]], "2024-10-01"), null, "el día siguiente sí");
  });
  test("sin fecha tampoco", () => {
    assert.match(motivoNoRecontratar([JUAN[0]], ""), /Falta la fecha/);
  });
  test("y de alguien sin histórico, se puede", () => {
    assert.equal(motivoNoRecontratar([], "2026-03-15"), null);
  });
});

describe("solapes en un histórico que ya existe", () => {
  test("se enseñan, no se arreglan", () => {
    const malo = [{ id: 1, fecha_alta: "2022-01-01", fecha_baja: "2024-12-31" },
                  { id: 2, fecha_alta: "2024-06-01", fecha_baja: null }];
    assert.deepEqual(periodosSolapados(malo), [{ a: 1, b: 2 }]);
  });
  test("dos etapas limpias no solapan", () => {
    assert.deepEqual(periodosSolapados(JUAN), []);
  });
  test("una abierta antes de otra sí", () => {
    const malo = [{ id: 1, fecha_alta: "2022-01-01", fecha_baja: null },
                  { id: 2, fecha_alta: "2026-01-01", fecha_baja: null }];
    assert.equal(periodosSolapados(malo).length, 1);
  });
});

describe("MIGRAR SIN INVENTAR FECHAS", () => {
  test("con fecha de alta, se migra", () => {
    const r = periodoInicialDe({ id: 7, local: "Blanes", fecha_alta: "2024-03-14", fecha_baja: null });
    assert.equal(r.migrable, true);
    assert.equal(r.periodo.fecha_alta, "2024-03-14");
    assert.equal(r.periodo.local, "Blanes");
  });
  test("SIN fecha de alta NO se migra, y se dice por qué", () => {
    // Ni hoy, ni el primer fichaje, ni 1970. Esa fecha decide antigüedad y finiquito;
    // ponerla a ojo es escribir un dato que parece bueno y no lo es.
    const r = periodoInicialDe({ id: 8, local: "Blanes", fecha_alta: null });
    assert.equal(r.migrable, false);
    assert.match(r.motivo, /sin fecha de alta/);
    assert.equal(r.periodo, undefined, "no se ha construido ningún periodo");
  });
  test("con la baja anterior al alta tampoco: eso no es una etapa", () => {
    const r = periodoInicialDe({ id: 9, fecha_alta: "2024-05-01", fecha_baja: "2023-01-01" });
    assert.equal(r.migrable, false);
  });
  test("la baja se conserva tal cual", () => {
    assert.equal(periodoInicialDe({ id: 7, fecha_alta: "2022-02-01", fecha_baja: "2024-09-30" }).periodo.fecha_baja, "2024-09-30");
  });
});

describe("compatibilidad con lo que ya lee `users`", () => {
  test("refleja la etapa MÁS RECIENTE", () => {
    assert.deepEqual(compatibilidadUsers(JUAN), { fecha_alta: "2026-03-15", fecha_baja: null });
  });
  test("de quien se fue, con su baja", () => {
    assert.deepEqual(compatibilidadUsers([JUAN[0]]), { fecha_alta: "2022-02-01", fecha_baja: "2024-09-30" });
  });
  test("sin etapas, nada", () => {
    assert.deepEqual(compatibilidadUsers([]), { fecha_alta: null, fecha_baja: null });
  });
});

describe("los ajustes se explican por lo que HACEN", () => {
  const cfg = configLegible({ tolerancia_min: 10, tolerancia_bolsa_min: 10, dia_inicio_periodo: 21, corte_dia_min: 360 },
    { puedeEditar: true });
  const de = (k) => cfg.find((x) => x.clave === k);

  test("ninguno se enseña por su nombre de columna", () => {
    for (const p of cfg) {
      assert.ok(!/_min|_periodo|tolerancia_/.test(p.etiqueta), `«${p.etiqueta}» sigue siendo el nombre técnico`);
      assert.ok(p.ayuda.length > 40, `${p.clave} no explica qué hace`);
    }
  });

  test("LOS DOS DIECES SE DISTINGUEN, que es lo que más se confunde", () => {
    // Los dos valen 10 por defecto y hacen cosas distintas: uno decide si se pinta un aviso
    // y el otro decide horas que se cobran.
    assert.match(de("tolerancia_min").ayuda, /No mueve ni un minuto/);
    assert.match(de("tolerancia_bolsa_min").aviso, /horas que se deben o se cobran/);
    assert.notEqual(de("tolerancia_min").etiqueta, de("tolerancia_bolsa_min").etiqueta);
  });

  test("el ejemplo lleva el valor puesto, no uno genérico", () => {
    assert.match(de("tolerancia_bolsa_min").ejemplo, /\+11 apunta \+1/);
    assert.match(de("dia_inicio_periodo").ejemplo, /Del 21 de cada mes al 20 del siguiente/);
    const uno = configLegible({ dia_inicio_periodo: 1 }, { puedeEditar: true });
    assert.match(uno.find((x) => x.clave === "dia_inicio_periodo").ejemplo, /primer al último día/);
  });

  test("EL CORTE DE DÍA NO SE PUEDE EDITAR, y se dice por qué", () => {
    // Cambiarlo reinterpreta fichajes ya registrados: los de madrugada saltan de un día a
    // otro, y con ellos horas validadas y periodos que pueden estar cerrados.
    assert.equal(de("corte_dia_min").editable, false);
    assert.match(de("corte_dia_min").porQueNo, /periodos cerrados/);
    assert.equal(de("corte_dia_min").valorTexto, "06:00", "y se enseña como hora, no como 360");
  });

  test("el encargado lo ve pero no lo toca", () => {
    for (const p of configLegible({}, { puedeEditar: false })) assert.equal(p.editable, false);
  });

  test("los valores fuera de rango se rechazan en el servidor", () => {
    assert.equal(motivoNoGuardar("tolerancia_bolsa_min", 15), null);
    assert.match(motivoNoGuardar("tolerancia_bolsa_min", -1), /entre 0 y 120/);
    assert.match(motivoNoGuardar("tolerancia_bolsa_min", 500), /entre 0 y 120/);
    assert.match(motivoNoGuardar("tolerancia_bolsa_min", 10.5), /entero/);
    assert.match(motivoNoGuardar("dia_inicio_periodo", 31), /entre 1 y 28/);
    assert.match(motivoNoGuardar("corte_dia_min", 300), /periodos cerrados/);
    assert.match(motivoNoGuardar("inventado", 1), /no existe/);
  });

  test("y se avisa de que nada se recalcula hacia atrás", () => {
    assert.match(AVISO_NO_RETROACTIVO, /Nada de lo ya registrado se recalcula/);
    assert.match(AVISO_NO_RETROACTIVO, /periodos cerrados/);
  });

  test("los defectos son los que ya había: cambiar esto no cambia nada por sí solo", () => {
    assert.equal(PARAMETROS.tolerancia_min.defecto, 10);
    assert.equal(PARAMETROS.tolerancia_bolsa_min.defecto, 10);
    assert.equal(PARAMETROS.dia_inicio_periodo.defecto, 1);
    assert.equal(PARAMETROS.corte_dia_min.defecto, 360);
  });
});

describe("«Necesita atención» solo trae lo que se puede resolver", () => {
  const base = { estado: { clave: "activo", enPlantilla: true }, contrato: { vigente: { horas_semana: 40 }, solapados: [] },
                 areas: { configurado: true }, ausencias: { pendientes: [] }, horas: { sinValidar: 0 },
                 bolsa: { saldo: 30 }, periodos: { solapados: [] } };

  test("una ficha sana no avisa de nada", () => {
    assert.deepEqual(asuntosPendientes(base, HOY), []);
  });

  test("UN DATO NORMAL NO ES UN AVISO", () => {
    // Tener 40 h de contrato, o doce minutos en la bolsa, no es nada que resolver. Si cada
    // dato se convierte en alerta, se dejan de leer todas.
    assert.equal(asuntosPendientes({ ...base, bolsa: { saldo: 12 } }, HOY).length, 0);
    assert.equal(asuntosPendientes({ ...base, contrato: { vigente: { horas_semana: 40 }, solapados: [] } }, HOY).length, 0);
  });

  test("los contratos que se pisan son un PROBLEMA, no un aviso", () => {
    const a = asuntosPendientes({ ...base, contrato: { vigente: null, solapados: [{}] } }, HOY);
    assert.equal(a[0].nivel, "problema");
    assert.match(a[0].texto, /no se puede saber cuántas horas/);
  });

  test("y lo grave sale antes que lo informativo", () => {
    const a = asuntosPendientes({ ...base, contrato: { vigente: null, solapados: [{}] },
      estado: { clave: "baja_futura", enPlantilla: true, detalle: "Su último día será el 31." },
      ausencias: { pendientes: [{}] } }, HOY);
    assert.deepEqual(a.map((x) => x.nivel), ["problema", "atencion", "atencion", "info"]);
  });

  test("sin contrato, sin áreas y con jornadas sin validar: tres cosas que hacer", () => {
    const a = asuntosPendientes({ ...base, contrato: { vigente: null, solapados: [] },
      areas: { configurado: false }, horas: { sinValidar: 2 } }, HOY);
    assert.equal(a.length, 3);
    assert.ok(a.every((x) => x.nivel === "atencion"));
    assert.deepEqual(a.map((x) => x.accion), ["contrato", "areas", "revision"]);
  });

  test("irse debiéndosele horas es un problema, y sigue siéndolo después", () => {
    const a = asuntosPendientes({ ...base, estado: { clave: "baja", enPlantilla: false }, bolsa: { saldo: 260 } }, HOY);
    assert.ok(a.some((x) => x.nivel === "problema" && /se le siguen debiendo/.test(x.texto)));
  });

  test("a quien ya no está no se le pide contrato ni áreas", () => {
    const a = asuntosPendientes({ ...base, estado: { clave: "baja", enPlantilla: false },
      contrato: { vigente: null, solapados: [] }, areas: { configurado: false }, bolsa: { saldo: 0 } }, HOY);
    assert.deepEqual(a, [], "no hay nada que arreglarle a alguien que se fue");
  });

  test("cada aviso lleva a dónde se arregla", () => {
    const a = asuntosPendientes({ ...base, areas: { configurado: false } }, HOY);
    assert.equal(a[0].accion, "areas");
  });
});
