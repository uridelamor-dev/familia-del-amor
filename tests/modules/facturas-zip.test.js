// El ZIP escrito a mano. Se comprueba contra el formato de verdad, no contra sí mismo: un ZIP
// que solo sabe leer quien lo escribió no sirve de nada.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearZip, crc32, nombreSeguro, sinRepetir, nombreDeFactura } from "../../src/modules/facturas/zip.js";

describe("el CRC-32", () => {
  test("da el valor que dice el estándar", () => {
    // «123456789» → 0xCBF43926 es el vector de prueba de toda la vida del CRC-32.
    assert.equal(crc32(Buffer.from("123456789")), 0xCBF43926);
    assert.equal(crc32(Buffer.from("")), 0);
  });
});

describe("los nombres dentro del ZIP", () => {
  test("no llevan nada que rompa un nombre de archivo", () => {
    // Una barra crearía carpetas dentro del ZIP; los dos puntos no se pueden escribir en
    // Windows y el archivo se descargaría sin poder abrirse.
    assert.equal(nombreSeguro('A/B\\C:D*E?F"G<H>I|J'), "A B C D E F G H I J");
  });

  test("pero conservan guiones y comas, que son parte del nombre", () => {
    assert.equal(nombreSeguro("TUPINAMBA, S.A. - 2026-07-31"), "TUPINAMBA, S.A. - 2026-07-31");
  });

  test("y nunca quedan vacíos", () => {
    assert.equal(nombreSeguro("///"), "documento");
    assert.equal(nombreSeguro(null), "documento");
  });

  test("dos facturas que se llaman igual no se pisan", () => {
    // Un ZIP con dos entradas del mismo nombre se abre enseñando una sola: la otra desaparece
    // sin decir nada, que es la peor manera de perder una factura.
    assert.deepEqual(sinRepetir(["a.pdf", "a.pdf", "b.pdf", "a.pdf"]),
      ["a.pdf", "a (2).pdf", "b.pdf", "a (3).pdf"]);
  });

  test("el nombre de una factura empieza por el proveedor y lleva la fecha en ISO", () => {
    // Proveedor primero porque es como se busca; fecha en ISO para que al ordenar por nombre
    // salgan en orden de verdad.
    assert.equal(nombreDeFactura({ proveedor: "TUPINAMBA, S.A.", fecha: "2026-07-31", numero_factura: "FA-16973" }, "jpg"),
      "TUPINAMBA, S.A. · 2026-07-31 · FA-16973.jpg");
  });

  test("y si no se sabe nada de ella, al menos lleva su id", () => {
    assert.equal(nombreDeFactura({ id: 42 }, "pdf"), "factura-42.pdf");
  });
});

describe("el archivo que sale", () => {
  const zip = crearZip([
    { nombre: "uno.txt", datos: Buffer.from("hola mundo") },
    { nombre: "dos.txt", datos: Buffer.from("segundo archivo") },
    { nombre: "uno.txt", datos: Buffer.from("repetido") },
  ], { fecha: new Date(2026, 7, 17, 12, 30, 0) });

  test("empieza por la firma de un ZIP y acaba por su índice", () => {
    assert.equal(zip.readUInt32LE(0), 0x04034b50, "cabecera local");
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50, "fin del índice central");
    assert.equal(zip.readUInt16LE(zip.length - 22 + 8), 3, "tres entradas");
  });

  test("y lo abre `unzip`, que es el juez que importa", () => {
    // Escribir un formato binario «que parece bien» es fácil; que lo abra otro programa es lo
    // único que demuestra que está bien.
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    const f = join(dir, "p.zip");
    writeFileSync(f, zip);
    const listado = execFileSync("unzip", ["-l", f], { encoding: "utf8" });
    assert.match(listado, /uno\.txt/);
    assert.match(listado, /uno \(2\)\.txt/);
    assert.equal(execFileSync("unzip", ["-p", f, "dos.txt"], { encoding: "utf8" }), "segundo archivo");
    // `unzip -t` comprueba los CRC de todas las entradas: si alguno estuviera mal, salta aquí.
    assert.match(execFileSync("unzip", ["-t", f], { encoding: "utf8" }), /No errors detected/);
  });

  test("un ZIP vacío también es un ZIP válido", () => {
    const v = crearZip([]);
    assert.equal(v.length, 22);
    assert.equal(v.readUInt32LE(0), 0x06054b50);
  });
});
