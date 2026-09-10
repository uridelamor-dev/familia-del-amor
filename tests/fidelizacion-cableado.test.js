// La fidelización de Ágora, cableada. Introspección sobre `server.js` y el esquema.
//
// Blindan lo que, cuando se rompe, no da ningún error visible: un 4xx que deja al camarero sin
// poder cerrar la factura, un `accepted` contestado antes de que la base lo haya confirmado, o una
// búsqueda de socio por teléfono, que convertiría un identificador opaco en un dato adivinable.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizarEntrada } from "../src/modules/promos/promos.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
const modulo = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
const soloCodigo = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const codigo = soloCodigo(server);

const validacion = server.slice(server.indexOf('app.get("/api/fidelizacion/agora/:token/member/:memberId"'),
                                server.indexOf('app.post("/api/fidelizacion/agora/:token/factura"'));
const factura = server.slice(server.indexOf('app.post("/api/fidelizacion/agora/:token/factura"'),
                             server.indexOf('app.post("/api/fidelizacion/integracion"'));

describe("las dos rutas que llama Ágora", () => {
  test("la validación es GET, y solo GET", () => {
    assert.match(codigo, /app\.get\("\/api\/fidelizacion\/agora\/:token\/member\/:memberId"/);
    for (const m of ["post", "put", "delete", "patch", "all"]) {
      assert.ok(!new RegExp(`app\\.${m}\\("/api/fidelizacion/agora/:token/member`).test(codigo), m);
    }
  });

  test("la factura es POST", () => {
    assert.match(codigo, /app\.post\("\/api\/fidelizacion\/agora\/:token\/factura"/);
  });

  test("el cuerpo llega en crudo, antes de que express.json lo parsee", () => {
    // Hace falta tal cual para calcular su hash: un JSON reformateado daría otro hash y un reenvío
    // pasaría por factura nueva.
    assert.match(codigo, /app\.use\("\/api\/fidelizacion\/agora", express\.raw\(/);
    const iRaw = codigo.indexOf('app.use("/api/fidelizacion/agora", express.raw(');
    const iJson = codigo.indexOf("app.use(express.json())");
    assert.ok(iRaw > 0 && iJson > iRaw, "express.json() se lo come antes");
  });
});

describe("NUNCA un error que bloquee la caja", () => {
  test("los códigos que devuelve son EXACTAMENTE los tres previstos", () => {
    // CORREGIDO. La primera versión exigía que aquí no saliera nunca un 5xx, y estaba mal: un
    // fallo técnico se contestaba con `rejected`, que para Ágora significa «recibido, no lo
    // quiero» — no lo reenvía. Si la base se cayó, eso es una pérdida silenciosa.
    //
    //   200 → decisión de negocio de la que estamos seguros (accepted o rejected)
    //   404 → el token no vale, antes de mirar nada
    //   500 → no sabemos si se guardó. Ágora conserva la posibilidad de reenviar.
    const estados = [...factura.matchAll(/res\.status\((\d+)\)/g)].map((m) => Number(m[1]));
    assert.deepEqual([...new Set(estados)].sort((a, b) => a - b), [200, 404, 500], `estados devueltos: ${estados}`);
  });

  test("un JSON malformado se rechaza con 200, no con 400", () => {
    assert.match(factura, /Status: "rejected", RejectReason: "Formato no reconocido"/);
    assert.ok(!/res\.status\(400\)/.test(factura));
  });

  test("un fallo interno devuelve 500, y NUNCA accepted ni rejected", () => {
    // Es el arreglo. Un 500 impide cerrar la factura —el camarero desasocia al participante y
    // cobra sin fidelización, que está documentado— pero Ágora puede reenviarla. Un `rejected`
    // habría perdido la visita, y mañana los puntos.
    assert.match(factura, /catch \(e\) \{[\s\S]*?return res\.status\(500\)\.json\(\{ Status: "error" \}\)/);
  });

  test("y no se le cuenta al TPV qué ha fallado por dentro", () => {
    assert.ok(!/RejectReason: [^"]*e\.message/.test(factura));
    // El mensaje de pg lleva dentro el hash del token, la IP o el usuario: se registra el `code`,
    // que sirve para diagnosticar, y nada más.
    assert.match(factura, /console\.error\(lineaErrorSql\("\[fidelizacion\] factura", e\)\)/);
  });
});

describe("`accepted` solo después de confirmar en PostgreSQL", () => {
  test("la escritura va en una transacción con COMMIT", () => {
    // La transacción vive en el módulo desde que hizo falta poder probar su ROLLBACK: ver
    // `crearTransaccion`. `server.js` solo la construye con el pool de verdad.
    assert.match(codigo, /const fidTransaccion = fidCrearTransaccion\(\{ pool, toPositional \}\)/);
    assert.match(modulo, /await client\.query\("BEGIN"\)/);
    assert.match(modulo, /await client\.query\("COMMIT"\)/);
    assert.match(modulo, /await client\.query\("ROLLBACK"\)/);
    assert.match(modulo, /SET LOCAL statement_timeout = \$\{Number\(timeoutMs\) \|\| 5000\}/);
  });

  test("la respuesta va DESPUÉS de la transacción", () => {
    // Si se contestara antes y la transacción fallara, Ágora daría por buena una factura que no
    // existe en ningún sitio.
    const iTx = factura.indexOf("await fidTransaccion(");
    const iResp = factura.indexOf("fidRespuestaFactura({})");
    assert.ok(iTx > 0 && iResp > iTx, "se responde antes de confirmar");
  });

  test("la idempotencia la impone la BASE, no una comprobación previa", () => {
    // Por `clave_factura`, que lleva el local dentro: la guía no garantiza que el GlobalId sea
    // único entre locales, y un índice global haría que una factura tapara la de otro local.
    assert.match(modulo, /ON CONFLICT \(clave_factura\) DO NOTHING RETURNING id/);
    assert.match(modulo, /ON CONFLICT \(clave_idem\) DO NOTHING RETURNING id/);
    assert.match(esquema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_factura_clave ON fid_facturas \(clave_factura\)/);
    assert.match(esquema, /DROP INDEX IF EXISTS idx_fid_factura_global/, "el índice viejo debe retirarse");
    assert.match(esquema, /global_id_tipo TEXT NOT NULL DEFAULT 'oficial'/, "hay que saber si la clave es oficial o débil");
    assert.match(esquema, /clave_idem TEXT NOT NULL UNIQUE/);
  });
});

describe("el socio se busca SOLO por su token opaco", () => {
  test("la validación delega en la resolución común, que solo mira token o codigo", () => {
    // CORREGIDO. Antes exigía `WHERE token` aquí mismo, y ese candado fijaba justo el fallo: el
    // código de ocho dígitos —el respaldo impreso del QR— no encontraba a nadie y Ágora daba 404.
    // Ahora la consulta vive en `resolverMiembro`, compartida con «Buscar socio».
    assert.match(validacion, /fidResolverMiembro\(/);
    assert.ok(!/FROM pro_qr/.test(validacion), "la ruta vuelve a consultar por su cuenta");

    const modulo = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
    const f = modulo.slice(modulo.indexOf("export async function resolverMiembro"), modulo.indexOf("export function carnetUtilizable"));
    const consultas = [...f.matchAll(/FROM pro_qr WHERE \$\{(\w+)\}/g)].map((m) => m[1]);
    assert.deepEqual(consultas, ["columna"], "la columna debe salir del tipo de entrada, no del contenido");
    assert.match(f, /const columna = e\.tipo === "token" \? "token" : "codigo"/);
  });

  test("no se busca por teléfono, correo, DNI ni nombre en ninguna ruta de fidelización", () => {
    const zona = server.slice(server.indexOf("// FIDELIZACIÓN CON ÁGORA · FASE 1"), server.indexOf('app.get("/", (req, res)'));
    for (const campo of ["telefono", "correo", "email", "dni", "nombre ="]) {
      assert.ok(!new RegExp(`WHERE[^;]*${campo}`, "i").test(zona), `se busca por ${campo}`);
    }
  });

  test("el token de integración se compara en tiempo constante", () => {
    assert.match(codigo, /function fidMismoHash\(a, b\)/);
    assert.match(codigo, /crypto\.timingSafeEqual/);
    assert.match(codigo, /WHERE token_hash = \?/);
  });

  test("del token solo se guarda el hash y cuatro caracteres de pista", () => {
    assert.match(esquema, /token_hash TEXT NOT NULL UNIQUE/);
    assert.match(esquema, /token_pista TEXT/);
    assert.ok(!/token TEXT/.test(esquema), "el esquema guarda el token en claro");
  });
});

describe("límites y auditoría", () => {
  test("hay rate limit propio en las dos rutas públicas", () => {
    assert.match(validacion, /fidRateLimit\(req, res, "val"\)/);
    assert.match(factura, /fidRateLimit\(req, res, "fac"\)/);
    assert.match(codigo, /res\.status\(429\)/);
  });

  test("hay límite de tamaño del JSON, en el middleware y en el manejador", () => {
    assert.match(codigo, /express\.raw\(\{ type: "\*\/\*", limit: FID_MAX_CUERPO \}\)/);
    assert.match(factura, /bruto\.length > FID_MAX_CUERPO/);
  });

  test("se audita generar, revocar, activar, desactivar, recibir, duplicado y conflicto", () => {
    for (const a of ["integracion_generada", "integracion_revocada", "integracion_activada",
                     "integracion_desactivada", "factura_recibida", "factura_duplicada", "factura_conflicto"]) {
      assert.ok(codigo.includes(a), `falta la auditoría de ${a}`);
    }
    assert.match(codigo, /ficAuditar\("fidelizacion"/);
  });

  test("la gestión es solo de Dirección", () => {
    const rutas = [...codigo.matchAll(/app\.(get|post)\("\/api\/fidelizacion\/(?!agora)[^"]*", ([^,]+),/g)];
    assert.ok(rutas.length >= 6, `solo ${rutas.length} rutas de gestión`);
    // r[1] es el método y r[2] el middleware de autenticación: la regex tiene DOS grupos.
    for (const r of rutas) assert.equal(r[2].trim(), 'requireAuth(["direccion"])', r[0]);
  });
});

describe("los logs y las respuestas no llevan nada", () => {
  test("el token nunca se escribe en un log", () => {
    const zona = server.slice(server.indexOf("// FIDELIZACIÓN CON ÁGORA · FASE 1"), server.indexOf('app.get("/", (req, res)'));
    assert.ok(!/console\.[a-z]+\([^;]*req\.params\.token/.test(zona));
    assert.ok(!/console\.[a-z]+\([^;]*\btoken\b(?!_)/.test(zona), "se imprime un token");
  });

  test("del socio solo se registra un hash, nunca el MemberId entero", () => {
    assert.match(validacion, /fidHash\(memberId\)\.slice\(0, 16\)/);
    assert.match(esquema, /member_hash TEXT/);
    assert.ok(!/member_id TEXT/.test(esquema), "el esquema guarda el MemberId entero");
  });

  test("el 404 de la validación no dice por qué", () => {
    // Si dijera «caducado» o «no existe», el TPV —y quien pruebe tokens— aprendería algo.
    assert.match(validacion, /return res\.status\(404\)\.json\(\{\}\)/);
  });

  test("el cuerpo de la factura se cifra con DATA_ENC_KEY y su propio dominio", () => {
    assert.match(factura, /secCifrar\(bruto\.toString\("utf8"\), LLAVERO, DOMINIOS\.FIDELIZACION\)/);
    assert.match(codigo, /LLAVERO\.puedeCifrar \? secCifrar/, "sin clave debe guardarse null, no texto en claro");
  });
});

describe("compatibilidad de los QR — la transición", () => {
  test("el kiosco sigue leyendo el QR ANTIGUO, con su URL", () => {
    // Los carnés ya repartidos llevan `…/tarjeta.html?t=<token>`. Si dejaran de leerse, el cliente
    // se entera en la barra con el camarero delante.
    const r = normalizarEntrada("https://familia.example/tarjeta.html?t=AbC-123_xyzAbC123xyz");
    assert.deepEqual(r, { tipo: "token", valor: "AbC-123_xyzAbC123xyz" });
  });

  test("y lee el QR NUEVO, que es el token desnudo que espera Ágora", () => {
    const desnudo = "AbC-123_xyzAbC123xyz";
    assert.deepEqual(normalizarEntrada(desnudo), { tipo: "token", valor: desnudo });
  });

  test("el mismo token vale en los dos formatos", () => {
    const t = "Zz9_-AbCdEfGhIjKlMnOp";
    assert.equal(normalizarEntrada(t).valor, normalizarEntrada(`https://x/cupon.html?t=${t}`).valor);
  });

  test("y el código de ocho dígitos tecleado sigue funcionando", () => {
    assert.deepEqual(normalizarEntrada("1234 5678"), { tipo: "codigo", valor: "12345678" });
  });
});

describe("la pantalla de Dirección", () => {
  const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

  test("está dentro de la vista de Ágora, que ya es solo de Dirección", () => {
    assert.match(panel, /Fidelización Ágora · Piloto Lloret/);
    assert.match(panel, /function renderFidPiloto\(\)/);
    assert.match(panel, /loadFidPiloto\(\)/);
    assert.match(panel, /agora: \["direccion"\]/, "la vista de Ágora ha dejado de ser solo de Dirección");
  });

  test("dice a la cara que en esta fase no hay premios", () => {
    const f = panel.slice(panel.indexOf("function renderFidPiloto()"), panel.indexOf("async function loadFidPiloto()"));
    assert.match(f, /No se conceden premios ni descuentos/);
  });

  test("NO hay ningún botón que toque la configuración del TPV", () => {
    const f = panel.slice(panel.indexOf("function renderFidPiloto()"), panel.indexOf("async function fidMiembro()"));
    for (const a of ["ag-save", "ag-del", "ag-probe", "ag-descubrir", "ag-sync"]) {
      assert.ok(!f.includes(a), `el piloto tiene un botón que toca el TPV: ${a}`);
    }
  });

  test("el token en claro solo vive en memoria, nunca se guarda en el navegador", () => {
    const f = panel.slice(panel.indexOf("async function fidGenerar()"), panel.indexOf("async function fidActivo("));
    assert.ok(!/localStorage|sessionStorage/.test(f), "el token se guarda en el navegador");
    assert.match(f, /FID\.urls = j\.urls/);
  });
});

describe("no se toca nada de lo que ya funciona", () => {
  test("la fidelización no escribe en promociones, canjes ni vales", () => {
    const zona = server.slice(server.indexOf("// FIDELIZACIÓN CON ÁGORA · FASE 1"), server.indexOf('app.get("/", (req, res)'));
    for (const tabla of ["pro_canjes", "pro_promociones", "pro_qr SET", "INSERT INTO pro_", "cliente_metricas", "leads"]) {
      assert.ok(!zona.includes(tabla), `la fidelización toca ${tabla}`);
    }
    // De `pro_qr` solo LEE.
    const usos = [...zona.matchAll(/(INSERT INTO|UPDATE|DELETE FROM) pro_qr/g)];
    assert.deepEqual(usos, [], "la fidelización escribe en pro_qr");
  });

  test("el libro es append-only: nada lo actualiza ni lo borra", () => {
    assert.ok(!/UPDATE fid_movimientos/.test(server), "se actualiza el libro");
    assert.ok(!/DELETE FROM fid_movimientos/.test(server), "se borra del libro");
    assert.match(esquema, /CHECK \(concepto IN \('visita','consumo','devolucion','correccion','puntos'\)\)/);
  });
});
