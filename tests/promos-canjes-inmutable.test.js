// Los candados de Promociones. Cada test de aquí no comprueba que algo funcione: comprueba
// que una decisión sigue tomada. Si alguno falla, es que se ha deshecho sin querer.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/promos/schema.js", import.meta.url), "utf8");
const modulo = readFileSync(new URL("../src/modules/promos/promos.js", import.meta.url), "utf8");
const kiosco = readFileSync(new URL("../public/fichar.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("pro_canjes es inmutable", () => {
  test("no se actualiza ninguna columna", () => {
    // Un canje es lo que pasó en la barra, con el nombre de quien lo validó al lado. Poder
    // reescribirlo lo convierte en una opinión: ni sirve para cuadrar una promoción ni
    // protege al camarero de quien insinúe que el cupón se validó solo. Corregir es anular el
    // QR y emitir otro.
    const updates = [...server.matchAll(/UPDATE pro_canjes\b/g)];
    assert.equal(updates.length, 0, "pro_canjes no se actualiza nunca");
  });

  test("no se borra ninguna fila", () => {
    assert.ok(!/DELETE FROM pro_canjes/.test(server), "pro_canjes no se borra nunca");
  });

  test("anular un QR no borra: lo marca", () => {
    // Borrar el QR dejaría huérfanos sus canjes, que son justo lo que no se puede perder.
    assert.ok(!/DELETE FROM pro_qr/.test(server), "un QR no se borra, se anula");
    assert.match(server, /UPDATE pro_qr SET anulado_en = \?/);
  });
});

describe("el canje no se puede gastar dos veces", () => {
  test("el filtro va DENTRO del UPDATE, no en un SELECT previo", () => {
    // Con dos tablets en la misma barra, «mira si queda uso y luego réstalo» son dos viajes a
    // la base y entre uno y otro cabe el otro camarero: los dos ven que queda y los dos
    // canjean. Que lo resuelva PostgreSQL en una sola sentencia es lo que lo impide.
    assert.match(modulo, /UPDATE pro_qr SET usos = usos \+ 1[\s\S]{0,140}usos < usos_max/);
    // Y que el servidor use ESE, y no uno escrito a mano por el camino.
    assert.match(server, /dbRun\(PRO_SQL_CANJEAR, \[qr\.id\]\)/);
  });

  test("el límite por cliente lo garantiza un índice único, no una cuenta", () => {
    // Contar antes de insertar no sirve: dos tablets leen las dos «lleva 0». Con el ordinal
    // dentro de un índice único, las dos calculan uso_n = 1 y la base acepta una sola.
    assert.match(esquema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_canje_cliente[\s\S]{0,160}uso_n/);
  });

  test("si el índice salta, el uso gastado se devuelve", () => {
    // Sin esto, dos camareros a la vez dejarían el cupón quemado sin que nadie lo disfrute.
    assert.match(server, /UPDATE pro_qr SET usos = usos - 1 WHERE id = \? AND usos > 0/);
  });

  test("y el reintento de la tablet no cuenta dos veces", () => {
    assert.match(server, /FROM pro_canjes WHERE idempotencia_key = \?/);
  });
});

describe("el kiosco sigue siendo para fichar", () => {
  test("un canje NUNCA se encola para subirlo luego", () => {
    // Los fichajes sí se encolan: perder uno es peor que retrasarlo. Un canje guardado para
    // subir después es un cupón que mientras tanto se gasta otra vez en la otra tablet.
    const canjear = kiosco.slice(kiosco.indexOf("function canjear("));
    const hasta = canjear.indexOf("function confirmacionCupon");
    assert.ok(hasta > 0, "no se encuentra el final de canjear()");
    assert.ok(!/encolar\(/.test(canjear.slice(0, hasta)), "el canje no puede pasar por la cola");
  });

  test("la cámara se apaga al volver al inicio", () => {
    // Es una pantalla pública en la barra. Un vídeo encendido que nadie mira no puede quedarse.
    const volver = kiosco.slice(kiosco.indexOf("function volverAlInicio("));
    assert.match(volver.slice(0, 800), /pararCamara\(\)/);
  });

  test("validar un cupón pasa por el PIN, como fichar", () => {
    // El ticket que emite el PIN es la credencial: prueba que esta persona lo tecleó en esta
    // tablet. De ahí sale el nombre que queda grabado en el canje.
    assert.match(kiosco, /estado\.intencion === "cupon"/);
    assert.match(server, /ficLeerTicket\(req\.body\?\.ticket, disp\.id, Date\.now\(\)\)/);
  });
});

describe("el módulo de Promociones está enteramente cableado", () => {
  test("las rutas quedan bajo el permiso del módulo", () => {
    assert.match(server, /const PROMOS_ROLES = \["direccion", "marketing"\]/);
  });

  test("el panel conoce la vista y su icono", () => {
    assert.match(panel, /promos: loadPromos/);
    assert.match(panel, /\["promos", "Promociones", "ticket"/);
    assert.match(panel, /ticket: '</, "el icono del menú tiene que existir");
  });

  test("emitir no es escribir: se respeta la baja de marketing", () => {
    // A quien pidió que no le escribiéramos se le puede emitir un QR —puede haberlo pedido en
    // la barra— pero no se le manda. Saltárselo aquí sería colar publicidad por detrás.
    const envio = server.slice(server.indexOf("async function proEnviarWA"));
    assert.match(envio.slice(0, 900), /baja\) === 1/);
  });
});
