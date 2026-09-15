// El catálogo de Ágora y el motor de promociones.
//
// ── DOS COSAS QUE SE DEMUESTRAN AQUÍ Y QUE CUESTAN DINERO SI FALLAN ──────────────────────────
//
//   · `Product.Id` NO ES GLOBAL. Igual que `Workplace.Id`, dos instalaciones de Ágora repiten
//     identificadores: el producto 14 de Girona no tiene nada que ver con el 14 de Lloret. La
//     identidad es `(local, Id)` o no es nada.
//
//   · UNA CAMPAÑA VIVE EN HORA DE MADRID. «Solo el 1 de octubre» empieza a las 00:00 de Madrid,
//     que en UTC son las 22:00 del día 30. Con la hora equivocada, el desayuno se podría pedir la
//     noche anterior y no el propio día a última hora.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  urlMaestro, RUTA_MAESTRO, FILTROS, texto, numero, precioDe, estaDeBaja,
  normalizarMaestro, normalizarFormatos, compararCatalogo, errorRedactado,
} from "../../src/modules/fidelizacion/catalogo.js";
import {
  TIPOS, TIPOS_REWARD, ESTADOS, enMadrid, vigente, elegible, rewardDePromo,
  puedePublicar, simularPromo, leerLista, EXPLICACION,
} from "../../src/modules/fidelizacion/promos.js";

const GIRONA = "La Tapeta - Girona";
const LLORET = "La Tapeta - Lloret";

describe("la petición al maestro", () => {
  test("es la ruta de la guía, con los cuatro filtros", () => {
    // Se piden los cuatro juntos porque el producto solo trae identificadores: el porcentaje de
    // IVA, la familia y la tarifa viven en sus propias colecciones.
    assert.equal(RUTA_MAESTRO, "/api/export-master/");
    assert.deepEqual([...FILTROS], ["Vats", "Families", "PriceLists", "Products"]);
    assert.equal(urlMaestro("http://host:8984"),
      "http://host:8984/api/export-master/?filter=Vats,Families,PriceLists,Products");
    assert.equal(urlMaestro("http://host:8984/"), urlMaestro("http://host:8984"));
  });
});

describe("normalizar el maestro", () => {
  const maestro = {
    Vats: [{ Id: 1, Name: "General", Percentage: 21 }, { Id: 2, Name: "Reducido", Percentage: 10 }],
    Families: [{ Id: 5, Name: "Cafetería" }],
    PriceLists: [{ Id: 1, Name: "Barra" }, { Id: 2, Name: "Terraza" }],
    Products: [
      { Id: 14, Name: "Café con leche", FamilyId: 5, VatId: 2, BaseSaleFormatId: 14,
        Prices: [{ PriceListId: 1, MainPrice: 1.5 }, { PriceListId: 2, MainPrice: 1.8 }] },
      { Id: 15, Name: "Bocadillo", FamilyId: 5, VatId: 1, Prices: [{ PriceListId: 1, Price: 4.5 }] },
      { Id: 16, Name: "Retirado", VatId: 1, DeletionDate: "2026-01-01T00:00:00" },
    ],
  };

  test("la raíz es `Products`, no un array suelto", () => {
    assert.equal(normalizarMaestro(maestro, { local: GIRONA }).productos.length, 3);
    assert.deepEqual(normalizarMaestro([{ Id: 1 }], { local: GIRONA }).productos, []);
    assert.deepEqual(normalizarMaestro(null, { local: GIRONA }).productos, []);
  });

  test("el IVA y la familia se RELACIONAN por id, no se deducen del nombre", () => {
    const p = normalizarMaestro(maestro, { local: GIRONA }).productos;
    assert.equal(p[0].iva, 10);
    assert.equal(p[0].familia, "Cafetería");
    assert.equal(p[1].iva, 21);
  });

  test("un VatId que no está en Vats deja el IVA a NULL, no a 0", () => {
    // Un catálogo incompleto no es un producto exento: decir 0 % sería inventarse un impuesto.
    const r = normalizarMaestro({ ...maestro, Vats: [] }, { local: GIRONA });
    assert.equal(r.productos[0].iva, null);
    assert.ok(r.avisos.some((a) => /impuestos/i.test(a)));
  });

  test("acepta `MainPrice` Y `Price`, con prioridad para el documentado", () => {
    // La guía documenta `MainPrice`, pero un ejemplo antiguo usa `Price` y no sabemos qué versión
    // tiene cada local.
    const p = normalizarMaestro(maestro, { local: GIRONA }).productos;
    assert.equal(p[0].precio, 1.5); assert.equal(p[0].precio_campo, "MainPrice");
    assert.equal(p[1].precio, 4.5); assert.equal(p[1].precio_campo, "Price");
    // Si llegaran los dos, manda `MainPrice`.
    assert.equal(precioDe([{ MainPrice: 2, Price: 9 }]).precio, 2);
  });

  test("la tarifa preferida gana si existe", () => {
    assert.equal(precioDe([{ PriceListId: 1, MainPrice: 1.5 }, { PriceListId: 2, MainPrice: 1.8 }],
      { tarifaPreferida: 2 }).precio, 1.8);
    // Y si esa tarifa no está, se coge la primera con precio en vez de quedarse sin ninguno.
    assert.equal(precioDe([{ PriceListId: 1, MainPrice: 1.5 }], { tarifaPreferida: 9 }).precio, 1.5);
  });

  test("`DeletionDate` es la baja: no hay booleano de activo en la guía", () => {
    const p = normalizarMaestro(maestro, { local: GIRONA }).productos;
    assert.equal(p[2].activo, false);
    assert.equal(p[2].baja_en, "2026-01-01T00:00:00");
    assert.equal(estaDeBaja({ DeletionDate: "x" }), true);
    assert.equal(estaDeBaja({}), false);
  });

  test("sin `BaseSaleFormatId` se asume el propio Id, como dice la guía", () => {
    const p = normalizarMaestro(maestro, { local: GIRONA }).productos;
    assert.equal(p[1].formato_base_id, "15");
  });

  test("un producto sin Id o sin Name se DESCARTA y se dice", () => {
    // Comerse productos en silencio es peor que fallar: se descubre cuando falta uno en una campaña.
    const r = normalizarMaestro({ Products: [{ Name: "Sin id" }, { Id: 9 }, "no soy objeto"] }, { local: GIRONA });
    assert.equal(r.productos.length, 0);
    assert.deepEqual(r.descartados.map((d) => d.motivo), ["sin_id", "sin_nombre", "no_es_objeto"]);
    assert.ok(r.avisos.some((a) => /no se han podido interpretar/.test(a)));
  });

  test("los formatos adicionales llevan su propio estado y precio", () => {
    const f = normalizarFormatos([{ Id: 2, Name: "Doble", Ratio: 2, Prices: [{ MainPrice: 2.5 }] },
                                  { Id: 3, Name: "Viejo", DeletionDate: "2026-01-01" }, { Name: "sin id" }]);
    assert.deepEqual(f.map((x) => [x.id, x.precio, x.activo]), [["2", 2.5, true], ["3", null, false]]);
  });

  test("la identidad lleva el LOCAL dentro", () => {
    const g = normalizarMaestro(maestro, { local: GIRONA }).productos[0];
    const l = normalizarMaestro(maestro, { local: LLORET }).productos[0];
    assert.equal(g.producto_id, l.producto_id, "el Id de Ágora sí se repite");
    assert.notEqual(g.local, l.local, "y por eso la identidad tiene que llevar el local");
  });
});

describe("qué cambia entre dos sincronizaciones", () => {
  const p = (id, extra = {}) => ({ producto_id: id, nombre: "P" + id, familia_id: "1", vat_id: "1",
    precio: 1, activo: true, formato_base_id: id, ...extra });

  test("lo que desaparece NO se borra: se marca inactivo", () => {
    // Un producto puede seguir dentro de una campaña vieja o de un movimiento ya escrito, y
    // borrarlo dejaría esas filas apuntando al vacío.
    const d = compararCatalogo([p("1"), p("2")], [p("1")]);
    assert.deepEqual(d.inactivados.map((x) => x.producto_id), ["2"]);
    assert.equal(d.inactivados[0].activo, false);
  });

  test("lo nuevo y lo cambiado se distinguen", () => {
    const d = compararCatalogo([p("1")], [p("1", { precio: 2 }), p("3")]);
    assert.deepEqual(d.anadidos.map((x) => x.producto_id), ["3"]);
    assert.deepEqual(d.actualizados.map((x) => x.producto_id), ["1"]);
  });

  test("lo que no cambia no se toca", () => {
    const d = compararCatalogo([p("1")], [p("1")]);
    assert.deepEqual([d.anadidos.length, d.actualizados.length, d.inactivados.length], [0, 0, 0]);
  });

  test("uno ya inactivo no se vuelve a inactivar", () => {
    const d = compararCatalogo([p("1", { activo: false })], []);
    assert.deepEqual(d.inactivados, []);
  });
});

describe("los errores de sincronización no llevan credenciales", () => {
  test("ni el host ni el token, ni aunque vinieran dentro del error", () => {
    // Una pantalla de error es exactamente donde acaban apareciendo, porque nadie piensa en ella
    // al escribir el `catch`.
    const e = Object.assign(new Error("fallo en http://tpv.local:8984 con TOKEN-SECRETO"),
      { code: "TOKEN-SECRETO", status: 401 });
    const linea = errorRedactado(e, { host: "http://tpv.local:8984", token: "TOKEN-SECRETO" });
    assert.ok(!linea.includes("TOKEN-SECRETO"), linea);
    assert.ok(!linea.includes("tpv.local"), linea);
    assert.match(linea, /HTTP 401/);
  });

  test("y el MENSAJE del error no sale nunca", () => {
    const e = new Error("connect ECONNREFUSED 10.0.0.5:8984");
    assert.ok(!errorRedactado(e).includes("10.0.0.5"));
  });
});

describe("la hora de Madrid, que es donde vive una campaña", () => {
  test("las 22:30 UTC del 30 de septiembre YA son el 1 de octubre en Madrid", () => {
    assert.deepEqual(enMadrid("2026-09-30T22:30:00Z"), { fecha: "2026-10-01", hora: "00:30", dia: 4 });
  });

  test("y las 21:30 UTC del 1 todavía son el 1, a las 23:30", () => {
    assert.deepEqual(enMadrid("2026-10-01T21:30:00Z"), { fecha: "2026-10-01", hora: "23:30", dia: 4 });
  });

  test("también con el horario de invierno", () => {
    // En enero Madrid va a UTC+1, no +2. Si estuviera fijo, se equivocaría media parte del año.
    assert.equal(enMadrid("2026-01-15T23:30:00Z").fecha, "2026-01-16");
    assert.equal(enMadrid("2026-01-15T23:30:00Z").hora, "00:30");
  });

  test("una fecha que no vale no revienta", () => {
    assert.equal(enMadrid("no soy una fecha"), null);
  });
});

describe("cuándo está viva una promoción", () => {
  const promo = { estado: "publicada", local: GIRONA, tipo: "campana_unica", reward_id: "fidp:X",
    desde: "2026-10-01", hasta: "2026-10-01", hora_desde: "08:00", hora_hasta: "12:00", limite_cuenta: 1 };
  const v = (ahora, local = GIRONA) => vigente(promo, { ahora, local });

  test("solo el día configurado, en hora de Madrid", () => {
    assert.equal(v("2026-10-01T07:00:00Z").ok, true, "las 09:00 de Madrid");
    assert.equal(v("2026-09-30T22:30:00Z").motivo, "aun_no_es_la_hora", "las 00:30 del propio día 1");
    assert.equal(v("2026-10-02T07:00:00Z").motivo, "ya_termino");
    assert.equal(v("2026-09-29T07:00:00Z").motivo, "aun_no_empieza");
  });

  test("el final del horario es EXCLUSIVO, como cualquier horario", () => {
    assert.equal(v("2026-10-01T09:59:00Z").ok, true, "las 11:59");
    assert.equal(v("2026-10-01T10:00:00Z").motivo, "fuera_de_horario", "las 12:00 en punto");
  });

  test("un borrador o una pausada no existen para nadie", () => {
    for (const e of ["borrador", "pausada", "finalizada"]) {
      assert.equal(vigente({ ...promo, estado: e }, { ahora: "2026-10-01T07:00:00Z", local: GIRONA }).motivo,
        `estado_${e}`);
    }
  });

  test("y una de otro local NO se ofrece aquí", () => {
    assert.equal(v("2026-10-01T07:00:00Z", LLORET).motivo, "otro_local");
  });

  test("los días de la semana, si se configuran", () => {
    const soloLunes = { ...promo, desde: null, hasta: null, dias: [1] };
    // El 1 de octubre de 2026 es jueves (4).
    assert.equal(vigente(soloLunes, { ahora: "2026-10-01T09:00:00Z", local: GIRONA }).motivo, "otro_dia");
    assert.equal(vigente({ ...soloLunes, dias: [4] }, { ahora: "2026-10-01T09:00:00Z", local: GIRONA }).ok, true);
  });
});

describe("quién se la lleva", () => {
  const promo = { estado: "publicada", local: GIRONA, tipo: "campana_unica", reward_id: "fidp:X",
    limite_cuenta: 1, limite_total: 100, coste_puntos: 0, compra_minima: 0 };
  const base = { ahora: "2026-10-01T09:00:00Z", local: GIRONA, usos: 0, usosTotales: 0, saldo: 0 };

  test("UN DESAYUNO POR CUENTA", () => {
    assert.equal(elegible(promo, base).ok, true);
    assert.equal(elegible(promo, { ...base, usos: 1 }).motivo, "ya_utilizada");
  });

  test("y un tope total", () => {
    assert.equal(elegible(promo, { ...base, usosTotales: 100 }).motivo, "agotada");
    // `0` es «sin tope», no «cero unidades».
    assert.equal(elegible({ ...promo, limite_total: 0 }, { ...base, usosTotales: 99999 }).ok, true);
  });

  test("un premio que cuesta puntos exige tenerlos", () => {
    const conCoste = { ...promo, coste_puntos: 100 };
    assert.equal(elegible(conCoste, { ...base, saldo: 99 }).motivo, "puntos_insuficientes");
    assert.equal(elegible(conCoste, { ...base, saldo: 100 }).ok, true);
  });

  test("la compra mínima solo se mira si hay importe", () => {
    // Al identificar al cliente todavía no hay cuenta: se comprueba al CERRAR.
    const conMinimo = { ...promo, compra_minima: 30 };
    assert.equal(elegible(conMinimo, { ...base, importeCentimos: null }).ok, true);
    assert.equal(elegible(conMinimo, { ...base, importeCentimos: 2999 }).motivo, "compra_minima");
    assert.equal(elegible(conMinimo, { ...base, importeCentimos: 3000 }).ok, true);
  });

  test("todos los motivos tienen explicación en castellano", () => {
    for (const m of ["ya_utilizada", "agotada", "puntos_insuficientes", "compra_minima",
                     "otro_local", "otro_dia", "fuera_de_horario", "ya_termino"]) {
      assert.ok(EXPLICACION[m], `falta la explicación de ${m}`);
    }
  });
});

describe("el Reward que se manda", () => {
  test("el Id es el GUARDADO, no uno calculado", () => {
    const r = rewardDePromo({ tipo: "descuento_euros", reward_id: "fidp:ABC", valor: 5,
      nombre: "X", texto_camarero: "5 € de descuento", texto_cliente: "Cinco euros" });
    assert.equal(r.Id, "fidp:ABC");
    assert.equal(r.Type, "CashDiscount");
    assert.equal(r.Value, 5);
    assert.equal(r.Code, undefined, "un CashDiscount no lleva Code");
  });

  test("un Offer lleva `Code`, y es el que existe en Ágora", () => {
    const r = rewardDePromo({ tipo: "oferta_agora", reward_id: "fidp:X", codigo_agora: "DESAYUNO",
      nombre: "D", texto_camarero: "Desayuno", texto_cliente: "Tu desayuno" });
    assert.equal(r.Type, "Offer");
    assert.equal(r.Code, "DESAYUNO");
    assert.equal(r.Value, undefined, "un Offer no lleva Value");
  });

  test("sin reward_id no hay nada que ofrecer", () => {
    assert.equal(rewardDePromo({ tipo: "descuento_euros" }), null);
    assert.equal(rewardDePromo(null), null);
  });

  test("los cuatro tipos de la guía, y solo esos", () => {
    assert.deepEqual([...TIPOS_REWARD], ["CashDiscount", "DiscountRate", "NamedDiscount", "Offer"]);
    for (const t of Object.values(TIPOS)) assert.ok(TIPOS_REWARD.includes(t.reward), t.reward);
  });

  test("solo `CashDiscount` está marcado como probado contra un TPV real", () => {
    const probados = Object.entries(TIPOS).filter(([, t]) => t.probado).map(([, t]) => t.reward);
    assert.deepEqual([...new Set(probados)], ["CashDiscount"]);
  });
});

describe("publicar una promoción", () => {
  const base = { tipo: "descuento_euros", nombre: "N", texto_camarero: "C", texto_cliente: "L",
    local: GIRONA, valor: 5 };

  test("con lo mínimo, se puede", () => assert.equal(puedePublicar(base).ok, true));

  test("UN OFFER SIN CÓDIGO COMPROBADO NO SE PUBLICA", () => {
    // La guía es explícita: si el `Code` no existe en Ágora, ÁGORA IGNORA EL PREMIO EN SILENCIO.
    // El cliente se queda sin su desayuno y nosotros sin enterarnos.
    const sinCodigo = { ...base, tipo: "oferta_agora", valor: null };
    assert.ok(puedePublicar(sinCodigo).falta.some((f) => /código de la promoción en Ágora/.test(f)));

    const sinComprobar = { ...sinCodigo, codigo_agora: "DESAYUNO" };
    assert.ok(puedePublicar(sinComprobar).falta.some((f) => /ignora en silencio/.test(f)));

    const comprobado = { ...sinComprobar, codigo_comprobado_en: "2026-09-14T12:00:00Z" };
    assert.equal(puedePublicar(comprobado).ok, true);
  });

  test("un premio de producto necesita saber QUÉ regala", () => {
    const sinGrupos = { ...base, tipo: "campana_unica", valor: null, codigo_agora: "X",
      codigo_comprobado_en: "2026-01-01" };
    assert.ok(puedePublicar(sinGrupos).falta.some((f) => /qué productos entran/.test(f)));

    const grupoVacio = { ...sinGrupos, grupos: [{ clave: "cafes", version: 1 }] };
    assert.ok(puedePublicar(grupoVacio, { grupos: { "cafes:1": [] } }).falta.some((f) => /no tiene ningún producto/.test(f)));

    const bien = { ...grupoVacio };
    assert.equal(puedePublicar(bien, { grupos: { "cafes:1": ["14"] } }).ok, true);
  });

  test("y sin catálogo sincronizado tampoco", () => {
    const p = { ...base, tipo: "campana_unica", valor: null, codigo_agora: "X",
      codigo_comprobado_en: "2026-01-01", grupos: [{ clave: "cafes", version: 1 }] };
    assert.ok(puedePublicar(p, { grupos: { "cafes:1": ["14"] }, catalogo: 0 })
      .falta.some((f) => /catálogo/.test(f)));
  });

  test("un porcentaje por encima de 100 se caza", () => {
    assert.ok(puedePublicar({ ...base, tipo: "descuento_pct", valor: 150 })
      .falta.some((f) => /100 %/.test(f)));
  });

  test("y las fechas al revés", () => {
    assert.ok(puedePublicar({ ...base, desde: "2026-10-02", hasta: "2026-10-01" })
      .falta.some((f) => /posterior/.test(f)));
  });
});

describe("el simulador de una promoción", () => {
  test("enseña los escenarios que se equivocan de verdad", () => {
    const promo = { estado: "publicada", local: GIRONA, tipo: "campana_unica", reward_id: "fidp:X",
      desde: "2026-10-01", hasta: "2026-10-01", limite_cuenta: 1, compra_minima: 0 };
    const r = simularPromo(promo, [
      { nombre: "Cuenta elegible", ahora: "2026-10-01T09:00:00Z", local: GIRONA, usos: 0 },
      { nombre: "Premio ya utilizado", ahora: "2026-10-01T09:00:00Z", local: GIRONA, usos: 1 },
      { nombre: "Local incorrecto", ahora: "2026-10-01T09:00:00Z", local: LLORET, usos: 0 },
      { nombre: "Fuera de fecha", ahora: "2026-11-01T09:00:00Z", local: GIRONA, usos: 0 },
    ]);
    assert.deepEqual(r.map((x) => x.ok), [true, false, false, false]);
    assert.match(r[0].texto, /SÍ se lo lleva/);
    assert.match(r[1].texto, /ya se la ha llevado/);
    assert.match(r[2].texto, /es de otro local/);
    assert.match(r[3].texto, /ya ha terminado/);
  });
});

describe("utilidades", () => {
  test("una lista mal guardada no revienta nada", () => {
    assert.deepEqual(leerLista('["a"]'), ["a"]);
    assert.deepEqual(leerLista(["a"]), ["a"]);
    for (const malo of ["", "no soy json", "{}", null, 42]) assert.deepEqual(leerLista(malo), []);
  });

  test("`texto` y `numero` no se tragan objetos ni booleanos", () => {
    for (const raro of [{}, [], true, null, undefined]) {
      assert.equal(texto(raro), null, String(raro));
      assert.equal(numero(raro), null, String(raro));
    }
    assert.equal(numero("1,50"), 1.5, "la coma decimal española");
    assert.equal(texto("  x  "), "x");
  });

  test("los estados de una promoción son los cuatro acordados", () => {
    assert.deepEqual([...ESTADOS], ["borrador", "publicada", "pausada", "finalizada"]);
  });
});
