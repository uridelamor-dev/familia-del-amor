// LA VENTANA ENTRE SUBIR LA HUELLA Y ENCOLAR EL AVISO.
//
// ── EL FALLO QUE ESTO BLINDA ─────────────────────────────────────────────────────────────────
//
// Antes eran dos escrituras sueltas:
//
//     UPDATE wallet_pases SET etiqueta = etiqueta + 1, huella = <la nueva>
//     ← el proceso muere aquí
//     INSERT INTO wallet_avisos …
//
// Y eso deja el sistema CIEGO, no a medias: la huella guardada ya coincide con lo que se ve, así
// que el reconciliador pasa, compara, no encuentra diferencia y sigue de largo. El aviso no sale
// nunca. Parecía que había red y no la había.
//
// ── CÓMO SE PRUEBA SIN BASE DE DATOS ─────────────────────────────────────────────────────────
//
// Con una transacción de mentira que se comporta como PostgreSQL: las escrituras se anotan en un
// borrador y solo se vuelcan al almacén EN EL COMMIT. Si la función lanza, no se vuelca nada. Eso
// es exactamente lo que hay que demostrar, y se demuestra sobre el código real —`aplicarCambio`
// es el mismo que usa el servidor—.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aplicarCambio, claveDe } from "../src/modules/wallet/aviso.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/tarjeta/schema.js", import.meta.url), "utf8");
const sinComentarios = (t) => t.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");

const AHORA = "2026-10-01T09:00:00+02:00";

/**
 * UNA BASE DE MENTIRA CON TRANSACCIONES DE VERDAD.
 *
 * `pases` y `avisos` son el almacén confirmado. Una transacción trabaja sobre una COPIA y solo la
 * vuelca si termina bien — igual que un COMMIT. Si la función lanza, la copia se tira, que es lo
 * que hace un ROLLBACK.
 *
 * `fallarEn` permite reventar en la n-ésima escritura: es cómo se simula que el proceso muere
 * exactamente entre el UPDATE del pase y el INSERT del aviso.
 */
function baseFalsa({ pases = {}, avisos = [], registros = {} } = {}) {
  const almacen = { pases: structuredClone(pases), avisos: structuredClone(avisos),
                    registros: structuredClone(registros) };

  const transaccion = async (fn, { fallarEn = 0 } = {}) => {
    // La COPIA: lo que se toque aquí no existe hasta el COMMIT.
    const borrador = structuredClone(almacen);
    let escrituras = 0;
    const x = {
      get: async (sql, p) => {
        if (/FROM wallet_pases/.test(sql)) return borrador.pases[p[0]] || null;
        if (/FROM wallet_registros/.test(sql)) return borrador.registros[p[0]] ? { hay: 1 } : null;
        return null;
      },
      all: async () => [],
      run: async (sql, p) => {
        escrituras += 1;
        if (fallarEn && escrituras === fallarEn) throw new Error("el proceso ha muerto");
        if (/UPDATE wallet_pases/.test(sql)) {
          const f = borrador.pases[p[4]];
          if (f) { f.etiqueta = p[0]; f.huella = p[1]; f.actualizado_en = p[2]; f.motivo = p[3]; }
          return undefined;
        }
        if (/INSERT INTO wallet_avisos/.test(sql)) {
          // El ÍNDICE ÚNICO PARCIAL: como mucho un `pendiente` por pase. Si ya hay uno, se
          // actualiza —que es lo que hace `ON CONFLICT … DO UPDATE`— en vez de crear otro.
          const [qrId, etiqueta, clave, motivo] = p;
          const ya = borrador.avisos.find((a) => a.qr_id === qrId && a.estado === "pendiente");
          if (ya) { ya.etiqueta = etiqueta; ya.clave_idem = clave; ya.motivo = motivo; }
          else borrador.avisos.push({ id: borrador.avisos.length + 1, qr_id: qrId, etiqueta,
            clave_idem: clave, motivo, estado: "pendiente" });
          return undefined;
        }
        return undefined;
      },
    };
    try {
      const r = await fn(x);
      // COMMIT: ahora sí.
      almacen.pases = borrador.pases;
      almacen.avisos = borrador.avisos;
      return r;
    } catch (e) {
      // ROLLBACK: el borrador se tira entero.
      throw e;
    }
  };

  return {
    almacen, transaccion,
    pendientes: (qrId) => almacen.avisos.filter((a) => a.qr_id === qrId && a.estado === "pendiente"),
    // Lo que hace el worker al cerrar un aviso: cambia el estado y NO borra la fila.
    cerrar: (id, estado) => { almacen.avisos.find((a) => a.id === id).estado = estado; },
  };
}

const conUnPase = () => baseFalsa({
  pases: { 7: { qr_id: 7, etiqueta: 1, huella: "s=10;n=0" } },
  registros: { 7: true },
});

// ── A · PRIMER CAMBIO ────────────────────────────────────────────────────────────────────────

describe("A · primer cambio → un aviso → envío correcto", () => {
  test("sube la etiqueta y deja UN aviso pendiente", async () => {
    const b = conUnPase();
    const r = await b.transaccion((x) =>
      aplicarCambio(x, { qrId: 7, huella: "s=20;n=0", motivo: "factura", ahora: AHORA }));
    assert.equal(r.ok, true);
    assert.equal(r.cambio, true);
    assert.equal(r.encolado, true);
    assert.equal(r.etiqueta, 2);
    assert.equal(b.almacen.pases[7].huella, "s=20;n=0");
    assert.equal(b.pendientes(7).length, 1);
    assert.equal(b.pendientes(7)[0].clave_idem, claveDe(7, 2));
  });

  test("y sin cambio visible no hace nada de nada", async () => {
    const b = conUnPase();
    const r = await b.transaccion((x) =>
      aplicarCambio(x, { qrId: 7, huella: "s=10;n=0", ahora: AHORA }));
    assert.equal(r.cambio, false);
    assert.equal(b.almacen.pases[7].etiqueta, 1, "subió la etiqueta sin motivo");
    assert.equal(b.pendientes(7).length, 0);
  });
});

// ── B · UN CAMBIO DESPUÉS DE ENVIAR ──────────────────────────────────────────────────────────

describe("B · segundo cambio, ya enviado el primero → aviso NUEVO", () => {
  test("una fila terminal NO impide el siguiente aviso", async () => {
    // Es el fallo que tenía la clave de texto: al quedarse la fila, `ON CONFLICT DO NOTHING`
    // habría bloqueado en silencio TODOS los avisos futuros de ese pase.
    const b = conUnPase();
    await b.transaccion((x) => aplicarCambio(x, { qrId: 7, huella: "s=20;n=0", ahora: AHORA }));
    assert.equal(b.pendientes(7).length, 1);

    // El worker lo manda. La fila se queda como historia.
    b.cerrar(b.pendientes(7)[0].id, "enviado");
    assert.equal(b.pendientes(7).length, 0);
    assert.equal(b.almacen.avisos.length, 1, "no se ha borrado el historial");

    // Cambio posterior: aviso NUEVO.
    const r = await b.transaccion((x) =>
      aplicarCambio(x, { qrId: 7, huella: "s=30;n=1", ahora: AHORA }));
    assert.equal(r.encolado, true);
    assert.equal(b.pendientes(7).length, 1);
    assert.equal(b.almacen.avisos.length, 2, "tiene que ser una fila nueva, no la vieja");
    assert.equal(b.pendientes(7)[0].etiqueta, 3);
  });

  test("y lo mismo con un aviso FALLIDO o BLOQUEADO detrás", async () => {
    for (const terminal of ["fallido", "bloqueado", "descartado"]) {
      const b = conUnPase();
      await b.transaccion((x) => aplicarCambio(x, { qrId: 7, huella: "s=20", ahora: AHORA }));
      b.cerrar(b.pendientes(7)[0].id, terminal);
      const r = await b.transaccion((x) => aplicarCambio(x, { qrId: 7, huella: "s=30", ahora: AHORA }));
      assert.equal(r.encolado, true, `un aviso «${terminal}» bloquea los siguientes`);
      assert.equal(b.pendientes(7).length, 1);
    }
  });
});

// ── C · DOS CAMBIOS MIENTRAS SIGUE PENDIENTE ─────────────────────────────────────────────────

describe("C · dos cambios con uno pendiente → sigue habiendo UNO, y con la versión más reciente", () => {
  test("el segundo cambio REUTILIZA el pendiente y le sube la etiqueta", async () => {
    const b = conUnPase();
    await b.transaccion((x) => aplicarCambio(x, { qrId: 7, huella: "s=20", motivo: "factura", ahora: AHORA }));
    await b.transaccion((x) => aplicarCambio(x, { qrId: 7, huella: "s=30", motivo: "derecho", ahora: AHORA }));
    const r = await b.transaccion((x) => aplicarCambio(x, { qrId: 7, huella: "s=40", motivo: "puntos", ahora: AHORA }));

    assert.equal(r.encolado, true);
    assert.equal(b.pendientes(7).length, 1, "se han creado varios avisos pendientes");
    assert.equal(b.almacen.avisos.length, 1);

    // Y apunta a la ÚLTIMA versión: la etiqueta del aviso sigue a la del pase.
    assert.equal(b.almacen.pases[7].etiqueta, 4);
    assert.equal(b.pendientes(7)[0].etiqueta, 4);
    assert.equal(b.pendientes(7)[0].clave_idem, claveDe(7, 4));
    assert.equal(b.pendientes(7)[0].motivo, "puntos", "el aviso no refleja el último cambio");

    // La huella guardada es la última: el pase que se sirva llevará ese estado.
    assert.equal(b.almacen.pases[7].huella, "s=40");
  });
});

// ── D · FALLO ENTRE LAS DOS ESCRITURAS ───────────────────────────────────────────────────────

describe("D · si muere ENTRE el UPDATE del pase y el INSERT del aviso, se deshacen LAS DOS", () => {
  test("ni huella nueva, ni etiqueta nueva, ni aviso", async () => {
    const b = conUnPase();
    const antes = structuredClone(b.almacen);

    // `fallarEn: 2` revienta en la SEGUNDA escritura, que es el INSERT del aviso: justo la
    // ventana que dejaba el sistema ciego.
    await assert.rejects(
      () => b.transaccion((x) => aplicarCambio(x, { qrId: 7, huella: "s=99", ahora: AHORA }),
        { fallarEn: 2 }),
      /el proceso ha muerto/);

    assert.deepEqual(b.almacen.pases, antes.pases, "la huella o la etiqueta han quedado cambiadas");
    assert.deepEqual(b.almacen.avisos, antes.avisos, "ha quedado un aviso a medias");
    assert.equal(b.almacen.pases[7].huella, "s=10;n=0", "LA HUELLA VIEJA TIENE QUE SEGUIR AHÍ");
    assert.equal(b.almacen.pases[7].etiqueta, 1);
  });

  test("y si revienta en la PRIMERA, igual", async () => {
    const b = conUnPase();
    const antes = structuredClone(b.almacen);
    await assert.rejects(
      () => b.transaccion((x) => aplicarCambio(x, { qrId: 7, huella: "s=99", ahora: AHORA }),
        { fallarEn: 1 }));
    assert.deepEqual(b.almacen, { ...antes, registros: b.almacen.registros });
  });
});

// ── E · EL RECONCILIADOR LO RECUPERA ─────────────────────────────────────────────────────────

describe("E · muerto ANTES del COMMIT → el reconciliador lo vuelve a ver", () => {
  test("la huella vieja sigue ahí, así que la diferencia SIGUE SIENDO VISIBLE", async () => {
    const b = conUnPase();

    // 1 · El COMMIT de la factura fue bien: el estado visible ahora es «s=99».
    const visible = "s=99";

    // 2 · El proceso muere dentro de `marcarPaseActualizado`.
    await assert.rejects(
      () => b.transaccion((x) => aplicarCambio(x, { qrId: 7, huella: visible, ahora: AHORA }),
        { fallarEn: 2 }));
    assert.equal(b.pendientes(7).length, 0, "no se encoló nada, como es de esperar");

    // 3 · EL PUNTO DEL TEST: la huella guardada NO coincide con lo visible. Con el orden viejo
    //     —dos escrituras sueltas— aquí ya coincidiría y el reconciliador no vería nada.
    assert.notEqual(b.almacen.pases[7].huella, visible,
      "la huella se actualizó sin aviso: el reconciliador quedaría ciego");

    // 4 · El reconciliador pasa y lo detecta.
    const r = await b.transaccion((x) =>
      aplicarCambio(x, { qrId: 7, huella: visible, motivo: "reconciliacion", ahora: AHORA }));
    assert.equal(r.cambio, true);
    assert.equal(r.encolado, true);
    assert.equal(b.pendientes(7).length, 1);

    // 5 · Segunda pasada: no duplica.
    const r2 = await b.transaccion((x) =>
      aplicarCambio(x, { qrId: 7, huella: visible, motivo: "reconciliacion", ahora: AHORA }));
    assert.equal(r2.cambio, false);
    assert.equal(b.pendientes(7).length, 1);
    assert.equal(b.almacen.avisos.length, 1);
  });
});

// ── F · MUERTO DESPUÉS DEL COMMIT ────────────────────────────────────────────────────────────

describe("F · muerto DESPUÉS del COMMIT → el aviso ya existe", () => {
  test("quedan las dos cosas, y una segunda pasada no hace nada", async () => {
    const b = conUnPase();
    await b.transaccion((x) => aplicarCambio(x, { qrId: 7, huella: "s=99", ahora: AHORA }));

    // El proceso muere justo aquí, ya con el COMMIT hecho.
    assert.equal(b.almacen.pases[7].huella, "s=99");
    assert.equal(b.pendientes(7).length, 1, "el aviso tiene que estar");

    // El reconciliador pasa: no hay nada que hacer.
    const r = await b.transaccion((x) =>
      aplicarCambio(x, { qrId: 7, huella: "s=99", motivo: "reconciliacion", ahora: AHORA }));
    assert.equal(r.cambio, false);
    assert.equal(r.encolado, false);
    assert.equal(b.almacen.avisos.length, 1);
  });
});

// ── G · EL BLOQUEADO SE PUEDE REINTENTAR ─────────────────────────────────────────────────────

describe("G · un aviso bloqueado por configuración se puede reintentar", () => {
  test("ninguna clave se lo impide: el estado es lo único que lo cubre", async () => {
    const b = conUnPase();
    await b.transaccion((x) => aplicarCambio(x, { qrId: 7, huella: "s=20", ahora: AHORA }));
    const id = b.pendientes(7)[0].id;

    // APNs contesta 403 o `DeviceTokenNotForTopic`: el aviso queda bloqueado, la fila se queda.
    b.cerrar(id, "bloqueado");
    assert.equal(b.pendientes(7).length, 0);

    // Dirección arregla la configuración y pulsa «Reintentar bloqueados»: vuelve a pendiente.
    b.cerrar(id, "pendiente");
    assert.equal(b.pendientes(7).length, 1, "la clave impide reponerlo");
    assert.equal(b.almacen.avisos.length, 1, "se ha duplicado en vez de reponerse");
  });

  test("y el servidor NUNCA repone dos pendientes para el mismo pase", () => {
    // El índice único parcial lo impediría con un error, y un botón que revienta no es un botón.
    const s = sinComentarios(server);
    const i = s.indexOf('app.post("/api/wallet/dinamico/reintentar"');
    const ruta = s.slice(i, s.indexOf("\n});", i));
    assert.match(ruta, /SELECT DISTINCT ON \(a\.qr_id\) a\.id FROM wallet_avisos a/);
    assert.match(ruta, /NOT EXISTS \(SELECT 1 FROM wallet_avisos p\s*\n?\s*WHERE p\.qr_id = a\.qr_id AND p\.estado = 'pendiente'\)/);
    assert.match(ruta, /ORDER BY a\.qr_id, a\.etiqueta DESC, a\.id DESC/);
  });
});

// ── EL CABLEADO ──────────────────────────────────────────────────────────────────────────────

describe("cableado", () => {
  const s = sinComentarios(server);

  test("`marcarPaseActualizado` hace las dos escrituras EN UNA TRANSACCIÓN", () => {
    const i = s.indexOf("async function marcarPaseActualizado(");
    const fn = s.slice(i, s.indexOf("\n}\n", i));
    assert.match(fn, /return await walTransaccion\(\(x\) =>\s*\n?\s*walAplicarCambio\(x, \{/);
    // Y NO quedan escrituras sueltas de wallet fuera de la transacción.
    assert.ok(!/dbRun\(`UPDATE wallet_pases/.test(fn), "queda un UPDATE suelto");
    assert.ok(!/dbRun\(\s*`INSERT INTO wallet_avisos/.test(fn), "queda un INSERT suelto");
  });

  test("y el reconciliador usa EL MISMO mecanismo, porque llama a la misma función", () => {
    const i = s.indexOf("async function walReconciliar()");
    const fn = s.slice(i, s.indexOf("\n}", i));
    assert.match(fn, /await marcarPaseActualizado\(f\.qr_id, "reconciliacion"\)/);
    assert.ok(!/walTransaccion|dbRun/.test(fn), "el reconciliador escribe por su cuenta");
  });

  test("`walTransaccion` sale del MISMO sitio que la de fidelización", () => {
    assert.match(s, /const walTransaccion = fidCrearTransaccion\(\{ pool, toPositional \}\);/);
  });

  test("el candado es un ÍNDICE ÚNICO PARCIAL, no una clave de texto", () => {
    const e = sinComentarios(esquema);
    assert.match(e, /CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_aviso_pendiente\s*\n?\s*ON wallet_avisos \(qr_id\) WHERE estado = 'pendiente'/);
    // `clave_idem` ya NO es única: una fila terminal no puede bloquear las siguientes.
    assert.match(e, /clave_idem TEXT NOT NULL,/);
    assert.ok(!/clave_idem TEXT NOT NULL UNIQUE/.test(e), "`clave_idem` sigue siendo única");
  });

  test("NINGÚN cierre reescribe la clave para liberar el hueco", () => {
    // Era el mecanismo frágil: si un solo camino se olvidaba, ese pase no volvía a recibir un
    // aviso nunca más, en silencio.
    assert.ok(!/clave_idem = 'wal:'/.test(s), "un cierre sigue reescribiendo la clave");
  });

  test("NADA SE BORRA: no hay DELETE sobre avisos ni pases", () => {
    assert.ok(!/DELETE FROM wallet_avisos|DELETE FROM wallet_pases/.test(s));
  });

  test("`aplicarCambio` no escribe en ninguna tabla que no sea de wallet", () => {
    const m = readFileSync(new URL("../src/modules/wallet/aviso.js", import.meta.url), "utf8");
    // `DO UPDATE SET` del upsert cazaba «SET» como si fuera una tabla: se excluye.
    const tablas = [...m.matchAll(/(INSERT INTO|UPDATE|DELETE FROM) (\w+)/g)]
      .map((x) => x[2]).filter((t) => t !== "SET");
    assert.deepEqual([...new Set(tablas)].sort(), ["wallet_avisos", "wallet_pases"]);
  });

  test("dos cambios a la vez del mismo pase no se pisan", () => {
    const m = readFileSync(new URL("../src/modules/wallet/aviso.js", import.meta.url), "utf8");
    assert.match(m, /FROM wallet_pases WHERE qr_id = \? FOR UPDATE/,
      "sin `FOR UPDATE`, dos facturas simultáneas leen la misma etiqueta y una subida se pierde");
  });
});
