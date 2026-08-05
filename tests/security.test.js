// Pruebas unitarias de las utilidades de seguridad (Iteración 1A). Sin arrancar el servidor.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isProduction, replitEnvWarning, classifyJwtSecret, resolveJwtSecret,
  safeLogError, errorHandler,
  extOf, cvTypeByExt, isAllowedCvUpload, magicMatches, validateCvContentSync, safeUploadName,
  CV_MAX_BYTES,
} from "../security.js";

describe("Entorno (isProduction) — solo configuración explícita", () => {
  test("APP_ENV es la fuente autoritativa", () => {
    assert.equal(isProduction({ APP_ENV: "production" }), true);
    assert.equal(isProduction({ APP_ENV: "staging" }), false);
    // APP_ENV manda sobre NODE_ENV
    assert.equal(isProduction({ APP_ENV: "production", NODE_ENV: "development" }), true);
    assert.equal(isProduction({ APP_ENV: "development", NODE_ENV: "production" }), false);
  });
  test("sin APP_ENV se consulta NODE_ENV", () => {
    assert.equal(isProduction({ NODE_ENV: "production" }), true);
    assert.equal(isProduction({ NODE_ENV: "development" }), false);
  });
  test("sin APP_ENV ni NODE_ENV ⇒ desarrollo (nunca producción automática)", () => {
    assert.equal(isProduction({}), false);
  });
  test("las variables de Replit por sí solas NO implican producción", () => {
    assert.equal(isProduction({ REPL_ID: "x" }), false);
    assert.equal(isProduction({ REPL_SLUG: "x" }), false);
    assert.equal(isProduction({ REPLIT_DEPLOYMENT: "1" }), false);
    // Replit + configuración explícita ⇒ decide la configuración
    assert.equal(isProduction({ REPL_ID: "x", APP_ENV: "production" }), true);
  });
  test("replitEnvWarning avisa (no decide) si hay Replit sin entorno explícito", () => {
    assert.match(replitEnvWarning({ REPL_ID: "x" }), /Replit/);
    assert.equal(replitEnvWarning({ REPL_ID: "x", APP_ENV: "production" }), null);
    assert.equal(replitEnvWarning({ NODE_ENV: "development" }), null);
    assert.equal(replitEnvWarning({}), null);
  });
});

describe("JWT secret", () => {
  test("classifyJwtSecret no revela valor, clasifica bien", () => {
    assert.equal(classifyJwtSecret(""), "ausente");
    assert.equal(classifyJwtSecret(undefined), "ausente");
    assert.equal(classifyJwtSecret("tapeta-secret-dev"), "debil");
    assert.equal(classifyJwtSecret("corto"), "debil");
    assert.equal(classifyJwtSecret("x".repeat(40)), "fuerte");
  });
  test("producción: exige fuerte (lanza si ausente o débil)", () => {
    assert.throws(() => resolveJwtSecret({ prod: true, env: undefined }), /ausente/);
    assert.throws(() => resolveJwtSecret({ prod: true, env: "tapeta-secret-dev" }), /debil/);
    const r = resolveJwtSecret({ prod: true, env: "S".repeat(40) });
    assert.equal(r.status, "fuerte"); assert.equal(r.source, "env");
  });
  test("no producción: usa env fuerte, o el DEV fijo estable", () => {
    const dev1 = resolveJwtSecret({ prod: false, env: undefined });
    const dev2 = resolveJwtSecret({ prod: false, env: undefined });
    assert.equal(dev1.source, "dev-fixed");
    assert.equal(dev1.secret, dev2.secret, "el secreto DEV es estable entre llamadas");
    assert.equal(resolveJwtSecret({ prod: false, env: "Z".repeat(40) }).source, "env");
  });
});

describe("Manejo de errores", () => {
  test("errorHandler responde 500 genérico y no propaga el mensaje interno", () => {
    let statusCode, body;
    const res = { headersSent: false, status(c) { statusCode = c; return this; }, json(b) { body = b; } };
    errorHandler(new Error("detalle interno con datos sensibles"),
      { method: "POST", originalUrl: "/x" }, res, () => {});
    assert.equal(statusCode, 500);
    assert.deepEqual(body, { ok: false, error: "Error interno" });
    assert.ok(!JSON.stringify(body).includes("sensibles"));
  });
  test("safeLogError no lanza", () => { assert.doesNotThrow(() => safeLogError("ctx", new Error("x"))); });
});

describe("server.js: solo error handler global (sin handlers de proceso en 1A)", () => {
  const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  test("mantiene el manejador global de Express", () => {
    assert.match(src, /app\.use\(errorHandler\)/);
  });
  test("no registra handlers de proceso añadidos en 1A", () => {
    assert.ok(!/uncaughtException/.test(src), "no debe registrar uncaughtException");
    assert.ok(!/unhandledRejection/.test(src), "no debe registrar unhandledRejection");
    assert.ok(!/fatalCrash/.test(src), "no debe existir fatalCrash");
  });
});

describe("Validación de subida de CV", () => {
  test("extensión/tipo y allowlist ext+MIME", () => {
    assert.equal(extOf("Hoja de Vida.PDF"), "pdf");
    assert.equal(cvTypeByExt("cv.docx"), "docx");
    assert.equal(cvTypeByExt("cv.exe"), null);
    assert.ok(isAllowedCvUpload({ originalname: "cv.pdf", mimetype: "application/pdf" }));
    assert.ok(isAllowedCvUpload({ originalname: "cv.jpg", mimetype: "image/jpeg" }));
    assert.ok(!isAllowedCvUpload({ originalname: "cv.exe", mimetype: "application/octet-stream" }));
    assert.ok(!isAllowedCvUpload({ originalname: "cv.pdf", mimetype: "text/html" }), "MIME no permitido aunque la ext sí");
  });
  test("magic bytes: acepta firmas válidas y rechaza contenido falso", () => {
    assert.ok(magicMatches(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]), "pdf"));
    assert.ok(magicMatches(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "jpg"));
    assert.ok(magicMatches(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "docx"));
    assert.ok(!magicMatches(Buffer.from([0x00, 0x01, 0x02, 0x03]), "pdf"));
  });
  test("validateCvContentSync valida el archivo real (magic vs extensión)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cvtest-"));
    const okPdf = path.join(dir, "bien.pdf");
    fs.writeFileSync(okPdf, Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]));
    const fakePdf = path.join(dir, "falso.pdf"); // extensión pdf pero contenido no-pdf
    fs.writeFileSync(fakePdf, Buffer.from("<html>no soy un pdf</html>"));
    assert.equal(validateCvContentSync(okPdf, "bien.pdf"), true);
    assert.equal(validateCvContentSync(fakePdf, "falso.pdf"), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  test("safeUploadName no usa el nombre original y conserva extensión saneada", () => {
    const n = safeUploadName("../../etc/passwd.pdf");
    assert.ok(!n.includes("passwd"), "no debe contener el nombre original");
    assert.ok(!n.includes("/"), "no debe contener separadores de ruta");
    assert.match(n, /\.pdf$/);
  });
  test("límite de tamaño definido en 8 MB", () => { assert.equal(CV_MAX_BYTES, 8 * 1024 * 1024); });
});
