import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("el banner de Reseñas no puede escupir código", () => {
  test("nada de plantillas anidadas entre comillas simples", () => {
    // Estaba escrito `${cond ? '${otraCosa ? `<button>` : ""}' : ""}`: como el interior iba
    // entre comillas simples, no se evaluaba, y en pantalla salía el texto del propio código
    // rodeando a los botones.
    const banner = panel.slice(panel.indexOf("const estadoBanner = st ?"), panel.indexOf("const estadoBanner = st ?") + 2000);
    assert.doesNotMatch(banner, /'\$\{/, "hay una plantilla dentro de comillas simples: se pintará como texto");
    assert.match(banner, /USER\.rol === "direccion" && revPuedeResponder\(\)/);
  });
});

describe("las reseñas se sincronizan aunque Replit reinicie", () => {
  const bloque = server.slice(server.indexOf("const REVIEWS_CADA_HORAS"), server.indexOf("const REVIEWS_CADA_HORAS") + 1600);

  test("la decisión sale de una marca guardada, no de un temporizador de un día", () => {
    // Un setInterval de 24 h no llega a dispararse nunca si el proceso se reinicia cada pocas
    // horas: la cuenta vuelve a cero. Es el mismo fallo que ya se corrigió en facturas y Ágora.
    assert.match(bloque, /tocaRepasar\(\{ ultimo, ahora: new Date\(\)\.toISOString\(\), cadaHoras: REVIEWS_CADA_HORAS \}\)/);
    assert.match(bloque, /getConfig\("reviews_last_attempt"\)/);
  });

  test("y se comprueba también al arrancar", () => {
    // Si el último intento es de hace tres semanas, hay que hacerlo ahora, no dentro de un día.
    assert.match(bloque, /setTimeout\(\(\) => \{ reviewsSyncSiToca\(\)/);
    assert.match(bloque, /setInterval\(\(\) => \{ reviewsSyncSiToca\(\)/);
  });

  test("no se solapan dos sincronizaciones", () => {
    assert.match(bloque, /if \(_sincronizandoReviews\) return/);
    assert.match(bloque, /finally \{ _sincronizandoReviews = false; \}/);
  });

  test("ya no queda el temporizador de 24 horas", () => {
    assert.doesNotMatch(server, /\}, 24 \* 60 \* 60 \* 1000\);/);
  });
});

describe("lo que sale sin sesión es solo lo que hace falta fuera", () => {
  test("la ruta pública de reseñas NO devuelve el trabajo interno", () => {
    // Con `SELECT *` salían `reply`, `reply_by` y `replied_at`: quién de la casa contestó a
    // cada reseña y cuándo. En la portada de la web.
    const ruta = server.slice(server.indexOf('app.get("/api/reviews", async'), server.indexOf('app.post("/api/reviews/refresh"'));
    assert.doesNotMatch(ruta, /SELECT \* FROM google_reviews/);
    // Sobre la CONSULTA, no sobre los comentarios: aquí al lado se explica justamente cuáles
    // eran las columnas que se escapaban, y nombrarlas no es lo mismo que devolverlas.
    const sql = (ruta.match(/`SELECT[\s\S]*?`/) || [""])[0];
    assert.match(sql, /SELECT id, location_name, author, rating, text, fecha/);
    for (const col of ["reply", "reply_by", "replied_at"]) {
      assert.doesNotMatch(sql, new RegExp(`\\b${col}\\b`), `${col} no puede salir sin sesión`);
    }
  });

  test("el estado de Google pide sesión", () => {
    assert.match(server, /app\.get\("\/api\/google\/status", requireAuth\(\[/);
  });

  test("y los dos paneles lo piden con su token", () => {
    // Si se protege el endpoint y no se toca quien lo llama, la pantalla se queda muda.
    assert.match(panel, /fetch\("\/api\/google\/status", \{ headers: \{ Authorization: "Bearer " \+ token\(\) \} \}\)/);
    const viejo = readFileSync(new URL("../public/marketing.js", import.meta.url), "utf8");
    assert.match(viejo, /authFetch\("\/api\/google\/status"\)/);
  });
});
