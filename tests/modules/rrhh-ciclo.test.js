// FASE 6 — el ciclo de vida laboral en lo puro: estado, alta y baja.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  estadoLaboral, filtrarPorEstado, validarAlta, planDeBaja, firmaPlan,
  ausenciasAnteLaBaja, resumenDisponibilidad, ausenciasDeLaFicha, esPlantilla, ROLES_PLANTILLA,
} from "../../src/modules/rrhh/ciclo.js";
import { activoAhora, activoEnFecha } from "../../src/modules/rrhh/vigencia.js";

const HOY = "2026-08-18";

describe("el estado laboral se DERIVA, no se guarda", () => {
  test("activo: entró y no se ha ido", () => {
    assert.equal(estadoLaboral({ fecha_alta: "2024-03-14" }, HOY).clave, "activo");
  });

  test("BAJA PROGRAMADA no es baja: hasta ese día sigue viniendo a trabajar", () => {
    // Es el fallo que tenía la pantalla: calculaba el estado con `fecha_baja != null`, así
    // que a quien se le ponía la baja para dentro de un mes salía ya como «Baja» aunque
    // siguiera entrando todos los días.
    const e = estadoLaboral({ fecha_alta: "2024-03-14", fecha_baja: "2026-08-31" }, HOY);
    assert.equal(e.clave, "baja_futura");
    assert.equal(e.enPlantilla, true);
    assert.match(e.detalle, /31/);
  });

  test("el ÚLTIMO DÍA todavía es plantilla", () => {
    // `fecha_baja` es el último día trabajado, inclusive. El 31 trabaja; el 1 ya no.
    assert.equal(estadoLaboral({ fecha_baja: "2026-08-18" }, "2026-08-18").clave, "baja_futura");
    assert.equal(estadoLaboral({ fecha_baja: "2026-08-18" }, "2026-08-19").clave, "baja");
  });

  test("y coincide con lo que dice la vigencia, que es quien manda en el cuadrante", () => {
    const p = { fecha_alta: "2024-01-01", fecha_baja: "2026-08-18", activo: 1 };
    assert.equal(activoAhora(p, "2026-08-18"), true);
    assert.equal(estadoLaboral(p, "2026-08-18").enPlantilla, true);
    assert.equal(activoAhora(p, "2026-08-19"), false);
    assert.equal(estadoLaboral(p, "2026-08-19").enPlantilla, false);
  });

  test("pendiente de incorporación: el alta es futura", () => {
    const e = estadoLaboral({ fecha_alta: "2026-09-01" }, HOY);
    assert.equal(e.clave, "pendiente");
    assert.equal(e.enPlantilla, true, "ya es de la casa: hay que poder darle su usuario antes");
  });

  test("cuenta apagada sin fecha: se dice APARTE de una baja", () => {
    // No es lo mismo «se fue el 31» que «alguien le apagó la cuenta»: en el segundo caso no
    // hay último día trabajado y quien lo mire tiene que poder distinguirlo.
    const e = estadoLaboral({ activo: 0, fecha_alta: "2024-01-01" }, HOY);
    assert.equal(e.clave, "desactivado");
    assert.notEqual(e.etiqueta, "Baja");
    assert.equal(e.enPlantilla, false);
  });

  test("apagada Y con fecha de baja: manda la fecha, que es la que sitúa el corte", () => {
    assert.equal(estadoLaboral({ activo: 0, fecha_baja: "2026-08-31" }, HOY).clave, "baja_futura");
  });

  test("no hay ningún campo `estado` que mantener al día", () => {
    // Una columna así habría que actualizarla el día que llega la baja, y ese día no pasa
    // nada: nadie ejecuta nada a medianoche. Derivarlo hace que cambie solo cuando toca.
    const p = { fecha_alta: "2024-01-01", fecha_baja: "2026-08-31" };
    assert.equal(estadoLaboral(p, "2026-08-31").clave, "baja_futura");
    assert.equal(estadoLaboral(p, "2026-09-01").clave, "baja");
    assert.equal(p.estado, undefined, "la persona no ha ganado ninguna propiedad");
  });
});

describe("el listado no mezcla a los de ahora con los de antes", () => {
  const gente = [
    { id: 1, nombre: "Ana", fecha_alta: "2024-01-01" },
    { id: 2, nombre: "Beto", fecha_alta: "2024-01-01", fecha_baja: "2026-08-31" },
    { id: 3, nombre: "Cleo", fecha_alta: "2024-01-01", fecha_baja: "2025-06-30" },
    { id: 4, nombre: "Dani", fecha_alta: "2026-09-01" },
    { id: 5, nombre: "Eva", activo: 0 },
  ];
  test("por defecto, quien trabaja hoy — incluida la baja programada", () => {
    assert.deepEqual(filtrarPorEstado(gente, "activos", HOY).map((w) => w.nombre), ["Ana", "Beto", "Dani"]);
  });
  test("las bajas se piden a propósito", () => {
    assert.deepEqual(filtrarPorEstado(gente, "bajas", HOY).map((w) => w.nombre), ["Cleo", "Eva"]);
  });
  test("y todos son todos", () => {
    assert.equal(filtrarPorEstado(gente, "todos", HOY).length, 5);
  });
  test("los dos filtros juntos son la plantilla entera: nadie se pierde", () => {
    const a = filtrarPorEstado(gente, "activos", HOY).length;
    const b = filtrarPorEstado(gente, "bajas", HOY).length;
    assert.equal(a + b, gente.length);
  });
});

describe("qué es plantilla operativa", () => {
  test("trabajador y encargado sí; contabilidad y marketing no", () => {
    assert.deepEqual(ROLES_PLANTILLA, ["trabajador", "encargado"]);
    assert.equal(esPlantilla({ rol: "trabajador" }), true);
    assert.equal(esPlantilla({ rol: "encargado" }), true);
    for (const r of ["contabilidad", "marketing", "direccion", "rrhh"]) {
      assert.equal(esPlantilla({ rol: r }), false, `${r} no tiene cuadrante ni bolsa`);
    }
  });
});

describe("el alta pide lo mínimo, pero lo mínimo tiene que valer", () => {
  const base = { nombre: "Juan Pérez", username: "juan.blanes", local: "Blanes", fecha_alta: "2026-08-18" };

  test("con lo básico ya vale", () => {
    const r = validarAlta(base);
    assert.equal(r.ok, true);
    assert.equal(r.datos.rol, "trabajador", "el rol por defecto");
  });

  test("NO se piden DNI, teléfono, email ni fecha de nacimiento", () => {
    // Pedirlos en el alta es lo que hace que la gente se dé de alta a medias: la persona
    // empieza el lunes, se rellena lo justo, y el resto no se completa nunca.
    const r = validarAlta(base);
    assert.equal(r.ok, true);
    for (const c of ["dni", "telefono", "email", "fecha_nac"]) {
      assert.equal(r.datos[c], undefined, `el alta está pidiendo ${c}`);
    }
  });

  test("sin nombre, sin usuario o sin local no se crea nada", () => {
    assert.equal(validarAlta({ ...base, nombre: "" }).ok, false);
    assert.equal(validarAlta({ ...base, username: "" }).ok, false);
    assert.equal(validarAlta({ ...base, local: "" }).ok, false);
  });

  test("el usuario se normaliza y se acota", () => {
    assert.equal(validarAlta({ ...base, username: "  JUAN.Blanes " }).datos.username, "juan.blanes");
    assert.equal(validarAlta({ ...base, username: "ju" }).ok, false, "demasiado corto");
    assert.equal(validarAlta({ ...base, username: "juan blanes" }).ok, false, "con espacios no");
    assert.equal(validarAlta({ ...base, username: "juan@blanes" }).ok, false);
  });

  test("un local que no existe se rechaza", () => {
    assert.equal(validarAlta(base, { locales: ["Blanes", "Lloret"] }).ok, true);
    assert.equal(validarAlta({ ...base, local: "Cuenca" }, { locales: ["Blanes", "Lloret"] }).ok, false);
  });

  test("un rol inventado cae a trabajador, no revienta ni asciende a nadie", () => {
    assert.equal(validarAlta({ ...base, rol: "direccion" }).datos.rol, "trabajador");
    assert.equal(validarAlta({ ...base, rol: "encargado" }).datos.rol, "encargado");
  });

  test("sin fecha de alta se usa hoy: nadie queda con la antigüedad vacía", () => {
    assert.equal(validarAlta({ ...base, fecha_alta: "" }, { hoy: HOY }).datos.fecha_alta, HOY);
  });

  test("el contrato es OPCIONAL", () => {
    assert.equal(validarAlta(base).datos.contrato, null);
    assert.equal(validarAlta({ ...base, horas_semana: "" }).datos.contrato, null);
  });

  test("pero si se pone, tiene que ser posible", () => {
    assert.equal(validarAlta({ ...base, horas_semana: 40 }).datos.contrato.horas_semana, 40);
    assert.equal(validarAlta({ ...base, horas_semana: 0 }).ok, false);
    assert.equal(validarAlta({ ...base, horas_semana: 200 }).ok, false);
    assert.equal(validarAlta({ ...base, horas_semana: -5 }).ok, false);
  });

  test("y arranca el primer día si no se dice otra cosa", () => {
    assert.equal(validarAlta({ ...base, horas_semana: 40 }).datos.contrato.desde, "2026-08-18");
    assert.equal(validarAlta({ ...base, horas_semana: 40, contrato_desde: "2026-09-01" }).datos.contrato.desde, "2026-09-01");
  });

  test("las áreas se limpian de repetidos y de basura", () => {
    assert.deepEqual(validarAlta({ ...base, areas: [3, 3, "5", "x", null] }).datos.areas, [3, 5]);
  });

  test("SIN lista de áreas es distinto de lista VACÍA", () => {
    // La fase 4 distingue «nunca se tocó» de «se decidió que ninguna». Confundirlos aquí
    // marcaría como configurado a quien no lo está, y el generador dejaría de proponerle.
    assert.equal(validarAlta(base).datos.areas, null);
    assert.deepEqual(validarAlta({ ...base, areas: [] }).datos.areas, []);
  });
});

describe("las ausencias frente a una baja", () => {
  const aus = [
    { id: 1, estado: "aprobada", desde: "2026-07-01", hasta: "2026-07-15" },  // pasada
    { id: 2, estado: "aprobada", desde: "2026-08-25", hasta: "2026-09-05" },  // cruza
    { id: 3, estado: "aprobada", desde: "2026-09-10", hasta: "2026-09-20" },  // posterior
    { id: 4, estado: "pendiente", desde: "2026-09-15", hasta: "2026-09-16" }, // posterior
    { id: 5, estado: "cancelada", desde: "2026-09-01", hasta: "2026-09-02" }, // ya cancelada
  ];
  const r = ausenciasAnteLaBaja(aus, "2026-08-31");

  test("las posteriores se identifican, aprobadas y pendientes", () => {
    assert.deepEqual(r.posteriores.map((a) => a.id), [3, 4]);
  });
  test("LA QUE CRUZA la fecha se separa aparte y NO se toca", () => {
    // Unas vacaciones del 25 al 5 con baja el 31 son días ya disfrutados y días que no se
    // disfrutarán. Recortarlas cambiaría el saldo de vacaciones de alguien que ya se fue.
    assert.deepEqual(r.cruzan.map((a) => a.id), [2]);
  });
  test("las pasadas son histórico y ni se miran", () => {
    assert.deepEqual(r.pasadas.map((a) => a.id), [1]);
  });
  test("una ya cancelada no entra en ningún grupo", () => {
    const todas = [...r.posteriores, ...r.cruzan, ...r.pasadas].map((a) => a.id);
    assert.ok(!todas.includes(5));
  });
  test("y ninguna ausencia se pierde por el camino", () => {
    assert.equal(r.posteriores.length + r.cruzan.length + r.pasadas.length, 4);
  });
});

describe("EL PLAN DE LA BAJA se enseña entero antes de tocar nada", () => {
  const persona = { id: 7, nombre: "Juan", fecha_alta: "2024-03-14" };
  const asignaciones = [
    { id: 101, worker_id: 7, dia: "2026-08-30", estado: "publicado", lunes: "2026-08-24" }, // antes: no
    { id: 102, worker_id: 7, dia: "2026-09-02", estado: "borrador", lunes: "2026-08-31" },
    { id: 103, worker_id: 7, dia: "2026-09-03", estado: "borrador", lunes: "2026-08-31" },
    { id: 104, worker_id: 7, dia: "2026-09-04", estado: "publicado", lunes: "2026-08-31" },
    { id: 105, worker_id: 8, dia: "2026-09-05", estado: "borrador", lunes: "2026-08-31" }, // de otro
  ];
  const contratos = [
    { id: 20, worker_id: 7, desde: "2024-03-14", hasta: "2025-12-31", horas_semana: 20 },
    { id: 21, worker_id: 7, desde: "2026-01-01", hasta: null, horas_semana: 40 },
  ];
  const ausencias = [{ id: 30, worker_id: 7, estado: "aprobada", desde: "2026-09-10", hasta: "2026-09-20", tipo: "vacaciones" }];
  const plan = planDeBaja({ persona, fechaBaja: "2026-08-31", asignaciones, contratos, ausencias, saldoBolsa: 260 });

  test("los borradores POSTERIORES se retiran; los de antes no", () => {
    assert.deepEqual(plan.retirar, [102, 103]);
  });
  test("LOS PUBLICADOS NO SE TOCAN: se dicen, con su semana", () => {
    // Un turno publicado se mandó al grupo y hay gente organizada con él. Quitarlo por
    // detrás sería cambiar en silencio un horario oficial.
    assert.deepEqual(plan.publicados.map((a) => a.id), [104]);
    assert.deepEqual(plan.semanasAfectadas, ["2026-08-31"]);
    assert.ok(!plan.retirar.includes(104));
  });
  test("los turnos de OTRA persona no entran", () => {
    assert.ok(!plan.retirar.includes(105));
  });
  test("solo se cierra el contrato que seguiría vivo", () => {
    assert.deepEqual(plan.contratosACerrar, [21], "el de 2024-2025 ya está cerrado y está bien");
  });
  test("la ausencia posterior se cancela", () => {
    assert.deepEqual(plan.ausenciasACancelar, [30]);
  });
  test("la bolsa se DICE y no se toca", () => {
    assert.equal(plan.saldoBolsa, 260);
    const b = plan.avisos.find((a) => a.tipo === "bolsa");
    assert.match(b.texto, /no las borra/i);
  });
  test("y todo sale como aviso legible, con los publicados en rojo", () => {
    const tipos = plan.avisos.map((a) => a.tipo);
    for (const t of ["turnos_publicados", "turnos_borrador", "contrato", "ausencias_posteriores", "bolsa"]) {
      assert.ok(tipos.includes(t), `falta el aviso de ${t}`);
    }
    assert.equal(plan.avisos.find((a) => a.tipo === "turnos_publicados").nivel, "atencion");
    assert.equal(plan.avisos.find((a) => a.tipo === "turnos_borrador").nivel, "info");
  });

  test("irse antes de entrar no es una baja: es un error", () => {
    const r = planDeBaja({ persona, fechaBaja: "2020-01-01", asignaciones: [], contratos: [], ausencias: [] });
    assert.equal(r.ok, false);
    assert.match(r.error, /entró/);
  });
  test("sin fecha tampoco", () => {
    assert.equal(planDeBaja({ persona, fechaBaja: "" }).ok, false);
  });

  test("una baja limpia no avisa de nada", () => {
    const r = planDeBaja({ persona, fechaBaja: "2026-08-31", asignaciones: [], contratos: [], ausencias: [], saldoBolsa: 0 });
    assert.deepEqual(r.avisos, []);
    assert.deepEqual(r.retirar, []);
  });

  test("saldo NEGATIVO se dice, pero no se propone cobrárselo", () => {
    const r = planDeBaja({ persona, fechaBaja: "2026-08-31", saldoBolsa: -180 });
    const b = r.avisos.find((a) => a.tipo === "bolsa");
    assert.equal(b.nivel, "info");
    assert.doesNotMatch(b.texto, /cobrar|descontar|reclamar/i);
  });

  test("la ausencia que CRUZA sale como atención y NO en la lista de cancelar", () => {
    const r = planDeBaja({ persona, fechaBaja: "2026-08-31",
      ausencias: [{ id: 40, worker_id: 7, estado: "aprobada", desde: "2026-08-25", hasta: "2026-09-05", tipo: "vacaciones" }] });
    assert.deepEqual(r.ausenciasACancelar, []);
    assert.equal(r.ausenciasQueCruzan.length, 1);
    assert.equal(r.avisos.find((a) => a.tipo === "ausencias_cruzan").nivel, "atencion");
  });
});

describe("la firma impide confirmar algo distinto de lo que se enseñó", () => {
  const persona = { id: 7, fecha_alta: "2024-01-01" };
  const uno = planDeBaja({ persona, fechaBaja: "2026-08-31",
    asignaciones: [{ id: 1, worker_id: 7, dia: "2026-09-02", estado: "borrador", lunes: "2026-08-31" }] });

  test("el mismo plan da la misma firma", () => {
    assert.equal(firmaPlan(uno), firmaPlan(planDeBaja({ persona, fechaBaja: "2026-08-31",
      asignaciones: [{ id: 1, worker_id: 7, dia: "2026-09-02", estado: "borrador", lunes: "2026-08-31" }] })));
  });
  test("si aparece un turno nuevo, la firma cambia", () => {
    const dos = planDeBaja({ persona, fechaBaja: "2026-08-31", asignaciones: [
      { id: 1, worker_id: 7, dia: "2026-09-02", estado: "borrador", lunes: "2026-08-31" },
      { id: 2, worker_id: 7, dia: "2026-09-03", estado: "borrador", lunes: "2026-08-31" }] });
    assert.notEqual(firmaPlan(uno), firmaPlan(dos));
  });
  test("y si cambia el saldo también", () => {
    assert.notEqual(firmaPlan(uno), firmaPlan(planDeBaja({ persona, fechaBaja: "2026-08-31",
      asignaciones: [{ id: 1, worker_id: 7, dia: "2026-09-02", estado: "borrador", lunes: "2026-08-31" }], saldoBolsa: 60 })));
  });
});

describe("la disponibilidad se lee como una frase", () => {
  test("el día entero no dice «de 00:00 a 24:00»", () => {
    const r = resumenDisponibilidad([{ dow: 2, inicio_min: 0, fin_min: 1440, preferencia: "no_disponible" }]);
    assert.equal(r[0].dia, "Martes");
    assert.equal(r[0].texto, "no puede");
  });
  test("un tramo sí lleva su franja", () => {
    const r = resumenDisponibilidad([{ dow: 2, inicio_min: 480, fin_min: 960, preferencia: "no_disponible" }]);
    assert.equal(r[0].texto, "no puede 08:00–16:00");
  });
  test("la semana empieza en lunes y el domingo va al final", () => {
    const filas = [0, 1, 5].map((d) => ({ dow: d, inicio_min: 0, fin_min: 1440, preferencia: "prefiere" }));
    assert.deepEqual(resumenDisponibilidad(filas).map((r) => r.dia), ["Lunes", "Viernes", "Domingo"]);
  });
  test("varios tramos del mismo día salen juntos", () => {
    const r = resumenDisponibilidad([
      { dow: 3, inicio_min: 480, fin_min: 720, preferencia: "no_disponible" },
      { dow: 3, inicio_min: 1200, fin_min: 1380, preferencia: "prefiere" }]);
    assert.equal(r.length, 1);
    assert.equal(r[0].texto, "no puede 08:00–12:00, prefiere no 20:00–23:00");
  });
  test("sin nada declarado, no hay filas que pintar", () => {
    assert.deepEqual(resumenDisponibilidad([]), []);
  });
});

describe("las ausencias que importan al abrir una ficha", () => {
  const aus = [
    { id: 1, estado: "aprobada", desde: "2026-08-15", hasta: "2026-08-20" },
    { id: 2, estado: "aprobada", desde: "2026-09-01", hasta: "2026-09-10" },
    { id: 3, estado: "aprobada", desde: "2026-09-20", hasta: "2026-09-25" },
    { id: 4, estado: "aprobada", desde: "2026-06-01", hasta: "2026-06-10" },
    { id: 5, estado: "pendiente", desde: "2026-10-01", hasta: "2026-10-05" },
  ];
  const r = ausenciasDeLaFicha(aus, HOY);
  test("la de ahora mismo", () => { assert.equal(r.actual.id, 1); });
  test("la próxima es la MÁS CERCANA, no la primera de la lista", () => { assert.equal(r.proxima.id, 2); });
  test("las pendientes salen aparte: son decisiones sin tomar", () => {
    assert.deepEqual(r.pendientes.map((a) => a.id), [5]);
  });
  test("y las últimas, de más reciente a más antigua", () => {
    assert.deepEqual(r.pasadas.map((a) => a.id), [4]);
  });
  test("sin ausencias no revienta", () => {
    const v = ausenciasDeLaFicha([], HOY);
    assert.equal(v.actual, null);
    assert.equal(v.proxima, null);
  });
});
