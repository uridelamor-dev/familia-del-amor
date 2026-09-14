// El acumulador de avisos de Workplace: acotado, o no vale.
//
// POR QUÉ IMPORTA: el `Workplace.Id` y el `Workplace.Name` los escribe el TPV y llegan dentro del
// JSON de una petición externa. Que haga falta un token válido para entrar no los convierte en
// valores de confianza — un TPV mal configurado, otra versión de Ágora o un campo que cambie de
// forma bastan para que aquí llegue algo que no esperábamos.
//
// Un `Map` sin techo con una clave sacada de ahí es una fuga de memoria esperando a ocurrir, y de
// las silenciosas: no da error, solo va creciendo hasta que el proceso se cae de madrugada.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearAcumulador, sanear, MAX_ID, MAX_NOMBRE, MAX_ENTRADAS, VENTANA_MS }
  from "../../src/modules/fidelizacion/discrepancias.js";

const T0 = Date.parse("2026-09-14T12:00:00Z");
const modulo = readFileSync(new URL("../../src/modules/fidelizacion/discrepancias.js", import.meta.url), "utf8");


describe("lo que llega del TPV se sanea antes de guardarse", () => {
  test("un objeto o un array NO son un identificador", () => {
    // `String({})` daría "[object Object]", que es exactamente el disfraz que ya costó un
    // incidente con la clave de cifrado. Aquí se rechaza, no se convierte.
    for (const raro of [{}, { Id: "x" }, [], ["WP-1"], () => "WP-1", true, false]) {
      assert.equal(sanear(raro, MAX_ID), null, JSON.stringify(raro));
    }
  });

  test("ausente o vacío tampoco", () => {
    for (const nada of [null, undefined, "", "   "]) assert.equal(sanear(nada, MAX_ID), null);
  });

  test("un valor gigante se DESCARTA, no se recorta", () => {
    // Recortarlo sería peor: dos Workplace distintos podrían quedar iguales al cortarlos y se
    // confundirían entre sí, que es justo lo que este aviso tiene que distinguir.
    assert.equal(sanear("x".repeat(MAX_ID + 1), MAX_ID), null);
    assert.equal(sanear("x".repeat(MAX_ID), MAX_ID).length, MAX_ID, "el del límite sí entra");
    assert.equal(sanear("y".repeat(MAX_NOMBRE + 1), MAX_NOMBRE), null);
  });

  test("los caracteres de control se quitan siempre", () => {
    // Un salto de línea metido en el nombre parte en dos una línea de registro y ensucia
    // cualquier cosa que la lea después.
    const conControl = "WP" + String.fromCharCode(10) + "-1" + String.fromCharCode(9) + String.fromCharCode(0);
    assert.equal(sanear(conControl, MAX_ID), "WP-1");
    assert.equal(sanear(String.fromCharCode(27) + "[31mrojo", MAX_ID), "[31mrojo");
  });

  test("un número sí vale; se recorta el espacio de los lados", () => {
    assert.equal(sanear(42, MAX_ID), "42");
    assert.equal(sanear("  WP-7  ", MAX_ID), "WP-7");
  });
});

describe("el Map no crece sin límite", () => {
  test("10.000 Workplace distintos no pasan del máximo", () => {
    const a = crearAcumulador();
    for (let i = 0; i < 10000; i++) a.anota(1, `WP-${i}`, `Puesto ${i}`, T0);
    assert.equal(a.tamano, MAX_ENTRADAS);
    assert.ok(MAX_ENTRADAS <= 500, "el techo es demasiado alto para lo que esto es");
  });

  test("al llegar al techo se expulsa la MÁS ANTIGUA", () => {
    const a = crearAcumulador({ maxEntradas: 3 });
    a.anota(1, "A", null, T0);
    a.anota(1, "B", null, T0 + 1);
    a.anota(1, "C", null, T0 + 2);
    assert.equal(a.tamano, 3);
    a.anota(1, "D", null, T0 + 3);
    assert.equal(a.tamano, 3, "ha crecido por encima del techo");
    // «A» se fue, así que volver a verla es un aviso nuevo.
    assert.deepEqual(a.anota(1, "A", null, T0 + 4)?.n, 1);
    // «D» sigue dentro: se acaba de ver.
    assert.equal(a.anota(1, "D", null, T0 + 5), null);
  });

  test("un Id que no se puede sanear NO deja entrada ninguna", () => {
    const a = crearAcumulador();
    for (const basura of [{}, [], null, "", "x".repeat(999), true]) {
      assert.equal(a.anota(1, basura, "nombre", T0), null, String(basura));
    }
    assert.equal(a.tamano, 0, "la basura ha dejado entradas");
  });

  test("un NOMBRE gigante no engorda la clave: la clave es una huella de tamaño fijo", () => {
    const a = crearAcumulador();
    const r1 = a.anota(1, "WP-1", "n".repeat(5000), T0);
    assert.equal(a.tamano, 1);
    assert.equal(r1.nombre, null, "un nombre excesivo se descarta");
    assert.equal(r1.id, "WP-1", "pero el aviso sigue saliendo");
  });

  test("mismo Id y mismo Name → se acumula en el MISMO aviso", () => {
    const a = crearAcumulador();
    assert.equal(a.anota(1, "WP-1", "Barra", T0).n, 1);
    assert.equal(a.anota(1, "WP-1", "Barra", T0 + 1000), null, "ha vuelto a avisar de lo mismo");
    assert.equal(a.tamano, 1);
  });

  test("mismo Id y Name DISTINTO → avisos diferentes", () => {
    // Que el mismo puesto cambie de rótulo es otra cosa observada, y es la señal de que alguien ha
    // tocado la configuración del TPV. Callarlo sería perder justo ese aviso.
    const a = crearAcumulador();
    assert.equal(a.anota(1, "WP-1", "Barra", T0).n, 1);
    assert.equal(a.anota(1, "WP-1", "Terraza", T0 + 1000)?.n, 1, "el cambio de nombre no ha avisado");
    assert.equal(a.tamano, 2);
    // Y «sin nombre» tampoco es lo mismo que un nombre.
    assert.equal(a.anota(1, "WP-1", null, T0 + 2000)?.n, 1);
    assert.equal(a.tamano, 3);
  });

  test("pares ambiguos no colisionan: («12»,«3») y («1»,«23»)", () => {
    // Concatenar a secas juntaría los dos en «123». El separador va por longitud justo por esto.
    const a = crearAcumulador();
    assert.equal(a.anota(1, "12", "3", T0).n, 1);
    assert.equal(a.anota(1, "1", "23", T0)?.n, 1, "los dos pares han colisionado");
    assert.equal(a.tamano, 2);
    // Y lo mismo con el id de la integración pegado al Workplace.
    const b = crearAcumulador();
    b.anota(1, "2WP", null, T0);
    assert.equal(b.anota(12, "WP", null, T0)?.n, 1);
    assert.equal(b.tamano, 2);
  });

  test("dos integraciones distintas no comparten aviso", () => {
    const a = crearAcumulador();
    a.anota(1, "WP-1", null, T0);
    a.anota(2, "WP-1", null, T0);
    assert.equal(a.tamano, 2);
  });
});

describe("lo vencido desaparece", () => {
  test("una entrada pasada la ventana se borra sola", () => {
    const a = crearAcumulador({ ventanaMs: 1000 });
    a.anota(1, "WP-1", null, T0);
    assert.equal(a.tamano, 1);
    // Otra anotación cualquiera limpia lo vencido: no hace falta un temporizador.
    a.anota(1, "WP-2", null, T0 + 5000);
    assert.equal(a.tamano, 1, "la vencida sigue ahí");
  });

  test("la ventana por defecto es un servicio largo", () => {
    assert.equal(VENTANA_MS, 6 * 60 * 60 * 1000);
  });
});

describe("cuándo avisa y cuándo calla", () => {
  test("la primera avisa", () => {
    const a = crearAcumulador();
    assert.deepEqual(a.anota(1, "WP-9", "Barra", T0),
      { n: 1, desde: new Date(T0).toISOString(), id: "WP-9", nombre: "Barra" });
  });

  test("las de la misma ventana se cuentan en silencio", () => {
    const a = crearAcumulador();
    a.anota(1, "WP-9", "Barra", T0);
    for (let i = 1; i <= 300; i++) {
      assert.equal(a.anota(1, "WP-9", "Barra", T0 + i * 1000), null, `la ${i} ha vuelto a avisar`);
    }
  });

  test("al vencer, el aviso lleva TODO lo que se calló", () => {
    // Perder el recuento sería perder el tamaño del problema: «una discrepancia» y «trescientas en
    // un servicio» son cosas muy distintas para quien lo investigue.
    const a = crearAcumulador({ ventanaMs: 1000 });
    a.anota(1, "WP-9", "Barra", T0);
    a.anota(1, "WP-9", "Barra", T0 + 100);
    a.anota(1, "WP-9", "Barra", T0 + 200);
    const r = a.anota(1, "WP-9", "Barra", T0 + 2000);
    assert.equal(r.n, 4, "se ha perdido el recuento");
    assert.equal(r.desde, new Date(T0).toISOString(), "no dice desde cuándo");
  });

  test("y después empieza a contar de nuevo", () => {
    const a = crearAcumulador({ ventanaMs: 1000 });
    a.anota(1, "WP-9", null, T0);
    a.anota(1, "WP-9", null, T0 + 2000);
    assert.equal(a.anota(1, "WP-9", null, T0 + 2100), null);
  });

  test("vaciarlo solo provoca UN aviso más", () => {
    // Es lo que pasa en cada despliegue: vive en memoria a propósito. Volver a avisar una vez
    // después de reiniciar es lo correcto, y no afecta a ninguna factura.
    const a = crearAcumulador();
    a.anota(1, "WP-9", null, T0);
    assert.equal(a.anota(1, "WP-9", null, T0 + 1000), null);
    a.vacia();
    assert.equal(a.tamano, 0);
    assert.equal(a.anota(1, "WP-9", null, T0 + 2000).n, 1, "no vuelve a avisar tras reiniciar");
    assert.equal(a.anota(1, "WP-9", null, T0 + 3000), null, "avisa más de una vez");
  });
});

describe("de aquí no sale nada del cliente", () => {
  test("solo se guardan instante, recuento y fecha de inicio", () => {
    const a = crearAcumulador();
    const r = a.anota(1, "WP-9", "Barra", T0);
    assert.deepEqual(Object.keys(r).sort(), ["desde", "id", "n", "nombre"]);
  });

  test("no hay forma de meter aquí un MemberId ni el cuerpo", () => {
    // La firma solo acepta el id de la integración, el Workplace y su nombre. Cualquier otra cosa
    // se ignora, y un objeto —donde cabría un JSON entero— se rechaza de entrada.
    // Tres, porque el cuarto (`ahora`) tiene valor por defecto y no cuenta en `length`.
    assert.equal(crearAcumulador().anota.length, 3);
    assert.equal(sanear({ MemberId: "SECRETO", cuerpo: {} }, MAX_ID), null);
  });

  test("la clave interna NUNCA contiene el Id ni el Name", () => {
    // Se mira el Map de verdad: lo que se guarda en memoria no puede ser material del TPV.
    const a = crearAcumulador();
    a.anota(7, "WP-SECRETO-0001", "Barra del fondo", T0);
    const interno = a.claves.join(" ");
    for (const crudo of ["WP-SECRETO-0001", "Barra del fondo", "SECRETO", "fondo", "7|"]) {
      assert.ok(!interno.includes(crudo), `la clave lleva «${crudo}»: ${interno}`);
    }
    // Es una huella hexadecimal de tamaño fijo: 16 caracteres de SHA-256.
    assert.equal(a.claves.length, 1);
    assert.match(a.claves[0], /^[0-9a-f]{16}$/);
  });

  test("es SHA-256 de node:crypto, no una función casera", () => {
    // Un hash de 32 bits tiene colisiones al alcance de cualquiera, y una colisión aquí significa
    // que un Workplace distinto se calla creyendo que ya se avisó de él.
    assert.match(modulo, /import \{ createHash \} from "node:crypto"/);
    assert.match(modulo, /createHash\("sha256"\)/);
    assert.match(modulo, /\.slice\(0, 16\)/);
    assert.ok(!/0x811c9dc5|Math\.imul/.test(modulo), "sigue el hash casero");
  });

  test("la huella se calcula sobre los TRES valores saneados", () => {
    assert.match(modulo, /function huella\(integracionId, id, nombre\)/);
    assert.match(modulo, /const trozo = \(v\) => \{ const t = String\(v \?\? ""\); return `\$\{t\.length\}:\$\{t\}`; \}/);
    assert.match(modulo, /`\$\{trozo\(integracionId\)\}\|\$\{trozo\(id\)\}\|\$\{trozo\(nombre\)\}`/);
    // Y sobre los SANEADOS: `id` y `nombre` ya han pasado por `sanear` cuando se llama.
    const anota = modulo.slice(modulo.indexOf("anota(integracionId"), modulo.indexOf("const abre ="));
    assert.ok(anota.indexOf("const id = sanear(") < anota.indexOf("huella(integracionId, id, nombre)"));
    assert.ok(anota.indexOf("const nombre = sanear(") < anota.indexOf("huella(integracionId, id, nombre)"));
  });

  test("los límites elegidos son los del módulo, no números sueltos por ahí", () => {
    assert.equal(MAX_ID, 64);
    assert.equal(MAX_NOMBRE, 120);
    assert.equal(MAX_ENTRADAS, 500);
  });
});

describe("nunca rechaza el cierre de una factura", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");

  test("el aviso va dentro de su try y no devuelve ningún error al TPV", () => {
    const i = server.indexOf("¿VIENE DEL TPV QUE CREEMOS?");
    const bloque = server.slice(i, server.indexOf("Mismo identificador, cuerpo distinto"));
    assert.match(bloque, /FID_DISCREPANCIAS\.anota\(/);
    assert.ok(!/Status: "rejected"/.test(bloque), "una discrepancia rechaza la factura");
    assert.ok(!/res\.status\(/.test(bloque), "una discrepancia contesta un código de error");
    assert.match(bloque, /\} catch \{ \/\* una comprobación de más no puede tumbar la respuesta \*\/ \}/);
  });

  test("y va DESPUÉS del commit: no puede deshacer nada", () => {
    const iCommit = server.indexOf("La auditoría va DESPUÉS del COMMIT");
    const iAviso = server.indexOf("¿VIENE DEL TPV QUE CREEMOS?");
    assert.ok(iCommit > 0 && iAviso > iCommit, "el aviso está dentro de la transacción");
  });
});
