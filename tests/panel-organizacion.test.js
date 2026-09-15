// CÓMO ESTÁ ORGANIZADO EL PANEL, y por qué nadie puede tener dos dueños.
//
// ── EL PROBLEMA QUE ESTO RESUELVE ────────────────────────────────────────────────────────────
//
// La configuración comercial había ido a parar a `Sistema → Ágora (TPV)`, que es la pantalla
// técnica: tokens, conexiones, Workplace, diagnósticos. Quien entraba a mirar por qué no llegaban
// facturas se encontraba reglas de puntos y textos de campaña; y quien entraba a escribir un texto
// de campaña se encontraba a un dedo de un botón que revoca un token de un TPV en producción.
//
// La regla es: CADA FUNCIÓN TIENE UNA PANTALLA PROPIETARIA. Desde un resumen puede haber un enlace
// directo, pero la herramienta vive en un sitio. Dos sitios donde configurar lo mismo es un sitio
// donde alguien configura lo que ya estaba configurado en el otro y se pregunta por qué no cambia.
//
// ── Y LO QUE NO PUEDE HACER UNA REORGANIZACIÓN ───────────────────────────────────────────────
//
// Mover pantallas no puede activar el programa, ni cambiar permisos, ni perder una ruta. Los
// últimos tres bloques de este fichero son solo eso.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

/** El cuerpo de una función de `app.js`, hasta la siguiente declaración de primer nivel. */
function fn(nombre) {
  const i = app.indexOf(`function ${nombre}(`);
  if (i < 0) throw new Error(`no existe ${nombre}()`);
  const j = app.indexOf("\n}\n", i);
  return app.slice(i, j > 0 ? j + 2 : app.length);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("las pantallas y quién entra en cada una", () => {
  const NAV = app.slice(app.indexOf("const NAV = "), app.indexOf("\nconst TITLES = "));

  test("Fidelización es una pantalla propia de Marketing, no un rincón de Ágora", () => {
    assert.match(NAV, /\["fidelizacion", "Fidelización", "[a-z-]+", \["direccion", ?"marketing"\]\]/);
    assert.match(app, /fidelizacion: loadFidelizacion/);
  });

  test("y las cinco pantallas comerciales siguen siendo de Dirección y Marketing", () => {
    // Ni se abre ni se cierra a nadie: mover una pantalla no es cambiar quién entra.
    for (const v of ["promos", "clientes", "campanas", "fidelizacion"]) {
      const l = NAV.match(new RegExp(`\\["${v}",[^\\]]*\\[([^\\]]*)\\]`));
      assert.ok(l, `${v} no está en el menú`);
      assert.match(l[1], /direccion/, `${v} ha dejado de ser de Dirección`);
    }
  });

  test("Ágora sigue siendo de Dirección: es la pantalla de los tokens", () => {
    assert.match(NAV, /\["agora",[^\]]*\["direccion"\]\]/);
  });

  test("TODA PANTALLA DEL MENÚ ESTÁ EN `VIEW_ROLES`, con los MISMOS roles", () => {
    // `puedeVer()` devuelve `true` para lo que NO está en la lista. Así que una pantalla nueva sin
    // entrada no se queda cerrada: se queda ABIERTA A TODOS —el menú la esconde, pero la ruta
    // directa la pinta igual—. Es justo lo que pasó al mover Fidelización a Marketing.
    const roles = app.slice(app.indexOf("const VIEW_ROLES = "), app.indexOf("\n// Módulos cuyos datos"));
    for (const m of NAV.matchAll(/\["([a-z]+)", "[^"]+", "[a-z-]+", \[([^\]]*)\]\]/g)) {
      const [, vista, permisos] = m;
      const enLista = roles.match(new RegExp(`\\b${vista}: \\[([^\\]]*)\\]`));
      assert.ok(enLista, `«${vista}» está en el menú y no en VIEW_ROLES: se abre a todos los roles`);
      const norm = (t) => t.split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean).sort();
      assert.deepEqual(norm(enLista[1]), norm(permisos),
        `«${vista}» tiene permisos distintos en el menú y en VIEW_ROLES`);
    }
  });

  test("y tiene su nombre para el editor de usuarios", () => {
    // Sin él, el módulo sale en la lista de permisos con su identificador en crudo.
    const titles = app.slice(app.indexOf("const TITLES = "), app.indexOf("\nconst VIEW_ROLES = "));
    for (const m of NAV.matchAll(/\["([a-z]+)", "([^"]+)", "[a-z-]+", \[/g)) {
      assert.ok(titles.includes(`${m[1]}: "`), `«${m[1]}» no tiene nombre en TITLES`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("Ágora se queda con lo técnico, y solo con lo técnico", () => {
  // La pantalla de Ágora son tres funciones: la cabecera técnica, la tarjeta de cada local y el
  // bloque de integración con el TPV. Se miran juntas porque juntas se pintan.
  const agora = fn("renderAgora") + fn("renderAgvVentas") + fn("renderAgvEntrada")
    + fn("renderAgvSalida") + fn("renderAgoraSalidaLocal") + fn("renderAgoraRow")
    + fn("renderFidLocal") + fn("loadAgora") + fn("loadFidPiloto");

  test("conserva recepción, conexiones, catálogo, tokens, Workplace, facturas y diagnóstico", () => {
    for (const pieza of ["integracion", "Workplace", "factura", "atálogo", "token", "iagnóstico"]) {
      assert.ok(agora.includes(pieza), `Ágora ha perdido ${pieza}`);
    }
  });

  test("LA CONFIGURACIÓN COMERCIAL YA NO SE EDITA DESDE AQUÍ", () => {
    // Lo que se comprueba es que Ágora no monta los FORMULARIOS de esas cosas. Nombrarlas en un
    // enlace o en un resumen sí vale —es justo lo que se pidió—; montarlas dos veces, no.
    const cuerpo = sinComentarios(agora);
    for (const form of ["fidgFormNuevo(", "fidgPromoNueva(", "fidgTarjetaForm(",
                        "fidgComNueva(", "fidgReglaNueva("]) {
      assert.ok(!cuerpo.includes(form), `Ágora sigue montando ${form}`);
    }
  });

  test("y desde Ágora se llega a Fidelización con un enlace, no con una copia", () => {
    assert.match(agora, /data-act="ir-fidelizacion"/);
    assert.match(app, /else if \(act === "ir-fidelizacion"\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("ÁGORA, EN TRES APARTADOS", () => {
  // Era una sola columna de casi cuatro mil píxeles con tres cosas que no se miran juntas nunca.
  // Quien venía a ver por qué no llegaban ventas pasaba por encima de seis formularios de token.
  const cuerpo = fn("renderAgvCuerpo") + fn("renderAgvVentas") + fn("renderAgvEntrada")
    + fn("renderAgvSalida") + fn("renderAgoraSalidaLocal");

  test("son los tres acordados, y en ese orden", () => {
    const tabs = app.slice(app.indexOf("const AGV_TABS = ["), app.indexOf("function renderAgora()"));
    assert.match(tabs, /\["ventas", "Ventas"\]/);
    assert.match(tabs, /\["entrada", "Entrada desde Ágora"\]/);
    assert.match(tabs, /\["salida", "Salida hacia Ágora"\]/);
  });

  test("UN SOLO ESTADO para los tres: la pestaña y el local", () => {
    // Un estado por apartado habría hecho que cambiar de pestaña volviera al principio y que
    // hubiera que volver a elegir el local en cada una.
    assert.match(app, /let AGV = \{ tab: "ventas", local: null \};/);
    assert.ok(!/let AGV_VENTAS|let AGV_ENTRADA|let AGV_SALIDA/.test(app), "hay estado por apartado");
  });

  test("CAMBIAR DE PESTAÑA NO VUELVE AL INICIO NI RECARGA", () => {
    const tab = fn("agvTab");
    // Se repinta SOLO el cuerpo, no la vista entera.
    assert.match(tab, /const c = document\.getElementById\("agBody"\);/);
    assert.ok(!/view\.innerHTML|loadAgora\(\)|skeleton\(\)/.test(tab), "recarga la pantalla entera");
    // Y no vuelve a pedir lo que ya está en memoria.
    assert.match(tab, /if \(k === "salida" && AGV\.local && !FIDG\.catalogo\)/);
  });

  test("EL LOCAL ELEGIDO ES EL MISMO EN LOS TRES", () => {
    assert.match(fn("agvLocal"), /AGV\.local = AGV\.local === local \? null : local;/);
    // Los tres apartados leen `AGV.local`, no una copia suya.
    for (const f of ["renderAgvEntrada", "renderAgvSalida"]) {
      assert.ok(fn(f).includes("agvFila("), `${f} no usa la fila compartida`);
    }
    assert.match(fn("agvFila"), /const abierto = AGV\.local === local;/);
  });

  test("SOLO UN LOCAL ABIERTO A LA VEZ", () => {
    // Con un `<details>` por local se acababa con seis desplegados y la pantalla otra vez larga.
    const fila = fn("agvFila");
    assert.ok(!fila.includes("<details"), "vuelve a haber un details por local");
    assert.match(fila, /\$\{abierto \? `<div style="padding:0 16px 16px">/);
    assert.match(fila, /aria-expanded="\$\{abierto\}"/);
  });

  test("cada apartado lleva LO SUYO, y nada del vecino", () => {
    const ventas = fn("renderAgvVentas");
    assert.match(ventas, /Última lectura correcta/);
    assert.match(ventas, /data-act="ag-sync"/);
    assert.match(ventas, /id="agVivo"/);
    for (const ajeno of ["agHost_", "agTok_", "fid-generar", "Workplace", "fidg-sync"]) {
      assert.ok(!ventas.includes(ajeno), `Ventas lleva ${ajeno}`);
    }

    const entrada = fn("renderAgvEntrada");
    assert.match(entrada, /Fidelización entrante/);
    assert.match(entrada, /renderFidLocal\(L\)/);
    for (const ajeno of ["agHost_", "agUser_", "agPass_", "fidg-sync"]) {
      assert.ok(!entrada.includes(ajeno), `Entrada lleva ${ajeno}`);
    }

    const salida = fn("renderAgvSalida") + fn("renderAgoraSalidaLocal");
    assert.match(salida, /renderAgoraRow\(local, i\)/);
    assert.match(salida, /renderFidgCatalogo\(local\)/);
    for (const ajeno of ["fid-generar", "fid-revocar", "Workplace confirmado"]) {
      assert.ok(!salida.includes(ajeno), `Salida lleva ${ajeno}`);
    }
  });

  test("EL CATÁLOGO VA CON SU LOCAL, no suelto al final", () => {
    // Suelto detrás de todos los locales, había que acordarse de cuál estaba elegido en un
    // desplegable que quedaba a mil píxeles.
    assert.match(fn("renderAgoraSalidaLocal"), /renderFidgCatalogo\(local\)/);
    // Y con un local fijado no se vuelve a preguntar cuál.
    const cat = fn("renderFidgCatalogo");
    assert.match(cat, /const fijo = !!local;/);
    assert.match(cat, /fijo\s*\n?\s*\? `<input type="hidden" id="fidgLocal"/);
  });

  test("y no se pinta ni una regla, promoción o campaña aquí", () => {
    for (const ajeno of ["fidgReglaNueva", "fidgPromoNueva", "fidgFormNuevo", "fidgComNueva",
                         "renderFidPrograma", "FIDG_PROPUESTAS"]) {
      assert.ok(!cuerpo.includes(ajeno), `Ágora monta ${ajeno}, que es de Marketing`);
    }
  });

  test("Ágora ya NO pide los datos de Marketing", () => {
    // Pedía reglas, promociones, formularios, tarjeta, comunicaciones y revisiones para no pintar
    // ninguna: seis viajes de red en datos que nadie iba a mirar.
    const carga = fn("loadFidPiloto");
    assert.ok(!carga.includes("loadFidGestion"), "sigue pidiendo la configuración comercial");
    assert.ok(!carga.includes("loadFidPrograma"), "sigue pidiendo las reglas");
    assert.match(carga, /apiRaw\("\/api\/fidelizacion\/integracion"\)/);
  });

  test("las pestañas y las cabeceras son BOTONES, no divs con click", () => {
    assert.match(app, /<button class="tab\$\{AGV\.tab === k \? " on" : ""\}" role="tab"/);
    assert.match(fn("agvFila"), /<button class="agv-cab" data-act="agv-local"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("CADA HERRAMIENTA TIENE UN SOLO DUEÑO", () => {
  // El formulario de cada cosa se monta EXACTAMENTE una vez en todo el panel. Si apareciera dos
  // veces, habría dos sitios donde configurar lo mismo —y uno de los dos quedaría sin mantener.
  const casos = [
    ["el formulario público", "fidgFormNuevo"],
    ["las promociones", "fidgPromoNueva"],
    ["la tarjeta del cliente", "fidgTarjetaNueva"],
    ["las comunicaciones", "fidgComNueva"],
    ["la ficha de un socio", "renderClientesFid"],
    ["los formularios y comunicaciones de Campañas", "renderCampFidelizacion"],
  ];

  for (const [que, f] of casos) {
    test(`${que}: una sola definición`, () => {
      const veces = [...app.matchAll(new RegExp(`(async )?function ${f}\\(`, "g"))].length;
      assert.equal(veces, 1, `${f} está definida ${veces} veces`);
    });
  }

  test("y la puerta de producción se pinta en un solo sitio", () => {
    assert.equal([...app.matchAll(/function renderFidPrograma\(/g)].length, 1);
  });

  test("los resúmenes ENLAZAN a la pantalla dueña en vez de repetir el formulario", () => {
    for (const f of ["renderCampFidelizacion", "renderClientesFid"]) {
      const cuerpo = sinComentarios(fn(f));
      assert.ok(!/fidgFormNuevo\(|fidgPromoNueva\(|fidgReglaNueva\(/.test(cuerpo),
        `${f} monta un formulario que no es suyo`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("cada sección lleva lo que se pidió", () => {
  test("Fidelización: resumen y puerta, sombra, reglas, revisiones, tarjeta y trazabilidad", () => {
    const secc = app.slice(app.indexOf("const FID_SECC"), app.indexOf("const FID_SECC") + 700);
    for (const s of ["resumen", "sombra", "reglas", "revisiones", "tarjeta", "traza"]) {
      assert.ok(secc.includes(`"${s}"`), `a Fidelización le falta ${s}`);
    }
    for (const f of ["renderFidvSombra", "renderFidvTraza", "renderFidPrograma"]) {
      assert.ok(app.includes(`function ${f}(`), `falta ${f}`);
    }
  });

  test("Promociones tiene su pestaña de fidelización, con simulación y vista previa", () => {
    assert.ok(app.includes("promoFidelizacion"), "Promociones no tiene pestaña de fidelización");
    assert.match(app, /fidg-promo-sim|simular/i);
    assert.match(app, /data-act="fidg-form-prev"/);
  });

  test("Campañas reúne formularios, consentimientos y comunicaciones", () => {
    const camp = fn("renderCampFidelizacion");
    for (const s of ["formulario", "consentimiento", "comunicaci"]) {
      assert.match(camp.toLowerCase(), new RegExp(s), `a Campañas le falta ${s}`);
    }
  });

  test("Clientes enseña saldo, movimientos y promociones usadas", () => {
    const cli = fn("renderClientesFid") + fn("renderClientesFidCuerpo") + fn("cliFidVer");
    for (const s of ["saldo", "visitas", "consumo", "caduc", "historial", "por local"]) {
      assert.match(cli.toLowerCase(), new RegExp(s), `a Clientes le falta ${s}`);
    }
    // Y se busca por carné, NUNCA por teléfono: un identificador de socio que se adivina desde un
    // dato personal deja de ser opaco.
    assert.match(cli, /\/api\/fidelizacion\/socio\?token=/);
    assert.ok(!/telefono/.test(cli), "la ficha se busca por teléfono");
  });

  test("y la exportación vive donde vive la trazabilidad, no repartida", () => {
    assert.equal([...app.matchAll(/function fidvCsv\(/g)].length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("no se ha perdido ninguna ruta por el camino", () => {
  test("todas las rutas de fidelización que llama el panel existen en el servidor", () => {
    const llamadas = new Set([...app.matchAll(/["'`](\/api\/fidelizacion\/[a-z0-9/_-]+)/g)].map((m) => m[1]));
    assert.ok(llamadas.size > 10, `solo se han encontrado ${llamadas.size} llamadas`);
    for (const r of llamadas) {
      // Se compara por prefijo: muchas llevan un `:id` que el panel sustituye.
      const base = r.replace(/\/$/, "");
      assert.ok(server.includes(`"${base}`) || server.includes(base + '/:'),
        `el panel llama a ${r} y el servidor no la tiene`);
    }
  });

  test("y las rutas de fidelización siguen exigiendo sesión", () => {
    const rutas = [...server.matchAll(/app\.(get|post|put|delete)\("(\/api\/fidelizacion\/[^"]*)",\s*(\w+)/g)];
    assert.ok(rutas.length > 15);
    for (const [, , ruta, siguiente] of rutas) {
      // Las dos del TPV son públicas A PROPÓSITO: las llama Ágora desde el local con su token en
      // la URL, que es su credencial. Ninguna otra puede serlo.
      if (ruta.startsWith("/api/fidelizacion/agora/:token/")) continue;
      assert.equal(siguiente, "requireAuth", `${ruta} se sirve sin sesión`);
    }
    const tpv = rutas.filter(([, , r]) => r.startsWith("/api/fidelizacion/agora/"));
    assert.equal(tpv.length, 2, "han aparecido rutas nuevas sin sesión en la zona del TPV");
  });

  test("activar la puerta sigue siendo SOLO de Dirección", () => {
    // Marketing prepara reglas y campañas; empezar a mover dinero de clientes no es comercial.
    assert.match(server, /app\.post\("\/api\/fidelizacion\/puerta", requireAuth\(\["direccion"\]\)/);
    assert.match(server, /app\.post\("\/api\/fidelizacion\/comunicaciones\/:id\/cancelar", requireAuth\(\["direccion"\]\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("REORGANIZAR NO ENCIENDE NADA", () => {
  test("ninguna pantalla escribe al pintarse: se leen datos, no se mandan", () => {
    for (const f of ["renderFidelizacion", "renderCampFidelizacion", "renderClientesFid",
                     "renderFidPrograma"]) {
      const cuerpo = sinComentarios(fn(f));
      assert.ok(!/apiSend\(\s*["'](POST|PUT|DELETE)/.test(cuerpo), `${f} escribe al pintarse`);
    }
  });

  test("la carga de Fidelización solo lee", () => {
    const cuerpo = sinComentarios(fn("loadFidelizacion"));
    assert.ok(!/apiSend\(\s*["'](POST|PUT|DELETE)/.test(cuerpo), "loadFidelizacion escribe algo");
  });

  test("la puerta sigue naciendo cerrada y el arranque no la mueve", () => {
    const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
    assert.match(esquema, /VALUES \(1, 'no_preparado', \?\)\s*\n?\s*ON CONFLICT \(id\) DO NOTHING/);
  });

  test("y activarla sigue exigiendo escribir la palabra", () => {
    // Un botón se pulsa sin leer; escribir obliga a mirar la pantalla que hay encima.
    assert.match(server, /fidConfirmacionValida\(req\.body\?\.confirmacion\)/);
    assert.match(app, /ACTIVAR/);
  });

  test("el nivel de código sigue siendo una constante visible, no una deducción", () => {
    const prep = readFileSync(new URL("../src/modules/fidelizacion/preparacion.js", import.meta.url), "utf8");
    assert.match(prep, /export const NIVEL = "(sombra|completo)";/);
    // Y por sí solo no permite tocar nada que no esté en su lista.
    assert.match(prep, /export function aplicarBloqueo\(guardados, nivel = NIVEL\)/);
  });
});
