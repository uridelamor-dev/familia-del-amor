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
import { crearTransaccion, leerSecuencias } from "../src/modules/fidelizacion/agora.js";

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

describe("el diagnóstico: las CUATRO tablas, de una lista cerrada", () => {
  test("la lista incluye fid_movimientos, que antes faltaba", () => {
    // El libro de visitas quedaba fuera del diagnóstico: precisamente la tabla que llevará el
    // saldo de los clientes.
    assert.match(server, /const FID_TABLAS = Object\.freeze\(\["fid_integraciones", "fid_validaciones", "fid_facturas", "fid_movimientos"\]\)/);
    for (const t of ["fid_integraciones", "fid_validaciones", "fid_facturas", "fid_movimientos"]) {
      assert.ok(server.includes(`"${t}"`), `falta ${t}`);
    }
  });

  test("está CONGELADA y ningún nombre viene de la petición", () => {
    assert.match(server, /Object\.freeze\(\["fid_integraciones"/);
    assert.match(server, /const FID_SECUENCIAS = Object\.freeze\(FID_TABLAS\.map/);
    // Lo único que se interpola en SQL pasa por el validador de identificadores.
    assert.match(diag, /FROM \$\{fidIdent\(t\)\}/);
    assert.match(server, /const fidIdent = \(s\) => \{ if \(!\/\^\[a-z\]\[a-z0-9_\]\*\$\/\.test\(String\(s\)\)\) throw/);
    // Y nada sale de req.
    assert.ok(!/req\.(query|params|body)/.test(diag), "el diagnóstico lee algo de la petición");
  });

  test("las consultas del catálogo filtran por la lista, no por un patrón", () => {
    // Con `LIKE 'fid_%'` mañana entraría cualquier tabla nueva que empiece igual.
    assert.ok(!/LIKE 'fid/.test(diag), "vuelve a filtrar por patrón");
    // Tres consultas de catálogo filtran por la lista; las secuencias van una a una (ver
    // `leerSecuencias`) y los conteos también, cada uno con su nombre validado.
    assert.equal((diag.match(/= ANY\(\?\)/g) || []).length, 3, "las consultas de catálogo deben filtrar por la lista");
  });
});

describe("el diagnóstico devuelve lo que hace falta y nada más", () => {
  test("por tabla: persistencia, oid, relfilenode, filas, triggers y claves ajenas", () => {
    assert.match(diag, /c\.oid::bigint AS oid/);
    assert.match(diag, /c\.relfilenode::bigint AS relfilenode/);
    assert.match(diag, /c\.relpersistence::text AS persistencia/);
    assert.match(diag, /c\.relrowsecurity AS rls/);
    assert.match(diag, /NOT t\.tgisinternal/, "deben excluirse los triggers internos de PostgreSQL");
    assert.match(diag, /AS salientes/);
    assert.match(diag, /AS entrantes/, "las claves ajenas que APUNTAN a la tabla son las que cascadean");
    assert.match(diag, /SELECT COUNT\(\*\)::int AS n FROM \$\{fidIdent\(t\)\}/);
  });

  test("las secuencias se consultan una a una, con nombre controlado", () => {
    // `pg_sequences` da `last_value` pero NO `is_called`, y deducir uno del otro es contar una
    // cosa por otra.
    assert.match(diag, /const sec = await fidLeerSecuencias\(dbGet, FID_SECUENCIAS, fidIdent\)/);
    assert.ok(!/pg_sequences/.test(diag), "vuelve a deducir is_called desde pg_sequences");
    const modulo = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
    assert.match(modulo, /SELECT last_value, is_called FROM \$\{ident\(q\)\}/);
  });

  test("cada tabla se cuenta por separado: si falta una, las demás siguen", () => {
    assert.match(diag, /for \(const t of FID_TABLAS\)/);
    assert.match(diag, /catch \{ filas\[t\] = null; \}/);
  });

  test("NO devuelve base, usuario, host, puerto, DATABASE_URL ni la ruta de búsqueda", () => {
    for (const prohibido of ["current_database", "current_user", "current_setting", "search_path",
                             "usuario_huella", "inet_server_addr", "inet_server_port", "pg_shadow", "pg_authid"]) {
      assert.ok(!diag.includes(prohibido), `el diagnóstico usa ${prohibido}`);
    }
    const sinHuella = diag.replace(/fidHash\(String\(process\.env\.DATABASE_URL \|\| ""\)\)\.slice\(0, 12\)/, "X");
    assert.ok(!/DATABASE_URL/.test(sinHuella), "la URL de la base sale fuera de la huella");
  });

  test("ni el token, ni su hash, ni el autor, ni el detalle libre, ni un valor de negocio", () => {
    for (const prohibido of ["token_hash", "a.autor", "autor:", "member_id", "member_hash",
                             "importe", "global_id", "cuerpo"]) {
      assert.ok(!diag.includes(prohibido), `el diagnóstico devuelve ${prohibido}`);
    }
    assert.match(diag, /return \{ accion: String\(f\.accion\), fecha: String\(f\.creado_en \|\| ""\), pista \}/);
  });

  test("la leyenda no saca conclusiones de más", () => {
    // Es lo que evita que quien lea el JSON confunda «reescritura» con «TRUNCATE».
    assert.match(diag, /relfilenode_distinto_mismo_oid: "Hubo una reescritura: TRUNCATE, pero también VACUUM FULL o CLUSTER\. No distingue entre ellos\."/);
    assert.match(diag, /secuencia_avanzada_sin_filas: "Compatible con DELETE y con TRUNCATE sin RESTART\. No distingue entre los dos\."/);
    assert.match(diag, /secuencia_reiniciada: "Por sí sola NO distingue DROP \+ CREATE de TRUNCATE RESTART/);
    assert.match(diag, /oid_distinto: "Frente a una medición ANTERIOR: hubo DROP \+ CREATE\."/);
    // Y NO atribuye el incidente: confirmar que una tabla es UNLOGGED no es demostrar que fue eso.
    assert.match(diag, /persistencia_u: "Confirma que la tabla es UNLOGGED y que PostgreSQL PUEDE vaciarla/);
    assert.match(diag, /harían falta pruebas de un reinicio sucio o una recuperación del servidor/);
    assert.ok(!/Lo confirmaría/.test(diag), "la leyenda vuelve a atribuir la causa");
    assert.match(diag, /persistencia_p: "Permanente\. Descarta el vaciado automático por recuperación\."/);
    assert.match(diag, /secuencia_ausente:/);
    assert.match(diag, /sin_medicion_previa:/, "hay que decir que la primera lectura no compara con nada");
  });

  test("es PASIVO: ni una escritura, ni un marcador, ni una secuencia tocada", () => {
    // Se quita ANTES el bloque de la leyenda: ahí dentro se explican a propósito los mecanismos
    // que buscamos —«DROP + CREATE», «TRUNCATE RESTART»— y una búsqueda a pelo confundiría la
    // explicación con una sentencia. Es el mismo cuidado que ya hizo falta con los comentarios.
    const codigoDiag = diag.slice(0, diag.indexOf("leyenda: {")) + diag.slice(diag.indexOf("} catch (e) {"));
    for (const escritura of ["dbRun(", "INSERT", "UPDATE", "ficAuditar(", "setConfig(",
                             "nextval", "setval", "CREATE ", "ALTER ", "DELETE"]) {
      assert.ok(!codigoDiag.includes(escritura), `el diagnóstico escribe: ${escritura}`);
    }
    // Solo lecturas, y solo de catálogo o de conteo.
    assert.ok(codigoDiag.includes("dbGet(") && codigoDiag.includes("dbAll("));
    const consultas = [...codigoDiag.matchAll(/`(SELECT[\s\S]*?)`/g)].map((m) => m[1]);
    assert.ok(consultas.length >= 5, `solo ${consultas.length} consultas`);
    for (const q of consultas) assert.match(q.trim(), /^SELECT/, `consulta que no es SELECT: ${q.slice(0, 40)}`);
  });

  test("solo Dirección y sin caché", () => {
    assert.match(diag, /app\.get\("\/api\/fidelizacion\/diagnostico", requireAuth\(\["direccion"\]\)/);
    assert.match(diag, /res\.set\("Cache-Control", "no-store"\)/);
  });

  test("un error se registra redactado y no sale nada crudo", () => {
    assert.match(diag, /console\.error\(lineaErrorSql\("\[fidelizacion\] diagnostico", e\)\)/);
    assert.match(diag, /res\.status\(500\)\.json\(\{ ok: false, error: "No se pudo diagnosticar" \}\)/);
    assert.ok(!/e\.message/.test(diag), "el mensaje de pg sale al cliente o al log");
    assert.ok(!/error: e\b/.test(diag));
  });
});

describe("las secuencias: last_value e is_called REALES", () => {
  const ident = (x) => { if (!/^[a-z][a-z0-9_]*$/.test(String(x))) throw new Error("identificador"); return x; };
  const NOMBRES = ["fid_integraciones_id_seq", "fid_validaciones_id_seq", "fid_facturas_id_seq", "fid_movimientos_id_seq"];

  /** Un `get` que responde como PostgreSQL: bigint como TEXTO y booleano de verdad. */
  const fakeGet = (mapa) => async (sql) => {
    const m = /FROM (\w+)$/.exec(String(sql).trim());
    assert.ok(m, "la consulta no tiene la forma esperada: " + sql);
    assert.match(String(sql), /^SELECT last_value, is_called FROM /);
    if (!(m[1] in mapa)) { const e = new Error('relation "' + m[1] + '" does not exist'); e.code = "42P01"; throw e; }
    return mapa[m[1]];
  };

  test("una secuencia NUNCA USADA da is_called=false", async () => {
    // Es el caso que `pg_sequences` no sabe distinguir: una secuencia recién creada devuelve
    // `last_value = 1`, NO NULL. Lo único que dice «sin estrenar» es `is_called`.
    const r = await leerSecuencias(fakeGet({ fid_integraciones_id_seq: { last_value: "1", is_called: false } }),
      ["fid_integraciones_id_seq"], ident);
    assert.equal(r[0].presente, true);
    assert.equal(r[0].last_value, 1);
    assert.equal(r[0].is_called, false, "una secuencia sin estrenar no puede decir que sí");
  });

  test("una secuencia USADA da is_called=true y su último valor", async () => {
    // `fid_validaciones` llegó a tener 2 filas: si su secuencia sigue en 2, las tablas son las
    // mismas y hubo un borrado de filas, no una recreación.
    const r = await leerSecuencias(fakeGet({ fid_validaciones_id_seq: { last_value: "2", is_called: true } }),
      ["fid_validaciones_id_seq"], ident);
    assert.equal(r[0].is_called, true);
    assert.equal(r[0].last_value, 2);
    assert.equal(typeof r[0].last_value, "number", "pg devuelve los bigint como texto: hay que normalizar");
  });

  test("una secuencia AUSENTE no rompe las demás", async () => {
    // Un diagnóstico que se cae entero porque falta una pieza no diagnostica nada.
    const r = await leerSecuencias(fakeGet({
      fid_integraciones_id_seq: { last_value: "3", is_called: true },
      // fid_validaciones_id_seq NO existe
      fid_facturas_id_seq: { last_value: "1", is_called: false },
      fid_movimientos_id_seq: { last_value: "7", is_called: true },
    }), NOMBRES, ident);

    assert.equal(r.length, 4, "deben salir las cuatro, exista o no cada una");
    const porNombre = Object.fromEntries(r.map((x) => [x.secuencia, x]));
    assert.equal(porNombre.fid_validaciones_id_seq.presente, false);
    assert.equal(porNombre.fid_validaciones_id_seq.last_value, null);
    assert.equal(porNombre.fid_validaciones_id_seq.is_called, null, "sin secuencia no se inventa un booleano");
    // Las otras tres, intactas.
    assert.equal(porNombre.fid_integraciones_id_seq.last_value, 3);
    assert.equal(porNombre.fid_facturas_id_seq.is_called, false);
    assert.equal(porNombre.fid_movimientos_id_seq.last_value, 7);
  });

  test("si NINGUNA existe, se informan las cuatro y no se lanza", async () => {
    const r = await leerSecuencias(fakeGet({}), NOMBRES, ident);
    assert.equal(r.length, 4);
    assert.ok(r.every((x) => x.presente === false && x.last_value === null && x.is_called === null));
  });

  test("las cuatro tablas tienen su secuencia, incluida fid_movimientos", () => {
    assert.match(server, /const FID_SECUENCIAS = Object\.freeze\(FID_TABLAS\.map\(\(t\) => `\$\{t\}_id_seq`\)\)/);
    assert.ok(NOMBRES.includes("fid_movimientos_id_seq"));
  });

  test("NINGÚN nombre procede de la petición, y uno inválido no llega al SQL", async () => {
    // La lista es una constante congelada derivada de otra constante congelada. Y aun así, el
    // validador está: un identificador interpolado sin comprobar es una costumbre que acaba
    // copiándose a donde sí importa.
    assert.ok(!/req\.(query|params|body)/.test(diag), "el diagnóstico lee algo de la petición");
    const vistas = [];
    const espia = async (sql) => { vistas.push(sql); return { last_value: "1", is_called: false }; };
    const r = await leerSecuencias(espia, ["fid_facturas_id_seq; DROP TABL" + "E x", "Fid_Malo", "1_malo", ""], ident);
    assert.deepEqual(vistas, [], "un nombre inválido ha llegado a construir SQL");
    assert.ok(r.every((x) => x.presente === false), "un nombre inválido debe quedar como ausente");
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
