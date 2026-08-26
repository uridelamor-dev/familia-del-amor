import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { limpiar, esUsuarioValido, candidatosUsuario, primerUsuarioLibre }
  from "../../src/modules/rrhh/usuario.js";

// El usuario se proponía como «nombre.local» —«erika.girona»—, que resolvía por la vía de en
// medio un problema real: es ÚNICO en toda la casa y con ocho establecimientos hay más de una
// Erika. Pero el local dentro del usuario no dice quién es esa persona, dice dónde estaba el día
// que entró: quien cambia de local se queda con un usuario que miente, y nadie lo renombra
// porque es con lo que se identifica.

describe("el nombre, limpio", () => {
  test("sin acentos, sin espacios y en minúsculas", () => {
    assert.equal(limpiar("Érika"), "erika");
    assert.equal(limpiar("José María"), "josemaria");
    assert.equal(limpiar("  O'Connor  "), "oconnor");
  });
  test("no revienta con basura", () => {
    for (const v of [null, undefined, "", 123, "···"]) assert.doesNotThrow(() => limpiar(v));
  });
});

describe("las formas de llamar a alguien, de la más natural a la menos", () => {
  test("primero el nombre a secas", () => {
    assert.equal(candidatosUsuario("Erika Soler Puig")[0], "erika");
  });

  test("y solo después se complica, en este orden", () => {
    const c = candidatosUsuario("Erika Soler Puig");
    assert.deepEqual(c.slice(0, 5), ["erika", "erika.s", "erikasoler", "erika.sp", "erikasolerpuig"]);
  });

  test("UN NÚMERO ES LO ÚLTIMO, no lo primero", () => {
    // «erika2» funciona, pero no dice nada de nadie. Se llega ahí cuando ya no queda otra.
    const c = candidatosUsuario("Erika Soler Puig");
    assert.ok(c.indexOf("erika2") > 3, "el número no puede ir antes que el apellido");
  });

  test("con un solo nombre se pasa directo a los números", () => {
    assert.deepEqual(candidatosUsuario("Erika").slice(0, 3), ["erika", "erika2", "erika3"]);
  });

  test("todos valen para el campo de usuario", () => {
    // De 3 a 32 letras, números, punto, guion o guion bajo: lo que exige el alta.
    for (const n of ["Erika Soler", "José María de la Cruz", "Ana", "Bo Li"]) {
      for (const u of candidatosUsuario(n)) assert.ok(esUsuarioValido(u), `${n} → ${u}`);
    }
  });

  test("un nombre demasiado corto no genera un usuario inválido", () => {
    // «Bo» son dos letras y el mínimo son tres: no puede colarse un usuario que el alta
    // rechazaría después, con todo lo demás ya escrito.
    for (const u of candidatosUsuario("Bo")) assert.ok(esUsuarioValido(u), u);
  });

  test("sin nombre no se inventa ninguno", () => {
    for (const v of [null, "", "   ", "···"]) assert.deepEqual(candidatosUsuario(v), []);
  });
});

describe("el primero que esté libre", () => {
  test("si el nombre está libre, ese", () => {
    assert.equal(primerUsuarioLibre("Erika Soler", ["kevin", "marta"]), "erika");
  });

  test("si está cogido, la siguiente forma natural", () => {
    assert.equal(primerUsuarioLibre("Erika Soler", ["erika"]), "erika.s");
    assert.equal(primerUsuarioLibre("Erika Soler", ["erika", "erika.s"]), "erikasoler");
  });

  test("comparando SIN mayúsculas, que es como se guarda", () => {
    // Comparar sin normalizar deja pasar el duplicado y lo convierte en un error de clave
    // única a mitad del alta, cuando ya se ha escrito todo lo demás.
    assert.notEqual(primerUsuarioLibre("Erika Soler", ["ERIKA"]), "erika");
    assert.notEqual(primerUsuarioLibre("Erika Soler", [" Erika "]), "erika");
  });

  test("con la casa llena de Erikas, sigue encontrando uno", () => {
    const llenos = ["erika", "erika.s", "erikasoler", "erika2", "erika3"];
    const u = primerUsuarioLibre("Erika Soler", llenos);
    assert.ok(u && !llenos.includes(u));
  });

  test("y sin nombre devuelve null en vez de una cadena rara", () => {
    assert.equal(primerUsuarioLibre("", ["erika"]), null);
  });
});
