import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fusionarDashboards, fusionarPeriodo, etiquetaLocales, nombreCorto } from "../../src/modules/dashboard/fusion.js";
import { localesPermitidos } from "../../src/modules/usuarios/locales.js";

// Un dashboard de UN local, con lo justo para probar cada regla de suma.
const parte = (local, o = {}) => ({
  fecha: "2026-08-11", ayerFecha: "2026-08-10", scope: { local },
  titular: "…",
  ayer: { disponible: true, texto: "…", reservas: o.ayerRes ?? 10, comensales: o.ayerCom ?? 25, delta: 5 },
  hoy: { disponible: true, texto: "…", hoy: { n: o.hoyRes ?? 4, personas: o.hoyCom ?? 9 }, prox7: { n: o.prox7 ?? 20, personas: 50 }, alerta: false },
  preocupaciones: o.preocupaciones || [],
  agenda: [], decisionSara: null, radarLocales: [],
  dinero: {
    porPagar: { total: o.porPagar ?? 1000, n: o.porPagarN ?? 3 },
    acreedores: o.acreedores || [{ proveedor: "Grau", total: 600, n: 2 }],
    masAntigua: o.masAntigua ?? { proveedor: "Grau", total: 300, fecha: "2026-05-01", dias: 100 },
    // OJO: esta lista viene ENTERA (todos los locales) en cada respuesta.
    gastoLocal: [{ local: "La Tapeta - Lloret", actual: 5000, prev: 4000, delta: 25 },
                 { local: "La Tapeta - Girona", actual: 3000, prev: 3000, delta: 0 }],
    sinFuente: { disponible: false },
  },
  equipo: {
    incidencias: o.incidencias || [],
    checkins: { plantilla: o.plantilla ?? 10, hechos: 7, mes: "2026-08" },   // `hechos` es GLOBAL
    sinFuente: { disponible: false },
  },
  clientes: { enfriando: o.enfriando || [], mejores: [] },
  reputacionLocales: [{ local: "La Tapeta Lloret", media: 4.2, n: 30 }],
  resenas: { media: 4.3, total: 120, sinResponder: 9 },                       // GLOBAL
  serieReservas: o.serie || [{ dia: "2026-08-09", n: 2, personas: 5 }, { dia: "2026-08-10", n: 3, personas: 8 }],
  ventas: o.ventas ?? { disponible: true, total: 10000, dias: 30, porLocal: [{ local: "La Tapeta - Lloret", total: 10000 }, { local: "La Tapeta - Girona", total: 7000 }] },
  mantenimiento: { abiertas: o.abiertas ?? 2 },
  whatsapp: { connected: true },
});

const LLORET = "La Tapeta - Lloret", GIRONA = "La Tapeta - Girona";
const dos = (a = {}, b = {}) => fusionarDashboards([parte(LLORET, a), parte(GIRONA, b)], { locales: [LLORET, GIRONA] });

describe("lo que SÍ se suma (viene filtrado por local)", () => {
  test("las reservas de ayer y las de hoy", () => {
    const d = dos({ ayerRes: 10, ayerCom: 25, hoyRes: 4 }, { ayerRes: 6, ayerCom: 14, hoyRes: 3 });
    assert.equal(d.ayer.reservas, 16);
    assert.equal(d.ayer.comensales, 39);
    assert.equal(d.hoy.hoy.n, 7);
  });

  test("y se dice cuánto pone cada local, que es la pregunta siguiente", () => {
    const d = dos({ ayerRes: 10 }, { ayerRes: 6 });
    assert.match(d.ayer.texto, /10 en Lloret, 6 en Girona/);
    assert.match(d.ayer.texto, /tuvieron/, "dos locales, verbo en plural");
  });

  test("lo que se debe: importe, número de facturas y los acreedores por proveedor", () => {
    const d = dos(
      { porPagar: 1000, porPagarN: 3, acreedores: [{ proveedor: "Grau", total: 600, n: 2 }] },
      { porPagar: 500, porPagarN: 2, acreedores: [{ proveedor: "Grau", total: 400, n: 1 }, { proveedor: "Bo de Debò", total: 100, n: 1 }] });
    assert.equal(d.dinero.porPagar.total, 1500);
    assert.equal(d.dinero.porPagar.n, 5);
    const grau = d.dinero.acreedores.find((a) => a.proveedor === "Grau");
    assert.equal(grau.total, 1000, "el mismo proveedor en dos locales es una sola deuda");
    assert.equal(grau.n, 3);
  });

  test("la factura más antigua sin pagar es la más antigua de los dos, no la del primero", () => {
    const d = dos({ masAntigua: { proveedor: "A", fecha: "2026-06-01", total: 100, dias: 70 } },
                  { masAntigua: { proveedor: "B", fecha: "2026-03-01", total: 200, dias: 160 } });
    assert.equal(d.dinero.masAntigua.proveedor, "B");
  });

  test("las incidencias abiertas y la plantilla", () => {
    const d = dos({ abiertas: 2, plantilla: 10 }, { abiertas: 5, plantilla: 4 });
    assert.equal(d.mantenimiento.abiertas, 7);
    assert.equal(d.equipo.checkins.plantilla, 14);
  });

  test("la serie de reservas, día a día", () => {
    const d = dos({ serie: [{ dia: "2026-08-10", n: 3, personas: 8 }] },
                  { serie: [{ dia: "2026-08-10", n: 2, personas: 4 }, { dia: "2026-08-11", n: 1, personas: 2 }] });
    assert.deepEqual(d.serieReservas, [{ dia: "2026-08-10", n: 5, personas: 12 }, { dia: "2026-08-11", n: 1, personas: 2 }]);
  });
});

describe("lo que NO se suma (viene igual en las dos respuestas)", () => {
  test("las reseñas: sumarlas diría que hay el doble de las que hay", () => {
    const d = dos();
    assert.equal(d.resenas.total, 120);
    assert.equal(d.resenas.sinResponder, 9);
    assert.equal(d.resenas.media, 4.3, "y la media no se suma jamás");
  });

  test("las conversaciones del mes con el equipo se cuentan sin filtrar por local", () => {
    const d = dos({ plantilla: 10 }, { plantilla: 4 });
    assert.equal(d.equipo.checkins.hechos, 7, "las dos respuestas traen el mismo 7");
    assert.equal(d.equipo.checkins.plantilla, 14, "la plantilla sí es de cada local");
  });

  test("el gasto por local viene entero en cada respuesta: se coge SU fila, no se suma", () => {
    const d = dos();
    assert.deepEqual(d.dinero.gastoLocal.map((g) => g.local), [LLORET, GIRONA]);
    assert.equal(d.dinero.gastoLocal.find((g) => g.local === LLORET).actual, 5000,
      "5000 y no 10000: es la misma cifra repetida en las dos respuestas");
  });

  test("y solo salen los locales que se están mirando, no todos", () => {
    const solo = fusionarDashboards([parte(LLORET), parte(GIRONA)], { locales: [LLORET, GIRONA] });
    assert.ok(solo.dinero.gastoLocal.every((g) => [LLORET, GIRONA].includes(g.local)));
  });

  test("los días de ventas no se suman: 30 días en dos locales son los mismos 30 días", () => {
    const d = dos();
    assert.equal(d.ventas.total, 20000, "el dinero sí");
    assert.equal(d.ventas.dias, 30, "los días no");
  });
});

describe("lo que se rehace, porque no se puede sumar", () => {
  test("el titular sale de las preocupaciones ya juntas, y manda la más grave", () => {
    const d = dos(
      { preocupaciones: [{ sev: "info", tipo: "x", titulo: "Cosa menor de Lloret", decision: "d1" }] },
      { preocupaciones: [{ sev: "crit", tipo: "y", titulo: "Algo grave en Girona", decision: "d2" }] });
    assert.equal(d.preocupaciones[0].titulo, "Algo grave en Girona");
    assert.match(d.titular, /Si hoy solo haces una cosa/);
    assert.match(d.titular, /algo grave en Girona/);
    assert.equal(d.decisionSara, "d2");
  });

  test("la lista de preocupaciones se recorta: veinte urgencias no son urgencias", () => {
    const muchas = (p) => Array.from({ length: 6 }, (_, i) => ({ sev: "imp", tipo: "t", titulo: `${p}${i}`, decision: "d" }));
    const d = dos({ preocupaciones: muchas("A") }, { preocupaciones: muchas("B") });
    assert.equal(d.preocupaciones.length, 7);
  });

  test("el radar se arma con lo de cada local, que aquí sí se sabe cuál es cuál", () => {
    const d = dos({ hoyCom: 9, abiertas: 2 }, { hoyCom: 20, abiertas: 5 });
    assert.deepEqual(d.radarLocales.map((r) => r.local), [GIRONA, LLORET], "primero el que más incidencias tiene");
    assert.equal(d.radarLocales[0].incidenciasAbiertas, 5);
    assert.equal(d.radarLocales[0].hoyPersonas, 20);
    assert.equal(d.radarLocales[0].gastoMes, 3000);
  });

  test("el ámbito queda escrito: qué locales y con qué nombre se llaman", () => {
    const d = dos();
    assert.deepEqual(d.scope.locales, [LLORET, GIRONA]);
    assert.equal(d.scope.etiqueta, "Lloret y Girona");
    assert.equal(d.scope.local, null, "ya no es «un» local");
  });
});

describe("casos de borde", () => {
  test("con un solo local no se fusiona nada: se devuelve tal cual", () => {
    const p = parte(LLORET);
    assert.equal(fusionarDashboards([p], { locales: [LLORET] }), p);
  });
  test("sin partes, null", () => {
    assert.equal(fusionarDashboards([], { locales: [] }), null);
  });
  test("una parte que falló (null) no rompe la suma", () => {
    const d = fusionarDashboards([parte(LLORET, { ayerRes: 10 }), null], { locales: [LLORET] });
    assert.equal(d.ayer.reservas, 10);
  });
  test("sin reservas ayer en ninguno, se dice que no hay datos", () => {
    const sinAyer = { ...parte(LLORET), ayer: { disponible: false, texto: "x" } };
    const d = fusionarDashboards([sinAyer, { ...parte(GIRONA), ayer: { disponible: false, texto: "x" } }], { locales: [LLORET, GIRONA] });
    assert.equal(d.ayer.disponible, false);
  });
  test("sin reservas hoy ni en los próximos días, avisa en vez de dar un cero seco", () => {
    const d = dos({ hoyRes: 0, hoyCom: 0, prox7: 0 }, { hoyRes: 0, hoyCom: 0, prox7: 0 });
    assert.equal(d.hoy.alerta, true);
    assert.match(d.hoy.texto, /Sara esté tomando reservas/);
  });
});

describe("la tira del periodo (reservas, ventas y gasto del rango)", () => {
  const per = (o = {}) => ({
    from: "2026-08-01", to: "2026-08-11", hoy: "2026-08-11", hoyEnVivo: false,
    reservas: { total: o.res ?? 10, personas: o.per ?? 25, serie: o.serie || [{ dia: "2026-08-01", n: 10, personas: 25 }] },
    ventas: { disponible: true, total: o.ventas ?? 1000, tickets: o.tickets ?? 50, ticket_medio: 20, serie: o.vserie || [{ dia: "2026-08-01", ventas: 1000, tickets: 50 }], fuente: "bd" },
    gastos: { disponible: true, total: o.gastos ?? 400, base: 330, n: 5 },
    resultado: (o.ventas ?? 1000) - (o.gastos ?? 400),
  });

  test("todo se suma, porque todo viene filtrado por local", () => {
    const d = fusionarPeriodo([per({ res: 10, ventas: 1000, gastos: 400 }), per({ res: 4, ventas: 500, gastos: 100 })]);
    assert.equal(d.reservas.total, 14);
    assert.equal(d.ventas.total, 1500);
    assert.equal(d.gastos.total, 500);
  });

  test("el ticket medio se rehace con los totales: promediar dos medias no da la media", () => {
    // 1000/50 = 20 € y 500/100 = 5 €. La media de las medias sería 12,50 €; la de verdad es 10.
    const d = fusionarPeriodo([per({ ventas: 1000, tickets: 50 }), per({ ventas: 500, tickets: 100 })]);
    assert.equal(d.ventas.ticket_medio, 10);
  });

  test("y el resultado se rehace restando los totales ya sumados", () => {
    const d = fusionarPeriodo([per({ ventas: 1000, gastos: 400 }), per({ ventas: 500, gastos: 100 })]);
    assert.equal(d.resultado, 1000);
  });

  test("las series se suman día a día", () => {
    const d = fusionarPeriodo([
      per({ serie: [{ dia: "2026-08-01", n: 3, personas: 6 }] }),
      per({ serie: [{ dia: "2026-08-01", n: 2, personas: 4 }, { dia: "2026-08-02", n: 1, personas: 2 }] })]);
    assert.deepEqual(d.reservas.serie, [{ dia: "2026-08-01", n: 5, personas: 10 }, { dia: "2026-08-02", n: 1, personas: 2 }]);
  });

  test("si en uno hay ventas en vivo, el conjunto está en vivo", () => {
    const d = fusionarPeriodo([{ ...per(), hoyEnVivo: false }, { ...per(), hoyEnVivo: true }]);
    assert.equal(d.hoyEnVivo, true);
  });
});

describe("etiquetas", () => {
  test("el nombre corto quita la marca", () => {
    assert.equal(nombreCorto("La Tapeta - Lloret"), "Lloret");
    assert.equal(nombreCorto("Oficina"), "Oficina");
  });
  test("se enumeran con «y», como se dicen", () => {
    assert.equal(etiquetaLocales([LLORET, GIRONA]), "Lloret y Girona");
    assert.equal(etiquetaLocales([LLORET, GIRONA, "Cooperativa - Blanes"]), "Lloret, Girona y Blanes");
    assert.equal(etiquetaLocales([LLORET]), "Lloret");
    assert.equal(etiquetaLocales([]), "");
  });
});

describe("pedir varios locales no es una forma de leer los de otro", () => {
  const encargado = { rol: "encargado", local: LLORET, locales_extra: [GIRONA] };
  test("dirección pide los que quiera", () => {
    assert.deepEqual(localesPermitidos({ rol: "direccion" }, [LLORET, "Oficina"]), [LLORET, "Oficina"]);
  });
  test("dirección sin pedir nada: vacío, que significa todos", () => {
    assert.deepEqual(localesPermitidos({ rol: "direccion" }, []), []);
  });
  test("el encargado con dos, sus dos", () => {
    assert.deepEqual(localesPermitidos(encargado, [LLORET, GIRONA]), [LLORET, GIRONA]);
  });
  test("si cuela uno ajeno, ese se cae", () => {
    assert.deepEqual(localesPermitidos(encargado, [LLORET, "Oficina"]), [LLORET]);
  });
  test("si pide SOLO ajenos, se le da el suyo: un enlace viejo no es un ataque", () => {
    assert.deepEqual(localesPermitidos(encargado, ["Oficina"]), [LLORET]);
  });
  test("acepta la lista tal cual viene en la URL", () => {
    assert.deepEqual(localesPermitidos(encargado, `${LLORET},${GIRONA}`), [LLORET, GIRONA]);
  });
  test("sin usuario no hay locales", () => {
    assert.deepEqual(localesPermitidos(null, [LLORET]), []);
  });
});

describe("cableado en el servidor", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");

  test("el dashboard pide uno por local y suma, sin tocar el filtrado de la consulta", () => {
    const i = server.indexOf('app.get("/api/dashboard"');
    const bloque = server.slice(i, i + 1500);
    assert.match(bloque, /for \(const l of locales\) partes\.push\(await getDashboard/);
    assert.match(bloque, /fusionarDashboards\(partes/);
    assert.doesNotMatch(bloque, /local IN \(/, "el ADR 0001 aparta tocar el filtrado por local");
  });

  test("los locales pedidos pasan por el filtro de permisos", () => {
    const i = server.indexOf("function localesScope(");
    assert.match(server.slice(i, i + 600), /localesPermitidos\(req\.user, pedidos\)/);
  });

  test("un rango de fechas mal escrito sigue siendo un 400, no un 500", () => {
    const i = server.indexOf('app.get("/api/dashboard/periodo"');
    assert.match(server.slice(i, i + 1600), /status\(400\)[\s\S]*Rango inválido/);
  });
});
