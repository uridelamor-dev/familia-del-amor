// El circuito humano de una ausencia: pedirla, resolverla y que Horarios la respete.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  puedeTransitar, transitar, bloqueaHorario, sanearSolicitud, solapan, solapesVivos,
  turnosDurante, paraTrabajador, paraResponsable, resumirBandeja,
  TIPOS, TIPOS_SOLICITABLES, ESTADOS,
} from "../../src/modules/rrhh/ausencias.js";

describe("qué se puede pedir y qué no", () => {
  test("un trabajador NO puede autodeclararse una baja médica", () => {
    // Una baja la abre un parte, no un formulario. Dejarlo aquí confundiría un documento
    // oficial con una casilla.
    assert.ok(TIPOS.includes("baja"));
    assert.ok(!TIPOS_SOLICITABLES.includes("baja"));
    assert.match(sanearSolicitud({ tipo: "baja", desde: "2026-09-01", hasta: "2026-09-05" }).error, /tipo/i);
  });
  test("vacaciones, permiso y asuntos propios sí", () => {
    for (const t of ["vacaciones", "permiso", "asuntos_propios"]) {
      assert.equal(sanearSolicitud({ tipo: t, desde: "2026-09-01", hasta: "2026-09-05" }).ok, true, t);
    }
  });
  test("las fechas al revés se rechazan con palabras, no con un código", () => {
    const r = sanearSolicitud({ tipo: "vacaciones", desde: "2026-09-05", hasta: "2026-09-01" });
    assert.match(r.error, /anterior a la de inicio/);
  });
  test("no se piden vacaciones para el mes pasado", () => {
    const r = sanearSolicitud({ tipo: "vacaciones", desde: "2026-01-01", hasta: "2026-01-05" }, { hoy: "2026-08-25" });
    assert.match(r.error, /ya han pasado/);
  });
  test("un dedo torpe no pide cinco años", () => {
    assert.match(sanearSolicitud({ tipo: "vacaciones", desde: "2026-01-01", hasta: "2030-01-01" }).error, /días seguidos/);
  });
  test("el comentario se recorta y el vacío queda en null", () => {
    assert.equal(sanearSolicitud({ tipo: "permiso", desde: "2026-09-01", hasta: "2026-09-01", comentario: "  " }).comentario, null);
    assert.equal(sanearSolicitud({ tipo: "permiso", desde: "2026-09-01", hasta: "2026-09-01", comentario: "x".repeat(500) }).comentario.length, 300);
  });
  test("un día suelto cuenta como un día", () => {
    assert.equal(sanearSolicitud({ tipo: "permiso", desde: "2026-09-14", hasta: "2026-09-14" }).dias, 1);
  });
});

describe("los estados y sus transiciones", () => {
  test("desde pendiente se puede ir a los tres sitios", () => {
    for (const [a, e] of [["aprobar", "aprobada"], ["rechazar", "rechazada"], ["cancelar", "cancelada"]]) {
      assert.equal(transitar("pendiente", a).estado, e);
    }
  });
  test("una aprobada NO se vuelve a aprobar", () => {
    // Es la puerta de la doble aprobación: dos responsables a la vez, o un doble clic.
    const r = transitar("aprobada", "aprobar");
    assert.ok(r.error);
    assert.match(r.error, /ya estaba aprobada/i);
  });
  test("una aprobada tampoco se rechaza por detrás: se cancela", () => {
    assert.equal(puedeTransitar("aprobada", "rechazar"), false);
    assert.equal(puedeTransitar("aprobada", "cancelar"), true);
  });
  test("una rechazada y una cancelada son terminales", () => {
    for (const e of ["rechazada", "cancelada"]) {
      for (const a of ["aprobar", "rechazar", "cancelar"]) assert.equal(puedeTransitar(e, a), false, `${e}/${a}`);
    }
  });
  test("los cuatro estados están declarados", () => {
    assert.deepEqual(ESTADOS, ["pendiente", "aprobada", "rechazada", "cancelada"]);
  });
});

describe("qué bloquea el horario", () => {
  test("SOLO una aprobada", () => {
    assert.equal(bloqueaHorario({ estado: "aprobada" }), true);
    for (const e of ["pendiente", "rechazada", "cancelada"]) {
      assert.equal(bloqueaHorario({ estado: e }), false, e);
    }
  });
  test("sin estado se trata como aprobada: son las filas de antes de este circuito", () => {
    assert.equal(bloqueaHorario({}), true);
  });
});

describe("ausencias que se pisan", () => {
  const A = { id: 1, desde: "2026-08-24", hasta: "2026-08-27", estado: "aprobada" };
  test("los rangos son inclusivos por los dos lados", () => {
    assert.equal(solapan(A, { desde: "2026-08-27", hasta: "2026-08-30" }), true);
    assert.equal(solapan(A, { desde: "2026-08-28", hasta: "2026-08-30" }), false);
  });
  test("una rechazada o cancelada no ocupa sitio", () => {
    const suyas = [A, { id: 2, desde: "2026-08-25", hasta: "2026-08-26", estado: "rechazada" },
      { id: 3, desde: "2026-08-25", hasta: "2026-08-26", estado: "cancelada" }];
    const s = solapesVivos({ id: 9, desde: "2026-08-25", hasta: "2026-08-26" }, suyas);
    assert.deepEqual(s.map((x) => x.id), [1]);
  });
  test("una pendiente sí: si no, se pedirían las mismas fechas dos veces", () => {
    const s = solapesVivos({ id: 9, desde: "2026-08-25", hasta: "2026-08-26" },
      [{ id: 5, desde: "2026-08-24", hasta: "2026-08-27", estado: "pendiente" }]);
    assert.equal(s.length, 1);
  });
  test("y no se pisa a sí misma", () => {
    assert.equal(solapesVivos(A, [A]).length, 0);
  });
});

describe("turnos que quedan dentro de la ausencia", () => {
  const ASIG = [
    { id: 1, worker_id: 7, dia: "2026-08-25", tipo: "turno", estado_semana: "publicado", lunes: "2026-08-24" },
    { id: 2, worker_id: 7, dia: "2026-08-26", tipo: "turno", estado_semana: "borrador", lunes: "2026-08-24" },
    { id: 3, worker_id: 7, dia: "2026-08-30", tipo: "turno", estado_semana: "borrador", lunes: "2026-08-31" },
    { id: 4, worker_id: 9, dia: "2026-08-25", tipo: "turno", estado_semana: "publicado", lunes: "2026-08-24" },
  ];
  const AUS = { worker_id: 7, desde: "2026-08-24", hasta: "2026-08-27" };

  test("solo los suyos y solo los de dentro del rango", () => {
    const r = turnosDurante(ASIG, AUS);
    assert.equal(r.total, 2);
    assert.deepEqual(r.publicados.map((a) => a.id), [1]);
    assert.deepEqual(r.borrador.map((a) => a.id), [2]);
  });
  test("el aviso distingue lo publicado, que NO se toca", () => {
    // Un turno publicado se mandó al grupo y hay gente organizada con él.
    assert.match(turnosDurante(ASIG, AUS).aviso, /YA PUBLICADAS/);
    assert.match(turnosDurante(ASIG, AUS).aviso, /versión nueva/);
  });
  test("si todo está en borrador, el aviso lo dice y es más suave", () => {
    const soloBorrador = ASIG.filter((a) => a.estado_semana !== "publicado");
    assert.match(turnosDurante(soloBorrador, AUS).aviso, /todos en borrador/);
  });
  test("sin turnos dentro no hay aviso", () => {
    assert.equal(turnosDurante(ASIG, { worker_id: 7, desde: "2026-12-01", hasta: "2026-12-05" }).aviso, null);
  });
  test("una libranza o unas vacaciones ya puestas en el cuadrante no cuentan como turno", () => {
    const r = turnosDurante([{ id: 8, worker_id: 7, dia: "2026-08-25", tipo: "libranza" }], AUS);
    assert.equal(r.total, 0);
  });
});

describe("quién ve qué", () => {
  const BAJA = {
    id: 1, worker_id: 7, nombre: "Juan", tipo: "baja", desde: "2026-08-18", hasta: "2026-08-22",
    estado: "aprobada", origen: "adjudicada", motivo: "Lumbalgia, parte del 18/08", respuesta: null,
  };
  test("el ENCARGADO ve las fechas pero no la nota interna de una baja", () => {
    // Necesita saber que Juan no está del 18 al 22. Para cuadrar la semana, el porqué no aporta
    // nada, y es dato de salud.
    const v = paraResponsable(BAJA);
    assert.equal(v.desde, "2026-08-18");
    assert.equal(v.etiquetaTipo, "Baja médica");
    assert.equal(v.motivo, null);
    assert.equal(v.motivoOculto, true, "y se dice que hay algo oculto, no se finge que no existe");
  });
  test("RR.HH. y dirección sí", () => {
    assert.equal(paraResponsable(BAJA, { verSensible: true }).motivo, "Lumbalgia, parte del 18/08");
  });
  test("en un permiso o unas vacaciones la nota se ve: no es dato de salud", () => {
    const v = paraResponsable({ ...BAJA, tipo: "permiso", motivo: "Boda de su hermana" });
    assert.equal(v.motivo, "Boda de su hermana");
    assert.equal(v.motivoOculto, false);
  });
  test("el TRABAJADOR nunca ve la nota interna, ni de lo suyo", () => {
    const v = paraTrabajador(BAJA);
    assert.equal(v.motivo, undefined);
    assert.ok(!("motivo" in v));
  });
  test("pero sí ve lo que le contestaron al resolverla", () => {
    const v = paraTrabajador({ ...BAJA, estado: "rechazada", respuesta: "Ya hay demasiadas esos días" });
    assert.equal(v.respuesta, "Ya hay demasiadas esos días");
  });
  test("y no ve quién la resolvió por dentro", () => {
    const v = paraTrabajador({ ...BAJA, resuelto_por: "encargado.blanes" });
    assert.ok(!("resueltoPor" in v), "el nombre de quien decidió es información interna");
  });
});

describe("cancelar", () => {
  test("puede cancelar lo que él pidió y sigue pendiente", () => {
    assert.equal(paraTrabajador({ estado: "pendiente", origen: "solicitada" }).puedeCancelar, true);
  });
  test("una ya aprobada NO la deshace él solo: el cuadrante ya cuenta con ella", () => {
    assert.equal(paraTrabajador({ estado: "aprobada", origen: "solicitada" }).puedeCancelar, false);
  });
  test("ni una que le metió administración", () => {
    assert.equal(paraTrabajador({ estado: "pendiente", origen: "adjudicada" }).puedeCancelar, false);
  });
});

describe("el resumen de la bandeja", () => {
  test("cuenta cada estado en su sitio", () => {
    const r = resumirBandeja([
      { estado: "pendiente" }, { estado: "pendiente" }, { estado: "aprobada" },
      { estado: "rechazada" }, { estado: "cancelada" },
    ]);
    assert.deepEqual(r, { pendientes: 2, aprobadas: 1, rechazadas: 1, canceladas: 1, total: 5 });
  });
});
