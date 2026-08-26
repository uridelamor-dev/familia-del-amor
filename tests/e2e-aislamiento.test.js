// E2E — AISLAMIENTO. Blanes no toca Lloret, y un trabajador no toca a nadie.
//
// Se comprueba sobre las GUARDAS REALES del servidor, no sobre lo que esconde la pantalla:
// un botón oculto no es seguridad, es cortesía. Lo que decide es qué contesta el backend
// cuando alguien manda el id de otro establecimiento a mano.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { puedeLocal, localesDe, localPermitido } from "../src/modules/usuarios/locales.js";

const server = readFileSync("server.js", "utf8");
const BLANES = "La Tapeta - Blanes", LLORET = "Cooperativa - Lloret";

// Las tres personas del escenario.
const encargadoBlanes = { id: 1, rol: "encargado", local: BLANES, locales: [BLANES] };
const encargadoLloret = { id: 2, rol: "encargado", local: LLORET, locales: [LLORET] };
const juanBlanes = { id: 10, rol: "trabajador", local: BLANES, locales: [BLANES] };
const martaLloret = { id: 20, rol: "trabajador", local: LLORET, locales: [LLORET] };
const direccion = { id: 99, rol: "direccion", local: null };

describe("la pieza que decide: puedeLocal", () => {
  test("el encargado de Blanes puede Blanes", () => {
    assert.equal(puedeLocal(encargadoBlanes, BLANES), true);
  });
  test("Y NO PUEDE LLORET", () => {
    assert.equal(puedeLocal(encargadoBlanes, LLORET), false);
  });
  test("AISLAMIENTO INVERSO: Lloret tampoco puede Blanes", () => {
    // Para descartar que funcione de casualidad solo en una dirección.
    assert.equal(puedeLocal(encargadoLloret, LLORET), true);
    assert.equal(puedeLocal(encargadoLloret, BLANES), false);
  });
  test("dirección llega a los dos", () => {
    assert.equal(puedeLocal(direccion, BLANES), true);
    assert.equal(puedeLocal(direccion, LLORET), true);
  });
  test("y pedir un local ajeno no devuelve ese local", () => {
    assert.equal(localPermitido(encargadoBlanes, LLORET), BLANES, "se le da el suyo, nunca el pedido");
    assert.equal(localPermitido(encargadoBlanes, BLANES), BLANES);
  });
  test("un encargado con DOS establecimientos llega a los dos y no a un tercero", () => {
    const dos = { id: 3, rol: "encargado", local: BLANES, locales: [BLANES, LLORET] };
    assert.deepEqual(localesDe(dos), [BLANES, LLORET]);
    assert.equal(puedeLocal(dos, LLORET), true);
    assert.equal(puedeLocal(dos, "Girona"), false);
  });
});

// Cada endpoint que toca datos de una persona o de un establecimiento, con la guarda que lo
// protege. Si alguien añade uno sin guarda, este test lo caza.
const RUTAS = [
  // [ruta, guarda que tiene que aparecer en su cuerpo]
  ['app.get("/api/rrhh/trabajador/:id/ficha-laboral"', /rrhhPuedeLocal\(req, w\.local/],
  ['app.get("/api/rrhh/trabajador/:id/ficha"', /rrhhPuedeLocal\(req, w\.local\)/],
  ['app.put("/api/rrhh/trabajador/:id"', /rrhhPuedeLocal\(req, w\.local\)/],
  ['app.post("/api/rrhh/trabajador/:id/baja"', /ficBolsaWorker|rrhhPuedeLocal/],
  ['app.get("/api/rrhh/trabajador/:id/baja/plan"', /rrhhPuedeLocal\(req, w\.local/],
  ['app.post("/api/rrhh/trabajador/:id/recontratar"', /rrhhPuedeLocal\(req, w\.local/],
  ['app.post("/api/rrhh/trabajador/:id/corregir-fechas"', /rrhhPuedeLocal\(req, w\.local/],
  ['app.get("/api/rrhh/trabajador/:id/documentos"', /rrhhPuedeLocal\(req, wl\)/],
  ['app.get("/api/rrhh/atencion"', /horLocal\(req, req\.query\.local\)/],
  ['app.post("/api/horarios/contrato"', /rrhhPuedeLocal\(req, w\.local/],
  ['app.post("/api/horarios/asignacion"', /horSemanaParaEscribir/],
  ['app.post("/api/horarios/asignacion/:id/repetir"', /horSemanaEditable\(req, t\.semana_id\)/],
  ['app.delete("/api/horarios/asignacion/:id"', /horSemanaEditable\(req, a\.semana_id\)/],
  ['app.post("/api/horarios/semana/:id/publicar"', /rrhhPuedeLocal|horSemanaEditable|horLocal/],
  ['app.get("/api/horarios/semana"', /horLocal\(req, req\.query\.local\)/],
  ['app.post("/api/horarios/ausencia/:id/resolver"', /rrhhPuedeLocal\(req, a\.local_worker/],
  ['app.get("/api/horarios/ausencias"', /horLocal\(req, req\.query\.local\)/],
  ['app.put("/api/horarios/disponibilidad/:workerId"', /rrhhPuedeLocal|horLocal/],
  ['app.put("/api/horarios/capacidades/:workerId"', /rrhhPuedeLocal|horLocal/],
  ['app.get("/api/fichajes/revision"', /horLocal\(req, req\.query\.local\)/],
  ['app.post("/api/fichajes/validar"', /horLocal|rrhhPuedeLocal/],
  ['app.post("/api/fichajes/validar-lote"', /horLocal|rrhhPuedeLocal/],
  ['app.get("/api/fichajes/bolsa"', /horLocal\(req, req\.query\.local\)/],
  ['app.get("/api/fichajes/bolsa/:workerId"', /rrhhPuedeLocal\(req, w\.local/],
  ['app.post("/api/fichajes/bolsa/liquidar"', /ficBolsaWorker\(req/],
  ['app.post("/api/fichajes/bolsa/revertir"', /ficBolsaWorker\(req/],
  ['app.post("/api/fichajes/bolsa/ajuste"', /rrhhPuedeLocal\(req, w\.local/],
  ['app.get("/api/horarios/config-operativa"', /horLocal\(req, req\.query\.local\)/],
  ['app.put("/api/horarios/config-operativa"', /horLocal\(req, req\.body\?\.local\)/],
];

describe("BLANES → LLORET: cada puerta tiene su guarda", () => {
  for (const [ruta, guarda] of RUTAS) {
    test(`${ruta.replace('app.', '').replace(/"/g, "").slice(0, 58)} comprueba el establecimiento`, () => {
      const i = server.indexOf(ruta);
      assert.ok(i >= 0, `la ruta ya no existe: ${ruta}`);
      // Hasta el siguiente endpoint: es el cuerpo de este.
      const sig = server.slice(i + 1).search(/\napp\.(get|post|put|delete)\(/);
      const cuerpo = server.slice(i, sig > 0 ? i + 1 + sig : i + 7000);
      assert.match(cuerpo, guarda, `${ruta} no comprueba el establecimiento`);
    });
  }
});

describe("y las guardas hacen lo que dicen", () => {
  test("rrhhPuedeLocal se apoya en puedeLocal, que es la pieza probada arriba", () => {
    // Ahora pasa por `puedeAccederLocal` —que es quien reconoce además la otra barra del
    // mismo centro—, pero la pieza que decide sigue siendo la misma y no `localScope`.
    assert.match(server, /function rrhhPuedeLocal\(req, local\) \{[\s\S]{0,260}return puedeAccederLocal\(req, local\)/);
    assert.match(server, /function puedeAccederLocal\(req, local\) \{[\s\S]{0,120}puedeLocal\(req && req\.user, local\)/);
    const i = server.indexOf("function rrhhPuedeLocal(req, local)");
    assert.ok(!/localScope\(/.test(server.slice(i, i + 260)), "«en cuál está mirando» no decide quién puede tocar qué");
  });
  test("horLocal nunca devuelve un establecimiento ajeno", () => {
    assert.match(server, /function localScope\(req, pedido\) \{[\s\S]{0,160}localPermitido\(req\.user/);
  });
  test("y un turno no se le cuelga a alguien de otro establecimiento", () => {
    // Doble guarda: el local de la semana Y el de la persona.
    assert.match(server, /String\(w\.local \|\| ""\) !== String\(local\)[\s\S]{0,200}Solo se puede planificar a la gente de este establecimiento/);
  });
  test("repetir tampoco", () => {
    const i = server.indexOf('app.post("/api/horarios/asignacion/:id/repetir"');
    const c = server.slice(i, i + 3000);
    assert.match(c, /String\(persona\.local \|\| ""\) !== String\(chk\.semana\.local\)/);
  });
});

describe("TRABAJADOR → DATOS DE TERCEROS", () => {
  const ROL = /requireAuth\((RRHH_ROLES|HORARIOS_ROLES|FICHAJES_ROLES|VALIDAR_ROLES|LIQ_ROLES|CONFIG_ROLES|\["[^\]]*\])/;
  test("ninguna ruta de responsable está abierta a cualquiera", () => {
    for (const [ruta] of RUTAS) {
      const i = server.indexOf(ruta);
      const cabecera = server.slice(i, i + 200);
      assert.match(cabecera, ROL, `${ruta} no exige rol`);
      assert.ok(!/requireAuth\(\)/.test(cabecera), `${ruta} está abierta a cualquier sesión`);
    }
  });
  test("y `trabajador` no está en ninguna de las listas de rol", () => {
    for (const lista of ["RRHH_ROLES", "HORARIOS_ROLES", "FICHAJES_ROLES", "VALIDAR_ROLES", "LIQ_ROLES", "CONFIG_ROLES"]) {
      const m = new RegExp(`const ${lista} = \\[([^\\]]*)\\]`).exec(server);
      assert.ok(m, `no se encuentra ${lista}`);
      assert.ok(!/"trabajador"/.test(m[1]), `${lista} incluye a los trabajadores: ${m[1]}`);
    }
  });
  test("las rutas del trabajador sacan la persona DEL TOKEN, no del cuerpo", () => {
    // Es lo que impide pedir las vacaciones de otro o mirar su bolsa.
    for (const ruta of ['app.get("/api/mi-cuadrante"', 'app.get("/api/mis-ausencias"',
                        'app.post("/api/mis-ausencias"', 'app.get("/api/mi-registro"',
                        'app.get("/api/mi-disponibilidad"', 'app.put("/api/mi-disponibilidad"',
                        'app.get("/api/mi-horario/cambios"', 'app.get("/api/mi-perfil"']) {
      const i = server.indexOf(ruta);
      assert.ok(i >= 0, `no existe ${ruta}`);
      const sig = server.slice(i + 1).search(/\napp\.(get|post|put|delete)\(/);
      const cuerpo = server.slice(i, sig > 0 ? i + 1 + sig : i + 4000);
      assert.match(cuerpo, /req\.user\.id/, `${ruta} no usa el id del token`);
      assert.ok(!/req\.body\?\.worker_id|req\.query\.worker_id|req\.params\.workerId/.test(cuerpo),
        `${ruta} acepta un worker_id de fuera`);
    }
  });
  test("confirmar un cambio de horario solo puede hacerlo su dueño", () => {
    const i = server.indexOf('app.post("/api/mi-horario/cambios/:id/entendido"');
    const c = server.slice(i, i + 1400);
    assert.match(c, /worker_id = \?/);
    assert.match(c, /req\.user\.id/);
  });
});

describe("TRABAJADOR → ACCIONES ADMINISTRATIVAS", () => {
  const prohibidas = [
    ['app.post("/api/horarios/asignacion"', "crear turnos"],
    ['app.post("/api/horarios/asignacion/:id/repetir"', "repetir turnos"],
    ['app.post("/api/horarios/semana/:id/publicar"', "publicar"],
    ['app.post("/api/fichajes/validar"', "validar jornadas"],
    ['app.post("/api/fichajes/validar-lote"', "validar en lote"],
    ['app.post("/api/fichajes/bolsa/liquidar"', "pagar horas"],
    ['app.post("/api/fichajes/bolsa/revertir"', "deshacer un pago"],
    ['app.post("/api/horarios/ausencia/:id/resolver"', "aprobar ausencias"],
    ['app.post("/api/rrhh/trabajador"', "dar de alta"],
    ['app.post("/api/rrhh/trabajador/:id/baja"', "dar de baja"],
    ['app.post("/api/rrhh/trabajador/:id/recontratar"', "recontratar"],
    ['app.post("/api/rrhh/trabajador/:id/corregir-fechas"', "corregir fechas"],
  ];
  for (const [ruta, que] of prohibidas) {
    test(`un trabajador no puede ${que}`, () => {
      const i = server.indexOf(ruta);
      assert.ok(i >= 0, `no existe ${ruta}`);
      const cab = server.slice(i, i + 200);
      assert.ok(!/"trabajador"/.test(cab), `${ruta} deja pasar a los trabajadores`);
      assert.match(cab, /requireAuth\(/);
    });
  }
  test("y nadie resuelve su propia ausencia, ni siquiera dirección", () => {
    const i = server.indexOf('app.post("/api/horarios/ausencia/:id/resolver"');
    const c = server.slice(i, i + 1600);
    assert.match(c, /Number\(a\.worker_id\) === Number\(req\.user\.id\)/);
    assert.match(c, /No puedes resolver tu propia solicitud/);
  });
});

describe("KIOSCO", () => {
  test("ficha con PIN y dispositivo, no con una sesión de panel", () => {
    assert.match(server, /pin_hash/);
    assert.match(server, /dispositivo_id/);
  });
  test("y no llega a nada de administración", () => {
    // El kiosco entra por sus propias rutas; las de gestión exigen rol.
    for (const ruta of ['app.get("/api/rrhh/atencion"', 'app.get("/api/fichajes/revision"',
                        'app.get("/api/fichajes/bolsa"', 'app.post("/api/horarios/asignacion"']) {
      const cab = server.slice(server.indexOf(ruta), server.indexOf(ruta) + 200);
      assert.match(cab, /requireAuth\((RRHH_ROLES|HORARIOS_ROLES|FICHAJES_ROLES|VALIDAR_ROLES|\[)/, `${ruta} sin rol`);
    }
  });
});
