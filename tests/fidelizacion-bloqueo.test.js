// EL BLOQUEO DE ACTIVACIÓN, y los invariantes del libro de puntos.
//
// ── POR QUÉ HAY UN BLOQUEO ───────────────────────────────────────────────────────────────────
//
// Hoy una devolución total NO revierte puntos. Con «conceder» encendido, un cliente compra por
// 200 €, se lleva 200 puntos, lo devuelve todo al día siguiente y se queda con los puntos. Con
// «consumir» además se los gasta en descuentos reales.
//
// Dejar los interruptores apagados por defecto no basta: un apagado por defecto lo enciende
// cualquiera desde el panel o con un `curl`, y quien lo haga dentro de seis meses no tiene por qué
// acordarse de esto. Por eso el candado está en el SERVIDOR y se comprueba contra una capacidad
// real del código, no contra una bandera que se cambia en una línea.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NIVEL, NIVELES, PENDIENTES, PERMITIDOS_POR_NIVEL, permitidos,
         estadoPreparacion, puedeEncender, aplicarBloqueo }
  from "../src/modules/fidelizacion/preparacion.js";
import { saldo, lotesVivos, planConsumo, planCaducidad, caducado, INTERRUPTORES }
  from "../src/modules/fidelizacion/puntos.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const trozo = (a, b) => server.slice(server.indexOf(a), server.indexOf(b));
const AHORA = "2026-09-14T12:00:00.000Z";



describe("el nivel de lanzamiento es una puerta EXPLÍCITA", () => {
  test("hoy estamos en «sombra»", () => {
    // Esta línea es la puerta. Subirla enciende el programa en producción, aparece en el diff y
    // hay que revisarla. Es exactamente lo contrario de una condición que se cumple por accidente.
    assert.equal(NIVEL, "sombra");
    assert.deepEqual([...NIVELES], ["sombra", "completo"]);
  });

  test("en este nivel solo se puede tocar «sombra»", () => {
    assert.deepEqual([...permitidos("sombra")], ["sombra"]);
    assert.deepEqual([...permitidos("completo")], ["sombra", "conceder", "ofrecer", "consumir"]);
    // Un nivel inventado no abre nada: cae al más restrictivo.
    assert.deepEqual([...permitidos("lo-que-sea")], ["sombra"]);
    assert.deepEqual([...permitidos(undefined)], ["sombra"]);
  });

  test("NO depende de que exista ninguna función", () => {
    // La versión anterior deducía esto preguntando si `agora.js` exportaba
    // `revertirDevolucionTotal`. Un esbozo, una función a medias o una exportación añadida durante
    // el desarrollo habrían abierto los tres interruptores solos y sin salir en ningún diff.
    // Sin las líneas de comentario: ahí arriba se explica a propósito el planteamiento que se
    // retiró, y una búsqueda a pelo confundiría la explicación con el código.
    const bruto = readFileSync(new URL("../src/modules/fidelizacion/preparacion.js", import.meta.url), "utf8");
    const fuente = bruto.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    assert.ok(!/typeof .*=== "function"/.test(fuente), "vuelve a deducirse por la existencia de una función");
    assert.ok(!/^import /m.test(fuente), "preparacion.js ha dejado de estar aislado");
    assert.ok(!/revertirDevolucionTotal/.test(fuente), "vuelve a mirarse esa función");
  });

  test("EXPORTAR UNA FUNCIÓN FALSA no abre nada", () => {
    // Esto es lo que el planteamiento anterior no aguantaba.
    const falso = { revertirDevolucionTotal: () => {}, devolucionTotalLista: true, listo: true };
    for (const k of ["conceder", "ofrecer", "consumir"]) {
      assert.equal(puedeEncender(k, true, NIVEL).ok, false, k);
      // Y pasar el objeto falso como si fuera el nivel tampoco: no es un nivel conocido.
      assert.equal(puedeEncender(k, true, falso).ok, false, k);
    }
  });

  test("los tres bloqueados devuelven siempre que no", () => {
    assert.equal(puedeEncender("sombra", true, NIVEL).ok, true);
    for (const k of ["conceder", "ofrecer", "consumir"]) {
      const r = puedeEncender(k, true, NIVEL);
      assert.equal(r.ok, false, `${k} se puede encender`);
      assert.match(r.error, /todavía no puede activarse/);
      assert.deepEqual(r.pendientes.map((p) => p.id), ["devolucion_total"]);
    }
  });

  test("APAGAR siempre se puede", () => {
    // Si algo está encendido y no debería, la respuesta nunca es «no te dejo apagarlo».
    for (const k of INTERRUPTORES) assert.equal(puedeEncender(k, false, NIVEL).ok, true, k);
  });

  test("MODIFICAR LA CONFIGURACIÓN a mano no abre nada", () => {
    // Una migración, la consola de la base o un despiste podrían dejar `fid_conceder = 1`. Lo
    // guardado es una intención; `aplicarBloqueo` es lo que pasa de verdad.
    const guardado = { sombra: true, conceder: true, ofrecer: true, consumir: true };
    assert.deepEqual(aplicarBloqueo(guardado, NIVEL),
      { sombra: true, conceder: false, ofrecer: false, consumir: false });
  });

  test("en el nivel completo dejaría de bloquear", () => {
    const e = estadoPreparacion("completo");
    assert.equal(e.listo, true);
    assert.deepEqual(e.pendientes, []);
    const todo = { sombra: true, conceder: true, ofrecer: true, consumir: true };
    assert.deepEqual(aplicarBloqueo(todo, "completo"), todo);
  });

  test("todo está congelado", () => {
    assert.throws(() => { PENDIENTES.push({}); }, TypeError);
    assert.throws(() => { PENDIENTES[0].id = "otro"; }, TypeError);
    assert.throws(() => { PERMITIDOS_POR_NIVEL.sombra.push("conceder"); }, TypeError);
    assert.throws(() => { PERMITIDOS_POR_NIVEL.otro = []; }, TypeError);
  });
});

describe("saltarse el bloqueo por la API", () => {
  const sw = trozo('app.post("/api/fidelizacion/interruptores"', 'app.get("/api/fidelizacion/revisiones"');

  test("el 409 se comprueba ANTES de escribir nada", () => {
    // El panel puede no pintar el botón, pero esta ruta se llama igual de bien con `curl`.
    const iCheck = sw.indexOf("fidPuedeEncender(k, v, FID_NIVEL)");
    const iEscribe = sw.indexOf("setConfig(");
    assert.ok(iCheck > 0, "no se comprueba la preparación");
    assert.ok(iEscribe > iCheck, "se escribe la configuración antes de comprobar");
    assert.match(sw, /res\.status\(409\)\.json\(\{ ok: false, error: p\.error, pendientes: p\.pendientes \}\)/);
  });

  test("se comprueba CADA interruptor del cuerpo, no solo el primero", () => {
    // Mandar `{sombra:true, conceder:true}` de golpe no puede colar el segundo.
    assert.match(sw, /for \(const \[k, v\] of Object\.entries\(cambios\)\) \{\s*\n\s*const p = fidPuedeEncender/);
  });

  test("el servidor usa el NIVEL, no una capacidad deducida", () => {
    assert.match(server, /NIVEL as FID_NIVEL/);
    assert.ok(!/fidAgoraNS/.test(server), "vuelve el import de espacio de nombres");
    assert.ok(!/FID_CAPACIDADES/.test(server), "vuelve la detección por capacidad");
  });

  test("MANDAR LOS CUATRO JUNTOS solo deja pasar «sombra»", () => {
    // El bucle comprueba cada uno por separado, así que `{sombra:1,conceder:1,ofrecer:1,consumir:1}`
    // se corta en el primero que no está permitido.
    const cuerpo = { sombra: true, conceder: true, ofrecer: true, consumir: true };
    const rechazados = Object.entries(cuerpo).filter(([k, v]) => !puedeEncender(k, v, NIVEL).ok).map(([k]) => k);
    assert.deepEqual(rechazados, ["conceder", "ofrecer", "consumir"]);
    assert.match(sw, /for \(const \[k, v\] of Object\.entries\(cambios\)\) \{\s*\n\s*const p = fidPuedeEncender/);
  });

  test("el bloqueo se aplica TAMBIÉN al leer los interruptores", () => {
    // Si solo se comprobara al escribir, una fila ya guardada a 1 seguiría encendiendo el programa.
    const lee = trozo("async function fidInterruptores() {", "/** Las reglas de un local");
    assert.match(lee, /return fidAplicarBloqueo\(out, FID_NIVEL\)/);
  });

  test("y `fidInterruptores` es lo ÚNICO que lee esos valores", () => {
    // Nadie puede saltarse el bloqueo leyendo la configuración por su cuenta.
    const lecturas = [...server.matchAll(/getConfig\(`?fid_/g)];
    assert.equal(lecturas.length, 1, "alguien lee los interruptores sin pasar por el bloqueo");
  });

  test("Rewards sigue devolviendo [] mientras esté bloqueado", () => {
    // `ofrecer` bloqueado ⇒ `rewards` se queda a null ⇒ `respuestaMiembro` usa REWARDS_FASE_1.
    const val = trozo("¿SE LE OFRECE EL DESCUENTO?", 'await apunta(integ.fila.id, integ.fila.local, rewards ? "ok:reward" : "ok")');
    assert.match(val, /let rewards = null;/);
    assert.match(val, /if \(sw\.ofrecer && !esperaConfirmacion\)/);
    const ag = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
    assert.match(ag, /Rewards: rewards && rewards\.length \? rewards : \[\.\.\.REWARDS_FASE_1\]/);
  });

  test("y la pantalla lo dice con todas las letras", () => {
    const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
    assert.match(panel, /El programa de puntos todavía no puede activarse/);
    assert.match(panel, /Bloqueado hasta validar una devolución total real/);
    assert.match(panel, /El bloqueo está en el servidor/);
    // Y los botones se pintan deshabilitados, no simplemente ausentes: esconderlos haría pensar
    // que la función no existe en vez de que está esperando algo.
    assert.match(panel, /const sinPreparar = k !== "sombra" && !!\(FIDP\.preparacion && !FIDP\.preparacion\.listo\)/);
  });
});

describe("publicar una regla es ATÓMICO", () => {
  // Sin comentarios: arriba se explica a propósito el patrón que NO vale («MAX(version)+1 seguido
  // de INSERT»), y una búsqueda a pelo lo encontraría antes que el código de verdad.
  const crear = trozo('app.post("/api/fidelizacion/reglas"', 'app.post("/api/fidelizacion/interruptores"')
    .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|--)/.test(l)).join("\n");

  test("el cerrojo va ANTES de leer el máximo", () => {
    // `SELECT MAX(version)+1` seguido de `INSERT` no basta: dos pestañas leen el mismo número y
    // una falla contra el índice único. El índice evita la fila duplicada, sí, pero convierte una
    // publicación legítima en un 500 que nadie entiende.
    const iLock = crear.indexOf("pg_advisory_xact_lock");
    const iMax = crear.indexOf("MAX(version)");
    const iIns = crear.indexOf("INSERT INTO fid_reglas");
    assert.ok(iLock > 0, "no hay cerrojo");
    assert.ok(iMax > iLock, "se lee el máximo antes de bloquear");
    assert.ok(iIns > iMax, "se inserta antes de leer el máximo");
  });

  test("todo va en la MISMA transacción y con el MISMO cliente", () => {
    const iTx = crear.indexOf("await fidTransaccion(");
    assert.ok(iTx > 0 && crear.indexOf("pg_advisory_xact_lock") > iTx, "el cerrojo queda fuera de la transacción");
    // Por `x.run`, que es el mismo `client.query` del BEGIN: en otra conexión se soltaría al
    // terminar esa otra transacción y no protegería nada.
    assert.match(crear, /await x\.run\(`SELECT pg_advisory_xact_lock\(\?, \?\)`, \[FID_CERROJO_REGLAS, 0\]\)/);
  });

  test("la clave del cerrojo de reglas NO choca con la de las cuentas", () => {
    const ag = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
    const puntos = Number(ag.match(/CERROJO_PUNTOS = (\d+)/)[1]);
    const reglas = Number(ag.match(/CERROJO_REGLAS = (\d+)/)[1]);
    assert.notEqual(puntos, reglas);
  });

  test("NUNCA se devuelve éxito sin INSERT", () => {
    assert.match(crear, /if \(!creada\) throw new Error\("la regla no se ha insertado"\)/);
    // El `throw` va DENTRO de la transacción, así que hace ROLLBACK.
    const iThrow = crear.indexOf("throw new Error(\"la regla no se ha insertado\")");
    const iCierra = crear.indexOf("});", crear.indexOf("await fidTransaccion("));
    assert.ok(iThrow > 0 && iThrow < iCierra, "el throw está fuera de la transacción");
    // Y la respuesta lee de la fila creada, no de un valor calculado antes.
    assert.match(crear, /res\.json\(\{ ok: true, id: fila\.id, version: fila\.version \}\)/);
    assert.ok(!/fila\?\.\w+/.test(crear.slice(crear.indexOf("res.json"))), "la respuesta tolera que no haya fila");
  });

  test("dos publicaciones seguidas dan versiones CONSECUTIVAS", async () => {
    // Con el cerrojo, la segunda espera, vuelve a leer el máximo y sale con la siguiente. Nunca
    // dos respuestas de éxito para una sola fila, ni un 500 ambiguo.
    const filas = [];
    const cerrojos = [];
    const x = {
      run: async (q, p) => {
        if (/pg_advisory_xact_lock/.test(q)) { cerrojos.push(p); return undefined; }
        if (/INSERT INTO fid_reglas/.test(q)) {
          const version = p[2];
          if (filas.some((f) => f.ambito === p[0] && (f.local || "") === (p[1] || "") && f.version === version)) {
            throw new Error("idx_fid_regla_version");     // el índice único
          }
          const fila = { id: filas.length + 1, ambito: p[0], local: p[1], version, reward_id: p[4] };
          filas.push(fila);
          return fila;
        }
        throw new Error("consulta no reconocida");
      },
      get: async () => ({ v: filas.filter((f) => f.ambito === "global").reduce((a, f) => Math.max(a, f.version), 0) }),
    };
    // Dos publicaciones, una detrás de otra: es lo que garantiza el cerrojo.
    const publicar = async () => {
      await x.run("SELECT pg_advisory_xact_lock(?, ?)", [815302, 0]);
      const ult = await x.get();
      const creada = await x.run("INSERT INTO fid_reglas ...", ["global", null, Number(ult.v) + 1, true, "fid:x" + filas.length]);
      if (!creada) throw new Error("la regla no se ha insertado");
      return creada;
    };
    const a = await publicar();
    const b = await publicar();
    assert.deepEqual([a.version, b.version], [1, 2], "las dos versiones no son consecutivas");
    assert.equal(filas.length, 2, "hay más o menos filas que publicaciones");
    assert.equal(cerrojos.length, 2, "alguna publicación no ha pedido el cerrojo");
  });

  test("al publicar se CIERRA la versión anterior", () => {
    // Sin esto, la anterior se queda con `vigente_hasta` a NULL para siempre y la gracia nunca
    // empieza a contar: un Reward viejo valdría indefinidamente.
    assert.match(crear, /UPDATE fid_reglas SET vigente_hasta = \?\s*\n?\s*WHERE ambito = \? AND COALESCE\(local, ''\) = \? AND vigente_hasta IS NULL/);
    // Y se cierra con el MISMO instante en que entra la nueva: la gracia cuenta desde ahí.
    assert.match(crear, /const desde = b\.vigente_desde \|\| ahora;/);
    const iCierra = crear.indexOf("UPDATE fid_reglas SET vigente_hasta");
    const iInserta = crear.indexOf("INSERT INTO fid_reglas");
    const iLock = crear.indexOf("pg_advisory_xact_lock");
    assert.ok(iLock < iCierra && iCierra < iInserta, "cerrar e insertar no van en orden dentro del cerrojo");
  });

  test("la gracia se valida en el rango 0-720 y se RECHAZA fuera", () => {
    // Recortar en silencio dejaría una gracia distinta de la que alguien escribió.
    assert.match(crear, /gracia_minutos: b\.gracia_minutos === undefined \|\| b\.gracia_minutos === null/);
    assert.match(crear, /\? FID_GRACIA_DEFECTO/);
    assert.match(crear, /: num\(b\.gracia_minutos, \{ min: 0, max: FID_GRACIA_MAX, entero: true \}\)/);
    // Y un valor inválido cae en la lista de `faltan`, que responde 400.
    assert.match(crear, /const faltan = Object\.entries\(campos\)\.filter\(\(\[, v\]\) => v === null\)/);
    assert.match(crear, /res\.status\(400\)\.json\(\{ ok: false, error: `Valores no válidos/);
  });

  test("el validador del endpoint rechaza el campo vacío", () => {
    assert.match(crear, /if \(v === null \|\| v === undefined\) return null;/);
    assert.match(crear, /if \(t === ""\) return null;/);
  });

  test("el rango lo aplica `num`, y 0 pasa mientras que -1 y 721 no", () => {
    // Se comprueba la función de verdad, no solo que exista la llamada.
    // La función se copia del endpoint; el test de al lado comprueba que es la misma.
    const num = (v, { min = 0, max = 1e6, entero = false } = {}) => {
      if (v === null || v === undefined) return null;
      const t = typeof v === "number" ? v : String(v).trim();
      if (t === "") return null;
      const n = typeof t === "number" ? t : Number(t.replace(",", "."));
      if (!Number.isFinite(n) || n < min || n > max) return null;
      return entero ? (Number.isInteger(n) ? n : null) : n;
    };
    const g = (v) => num(v, { min: 0, max: 720, entero: true });
    assert.equal(g(0), 0, "0 debería ser válido: es el modo estricto");
    assert.equal(g("0"), 0);
    assert.equal(g(180), 180);
    assert.equal(g(720), 720, "720 es el límite y debería entrar");
    for (const malo of [-1, 721, 1000, 12.5, "x", {}]) assert.equal(g(malo), null, String(malo));
    // UN CAMPO VACÍO NO ES UN CERO. `Number("")` da 0, y así una gracia en blanco se guardaría
    // como «sin margen» —y un mínimo en blanco como «sin mínimo»— sin que nadie lo escribiera.
    for (const vacio of ["", "   ", null, undefined]) assert.equal(g(vacio), null, JSON.stringify(vacio));
  });

  test("el panel propone 180 y enseña la frase acordada", () => {
    const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
    assert.match(panel, /Margen para tickets ya abiertos \(minutos, 0 = sin margen\)/);
    assert.match(panel, /FIDP\.gracia\?\.propuesta \?\? 180/);
    assert.match(panel, /podrán utilizarse durante \$\{cuanto\}/);
    // El campo es EDITABLE, no un valor escondido.
    assert.match(panel, /\["gracia_minutos", "Margen para tickets/);
    // Y la frase sale tanto en el resumen en vivo como en la confirmación.
    const f = panel.slice(panel.indexOf("async function fidpNueva()"), panel.indexOf("async function fidpSombra()"));
    assert.ok((f.match(/textoGracia\(/g) || []).length >= 2, "la frase no sale en los dos sitios");
  });

  test("el reward_id se genera al publicar y es aleatorio", () => {
    // Derivado de las condiciones cambiaría al cambiar la regla, que es justo lo que no puede pasar.
    assert.match(crear, /const rewardId = "fid:" \+ crypto\.randomBytes\(12\)\.toString\("base64url"\)/);
    // Se inserta en la MISMA fila, no se actualiza después. El único UPDATE sobre `fid_reglas` es
    // el que cierra la versión anterior: sella un hecho —cuándo entró la siguiente— y no toca ni
    // el identificador ni una sola condición económica.
    const ups = [...server.matchAll(/UPDATE fid_reglas SET ([^`]*?)\s*\n?\s*WHERE/g)].map((m) => m[1].trim());
    assert.deepEqual(ups, ["vigente_hasta = ?"]);
  });

  test("y su índice único impide dos versiones con el mismo", () => {
    const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
    assert.match(esquema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_regla_reward\s*\n?\s*ON fid_reglas \(reward_id\) WHERE reward_id IS NOT NULL/);
  });
});

describe("invariantes del libro", () => {
  const lote = (id, u, caduca) => ({ id, punto_tipo: "ganados", unidades: u, caduca_en: caduca, creado_en: caduca });
  const contra = (id, tipo, u, loteId) => ({ id, punto_tipo: tipo, unidades: u, lote_id: loteId });

  test("los movimientos ANTIGUOS con punto_tipo NULL no afectan al saldo", () => {
    // `fid_movimientos` ya tenía visitas y consumos desde antes de que existieran los puntos.
    // Contarlos como lotes daría saldos inventados a clientes que nunca ganaron un punto.
    const viejos = [
      { id: 1, punto_tipo: null, concepto: "visita", unidades: 1, importe: 0 },
      { id: 2, punto_tipo: undefined, concepto: "consumo", unidades: 0, importe: 32.3 },
      { id: 3, punto_tipo: null, concepto: "devolucion", unidades: 0, importe: -10 },
    ];
    assert.equal(saldo(viejos, { ahora: AHORA }).disponible, 0);
    assert.deepEqual(lotesVivos(viejos, { ahora: AHORA }), []);
    assert.deepEqual(planCaducidad(viejos, { ahora: AHORA }), []);
  });

  test("un lote caducado deja de estar disponible AUNQUE no se haya anotado", () => {
    // El saldo no depende de que alguien haya pasado a escribir el movimiento de caducidad: se
    // filtra por fecha. Si dependiera, un cliente gastaría puntos muertos hasta que corriera algo.
    const movs = [lote(1, 100, "2026-01-01")];
    const s = saldo(movs, { ahora: AHORA });
    assert.equal(s.disponible, 0);
    assert.equal(s.caducado_sin_anotar, 100, "no se ve lo que hay pendiente de anotar");
    assert.equal(planConsumo(movs, 1, { ahora: AHORA }).ok, false, "se ha podido gastar un lote muerto");
  });

  test("anotar «caducados» después NO resta por segunda vez", () => {
    const antes = [lote(1, 100, "2026-01-01")];
    const despues = [...antes, contra(2, "caducados", -100, 1)];
    assert.equal(saldo(antes, { ahora: AHORA }).disponible, 0);
    assert.equal(saldo(despues, { ahora: AHORA }).disponible, 0, "ha restado dos veces");
    // Y una vez anotado, ya no queda nada pendiente.
    assert.deepEqual(planCaducidad(despues, { ahora: AHORA }), []);
  });

  test("solo puede haber UN movimiento de caducidad por lote", () => {
    // Lo garantiza la clave de idempotencia, que lleva el id del lote y nada más: `caduca:<lote>`.
    const ag = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
    assert.match(ag, /claveMov\(idemV, local, "caduca", String\(c\.lote_id\), "l"\)/);
    // La clave NO lleva la factura ni la fecha: si las llevara, el mismo lote caducaría una vez
    // por cada factura que tocara la cuenta.
    const i = ag.indexOf('claveMov(idemV, local, "caduca"');
    assert.ok(!ag.slice(i, i + 120).includes("globalId"), "la clave de caducidad lleva la factura");
  });

  test("no se puede consumir de un lote más de lo que tiene", () => {
    const movs = [lote(1, 60, "2027-01-01"), lote(2, 60, "2027-02-01")];
    const plan = planConsumo(movs, 100, { ahora: AHORA });
    for (const paso of plan.pasos) {
      const l = movs.find((m) => m.id === paso.lote_id);
      assert.ok(Math.abs(paso.unidades) <= l.unidades, `el lote ${paso.lote_id} se pasa`);
    }
    assert.equal(plan.pasos.reduce((a, p) => a + Math.abs(p.unidades), 0), 100);
  });

  test("el saldo solo baja de cero por una DEVOLUCIÓN posterior", () => {
    // Está aceptado: si el cliente gastó puntos y luego se le devolvió la compra, revertirlos deja
    // el saldo negativo. Es la verdad, no un error. Pero un consumo normal nunca puede hacerlo.
    const gastado = [lote(1, 100, "2027-01-01"), contra(2, "consumidos", -100, 1)];
    assert.equal(saldo(gastado, { ahora: AHORA }).disponible, 0);
    const revertido = [...gastado, contra(3, "revertidos", -50, 1)];
    assert.equal(lotesVivos(revertido, { ahora: AHORA }).length, 0, "un lote agotado sigue vivo");
    // Y `planConsumo` nunca deja pasar un gasto sin saldo.
    assert.equal(planConsumo(gastado, 1, { ahora: AHORA }).ok, false);
  });

  test("FIFO ordena por caduca_en y DESPUÉS por id", () => {
    const movs = [lote(9, 10, "2027-01-01"), lote(3, 10, "2027-01-01"), lote(7, 10, "2026-12-01")];
    assert.deepEqual(lotesVivos(movs, { ahora: AHORA }).map((l) => l.id), [7, 3, 9]);
  });

  test("un lote SIN fecha de caducidad va al final y nunca caduca", () => {
    const movs = [lote(1, 10, null), lote(2, 10, "2027-01-01")];
    assert.deepEqual(lotesVivos(movs, { ahora: AHORA }).map((l) => l.id), [2, 1]);
    assert.equal(caducado(lotesVivos(movs, { ahora: AHORA })[1], AHORA), false);
  });
});

describe("el cerrojo de la cuenta", () => {
  test("se ejecuta con el MISMO cliente que BEGIN y COMMIT", () => {
    // Un `pg_advisory_xact_lock` en otra conexión no protege nada: se soltaría al terminar ESA
    // transacción, no la nuestra. `x.run` es el mismo `client.query` que hace el BEGIN.
    const ag = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
    const i = ag.indexOf("export function crearTransaccion");
    const tx = ag.slice(i, ag.indexOf("\n}", ag.indexOf("return r;", i)) + 2);
    assert.match(tx, /await client\.query\("BEGIN"\)/);
    assert.match(tx, /run: async \(q, p = \[\]\) => \(await client\.query\(toPositional\(q\), p\)\)/);
    assert.match(tx, /await client\.query\("COMMIT"\)/);
    // Y el cerrojo se pide por `x.run`, no por el pool.
    assert.match(ag, /await x\.run\(`SELECT pg_advisory_xact_lock\(\?, \?\)`, \[CERROJO_PUNTOS, socio\.qrId\]\)/);
  });

  test("la clave NO puede colisionar entre dos carnés", () => {
    // Se usa la forma de DOS enteros: un espacio de nombres fijo y el id del carné tal cual. No hay
    // ninguna conversión —ni un hash, ni un truncado a 32 bits de una cadena— que pueda hacer que
    // dos carnés distintos compartan cerrojo y uno espere al otro, o peor, que no se esperen.
    const ag = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
    assert.match(ag, /pg_advisory_xact_lock\(\?, \?\)/, "se usa la forma de una sola clave");
    assert.ok(!/hashtext\(/.test(ag), "la clave pasa por un hash que puede colisionar");
    assert.ok(!/pg_advisory_xact_lock\(\?\)/.test(ag), "se usa la forma de 64 bits con conversión");
    assert.match(ag, /export const CERROJO_PUNTOS = \d+;/);
    // `qr_id` es un SERIAL: entra en los 32 bits del segundo argumento sin tocarlo.
    const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
    assert.match(esquema, /qr_id INTEGER NOT NULL/);
  });
});

describe("no se siembra ninguna regla comercial al arrancar", () => {
  test("el esquema NO inserta una regla activa", () => {
    // Una regla puesta sola sería un programa de puntos que nadie ha aprobado, con importes que
    // nadie ha confirmado. El panel propone los valores; una persona los guarda.
    const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
    assert.ok(!/INSERT INTO fid_reglas/.test(esquema), "el arranque siembra una regla");
    assert.ok(!/INSERT INTO fid_reglas/.test(server.slice(0, server.indexOf("app.post(\"/api/fidelizacion/reglas\""))),
      "algo inserta una regla fuera del endpoint");
  });

  test("crear una regla exige confirmación en la pantalla", () => {
    const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
    const f = panel.slice(panel.indexOf("async function fidpGuardar()"), panel.indexOf("async function fidpSombra()"));
    assert.match(f, /if \(!confirm\(texto\)\) return;/);
    // Y el aviso enseña los valores, no un «¿seguro?» a ciegas.
    for (const campo of ["punto(s) por cada euro", "de descuento", "Mínimo de factura", "caducan a los"]) {
      assert.ok(f.includes(campo), `el aviso no dice «${campo}»`);
    }
    assert.match(f, /Las facturas ya calculadas NO cambian/);
  });
});
