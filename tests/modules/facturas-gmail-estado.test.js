import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { explicarError, resumirGmail, consultaGmail, CLAVES, DIAS_ATRAS } from "../../src/modules/facturas/gmail-estado.js";

// EL CASO: Drive subía las facturas sin problema y unas que llegaron por correo no se
// ordenaron nunca. En pantalla, «No se ha podido comprobar» y nada más. El error existía, pero
// en la consola del servidor, que desde el panel no se ve.

describe("el buzón se mira por fecha, no por «sin leer»", () => {
  test("busca los adjuntos de los últimos días", () => {
    assert.equal(consultaGmail(), `has:attachment newer_than:${DIAS_ATRAS}d`);
    assert.equal(consultaGmail(30), "has:attachment newer_than:30d");
  });

  test("y NUNCA por «no leído»", () => {
    // Ahí estaba el fallo: abrir el correo en el móvil antes de que pasara el turno dejaba esa
    // factura fuera para siempre, sin reintento y sin que nada lo dijera.
    for (const d of [1, 7, 14, 60]) assert.ok(!/unread/.test(consultaGmail(d)));
  });

  test("con un número absurdo no genera una búsqueda rota", () => {
    for (const v of [0, -5, null, undefined, "x"]) {
      assert.match(consultaGmail(v), /newer_than:\d+d$/);
    }
  });
});

describe("los errores de Google se traducen a qué hay que hacer", () => {
  test("EL CASO IMPORTANTE: el permiso del correo no está en la conexión", () => {
    // Se autoriza una vez y con unos permisos concretos. Si se autorizó cuando el sistema solo
    // tocaba Drive, las facturas se suben y las del correo no entran nunca — que es justo lo
    // que se ve desde fuera. Y un JSON de Google no lo explica.
    for (const e of [{ code: 403, message: "Request had insufficient authentication scopes." },
                     "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
                     { errors: [{ reason: "insufficientPermissions" }] }]) {
      const t = explicarError(e);
      assert.match(t, /permiso para leer el correo/i);
      assert.match(t, /Conectar Google/, "tiene que decir qué botón pulsar");
      assert.match(t, /Drive seguirá funcionando/, "y tranquilizar sobre lo que ya funciona");
    }
  });

  test("la conexión caducada o revocada", () => {
    assert.match(explicarError("invalid_grant: Token has been expired or revoked."), /caducado o revocado/i);
  });

  test("Gmail apagado en el proyecto de Google", () => {
    assert.match(explicarError({ message: "Gmail API has not been used in project 123 before" }), /activarla en la consola/i);
  });

  test("ir demasiado rápido no es un problema que haya que arreglar", () => {
    assert.match(explicarError("429 userRateLimitExceeded"), /Se reintenta solo/);
  });

  test("lo que no se reconoce se enseña igual, recortado", () => {
    // Un error que no se entiende sigue siendo más útil que ninguno.
    assert.equal(explicarError("pasó algo raro"), "pasó algo raro");
    const largo = explicarError("x".repeat(400));
    assert.ok(largo.length <= 221 && largo.endsWith("…"));
  });

  test("sin error, no se inventa ninguno", () => {
    for (const v of [null, undefined, "", 0]) assert.equal(explicarError(v), null);
  });
});

describe("la frase de estado del correo", () => {
  const cfg = (o = {}) => ({ [CLAVES.intento]: null, [CLAVES.ok]: null, [CLAVES.error]: null, ...o });

  test("sin conectar lo dice, y no habla de correos", () => {
    const r = resumirGmail({ conectado: false, cfg: cfg() });
    assert.equal(r.nivel, "bad");
    assert.match(r.detalle, /no está conectado/);
  });

  test("UN ERROR MANDA SOBRE CUALQUIER RECUENTO", () => {
    // «12 correos revisados» al lado de un fallo de permisos da a entender que va bien.
    const r = resumirGmail({ conectado: true, cfg: cfg({ [CLAVES.intento]: "2026-08-26T22:00:00Z", [CLAVES.error]: "No tiene permiso", [CLAVES.vistos]: 12 }) });
    assert.equal(r.nivel, "bad");
    assert.equal(r.detalle, "No tiene permiso");
  });

  test("«nunca se ha mirado» NO es lo mismo que «no había nada»", () => {
    const r = resumirGmail({ conectado: true, cfg: cfg() });
    assert.equal(r.nivel, "warn");
    assert.match(r.detalle, /Todavía no se ha mirado/);
  });

  test("y cuando va bien cuenta lo que vio y lo que entró", () => {
    const r = resumirGmail({ conectado: true, procesadosEnBase: 87, cfg: cfg({
      [CLAVES.intento]: "2026-08-26T22:00:00Z", [CLAVES.ok]: "2026-08-26T18:00:00Z",
      [CLAVES.vistos]: 9, [CLAVES.nuevos]: 2, [CLAVES.procesados]: 2 }) });
    assert.equal(r.nivel, "ok");
    assert.match(r.detalle, /9 correos con adjunto/);
    assert.match(r.detalle, /2 sin mirar/);
    assert.match(r.detalle, /2 facturas en el último repaso/);
    assert.match(r.detalle, /87 en total/);
    assert.equal(r.intento, "2026-08-26T22:00:00Z");
  });

  test("cero correos nuevos se dice, no se calla", () => {
    const r = resumirGmail({ conectado: true, cfg: cfg({ [CLAVES.intento]: "2026-08-26T22:00:00Z", [CLAVES.vistos]: 4, [CLAVES.nuevos]: 0 }) });
    assert.equal(r.nivel, "ok");
    assert.match(r.detalle, /ninguno nuevo/);
  });

  test("no revienta sin nada", () => {
    assert.doesNotThrow(() => resumirGmail());
    assert.doesNotThrow(() => resumirGmail({ conectado: true }));
  });
});

describe("y el caso que aparece tras un redespliegue", () => {
  test("si faltan las credenciales del servidor, lo dice", () => {
    // La conexión guardada sigue ahí pero no hay con qué renovarla. Desde fuera se ve igual
    // que «Google ha dejado de funcionar», y el arreglo no tiene nada que ver: es reponer un
    // secreto en el despliegue.
    for (const e of ['{"error":"invalid_request","error_description":"Could not determine client ID from request."}',
                     "invalid_client", "unauthorized_client"]) {
      assert.match(explicarError(e), /credenciales de Google/);
      assert.match(explicarError(e), /GOOGLE_DRIVE_CLIENT_ID/);
    }
  });
});
