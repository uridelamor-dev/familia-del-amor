import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// CORREGIR UN FICHAJE Y APROBAR LAS HORAS SON DOS COSAS DISTINTAS, y separarlas es lo que hace
// que el registro valga algo. El encargado es quien sabe que alguien se olvidó de fichar la
// salida —está allí— y por eso sigue escribiendo esa hora, con su motivo y su nombre. Pero
// validar es decir «estas son las horas que cuentan», y de ahí salen el saldo de la bolsa y la
// nómina: quien corrige no se aprueba a sí mismo.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("validar horas: solo dirección y RR. HH.", () => {
  test("los dos endpoints que escriben la validación", () => {
    assert.match(server, /const VALIDAR_ROLES = \["direccion", "rrhh"\]/);
    assert.match(server, /app\.post\("\/api\/fichajes\/validar", requireAuth\(VALIDAR_ROLES\)/);
    assert.match(server, /app\.post\("\/api\/fichajes\/validar-lote", requireAuth\(VALIDAR_ROLES\)/);
  });

  test("y el encargado NO está en esa lista", () => {
    const m = /const VALIDAR_ROLES = \[([^\]]*)\]/.exec(server);
    assert.ok(m);
    assert.ok(!/encargado|contabilidad|marketing|trabajador/.test(m[1]), `se ha colado alguien: ${m[1]}`);
  });

  test("LEER la revisión NO se toca: el encargado la necesita", () => {
    // Es su equipo y su cuadrante. Quitarle la pantalla por no dejarle validar sería
    // arreglar un problema creando otro.
    assert.match(server, /app\.get\("\/api\/fichajes\/revision", requireAuth\(FICHAJES_ROLES\)/);
    assert.match(server, /app\.get\("\/api\/fichajes\/jornada", requireAuth\(FICHAJES_ROLES\)/);
    const m = /const FICHAJES_ROLES = \[([^\]]*)\]/.exec(server);
    assert.match(m[1], /encargado/, "el encargado tiene que seguir entrando en Fichajes");
  });

  test("y CORREGIR un fichaje tampoco: es lo que solo él puede saber", () => {
    assert.match(server, /app\.post\("\/api\/fichajes\/evento", requireAuth\(FICHAJES_ROLES\)/);
    assert.match(server, /app\.post\("\/api\/fichajes\/evento\/:id\/anular", requireAuth\(FICHAJES_ROLES\)/);
  });
});

describe("el panel no ofrece lo que el servidor va a rechazar", () => {
  test("hay una sola función que lo decide, espejo de los roles del servidor", () => {
    assert.match(app, /const ficPuedeValidar = \(\) => \["direccion", "rrhh"\]\.includes\(USER\.rol\)/);
  });

  test("el botón de lote y los atajos cuelgan de ella", () => {
    assert.match(app, /const puedoValidar = ficPuedeValidar\(\)/);
    assert.match(app, /\$\{r\.listas_para_validar && puedoValidar/);
    assert.match(app, /\$\{f\.unClic && puedoValidar \?/);
  });

  test("y en el detalle, «¿qué horas cuentan?» entero", () => {
    // Ese bloque ES la validación: elegir la hora de cada extremo solo sirve para llegar a la
    // cifra que se va a guardar. Dejarlo puesto sin poder guardar es trabajo tirado.
    const fn = app.slice(app.indexOf("async function ficAbrirJornada("), app.indexOf("function ficReloj(min)"));
    assert.match(fn, /const validador = ficPuedeValidar\(\)/);
    assert.match(fn, /\$\{validador \? `\s*\n\s*<div class="ch"[^>]*><h3[^>]*>¿Qué horas cuentan\?/);
    assert.match(fn, /\$\{validador \? `<button class="btn primary" id="ficValidar"/);
  });

  test("los listeners de ese bloque no se enganchan si el bloque no está", () => {
    // `querySelector` de algo que no existe devuelve null, y `.addEventListener` sobre null
    // revienta el modal entero: se quedaría sin poder ni corregir ni cerrar.
    const fn = app.slice(app.indexOf("async function ficAbrirJornada("), app.indexOf("function ficReloj(min)"));
    for (const sel of ["#ficHoras", "#ficNoCuenta", "#ficValidar"]) {
      const linea = fn.split("\n").find((l) => l.includes(`ov.querySelector("${sel}")`) && l.includes("addEventListener"));
      assert.ok(linea, `no se encuentra el listener de ${sel}`);
      assert.match(linea, /if \(validador\)/, `${sel} se engancharía sobre null`);
    }
  });

  test("pero corregir y anular siguen enganchados para todos", () => {
    const fn = app.slice(app.indexOf("async function ficAbrirJornada("), app.indexOf("function ficReloj(min)"));
    for (const sel of ["#ficNvOk", "#ficJorBody"]) {
      const linea = fn.split("\n").find((l) => l.includes(`ov.querySelector("${sel}")`) && l.includes("addEventListener"));
      assert.ok(linea && !/if \(validador\)/.test(linea), `${sel} se ha atado al permiso de validar`);
    }
  });

  test("y se dice POR QUÉ no hay botones", () => {
    // Una pantalla con las cifras delante y ninguna acción, sin explicación, se lee como rota.
    assert.match(app, /\$\{!puedoValidar \? `<p class="fic-nota"[^`]*Validar las horas/);
    assert.match(app, /Decidir cuántas horas cuentan<\/b> —lo que va al saldo y a la nómina— lo hacen dirección y RR\. HH\./);
  });

  test("la bolsa no manda a validar a quien no puede", () => {
    // «Ir a validarlas» llevaba a una pantalla donde ese usuario no puede hacer nada. Ahora
    // se le dice quién lo hace y se le ofrece VER cuáles son, que sí le sirve.
    assert.match(app, /ficPuedeValidar\(\)\s*\n\s*\? `<button class="linkbtn" id="ficIrRevision"[^`]*Ir a validarlas/);
    assert.match(app, /Las valida dirección o RR\. HH\.[\s\S]{0,140}Ver cuáles son/);
  });
});
