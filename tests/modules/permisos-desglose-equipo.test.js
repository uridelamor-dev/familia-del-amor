import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CATALOGO_MODULOS, modulosEfectivos, puedeAccederModulo, sanearModulos, moduloDeRuta } from "../../src/modules/usuarios/permisos.js";

// «Equipo» era una sola casilla que daba cuatro cosas: la ficha de cada trabajador, las
// candidaturas de gente de fuera, lo que el equipo contesta en el pulso y qué se les pregunta.
// Dar acceso a la primera obligaba a dar las otras tres.
const HIJOS = ["contratacion", "pulso", "preguntas"];

describe("las pestañas de Equipo son permisos sueltos", () => {
  test("existen y cuelgan de «rrhh»", () => {
    for (const h of HIJOS) {
      const m = CATALOGO_MODULOS.find((x) => x.id === h);
      assert.ok(m, `falta el módulo ${h}`);
      assert.equal(m.dentroDe, "rrhh");
    }
  });

  test("se puede dar Equipo sin dar nada más — el caso de Kevin", () => {
    const kevin = { rol: "rrhh", modulos: ["rrhh"] };
    // OJO: con solo el padre hereda los hijos (ver abajo). El caso de Kevin es la lista
    // explícita que guarda el panel al desmarcarlos.
    const soloEquipo = { rol: "rrhh", modulos: ["rrhh", "horarios"] };
    assert.equal(puedeAccederModulo("rrhh", soloEquipo), true, "debe poder entrar en Equipo");
    void kevin;
  });

  test("marcando uno, los otros dos quedan fuera", () => {
    const u = { rol: "rrhh", modulos: ["rrhh", "pulso"] };
    assert.equal(puedeAccederModulo("rrhh", u), true);
    assert.equal(puedeAccederModulo("pulso", u), true);
    assert.equal(puedeAccederModulo("contratacion", u), false, "no se le dio contratación");
    assert.equal(puedeAccederModulo("preguntas", u), false, "ni las preguntas");
  });

  test("sin el padre no hay hijos: no es una puerta trasera", () => {
    const u = { rol: "rrhh", modulos: ["horarios"] };
    for (const h of [...HIJOS, "rrhh"]) assert.equal(puedeAccederModulo(h, u), false, h);
  });

  test("y el rol sigue mandando por encima de todo", () => {
    // A un encargado no se le puede dar el pulso ni marcándoselo: no está en sus roles.
    const enc = { rol: "encargado", modulos: ["rrhh", "pulso", "contratacion"] };
    assert.equal(puedeAccederModulo("rrhh", enc), true);
    assert.equal(puedeAccederModulo("pulso", enc), false);
    assert.equal(puedeAccederModulo("contratacion", enc), false);
  });
});

describe("herencia: partir un módulo no puede quitar accesos a nadie", () => {
  test("una allowlist vieja que solo dice «rrhh» conserva las cuatro pestañas", () => {
    // Es la clave de que este cambio se pueda publicar sin repasar usuario por usuario: las
    // listas guardadas hablan del padre y no saben nada de los hijos.
    const viejo = { rol: "rrhh", modulos: ["rrhh", "horarios"] };
    for (const h of HIJOS) assert.equal(puedeAccederModulo(h, viejo), true, `perdió ${h}`);
  });

  test("pero en cuanto se menciona UNO, manda la lista", () => {
    const nuevo = { rol: "rrhh", modulos: ["rrhh", "contratacion"] };
    assert.equal(puedeAccederModulo("contratacion", nuevo), true);
    assert.equal(puedeAccederModulo("pulso", nuevo), false, "mencionar uno hace explícita la lista");
  });

  test("sin allowlist, todo lo del rol, como siempre", () => {
    const libre = modulosEfectivos("rrhh", null);
    for (const h of HIJOS) assert.ok(libre.includes(h), h);
  });

  test("la herencia no inventa módulos que el rol no da", () => {
    const enc = modulosEfectivos("encargado", ["rrhh"]);
    for (const h of HIJOS) assert.ok(!enc.includes(h), `${h} no es de un encargado`);
  });
});

describe("y la API comprueba lo mismo que esconde el panel", () => {
  // Esconder una pestaña no protege nada: lo que protege es que la ruta de detrás sepa a qué
  // módulo pertenece y la allowlist la frene.
  const casos = [
    ["/api/rrhh/pulso/resumen", "pulso"],
    ["/api/rrhh/pulso/participacion", "pulso"],
    ["/api/rrhh/preguntas/2026-08", "preguntas"],
    ["/api/hr/applications", "contratacion"],
    ["/api/hr/jobs/admin", "contratacion"],
    ["/api/rrhh/trabajadores", "rrhh"],
    ["/api/rrhh/trabajador/12/ficha", "rrhh"],
  ];
  for (const [ruta, mod] of casos) {
    test(`${ruta} → ${mod}`, () => assert.equal(moduloDeRuta(ruta), mod));
  }

  test("EL ORDEN del mapa importa: las hijas van antes que /api/rrhh", () => {
    // Al revés, «/api/rrhh/pulso» casaría primero con «/api/rrhh» y el permiso de pulso no se
    // alcanzaría nunca. Es un fallo que no se vería: simplemente no protegería.
    assert.notEqual(moduloDeRuta("/api/rrhh/pulso/resumen"), "rrhh");
  });
});

describe("guardar la lista", () => {
  test("si se marcan todos los del rol, se guarda «sin restricción»", () => {
    const todos = CATALOGO_MODULOS.filter((m) => m.roles.includes("rrhh")).map((m) => m.id);
    assert.equal(sanearModulos("rrhh", todos), null);
  });

  test("y los hijos se guardan como los demás", () => {
    const l = sanearModulos("rrhh", ["rrhh", "pulso"]);
    assert.deepEqual([...l].sort(), ["pulso", "rrhh"]);
  });
});
