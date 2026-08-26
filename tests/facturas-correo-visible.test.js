import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// LO QUE PASÓ: Drive subía las facturas correctamente y unas que llegaron por correo no se
// ordenaron nunca. La pantalla decía «No se ha podido comprobar» en tres filas a la vez y ahí
// se acababa la información. Dos fallos distintos detrás, y los dos invisibles.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const bloque = (desde, hasta) => {
  const i = server.indexOf(desde);
  assert.ok(i > 0, `no se encuentra: ${desde}`);
  const f = server.indexOf(hasta, i + desde.length);
  assert.ok(f > i, `no se encuentra el final: ${hasta}`);
  return server.slice(i, f);
};

describe("el estado que nunca dijo la verdad", () => {
  test("los dos endpoints devuelven `data`, que es lo que el panel lee", () => {
    // `apiOptional` hace `return j.ok ? j.data : null`, y estos dos endpoints nunca lo
    // devolvían: el panel recibía `undefined` y lo pintaba como «No se ha podido comprobar».
    // Con Drive funcionando. Todos los días.
    for (const ruta of ['app.get("/api/facturas/status"', 'app.get("/api/facturas/gmail-status"']) {
      const b = server.slice(server.indexOf(ruta), server.indexOf(ruta) + 2600);
      assert.match(b, /res\.json\(\{ \.\.\.out, data: \{ \.\.\.out \} \}\)/, `${ruta} no devuelve data`);
    }
  });

  test("y los campos siguen en la raíz, que es como los lee el panel viejo", () => {
    // `public/direccion.js` los lee con `authFetch` y `data.conectado`. Mover todo dentro de
    // `data` habría arreglado una pantalla rompiendo otra.
    const viejo = readFileSync(new URL("../public/direccion.js", import.meta.url), "utf8");
    assert.match(viejo, /facturas\/status[\s\S]{0,200}data\.conectado/);
  });

  test("un fallo de una consulta ya no tumba la tarjeta entera", () => {
    // Sin red, cualquier error devolvía un 500 y el panel se quedaba sin saber NADA: ni si
    // Drive estaba conectado, ni cuántas facturas faltaban por volcar.
    const b = bloque('app.get("/api/facturas/status"', "app.get(\"/api/facturas/drive-diagnostico\"");
    assert.ok((b.match(/try \{/g) || []).length >= 3, "cada dato tiene que ir por su cuenta");
    assert.match(b, /avisos/, "y lo que no se ha podido leer se dice");
  });

  test("y lo que no se pudo leer se enseña, con su motivo", () => {
    assert.match(app, /const avisosDe = \(o\)/);
    assert.match(app, /\$\{avisosDe\(drv\)\}/);
  });
});

describe("el correo deja rastro, como ya hacía Reseñas", () => {
  const poll = bloque("async function pollGmail(", 'app.get("/auth/google-facturas"');

  test("NUNCA MÁS busca «sin leer»", () => {
    // Ahí estaba el fallo de verdad: abrir el correo en el móvil antes de que pasara el turno
    // —cada cinco minutos— dejaba esa factura fuera para siempre. Sin reintento y sin avisar.
    assert.ok(!/is:unread/.test(poll), "vuelve a depender de que el correo esté sin leer");
    assert.match(poll, /consultaGmail\(dias\)/);
  });

  test("la memoria de lo ya hecho es la tabla, que es donde tiene que estar", () => {
    assert.match(poll, /SELECT id FROM facturas_emails_procesados WHERE gmail_id = \?/);
    assert.match(poll, /INSERT INTO facturas_emails_procesados[\s\S]{0,200}ON CONFLICT\(gmail_id\) DO NOTHING/);
  });

  test("anota SIEMPRE: salga bien, no haya nada o falle Google", () => {
    // Un intento que no deja rastro es indistinguible de un intento que no ocurrió.
    assert.match(poll, /const anotar = async \(error\)/);
    assert.ok((poll.match(/await anotar\(/g) || []).length >= 4, "hay salidas sin anotar");
    assert.match(poll, /if \(procesadosTotal > 0\) await setConfig\(GM\.ok, marca\)/);
  });

  test("el error se guarda EN CRISTIANO, no el JSON de Google", () => {
    assert.match(poll, /explicarError\(/);
    const st = bloque('app.get("/api/facturas/gmail-status"', 'app.post("/api/facturas/gmail-poll"');
    assert.match(st, /resumirGmail\(\{ conectado: out\.conectado, cfg, procesadosEnBase: total \}\)/);
  });

  test("y las reglas de qué decir viven en un módulo puro, no en el endpoint", () => {
    const st = bloque('app.get("/api/facturas/gmail-status"', 'app.post("/api/facturas/gmail-poll"');
    assert.ok(!/permiso para leer el correo|Conectar Google/.test(st), "el texto se ha escrito en el endpoint");
  });
});

describe("mirar el buzón ahora, sin esperar cinco minutos", () => {
  test("hay endpoint y botón", () => {
    assert.match(server, /app\.post\("\/api\/facturas\/gmail-poll", requireAuth\(\["direccion", "contabilidad"\]\)/);
    assert.match(app, /data-act="fac-gmail-ahora"/);
    assert.match(app, /act === "fac-gmail-ahora"\) facGmailAhora\(t\)/);
  });

  test("dice lo que ha encontrado, incluido cuando no era nada", () => {
    const ep = bloque('app.post("/api/facturas/gmail-poll"', "// ── Estadísticas y Modelo 303");
    assert.match(ep, /facturas nuevas/);
    assert.match(ep, /ninguno traía una factura/);
    assert.match(ep, /no había nada nuevo/);
  });

  test("y el motivo del fallo se enseña ENTERO, en un cuadro que hay que cerrar", () => {
    // «Vuelve a conectar Google» en un aviso que se va solo en dos segundos es un dato que se
    // pierde. Es justo el que se tarda semanas en descubrir.
    const fn = app.slice(app.indexOf("async function facGmailAhora("), app.indexOf("async function facMigrar()"));
    assert.match(fn, /confirmModal\(e\.message/);
    assert.match(fn, /loadFacturas\(\)/);
  });

  test("el rango que se pide va acotado: ni 0 días ni el buzón entero", () => {
    const ep = bloque('app.post("/api/facturas/gmail-poll"', "// ── Estadísticas y Modelo 303");
    assert.match(ep, /Math\.min\(60, Math\.max\(1, Number\(req\.body\?\.dias\) \|\| GM_DIAS\)\)/);
  });
});

describe("la pantalla cuenta lo que pasa con el correo", () => {
  test("la frase, la última mirada y la última factura que entró", () => {
    assert.match(app, /gm && gm\.estado \? esc\(gm\.estado\.detalle\)/);
    assert.match(app, /Última mirada al buzón/);
    assert.match(app, /última factura que entró/);
    assert.match(app, /se mira solo cada 5 minutos/);
  });

  test("y el color del estado sale del módulo, no de un `if` en el panel", () => {
    assert.match(app, /<span class="pill \$\{gm\.estado\.nivel\}">\$\{esc\(gm\.estado\.titulo\)\}<\/span>/);
  });
});

describe("el detalle se repasa solo, sin que nadie lo pulse", () => {
  test("NO es un temporizador de días: se pregunta cada poco contra una marca guardada", () => {
    // En Replit el proceso se reinicia a menudo. Un `setInterval` de seis horas —o de una
    // semana— no llega a dispararse nunca, porque la cuenta vuelve a cero en cada arranque.
    assert.match(server, /setInterval\(repasoLineasSiToca, 30 \* 60 \* 1000\)/);
    assert.match(server, /tocaRepasar\(\{ ultimo, ahora: new Date\(\)\.toISOString\(\), cadaHoras: REL_HORAS \}\)/);
    assert.ok(!/setInterval\(repasoLineasSiToca, \d+ \* 60 \* 60 \* 1000\)/.test(server), "vuelve a ser un temporizador de horas");
  });

  test("la marca se escribe ANTES de leer nada", () => {
    // Si el proceso se cae a mitad del repaso, el siguiente arranque no puede volver a empezar
    // de cero y encadenar tandas sin freno.
    const fn = server.slice(server.indexOf("async function repasoLineasSiToca()"), server.indexOf("app.get(\"/api/facturas/repaso\""));
    const iMarca = fn.indexOf(`setConfig(REL.ultimo`);
    const iLeer = fn.indexOf("await releerTanda(");
    assert.ok(iMarca > 0 && iLeer > iMarca, "se lee antes de anotar que se ha empezado");
  });

  test("no pisa una relectura que esté haciendo alguien a mano", () => {
    const fn = server.slice(server.indexOf("async function repasoLineasSiToca()"), server.indexOf("app.get(\"/api/facturas/repaso\""));
    assert.match(fn, /if \(_releyendo\) return;/);
  });

  test("el botón y el repaso automático hacen EXACTAMENTE lo mismo", () => {
    // Si fueran dos funciones, una acabaría teniendo una regla que la otra no.
    assert.match(server, /async function releerTanda\(/);
    assert.match(server, /const r = await releerTanda\(\{ tanda: Number\(req\.body\?\.tanda\) \|\| 15, scope: localScope\(req\) \}\)/);
    assert.match(server, /const r = await releerTanda\(\{ tanda: REL_TANDA \}\)/);
  });

  test("un fallo pasajero ya NO marca la factura como ilegible para siempre", () => {
    // Si la IA estaba saturada dos minutos, esa factura se quedaba sin detalle el resto de su
    // vida. La decisión vive en el módulo puro, no en un `if` dentro del endpoint.
    const fn = server.slice(server.indexOf("async function releerTanda("), server.indexOf("app.post(\"/api/facturas/lineas/releer\""));
    assert.match(fn, /estadoTrasFallo\(\{ motivo: e\.message, intentos: f\.intentos \}\)/);
    assert.ok(!/lineas_estado = 'no_leible'/.test(fn), "vuelve a rendirse a la primera");
    assert.match(fn, /lineas_intentos = \?/);
  });

  test("y las que ya fallaron no se llevan la cabeza de cada tanda", () => {
    // Si no, una factura que falla siempre bloquearía el avance de todas las demás.
    const fn = server.slice(server.indexOf("async function releerTanda("), server.indexOf("app.post(\"/api/facturas/lineas/releer\""));
    assert.match(fn, /ORDER BY COALESCE\(lineas_intentos,0\) ASC/);
  });

  test("y en pantalla se dice cuándo fue y qué queda", () => {
    assert.match(app, /Se relee solo lo que se quedó sin leer|drv\.relectura\.texto/);
    assert.match(app, /se repasa solo cada \$\{num\(drv\.relectura\.cadaHoras/);
  });
});
