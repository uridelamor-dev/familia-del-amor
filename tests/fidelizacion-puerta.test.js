// La puerta de puesta en producción.
//
// ── DOS CERROJOS DISTINTOS, Y NO SE CONFUNDEN ────────────────────────────────────────────────
//
//   NIVEL     ¿está el CÓDIGO terminado? Constante, se sube en un commit revisado.
//   PUERTA    ¿está ESTE NEGOCIO listo? Se guarda, la firma Dirección y se puede pausar en caliente.
//
// Hacen falta los dos. Un despliegue nunca abre la puerta: se abre desde el panel, después,
// mirando una lista de requisitos que ha comprobado el servidor.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ESTADOS, REQUISITOS, REQUISITOS_CAMPANA, requisitosDe, evaluarPuerta,
         puedeTransitar, confirmacionValida, CONFIRMACION_EXIGIDA }
  from "../src/modules/fidelizacion/puerta.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const trozo = (a, b) => server.slice(server.indexOf(a), server.indexOf(b));

/** Un contexto en el que TODO se cumple. Los tests van quitando piezas de aquí. */
const TODO_OK = Object.freeze({
  nivel: "completo", devolucionTotal: true, reglasVigentes: 1, localesConfirmados: 1,
  sombraFacturas: 40, sombraRevisadaEn: "2026-09-14T12:00:00Z", revisionesBloqueantes: 0,
  conceder: true, ofrecer: true, consumir: true, campanasPublicadas: 0,
});

describe("los cinco estados", () => {
  test("son los acordados, y están congelados", () => {
    assert.deepEqual([...ESTADOS], ["no_preparado", "sombra", "listo_para_activar", "activo", "pausado"]);
    assert.throws(() => { ESTADOS.push("x"); }, TypeError);
    assert.throws(() => { REQUISITOS.push({}); }, TypeError);
  });

  test("sin nada guardado, la puerta está en «no_preparado»", () => {
    assert.equal(evaluarPuerta(null, TODO_OK).estado, "no_preparado");
    // Y un estado inventado en la base tampoco la abre.
    assert.equal(evaluarPuerta({ estado: "abierta_del_todo" }, TODO_OK).estado, "no_preparado");
  });
});

describe("los requisitos se comprueban EN EL SERVIDOR", () => {
  test("con todo cumplido, se puede activar", () => {
    const e = evaluarPuerta({ estado: "listo_para_activar" }, TODO_OK);
    assert.equal(e.puede_activar, true);
    assert.deepEqual(e.pendientes, []);
  });

  test("cada pieza que falta lo impide, y DICE QUÉ HACER", () => {
    const casos = [
      ["nivel", { nivel: "sombra" }, /nivel de lanzamiento/i],
      ["devolucionTotal", { devolucionTotal: false }, /devolución total/i],
      ["reglasVigentes", { reglasVigentes: 0 }, /regla de puntos vigente/i],
      ["localesConfirmados", { localesConfirmados: 0 }, /Workplace confirmado/i],
      ["sombraRevisadaEn", { sombraRevisadaEn: null }, /nadie ha marcado/i],
      ["revisionesBloqueantes", { revisionesBloqueantes: 3 }, /3 revisión/],
    ];
    for (const [nombre, parche, patron] of casos) {
      const e = evaluarPuerta({ estado: "sombra" }, { ...TODO_OK, ...parche });
      assert.equal(e.puede_activar, false, nombre);
      assert.ok(e.pendientes.some((p) => patron.test(p)), `${nombre}: ${e.pendientes.join(" | ")}`);
    }
  });

  test("sin facturas en sombra, el motivo es OTRO: no hay con qué comparar", () => {
    // Es un caso distinto de «hay y nadie las ha mirado», y el texto tiene que decirlo.
    const e = evaluarPuerta({ estado: "sombra" }, { ...TODO_OK, sombraFacturas: 0, sombraRevisadaEn: null });
    assert.ok(e.pendientes.some((p) => /ninguna factura calculada en sombra/.test(p)));
  });

  test("ofrecer o consumir sin conceder es incoherente", () => {
    const e = evaluarPuerta({ estado: "sombra" }, { ...TODO_OK, conceder: false, ofrecer: true });
    assert.ok(e.pendientes.some((p) => /sin conceder puntos/.test(p)));
    // Con los tres apagados no hay incoherencia: es el estado de reposo.
    const r = evaluarPuerta({ estado: "sombra" },
      { ...TODO_OK, conceder: false, ofrecer: false, consumir: false });
    assert.ok(!r.pendientes.some((p) => /sin conceder/.test(p)));
  });

  test("los requisitos de CAMPAÑA solo aplican si hay alguna publicada", () => {
    // Exigir catálogo y códigos de Offer a quien solo quiere puntos sería bloquearle por algo que
    // no usa.
    assert.equal(requisitosDe({ campanasPublicadas: 0 }).length, REQUISITOS.length);
    assert.equal(requisitosDe({ campanasPublicadas: 1 }).length, REQUISITOS.length + REQUISITOS_CAMPANA.length);

    const conCampana = { ...TODO_OK, campanasPublicadas: 1, campanasSinCatalogo: 1, gruposVacios: 2,
      offersSinCodigo: 1, formulariosSinLegal: 1 };
    const e = evaluarPuerta({ estado: "sombra" }, conCampana);
    assert.equal(e.puede_activar, false);
    for (const patron of [/sin catálogo/, /sin ningún producto/, /sin código comprobado/, /sin consentimiento/]) {
      assert.ok(e.pendientes.some((p) => patron.test(p)), `${patron}: ${e.pendientes.join(" | ")}`);
    }
  });

  test("una puerta ABIERTA cuyos requisitos han dejado de cumplirse se marca incoherente", () => {
    // No se cierra sola: cerrarla por sorpresa dejaría a un camarero sin poder cerrar una factura
    // con el descuento ya aplicado. Pero se avisa bien fuerte.
    const e = evaluarPuerta({ estado: "activo" }, { ...TODO_OK, reglasVigentes: 0 });
    assert.equal(e.estado, "activo");
    assert.equal(e.incoherente, true);
    assert.equal(e.puede_activar, false);
  });
});

describe("las transiciones", () => {
  const con = { puedeActivar: true }, sin = { puedeActivar: false };

  test("activar exige pasar por «listo para activar» Y cumplirlo todo", () => {
    assert.equal(puedeTransitar("sombra", "activo", con).ok, false, "se ha saltado un paso");
    assert.equal(puedeTransitar("listo_para_activar", "activo", con).ok, true);
    assert.equal(puedeTransitar("listo_para_activar", "activo", sin).ok, false);
  });

  test("PAUSAR siempre se puede desde activo: es el freno de emergencia", () => {
    // No puede depender de que se cumpla nada; si algo está mal, hay que poder cortar ya.
    assert.equal(puedeTransitar("activo", "pausado", sin).ok, true);
    assert.equal(puedeTransitar("sombra", "pausado", con).ok, false, "no hay nada que pausar");
  });

  test("reanudar SÍ vuelve a exigir los requisitos", () => {
    // Si se pausó porque algo estaba mal, no se reanuda sin comprobar que ya no lo está.
    assert.equal(puedeTransitar("pausado", "activo", sin).ok, false);
    assert.equal(puedeTransitar("pausado", "activo", con).ok, true);
  });

  test("para volver atrás desde activo hay que pausar primero", () => {
    for (const hacia of ["sombra", "no_preparado", "listo_para_activar"]) {
      assert.equal(puedeTransitar("activo", hacia, con).ok, false, hacia);
    }
  });

  test("apagar hacia atrás siempre se puede", () => {
    assert.equal(puedeTransitar("listo_para_activar", "sombra", sin).ok, true);
    assert.equal(puedeTransitar("pausado", "sombra", sin).ok, true);
  });

  test("un estado inventado no existe", () => {
    assert.equal(puedeTransitar("sombra", "encendido_del_todo", con).ok, false);
    assert.equal(puedeTransitar("sombra", "sombra", con).ok, false);
  });
});

describe("la confirmación escrita", () => {
  test("hay que escribir la palabra, no pulsar un botón", () => {
    // Un botón se pulsa sin leer. Escribir obliga a mirar la pantalla que hay encima.
    assert.equal(CONFIRMACION_EXIGIDA, "ACTIVAR");
    assert.equal(confirmacionValida("ACTIVAR"), true);
    assert.equal(confirmacionValida("  activar "), true, "no se es tiquismiquis con mayúsculas");
    for (const malo of ["", "si", "vale", "ACTIVA", null, undefined, "ACTIVAR YA"]) {
      assert.equal(confirmacionValida(malo), false, String(malo));
    }
  });
});

describe("el cableado en el servidor", () => {
  const puerta = trozo('app.post("/api/fidelizacion/puerta", requireAuth', '// ── El programa de puntos');

  test("mover la puerta es SOLO de Dirección", () => {
    // Marketing prepara reglas y campañas —es su trabajo— pero la activación final no es una
    // decisión comercial: es empezar a mover dinero de clientes.
    assert.match(server, /app\.post\("\/api\/fidelizacion\/puerta", requireAuth\(\["direccion"\]\)/);
    assert.match(server, /app\.post\("\/api\/fidelizacion\/puerta\/sombra-revisada", requireAuth\(\["direccion"\]\)/);
    // Verla sí pueden los dos.
    assert.match(server, /app\.get\("\/api\/fidelizacion\/puerta", requireAuth\(PROMOS_ROLES\)/);
  });

  test("activar exige la palabra escrita, y pausar un motivo", () => {
    assert.match(puerta, /if \(hacia === "activo" && !fidConfirmacionValida\(req\.body\?\.confirmacion\)\)/);
    assert.match(puerta, /if \(hacia === "pausado" && !String\(req\.body\?\.motivo \|\| ""\)\.trim\(\)\)/);
  });

  test("la transición se comprueba con el estado GUARDADO, no con el que mande el cliente", () => {
    assert.match(puerta, /const ev = fidEvaluarPuerta\(guardada, ctx\);/);
    assert.match(puerta, /fidPuedeTransitar\(ev\.estado, hacia, \{ puedeActivar: ev\.puede_activar \}\)/);
  });

  test("y queda firmado: quién, cuándo y con qué requisitos", () => {
    assert.match(puerta, /confirmado_por = \?, confirmado_en = \?/);
    assert.match(puerta, /requisitos: ev\.requisitos\.map/);
    assert.match(puerta, /ficAuditar\("fidelizacion", null, "puerta_" \+ hacia/);
  });

  test("el contexto se calcula LEYENDO LA BASE, no con casillas", () => {
    const ctx = trozo("async function fidContextoPuerta()", "const fidPuertaGuardada");
    for (const consulta of ["FROM fid_reglas", "FROM fid_integraciones", "FROM fid_sombra",
                            "FROM fid_revisiones", "FROM fid_puerta"]) {
      assert.ok(ctx.includes(consulta), `no se comprueba con ${consulta}`);
    }
    // Lo único que aporta una persona es la firma; el resto son hechos contados aquí.
    assert.ok(!/req\.body/.test(ctx), "el contexto se deja influir por la petición");
  });

  test("la tabla nace en «no_preparado» y el arranque no la mueve", () => {
    const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
    assert.match(esquema, /VALUES \(1, 'no_preparado', \?\)\s*\n?\s*ON CONFLICT \(id\) DO NOTHING/);
    assert.match(esquema, /CHECK \(id = 1\)/);
    // Un despliegue jamás deja el programa activo. Se miran las ESCRITURAS, no el `CHECK`: ahí
    // `'activo'` aparece legítimamente, porque es uno de los cinco estados posibles.
    // `\b` para no cazar `fid_puerta_promos`: es la puerta de las promociones de Ágora, otra
    // tabla y otro sistema, con su propio candado en `promociones-puerta.test.js`.
    const escrituras = [...esquema.matchAll(/(INSERT INTO|UPDATE) fid_puerta\b[^`]*/g)].map((m) => m[0]);
    assert.equal(escrituras.length, 1, "el arranque escribe en la puerta más de una vez");
    for (const e of escrituras) {
      for (const estado of ["'activo'", "'listo_para_activar'", "'pausado'"]) {
        assert.ok(!e.includes(estado), `el arranque puede dejar la puerta en ${estado}`);
      }
    }
  });
});
