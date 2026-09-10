// Salvaguardas del token de integración.
//
// LO QUE PASÓ: tras un despliegue, el panel volvió a pedir «Generar token» aunque en producción
// había una integración activa con sus URLs ya puestas en el TPV. Dos defectos lo hicieron posible,
// y el segundo hizo imposible diagnosticar el primero:
//
//  1. El endpoint de estado devolvía `ok: true, integracion: null` ante CUALQUIER error de
//     consulta. «Ha fallado la base» y «no hay integración» eran la misma respuesta, y el panel
//     ofrecía justo el botón que revoca lo que hubiera puesto en el TPV.
//  2. «Generar token» revocaba la integración anterior ANTES de comprobar si podía crear la nueva,
//     y sin transacción. Un fallo en medio te dejaba sin ninguna.
//
// Estos tests son el candado de los dos.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearTransaccion } from "../src/modules/fidelizacion/agora.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const trozo = (desde, hasta) => server.slice(server.indexOf(desde), server.indexOf(hasta));

const estado = trozo('app.get("/api/fidelizacion/integracion", requireAuth', 'app.get("/api/fidelizacion/diagnostico"');
const generar = trozo('app.post("/api/fidelizacion/integracion", requireAuth', 'app.get("/api/fidelizacion/integracion", requireAuth');
const diag = trozo('app.get("/api/fidelizacion/diagnostico"', 'app.post("/api/fidelizacion/integracion/:id/activo"');

describe("un fallo de consulta NUNCA parece «no hay integración»", () => {
  test("el catch devuelve 500, no un 200 con integracion: null", () => {
    assert.match(estado, /res\.status\(500\)\.json\(\{ ok: false/);
    assert.ok(!/catch \{ res\.json\(\{ ok: true, integracion: null/.test(estado), "vuelve a tragarse el error");
    assert.ok(!/integracion: null, facturas: \{\}/.test(estado), "vuelve a devolver los objetos vacíos");
  });

  test("y no filtra el motivo hacia fuera", () => {
    assert.match(estado, /error: "No se pudo leer el estado de la integración"/);
    assert.ok(!/error: e\.message/.test(estado));
    // El mensaje de pg lleva dentro el hash del token, la IP o el usuario: no puede ir a un log.
    assert.match(estado, /console\.error\(lineaErrorSql\("\[fidelizacion\] estado", e\)\)/);
    assert.ok(!/e\.message/.test(estado), "vuelve a imprimirse el mensaje de pg");
  });

  test("el panel lo pinta como «Sin comprobar», y avisa de que NO generen", () => {
    const f = panel.slice(panel.indexOf("async function loadFidPiloto()"), panel.indexOf("async function fidGenerar()"));
    assert.match(f, /Sin comprobar/);
    assert.match(f, /Esto no significa que no la haya/);
    assert.match(f, /no generes un token nuevo/);
    assert.ok(!/data-act="fid-generar"/.test(f), "ofrece generar cuando no ha podido comprobar");
  });
});

describe("generar es transaccional y valida ANTES de revocar", () => {
  test("la URL se comprueba antes de tocar la integración vieja", () => {
    const iPub = generar.indexOf("fidBasePublica(");
    const iErr = generar.indexOf("if (!pub.ok)");
    const iRev = generar.indexOf("UPDATE fid_integraciones SET revocado_en");
    assert.ok(iPub > 0 && iErr > iPub, "no se comprueba pub.ok");
    assert.ok(iRev > iErr, "se revoca ANTES de saber si se puede crear la nueva");
  });

  test("revocar e insertar van en la MISMA transacción", () => {
    const iTx = generar.indexOf("await fidTransaccion(");
    const iRev = generar.indexOf("UPDATE fid_integraciones SET revocado_en");
    const iIns = generar.indexOf("INSERT INTO fid_integraciones");
    assert.ok(iTx > 0, "no hay transacción");
    assert.ok(iRev > iTx && iIns > iTx, "revocar o insertar quedan fuera de la transacción");
  });

  test("sigue naciendo desactivada", () => {
    assert.match(generar, /VALUES \(\?,\?,\?,FALSE,\?,\?,\?\)/);
  });

  test("y el token sigue saliendo una sola vez, sin entrar en la auditoría", () => {
    assert.match(generar, /urls: fidUrls\(pub\.base, token\)/);
    assert.match(generar, /detalle: \{ pista: fidPistaToken\(token\), base: pub\.base, fuente: pub\.fuente \}/);
    assert.ok(!/:\s*token\s*[,}]/.test(generar), "el token entra como valor de un campo");
  });
});

describe("la integración VIVA no se puede esconder", () => {
  test("la consulta prioriza la no revocada, no la más nueva", () => {
    // Con `ORDER BY id DESC` a secas, una fila revocada más reciente taparía a una integración
    // viva más antigua y el panel diría que no hay ninguna.
    assert.match(estado, /ORDER BY \(revocado_en IS NULL\) DESC, id DESC LIMIT 1/);
  });

  test("hay historial, y sin token ni hash", () => {
    assert.match(estado, /FROM fid_integraciones WHERE local = \? ORDER BY id DESC LIMIT 20/);
    const sel = estado.slice(estado.indexOf("const historial"), estado.indexOf("const c ="));
    assert.ok(!/token_hash/.test(sel), "el historial expone el hash");
    assert.ok(!/\btoken\b(?!_pista)/.test(sel), "el historial expone el token");
  });

  test("el panel lo enseña plegado, con la pista y el estado", () => {
    const f = panel.slice(panel.indexOf("function renderFidPiloto()"), panel.indexOf("async function loadFidPiloto()"));
    assert.match(f, /Historial de tokens/);
    assert.match(f, /h\.token_pista/);
    assert.ok(!/h\.token_hash/.test(f));
  });
});

describe("«Regenerar» avisa de lo que rompe", () => {
  test("con integración viva, el botón cambia de nombre y el aviso es explícito", () => {
    const f = panel.slice(panel.indexOf("function renderFidPiloto()"), panel.indexOf("async function loadFidPiloto()"));
    assert.match(f, /Regenerar…/);
    const g = panel.slice(panel.indexOf("async function fidGenerar()"), panel.indexOf("async function fidActivo("));
    assert.match(g, /HAY UNA INTEGRACIÓN VIVA/);
    assert.match(g, /dejará de poder validar y de cerrar facturas/);
    assert.match(g, /pegues las dos URLs nuevas en Ágora/);
    assert.match(g, /Si solo quieres activarla/);
  });

  test("sin integración, el aviso es el corto", () => {
    const g = panel.slice(panel.indexOf("async function fidGenerar()"), panel.indexOf("async function fidActivo("));
    assert.match(g, /const viva = FID\.integracion && !FID\.integracion\.revocado_en/);
    assert.match(g, /Nace desactivado/);
  });
});

describe("el diagnóstico devuelve lo MÍNIMO", () => {
  test("NO devuelve base, usuario, host, puerto, DATABASE_URL ni la ruta de búsqueda", () => {
    // Un endpoint de diagnóstico es donde más fácil es acabar exponiendo la infraestructura
    // entera «por si acaso hace falta».
    for (const prohibido of ["current_database", "current_user", "current_setting", "search_path",
                             "usuario_huella", "inet_server_addr", "inet_server_port"]) {
      assert.ok(!diag.includes(prohibido), `el diagnóstico usa ${prohibido}`);
    }
    // La DATABASE_URL solo aparece dentro de la huella.
    const sinHuella = diag.replace(/fidHash\(String\(process\.env\.DATABASE_URL \|\| ""\)\)\.slice\(0, 12\)/, "X");
    assert.ok(!/DATABASE_URL/.test(sinHuella), "la URL de la base sale fuera de la huella");
  });

  test("ni el token, ni su hash, ni el autor, ni el detalle libre", () => {
    for (const prohibido of ["token_hash", "a.autor", "autor:", "detalle: (()"]) {
      assert.ok(!diag.includes(prohibido), `el diagnóstico devuelve ${prohibido}`);
    }
    // La auditoría se proyecta a TRES campos y ninguno es libre.
    assert.match(diag, /return \{ accion: String\(f\.accion\), fecha: String\(f\.creado_en \|\| ""\), pista \}/);
    assert.match(diag, /d\.pista === "string"/, "la pista debe leerse con tipo, no confiar en el JSON");
  });

  test("lo que SÍ devuelve: huella, esquema, tablas, recuentos y auditoría proyectada", () => {
    assert.match(diag, /url_huella: fidHash\(String\(process\.env\.DATABASE_URL \|\| ""\)\)\.slice\(0, 12\)/);
    assert.match(diag, /esquema: con\?\.esquema \? String\(con\.esquema\) : null/);
    assert.match(diag, /tablas, filas: filas \|\| \{\}, auditoria,/);
  });

  test("los nombres de tabla salen de una lista CERRADA, no del catálogo", () => {
    // Sin la lista, esto volcaría los nombres de todas las tablas que empiecen por «fid_», que
    // mañana pueden ser de otra cosa.
    assert.match(diag, /const NUESTRAS = \["fid_integraciones", "fid_validaciones", "fid_facturas"\]/);
    assert.match(diag, /WHERE table_name = ANY\(\?\)/);
    assert.match(diag, /\.filter\(\(t\) => NUESTRAS\.includes\(t\.tabla\)\)/);
  });

  test("cuenta las filas de las tres tablas", () => {
    for (const t of ["fid_integraciones", "fid_validaciones", "fid_facturas"]) {
      assert.ok(diag.includes(`COUNT(*)::int FROM ${t}`), `no cuenta ${t}`);
    }
  });

  test("solo Dirección, sin caché y sin escribir NADA", () => {
    assert.match(diag, /app\.get\("\/api\/fidelizacion\/diagnostico", requireAuth\(\["direccion"\]\)/);
    assert.match(diag, /res\.set\("Cache-Control", "no-store"\)/);
    for (const escritura of ["dbRun(", "INSERT", "UPDATE", "ficAuditar("]) {
      assert.ok(!diag.includes(escritura), `el diagnóstico escribe: ${escritura}`);
    }
  });
});

describe("los logs de fidelización nunca llevan el mensaje de pg", () => {
  const zona = server.slice(server.indexOf("// FIDELIZACIÓN CON ÁGORA · FASE 1"), server.indexOf('app.get("/", (req, res)'));

  test("todos usan lineaErrorSql, ninguno e.message", () => {
    // El mensaje de PostgreSQL lleva dentro lo que ha fallado, literalmente: el hash de un token
    // en una violación de unicidad, la IP y el puerto en un ECONNREFUSED, el usuario en un fallo
    // de autenticación. `lineaError` sí lo imprime; `lineaErrorSql` no.
    const logs = [...zona.matchAll(/console\.error\(([^;]*)\);/g)].map((m) => m[1]);
    assert.ok(logs.length >= 4, `solo ${logs.length} logs`);
    for (const l of logs) {
      assert.match(l, /lineaErrorSql\(/, `log sin el mecanismo seguro: ${l}`);
      assert.ok(!/e\.message/.test(l), `log con el mensaje de pg: ${l}`);
    }
  });

  test("y lineaErrorSql no puede filtrar nada de eso", async () => {
    const { lineaErrorSql } = await import("../src/modules/seguridad/redactar.js");
    const err = Object.assign(new Error(
      'duplicate key "fid_integraciones_token_hash_key" Key (token_hash)=(9f2a1c3d) already exists ' +
      'at 10.20.30.40:5432 user "neondb_owner" password authentication failed'),
      { code: "23505", routine: "_bt_check_unique" });
    const linea = lineaErrorSql("[fidelizacion] estado", err);
    for (const secreto of ["token_hash", "9f2a1c3d", "10.20.30.40", "5432", "neondb_owner", "password", "duplicate key"]) {
      assert.ok(!linea.includes(secreto), `se ha filtrado «${secreto}»: ${linea}`);
    }
    // Y sí sale lo que sirve para diagnosticar.
    assert.match(linea, /code=23505/);
    assert.match(linea, /_bt_check_unique/);
  });

  test("no se imprime ningún objeto de error entero", () => {
    // Se quitan primero las llamadas CORRECTAS. Con una regex a pelo,
    // `console.error(lineaErrorSql("ctx", e))` parece el fallo, porque el `e` de dentro va pegado
    // a un paréntesis. Es el mismo falso positivo que ya apareció con los logs de WhatsApp.
    const limpio = zona.replace(/lineaErrorSql\([^)]*\)/g, "X");
    assert.ok(!/console\.error\(\s*e\s*\)/.test(limpio), "se imprime el error entero");
    assert.ok(!/console\.error\([^)]*,\s*e\s*\)/.test(limpio), "se pasa el error como segundo argumento");
  });
});

describe("la transacción va por UN SOLO cliente del pool", () => {
  /** Un pool de mentira que registra por qué conexión sale cada consulta. */
  function poolFalso({ fallaEn = null } = {}) {
    const consultas = [];
    let nCliente = 0;
    return {
      consultas,
      clientes: () => new Set(consultas.map((c) => c.cliente)).size,
      liberados: () => consultas.filter((c) => c.q === "__release__").length,
      connect: async () => {
        const id = ++nCliente;
        return {
          query: async (q, p) => {
            consultas.push({ cliente: id, q: String(q).replace(/\s+/g, " ").trim().slice(0, 40) });
            if (fallaEn && String(q).includes(fallaEn)) {
              throw Object.assign(new Error("fallo simulado"), { code: "23505" });
            }
            return { rows: [{ id: 1 }] };
          },
          release: () => consultas.push({ cliente: id, q: "__release__" }),
        };
      },
    };
  }
  const toPositional = (q) => q;

  test("BEGIN, las escrituras y COMMIT salen por el MISMO cliente", async () => {
    // Con `pool.query()` cada consulta puede salir por una conexión distinta: el BEGIN abriría una
    // transacción en una y el INSERT escribiría en otra, fuera de ella. El ROLLBACK no desharía
    // nada y nadie se enteraría.
    const pool = poolFalso();
    const enTx = crearTransaccion({ pool, toPositional });
    await enTx(async (x) => {
      await x.run("UPDATE fid_integraciones SET revocado_en = ?", ["x"]);
      return x.run("INSERT INTO fid_integraciones (local) VALUES (?) RETURNING id", ["y"]);
    });
    assert.equal(pool.clientes(), 1, "se han usado varias conexiones");
    const q = pool.consultas.map((c) => c.q);
    assert.equal(q[0], "BEGIN");
    assert.match(q[1], /SET LOCAL statement_timeout/);
    assert.ok(q.some((z) => z.startsWith("UPDATE fid_integraciones")));
    assert.ok(q.some((z) => z.startsWith("INSERT INTO fid_integraciones")));
    assert.equal(q[q.length - 2], "COMMIT");
    assert.equal(q[q.length - 1], "__release__", "la conexión no se ha devuelto al pool");
  });

  test("ROLLBACK: si el INSERT falla, la integración anterior SIGUE VIVA", async () => {
    // Es el caso que rompió producción: revocar y crear iban sueltas, así que un fallo en la
    // segunda dejaba la primera revocada y ninguna nueva.
    const pool = poolFalso({ fallaEn: "INSERT INTO fid_integraciones" });
    const enTx = crearTransaccion({ pool, toPositional });
    await assert.rejects(() => enTx(async (x) => {
      await x.run("UPDATE fid_integraciones SET revocado_en = ?", ["x"]);
      return x.run("INSERT INTO fid_integraciones (local) VALUES (?) RETURNING id", ["y"]);
    }), (e) => e.code === "23505");

    const q = pool.consultas.map((c) => c.q);
    assert.ok(q.includes("ROLLBACK"), "no se ha deshecho la transacción");
    assert.ok(!q.includes("COMMIT"), "¡se ha confirmado una transacción fallida!");
    // El UPDATE que revoca salió, pero dentro de la transacción que se ha deshecho: la
    // integración anterior sigue viva en la base.
    assert.ok(q.some((z) => z.startsWith("UPDATE fid_integraciones")));
    assert.equal(pool.clientes(), 1);
    assert.equal(q[q.length - 1], "__release__", "la conexión se queda colgada tras el fallo");
  });

  test("la conexión se devuelve al pool pase lo que pase", async () => {
    const pool = poolFalso({ fallaEn: "BEGIN" });
    const enTx = crearTransaccion({ pool, toPositional });
    await assert.rejects(() => enTx(async () => {}));
    assert.equal(pool.liberados(), 1);
  });

  test("server.js usa la fábrica con el pool de verdad", () => {
    assert.match(server, /const fidTransaccion = fidCrearTransaccion\(\{ pool, toPositional \}\)/);
    assert.ok(!/async function fidTransaccion\(/.test(server), "server.js conserva su propia copia");
  });
});

describe("nada del esquema borra filas", () => {
  const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");

  test("solo CREATE IF NOT EXISTS y el DROP de un índice viejo", () => {
    // Se comprueba por trozos para que este mismo fichero no lleve escritas las sentencias que
    // prohíbe: leerlo no puede parecerse a usarlas.
    for (const peligro of ["TRUN" + "CATE", "DELETE " + "FROM", "DROP " + "TABLE"]) {
      assert.ok(!esquema.includes(peligro), `el esquema contiene ${peligro}`);
    }
    const drops = [...esquema.matchAll(/DROP INDEX IF EXISTS (\w+)/g)].map((m) => m[1]);
    assert.deepEqual(drops, ["idx_fid_factura_global"], "hay un DROP que no es el índice viejo");
  });

  test("y nadie borra de las tablas de integración en todo el servidor", () => {
    for (const t of ["fid_validaciones", "fid_integraciones"]) {
      assert.ok(!new RegExp("DELETE " + "FROM " + t).test(server), `alguien borra de ${t}`);
    }
  });
});
