// Promociones creadas en Ágora y devueltas como `Offer`.
//
// ── LAS TRES COSAS QUE CUESTAN DINERO SI FALLAN ─────────────────────────────────────────────
//
//   · UN CÓDIGO «NORMALIZADO» A MAYÚSCULAS DEJA DE COINCIDIR. Ágora compara el `Code` letra a
//     letra, y si no encuentra la promoción IGNORA EL PREMIO EN SILENCIO: el cliente se queda sin
//     su desayuno y nadie se entera. Por eso la regla recorta los extremos y no toca nada más.
//
//   · UNA PROMOCIÓN DE CAPTACIÓN SIN DERECHO SE LA LLEVA TODO EL MUNDO. Una promoción publicada se
//     ofrece a cualquier socio del local: si el desayuno de una campaña no exige haberse apuntado,
//     se lo lleva también quien nunca se apuntó, que es lo contrario de para qué se hizo.
//
//   · ENSEÑAR NO ES CONSUMIR. El uso se escribe al CERRAR la factura, dentro de la transacción y
//     con `clave_idem`. Consumirlo al ofrecerlo dejaría sin premio a quien mira el carné y no pide.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TIPOS, exigeCodigo, normalizarCodigoAgora, CODIGO_AGORA_ERROR, CODIGO_AGORA_MAX,
  elegible, rewardDePromo, puedePublicar, EXPLICACION,
} from "../src/modules/fidelizacion/promos.js";
import { evaluarFactura } from "../src/modules/fidelizacion/puntos.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
const agora = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

/** El texto sin comentarios. Un comentario que habla de `fid_promo_usos` no es código. */
// EL `/*` TIENE QUE EMPEZAR LA LÍNEA.
//
// Con `/\/\*[\s\S]*?\*\//g` a secas, el `"*/*"` de `express.raw({ type: "*/*" })` abría un bloque
// que no cerraba hasta 371 000 caracteres después: se comía el 28 % de `server.js` y cualquier
// `assert.ok(!...)` sobre esa zona pasaba sin comprobar nada.
//
// Todos los bloques de verdad de esta casa son JSDoc al principio de línea, así que basta con
// exigirlo — y así un `*/*` dentro de una cadena sobrevive, que es lo que tiene que pasar.
const sinComentarios = (t) => t.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");

const AHORA = "2026-10-01T09:00:00+02:00";

/** La promoción del desayuno de Girona, tal y como quedaría guardada. */
const GIRONA = Object.freeze({
  clave: "esmorzar-girona-premio", version: 1, local: "La Tapeta Girona",
  nombre: "Esmorzar de Girona", texto_camarero: "Esmorzar gratis", texto_cliente: "Tu esmorzar",
  tipo: "oferta_agora", codigo_agora: "ESMORZAR_GIRONA", codigo_comprobado_en: AHORA,
  estado: "publicada", reward_id: "fidp:AAAAAAAAAAAAAAAA",
  desde: "2026-10-01", hasta: "2026-10-31",
  limite_cuenta: 1, limite_total: 0, coste_puntos: 0, compra_minima: 0,
  requiere_derecho: true, dias: "[]", grupos: "[]",
});

// ── LA REGLA DEL CÓDIGO ──────────────────────────────────────────────────────────────────────

describe("el código de la promoción en Ágora", () => {
  test("se acepta tal cual y NO se toca", () => {
    const r = normalizarCodigoAgora("ESMORZAR_GIRONA");
    assert.equal(r.ok, true);
    assert.equal(r.codigo, "ESMORZAR_GIRONA");
  });

  test("un código válido en minúsculas NO se pasa a mayúsculas", () => {
    // Éste es el test que impide el «arreglo» que rompería todo: Ágora compara letra a letra, y
    // convertir `esmorzar_girona` en `ESMORZAR_GIRONA` puede dejar de coincidir con lo creado allí.
    const r = normalizarCodigoAgora("esmorzar_girona");
    assert.equal(r.ok, true);
    assert.equal(r.codigo, "esmorzar_girona");
  });

  test("solo se recortan los espacios de los extremos", () => {
    for (const crudo of [" ESMORZAR_GIRONA", "ESMORZAR_GIRONA ", "\tESMORZAR_GIRONA\n",
                         " ESMORZAR_GIRONA ", "﻿ESMORZAR_GIRONA"]) {
      const r = normalizarCodigoAgora(crudo);
      assert.equal(r.ok, true, `no se recortó: ${JSON.stringify(crudo)}`);
      assert.equal(r.codigo, "ESMORZAR_GIRONA");
    }
  });

  test("un código vacío se rechaza, no se guarda en blanco", () => {
    for (const crudo of ["", "   ", null, undefined, "\t\n"]) {
      const r = normalizarCodigoAgora(crudo);
      assert.equal(r.ok, false);
      assert.equal(r.motivo, "vacio");
    }
  });

  test("un espacio POR DENTRO se rechaza y se dice con esas palabras", () => {
    const r = normalizarCodigoAgora("ESMORZAR GIRONA");
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "espacios_interiores");
    assert.match(CODIGO_AGORA_ERROR[r.motivo], /espacios/i);
  });

  test("los caracteres que Ágora no admite se rechazan", () => {
    for (const malo of ["ESMORZAR/GIRONA", "ESMORZAR@GIRONA", "ESMORZÁR", "ESMORZAR;DROP",
                        "<b>X</b>", "ESMORZAR%20GIRONA".replace("%20", "%")]) {
      const r = normalizarCodigoAgora(malo);
      assert.equal(r.ok, false, `se coló: ${malo}`);
      assert.equal(r.motivo, "caracter_no_valido");
    }
  });

  test("lo que sí admite: letras, dígitos, guion, guion bajo y punto", () => {
    for (const bueno of ["ESMORZAR_GIRONA", "esmorzar-girona", "PROMO.2026", "A1", "x"]) {
      assert.equal(normalizarCodigoAgora(bueno).ok, true, `se rechazó: ${bueno}`);
    }
  });

  test("hay un tope de longitud", () => {
    assert.equal(normalizarCodigoAgora("A".repeat(CODIGO_AGORA_MAX)).ok, true);
    const r = normalizarCodigoAgora("A".repeat(CODIGO_AGORA_MAX + 1));
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "demasiado_largo");
  });

  test("solo los tipos que mandan `Code` lo exigen", () => {
    assert.equal(exigeCodigo("oferta_agora"), true);
    assert.equal(exigeCodigo("descuento_euros"), false);
    // Y el reparto no se ha inventado aquí: sale de TIPOS.
    for (const [t, d] of Object.entries(TIPOS)) assert.equal(exigeCodigo(t), !!d.codigo);
  });
});

// ── QUÉ SE LE MANDA A ÁGORA ──────────────────────────────────────────────────────────────────

describe("el Reward que recibe Ágora", () => {
  test("es exactamente un Offer con el código guardado", () => {
    const r = rewardDePromo(GIRONA);
    assert.equal(r.Type, "Offer");
    assert.equal(r.Code, "ESMORZAR_GIRONA");
    assert.equal(r.Id, "fidp:AAAAAAAAAAAAAAAA");
  });

  test("el código sale de la FILA GUARDADA, nunca de lo que mande el cliente", () => {
    // Se le cuelan a la fila los campos que un navegador podría mandar. El Reward no los mira.
    const r = rewardDePromo({ ...GIRONA, Code: "OTRA_COSA", code: "OTRA_COSA",
                              codigoAgora: "OTRA_COSA", Type: "CashDiscount" });
    assert.equal(r.Code, "ESMORZAR_GIRONA");
    assert.equal(r.Type, "Offer");
  });

  test("ni `Name` ni `Description` deciden nada: son textos para el camarero", () => {
    const r = rewardDePromo(GIRONA);
    assert.equal(r.Name, "Esmorzar gratis");
    assert.equal(r.Description, "Tu esmorzar");
    // Cambiarlos no cambia ni el tipo ni el código, que es lo único que Ágora obedece.
    const otro = rewardDePromo({ ...GIRONA, nombre: "X", texto_camarero: "Y", texto_cliente: "Z" });
    assert.equal(otro.Type, "Offer");
    assert.equal(otro.Code, "ESMORZAR_GIRONA");
  });

  test("NO se calcula ningún descuento: el 100 % lo decide Ágora", () => {
    const r = rewardDePromo(GIRONA);
    assert.equal(r.Value, undefined, "un Offer no lleva importe: el producto y el precio los pone Ágora");
  });

  test("si el código guardado no es válido NO se manda un Offer a medias", () => {
    // Ágora lo ignoraría en silencio y el camarero creería haber aplicado un premio.
    for (const malo of ["", "   ", "ESMORZAR GIRONA", null]) {
      assert.equal(rewardDePromo({ ...GIRONA, codigo_agora: malo }), null, `se mandó con: ${malo}`);
    }
  });

  test("sin `reward_id` —o sea, en borrador— no hay nada que ofrecer", () => {
    assert.equal(rewardDePromo({ ...GIRONA, reward_id: null }), null);
  });
});

// ── PUBLICAR ─────────────────────────────────────────────────────────────────────────────────

describe("qué hace falta para publicarla", () => {
  test("un borrador con código válido y comprobado se puede publicar", () => {
    assert.deepEqual(puedePublicar(GIRONA).falta, []);
  });

  test("sin código no se publica, y se dice que no se puede inventar", () => {
    const r = puedePublicar({ ...GIRONA, codigo_agora: "" });
    assert.equal(r.ok, false);
    assert.ok(r.falta.some((f) => /inventar|existir allí/i.test(f)), r.falta.join(" · "));
  });

  test("con código inválido tampoco, y el motivo es el del código", () => {
    const r = puedePublicar({ ...GIRONA, codigo_agora: "ESMORZAR GIRONA" });
    assert.equal(r.ok, false);
    assert.ok(r.falta.includes(CODIGO_AGORA_ERROR.espacios_interiores), r.falta.join(" · "));
  });

  test("escribir el código NO basta: hay que haberlo comprobado en Ágora", () => {
    const r = puedePublicar({ ...GIRONA, codigo_comprobado_en: null });
    assert.equal(r.ok, false);
    assert.ok(r.falta.some((f) => /silencio/i.test(f)), r.falta.join(" · "));
  });

  test("un código en un tipo que no lo usa se avisa, no se borra por detrás", () => {
    const r = puedePublicar({ ...GIRONA, tipo: "descuento_euros", valor: 2 });
    assert.equal(r.ok, false);
    assert.ok(r.falta.some((f) => /no lleva código/i.test(f)), r.falta.join(" · "));
  });

  test("una promoción sin local no se publica: ESMORZAR_GIRONA no puede valer en todas partes", () => {
    const r = puedePublicar({ ...GIRONA, local: null });
    assert.equal(r.ok, false);
    assert.ok(r.falta.some((f) => /local/i.test(f)), r.falta.join(" · "));
  });
});

// ── A QUIÉN SE LE OFRECE ─────────────────────────────────────────────────────────────────────

describe("elegibilidad", () => {
  const ctx = (extra = {}) => ({ ahora: AHORA, local: "La Tapeta Girona", derechos: 1, ...extra });

  test("un socio de Girona con derecho y sin usarla, sí", () => {
    assert.equal(elegible(GIRONA, ctx()).ok, true);
  });

  test("un BORRADOR no se ofrece a nadie", () => {
    const r = elegible({ ...GIRONA, estado: "borrador" }, ctx());
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "estado_borrador");
  });

  test("ni pausada, ni finalizada", () => {
    assert.equal(elegible({ ...GIRONA, estado: "pausada" }, ctx()).motivo, "estado_pausada");
    assert.equal(elegible({ ...GIRONA, estado: "finalizada" }, ctx()).motivo, "estado_finalizada");
  });

  test("caducada o todavía sin empezar, no", () => {
    assert.equal(elegible(GIRONA, ctx({ ahora: "2026-11-02T09:00:00+01:00" })).motivo, "ya_termino");
    assert.equal(elegible(GIRONA, ctx({ ahora: "2026-09-20T09:00:00+02:00" })).motivo, "aun_no_empieza");
  });

  test("ESMORZAR_GIRONA no se ofrece en Blanes, Lloret ni Tordera", () => {
    for (const otro of ["La Tapeta Blanes", "La Tapeta Lloret", "La Tapa Ibérica - Tordera"]) {
      const r = elegible(GIRONA, ctx({ local: otro }));
      assert.equal(r.ok, false, `se ofreció en ${otro}`);
      assert.equal(r.motivo, "otro_local");
    }
  });

  test("sin derecho concedido, no — aunque cumpla todo lo demás", () => {
    const r = elegible(GIRONA, ctx({ derechos: 0 }));
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "sin_derecho");
    assert.match(EXPLICACION.sin_derecho, /se apuntó/i);
  });

  test("una promoción de las de siempre NO exige derecho: nada cambia para ellas", () => {
    // `requiere_derecho` nace en FALSE, y con eso lo publicado antes sigue comportándose igual.
    const vieja = { ...GIRONA, requiere_derecho: false };
    assert.equal(elegible(vieja, ctx({ derechos: 0 })).ok, true);
    // Y sin pasar `derechos` siquiera.
    assert.equal(elegible(vieja, { ahora: AHORA, local: "La Tapeta Girona" }).ok, true);
  });

  test("un uso por cliente: la segunda vez, no", () => {
    assert.equal(elegible(GIRONA, ctx({ usos: 1 })).motivo, "ya_utilizada");
  });

  test("dos clientes distintos la usan una vez cada uno", () => {
    // La elegibilidad es POR CUENTA: `usos` son los de esa cuenta, no los de la promoción.
    assert.equal(elegible(GIRONA, ctx({ usos: 0, usosTotales: 1 })).ok, true);
    assert.equal(elegible(GIRONA, ctx({ usos: 0, usosTotales: 57 })).ok, true);
  });

  test("el tope total sí la agota para todos", () => {
    assert.equal(elegible({ ...GIRONA, limite_total: 50 }, ctx({ usosTotales: 50 })).motivo, "agotada");
  });
});

// ── EL CABLEADO: LO QUE NO SE PUEDE COMPROBAR SIN BASE DE DATOS ──────────────────────────────

describe("cableado del servidor", () => {
  const s = sinComentarios(server);

  test("el endpoint valida el código EN EL SERVIDOR, no solo en el navegador", () => {
    assert.match(s, /fidExigeCodigo\(String\(b\.tipo\)\)/,
      "la ruta tiene que preguntar si ese tipo lleva código");
    assert.match(s, /fidCodigoAgora\(b\.codigo_agora\)/,
      "y pasarlo por la misma regla que el módulo");
  });

  test("lo que se guarda es el código YA validado, no el crudo del navegador", () => {
    assert.match(s, /codigo_agora:\s*codigoAgora/);
    assert.doesNotMatch(s, /codigo_agora:\s*String\(b\.codigo_agora/,
      "volver a leer el cuerpo aquí se salta la validación");
  });

  test("`requiere_derecho` solo se enciende si se pide explícitamente", () => {
    assert.match(s, /requiere_derecho:\s*b\.requiere_derecho === true/,
      "cualquier otra cosa —'0', 1, 'si'— no puede encenderlo");
  });

  test("al escanear se cuenta el derecho de ESA cuenta", () => {
    assert.match(s, /FROM fid_promo_derechos\s*\n?\s*WHERE clave = \? AND qr_id = \?/,
      "el derecho se consulta por promoción y por carné");
    assert.match(s, /importeCentimos: null, derechos/,
      "y viaja a la elegibilidad");
  });

  test("ENSEÑAR NO CONSUME: la ruta del carné no escribe en el libro de usos", () => {
    // La ruta del escaneo va de `member/:memberId` hasta el `res.status(200)` que contesta.
    const i = s.indexOf('app.get("/api/fidelizacion/agora/:token/member/:memberId"');
    const j = s.indexOf('app.post("/api/fidelizacion/agora/:token/factura"');
    assert.ok(i > 0 && j > i);
    const ruta = s.slice(i, j);
    assert.doesNotMatch(ruta, /INSERT INTO fid_promo_usos/,
      "ofrecer un premio no puede gastarlo: el camarero mira el carné y el cliente no pide nada");
    assert.match(ruta, /SELECT COUNT\(\*\)::int AS n FROM fid_promo_usos/,
      "solo se LEE, para saber si ya la gastó");
  });

  test("el vínculo formulario → promoción es explícito y tiene que existir", () => {
    assert.match(s, /SELECT 1 AS hay FROM fid_promos WHERE clave = \?/,
      "una clave con errata deja un formulario que no concede nada");
    assert.doesNotMatch(s, /LIKE\s*'%'\s*\|\|\s*promoClave/,
      "nunca se busca una promoción «parecida»");
  });

  test("el alta concede el derecho una sola vez, y solo si hay vínculo", () => {
    // `qrId` ya no hace falta en la condición: dentro de la transacción el carné está
    // garantizado —si no se pudo emitir, se ha salido antes—, así que el único requisito que
    // queda es el que importa: que el formulario tenga una promoción vinculada a mano.
    assert.match(s, /if \(f\.promo_clave\) \{/,
      "sin promoción vinculada, el alta no concede nada");
    assert.match(s, /INSERT INTO fid_promo_derechos[\s\S]{0,260}ON CONFLICT \(clave_idem\) DO NOTHING/,
      "recargar o reenviar el formulario no puede dar dos desayunos");
    assert.match(s, /`derecho:\$\{f\.promo_clave\}:\$\{qr\.id\}`/,
      "la clave idempotente es la promoción + el carné, así que reutilizar carné no duplica");
  });

  test("una baja comercial NO borra un derecho concedido", () => {
    assert.doesNotMatch(s, /DELETE FROM fid_promo_derechos/);
    assert.doesNotMatch(sinComentarios(agora), /DELETE FROM fid_promo_derechos/);
  });
});

describe("cableado del cierre de factura", () => {
  const a = sinComentarios(agora);

  test("el uso se escribe al CERRAR, dentro de la transacción y con clave idempotente", () => {
    assert.match(a, /INSERT INTO fid_promo_usos[\s\S]{0,400}ON CONFLICT \(clave_idem\) DO NOTHING/,
      "un reenvío de la misma factura no puede contar dos veces");
    assert.match(a, /claveMov\(idemV, local, "promo", extracto\.globalId, promoReward\.clave\)/,
      "la clave lleva el documento y la promoción");
  });

  test("la promoción se busca por su `reward_id`, no por lo que diga la factura", () => {
    assert.match(a, /SELECT \* FROM fid_promos WHERE reward_id = \?/);
    assert.match(a, /rid\.startsWith\("fidp:"\)/);
  });

  test("un Offer de otro local se rechaza y no consume nada", () => {
    assert.match(a, /promo_de_otro_local/);
    const i = a.indexOf("promo_de_otro_local");
    const j = a.indexOf("INSERT INTO fid_promo_usos");
    assert.ok(i > 0 && j > i, "el rechazo tiene que ir ANTES de escribir el uso");
  });

  test("un Offer desconocido no encuentra promoción, así que no escribe ningún uso", () => {
    // `promoReward` sale de la consulta por `reward_id`; si no hay fila, el bloque entero se salta.
    assert.match(a, /if \(promoReward\) \{/);
  });

  test("el derecho se REVALIDA al cerrar, con el cerrojo puesto", () => {
    assert.match(a, /promoReward\.requiere_derecho[\s\S]{0,260}FROM fid_promo_derechos/,
      "entre ofrecer y cobrar pasan minutos: lo que decide es la base al cerrar");
  });

  test("una devolución total devuelve el premio, marcándolo y sin borrar la fila", () => {
    assert.match(a, /UPDATE fid_promo_usos SET estado = 'revertido'/);
    assert.match(a, /WHERE factura_id = \? AND estado = 'usado'/,
      "el filtro por 'usado' es lo que lo hace idempotente");
    assert.doesNotMatch(a, /DELETE FROM fid_promo_usos/,
      "el libro de premios es append-only, igual que el de puntos");
  });

  test("consumir con el interruptor apagado se rechaza", () => {
    // Y es SU interruptor, no el del programa de puntos: ver `promociones-puerta.test.js`.
    assert.match(a, /if \(!programa\?\.promociones\?\.promociones_consumir\)[\s\S]{0,240}FacturaRechazada/);
  });
});

// ── LA MIGRACIÓN ─────────────────────────────────────────────────────────────────────────────

describe("la migración es aditiva", () => {
  const e = sinComentarios(esquema);

  test("no hay DROP ni TRUNCATE sobre nada de promociones", () => {
    assert.doesNotMatch(e, /DROP\s+TABLE[\s\S]{0,40}fid_promo/i);
    assert.doesNotMatch(e, /TRUNCATE[\s\S]{0,40}fid_promo/i);
    assert.doesNotMatch(e, /DROP\s+COLUMN/i);
  });

  test("`requiere_derecho` nace en FALSE: lo publicado antes no cambia de comportamiento", () => {
    assert.match(e, /ADD COLUMN IF NOT EXISTS requiere_derecho BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.doesNotMatch(e, /requiere_derecho BOOLEAN NOT NULL DEFAULT TRUE/);
  });

  test("`promo_clave` nace NULL: ningún formulario queda vinculado por la migración", () => {
    // Va por el MISMO bucle aditivo que el resto de columnas de `fid_formularios`. Sacarla de ahí
    // con un ALTER suelto rompe el candado de `formulario-campana.test.js`, que comprueba que
    // todas se añaden por el mismo sitio.
    assert.match(e, /"promo_clave TEXT"\]\) \{/);
    assert.doesNotMatch(e, /promo_clave TEXT NOT NULL/);
    assert.doesNotMatch(e, /promo_clave TEXT DEFAULT/);
  });

  test("el libro de derechos tiene la clave idempotente única", () => {
    assert.match(e, /CREATE TABLE IF NOT EXISTS fid_promo_derechos[\s\S]{0,400}clave_idem TEXT NOT NULL UNIQUE/);
  });

  test("NINGUNA migración inserta ESMORZAR_GIRONA ni toca lo que ya hay en producción", () => {
    assert.doesNotMatch(e, /ESMORZAR_GIRONA/i);
    assert.doesNotMatch(sinComentarios(server), /INSERT INTO fid_promos[\s\S]{0,200}ESMORZAR/i);
    assert.doesNotMatch(e, /UPDATE fid_promos SET (codigo_agora|requiere_derecho|estado)/i);
  });
});

// ── SEGURIDAD Y PUERTA ───────────────────────────────────────────────────────────────────────

describe("permisos y puerta", () => {
  const s = sinComentarios(server);

  test("administrar promociones es de Dirección y Marketing", () => {
    assert.match(s, /app\.post\("\/api\/fidelizacion\/promos", requireAuth\(PROMOS_ROLES\)/);
    assert.match(s, /app\.get\("\/api\/fidelizacion\/promos", requireAuth\(PROMOS_ROLES\)/);
    assert.match(s, /const PROMOS_ROLES = \["direccion", "marketing"\]/);
  });

  test("las rutas sensibles de la integración siguen siendo solo de Dirección", () => {
    for (const r of ["/api/fidelizacion/integracion", "/api/fidelizacion/puerta"]) {
      const i = s.indexOf(`app.post("${r}"`);
      assert.ok(i > 0, `no está ${r}`);
      assert.match(s.slice(i, i + 120), /requireAuth\(\["direccion"\]\)/);
    }
  });

  test("los puntos y la puerta siguen apagados de fábrica", () => {
    assert.match(s, /FID_SW_DEFECTO = Object\.freeze\(\{ sombra: true, conceder: false, ofrecer: false, consumir: false \}\)/);
    assert.match(s, /if \(!out\.conceder\) \{ out\.ofrecer = false; out\.consumir = false; \}/,
      "ofrecer sin conceder daría descuentos sobre puntos que no se están dando");
    assert.match(s, /let estadoPuerta = "no_preparado"/,
      "sin fila de puerta, se supone lo más cerrado");
    assert.match(s, /\?\.estado \|\| "no_preparado"/,
      "y si la lectura falla, tampoco se abre");
  });

  test("la respuesta del carné no filtra teléfono, token ni MemberId", () => {
    const i = s.indexOf('app.get("/api/fidelizacion/agora/:token/member/:memberId"');
    const j = s.indexOf('app.post("/api/fidelizacion/agora/:token/factura"');
    const ruta = s.slice(i, j);
    assert.doesNotMatch(ruta, /telefono/, "el teléfono no sale en la respuesta al TPV");
    assert.match(ruta, /fidHash\(memberId\)\.slice\(0, 16\)/,
      "en el registro va un hash corto, nunca el MemberId entero");
  });
});

// ── EL PANEL ─────────────────────────────────────────────────────────────────────────────────

describe("el panel", () => {
  const p = sinComentarios(panel);

  test("el campo del código existe, con su ayuda y su ejemplo", () => {
    assert.match(p, /Código de la promoción en Ágora/);
    assert.match(p, /ESMORZAR_GIRONA/, "el ejemplo tiene que verse");
    assert.match(p, /coincidir <b>exactamente<\/b> con el código creado en Ágora/);
  });

  test("avisa de que guardar el código no crea la promoción en Ágora", () => {
    assert.match(p, /no crea la promoción dentro de Ágora/);
  });

  test("solo se enseña para los tipos que llevan código", () => {
    assert.match(p, /FIDG_TIPO_CODIGO = \["oferta_agora", "producto_gratis", "campana_unica", "premio_campana"\]/);
    assert.match(p, /pmAgora"\)\?\.classList\.toggle\("hidden", !lleva\)/);
  });

  test("se valida en el navegador antes de mandar nada", () => {
    assert.match(p, /const err = fidgCodigoError\(cuerpo\.codigo_agora\);/);
    assert.match(p, /if \(err\) \{ fidgCodigoPinta\(\); toast\(err\); return; \}/);
  });

  test("y si el tipo no lo usa, el código ni se manda", () => {
    assert.match(p, /FIDG_TIPO_CODIGO\.includes\(fgVal\("pmTipo"\)\) \? fgVal\("pmCodigo"\) : ""/);
  });

  test("el listado enseña mecanismo, local, vigencia, usos y estado", () => {
    assert.match(p, /Ágora · \$\{esc\(p\.codigo_agora\)\}/);
    assert.match(p, /uso\$\{lim === 1 \? "" : "s"\} por cliente/);
    assert.match(p, /esc\(p\.local \|\| "todos los locales"\)/);
  });

  test("hay un puente desde los cupones hacia Fidelización", () => {
    // Es la causa del informe: quien busca el «Offer Code» aterriza en la pestaña equivocada.
    assert.match(p, /¿Buscas el <b>código de una promoción creada en Ágora<\/b>\? No es aquí\./);
  });

  test("el vínculo formulario → promoción se elige a mano, con el aviso de que no se deduce", () => {
    assert.match(p, /Promoción que concede al apuntarse/);
    assert.match(p, /Ninguna — apuntarse no da derecho a nada/);
    assert.match(p, /no se deduce del nombre ni del parecido/);
    assert.match(p, /promo_clave: fgVal\("ffPromo"\)/);
  });
});

// ── LAS DOS FAMILIAS DE PREMIO NO SE PISAN ───────────────────────────────────────────────────
//
// El fallo que esto blinda: una promoción aplicada en caja llegaba al camino de los puntos, no
// encontraba ninguna REGLA con ese `reward_id` —claro: es una promoción, no una regla— y la
// factura se rechazaba con «ese descuento ya no es válido». O sea, el premio se ofrecía, el
// camarero lo aplicaba, y al cobrar no se podía cerrar la factura.

describe("una promoción aplicada no pasa por el camino de los puntos", () => {
  const SW = { sombra: true, conceder: true, ofrecer: true, consumir: true };
  const PROMO_FILA = { ...GIRONA };
  /** Una factura con el premio aplicado, tal y como la guía lo pone: dentro de las líneas. */
  const facturaCon = (reward) => ({
    DocumentType: "Invoice", TotalAmount: 12.5,
    InvoiceItems: [{ LoyaltyProgram: { Rewards: [reward] } }],
    Payments: [{ Amount: 12.5 }],
  });
  const ctx = (json, extra = {}) => ({
    json, extracto: { miembros: [{ qrId: 7, hash: "abc" }], globalId: "G-1" },
    regla: null, local: "La Tapeta Girona", interruptores: SW, saldoDisponible: 0,
    ahora: AHORA, ...extra,
  });

  test("con la promoción reconocida, la factura NO se rechaza", () => {
    const d = evaluarFactura(ctx(facturaCon({ Id: GIRONA.reward_id, Type: "Offer", Code: "ESMORZAR_GIRONA" }),
      { promoReward: PROMO_FILA }));
    assert.notEqual(d.accion, "rechazar",
      `se rechazó con «${d.motivo}»: el premio se ofrece y luego no se puede cobrar`);
  });

  test("y NO consume ni un punto: la casa regala un producto, no canjea saldo", () => {
    const d = evaluarFactura(ctx(facturaCon({ Id: GIRONA.reward_id, Type: "Offer", Code: "ESMORZAR_GIRONA" }),
      { promoReward: PROMO_FILA }));
    assert.equal(d.consumo, null);
  });

  test("una promoción NO necesita que haya un programa de puntos publicado", () => {
    // Se ACEPTA y se cierra. `motivo: sin_regla_vigente` aquí no es un rechazo: es la explicación
    // de por qué no se dan puntos por esta factura. Las dos cosas son independientes.
    const d = evaluarFactura(ctx(facturaCon({ Id: GIRONA.reward_id, Type: "Offer", Code: "ESMORZAR_GIRONA" }),
      { regla: null, promoReward: PROMO_FILA }));
    assert.equal(d.accion, "aceptar");
    assert.equal(d.consumo, null, "no se canjea saldo por un producto que regala la casa");
  });

  // Con una regla de puntos vigente, para que el motivo que salga sea el del reward y no el de
  // «aquí no hay programa de puntos», que tapa a los demás por ir antes.
  const REGLA = { id: 1, version: 1, ambito: "local", local: "La Tapeta Girona",
                  reward_id: "fid:REGLA", puntos_necesarios: 10, descuento_euros: 5,
                  consumo_minimo: 0, puntos_por_euro: 1 };

  test("un Offer que NO cuadra con la promoción resuelta NO se acepta", () => {
    // Otro `Id` cualquiera: no se le regala el paso solo por llevar `Type: "Offer"`.
    const d = evaluarFactura(ctx(facturaCon({ Id: "fidp:OTRACOSA", Type: "Offer", Code: "ESMORZAR_GIRONA" }),
      { regla: REGLA, promoReward: PROMO_FILA }));
    assert.equal(d.accion, "rechazar");
    assert.equal(d.motivo, "reward_no_reconocido");
    assert.ok(!d.consumo, "no se atribuye ningún consumo a un premio que no reconocemos");
  });

  test("un Offer SIN `Id` se rechaza: nunca se da por bueno un premio que no podemos atribuir", () => {
    // ES EL CASO QUE IMPORTA si Ágora no devolviera nuestro identificador en la factura cerrada:
    // se RECHAZA —visible, en la barra, con el camarero delante— en vez de aceptarse sin apuntar
    // el uso, que es lo que dejaría la promoción gratis para siempre y sin que nadie se enterara.
    const d = evaluarFactura(ctx(facturaCon({ Type: "Offer", Code: "ESMORZAR_GIRONA" }), { regla: REGLA }));
    assert.equal(d.accion, "rechazar");
    assert.equal(d.motivo, "reward_no_reconocido");
    assert.ok(!d.consumo);
  });

  test("y sin programa de puntos tampoco se cuela: se rechaza igual", () => {
    for (const R of [{ Id: "fidp:OTRA", Type: "Offer", Code: "X" },
                     { Type: "Offer", Code: "ESMORZAR_GIRONA" },
                     { Id: "fid:XXXX", Type: "CashDiscount", Value: 5 }]) {
      const d = evaluarFactura(ctx(facturaCon(R), { promoReward: PROMO_FILA }));
      assert.equal(d.accion, "rechazar", `se aceptó: ${JSON.stringify(R)}`);
      assert.ok(!d.consumo);
    }
  });

  test("un descuento de PUNTOS con su regla sigue exigiendo saldo", () => {
    const d = evaluarFactura(ctx(facturaCon({ Id: "fid:REGLA", Type: "CashDiscount", Value: 5 }),
      { regla: REGLA, reglaReward: REGLA, saldoDisponible: 0 }));
    assert.equal(d.accion, "rechazar");
    assert.equal(d.motivo, "saldo_insuficiente");
  });

  test("dos premios en la misma factura se rechazan, venga de donde venga", () => {
    const json = { DocumentType: "Invoice", TotalAmount: 12.5, Payments: [{ Amount: 12.5 }],
      InvoiceItems: [{ LoyaltyProgram: { Rewards: [
        { Id: GIRONA.reward_id, Type: "Offer", Code: "ESMORZAR_GIRONA" },
        { Id: "fid:XXXX", Type: "CashDiscount", Value: 5 }] } }] };
    const d = evaluarFactura(ctx(json, { promoReward: PROMO_FILA }));
    assert.equal(d.accion, "rechazar");
    assert.equal(d.motivo, "varios_rewards");
  });
});
