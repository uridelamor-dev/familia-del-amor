// OLVIDAR UNA CASILLA NO PUEDE REGALAR EL DESAYUNO A TODO EL LOCAL.
//
// ── EL DESCUIDO QUE ESTO IMPIDE ──────────────────────────────────────────────────────────────
//
// Se publica `ESMORZAR_GIRONA` sin marcar «solo para quien se la haya ganado». A partir de ese
// momento CUALQUIER socio que enseñe su carné en Girona se lleva el desayuno gratis. No hay error,
// no hay aviso, y se descubre cuadrando el mes.
//
// El valor seguro de un `Offer` es EXIGIR DERECHO. Ofrecerlo a todos se pide a propósito, por
// escrito, y con el local y el código delante — porque confirmar la promoción equivocada es el
// otro error caro.
//
// ── Y LA CONCESIÓN MANUAL NO EXISTE ──────────────────────────────────────────────────────────
//
// Hay UN SOLO camino para conceder un derecho: el POST del formulario público, con un formulario
// PUBLICADO y vinculado a mano. Ni pantalla, ni ruta de administración, ni GET. Los tests del
// final lo blindan, porque un derecho que se concede por una visita sería un desayuno por cada
// vez que alguien abre un enlace.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONFIRMACION_GENERAL, confirmacionGeneralValida, exigeConfirmacionGeneral,
  derechoPorDefecto, esGeneral, AVISO_GENERAL, exigeCodigo, TIPOS, elegible,
} from "../src/modules/fidelizacion/promos.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
const agora = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const OFFER = Object.freeze({ clave: "esmorzar-girona-premio", tipo: "oferta_agora",
  codigo_agora: "ESMORZAR_GIRONA", local: "La Tapeta Girona", requiere_derecho: true });

// ── EL VALOR SEGURO POR DEFECTO ──────────────────────────────────────────────────────────────

describe("una promoción Offer nueva nace exigiendo derecho", () => {
  test("sin base, manda el tipo", () => {
    for (const t of Object.keys(TIPOS)) {
      assert.equal(derechoPorDefecto(t, null), exigeCodigo(t),
        `${t}: el valor por defecto no coincide con si lleva código`);
    }
    assert.equal(derechoPorDefecto("oferta_agora", null), true);
    assert.equal(derechoPorDefecto("descuento_euros", null), false);
  });

  test("EDITAR O COPIAR NO CAMBIA EL VALOR GUARDADO", () => {
    // Abrir la ventana de una versión que se publicó abierta a todos no puede marcarla por
    // detrás: el usuario guardaría creyendo que no ha tocado nada.
    assert.equal(derechoPorDefecto("oferta_agora", { requiere_derecho: false }), false);
    assert.equal(derechoPorDefecto("oferta_agora", { requiere_derecho: true }), true);
    assert.equal(derechoPorDefecto("descuento_euros", { requiere_derecho: true }), true);
  });

  test("una base sin la columna —una fila vieja— cae en el valor del tipo", () => {
    assert.equal(derechoPorDefecto("oferta_agora", { nombre: "vieja" }), true);
    assert.equal(derechoPorDefecto("descuento_euros", {}), false);
  });

  test("el panel usa exactamente la misma regla", () => {
    assert.match(panel, /function fidgDerechoDefecto\(tipo, base\) \{/);
    assert.match(panel, /if \(base && typeof base === "object" && "requiere_derecho" in base\) return !!base\.requiere_derecho;/);
    assert.match(panel, /return FIDG_TIPO_CODIGO\.includes\(tipo\);/);
  });

  test("y cambiar el tipo a Offer la marca, salvo decisión explícita", () => {
    assert.match(panel, /let tocado = false;/);
    assert.match(panel, /casilla\?\.addEventListener\("change", \(\) => \{ tocado = true;/);
    assert.match(panel, /if \(lleva && !tocado && casilla\) casilla\.checked = true;/);
  });
});

// ── LA CONFIRMACIÓN ESCRITA ──────────────────────────────────────────────────────────────────

describe("publicar un Offer abierto a todos se pide por escrito", () => {
  test("el texto exacto es «OFRECER A TODOS»", () => {
    assert.equal(CONFIRMACION_GENERAL, "OFRECER A TODOS");
  });

  test("no vale ninguna otra cosa", () => {
    for (const t of ["", "  ", "si", "SI", "ACTIVAR", "ACTIVAR PROMOCIONES", "OFRECERATODOS",
                     "OFRECER A TODO", "todos", null, undefined, true]) {
      assert.equal(confirmacionGeneralValida(t), false, `aceptó «${t}»`);
    }
  });

  test("se acepta escrita con holgura, pero escrita", () => {
    for (const t of ["OFRECER A TODOS", " ofrecer a todos ", "Ofrecer   A   Todos"]) {
      assert.equal(confirmacionGeneralValida(t), true, `rechazó «${t}»`);
    }
  });

  test("se exige al PUBLICAR un Offer sin derecho, y solo ahí", () => {
    const general = { ...OFFER, requiere_derecho: false };
    assert.equal(exigeConfirmacionGeneral(general, { publicar: true }), true);
    // Un borrador no ofrece nada a nadie: pedirla ahí la convertiría en un trámite automático.
    assert.equal(exigeConfirmacionGeneral(general, { publicar: false }), false);
    assert.equal(exigeConfirmacionGeneral(general, {}), false);
    // Con derecho individual no hace falta.
    assert.equal(exigeConfirmacionGeneral(OFFER, { publicar: true }), false);
    // Un descuento en euros no se «regala a todos»: se paga con puntos.
    assert.equal(exigeConfirmacionGeneral({ tipo: "descuento_euros", requiere_derecho: false },
      { publicar: true }), false);
  });

  test("todos los tipos que llevan código la exigen si no hay derecho", () => {
    for (const [t, d] of Object.entries(TIPOS)) {
      assert.equal(exigeConfirmacionGeneral({ tipo: t, requiere_derecho: false }, { publicar: true }),
        !!d.codigo, `${t}`);
    }
  });
});

// ── EL SERVIDOR ES EL QUE DECIDE ─────────────────────────────────────────────────────────────

describe("la confirmación se comprueba EN EL SERVIDOR", () => {
  const s = sinComentarios(server);
  const ruta = s.slice(s.indexOf('app.post("/api/fidelizacion/promos"'),
                       s.indexOf('app.post("/api/fidelizacion/promos/:id/estado"'));

  test("la ruta llama a la regla y a la validación del texto", () => {
    assert.match(ruta, /fidExigeConfirmacionGeneral\(promo, \{ publicar: quierePublicar \}\)/);
    assert.match(ruta, /!fidConfirmacionGeneralValida\(b\.confirmacion_general\)/);
  });

  test("y corta con 409 ANTES de insertar nada", () => {
    const iCheck = ruta.indexOf("fidExigeConfirmacionGeneral");
    const iInsert = ruta.indexOf("INSERT INTO fid_promos");
    assert.ok(iCheck > 0 && iInsert > iCheck,
      "la comprobación tiene que ir antes de escribir la fila");
    assert.match(ruta, /return res\.status\(409\)\.json\(\{ ok: false, requiere_confirmacion_general: true/);
  });

  test("la respuesta dice QUÉ se iba a abrir: local y código", () => {
    // Confirmar la promoción equivocada es tan caro como olvidar la casilla.
    assert.match(ruta, /local: local \|\| null, codigo_agora: promo\.codigo_agora/);
    assert.match(ruta, /confirmacion_exigida: FID_CONFIRMACION_GENERAL/);
  });

  test("NO basta con el panel: la regla no vive solo en el navegador", () => {
    assert.match(panel, /FIDG_TIPO_CODIGO\.includes\(cuerpo\.tipo\) && !cuerpo\.requiere_derecho/);
    // Y el servidor tiene la suya, importada del módulo puro.
    assert.match(s, /exigeConfirmacionGeneral as fidExigeConfirmacionGeneral/);
  });

  test("`requiere_derecho` sigue sin poder encenderse por descuido", () => {
    assert.match(ruta, /requiere_derecho:\s*b\.requiere_derecho === true/);
  });

  test("publicar una general queda firmado en la auditoría", () => {
    assert.match(ruta, /abierta_a_todos: estado === "publicada" && fidExigeConfirmacionGeneral\(promo, \{ publicar: true \}\)/);
  });
});

// ── NADA RETROACTIVO ─────────────────────────────────────────────────────────────────────────

describe("las promociones históricas conservan su comportamiento", () => {
  test("la columna nace en FALSE y ninguna migración la mueve", () => {
    const e = sinComentarios(esquema);
    assert.match(e, /ADD COLUMN IF NOT EXISTS requiere_derecho BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.ok(!/UPDATE fid_promos SET[\s\S]{0,120}requiere_derecho/.test(e),
      "una migración cambia el valor de filas existentes");

    // En el servidor SOLO hay dos UPDATE sobre `fid_promos`, y los dos tocan `estado`:
    //   · finalizar la versión anterior al publicar una nueva,
    //   · pausar o reanudar desde el panel.
    // Ninguno puede tocar `requiere_derecho` ni `codigo_agora`: una versión publicada no cambia
    // de comportamiento por detrás; para eso se publica una versión nueva.
    const updates = [...sinComentarios(server).matchAll(/UPDATE fid_promos SET [^`]*/g)].map((m) => m[0]);
    assert.equal(updates.length, 2, "hay un UPDATE sobre fid_promos que nadie ha auditado");
    for (const u of updates) {
      assert.match(u, /^UPDATE fid_promos SET estado = /, u);
      for (const col of ["requiere_derecho", "codigo_agora", "reward_id", "local"]) {
        assert.ok(!u.includes(col), `un UPDATE toca ${col}: ${u}`);
      }
    }
  });

  test("una promoción vieja sin la columna se sigue ofreciendo a todos, como siempre", () => {
    const vieja = { clave: "vieja", estado: "publicada", local: "Girona", tipo: "descuento_euros",
      limite_cuenta: 1, limite_total: 0, coste_puntos: 0, compra_minima: 0, dias: "[]" };
    const r = elegible(vieja, { ahora: "2026-10-01T09:00:00+02:00", local: "Girona" });
    assert.equal(r.ok, true, "cambió el comportamiento de lo que ya estaba publicado");
  });

  test("el valor por defecto SOLO afecta a la ventana del panel, no a la base", () => {
    // `derechoPorDefecto` es una función del panel. La columna sigue naciendo en FALSE.
    assert.equal(derechoPorDefecto("oferta_agora", null), true);
    assert.match(esquema, /requiere_derecho BOOLEAN NOT NULL DEFAULT FALSE/);
  });
});

// ── EL PANEL ─────────────────────────────────────────────────────────────────────────────────

describe("el panel avisa de lo que va a pasar", () => {
  test("el aviso en vivo mientras se configura", () => {
    assert.match(panel, /Sin marcar, esto se le ofrece a CUALQUIER socio del local/);
    assert.match(panel, /id="pmGeneralAviso"/);
    assert.match(panel, /pmGeneralAviso"\)\?\.classList\.toggle\("hidden", !general\)/);
  });

  test("la ventana de confirmación enseña promoción, LOCAL y CÓDIGO", () => {
    const i = panel.indexOf("function fidgConfirmarGeneral(");
    const j = panel.indexOf("async function fidgPromoGuardar(");
    assert.ok(i > 0 && j > i);
    const fn = panel.slice(i, j);
    assert.match(fn, /<div class="t1">Local<\/div>/);
    assert.match(fn, /<div class="t1">Código en Ágora<\/div>/);
    assert.match(fn, /esc\(local \|\| "TODOS LOS LOCALES"\)/);
    assert.match(fn, /Escribe <b>OFRECER A TODOS<\/b>/);
    // Y dice cuál es la salida correcta si te has equivocado.
    assert.match(fn, /marca «Solo para quien se la haya ganado»/);
  });

  test("cerrar la ventana por el fondo NO deja el guardado colgado", () => {
    // `modal()` cierra solo al pulsar el fondo o la ✕. Sin escuchar eso, la promesa nunca se
    // resolvería y el guardado se quedaría esperando sin ventana y sin aviso.
    const fn = panel.slice(panel.indexOf("function fidgConfirmarGeneral("),
                           panel.indexOf("async function fidgPromoGuardar("));
    assert.match(fn, /if \(e\.target === ov \|\| e\.target\.closest\("\[data-close\]"\)\) cerrar\(null\);/);
  });

  test("el listado marca en rojo una promoción abierta a todos", () => {
    assert.match(panel, /⚠ Se ofrece a cualquier socio elegible del local/);
    assert.equal(AVISO_GENERAL, "Se ofrece a cualquier socio elegible del local");
    assert.match(panel, /p\.codigo_agora && !p\.requiere_derecho/);
  });

  test("`esGeneral` dice lo mismo que pinta el listado", () => {
    assert.equal(esGeneral({ tipo: "oferta_agora", requiere_derecho: false }), true);
    assert.equal(esGeneral({ tipo: "oferta_agora", requiere_derecho: true }), false);
    assert.equal(esGeneral({ tipo: "descuento_euros", requiere_derecho: false }), false);
  });
});

// ── LA CONCESIÓN MANUAL NO EXISTE ────────────────────────────────────────────────────────────

describe("solo hay un camino para conceder un derecho", () => {
  const s = sinComentarios(server);

  test("UN SOLO escritor de `fid_promo_derechos` en todo el proyecto", () => {
    const escrituras = [...s.matchAll(/(INSERT INTO|UPDATE|DELETE FROM) fid_promo_derechos/g)];
    assert.equal(escrituras.length, 1, "hay más de una forma de conceder o quitar un derecho");
    assert.match(s, /INSERT INTO fid_promo_derechos/);
  });

  test("y está dentro del POST del formulario público, no en una ruta de administración", () => {
    const i = s.indexOf('app.post("/api/publico/formulario/:clave"');
    assert.ok(i > 0);
    // El siguiente `app.` después de esa ruta acota su cuerpo.
    const j = s.indexOf("\napp.", i + 10);
    const ruta = s.slice(i, j);
    assert.match(ruta, /INSERT INTO fid_promo_derechos/,
      "el único INSERT no está dentro del alta pública");
  });

  test("NINGÚN GET concede un derecho", () => {
    // Un derecho concedido por una visita sería un desayuno por cada vez que alguien abre el
    // enlace, y bastaría con recargar.
    for (const m of s.matchAll(/app\.get\("([^"]+)"[\s\S]{0,6000}?(?=\napp\.)/g)) {
      assert.ok(!m[0].includes("INSERT INTO fid_promo_derechos"),
        `el GET ${m[1]} concede un derecho`);
    }
  });

  test("no existe ninguna ruta de concesión manual", () => {
    assert.ok(!/app\.(get|post|patch|put|delete)\("[^"]*derecho/i.test(s),
      "hay una ruta de derechos que nadie ha auditado");
  });

  test("UN FORMULARIO EN BORRADOR NO CONCEDE NADA", () => {
    const i = s.indexOf('app.post("/api/publico/formulario/:clave"');
    const ruta = s.slice(i, s.indexOf("\napp.", i + 10));
    assert.match(ruta, /FROM fid_formularios WHERE clave = \? AND estado = 'publicado'/);
    // Y sin formulario, la ruta se va con un 404 antes de llegar a nada.
    assert.match(ruta, /if \(!f \|\| !fidFormAbierto\(f, \{ fechaMadrid: hoy \}\)\.ok\) \{/);
    const iSelect = ruta.indexOf("estado = 'publicado'");
    const iInsert = ruta.indexOf("INSERT INTO fid_promo_derechos");
    assert.ok(iSelect > 0 && iInsert > iSelect);
  });

  test("y SIN VÍNCULO EXPLÍCITO tampoco, aunque el formulario esté publicado", () => {
    const i = s.indexOf('app.post("/api/publico/formulario/:clave"');
    const ruta = s.slice(i, s.indexOf("\napp.", i + 10));
    assert.match(ruta, /if \(f\.promo_clave && qrId\) \{/);
  });

  test("la vista previa del panel no manda nada a ninguna parte", () => {
    const i = panel.indexOf("function fidgFormPrev(");
    // Hasta la SIGUIENTE función de primer nivel, sea `function` o `async function`: la de al
    // lado es `fidgFormGuardar`, que sí manda, y colarla aquí daba un falso positivo.
    const resto = panel.slice(i + 10);
    const m = resto.search(/\n(async )?function /);
    const fn = panel.slice(i, i + 10 + m);
    assert.ok(!/apiSend|fetch\(/.test(fn), "la vista previa hace una petición");
  });

  test("el requisito `derecho_concedible` exige un formulario PUBLICADO y vinculado", () => {
    assert.match(s, /FROM fid_formularios\s*\n?\s*WHERE estado = 'publicado' AND promo_clave IS NOT NULL/);
  });

  test("ni el panel ni el servidor prometen una concesión a mano que no existe", () => {
    for (const [nombre, texto] of [["el panel", panel], ["el servidor", server]]) {
      assert.ok(!/conced\w*\s+(el\s+)?derecho\s+a\s+mano|concesión\s+manual/i.test(texto),
        `${nombre} habla de conceder derechos a mano, y eso no existe`);
    }
  });
});

// ── EL FLUJO COMPLETO ────────────────────────────────────────────────────────────────────────

describe("el recorrido entero, de la campaña al segundo escaneo", () => {
  const AHORA = "2026-10-01T09:00:00+02:00";
  const GIRONA = "La Tapeta Girona";
  const PROMO = { ...OFFER, version: 1, estado: "publicada", reward_id: "fidp:AAAA",
    desde: "2026-09-01", hasta: "2026-10-31", limite_cuenta: 1, limite_total: 0,
    coste_puntos: 0, compra_minima: 0, prioridad: 0, dias: "[]" };
  const ctx = (extra) => ({ ahora: AHORA, local: GIRONA, ...extra });

  test("1-2 · publicada con derecho y con un formulario publicado que lo concede", () => {
    assert.equal(PROMO.requiere_derecho, true);
    assert.equal(exigeConfirmacionGeneral(PROMO, { publicar: true }), false,
      "con derecho individual no hace falta confirmar nada");
  });

  test("3-4 · el alta concede UN derecho, y repetirla no concede otro", () => {
    const s = sinComentarios(server);
    assert.match(s, /`derecho:\$\{f\.promo_clave\}:\$\{qrId\}`/,
      "la clave idempotente es promoción + carné: ni el envío ni el formulario entran");
    assert.match(s, /ON CONFLICT \(clave_idem\) DO NOTHING/);
    assert.match(sinComentarios(esquema), /clave_idem TEXT NOT NULL UNIQUE/);
  });

  test("5 · otro socio del mismo local que no se apuntó NO lo recibe", () => {
    const r = elegible(PROMO, ctx({ derechos: 0 }));
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "sin_derecho");
  });

  test("6 · el que se apuntó SÍ lo recibe", () => {
    assert.equal(elegible(PROMO, ctx({ derechos: 1 })).ok, true);
  });

  test("7 · mostrarlo no lo consume", () => {
    const ruta = sinComentarios(server).slice(
      sinComentarios(server).indexOf('app.get("/api/fidelizacion/agora/:token/member/:memberId"'),
      sinComentarios(server).indexOf('app.post("/api/fidelizacion/agora/:token/factura"'));
    assert.ok(!/INSERT INTO fid_promo_usos/.test(ruta));
    assert.ok(!/INSERT INTO fid_promo_derechos/.test(ruta));
  });

  test("8 · se consume solo con evidencia reconocible, y con su interruptor", () => {
    const a = sinComentarios(agora);
    assert.match(a, /SELECT \* FROM fid_promos WHERE reward_id = \?/,
      "la promoción se busca por el identificador que devuelve la factura");
    assert.match(a, /if \(!programa\?\.promociones\?\.promociones_consumir\)/);
    const iSw = a.indexOf("promo_consumir_apagado");
    const iIns = a.indexOf("INSERT INTO fid_promo_usos");
    assert.ok(iSw > 0 && iIns > iSw);
  });

  test("9 · después de usarla, el segundo escaneo ya no la ofrece", () => {
    const r = elegible(PROMO, ctx({ derechos: 1, usos: 1 }));
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "ya_utilizada");
  });

  test("10 · y el programa de puntos no se ha encendido en ningún momento", () => {
    const s = sinComentarios(server);
    assert.match(s, /FID_SW_DEFECTO = Object\.freeze\(\{ sombra: true, conceder: false, ofrecer: false, consumir: false \}\)/);
    assert.match(esquema, /INSERT INTO fid_puerta \(id, estado, actualizado_en\) VALUES \(1, 'no_preparado', \?\)/);
    // El derecho y el uso no tocan `fid_movimientos`: no hay puntos de por medio.
    const iDer = s.indexOf("INSERT INTO fid_promo_derechos");
    assert.ok(!s.slice(iDer - 400, iDer + 400).includes("fid_movimientos"));
  });
});
