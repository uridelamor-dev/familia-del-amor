import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { proponerConciliacion, buscarCombinacion, resumenConciliacion, estadoConciliada } from "../../src/modules/facturas/conciliacion.js";

const P = { proveedor: "Grau Distribucions", nif: "B17972860" };
const alb = (total, fecha, n) => ({ ...P, id: n, tipo: "albaran", numero_factura: "ALB-" + n, fecha, total });
const FAC = { ...P, id: 100, tipo: "factura", numero_factura: "F-1", fecha: "2026-07-31", total: 1240 };

describe("el caso normal: una factura que agrupa varios albaranes", () => {
  const albaranes = [alb(400, "2026-07-05", 1), alb(500, "2026-07-12", 2), alb(340, "2026-07-25", 3)];
  const r = proponerConciliacion(FAC, albaranes);
  test("encuentra los tres que suman el total", () => {
    assert.equal(r.estado, "cuadra");
    assert.deepEqual(r.albaranes.map((a) => a.id).sort(), [1, 2, 3]);
  });
  test("y lo dice en palabras", () => {
    assert.match(r.motivos.join(" "), /suman exactamente el total/);
  });
});

describe("cuando NO cuadra, que es lo que interesa ver", () => {
  test("falta un albarán: los que hay suman menos que la factura", () => {
    const r = proponerConciliacion(FAC, [alb(400, "2026-07-05", 1), alb(500, "2026-07-12", 2)]);
    assert.equal(r.estado, "parcial");
    assert.equal(r.diferencia, -340);
    assert.match(r.motivos.join(" "), /340\.00 € MENOS/);
  });
  test("la factura cobra de menos: los albaranes suman más", () => {
    const r = proponerConciliacion({ ...FAC, total: 900 },
      [alb(400, "2026-07-05", 1), alb(500, "2026-07-12", 2), alb(340, "2026-07-25", 3)]);
    // 400+500 = 900 cuadra exacto, así que se propone eso y sobra uno.
    assert.equal(r.estado, "cuadra");
    assert.match(r.motivos.join(" "), /quedan 1 sin usar/);
  });
  test("sin albaranes del proveedor no es un error: hay quien no los deja", () => {
    const r = proponerConciliacion(FAC, [{ proveedor: "Otro", nif: "B1", tipo: "albaran", fecha: "2026-07-10", total: 400 }]);
    assert.equal(r.estado, "sin-albaranes");
  });
});

describe("qué albaranes se consideran suyos", () => {
  test("los de OTRO proveedor no entran, aunque cuadren de importe", () => {
    const r = proponerConciliacion(FAC, [{ proveedor: "Damm", nif: "B99", tipo: "albaran", fecha: "2026-07-10", total: 1240 }]);
    assert.equal(r.estado, "sin-albaranes");
  });
  test("el albarán va ANTES de la factura, no meses después", () => {
    const r = proponerConciliacion(FAC, [alb(1240, "2026-10-01", 9)]);
    assert.equal(r.estado, "sin-albaranes", "octubre es posterior: esa entrega no la factura julio");
  });
  test("pero se admiten unos días después: la factura se cierra antes de la última entrega", () => {
    const r = proponerConciliacion(FAC, [alb(1240, "2026-08-02", 9)]);
    assert.equal(r.estado, "cuadra");
  });
  test("y no se va más allá de la ventana", () => {
    const r = proponerConciliacion(FAC, [alb(1240, "2026-01-15", 9)]);
    assert.equal(r.estado, "sin-albaranes");
  });
});

describe("buscar la combinación", () => {
  test("prefiere la que usa MENOS albaranes: es más creíble", () => {
    // 600 se puede formar con [600] o con [200+400].
    const r = buscarCombinacion([{ total: 200 }, { total: 400 }, { total: 600 }], 60000);
    assert.equal(r.indices.length, 1);
    assert.deepEqual(r.indices, [2]);
  });
  test("aguanta los céntimos sin arrastrar restos", () => {
    const r = buscarCombinacion([{ total: 33.33 }, { total: 33.33 }, { total: 33.34 }], 10000);
    assert.equal(r.dif, 0, "33,33 + 33,33 + 33,34 = 100,00 exacto");
  });
  test("si no hay ninguna, lo dice en vez de inventarse una", () => {
    const r = buscarCombinacion([{ total: 10 }, { total: 20 }], 100000);
    assert.equal(r.indices.length, 0);
  });
  test("con demasiadas combinaciones avisa de que no las ha probado todas", () => {
    // «No la he encontrado» y «no existe» no son lo mismo.
    const muchos = Array.from({ length: 40 }, (_, i) => ({ total: 100 + i * 0.07 }));
    const r = buscarCombinacion(muchos, 999999, { maxCombinacion: 12 });
    assert.equal(r.indices.length, 0);
    assert.equal(r.acotado, true);
  });
});

describe("el resumen de la pantalla", () => {
  test("cuenta cada estado y el dinero que hay en juego", () => {
    const r = resumenConciliacion([
      { estado: "cuadra", factura: { total: 100 } },
      { estado: "parcial", factura: { total: 250 } },
      { estado: "parcial", factura: { total: 50 } },
      { estado: "sin-albaranes", factura: { total: 900 } },
    ]);
    assert.equal(r.cuadran, 1);
    assert.equal(r.parciales, 2);
    assert.equal(r.sinAlbaranes, 1);
    assert.equal(r.importeParcial, 300, "lo que hay por revisar");
  });
});

describe("un albarán no es gasto: no puede sumar dos veces", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const dash = readFileSync(new URL("../../src/modules/dashboard/dashboard.service.js", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("hay una sola definición de «esto no es un albarán»", () => {
    assert.match(server, /const SIN_ALBARANES = "COALESCE\(tipo,'factura'\) <> 'albaran'"/);
  });

  test("las cifras de Compras lo excluyen", () => {
    const i = server.indexOf("count(*) FILTER (WHERE ${SIN_ALBARANES})::int AS docs");
    assert.notEqual(i, -1, "los totales tienen que filtrar los albaranes");
  });

  test("y los declaran, en vez de esconderlos", () => {
    // Un número que no cuadra con la tabla de debajo es peor que un número grande.
    assert.match(server, /AS albaranes,/);
    // El aviso es ahora un chip («3 albaranes · 810 €») en vez de una frase larga encima de
    // la tabla, pero sigue diciendo cuántos son, cuánto valen y por qué no suman.
    assert.match(panel, /<b>\$\{num\(t\.albaranes\)\}<\/b> \$\{t\.albaranes === 1 \? "albarán" : "albaranes"\}/);
    assert.match(panel, /No suman: son la entrega, no el pago/);
  });

  test("el dashboard también los excluye, en TODAS sus consultas de dinero", () => {
    const sumas = (dash.match(/FROM facturas WHERE/g) || []).length;
    const filtradas = (dash.match(/FROM facturas WHERE COALESCE\(tipo,'factura'\) <> 'albaran' AND/g) || []).length;
    assert.equal(filtradas, sumas, `${sumas - filtradas} consultas del dashboard siguen sumando albaranes`);
  });

  test("y los gráficos del año", () => {
    const i = server.indexOf("const andLocal = local");
    const bloque = server.slice(i, i + 2200);
    const total = (bloque.match(/TO_CHAR\(fecha::date, 'YYYY'\) = \?/g) || []).length;
    const conFiltro = (bloque.match(/\$\{SIN_ALBARANES\} AND TO_CHAR\(fecha::date, 'YYYY'\) = \?/g) || []).length;
    assert.equal(conFiltro, total, "alguna consulta anual sigue contando albaranes");
  });

  test("pero el albarán SÍ se sigue viendo en la lista", () => {
    // Excluirlo del dinero no es esconderlo: hay que poder verlo y conciliarlo.
    const i = server.indexOf('app.get("/api/facturas", requireAuth');
    const bloque = server.slice(i, i + 700);
    assert.ok(!/SIN_ALBARANES/.test(bloque.split("const t = await")[0]),
      "la consulta de la LISTA no debe filtrar por tipo");
  });
});

describe("conciliar a medias: lo que ya ha llegado cuenta", () => {
  const F100 = { ...P, id: 50, tipo: "factura", fecha: "2026-07-31", total: 100 };
  test("una factura de 100 con un albarán de 40 queda a medias, con 60 esperando", () => {
    const r = estadoConciliada(F100, [alb(40, "2026-07-10", 1)]);
    assert.equal(r.estado, "conciliada-parcial");
    assert.equal(r.ligado, 40);
    assert.equal(r.falta, 60);
  });
  test("cuando llega el resto, pasa a conciliada del todo", () => {
    const r = estadoConciliada(F100, [alb(40, "2026-07-10", 1), alb(60, "2026-07-20", 2)]);
    assert.equal(r.estado, "conciliada");
    assert.equal(r.falta, 0);
  });
  test("un céntimo de diferencia no la deja a medias", () => {
    assert.equal(estadoConciliada(F100, [alb(99.99, "2026-07-10", 1)]).estado, "conciliada");
  });
  test("si se ligan de más, también se dice: falta en negativo", () => {
    const r = estadoConciliada(F100, [alb(140, "2026-07-10", 1)]);
    assert.equal(r.estado, "conciliada-parcial");
    assert.equal(r.falta, -40);
  });
  test("el resumen cuenta aparte lo que está a medias y lo que aún falta", () => {
    const r = resumenConciliacion([
      { estado: "conciliada", factura: { total: 100 } },
      { estado: "conciliada-parcial", factura: { total: 100 }, falta: 60 },
      { estado: "parcial", factura: { total: 250 } },
    ]);
    assert.equal(r.cuadran, 1);
    assert.equal(r.aMedias, 1);
    assert.equal(r.importeAMedias, 60, "lo que se sigue esperando, no el total de la factura");
    assert.equal(r.parciales, 1);
  });
});
