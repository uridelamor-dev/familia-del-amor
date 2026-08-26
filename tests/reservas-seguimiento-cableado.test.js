import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// El seguimiento existía y no funcionaba: se programaba SOLO desde las reservas hechas hablando
// con Sara —las del panel, que son casi todas, no—, escribía saltándose la lista de bajas,
// contestaba siempre lo mismo dijera lo que dijera el cliente, nunca pedía una reseña a nadie, y
// no dejaba rastro en ninguna pantalla.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const wa = readFileSync(new URL("../whatsapp.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("se programa desde CUALQUIER reserva, no solo desde las de Sara", () => {
  test("una sola función lo hace, y la llaman los dos caminos", () => {
    assert.match(server, /async function programarSeguimiento\(\{ telefono, nombre, local, dia, pendiente = false \}\)/);
    // Sin contar la propia definición, que también empieza igual.
    const llamadas = (server.match(/(?<!function )programarSeguimiento\(\{ telefono/g) || []).length;
    assert.equal(llamadas, 2, "los dos caminos —el panel y Sara— tienen que pasar por la misma puerta");
  });

  test("y ya no hay ningún INSERT suelto", () => {
    // El que había estaba dentro del flujo de Sara: por eso las reservas del panel no
    // programaban nada y el sistema parecía montado sin llegarle a casi nadie.
    const inserts = (server.match(/INSERT INTO followup_scheduled/g) || []).length;
    assert.equal(inserts, 1, "vuelve a haber más de un sitio que programa");
  });

  test("RESPETA LA LISTA DE BAJAS, que antes se saltaba", () => {
    const fn = server.slice(server.indexOf("async function programarSeguimiento("), server.indexOf("app.get(\"/api/reservas/seguimiento\""));
    // Y de la tabla BUENA. La primera versión preguntaba a `contactos`, que no existe: la
    // consulta fallaba en silencio y el filtro no habría filtrado nunca — justo el fallo que
    // venía a cerrar. El consentimiento vive en `marketing_prefs`, como en las campañas.
    assert.match(fn, /FROM marketing_prefs WHERE RIGHT\(REGEXP_REPLACE\(telefono/);
    assert.match(fn, /puedePreguntarse\(\{ telefono: tel, baja: prefs\?\.baja/);
    assert.ok(!/FROM contactos/.test(fn), "vuelve a preguntar a una tabla que no existe");
  });

  test("y no repite con el mismo cliente antes de tiempo", () => {
    // Al habitual —el que viene cada semana— le llegaría un WhatsApp cada lunes.
    const fn = server.slice(server.indexOf("async function programarSeguimiento("), server.indexOf("app.get(\"/api/reservas/seguimiento\""));
    // Cuenta también LOS QUE ESTÁN EN COLA: si reserva dos veces la misma semana, mirando
    // solo los enviados se le programan dos y recibe dos mensajes. Comprobado: pasaba.
    assert.match(fn, /MAX\(dia\) AS dia FROM followup_scheduled WHERE RIGHT\(REGEXP_REPLACE\(jid/);
    assert.ok(!/AND sent = 1/.test(fn), "vuelve a mirar solo lo ya enviado");
    assert.match(fn, /ultimo: ultimo\?\.dia \|\| null/);
  });

  test("una reserva pendiente de confirmar no programa nada", () => {
    const fn = server.slice(server.indexOf("async function programarSeguimiento("), server.indexOf("app.get(\"/api/reservas/seguimiento\""));
    assert.match(fn, /if \(pendiente\) return \{ ok: false, motivo: "reserva_pendiente" \}/);
  });
});

describe("«ayer estuviste» no se manda tres días después", () => {
  test("se comprueba antes de enviar", () => {
    // Si WhatsApp estuvo caído —lo normal tras cada redespliegue— el mensaje salía igual al
    // volver. Un mensaje que miente es peor que ninguno.
    assert.match(server, /if \(!siguesATiempo\(\{ enviarA: row\.send_at, ahora \}\)\)/);
    assert.match(server, /SET sent = 1, resultado = 'caducado'/);
  });
});

describe("la respuesta decide, y la reseña solo va a quien salió contento", () => {
  test("whatsapp.js ya NO contesta siempre lo mismo", () => {
    assert.ok(!/Tu opinión nos ayuda a seguir mejorando\. En caso de haber algo/.test(wa),
      "vuelve la respuesta única, dijera lo que dijera el cliente");
    assert.match(wa, /export function setSeguimientoResolver\(fn\)/);
    assert.match(wa, /plan = await seguimientoResolver\(\{ jid, ctx, texto: textoCombinado \}\)/);
  });

  test("LO NEGATIVO MANDA: la IA no puede ablandar una queja", () => {
    // Cuando alguien escribe «tardaron mucho», eso pesa más que la opinión de un modelo:
    // equivocarse ahí convierte una queja privada en una estrella pública.
    const fn = server.slice(server.indexOf("setSeguimientoResolver(async"), server.indexOf("// ── RRHH: enlace con operadores"));
    assert.match(fn, /const delTexto = clasificarRespuesta\(texto\)/);
    assert.match(fn, /if \(delTexto !== DESCONTENTO && process\.env\.ANTHROPIC_API_KEY\)/);
    assert.match(fn, /veredictoFinal\(\{ deLaIA, delTexto \}\)/);
  });

  test("el enlace sale del place_id que ya se guarda al vincular la ficha", () => {
    const fn = server.slice(server.indexOf("setSeguimientoResolver(async"), server.indexOf("// ── RRHH: enlace con operadores"));
    assert.match(fn, /getConfig\("places_ids"\)/);
    assert.match(fn, /enlaceResena\(ficha\?\.placeId\)/);
  });

  test("a una respuesta buena no se interrumpe a nadie; a una mala, sí", () => {
    assert.match(wa, /if \(!plan \|\| plan\.avisar !== false\)/);
  });

  test("y todo queda anotado, que era lo que faltaba", () => {
    const fn = server.slice(server.indexOf("setSeguimientoResolver(async"), server.indexOf("// ── RRHH: enlace con operadores"));
    assert.match(fn, /SET respuesta = \?, respondido_en = \?, veredicto = \?, resena_pedida = \?/);
    assert.match(server, /"veredicto TEXT", "resena_pedida INTEGER DEFAULT 0", "resultado TEXT"/);
  });
});

describe("y ahora se puede mirar", () => {
  test("hay endpoint y pantalla", () => {
    // Un mecanismo que no se puede mirar es un mecanismo del que no se puede saber si funciona
    // — y este llevaba tiempo sin funcionar sin que nadie pudiera verlo.
    assert.match(server, /app\.get\("\/api\/reservas\/seguimiento", requireAuth\(\["direccion", "marketing", "encargado"\]\)/);
    assert.match(app, /async function resSeguimiento\(\)/);
    assert.match(app, /apiRaw\("\/api\/reservas\/seguimiento"\)/);
  });

  test("respeta el establecimiento de quien mira", () => {
    const ep = server.slice(server.indexOf('app.get("/api/reservas/seguimiento"'), server.indexOf("setSeguimientoResolver(async"));
    assert.match(ep, /const scope = localScope\(req\)/);
    assert.match(ep, /personasDe\(scope\)/);
  });

  test("lo urgente se ve SIN abrir nada", () => {
    // Abrir el desplegable de casa decidiría por quien mira, y hay un candado del panel que lo
    // prohíbe con razón. Así que si alguien ha contestado que no fue bien, eso sale fuera.
    assert.match(app, /clientes han contestado"} que no fue bien/);
    assert.ok(!/\$\{r\.descontentos \? "open" : ""\}/.test(app), "vuelve a abrirse solo");
  });

  test("y dice cuántos no salieron a tiempo, con el motivo", () => {
    assert.match(app, /no salieron a tiempo/);
    assert.match(app, /«ayer estuviste» deja de ser verdad a los dos días/);
  });
});
