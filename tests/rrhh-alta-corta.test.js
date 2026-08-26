import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// El alta pedía siete cosas y tres no hacían falta: el puesto (ya se pide el rol y las áreas),
// el primer día de trabajo (es hoy) y el «desde» del contrato (es el primer día). Y preguntaba
// el establecimiento teniendo uno puesto en la barra de arriba.
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const modal = app.slice(app.indexOf("function rrWorkerAdd()"), app.indexOf("// ── Dar de baja"));

describe("el alta pregunta solo lo que hace falta", () => {
  test("ya no pide el puesto: el rol y las áreas dicen lo mismo mejor", () => {
    assert.ok(!/name="puesto"/.test(modal));
  });

  test("ni el primer día de trabajo", () => {
    assert.ok(!/name="fecha_alta"/.test(modal));
  });

  test("ni el «desde» del contrato", () => {
    assert.ok(!/name="contrato_desde"/.test(modal));
  });

  test("Y EL SERVIDOR SIGUE PONIENDO ESOS VALORES SOLO", () => {
    // Quitar un campo del formulario no puede dejar a alguien sin fecha de alta: sin ella la
    // ficha no sabe desde cuándo contar y el día que se fuera no habría nada que cerrar.
    const ciclo = readFileSync(new URL("../src/modules/rrhh/ciclo.js", import.meta.url), "utf8");
    assert.match(ciclo, /const alta = fecha\(datos\.fecha_alta\) \|\| fecha\(hoy\)/);
    assert.match(ciclo, /desde: fecha\(datos\.contrato_desde\) \|\| alta/);
    assert.match(ciclo, /puesto: String\(datos\.puesto \|\| ""\)\.trim\(\) \|\| null/);
  });
});

describe("el establecimiento sale de la barra de arriba", () => {
  test("si hay uno puesto, no se vuelve a preguntar", () => {
    // Se está mirando su equipo: dar de alta ahí es lo único que tiene sentido. Preguntarlo
    // otra vez es pedir dos veces lo mismo y abrir la puerta a que no coincidan.
    assert.match(modal, /const localBarra = enc \? \(USER\.local \|\| ""\) : \(localActualFE\(\) \|\| ""\)/);
    assert.match(modal, /localBarra\s*\n?\s*\? `<input type="hidden" name="local"/);
  });

  test("pero con «todos» puestos sí, porque entonces no hay respuesta", () => {
    assert.match(modal, /: `<div class="field"><label>Local<\/label><select name="local">/);
  });

  test("y se dice en cuál se está dando de alta", () => {
    // Un campo que desaparece sin decir qué valor ha tomado es peor que el campo.
    assert.match(modal, /en <b>\$\{esc\(nombreCortoLocal\(localBarra\)\)\}<\/b>/);
  });
});

describe("el usuario es el nombre, no el nombre y el local", () => {
  test("ya no se pega el local al usuario", () => {
    // «erika.girona» dice dónde estaba el día que entró, no quién es: quien cambia de local se
    // queda con un usuario que miente, y nadie lo renombra porque es con lo que se identifica.
    assert.ok(!/nombreCortoLocal\(loc\)/.test(modal));
    assert.ok(!/placeholder="nombre\.local"/.test(app));
  });

  test("lo propone el servidor, que es quien conoce a todos", () => {
    // El usuario es único en TODA la casa. Proponerlo mirando solo el propio local daría un
    // choque garantizado el día que haya dos Erikas en establecimientos distintos.
    assert.match(modal, /apiRaw\("\/api\/rrhh\/usuario-libre\?nombre=" \+ encodeURIComponent\(nom\)\)/);
    const ep = server.slice(server.indexOf('app.get("/api/rrhh/usuario-libre"'), server.indexOf('app.post("/api/rrhh/trabajador"'));
    assert.match(ep, /SELECT username FROM users/);
    assert.ok(!/WHERE local/.test(ep), "mirar solo un local no sirve: la unicidad es de la casa entera");
    assert.match(ep, /primerUsuarioLibre\(nombre, filas\.map/);
  });

  test("y el choque se resuelve ANTES de rellenar el resto", () => {
    // No como un error al pulsar el botón, con todo lo demás ya escrito.
    assert.match(modal, /_tUser = setTimeout\(proponerUsuario, 300\)/);
  });

  test("si se escribe a mano, no se pisa", () => {
    assert.match(modal, /if \(campoUser\.dataset\.tocado === "1"\) return/);
  });

  test("y una respuesta que llega tarde no pisa lo que se está escribiendo", () => {
    assert.match(modal, /if \(pidiendo !== mio/);
  });
});
