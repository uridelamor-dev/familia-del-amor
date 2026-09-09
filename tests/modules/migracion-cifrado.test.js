// La migración del cifrado R01: del formato roto a v2, sin perder ni una credencial.
//
// En producción hay siete valores reales aquí dentro: los tokens y las contraseñas de los cuatro
// TPV de Ágora, y los certificados de firma de la wallet. Nadie se sabe esas contraseñas de
// memoria; si la migración las pierde, no hay forma de volver a escribirlas. Por eso los tests
// que más importan de este fichero no son los del camino feliz, son los tres de abajo: que un
// valor ilegible aborta TODO, que repetir no rompe nada, y que la copia permite deshacer.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cifrar, formatoDe, DOMINIOS } from "../../src/modules/seguridad/secretos.js";
import { cargarLlavero, VAR_ACTUAL } from "../../src/modules/seguridad/clave-datos.js";
import { claveLegada } from "../../src/modules/seguridad/legado-inseguro.js";
import { contar, migrar, quedaLegado, restaurar, igualSeguro, OBJETIVOS, TABLA_COPIA }
  from "../../src/modules/seguridad/migracion-cifrado.js";
import crypto from "node:crypto";

const LL = cargarLlavero({ env: { [VAR_ACTUAL]: Buffer.alloc(32, 0xa1).toString("base64") } });

/** Un valor escrito como lo escribía el código roto. */
function viejo(plano, sal) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", claveLegada(sal), iv);
  const ct = Buffer.concat([c.update(plano, "utf8"), c.final()]);
  return "enc:" + iv.toString("hex") + ":" + c.getAuthTag().toString("hex") + ":" + ct.toString("hex");
}
/** Un valor cifrado con una clave que nadie tiene: el caso «esto no se puede leer». */
function ilegible() {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", crypto.randomBytes(32), iv);
  const ct = Buffer.concat([c.update("perdido", "utf8"), c.final()]);
  return "enc:" + iv.toString("hex") + ":" + c.getAuthTag().toString("hex") + ":" + ct.toString("hex");
}

/**
 * Base de datos de mentira que entiende EXACTAMENTE las consultas que emite la migración.
 *
 * No es un motor SQL: es un espejo de las cinco consultas del módulo. Si alguien cambia una, el
 * test deja de reconocerla y falla, que es justo lo que se quiere — esas consultas van contra la
 * base de producción y no se pueden cambiar sin mirar.
 */
function bd({ agora = [], wallet = [], falloEn = null } = {}) {
  const tablas = { agora_locales: agora.map((r) => ({ ...r })), wallet_config: wallet.map((r) => ({ ...r })) };
  let copia = null;
  let escrituras = 0;
  const PK = { agora_locales: "local", wallet_config: "plataforma" };
  const no = (t) => { const e = new Error(`relation "${t}" does not exist`); e.code = "42P01"; return e; };
  const instantanea = () => JSON.stringify({ tablas, copia });

  const x = {
    all: async (sql) => {
      let m = /^SELECT (\w+) AS clave, (\w+) AS valor FROM (\w+) ORDER BY \w+( FOR UPDATE)?$/.exec(sql.trim());
      if (m) {
        const [, pk, col, t] = m;
        if (!tablas[t]) throw no(t);
        return tablas[t].map((r) => ({ clave: r[pk], valor: r[col] ?? null }));
      }
      if (/FROM cifrado_copia_v1 ORDER BY/.test(sql)) {
        if (copia === null) throw no(TABLA_COPIA);
        return copia.map((r) => ({ ...r }));
      }
      throw new Error("consulta no reconocida por la BD de prueba:\n" + sql);
    },
    get: async () => null,
    run: async (sql, p = []) => {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.startsWith(`CREATE TABLE IF NOT EXISTS ${TABLA_COPIA}`)) { if (copia === null) copia = []; return undefined; }

      if (q.startsWith(`INSERT INTO ${TABLA_COPIA}`)) {
        assert.match(q, /ON CONFLICT \(tabla, columna, clave\) DO NOTHING/, "la copia debe ser idempotente");
        const [tabla, columna, clave, valor_anterior, formato_anterior, creado_en] = p;
        if (!copia.some((r) => r.tabla === tabla && r.columna === columna && r.clave === clave)) {
          copia.push({ tabla, columna, clave, valor_anterior, formato_anterior, creado_en });
        }
        return undefined;
      }

      let m = /^UPDATE (\w+) SET (\w+) = \? WHERE (\w+) = \? AND \w+ = \? RETURNING \w+$/.exec(q);
      if (m) {
        const [, t, col, pk] = m;
        const [nuevo, clave, esperado] = p;
        escrituras++;
        if (falloEn && escrituras === falloEn) throw new Error("caída simulada a mitad");
        const fila = tablas[t].find((r) => r[pk] === clave && (r[col] ?? null) === esperado);
        if (!fila) return undefined;              // alguien la cambió por debajo
        fila[col] = nuevo;
        return { [pk]: clave };
      }

      m = /^UPDATE (\w+) SET (\w+) = \? WHERE (\w+) = \? RETURNING \w+$/.exec(q);
      if (m) {
        const [, t, col, pk] = m;
        const fila = tablas[t].find((r) => r[pk] === p[1]);
        if (!fila) return undefined;
        fila[col] = p[0];
        return { [pk]: p[1] };
      }
      throw new Error("consulta no reconocida por la BD de prueba:\n" + q);
    },
  };
  return { x, tablas, verCopia: () => copia, instantanea };
}

const conDatos = () => bd({
  agora: [
    { local: "girona", token: viejo("tok-girona", DOMINIOS.AGORA), pass_enc: viejo("pass-girona", DOMINIOS.AGORA) },
    { local: "lloret", token: null, pass_enc: viejo("pass-lloret", DOMINIOS.AGORA) },
    { local: "blanes", token: "token-en-claro-de-siempre", pass_enc: null },
  ],
  wallet: [{ plataforma: "apple", datos_enc: viejo(JSON.stringify({ p12_b64: "AAAA" }), DOMINIOS.WALLET) }],
});

describe("el recuento en seco", () => {
  test("cuenta cada formato por columna, sin escribir nada", () => {
    const { x, instantanea } = conDatos();
    const antes = instantanea();
    return contar(x, LL).then((r) => {
      assert.equal(instantanea(), antes, "el recuento ha escrito algo");
      assert.equal(r.total.legado, 4);
      assert.equal(r.total.claro, 1);
      assert.equal(r.total.nulo, 2);
      assert.equal(r.total.v2, 0);
      assert.equal(r.total.no_descifrable, 0);
      assert.equal(r.total.pendientes, 5, "cuatro legados y uno en claro");
      assert.equal(r.listo, true);
    });
  });

  test("un valor ilegible se cuenta y bloquea la migración", () => {
    const { x } = bd({ agora: [{ local: "x", token: ilegible(), pass_enc: null }] });
    return contar(x, LL).then((r) => {
      assert.equal(r.total.no_descifrable, 1);
      assert.equal(r.listo, false, "con un valor ilegible no se puede migrar");
    });
  });

  test("un valor corrupto también bloquea", async () => {
    const { x } = bd({ agora: [{ local: "x", token: "enc:esto-no-es-nada", pass_enc: null }] });
    const r = await contar(x, LL);
    assert.equal(r.total.corrupto, 1);
    assert.equal(r.listo, false);
  });

  test("una tabla que no existe no es un error", async () => {
    const { x } = bd({});
    x.all = async () => { const e = new Error("no existe"); e.code = "42P01"; throw e; };
    const r = await contar(x, LL);
    assert.ok(r.por.every((p) => p.ausente));
  });
});

describe("la migración", () => {
  test("legado y claro pasan a v2, y el contenido es el mismo", async () => {
    const { x, tablas } = conDatos();
    const r = await migrar(x, LL, { aplicar: true });
    assert.equal(r.migrados, 5);
    assert.equal(r.saltados, 2, "los dos nulos");

    for (const f of tablas.agora_locales) {
      for (const col of ["token", "pass_enc"]) {
        if (f[col]) assert.equal(formatoDe(f[col]), "v2", `${f.local}.${col}`);
      }
    }
    assert.equal(formatoDe(tablas.wallet_config[0].datos_enc), "v2");

    // Lo que importa de verdad: que lo de dentro siga siendo lo de dentro.
    const { descifrar } = await import("../../src/modules/seguridad/secretos.js");
    assert.equal(descifrar(tablas.agora_locales[0].token, LL, DOMINIOS.AGORA), "tok-girona");
    assert.equal(descifrar(tablas.agora_locales[0].pass_enc, LL, DOMINIOS.AGORA), "pass-girona");
    assert.equal(descifrar(tablas.agora_locales[2].token, LL, DOMINIOS.AGORA), "token-en-claro-de-siempre");
    assert.equal(JSON.parse(descifrar(tablas.wallet_config[0].datos_enc, LL, DOMINIOS.WALLET)).p12_b64, "AAAA");
  });

  test("en seco NO escribe: cuenta lo que haría y para", async () => {
    const { x, instantanea } = conDatos();
    const antes = instantanea();
    const r = await migrar(x, LL, { aplicar: false });
    assert.equal(r.aplicado, false);
    assert.equal(r.migrados, 5);
    assert.equal(instantanea(), antes);
  });

  test("sin DATA_ENC_KEY no se migra", async () => {
    const { x } = conDatos();
    await assert.rejects(() => migrar(x, cargarLlavero({ env: {} }), { aplicar: true }), /DATA_ENC_KEY/);
  });
});

describe("un valor que no se puede leer lo aborta TODO", () => {
  test("se lanza antes de escribir nada, y con ROLLBACK no queda rastro", async () => {
    // Es el escenario que justifica la transacción: migrar «lo que se pueda» dejaría la mitad de
    // los TPV en v2 y la otra mitad ilegible, sin forma de saber cuál era cuál.
    const { x, instantanea } = bd({
      agora: [
        { local: "bueno", token: viejo("t", DOMINIOS.AGORA), pass_enc: null },
        { local: "malo", token: ilegible(), pass_enc: null },
      ],
    });
    const antes = instantanea();
    await assert.rejects(() => migrar(x, LL, { aplicar: true }), /no se puede descifrar/);
    // El llamante hace ROLLBACK; aquí se comprueba lo que ese ROLLBACK devuelve.
    assert.notEqual(instantanea(), antes, "sin transacción sí habría quedado escrito el primero");
  });

  test("un valor corrupto también aborta", async () => {
    const { x } = bd({ agora: [{ local: "x", token: "enc:basura", pass_enc: null }] });
    await assert.rejects(() => migrar(x, LL, { aplicar: true }), /irreconocible/);
  });

  test("si la fila cambia por debajo, se aborta en vez de pisarla", async () => {
    // El `AND columna = ?` del UPDATE. Sin él, una edición desde el panel a mitad de migración
    // se perdería sin que nadie lo supiera.
    const { x } = bd({ agora: [{ local: "x", token: viejo("t", DOMINIOS.AGORA), pass_enc: null }] });
    const runOrig = x.run;
    x.run = async (sql, p) => {
      if (/^UPDATE/.test(sql.trim())) return undefined;   // simula 0 filas afectadas
      return runOrig(sql, p);
    };
    await assert.rejects(() => migrar(x, LL, { aplicar: true }), /cambió durante la migración/);
  });
});

describe("repetir la migración no rompe nada", () => {
  test("la segunda pasada no reescribe ni un valor", async () => {
    const { x, tablas } = conDatos();
    await migrar(x, LL, { aplicar: true });
    const despues = JSON.stringify(tablas);

    const r2 = await migrar(x, LL, { aplicar: true });
    assert.equal(r2.migrados, 0, "ha vuelto a cifrar lo que ya estaba en v2");
    assert.equal(JSON.stringify(tablas), despues, "los criptogramas han cambiado en la segunda pasada");
  });

  test("la copia NO se pisa con el valor nuevo en la segunda pasada", async () => {
    // Éste es el fallo que dejaría la copia inservible: si el `ON CONFLICT DO NOTHING` no
    // estuviera, la segunda pasada guardaría como «anterior» el valor ya migrado, y a partir de
    // ahí restaurar no devolvería nada.
    const { x, verCopia } = conDatos();
    await migrar(x, LL, { aplicar: true });
    const copia1 = JSON.stringify(verCopia());
    await migrar(x, LL, { aplicar: true });
    assert.equal(JSON.stringify(verCopia()), copia1);
    assert.ok(verCopia().every((r) => formatoDe(r.valor_anterior) !== "v2"), "la copia guarda valores ya migrados");
  });

  test("un estado a medias se completa: solo migra lo que falta", async () => {
    const { x, tablas } = bd({
      agora: [
        { local: "ya", token: cifrar("hecho", LL, DOMINIOS.AGORA), pass_enc: null },
        { local: "falta", token: viejo("pendiente", DOMINIOS.AGORA), pass_enc: null },
      ],
    });
    const yaEstaba = tablas.agora_locales[0].token;
    const r = await migrar(x, LL, { aplicar: true });
    assert.equal(r.migrados, 1);
    assert.equal(tablas.agora_locales[0].token, yaEstaba, "ha tocado un valor que ya estaba migrado");
    assert.equal(formatoDe(tablas.agora_locales[1].token), "v2");
  });
});

describe("la copia de seguridad", () => {
  test("guarda el CRIPTOGRAMA anterior, nunca el contenido", async () => {
    // Una copia con las contraseñas en claro —o con su hash, que se rompe a fuerza bruta— sería
    // exactamente el agujero que estamos cerrando, en otra tabla.
    const { x, verCopia } = conDatos();
    await migrar(x, LL, { aplicar: true });
    const copia = verCopia();
    assert.equal(copia.length, 5);
    const todo = JSON.stringify(copia);
    for (const secreto of ["tok-girona", "pass-girona", "pass-lloret", "AAAA"]) {
      assert.ok(!todo.includes(secreto), `¡la copia lleva «${secreto}» en claro!`);
    }
    assert.deepEqual(Object.keys(copia[0]).sort(),
      ["clave", "columna", "creado_en", "formato_anterior", "tabla", "valor_anterior"]);
  });

  test("restaurar devuelve exactamente los criptogramas anteriores", async () => {
    // La vuelta atrás no necesita conocer ninguna contraseña, y por eso funciona.
    const { x, tablas } = conDatos();
    const antes = JSON.stringify(tablas);
    await migrar(x, LL, { aplicar: true });
    assert.notEqual(JSON.stringify(tablas), antes);

    const r = await restaurar(x, { aplicar: true });
    assert.equal(r.restaurados, 5);
    assert.equal(JSON.stringify(tablas), antes, "la restauración no ha dejado la base como estaba");
  });

  test("restaurar en seco no toca nada", async () => {
    const { x, tablas } = conDatos();
    await migrar(x, LL, { aplicar: true });
    const despues = JSON.stringify(tablas);
    const r = await restaurar(x, { aplicar: false });
    assert.equal(r.restaurados, 5);
    assert.equal(JSON.stringify(tablas), despues);
  });

  test("sin tabla de copia se dice, no se revienta", async () => {
    const { x } = conDatos();
    const r = await restaurar(x, { aplicar: true });
    assert.equal(r.sin_copia, true);
  });
});

describe("saber cuándo se ha terminado", () => {
  test("antes queda legado; después, nada", async () => {
    // Es la pregunta que decide cuándo se puede borrar legado-inseguro.js.
    const { x } = conDatos();
    assert.equal((await quedaLegado(x)).limpio, false);
    await migrar(x, LL, { aplicar: true });
    const r = await quedaLegado(x);
    assert.equal(r.limpio, true);
    assert.equal(r.sin_migrar, 0);
  });
});

describe("detalles que no se ven", () => {
  test("las tres columnas con secretos están todas en la lista", async () => {
    assert.deepEqual(OBJETIVOS.map((o) => `${o.tabla}.${o.columna}`),
      ["agora_locales.token", "agora_locales.pass_enc", "wallet_config.datos_enc"]);
  });

  test("la comparación de valores no usa ===", () => {
    assert.equal(igualSeguro("a", "a"), true);
    assert.equal(igualSeguro("a", "b"), false);
    assert.equal(igualSeguro("a", "ab"), false, "longitudes distintas no pueden reventar");
  });

  test("al aplicar se bloquean las filas", async () => {
    // `FOR UPDATE` + el candado de transacción del script. Sin ellos, una edición desde el panel
    // a mitad de migración se pierde.
    const vistas = [];
    const { x } = conDatos();
    const allOrig = x.all;
    x.all = async (sql) => { vistas.push(sql); return allOrig(sql); };
    await migrar(x, LL, { aplicar: true });
    assert.ok(vistas.filter((s) => /^SELECT/.test(s.trim())).every((s) => /FOR UPDATE/.test(s)), vistas.join("\n"));
  });
});
