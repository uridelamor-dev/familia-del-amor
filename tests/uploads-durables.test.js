import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

// 10/11/2026: se publicó con una campaña en marcha, Replit vació `public/uploads`, la imagen
// desapareció y la campaña se quedó «En curso» sin enviar nada y sin avisar.
describe("los adjuntos sobreviven a un despliegue", () => {
  test("cada subida guarda una copia en PostgreSQL", () => {
    assert.match(server, /CREATE TABLE IF NOT EXISTS uploads_copia/);
    const up = server.slice(server.indexOf('app.post("/api/upload"'), server.indexOf('app.post("/api/uploads/optimize-existing"'));
    assert.match(up, /guardarCopiaUpload\(f\.filename, fp\)/);
  });

  test("las campañas cargan el adjunto con respaldo en la base", () => {
    assert.doesNotMatch(server, /[^.\w]cargarAdjunto\((camp\.)?adjunto_url\)/, "queda una carga sin respaldo");
    assert.match(server, /const adjunto=await cargarAdjuntoDurable\(camp\.adjunto_url\)/);
  });

  test("si falta el adjunto, se dice en el log en vez de callar", () => {
    const fn = server.slice(server.indexOf("async function dispatchCampana("), server.indexOf("// Mensaje MASIVO"));
    assert.match(fn, /console\.error\(`\[campaña \$\{campanaId\}\] NO SE ENVÍA: falta el adjunto/);
  });

  test("se puede cambiar el adjunto de una campaña en curso, y solo eso", () => {
    const r = server.slice(server.indexOf('app.put("/api/campanas/:id/adjunto"'), server.indexOf("// Disparar el envío de una campaña existente"));
    assert.match(r, /UPDATE campanas_wa SET adjunto_url = \? WHERE id = \?/);
    assert.doesNotMatch(r, /estado\s*=\s*'|mensaje\s*=|segmento_json\s*=/);
  });

  test("/uploads busca en la copia lo que no está en disco", () => {
    assert.match(server, /app\.get\("\/uploads\/:nombre"/);
    assert.ok(server.indexOf('app.get("/uploads/:nombre"') > server.indexOf("app.use(express.static("), "va después del estático");
  });
});
