// Guardas de cableado en server.js (introspección de código, sin arrancar el servidor).
// Verifican que el port a PostgreSQL conecta correctamente 1A + It4 y que la arquitectura
// (delegación en el servicio, sin fallback inseguro, sin adaptadores SQLite) se mantiene.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");

describe("server.js — seguridad 1A cableada", () => {
  test("JWT usa resolveJwtSecret y NO conserva el fallback inseguro", () => {
    assert.match(src, /resolveJwtSecret\(/);
    assert.ok(!/\|\|\s*["']tapeta-secret-dev["']/.test(src), "no debe quedar el fallback inseguro de JWT");
  });
  test("manejador de errores global presente; sin handlers de proceso (no en 1A)", () => {
    assert.match(src, /app\.use\(errorHandler\)/);
    assert.ok(!/uncaughtException/.test(src));
    assert.ok(!/unhandledRejection/.test(src));
  });
  test("CV: directorio privado tmp_uploads, multer con límite/MIME y finalizeCvUpload", () => {
    assert.match(src, /uploadsTmpDir\s*=\s*path\.join\(__dirname,\s*["']tmp_uploads["']\)/);
    assert.match(src, /limits:\s*\{\s*fileSize:\s*CV_MAX_BYTES\s*\}/);
    assert.match(src, /fileFilter:.*isAllowedCvUpload/);
    assert.match(src, /finalizeCvUpload\(/);
    assert.ok(!/express\.static\([^)]*tmp_uploads/.test(src), "el directorio temporal NO debe servirse estático");
  });
});

describe("server.js — Mantenimiento It4 delega en el servicio", () => {
  test("importa el servicio y el flag; NO importa el núcleo de acceso directamente", () => {
    assert.match(src, /listMaintenanceIssues|createMaintenanceIssue|updateMaintenanceIssueStatus/);
    assert.match(src, /permisosV2Enabled/);
    assert.ok(!/from\s+["'][^"']*core\/access\.js["']/.test(src), "server.js no debe importar core/access.js");
    assert.ok(!/from\s+["'][^"']*core\/scope\.js["']/.test(src), "server.js no debe importar core/scope.js");
  });
  test("los 3 endpoints de mantenimiento usan el servicio (no SQL directo)", () => {
    const seg = src.slice(src.indexOf('app.get("/api/maintenance"'), src.indexOf("// Comunicados"));
    assert.match(seg, /listMaintenanceIssues\(maintDb/);
    assert.match(seg, /createMaintenanceIssue\(maintDb/);
    assert.match(seg, /updateMaintenanceIssueStatus\(maintDb/);
    assert.ok(!/dbAll\(`SELECT \* FROM maintenance_issues/.test(seg), "no debe consultar la tabla directamente en la ruta");
  });
});

describe("server.js — modelo It2 e integridad PostgreSQL", () => {
  test("initDB prepara el esquema de establecimientos (idempotente, sin backfill)", () => {
    assert.match(src, /ensureEstablecimientosSchema\(schemaX\)/);
    assert.match(src, /seedCatalogo\(schemaX\)/);
  });
  test("sin residuos de SQLite en server.js (motor único: PostgreSQL)", () => {
    assert.ok(!/sqlite3/.test(src));
    assert.ok(!/database\.sqlite/.test(src));
    assert.ok(!/PRAGMA|this\.lastID|\.changes\b/.test(src));
  });
});
