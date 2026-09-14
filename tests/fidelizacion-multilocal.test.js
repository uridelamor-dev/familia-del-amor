// Multilocal: cada local con su token, sus facturas y su verificación.
//
// LA PROPIEDAD QUE BLINDA ESTE FICHERO, y de la que depende todo lo demás:
//
//   EN UNA RUTA EXTERNA, EL LOCAL SALE DEL TOKEN. NUNCA DE LA PETICIÓN.
//
// Ágora no elige en qué local escribe: se le da un token por local, y la fila de
// `fid_integraciones` que se encuentra por su hash es la que dice dónde va todo. Si una ruta
// externa aceptara un `local` por el cuerpo o por la query, cualquiera con un token válido
// escribiría facturas en el local que quisiera, y las visitas de dos barras se mezclarían sin
// dar un solo error.
//
// Las rutas INTERNAS son la pregunta contraria y se responden al revés: ahí el local viene de la
// sesión y del selector del panel, y se comprueba que es de quien pregunta.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estadoIntegracion, estadoVerificacion, ESTADOS_VERIFICACION, discrepanciaWorkplace,
         botonesDe, BOTONES_POR_ESTADO, extraerFactura, claveDeFactura, movimientosDe, REWARDS_FASE_1 }
  from "../src/modules/fidelizacion/agora.js";
import { LOCALES } from "../src/modules/facturas/local-canonico.js";
import { RUTAS as RUTAS_IMPORTES } from "../src/modules/fidelizacion/importes.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
const agora = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");

const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const trozo = (a, b) => server.slice(server.indexOf(a), server.indexOf(b));

const LLORET = "La Tapeta - Lloret";
const TORDERA = "La Tapa Ibérica - Tordera";
const AHORA = "2026-09-14T12:00:00Z";
const sha = (t) => "h" + String(t).length + ":" + String(t).slice(0, 6);

const validacion = trozo('app.get("/api/fidelizacion/agora/:token/member/:memberId"',
                         'app.post("/api/fidelizacion/agora/:token/factura"');
const facturaExt = trozo('app.post("/api/fidelizacion/agora/:token/factura"',
                         '// ── 3) Gestión, solo Dirección');
const externas = validacion + facturaExt;
const generar = trozo('app.post("/api/fidelizacion/integracion", requireAuth',
                      'app.get("/api/fidelizacion/integracion", requireAuth');
const estado = trozo('app.get("/api/fidelizacion/integracion", requireAuth',
                     '/** LAS CUATRO tablas');
const activo = trozo('app.post("/api/fidelizacion/integracion/:id/activo"',
                     'app.post("/api/fidelizacion/integracion/:id/revocar"');
const revocar = trozo('app.post("/api/fidelizacion/integracion/:id/revocar"',
                      'app.get("/api/fidelizacion/integracion/:id/workplace-observado"');
const wpVer = trozo('app.get("/api/fidelizacion/integracion/:id/workplace-observado"',
                    'app.post("/api/fidelizacion/integracion/:id/workplace"');
const wpOk = trozo('app.post("/api/fidelizacion/integracion/:id/workplace"',
                   'app.get("/api/fidelizacion/facturas", requireAuth');
const listado = trozo('app.get("/api/fidelizacion/facturas", requireAuth',
                      '/** El detalle. El cuerpo original');
const purgar = trozo('app.post("/api/fidelizacion/facturas/purgar-cuerpos"',
                     'app.get("/api/fidelizacion/miembro"');

const factura = ({ globalId = "G-1", workplace = null, lineas = [["TOK-A", 10]] }) => ({
  GlobalId: globalId,
  ...(workplace ? { Workplace: { Id: workplace, Name: "X" } } : {}),
  InvoiceItems: [{ GlobalId: globalId, Lines: lineas.map(([m, t], i) => ({
    Index: i + 1, TotalAmount: t, LoyaltyProgram: { MemberId: m } })) }],
});

describe("el token es la fuente de verdad de las rutas externas", () => {
  test("el local sale SIEMPRE de integ.fila.local, nunca de la petición", () => {
    const cod = sinComentarios(externas);
    // Todo lo que se escribe lleva el local de la FILA del token.
    assert.match(cod, /local: integ\.fila\.local/);
    assert.match(cod, /fidExtraerFactura\(json, fidHash, \{ local: integ\.fila\.local \}\)/);
    // Y ninguna ruta externa lee un local de fuera.
    for (const entrada of ["req.body.local", "req.body?.local", "req.query.local",
                           "req.params.local", "json.local", "json.Local"]) {
      assert.ok(!cod.includes(entrada), `una ruta externa acepta el local por «${entrada}»`);
    }
    assert.ok(!/fidLocalDePeticion/.test(cod), "una ruta externa usa el local de la sesión");
  });

  test("ninguna petición puede sobrescribir integ.fila.local", () => {
    const cod = sinComentarios(externas);
    // No se le asigna nada: es de solo lectura desde que sale de la base.
    assert.ok(!/integ\.fila\.local\s*=/.test(cod), "se reasigna el local de la integración");
    assert.ok(!/integ\.fila\s*=/.test(cod), "se reasigna la fila entera");
    assert.ok(!/\.\.\.req\.body/.test(cod), "el cuerpo se esparce sobre algo");
  });

  test("la clave de idempotencia lleva el local dentro: dos locales no se tapan", () => {
    // Si la clave fuese solo el GlobalId, la factura del segundo local se vería como un reenvío
    // de la del primero y no apuntaría ni una visita, sin dar ningún error.
    assert.notEqual(claveDeFactura(LLORET, "oficial", "G-1"), claveDeFactura(TORDERA, "oficial", "G-1"));
    assert.match(esquema, /idx_fid_factura_clave ON fid_facturas \(clave_factura\)/);
  });

  test("un mismo GlobalId en dos locales produce movimientos distintos", () => {
    const hashMember = (t) => "m:" + t;
    const doc = factura({ globalId: "MISMO" });
    const a = movimientosDe(extraerFactura(doc, sha, { local: LLORET }), { local: LLORET, ahora: AHORA, hashMember });
    const b = movimientosDe(extraerFactura(doc, sha, { local: TORDERA }), { local: TORDERA, ahora: AHORA, hashMember });
    assert.equal(a[0].local, LLORET);
    assert.equal(b[0].local, TORDERA);
    assert.notEqual(a[0].clave_idem, b[0].clave_idem, "las dos facturas colisionarían");
  });

  test("un token de un local no vale para otro: no hay forma de pedirlo", () => {
    // La ruta externa recibe SOLO el token. No hay ningún parámetro de local que manipular.
    assert.match(server, /app\.get\("\/api\/fidelizacion\/agora\/:token\/member\/:memberId"/);
    assert.match(server, /app\.post\("\/api\/fidelizacion\/agora\/:token\/factura"/);
    assert.ok(!/\/api\/fidelizacion\/agora\/:local\//.test(server));
    // Y la integración se busca por el hash del token y por nada más.
    const busca = trozo("async function fidIntegracion(token) {", "/**\n * EL ESTADO DE TODOS");
    assert.match(busca, /WHERE token_hash = \?/);
  });
});

describe("ya no hay ningún local privilegiado", () => {
  test("LOCAL_PILOTO y FID_LOCAL han desaparecido del código", () => {
    assert.ok(!/LOCAL_PILOTO/.test(agora), "sigue exportándose el local del piloto");
    assert.ok(!/FID_LOCAL/.test(server), "server.js sigue usando el local del piloto");
    assert.ok(!/local_no_permitido/.test(agora), "sigue el motivo de rechazo por local");
  });

  test("cualquier local de la casa puede tener integración", () => {
    const base = { id: 1, activo: true, revocado_en: null, caduca_en: "2099-01-01T00:00:00Z" };
    for (const l of LOCALES) {
      assert.equal(estadoIntegracion({ ...base, local: l }, { ahora: AHORA }).ok, true, l);
    }
  });

  test("La Tapa Ibérica - Tordera es un local canónico de verdad", () => {
    // El nombre exacto importa: `fid_*` guarda esta cadena y las 190 consultas agrupan por ella.
    assert.ok(LOCALES.includes(TORDERA));
  });

  test("nombres PARECIDOS no se mezclan", () => {
    // Hay tres locales en Tordera. Un nombre a medias no puede resolverse a ninguno.
    const base = { id: 1, activo: true, revocado_en: null, caduca_en: "2099-01-01T00:00:00Z" };
    for (const casi of ["La Tapa Ibérica", "Tordera", "la tapa iberica - tordera",
                        "La Tapa Ibérica - Tordera ", "Can Mateu", "La Tapeta"]) {
      assert.equal(estadoIntegracion({ ...base, local: casi }, { ahora: AHORA }).motivo,
        "local_no_canonico", casi);
    }
    // Y dos locales de la casa con el mismo prefijo son distintos de verdad.
    assert.notEqual(claveDeFactura("Can Mateu - Tordera", "oficial", "G"),
                    claveDeFactura(TORDERA, "oficial", "G"));
  });

  test("cambiar el nombre visible no rompe el histórico", () => {
    // Lo que se GUARDA es la cadena canónica; lo que se ve en pantalla lo compone el panel. Por
    // eso `fid_facturas.local` no cambia porque alguien reescriba un rótulo.
    assert.match(esquema, /local TEXT NOT NULL/);
    assert.ok(!/ALTER TABLE fid_\w+ [^;]*RENAME/.test(esquema), "el esquema renombra algo");
    assert.ok(!/UPDATE fid_\w+ SET local/.test(server), "hay código que reescribe el local de filas ya guardadas");
  });
});

describe("las rutas internas van por sesión y permisos", () => {
  test("hay un único sitio que decide el local de una ruta interna", () => {
    assert.match(server, /function fidLocalDePeticion\(req, pedido\)/);
    const f = trozo("function fidLocalDePeticion(req, pedido) {", "function fidPuedeVer(req, local) {");
    assert.match(f, /localScope\(req, crudo\)/);
    assert.match(f, /esLocalCanonico\(suyo\)/);
    // Pedir el local de otro es 403, no «te doy el tuyo en silencio».
    assert.match(f, /suyo !== crudo.*403/s);
  });

  test("generar, listar y purgar lo usan; y comprueban permisos", () => {
    for (const [nombre, r] of [["generar", generar], ["listado", listado], ["purgar", purgar]]) {
      assert.match(r, /fidLocalDePeticion\(req,/, `${nombre} no filtra por local`);
    }
    assert.match(generar, /fidLocalDePeticion\(req, req\.body\?\.local\)/);
    assert.match(listado, /fidLocalDePeticion\(req, req\.query\.local\)/);
    assert.match(purgar, /fidLocalDePeticion\(req, req\.body\?\.local\)/);
  });

  test("las rutas por :id leen el local de la FILA y comprueban que es tuyo", () => {
    for (const [nombre, r] of [["activo", activo], ["revocar", revocar],
                               ["workplace observado", wpVer], ["confirmar workplace", wpOk]]) {
      assert.match(r, /fidPuedeVer\(req, (fila|f)\.local\)/, `${nombre} no comprueba el local`);
      assert.match(r, /res\.status\(403\)/, `${nombre} no contesta 403`);
    }
  });

  test("un local no ve las facturas de otro", () => {
    assert.match(listado, /FROM fid_facturas WHERE local = \? ORDER BY id DESC LIMIT 100/);
    // Sin local no se devuelve «todo»: se exige uno.
    assert.match(listado, /if \(!pedido\.ok\) return res\.status\(pedido\.codigo\)/);
    assert.ok(!/FROM fid_facturas ORDER BY/.test(listado), "queda un listado global");
  });

  test("purgar un local no borra los JSON de otro", () => {
    assert.match(purgar, /UPDATE fid_facturas SET cuerpo_enc = NULL WHERE local = \? AND cuerpo_enc IS NOT NULL/);
    assert.ok(!/WHERE cuerpo_enc IS NOT NULL`\)/.test(purgar), "queda una purga global");
    assert.match(purgar, /COUNT\(\*\)::int AS n FROM fid_facturas\s*\n?\s*WHERE local = \?/);
  });

  test("desactivar o revocar un local va por su id, no por su local", () => {
    // Un UPDATE por `local` alcanzaría a más de una fila; por `id` toca exactamente una.
    assert.match(activo, /UPDATE fid_integraciones SET activo = TRUE/);
    assert.match(activo, /UPDATE fid_integraciones SET activo = FALSE/);
    assert.match(revocar, /WHERE id = \? AND revocado_en IS NULL/);
    for (const r of [activo, revocar]) {
      assert.ok(!/WHERE local = \?/.test(r), "alcanza a todas las filas de un local");
    }
  });

  test("el diagnóstico desglosa por local sin dejar de ser de catálogo", () => {
    const diag = trozo('app.get("/api/fidelizacion/diagnostico"',
                       'app.post("/api/fidelizacion/integracion/:id/activo"');
    assert.match(diag, /GROUP BY local ORDER BY local/);
    assert.match(diag, /por_local: porLocal/);
  });
});

describe("Marketing no puede tocar nada de esto", () => {
  test("las nueve acciones son SOLO de Dirección", () => {
    const rutas = [
      'app.post("/api/fidelizacion/integracion"',
      'app.get("/api/fidelizacion/integracion"',
      'app.post("/api/fidelizacion/integracion/:id/activo"',
      'app.post("/api/fidelizacion/integracion/:id/revocar"',
      'app.get("/api/fidelizacion/integracion/:id/workplace-observado"',
      'app.post("/api/fidelizacion/integracion/:id/workplace"',
      'app.get("/api/fidelizacion/facturas"',
      'app.post("/api/fidelizacion/facturas/:id/prueba"',
      'app.post("/api/fidelizacion/facturas/purgar-cuerpos"',
    ];
    for (const r of rutas) {
      const i = server.indexOf(r);
      assert.ok(i > 0, `no existe la ruta ${r}`);
      const cabecera = server.slice(i, i + r.length + 60);
      assert.match(cabecera, /requireAuth\(\["direccion"\]\)/, `${r} no es solo de Dirección`);
      assert.ok(!/marketing/.test(cabecera), `${r} deja entrar a Marketing`);
    }
  });
});

describe("los siete estados de verificación", () => {
  const viva = { id: 1, local: LLORET, activo: true, revocado_en: null, caduca_en: "2099-01-01T00:00:00Z" };

  test("son exactamente los siete acordados, congelados", () => {
    assert.deepEqual([...ESTADOS_VERIFICACION], ["sin_configurar", "token_generado",
      "activa_en_verificacion", "activa_confirmada", "desactivada", "revocada", "caducada"]);
    assert.throws(() => { ESTADOS_VERIFICACION.push("x"); }, TypeError);
  });

  test("cada hecho da su estado", () => {
    assert.equal(estadoVerificacion(null), "sin_configurar");
    assert.equal(estadoVerificacion({ ...viva, activo: false, activada_en: null }, { ahora: AHORA }), "token_generado");
    assert.equal(estadoVerificacion({ ...viva, activo: false, activada_en: AHORA }, { ahora: AHORA }), "desactivada");
    assert.equal(estadoVerificacion(viva, { ahora: AHORA }), "activa_en_verificacion");
    assert.equal(estadoVerificacion({ ...viva, workplace_confirmado_en: AHORA }, { ahora: AHORA }), "activa_confirmada");
    assert.equal(estadoVerificacion({ ...viva, revocado_en: AHORA }, { ahora: AHORA }), "revocada");
    assert.equal(estadoVerificacion({ ...viva, caduca_en: "2020-01-01" }, { ahora: AHORA }), "caducada");
  });

  test("revocada y caducada ganan a todo, incluso confirmada", () => {
    const conf = { ...viva, workplace_confirmado_en: AHORA, workplace_id: "WP-1" };
    assert.equal(estadoVerificacion({ ...conf, revocado_en: AHORA }, { ahora: AHORA }), "revocada");
    assert.equal(estadoVerificacion({ ...conf, caduca_en: "2020-01-01" }, { ahora: AHORA }), "caducada");
  });

  test("«generada y nunca activada» no es lo mismo que «apagada»", () => {
    // De esto depende que nadie regenere un token que ya está pegado en una caja.
    assert.notEqual(estadoVerificacion({ ...viva, activo: false, activada_en: null }, { ahora: AHORA }),
                    estadoVerificacion({ ...viva, activo: false, activada_en: AHORA }, { ahora: AHORA }));
  });

  test("no hay columna de estado que pueda desincronizarse", () => {
    assert.ok(!/estado_verificacion/.test(esquema), "hay una columna de estado escrita a mano");
    assert.match(agora, /export function estadoVerificacion\(fila, \{ ahora/);
  });

  test("activada_en se escribe una vez y no se borra", () => {
    assert.match(activo, /COALESCE\(activada_en, \?\)/);
    assert.ok(!/activada_en = NULL/.test(server), "se borra la fecha de primera activación");
  });
});

describe("el Workplace se confirma a mano, y no promete lo que no puede", () => {
  test("no se copia automáticamente el primero que llegue", () => {
    // La recepción SÍ mira el Workplace —para compararlo con el confirmado— pero no lo ESCRIBE
    // en ningún sitio. Mirar y vincular son cosas distintas.
    const cod = sinComentarios(facturaExt);
    assert.ok(!/UPDATE fid_integraciones/.test(cod), "la recepción de facturas escribe en la integración");
    assert.ok(!/workplace_id = |workplace_nombre = |workplace_confirmado/.test(cod),
      "la recepción de facturas vincula el Workplace");
    // Y la ruta que lo mira NO escribe.
    for (const escritura of ["dbRun(", "INSERT", "UPDATE", "ficAuditar("]) {
      assert.ok(!wpVer.includes(escritura), `mirar el Workplace escribe: ${escritura}`);
    }
  });

  test("confirmar exige que el Id se haya VISTO en una factura de prueba", () => {
    // Sin esto, confirmar sería pulsar un botón sin haber mirado nada.
    assert.match(wpOk, /if \(!coincide\) \{/);
    assert.match(wpOk, /res\.status\(409\)/);
    assert.match(wpOk, /es_prueba AND cuerpo_enc IS NOT NULL/);
    assert.match(wpOk, /String\(doc\["Workplace\.Id"\]\) !== wid\) continue/);
    // Y el NOMBRE tiene que salir de esa MISMA factura: un rótulo inventado junto a un Id correcto
    // no sirve para comprobar después si el TPV es el que creemos.
    assert.match(wpOk, /const nombreVisto = doc\["Workplace\.Name"\]/);
    assert.match(wpOk, /if \(nombreVisto === wnombre\) \{ coincide = true; break; \}/);
  });

  test("y el panel enseña Id y Name antes de dejar confirmar", () => {
    const f = panel.slice(panel.indexOf("async function fidWorkplace("),
                          panel.indexOf("async function fidConfirmarWorkplace("));
    assert.match(f, /o\.id/);
    assert.match(f, /o\.nombre/);
    assert.match(f, /data-act="fid-wp-ok"/);
    // El botón de confirmar solo existe dentro de la lista de observados.
    assert.ok(f.indexOf("data-act=\"fid-wp-ok\"") > f.indexOf("obs.map"));
  });

  test("un Workplace ya confirmado no se puede cambiar sin revocar", () => {
    assert.match(wpOk, /if \(fila\.workplace_id\) return res\.status\(409\)/);
  });

  test("NO se promete identificar la instalación", () => {
    // Dos instalaciones distintas pueden repetir el mismo Id, y el nombre lo escribe una persona.
    // Decir que esto identifica un TPV sería prometer algo que el JSON no trae.
    const d = agora.slice(agora.indexOf("export function discrepanciaWorkplace"));
    assert.equal(discrepanciaWorkplace({ workplace_id: null }, "WP-1").hay, false);
    assert.equal(discrepanciaWorkplace({ workplace_id: "WP-1" }, null).motivo, "la_factura_no_trae_workplace");
    assert.equal(discrepanciaWorkplace({ workplace_id: "WP-1" }, "WP-2").hay, true);
    assert.equal(discrepanciaWorkplace({ workplace_id: "WP-1" }, "WP-1").hay, false);
    // Y está escrito, tanto en el módulo como en la pantalla.
    assert.match(agora, /pueden repetir el mismo `Workplace\.Id`/);
    assert.match(panel, /Esto no identifica la instalación/);
    assert.match(panel, /no como garantía/);
  });

  test("la discrepancia se APUNTA, nunca rechaza la factura", () => {
    // Negarse a cerrar por esto dejaría a un camarero sin poder cobrar por un error de
    // configuración que él no puede arreglar. Y la factura ya está guardada en el local de su
    // token, que es lo que de verdad decide.
    const d = facturaExt.slice(facturaExt.indexOf("¿VIENE DEL TPV QUE CREEMOS?"),
                               facturaExt.indexOf("Mismo identificador, cuerpo distinto"));
    assert.match(d, /fidDiscrepanciaWorkplace\(integ\.fila, visto\)/);
    assert.match(d, /"workplace_discrepante"/);
    assert.ok(!/Status: "rejected"/.test(d), "una discrepancia rechaza la factura");
    assert.ok(!/res\.status\(4|res\.status\(5/.test(d), "una discrepancia devuelve un error");
    // Y va dentro de su propio try: una comprobación de más no puede tumbar la respuesta al TPV.
    assert.match(d, /\} catch \{ \/\* una comprobación de más no puede tumbar la respuesta \*\/ \}/);
  });

  test("solo se comprueba si Dirección confirmó un Workplace", () => {
    const d = facturaExt.slice(facturaExt.indexOf("¿VIENE DEL TPV QUE CREEMOS?"),
                               facturaExt.indexOf("Mismo identificador, cuerpo distinto"));
    assert.match(d, /if \(integ\.fila\.workplace_id\)/);
  });

  test("el Workplace observado NO se guarda en ninguna tabla", () => {
    // Se extrae solo para comparar. Guardarlo sería vincular sin que nadie lo confirme.
    assert.match(agora, /workplaceId,/);
    assert.ok(!/INSERT INTO fid_facturas[^;]*workplace/i.test(server), "la factura guarda el Workplace");
    assert.ok(!/UPDATE fid_integraciones SET workplace_id = \?, workplace_nombre = \?,\s*\n?\s*workplace_confirmado_en = \?, workplace_confirmado_por = \? WHERE id = \?[\s\S]{0,400}agora"/.test(server));
  });

  test("un Workplace repetido en dos instalaciones no mezcla locales", () => {
    // Aunque Lloret y Tordera vieran el MISMO Workplace.Id, sus facturas siguen separadas: lo que
    // separa es el token, no el Workplace.
    const doc = factura({ globalId: "G-X", workplace: "WP-1" });
    const a = extraerFactura(doc, sha, { local: LLORET });
    const b = extraerFactura(doc, sha, { local: TORDERA });
    assert.match(a.claveFactura, /^la-tapeta-lloret\|/);
    assert.match(b.claveFactura, /^la-tapa-iberica-tordera\|/);
    assert.notEqual(a.claveFactura, b.claveFactura, "el mismo Workplace las junta");
  });
});

describe("mientras está en verificación, no hay nada de premios", () => {
  test("Rewards sigue vacío y congelado", () => {
    assert.deepEqual([...REWARDS_FASE_1], []);
    assert.throws(() => { REWARDS_FASE_1.push({}); }, TypeError);
    assert.match(agora, /Rewards: rewards && rewards\.length \? rewards : \[\.\.\.REWARDS_FASE_1\]/);
  });

  test("el panel avisa con todas las letras", () => {
    const f = panel.slice(panel.indexOf("function renderFidLocal("), panel.indexOf("function renderFidPiloto()"));
    assert.match(f, /En verificación/);
    assert.match(f, /No lo uses con clientes reales/);
    assert.match(f, /Sin premios, sin puntos y sin promociones/);
  });

  test("no se han colado puntos, promociones ni catálogo", () => {
    // `fid_reglas` salió de la lista con la Fase B. Lo que queda es lo que sigue sin autorizar.
    for (const futuro of ["fid_premios", "fid_productos", "export-master", "WorkplacesSummary"]) {
      assert.ok(!server.includes(futuro), `se ha colado ${futuro}`);
    }
    // Y la fidelización sigue sin escribir en promociones ni canjes.
    const zona = trozo("// FIDELIZACIÓN CON ÁGORA", 'app.get("/", (req, res)');
    for (const t of ["INSERT INTO pro_promociones", "UPDATE pro_promociones",
                     "INSERT INTO pro_canjes", "UPDATE pro_canjes", "DELETE FROM pro_canjes"]) {
      assert.ok(!zona.includes(t), `la fidelización escribe en promociones: ${t}`);
    }
  });
});

describe("CANDADOS: lo que esta fase NO puede haber tocado", () => {
  const importes = readFileSync(new URL("../src/modules/fidelizacion/importes.js", import.meta.url), "utf8");

  test("Rewards sigue siendo [] y congelado", () => {
    assert.deepEqual([...REWARDS_FASE_1], []);
    assert.throws(() => { REWARDS_FASE_1.push({}); }, TypeError);
    assert.match(agora, /export const REWARDS_FASE_1 = Object\.freeze\(\[\]\)/);
    assert.match(agora, /Rewards: rewards && rewards\.length \? rewards : \[\.\.\.REWARDS_FASE_1\]/);
    // El valor POR DEFECTO sigue siendo la lista vacía congelada: un Reward solo sale si alguien
    // lo pasa a propósito, nunca porque nadie lo haya desactivado.
  });

  test("la lista cerrada de importes NO se ha ampliado: siguen siendo 33 rutas", () => {
    // Es lo que hace seguro mirar una factura. Ampliarla de rondón sería ampliar lo que se ve.
    assert.equal(RUTAS_IMPORTES.length, 33, "la lista cerrada ha cambiado de tamaño");
    assert.ok(!RUTAS_IMPORTES.some((r) => r.startsWith("Pos.")), "ha entrado Pos");
    assert.ok(!RUTAS_IMPORTES.some((r) => /Customer|Member|User|Phone|Notes|Tax/i.test(r)), "ha entrado algo sensible");
    assert.throws(() => { RUTAS_IMPORTES.push("Customer.Phone"); }, TypeError);
    assert.match(importes, /for \(const ruta of RUTAS\)/);
  });

  test("de los cuatro tipos de Reward, SOLO CashDiscount", () => {
    // `CashDiscount` entró con la Fase B y es el único acordado. Los otros tres siguen sin
    // implementarse, y que aparezca uno querría decir que alguien amplió el programa de rondón.
    for (const futuro of ["fid_premios", "fid_productos", "export-master", "WorkplacesSummary",
                          "NamedDiscount", "OfferId:", "Type: \"DiscountRate\"", "Type: \"Offer\""]) {
      assert.ok(!server.includes(futuro), `se ha colado ${futuro}`);
    }
    // El tipo sale de UNA constante, no de un literal repetido: así el que se emite y el que se
    // acepta al volver son el mismo por construcción.
    const puntos = readFileSync(new URL("../src/modules/fidelizacion/puntos.js", import.meta.url), "utf8");
    assert.match(puntos, /export const TIPO_REWARD = "CashDiscount";/);
    assert.match(puntos, /Type: TIPO_REWARD,/);
    const literales = [...puntos.matchAll(/Type: "([A-Za-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(literales, [], "hay un tipo de Reward escrito a mano");
  });

  test("no se escribe en pro_promociones ni en pro_canjes", () => {
    const zona = trozo("// FIDELIZACIÓN CON ÁGORA", 'app.get("/", (req, res)');
    for (const t of ["pro_promociones", "pro_canjes"]) {
      assert.ok(!new RegExp(`(INSERT INTO|UPDATE|DELETE FROM) ${t}`).test(zona),
        `la fidelización escribe en ${t}`);
    }
  });

  test("las CINCO columnas nuevas siguen siendo aditivas y anulables", () => {
    const bloque = esquema.slice(esquema.indexOf("ADITIVO. Verificación del local"),
                                 esquema.indexOf("── Las facturas que manda Ágora"));
    const cols = [...bloque.matchAll(/"([a-z_]+) TEXT([^"]*)"/g)];
    assert.equal(cols.length, 5, "han cambiado de número");
    assert.deepEqual(cols.map((c) => c[1]), ["activada_en", "workplace_id", "workplace_nombre",
                                             "workplace_confirmado_en", "workplace_confirmado_por"]);
    for (const [, nombre, resto] of cols) {
      assert.equal(resto, "", `${nombre} lleva restricciones: rompería el ALTER sobre filas viejas`);
    }
    assert.match(bloque, /ADD COLUMN IF NOT EXISTS/);
  });

  test("cero DR0P, TRUN-CATE o DELETE sobre las tablas de fidelización", () => {
    for (const t of ["fid_integraciones", "fid_facturas", "fid_movimientos", "fid_validaciones"]) {
      for (const verbo of ["DR" + "OP TABLE", "TRUN" + "CATE", "DELETE " + "FROM"]) {
        assert.ok(!(server + esquema).includes(`${verbo} ${t}`), `hay un ${verbo} sobre ${t}`);
        assert.ok(!(server + esquema).includes(`${verbo} IF EXISTS ${t}`), `hay un ${verbo} sobre ${t}`);
      }
    }
  });

  test("LAS ÚNICAS consultas que mutan fid_integraciones son estas cuatro", () => {
    // Si aparece una quinta, este test falla y hay que mirarla con lupa: aquí vive el token.
    const muta = [...server.matchAll(/(INSERT INTO|UPDATE) fid_integraciones[^`]*/g)].map((m) => m[0].replace(/\s+/g, " ").trim());
    assert.deepEqual(muta, [
      "UPDATE fid_integraciones SET revocado_en = ?, revocado_por = ? WHERE local = ? AND revocado_en IS NULL",
      "INSERT INTO fid_integraciones (local, token_hash, token_pista, activo, creado_en, creado_por, caduca_en) VALUES (?,?,?,FALSE,?,?,?) RETURNING id",
      "UPDATE fid_integraciones SET activo = TRUE, activada_en = COALESCE(activada_en, ?) WHERE id = ? AND revocado_en IS NULL AND (caduca_en IS NULL OR caduca_en > ?) RETURNING id",
      "UPDATE fid_integraciones SET activo = FALSE, activada_en = COALESCE(activada_en, CASE WHEN activo THEN ?::text ELSE NULL END) WHERE id = ? AND revocado_en IS NULL RETURNING id",
      "UPDATE fid_integraciones SET revocado_en = ?, revocado_por = ? WHERE id = ? AND revocado_en IS NULL RETURNING id",
      "UPDATE fid_integraciones SET workplace_id = ?, workplace_nombre = ?, workplace_confirmado_en = ?, workplace_confirmado_por = ? WHERE id = ? AND revocado_en IS NULL AND workplace_confirmado_en IS NULL RETURNING id",
    ]);
    // Y NINGUNA toca el token ni la caducidad después de crearlo.
    // Lo intocable es lo que se ESCRIBE. El `WHERE local = ?` de la revocación al regenerar es
    // correcto y necesario: es lo que cierra la integración anterior DE ESE local y de ningún otro.
    for (const m of muta.filter((x) => x.startsWith("UPDATE"))) {
      const set = m.slice(m.indexOf("SET ") + 4, m.indexOf(" WHERE "));
      for (const intocable of ["token_hash", "token_pista", "caduca_en", "local ="]) {
        assert.ok(!set.includes(intocable), `un UPDATE escribe ${intocable}: ${m}`);
      }
    }
  });

  test("las facturas, validaciones y movimientos de Lloret no se reescriben", () => {
    const muta = [...server.matchAll(/UPDATE (fid_facturas|fid_movimientos|fid_validaciones) SET ([^`]*)/g)]
      .map((m) => `${m[1]}: ${m[2].replace(/\s+/g, " ").trim()}`);
    // Solo dos: marcar una factura como prueba y vaciar su cuerpo al purgar.
    assert.deepEqual(muta, [
      "fid_facturas: es_prueba = ? WHERE id = ?",
      "fid_facturas: cuerpo_enc = NULL WHERE local = ? AND cuerpo_enc IS NOT NULL",
    ]);
    // `fid_movimientos` es el libro: append-only, como la bolsa de horas.
    assert.ok(!/UPDATE fid_movimientos/.test(server), "el libro de movimientos deja de ser append-only");
  });
});

describe("Lloret no se toca", () => {
  test("la migración es ADITIVA: ni una tabla se recrea", () => {
    for (const col of ["activada_en TEXT", "workplace_id TEXT", "workplace_nombre TEXT",
                       "workplace_confirmado_en TEXT", "workplace_confirmado_por TEXT"]) {
      assert.ok(esquema.includes(`"${col}"`), `falta la columna ${col}`);
    }
    assert.match(esquema, /ALTER TABLE fid_integraciones ADD COLUMN IF NOT EXISTS/);
    for (const peligro of ["DR" + "OP TABLE", "TRUN" + "CATE", "DELETE " + "FROM fid_", "RENAME",
                           "DR" + "OP COLUMN"]) {
      assert.ok(!esquema.includes(peligro), `el esquema contiene ${peligro}`);
    }
    // El único DR0P del esquema es el del índice GLOBAL de global_id, que se sustituyó por la
    // clave con el local dentro. Es de antes de esto y es justo lo que hace posible el multilocal.
    const drops = [...esquema.matchAll(/DR[O]P [A-Z]+ IF EXISTS ([a-z_]+)/g)].map((m) => m[1]);
    assert.deepEqual(drops, ["idx_fid_factura_global"]);
  });

  test("NADA reescribe token_hash ni token_pista", () => {
    // El token vigente de Lloret tiene que conservar exactamente su hash y su pista ••••SgMs.
    for (const t of ["SET token_hash", "SET token_pista", "token_hash =", "token_pista ="]) {
      assert.ok(!new RegExp(`UPDATE fid_integraciones[^;]*${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(server),
        `hay un UPDATE que toca ${t}`);
    }
    // El hash solo se escribe al INSERTAR una integración nueva.
    const inserta = [...server.matchAll(/INSERT INTO fid_integraciones/g)];
    assert.equal(inserta.length, 1, "hay más de un sitio que crea integraciones");
  });

  test("las columnas nuevas nacen NULL: una integración que ya existía no cambia de estado", () => {
    // Lloret está activa. Con `activada_en` a NULL y sin Workplace, su estado pasa a ser
    // «en verificación» — que es la verdad: está funcionando y nadie ha confirmado su Workplace.
    // Lo que NO puede pasar es que deje de responder.
    const lloretHoy = { id: 1, local: LLORET, activo: true, revocado_en: null,
                        caduca_en: "2099-01-01T00:00:00Z", activada_en: null, workplace_confirmado_en: null };
    assert.equal(estadoIntegracion(lloretHoy, { ahora: AHORA }).ok, true, "Lloret deja de resolver");
    assert.equal(estadoVerificacion(lloretHoy, { ahora: AHORA }), "activa_en_verificacion");
  });

  test("ninguna columna nueva es NOT NULL sin DEFAULT", () => {
    // Un ALTER con NOT NULL y sin valor por defecto falla sobre una tabla con filas, y el arranque
    // se lo come en un try/catch: la columna no existiría y nadie se enteraría.
    const bloque = esquema.slice(esquema.indexOf("ALTER TABLE fid_integraciones"));
    assert.ok(!/NOT NULL(?! DEFAULT)/.test(bloque.slice(0, 400)), "una columna nueva es NOT NULL sin DEFAULT");
  });

  test("el backfill no hace falta: las cuatro tablas ya llevan el local", () => {
    // Por eso no hay ni una fila que atribuir a ojo. Lo que se guardó, se guardó con el local del
    // token que lo trajo.
    const tablas = ["fid_integraciones", "fid_facturas", "fid_movimientos", "fid_validaciones"];
    for (const t of tablas) {
      const i = esquema.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`);
      assert.ok(i > 0, `no existe ${t}`);
      assert.match(esquema.slice(i, esquema.indexOf(")`)", i)), /local TEXT/, `${t} no lleva local`);
    }
    assert.ok(!/UPDATE fid_\w+ SET local =/.test(server), "hay un backfill que asigna locales");
  });

  test("una integración viva por local, no una en total", () => {
    assert.match(esquema, /idx_fid_integracion_local\s*\n?\s*ON fid_integraciones \(local\) WHERE revocado_en IS NULL/);
  });
});

describe("EL CASO HEREDADO DE LLORET: activo con activada_en a NULL", () => {
  // Lloret lleva meses activa y `activada_en` es una columna nueva, así que vale NULL. Ese estado
  // no se puede alcanzar generando una integración hoy: solo existe porque la fila es anterior.
  const LLORET_HEREDADA = Object.freeze({
    id: 1, local: LLORET, token_hash: "hash-de-lloret-que-no-se-toca", token_pista: "••••SgMs",
    activo: true, activada_en: null, revocado_en: null, caduca_en: "2099-01-01T00:00:00Z",
    workplace_id: null, workplace_confirmado_en: null,
  });

  test("hoy se ve bien: activa y en verificación", () => {
    assert.equal(estadoVerificacion(LLORET_HEREDADA, { ahora: AHORA }), "activa_en_verificacion");
    assert.equal(estadoIntegracion(LLORET_HEREDADA, { ahora: AHORA }).ok, true);
  });

  test("al DESACTIVARLA queda «desactivada», nunca «token_generado»", () => {
    // ESTE ES EL FALLO QUE SE ARREGLA. Poniendo solo `activo = false`, la fila se queda con
    // `activo=false` y `activada_en=NULL`, que es la huella exacta de un token recién generado y
    // nunca instalado: el panel diría «Token generado» y ofrecería generar otro, cuando el que hay
    // sigue pegado en la caja de Lloret.
    const sinSellar = { ...LLORET_HEREDADA, activo: false };
    assert.equal(estadoVerificacion(sinSellar, { ahora: AHORA }), "token_generado", "así estaba el fallo");

    // Con el sello, la verdad: se apagó, pero estuvo instalada.
    const sellada = { ...LLORET_HEREDADA, activo: false, activada_en: AHORA };
    assert.equal(estadoVerificacion(sellada, { ahora: AHORA }), "desactivada");

    // Y lo que se le ofrece a Dirección cambia por completo.
    assert.ok(botonesDe(sinSellar, { ahora: AHORA }).includes("regenerar"));
    assert.ok(botonesDe(sellada, { ahora: AHORA }).includes("activar"), "no se puede volver a encender");
  });

  test("la ruta SELLA activada_en al activar y al desactivar una fila que estaba activa", () => {
    assert.match(activo, /SET activo = TRUE, activada_en = COALESCE\(activada_en, \?\)/);
    assert.match(activo, /activada_en = COALESCE\(activada_en, CASE WHEN activo THEN \?::text ELSE NULL END\)/);
    // `COALESCE` y no una fecha a pelo: la primera activación se apunta una vez y no se mueve.
    assert.ok(!/activada_en = \? WHERE id/.test(activo), "pisa la fecha de primera activación");
  });

  test("apagar algo que ya estaba apagado NO inventa una activación", () => {
    // Ahí no ha habido ninguna instalación que recordar: `token_generado` sigue siendo la verdad.
    // El `CASE WHEN activo` lee el valor VIEJO de la fila: si estaba apagada, no sella nada.
    assert.match(activo, /CASE WHEN activo THEN \?::text ELSE NULL END/);
    const jamas = { ...LLORET_HEREDADA, activo: false, activada_en: null };
    assert.equal(estadoVerificacion(jamas, { ahora: AHORA }), "token_generado");
  });

  test("el sellado NO toca el token, la pista ni la caducidad", () => {
    // Es lo que garantiza que el TPV de Lloret siga funcionando exactamente igual.
    const set = [...activo.matchAll(/SET ([\s\S]*?)\s*WHERE/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
    assert.deepEqual(set, [
      "activo = TRUE, activada_en = COALESCE(activada_en, ?)",
      "activo = FALSE, activada_en = COALESCE(activada_en, CASE WHEN activo THEN ?::text ELSE NULL END)",
    ]);
    for (const s of set) {
      for (const intocable of ["token_hash", "token_pista", "caduca_en", "local", "creado_en"]) {
        assert.ok(!s.includes(intocable), `desactivar toca ${intocable}`);
      }
    }
  });

  test("NO hace falta backfill: antes de tocar nada, el panel ya dice la verdad", () => {
    // Mientras siga activa, `activada_en = NULL` no se nota: el estado es el correcto. El
    // invariante solo hace falta en el momento de apagarla, y ahí lo garantiza la ruta.
    assert.equal(estadoVerificacion(LLORET_HEREDADA, { ahora: AHORA }), "activa_en_verificacion");
    assert.ok(!/UPDATE fid_integraciones SET activada_en[^;]*WHERE activada_en IS NULL/.test(server),
      "hay un backfill masivo que no hace falta");
    assert.ok(!/activada_en TEXT NOT NULL/.test(esquema), "la columna obliga a rellenar filas viejas");
  });
});

describe("los botones de cada estado, de una tabla y no a ojo", () => {
  const A = { ahora: AHORA };
  const F = "2099-01-01T00:00:00Z";
  const fila = (x) => ({ id: 1, local: LLORET, caduca_en: F, ...x });

  test("la tabla es exactamente la acordada, y está congelada", () => {
    assert.deepEqual(Object.keys(BOTONES_POR_ESTADO).sort(), [...ESTADOS_VERIFICACION].sort());
    assert.deepEqual([...BOTONES_POR_ESTADO.sin_configurar], ["generar", "facturas", "purgar"]);
    assert.deepEqual([...BOTONES_POR_ESTADO.revocada], ["generar", "facturas", "purgar"]);
    assert.deepEqual([...BOTONES_POR_ESTADO.caducada], ["regenerar", "revocar", "facturas", "purgar"]);
    assert.throws(() => { BOTONES_POR_ESTADO.revocada.push("x"); }, TypeError);
    assert.throws(() => { BOTONES_POR_ESTADO.nuevo = []; }, TypeError);
  });

  test("«Generar token» SOLO donde no hay ningún token que romper", () => {
    // Es el candado del punto: una apagada y una recién generada tienen las dos `activo = false`,
    // y ofrecer «Generar» sobre la apagada invalidaría lo que está pegado en el TPV.
    for (const [estado, bs] of Object.entries(BOTONES_POR_ESTADO)) {
      const esVirgen = estado === "sin_configurar" || estado === "revocada";
      assert.equal(bs.includes("generar"), esVirgen, `«generar» en ${estado}`);
      assert.equal(bs.includes("regenerar"), !esVirgen, `«regenerar» en ${estado}`);
      assert.ok(!(bs.includes("generar") && bs.includes("regenerar")), `${estado} ofrece los dos`);
    }
    assert.ok(!BOTONES_POR_ESTADO.desactivada.includes("generar"), "una apagada ofrece Generar");
    assert.ok(!BOTONES_POR_ESTADO.token_generado.includes("generar"), "un token ya mostrado ofrece Generar");
  });

  test("activar y desactivar no aparecen nunca juntos, ni donde no sirven", () => {
    for (const [estado, bs] of Object.entries(BOTONES_POR_ESTADO)) {
      assert.ok(!(bs.includes("activar") && bs.includes("desactivar")), `${estado} ofrece los dos`);
    }
    assert.deepEqual(Object.entries(BOTONES_POR_ESTADO).filter(([, b]) => b.includes("activar")).map(([e]) => e),
      ["token_generado", "desactivada"]);
    assert.deepEqual(Object.entries(BOTONES_POR_ESTADO).filter(([, b]) => b.includes("desactivar")).map(([e]) => e),
      ["activa_en_verificacion", "activa_confirmada"]);
    // Una caducada no se enciende: no resolvería igual.
    assert.ok(!BOTONES_POR_ESTADO.caducada.includes("activar"));
  });

  test("revocar solo donde hay algo vivo que revocar", () => {
    for (const estado of ["sin_configurar", "revocada"]) {
      assert.ok(!BOTONES_POR_ESTADO[estado].includes("revocar"), `${estado} ofrece revocar`);
    }
  });

  test("«ver facturas» y «purgar» van siempre: son del local, no de la integración", () => {
    for (const [estado, bs] of Object.entries(BOTONES_POR_ESTADO)) {
      assert.ok(bs.includes("facturas") && bs.includes("purgar"), `${estado} esconde los datos del local`);
    }
  });

  test("el botón de Workplace desaparece en cuanto está confirmado", () => {
    // Ofrecerlo sería ofrecer un 409: confirmado no se cambia sin revocar.
    const sin = fila({ activo: true, activada_en: AHORA });
    const con = fila({ activo: true, activada_en: AHORA, workplace_id: "WP-1", workplace_confirmado_en: AHORA });
    assert.ok(botonesDe(sin, A).includes("workplace"));
    assert.ok(!botonesDe(con, A).includes("workplace"));
  });

  test("los decide el SERVIDOR, no el panel", () => {
    assert.match(estado, /botones: fidBotonesDe\(f, \{ ahora \}\)/);
    const f = panel.slice(panel.indexOf("function renderFidLocal("), panel.indexOf("function renderFidPiloto()"));
    assert.match(f, /const puede = \(b\) => \(L\.botones \|\| \[\]\)\.includes\(b\)/);
    // Y no queda ni una condición a ojo sobre el estado.
    assert.ok(!/const vivo =/.test(f), "el panel vuelve a decidir por su cuenta");
    assert.ok(!/!i\.revocado_en \?/.test(f), "el panel mira revocado_en para decidir botones");
  });

  test("regenerar avisa de que invalida las URLs del TPV", () => {
    const g = panel.slice(panel.indexOf("async function fidGenerar("), panel.indexOf("async function fidActivo("));
    assert.match(g, /const viva = !!L && \(L\.botones \|\| \[\]\)\.includes\("regenerar"\)/);
    assert.match(g, /queda REVOCADO al instante/);
    assert.match(g, /hasta que pegues las dos URLs nuevas/);
    assert.match(g, /if \(!confirm\(aviso\)\) return;/);
  });
});

describe("Workplace observado: solo facturas de prueba, solo dos campos", () => {
  test("SOLO se descifra el cuerpo de facturas marcadas es_prueba", () => {
    // Sin este filtro, este endpoint sería una puerta a los importes de cualquier cliente por la
    // vía de mirarle el Workplace. Va en las DOS rutas: la que mira y la que confirma.
    for (const [nombre, r] of [["mirar", wpVer], ["confirmar", wpOk]]) {
      const selects = [...r.matchAll(/FROM fid_facturas\s*\n?\s*WHERE ([^`]*)`/g)].map((m) => m[1].trim());
      assert.equal(selects.length, 1, `${nombre}: hay más de una consulta a facturas`);
      assert.match(selects[0], /^local = \? AND es_prueba AND cuerpo_enc IS NOT NULL/, nombre);
    }
  });

  test("una factura NORMAL no se puede usar para sacar el Workplace", () => {
    // No hay ningún parámetro que salte el filtro: ni un `?todas=1`, ni un id suelto.
    for (const r of [wpVer, wpOk]) {
      assert.ok(!/req\.query\.(todas|factura|id)/.test(r), "hay una vía para pedir otra factura");
      assert.ok(!/es_prueba = \?|es_prueba IS/.test(r), "el filtro de prueba es parametrizable");
    }
  });

  test("el local sale de la FILA de la integración, no de la petición", () => {
    for (const r of [wpVer, wpOk]) {
      assert.match(r, /\[fila\.local\]\)/);
      assert.ok(!/fidLocalDePeticion/.test(r), "el local de la consulta viene de fuera");
    }
  });

  test("solo salen Workplace.Id y Workplace.Name, y de la proyección cerrada", () => {
    // Se reutiliza `proyectarImportes`, que recorre la lista de rutas permitidas. De su salida se
    // leen DOS claves y ninguna más: ni totales, ni pagos, ni líneas, ni el GlobalId.
    assert.match(wpVer, /fidProyectarImportes\(json, \{ hash: fidHash \}\)\.documento/);
    const leidas = [...wpVer.matchAll(/doc\["([^"]+)"\]/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(leidas)].sort(), ["Workplace.Id", "Workplace.Name"]);
    // Y lo que se devuelve son esos dos más contadores nuestros.
    const devuelve = wpVer.slice(wpVer.indexOf("vistos.set("), wpVer.indexOf("v.n += 1"));
    assert.match(devuelve, /\{ id: k, nombre: doc\["Workplace\.Name"\] \?\? null, n: 0, ultima: null, factura_id: f\.id \}/);
  });

  test("mirar el Workplace NO escribe nada", () => {
    for (const escritura of ["dbRun(", "INSERT", "UPDATE", "ficAuditar("]) {
      assert.ok(!wpVer.includes(escritura), `mirar el Workplace escribe: ${escritura}`);
    }
    assert.match(wpVer, /res\.set\("Cache-Control", "no-store"\)/);
  });

  test("confirmar es lo ÚNICO que vincula, y deja quién y cuándo", () => {
    const sets = [...server.matchAll(/UPDATE fid_integraciones SET ([^`]*?) WHERE/g)].map((m) => m[1].trim());
    const conWorkplace = sets.filter((x) => x.includes("workplace"));
    assert.equal(conWorkplace.length, 1, "hay más de un sitio que escribe el Workplace");
    assert.match(conWorkplace[0].replace(/\s+/g, " "), /workplace_id = \?, workplace_nombre = \?, workplace_confirmado_en = \?, workplace_confirmado_por = \?/);
    assert.match(wpOk, /"workplace_confirmado"/);
    assert.match(wpOk, /req\.user\.username/);
  });

  test("no hay vinculación automática al recibir la primera factura", () => {
    const cod = sinComentarios(facturaExt);
    assert.ok(!/workplace_id = |workplace_confirmado/.test(cod), "la recepción vincula el Workplace");
    assert.ok(!/UPDATE fid_integraciones/.test(cod), "la recepción escribe en la integración");
    // Lo único que hace con el Workplace es compararlo.
    assert.match(cod, /fidDiscrepanciaWorkplace/);
  });
});

describe("permisos: la matriz completa, no «Marketing no entra»", () => {
  // Cada ruta con el rol que se le ha elegido A PROPÓSITO. Las de LECTURA también: el estado
  // multilocal enseña la pista del token y si hay credenciales de Ágora puestas, y eso es
  // información de credenciales. Marketing administrará puntos y promociones cuando existan, pero
  // no la vinculación técnica del TPV.
  const MATRIZ = [
    ["POST", "/api/fidelizacion/integracion", "direccion", "generar/regenerar token"],
    ["GET", "/api/fidelizacion/integracion", "direccion", "estado multilocal (lleva pista de token)"],
    ["POST", "/api/fidelizacion/integracion/:id/activo", "direccion", "activar/desactivar"],
    ["POST", "/api/fidelizacion/integracion/:id/revocar", "direccion", "revocar"],
    ["GET", "/api/fidelizacion/integracion/:id/workplace-observado", "direccion", "mirar Workplace"],
    ["POST", "/api/fidelizacion/integracion/:id/workplace", "direccion", "confirmar Workplace"],
    ["GET", "/api/fidelizacion/diagnostico", "direccion", "diagnóstico"],
    ["GET", "/api/fidelizacion/facturas", "direccion", "listado de facturas"],
    ["GET", "/api/fidelizacion/facturas/:id", "direccion", "detalle de una factura"],
    ["POST", "/api/fidelizacion/facturas/:id/prueba", "direccion", "marcar como prueba"],
    ["GET", "/api/fidelizacion/facturas/:id/importes", "direccion", "importes seguros"],
    ["POST", "/api/fidelizacion/facturas/purgar-cuerpos", "direccion", "purgar cuerpos"],
    ["GET", "/api/fidelizacion/miembro", "direccion", "buscar socio"],
  ];

  for (const [metodo, ruta, rol, que] of MATRIZ) {
    test(`${metodo} ${ruta} → ${rol} (${que})`, () => {
      const firma = `app.${metodo.toLowerCase()}("${ruta}"`;
      const i = server.indexOf(firma);
      assert.ok(i > 0, `no existe ${metodo} ${ruta}`);
      const cabecera = server.slice(i, i + firma.length + 60);
      assert.match(cabecera, new RegExp(`requireAuth\\(\\["${rol}"\\]\\)`), `${ruta} no es de ${rol}`);
      for (const otro of ["marketing", "encargado", "contabilidad", "PROMOS_ROLES"]) {
        assert.ok(!cabecera.includes(otro), `${ruta} deja entrar a ${otro}`);
      }
    });
  }

  test("las DOS rutas externas no llevan sesión: las llama Ágora con su token", () => {
    for (const r of ['app.get("/api/fidelizacion/agora/:token/member/:memberId"',
                     'app.post("/api/fidelizacion/agora/:token/factura"']) {
      const cabecera = server.slice(server.indexOf(r), server.indexOf(r) + r.length + 40);
      assert.ok(!cabecera.includes("requireAuth"), `${r} pide sesión: Ágora no la tiene`);
    }
  });

  test("las rutas del PROGRAMA son de Dirección y Marketing, y solo esas", () => {
    const compartidas = ["/api/fidelizacion/reglas", "/api/fidelizacion/interruptores",
                         "/api/fidelizacion/revisiones", "/api/fidelizacion/sombra",
                         "/api/fidelizacion/socio"];
    for (const c of compartidas) {
      const firmas = [...server.matchAll(new RegExp(`app\\.(get|post)\\("${c.replace(/\//g, "\\/")}", ([^,]+),`, "g"))];
      assert.ok(firmas.length >= 1, `falta ${c}`);
      for (const f of firmas) assert.equal(f[2].trim(), "requireAuth(PROMOS_ROLES)", c);
    }
  });

  test("no hay ninguna ruta de fidelización con un rol inesperado", () => {
    const todas = [...server.matchAll(/app\.(get|post|put|delete)\("(\/api\/fidelizacion\/[^"]*)", ([^,]*),/g)]
      // Las dos externas las llama Ágora con su token y no tienen sesión: su candado es otro y
      // tiene su propio test justo encima.
      .filter((m) => !m[2].startsWith("/api/fidelizacion/agora/:token/"));
    const raras = todas.filter((m) => !/requireAuth\(\["direccion"\]\)|requireAuth\(PROMOS_ROLES\)/.test(m[3]))
                       .map((m) => `${m[1].toUpperCase()} ${m[2]} → ${m[3]}`);
    assert.deepEqual(raras, [], "hay rutas de fidelización que no son solo de Dirección");
  });
});

describe("la pantalla parte del catálogo, no de lo que haya en la base", () => {
  test("se recorren LOS LOCALES, y los datos se unen encima", () => {
    // Un SELECT sobre fid_integraciones solo enseñaría los que ya tienen algo. Los que faltan por
    // configurar son justo los que hay que ver para poder configurarlos.
    assert.match(estado, /const locales = LOCALES_CANON\.map\(\(local\) => \{/);
    assert.match(estado, /const f = porLocal\.get\(local\) \|\| null;/);
    assert.ok(!/locales = \(filas \|\| \[\]\)\.map/.test(estado), "la pantalla sale de la base");
  });

  test("los siete locales de la casa salen, con integración o sin ella", () => {
    assert.equal(LOCALES.length, 7);
    for (const l of [LLORET, TORDERA, "La Tapeta - Blanes", "La Tapeta - Girona",
                     "Can Mateu - Tordera", "Botiga d'en Mateu - Tordera", "Oficina"]) {
      assert.ok(LOCALES.includes(l), `falta ${l}`);
    }
    // Sin fila, el estado es «sin configurar» y solo se ofrece generar.
    assert.equal(estadoVerificacion(null), "sin_configurar");
    assert.deepEqual([...botonesDe(null)], ["generar", "facturas", "purgar"]);
  });

  test("los TRES locales de Tordera son distintos entre sí", () => {
    const tordera = LOCALES.filter((l) => l.endsWith("Tordera"));
    assert.equal(tordera.length, 3);
    const claves = tordera.map((l) => claveDeFactura(l, "oficial", "G"));
    assert.equal(new Set(claves).size, 3, "dos locales de Tordera comparten clave");
  });

  test("tocar Tordera no consulta ni altera la integración de Lloret", () => {
    // Generar va por el local pedido; activar, revocar y confirmar van por `id`. Ninguna de las
    // cuatro puede alcanzar a otro local.
    assert.match(generar, /WHERE local = \? AND revocado_en IS NULL`, \[ahora, req\.user\.username, local\]\)/);
    for (const r of [activo, revocar, wpOk]) {
      assert.match(r, /WHERE id = \?/);
      // Lo que se mira es lo que ESCRIBE: `wpOk` sí lee las facturas de prueba de su local, y eso
      // es correcto — lo que no puede es actualizar por local en vez de por id.
      const escribe = [...r.matchAll(/UPDATE fid_\w+ SET [^`]*?WHERE ([^`]*)`/g)].map((m) => m[1].trim());
      for (const w of escribe) {
        assert.match(w, /^id = \?/, "una escritura por id alcanza a todo un local");
      }
    }
    // Y la consulta de estado agrupa: no hay ninguna que pida un local concreto.
    assert.ok(!/FROM fid_integraciones WHERE local = \?/.test(estado));
  });
});

describe("la conexión saliente no bloquea nada", () => {
  test("generar, activar y recibir NO consultan agora_locales", () => {
    // En fidelización es Ágora quien nos llama: sin host ni credenciales se reciben validaciones y
    // facturas exactamente igual. Atar una cosa a la otra dejaría Tordera sin fidelización por no
    // tener configurada una sincronización que todavía no existe.
    for (const [nombre, r] of [["generar", generar], ["activar", activo], ["revocar", revocar],
                               ["validación", validacion], ["factura", facturaExt],
                               ["confirmar workplace", wpOk]]) {
      assert.ok(!r.includes("agora_locales"), `${nombre} depende de la conexión saliente`);
    }
  });

  test("solo la pantalla de estado la lee, y para avisar", () => {
    assert.match(estado, /FROM agora_locales/);
    // Y si esa tabla falla, las tarjetas se pintan igual.
    assert.match(estado, /\} catch \{ \/\* sin tabla de Ágora, la fidelización entrante sigue/);
  });

  test("el aviso dice para qué hará falta, sin bloquear", () => {
    const f = panel.slice(panel.indexOf("function renderFidLocal("), panel.indexOf("function renderFidPiloto()"));
    assert.match(f, /Hará falta para el catálogo de productos/);
    assert.ok(!/no se puede generar|hace falta antes/i.test(f), "el panel bloquea por la saliente");
  });
});

describe("el panel: una tarjeta por local, sin rastro del piloto", () => {
  test("se pinta una tarjeta por cada local de la casa", () => {
    assert.match(panel, /function renderFidLocal\(L\)/);
    assert.match(panel, /\(FID\.locales \|\| \[\]\)\.map\(renderFidLocal\)/);
    assert.match(estado, /LOCALES_CANON\.map\(\(local\) =>/);
  });

  test("los locales sin integración salen como «Sin configurar»", () => {
    assert.match(panel, /sin_configurar:\s*\{[^}]*Sin configurar/);
    assert.match(panel, /todavía no tiene integración/);
  });

  test("cada acción lleva SU local o SU id", () => {
    const f = panel.slice(panel.indexOf("function renderFidLocal("), panel.indexOf("function renderFidPiloto()"));
    for (const a of ["fid-generar", "fid-facturas", "fid-purgar"]) {
      assert.match(f, new RegExp(`data-act="${a}" data-local="\\$\\{esc\\(L\\.local\\)\\}"`), `${a} no lleva el local`);
    }
    for (const a of ["fid-activo", "fid-revocar"]) {
      assert.match(f, new RegExp(`data-act="${a}" data-id="\\$\\{i\\.id\\}"`), `${a} no lleva el id`);
    }
  });

  test("la tarjeta enseña todo lo que hace falta para operar", () => {
    const f = panel.slice(panel.indexOf("function renderFidLocal("), panel.indexOf("function renderFidPiloto()"));
    for (const campo of ["Token", "Caduca", "Versión de Ágora", "Validaciones", "Facturas",
                         "Movimientos", "Historial de tokens"]) {
      assert.ok(f.includes(campo), `falta «${campo}» en la tarjeta`);
    }
    assert.match(f, /i\.token_pista/);
    assert.ok(!/token_hash/.test(f), "la tarjeta enseña el hash");
  });

  test("las DOS capacidades se enseñan por separado", () => {
    const f = panel.slice(panel.indexOf("function renderFidLocal("), panel.indexOf("function renderFidPiloto()"));
    assert.match(f, /Fidelización entrante/);
    assert.match(f, /Conexión saliente con Ágora/);
    assert.match(f, /Ágora llama a nuestras URLs/);
    assert.match(f, /Hará falta para el catálogo de productos/);
  });

  test("de la conexión saliente solo salen BOOLEANOS", () => {
    // Ni host, ni usuario, ni contraseña, ni el token de Ágora, ni su pista.
    const sal = estado.slice(estado.indexOf("let saliente = new Map()"), estado.indexOf("const locales ="));
    assert.match(sal, /host: !!r\.host/);
    assert.match(sal, /credenciales: !!\(r\.usuario && r\.pass_enc\) \|\| !!r\.token/);
    assert.match(sal, /local_id: !!r\.local_id/);
    // Nada se copia tal cual: `pass_enc` solo puede aparecer dentro de un `!!(...)`.
    for (const crudo of ["host: r.host", "usuario: r.usuario", "token: r.token",
                         "pass_enc: ", "tokenHint", "...r"]) {
      assert.ok(!sal.includes(crudo), `la conexión saliente devuelve «${crudo}» en claro`);
    }
    // Y todos los campos que salen son booleanos derivados o literales.
    const campos = [...sal.matchAll(/^\s{8}(\w+): (.+?),$/gm)].map((m) => m[2]);
    for (const v of campos) {
      assert.ok(/^(!!|true|false)/.test(v) || /!==|===/.test(v), `«${v}» no es un booleano`);
    }
  });

  test("no queda ni un «Piloto Lloret» en ninguna pantalla", () => {
    for (const viejo of ["Piloto Lloret", "Local del piloto", "Fase 1 limitada"]) {
      assert.ok(!panel.includes(viejo), `queda el texto «${viejo}»`);
    }
    assert.match(panel, /<h3>Fidelización Ágora<\/h3>/);
    assert.match(panel, /Integración por local/);
  });

  test("dice qué funciona ya y qué no", () => {
    const f = panel.slice(panel.indexOf("function renderFidPiloto()"), panel.indexOf("async function loadFidPiloto()"));
    assert.match(f, /registrar sus visitas <b>ya funciona<\/b>/);
    assert.match(f, /todavía no están activos/);
    assert.match(f, /Cada local necesita su propia configuración/);
  });

  test("las URLs recién generadas solo salen en la tarjeta de SU local", () => {
    // Enseñarlas en todas haría que se peguen las de un local en el TPV de otro.
    assert.match(panel, /FID\.urls && FID\.urlsLocal === L\.local/);
  });

  test("buscar socio enseña el saldo global y el desglose por local", () => {
    const m = trozo('app.get("/api/fidelizacion/miembro"', 'app.get("/", (req, res)');
    assert.match(m, /FROM fid_movimientos WHERE qr_id = \?`, \[qr\.id\]\)/);
    assert.match(m, /GROUP BY local ORDER BY local/);
    assert.match(m, /porLocal/);
  });
});
