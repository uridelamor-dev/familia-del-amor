import test from "node:test";
import assert from "node:assert/strict";
import {
  CODIGO_LARGO, generarCodigo, tel9, normalizarEntrada, localEnLista,
  estadoDe, textoEstado, esCanjeable, fechaBonita, sanearPromocion, dondeVale,
  SQL_CANJEAR, SQL_CANJES_CLIENTE,
} from "../../src/modules/promos/promos.js";

// Bytes previsibles para no depender de crypto.
const bytesFijos = (lista) => { let i = 0; return (n) => Array.from({ length: n }, () => lista[i++ % lista.length]); };

test("generarCodigo saca ocho dígitos", () => {
  const c = generarCodigo(bytesFijos([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  assert.equal(c.length, CODIGO_LARGO);
  assert.match(c, /^\d{8}$/);
});

test("generarCodigo descarta los bytes que sesgarían el dígito", () => {
  // 250 y 255 se rechazan; 251-254 también. Solo deberían contar los que quedan.
  const c = generarCodigo(bytesFijos([250, 255, 7, 253, 3]));
  assert.match(c, /^[73]{8}$/);
});

test("generarCodigo no se queda corto aunque haya que pedir más bytes", () => {
  // Casi todo se rechaza: obliga a dar más de una vuelta al bucle.
  const c = generarCodigo(bytesFijos([250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 4]));
  assert.equal(c.length, CODIGO_LARGO);
});

test("tel9 iguala los formatos con los que la gente escribe su teléfono", () => {
  assert.equal(tel9("+34 600 11 22 33"), "600112233");
  assert.equal(tel9("600112233"), "600112233");
  assert.equal(tel9("0034-600-112-233"), "600112233");
  assert.equal(tel9(""), "");
  assert.equal(tel9(null), "");
});

test("normalizarEntrada saca el token de la URL que escupe el escáner", () => {
  const t = "aB3-_x".padEnd(43, "z");
  assert.deepEqual(normalizarEntrada(`https://familiadelamor.org/cupon.html?t=${t}`), { tipo: "token", valor: t });
  assert.deepEqual(normalizarEntrada(`https://x.org/cupon.html?foo=1&t=${t}`), { tipo: "token", valor: t });
});

test("normalizarEntrada acepta el token pegado a mano", () => {
  const t = "a".repeat(43);
  assert.deepEqual(normalizarEntrada(t), { tipo: "token", valor: t });
  assert.deepEqual(normalizarEntrada(`  ${t}  `), { tipo: "token", valor: t });
});

test("normalizarEntrada acepta el código tecleado con y sin espacios", () => {
  assert.deepEqual(normalizarEntrada("12345678"), { tipo: "codigo", valor: "12345678" });
  assert.deepEqual(normalizarEntrada("1234 5678"), { tipo: "codigo", valor: "12345678" });
  assert.deepEqual(normalizarEntrada("1234-5678"), { tipo: "codigo", valor: "12345678" });
});

test("normalizarEntrada rechaza lo que no es nuestro sin reventar", () => {
  // El QR de otro comercio, el wifi del bar, una lata de refresco, un descuido.
  assert.equal(normalizarEntrada("WIFI:S:LaTapeta;T:WPA;P:12345678;;"), null);
  assert.equal(normalizarEntrada("https://otracosa.com/promo/1234"), null);
  assert.equal(normalizarEntrada("mailto:hola@x.com"), null);
  assert.equal(normalizarEntrada("8412345678905"), null);   // un código de barras EAN
  assert.equal(normalizarEntrada("1234567"), null);          // un dígito de menos
  assert.equal(normalizarEntrada("123456789"), null);        // uno de más
  assert.equal(normalizarEntrada(""), null);
  assert.equal(normalizarEntrada(null), null);
  assert.equal(normalizarEntrada("corto"), null);
});

test("localEnLista: la lista vacía vale en todas las barras", () => {
  assert.equal(localEnLista("Blanes", ""), true);
  assert.equal(localEnLista("", ""), true);
  assert.equal(localEnLista("Blanes", "Blanes,Lloret"), true);
  assert.equal(localEnLista("blanes", "Blanes"), true);
  assert.equal(localEnLista("Lloret", "Blanes"), false);
});

// ── estadoDe: la matriz completa ─────────────────────────────────────────────
const HOY = "2026-09-01";
const cupon = (extra = {}) => ({ clase: "cupon", usos: 0, usos_max: 1, anulado_en: null, caduca_en: null, ...extra });
const promo = (extra = {}) => ({ nombre: "2x1", activa: true, locales: "", desde: null, hasta: null, usos_por_cliente: 1, ...extra });

test("estadoDe: un cupón recién emitido vale", () => {
  assert.equal(estadoDe(cupon(), promo(), { hoy: HOY, local: "Blanes" }), "valido");
  assert.equal(esCanjeable("valido"), true);
});

test("estadoDe: sin QR o sin promoción detrás, no existe", () => {
  assert.equal(estadoDe(null, promo(), { hoy: HOY }), "no_existe");
  assert.equal(estadoDe(cupon(), null, { hoy: HOY }), "no_existe");
});

test("estadoDe: anulado gana a todo lo demás", () => {
  const q = cupon({ anulado_en: "2026-08-01", usos: 5, caduca_en: "2020-01-01" });
  assert.equal(estadoDe(q, promo({ activa: false }), { hoy: HOY }), "anulado");
});

test("estadoDe: promoción desactivada, fuera de fechas y fuera de local", () => {
  assert.equal(estadoDe(cupon(), promo({ activa: false }), { hoy: HOY }), "promo_inactiva");
  assert.equal(estadoDe(cupon(), promo({ desde: "2026-10-01" }), { hoy: HOY }), "fuera_de_fechas");
  assert.equal(estadoDe(cupon(), promo({ hasta: "2026-08-31" }), { hoy: HOY }), "fuera_de_fechas");
  assert.equal(estadoDe(cupon(), promo({ hasta: "2026-09-01" }), { hoy: HOY }), "valido");  // el último día cuenta
  assert.equal(estadoDe(cupon(), promo({ locales: "Blanes" }), { hoy: HOY, local: "Lloret" }), "fuera_de_local");
});

test("estadoDe: sin local no se comprueba el local", () => {
  // Es el caso de la página que el cliente abre en su móvil: allí no se sabe en qué barra
  // lo va a canjear, y decirle «no vale» sería mentira.
  assert.equal(estadoDe(cupon(), promo({ locales: "Blanes" }), { hoy: HOY }), "valido");
});

test("estadoDe: caducado y agotado", () => {
  assert.equal(estadoDe(cupon({ caduca_en: "2026-08-31" }), promo(), { hoy: HOY }), "caducado");
  assert.equal(estadoDe(cupon({ caduca_en: "2026-09-01" }), promo(), { hoy: HOY }), "valido");
  assert.equal(estadoDe(cupon({ usos: 1, usos_max: 1 }), promo(), { hoy: HOY }), "agotado");
  assert.equal(estadoDe(cupon({ usos: 1, usos_max: 3 }), promo(), { hoy: HOY }), "valido");
});

test("estadoDe: el límite es por PERSONA, no por QR", () => {
  // Este es el agujero que cierra `canjesCliente`: a la misma persona le llegan dos cupones
  // de la misma promoción —uno por campaña y otro emitido a mano desde Marketing— y los dos
  // están sin usar. Mirando solo `usos` los dos valdrían.
  const segundoCupon = cupon({ usos: 0 });
  assert.equal(estadoDe(segundoCupon, promo({ usos_por_cliente: 1 }), { hoy: HOY, canjesCliente: 1 }), "limite_cliente");
  assert.equal(estadoDe(segundoCupon, promo({ usos_por_cliente: 2 }), { hoy: HOY, canjesCliente: 1 }), "valido");
  assert.equal(estadoDe(segundoCupon, promo({ usos_por_cliente: 0 }), { hoy: HOY, canjesCliente: 9 }), "valido"); // 0 = sin límite
});

test("estadoDe: el carné no caduca, no se agota y no necesita promoción", () => {
  const carnet = { clase: "carnet", usos: 47, usos_max: 0, anulado_en: null, caduca_en: null };
  assert.equal(estadoDe(carnet, null, { hoy: HOY, local: "Blanes" }), "valido");
  assert.equal(estadoDe({ ...carnet, anulado_en: "2026-08-01" }, null, { hoy: HOY }), "anulado");
});

// ── Dónde vale, dicho para el cliente ────────────────────────────────────────
test("dondeVale: sin locales, vale en todos", () => {
  assert.equal(dondeVale(""), "Válido en cualquiera de nuestros locales.");
  assert.equal(dondeVale(null), "Válido en cualquiera de nuestros locales.");
  assert.equal(dondeVale("  ,  "), "Válido en cualquiera de nuestros locales.");
});

test("dondeVale: con un solo local, se nombra ese y solo ese", () => {
  assert.equal(dondeVale("La Tapeta - Blanes"), "Válido en La Tapeta - Blanes.");
});

test("dondeVale: con varios, se enumeran bien", () => {
  assert.equal(dondeVale("La Tapeta - Blanes,La Tapeta - Lloret"),
    "Válido en La Tapeta - Blanes y La Tapeta - Lloret.");
  assert.equal(dondeVale("A,B,C"), "Válido en A, B y C.");
});

test("dondeVale aguanta espacios sobrantes y comas de más", () => {
  assert.equal(dondeVale(" A , , B "), "Válido en A y B.");
});

test("dondeVale nunca dice que vale en todos si está limitada", () => {
  // Este es el fallo que la función existe para evitar: la frase se calculaba a mano en la
  // descripción y se quedaba diciendo «en todos los locales» al limitar la promoción.
  const t = dondeVale("La Tapeta - Blanes");
  assert.ok(!/cualquiera|todos/i.test(t), t);
});

// ── Las frases que se leen en la barra ───────────────────────────────────────
test("textoEstado dice CUÁNDO se usó, no solo que no vale", () => {
  const t = textoEstado("agotado", { ultimoCanje: { canjeado_en: "2026-09-03T21:40:00+02:00" } });
  assert.match(t, /3 de septiembre/);
  assert.match(t, /21:40/);
});

test("textoEstado dice hasta cuándo valía y dónde vale", () => {
  assert.match(textoEstado("caducado", { qr: { caduca_en: "2026-08-30" } }), /30 de agosto/);
  assert.match(textoEstado("fuera_de_fechas", { promo: { hasta: "2026-08-30" } }), /30 de agosto/);
  assert.match(textoEstado("fuera_de_local", { promo: { locales: "Blanes" } }), /Blanes/);
});

test("textoEstado siempre devuelve algo legible", () => {
  for (const e of ["valido", "no_existe", "anulado", "caducado", "agotado", "limite_cliente",
                   "promo_inactiva", "fuera_de_fechas", "fuera_de_local", "loquesea"]) {
    const t = textoEstado(e, { promo: { nombre: "2x1 en tapas" } });
    assert.equal(typeof t, "string");
    assert.ok(t.length > 3, `«${e}» se queda sin frase`);
  }
});

test("fechaBonita aguanta lo que no es una fecha", () => {
  assert.equal(fechaBonita(""), "");
  assert.equal(fechaBonita(null), "");
  assert.equal(fechaBonita("vete a saber"), "");
});

// ── Saneado ──────────────────────────────────────────────────────────────────
test("sanearPromocion exige nombre y lo dice", () => {
  const { promocion, descartados } = sanearPromocion({ nombre: "  " }, { locales: ["Blanes"] });
  assert.equal(promocion.nombre, "");
  assert.ok(descartados.some((d) => d.campo === "nombre"));
});

test("sanearPromocion filtra los locales que no existen y avisa", () => {
  const { promocion, descartados } = sanearPromocion(
    { nombre: "2x1", locales: "blanes, Marte" }, { locales: ["Blanes", "Lloret"] });
  assert.equal(promocion.locales, "Blanes");   // se guarda con la grafía buena
  assert.ok(descartados.some((d) => d.campo === "locales" && d.valor === "Marte"));
});

test("sanearPromocion no guarda una promoción que termina antes de empezar", () => {
  const { promocion, descartados } = sanearPromocion(
    { nombre: "2x1", desde: "2026-09-10", hasta: "2026-09-01" }, {});
  assert.equal(promocion.hasta, null);
  assert.ok(descartados.some((d) => d.campo === "hasta"));
});

test("sanearPromocion rechaza fechas con formato raro", () => {
  const { promocion, descartados } = sanearPromocion({ nombre: "2x1", desde: "01/09/2026" }, {});
  assert.equal(promocion.desde, null);
  assert.ok(descartados.some((d) => d.campo === "desde"));
});

test("sanearPromocion acota los usos por cliente y cae en 1 por defecto", () => {
  assert.equal(sanearPromocion({ nombre: "a" }, {}).promocion.usos_por_cliente, 1);
  assert.equal(sanearPromocion({ nombre: "a", usos_por_cliente: 0 }, {}).promocion.usos_por_cliente, 0);
  assert.equal(sanearPromocion({ nombre: "a", usos_por_cliente: 3 }, {}).promocion.usos_por_cliente, 3);
  const { promocion, descartados } = sanearPromocion({ nombre: "a", usos_por_cliente: 500 }, {});
  assert.equal(promocion.usos_por_cliente, 1);
  assert.ok(descartados.some((d) => d.campo === "usos_por_cliente"));
});

test("sanearPromocion recorta los textos largos", () => {
  const { promocion } = sanearPromocion({ nombre: "x".repeat(200), descripcion: "y".repeat(999) }, {});
  assert.equal(promocion.nombre.length, 80);
  assert.equal(promocion.descripcion.length, 300);
});

// ── El SQL del canje ─────────────────────────────────────────────────────────
test("SQL_CANJEAR filtra dentro del propio UPDATE, sin SELECT previo", () => {
  // Si alguien lo parte en «mira si queda» + «réstalo», dos tablets canjean el mismo cupón.
  assert.match(SQL_CANJEAR, /UPDATE pro_qr SET usos = usos \+ 1/);
  assert.match(SQL_CANJEAR, /usos_max = 0 OR usos < usos_max/);
  assert.match(SQL_CANJEAR, /anulado_en IS NULL/);
  assert.match(SQL_CANJEAR, /RETURNING/);
});

test("SQL_CANJES_CLIENTE cuenta por promoción y teléfono", () => {
  assert.match(SQL_CANJES_CLIENTE, /FROM pro_canjes/);
  assert.match(SQL_CANJES_CLIENTE, /promocion_id = \? AND telefono = \?/);
});
