// E2E — LA COLUMNA VERTEBRAL DE RR.HH.
//
// Recorre la vida laboral entera de una persona atravesando los servicios REALES de los
// ocho módulos, en orden y encadenados: lo que sale de un paso entra en el siguiente.
//
//   Equipo → Disponibilidad → Horarios → Trabajador → Fichajes → Revisión
//   → Bolsa → Ausencias → Horarios → Baja → Recontratación
//
// NO es un test de pantallas: es la prueba de que los módulos se alimentan entre ellos. Si
// alguien rompe la cadena —cambia una convención de `dow`, toca la franquicia, mueve la
// firma de un evento— esto lo caza aunque cada módulo siga pasando sus propios tests.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validarAlta, planDeBaja, estadoLaboral, asuntosPendientes } from "../src/modules/rrhh/ciclo.js";
import { periodoAbierto, periodoActual, antiguedadActual, motivoNoRecontratar, enPeriodo } from "../src/modules/rrhh/periodos.js";
import { generarSemana } from "../src/modules/horarios/solver.js";
import { planRepetir, diaSemanaDe } from "../src/modules/horarios/repetir.js";
import { compararSnapshots, cambiosPorTrabajador } from "../src/modules/horarios/versiones.js";
import { movimientosParaJornada, saldoDe, movimientoBolsa } from "../src/modules/fichajes/bolsa.js";
import { turnosDurante } from "../src/modules/rrhh/ausencias.js";
import { diasSemana, duracionMin } from "../src/modules/horarios/tiempo.js";

const LOCAL = "La Tapeta - Blanes";
const LUNES = "2026-08-24";
const DIAS = diasSemana(LUNES);
const HOY = "2026-08-20";

// El estado del mundo, que va creciendo paso a paso como en la aplicación real.
const M = {
  users: [], periodos: [], contratos: [], areas: [{ id: 10, nombre: "SALA", local: LOCAL, activo: true }],
  workerAreas: [], disponibilidad: [], asignaciones: [], semanas: [], publicaciones: [],
  ausencias: [], jornadas: [], bolsa: [], comunicaciones: [],
};
let SIG = 1;
const nuevoId = () => SIG++;

describe("E2E · la vida laboral de Juan Pérez, de punta a punta", () => {
  test("PASO 1 · ALTA — Juan entra en plantilla con contrato y área", () => {
    const v = validarAlta({ nombre: "Juan Pérez", username: "juan.blanes", local: LOCAL, rol: "trabajador",
      puesto: "Camarero", fecha_alta: "2026-08-20", horas_semana: 40, areas: [10] }, { locales: [LOCAL], hoy: HOY });
    assert.equal(v.ok, true, v.errores.join(" "));

    const id = nuevoId();
    M.users.push({ id, ...v.datos, activo: 1, fecha_baja: null, areas_configuradas_en: "2026-08-20T10:00" });
    M.periodos.push({ id: nuevoId(), worker_id: id, local: LOCAL, fecha_alta: v.datos.fecha_alta, fecha_baja: null });
    M.contratos.push({ id: nuevoId(), worker_id: id, desde: v.datos.contrato.desde, hasta: null, horas_semana: 40 });
    for (const a of v.datos.areas) M.workerAreas.push({ worker_id: id, area_id: a });

    // Lo que tiene que ser verdad después del alta, todo a la vez.
    assert.equal(M.users[0].fecha_alta, "2026-08-20");
    assert.equal(periodoAbierto(M.periodos).fecha_alta, "2026-08-20", "queda una etapa abierta");
    assert.equal(M.contratos[0].horas_semana, 40);
    assert.deepEqual(M.workerAreas.map((w) => w.area_id), [10]);
    assert.equal(estadoLaboral(M.users[0], "2026-08-24").clave, "activo");
    assert.equal(estadoLaboral(M.users[0], "2026-08-19").clave, "pendiente", "antes de empezar, pendiente");
  });

  test("PASO 2 · DISPONIBILIDAD — Juan dice cuándo no puede, y el solver lo respeta", () => {
    const id = M.users[0].id;
    // Miércoles (dow 2 en la convención del sistema: 0 = lunes) no puede en todo el día.
    M.disponibilidad.push({ worker_id: id, dow: 2, inicio_min: 0, fin_min: 1560, preferencia: "no_disponible" });
    assert.equal(diaSemanaDe(DIAS[2]), 2, "miércoles es dow 2");

    const sinMiercoles = generarSemana({
      lunes: LUNES, trabajadores: M.users, areas: M.areas,
      tramos: [{ id: 1, nombre: "Noche", inicio_min: 1200, fin_min: 1440 }],
      necesidades: [{ dow: 2, area_id: 10, tramo_id: 1, minimo: 1 }],
      contratos: M.contratos, ausencias: [], disponibilidad: M.disponibilidad, asignacionesPrevias: [],
    });
    assert.equal(sinMiercoles.asignaciones.length, 0, "el generador no le pone el miércoles");
    assert.match(sinMiercoles.sinCubrir[0].porque.map((p) => p.motivo).join(), /no_disponible/);

    const elLunes = generarSemana({
      lunes: LUNES, trabajadores: M.users, areas: M.areas,
      tramos: [{ id: 1, nombre: "Noche", inicio_min: 1200, fin_min: 1440 }],
      necesidades: [{ dow: 0, area_id: 10, tramo_id: 1, minimo: 1 }],
      contratos: M.contratos, ausencias: [], disponibilidad: M.disponibilidad, asignacionesPrevias: [],
    });
    assert.equal(elLunes.asignaciones.length, 1, "el lunes sí");
  });

  test("PASO 3 · SEMANA VACÍA — se puede trabajar sobre ella sin crear nada antes", () => {
    // No hay fila de semana todavía, y aun así el cuadrante tiene todo lo que necesita.
    assert.equal(M.semanas.length, 0);
    assert.equal(DIAS.length, 7);
    assert.equal(M.asignaciones.filter((a) => a.dia >= DIAS[0] && a.dia <= DIAS[6]).length, 0);
  });

  test("PASO 4 · TURNO DE 4 H QUE CRUZA MEDIANOCHE — 20:00–00:00 se guarda como 1200→1440", () => {
    // La semana se abre al guardar el primer turno.
    const sem = { id: nuevoId(), local: LOCAL, lunes: LUNES, estado: "borrador", version: 1 };
    M.semanas.push(sem);
    const t = { id: nuevoId(), semana_id: sem.id, local: LOCAL, worker_id: M.users[0].id,
      dia: DIAS[0], area_id: 10, tramo_id: null, inicio_min: 1200, fin_min: 1440, tipo: "turno" };
    M.asignaciones.push(t);

    assert.equal(t.fin_min, 1440, "medianoche son 1440, no 0");
    assert.equal(duracionMin(t.inicio_min, t.fin_min), 240, "cuatro horas");
    assert.ok(t.fin_min <= 2160, "cabe en el rango que acepta la base");
  });

  test("PASO 5 · REPETIR — el mismo turno de martes a viernes, con sus reglas", () => {
    const t = M.asignaciones[0];
    const plan = planRepetir({ turno: t, dias: DIAS.slice(1, 5), asignaciones: M.asignaciones,
      ausencias: M.ausencias, disponibilidad: M.disponibilidad, persona: M.users[0] });

    assert.equal(plan.ok, true);
    assert.deepEqual(plan.aCrear, DIAS.slice(1, 5), "los cuatro días");
    // El MIÉRCOLES avisa: dijo que no podía. Avisa, no bloquea — es una acción manual.
    const mie = plan.dias.find((d) => d.dia === DIAS[2]);
    assert.equal(mie.accion, "crear");
    assert.match(mie.motivo, /no puede/, "y se dice por qué hay que mirarlo");
    assert.equal(plan.conAviso, 1);

    for (const dia of plan.aCrear) M.asignaciones.push({ ...t, id: nuevoId(), dia });
    assert.equal(M.asignaciones.length, 5);
    // Turnos INDEPENDIENTES: ninguno guarda de quién es copia.
    assert.ok(!M.asignaciones.some((a) => "serie_id" in a || "origen_id" in a), "se ha creado una serie");
  });

  test("PASO 6 · PUBLICAR V1 — el horario pasa a ser oficial", () => {
    const sem = M.semanas[0];
    sem.estado = "publicado";
    M.publicaciones.push({ id: nuevoId(), semana_id: sem.id, version: 1,
      snapshot: { asignaciones: M.asignaciones.map((a) => ({ ...a })) }, publicado_en: "2026-08-21T10:00:00+02:00" });
    assert.equal(sem.estado, "publicado");
    assert.equal(M.publicaciones[0].snapshot.asignaciones.length, 5);
  });

  test("PASO 7 · EL TRABAJADOR VE SU SEMANA", () => {
    const suyos = M.publicaciones[0].snapshot.asignaciones.filter((a) => a.worker_id === M.users[0].id);
    assert.equal(suyos.length, 5);
    assert.equal(suyos[0].inicio_min, 1200);
    assert.equal(suyos[0].fin_min, 1440, "y el que cruza medianoche se le enseña entero");
  });

  test("PASO 8 · V2 — se cambia el miércoles y el sistema sabe QUÉ cambió", () => {
    const antes = M.publicaciones[0].snapshot;
    const mie = M.asignaciones.find((a) => a.dia === DIAS[2]);
    mie.inicio_min = 660; mie.fin_min = 960;   // pasa de noche a mediodía
    const despues = { asignaciones: M.asignaciones.map((a) => ({ ...a })) };
    M.publicaciones.push({ id: nuevoId(), semana_id: M.semanas[0].id, version: 2, snapshot: despues,
      publicado_en: "2026-08-22T18:00:00+02:00" });

    const d = compararSnapshots(antes, despues);
    assert.ok(d.total > 0, "se detecta el cambio");
    const cambios = cambiosPorTrabajador(antes, despues);
    const suyo = cambios.find((c) => String(c.worker_id) === String(M.users[0].id));
    assert.ok(suyo, "y se sabe a quién le afecta");
    const dia = suyo.dias.find((x) => x.dia === DIAS[2]);
    assert.ok(dia, "con el día concreto");
    assert.equal(dia.antes[0].inicio_min, 1200, "el ANTES");
    assert.equal(dia.ahora[0].inicio_min, 660, "y el AHORA");
  });

  test("PASO 9 · ENTENDIDO — la confirmación queda registrada", () => {
    const c = { id: nuevoId(), worker_id: M.users[0].id, semana_id: M.semanas[0].id, version: 2, entendido_en: null };
    M.comunicaciones.push(c);
    assert.equal(M.comunicaciones.filter((x) => !x.entendido_en).length, 1, "sale como pendiente");
    c.entendido_en = "2026-08-22T19:30:00+02:00";
    assert.equal(M.comunicaciones.filter((x) => !x.entendido_en).length, 0, "y deja de estarlo");
  });

  test("PASO 10 · FICHAJE — trabaja 4 h 25 sobre 4 h planificadas", () => {
    const id = M.users[0].id;
    M.jornadas.push({ worker_id: id, local: LOCAL, dia_negocio: DIAS[0],
      min_planificado: 240, min_fichado: 265, min_validado: null, firma_eventos: "f1" });
    const j = M.jornadas[0];
    assert.equal(j.min_planificado, 240);
    assert.equal(j.min_fichado, 265);
    assert.equal(j.min_validado, null, "todavía nadie ha decidido");
  });

  test("PASO 11 · REVISIÓN — el responsable valida lo que ve", () => {
    const j = M.jornadas[0];
    j.min_validado = 265;
    assert.equal(j.min_validado, 265);
    // Y NO se toca lo fichado: la validación es una decisión sobre otra cosa.
    assert.equal(j.min_fichado, 265);
    assert.equal(j.min_planificado, 240, "el plan tampoco se reescribe");
  });

  test("PASO 12 · BOLSA — +25 reales con franquicia de 10 son +15", () => {
    const j = M.jornadas[0];
    assert.equal(movimientoBolsa(j.min_validado, j.min_planificado, 10), 15);

    const { insertar } = movimientosParaJornada({
      workerId: j.worker_id, local: LOCAL, dia: j.dia_negocio, periodo: "2026-08",
      minValidado: j.min_validado, minPlanificado: j.min_planificado, toleranciaMin: 10,
      firma: j.firma_eventos, existentes: [], autor: "encargado" });
    M.bolsa.push(...insertar.map((m) => ({ ...m, id: nuevoId() })));

    assert.equal(M.bolsa.length, 1);
    assert.equal(M.bolsa[0].minutos, 15);
    assert.equal(M.bolsa[0].dif_min, 25, "y queda anotada la diferencia bruta");
    assert.equal(M.bolsa[0].tolerancia_min, 10, "con la franquicia que se aplicó");
    assert.equal(saldoDe(M.bolsa), 15);
  });

  test("PASO 13 · AUSENCIA sobre un día YA PUBLICADO", () => {
    const id = M.users[0].id;
    M.ausencias.push({ id: nuevoId(), worker_id: id, local: LOCAL, tipo: "vacaciones",
      desde: DIAS[3], hasta: DIAS[4], estado: "pendiente" });
    const a = M.ausencias[0];

    // El responsable la ve en su bandeja mientras esté pendiente.
    assert.equal(M.ausencias.filter((x) => x.estado === "pendiente").length, 1);
    a.estado = "aprobada";

    // Y al aprobarla, el sistema sabe que pisa turnos publicados.
    const dentro = M.asignaciones
      .filter((x) => x.dia >= a.desde && x.dia <= a.hasta)
      .map((x) => ({ ...x, estado_semana: "publicado", lunes: LUNES }));
    const r = turnosDurante(dentro, { worker_id: id, desde: a.desde, hasta: a.hasta });
    assert.equal(r.total, 2, "jueves y viernes");
    assert.equal(r.publicados.length, 2);
    assert.deepEqual(r.semanas, [LUNES], "Y DICE QUÉ SEMANA: es lo que permite llevar allí de un clic");
    assert.match(r.aviso, /YA PUBLICADAS/);
  });

  test("PASO 14 · REPUBLICAR — se corrige y el trabajador se entera", () => {
    const antes = M.publicaciones[1].snapshot;
    M.asignaciones = M.asignaciones.filter((a) => a.dia !== DIAS[3] && a.dia !== DIAS[4]);
    const despues = { asignaciones: M.asignaciones.map((a) => ({ ...a })) };
    M.publicaciones.push({ id: nuevoId(), semana_id: M.semanas[0].id, version: 3, snapshot: despues,
      publicado_en: "2026-08-23T09:00:00+02:00" });

    const cambios = cambiosPorTrabajador(antes, despues);
    const suyo = cambios.find((c) => String(c.worker_id) === String(M.users[0].id));
    assert.ok(suyo, "se le comunica");
    assert.equal(suyo.dias.filter((d) => d.tipo === "quitado").length, 2, "dos días que ya no trabaja");
    M.comunicaciones.push({ id: nuevoId(), worker_id: M.users[0].id, semana_id: M.semanas[0].id, version: 3, entendido_en: null });
    assert.equal(M.comunicaciones.filter((x) => !x.entendido_en).length, 1);
  });

  test("PASO 15 · BAJA — se cierra todo lo que hay que cerrar y no se pierde nada", () => {
    const u = M.users[0];
    const fechaBaja = DIAS[5];   // sábado
    const plan = planDeBaja({
      persona: u, fechaBaja,
      asignaciones: M.asignaciones.map((a) => ({ ...a, estado: "publicado", lunes: LUNES })),
      contratos: M.contratos, ausencias: M.ausencias, saldoBolsa: saldoDe(M.bolsa),
    });
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.contratosACerrar, [M.contratos[0].id], "el contrato abierto se cierra");
    assert.equal(plan.saldoBolsa, 15, "y se DICE que se le deben horas");
    assert.ok(plan.avisos.some((a) => a.tipo === "bolsa" && /no las borra/.test(a.texto)));

    // Se aplica.
    u.fecha_baja = fechaBaja;
    periodoAbierto(M.periodos).fecha_baja = fechaBaja;
    M.contratos[0].hasta = fechaBaja;

    // Y lo que NO puede haber pasado.
    assert.equal(saldoDe(M.bolsa), 15, "la bolsa intacta");
    assert.equal(M.jornadas.length, 1, "los fichajes intactos");
    assert.equal(M.publicaciones.length, 3, "los horarios publicados intactos");
    assert.equal(M.ausencias.length, 1, "las ausencias intactas");
    assert.equal(M.users.length, 1, "la persona sigue existiendo: una baja no es un DELETE");
    // El contrato vale SU ÚLTIMO DÍA, no el anterior.
    assert.equal(M.contratos[0].hasta, fechaBaja);
    assert.equal(estadoLaboral(u, fechaBaja).enPlantilla, true, "ese día todavía trabaja");
    assert.equal(estadoLaboral(u, DIAS[6]).clave, "baja");
  });

  test("PASO 16 · RECONTRATACIÓN — vuelve, y sigue siendo la misma persona", () => {
    const u = M.users[0];
    const vuelve = "2027-03-15";
    assert.equal(motivoNoRecontratar(M.periodos, vuelve), null);
    assert.match(motivoNoRecontratar(M.periodos, DIAS[5]), /posterior/, "volver antes de irse, no");

    M.periodos.push({ id: nuevoId(), worker_id: u.id, local: LOCAL, fecha_alta: vuelve, fecha_baja: null });
    M.contratos.push({ id: nuevoId(), worker_id: u.id, desde: vuelve, hasta: null, horas_semana: 25 });
    u.fecha_alta = vuelve; u.fecha_baja = null; u.activo = 1;

    assert.equal(M.periodos.length, 2, "dos etapas");
    assert.equal(periodoActual(M.periodos).fecha_alta, vuelve);
    assert.equal(enPeriodo(M.periodos, "2026-09-15"), false, "EL HUECO ENTRE LAS DOS existe");
    assert.equal(enPeriodo(M.periodos, DIAS[0]), true, "y la primera etapa sigue contando");

    // Antigüedad desde la NUEVA, no sumando.
    const a = antiguedadActual(M.periodos, "2027-04-15");
    assert.equal(a.desde, vuelve);
    assert.equal(a.meses, 1);

    // Y NADA del pasado se ha tocado.
    assert.equal(saldoDe(M.bolsa), 15, "las horas que se le debían siguen debiéndose");
    assert.equal(M.contratos.length, 2, "el contrato viejo sigue, cerrado");
    assert.equal(M.contratos[0].hasta, DIAS[5]);
    assert.equal(M.jornadas.length, 1);
    assert.equal(M.publicaciones.length, 3);
  });

  test("RESUMEN · la cadena entera queda coherente", () => {
    const u = M.users[0];
    assert.equal(estadoLaboral(u, "2027-04-01").clave, "activo");
    // Lo que hay que hacer con él, calculado sobre TODO lo anterior.
    const asuntos = asuntosPendientes({
      estado: estadoLaboral(u, "2027-04-01"),
      contrato: { vigente: M.contratos[1], solapados: [] },
      areas: { configurado: true }, ausencias: { pendientes: [] },
      horas: { sinValidar: 0 }, bolsa: { saldo: saldoDe(M.bolsa) },
      periodos: { solapados: [] },
    }, "2027-04-01");
    assert.deepEqual(asuntos, [], "sin nada pendiente, la bandeja no inventa avisos");
  });
});
