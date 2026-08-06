// Facturas — autoasignación de local (lógica pura).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizarNif, normalizarTexto, resolverLocalERP, indexarHistorialProveedor, sugerirLocalPendiente } from "../../src/modules/facturas/asignacion.js";

const LOCALES = [
  { local: "La Tapeta - Blanes", empresa: "DEL AMOR URIEL SLU", cif: "B-1111", local_contable: "La Tapeta Blanes" },
  { local: "La Tapeta - Lloret", empresa: "DEL AMOR URIEL SLU", cif: "B-1111", local_contable: "La Tapeta Lloret" },
  { local: "Can Mateu - Tordera", empresa: "MATEU SL", cif: "B.2222", local_contable: "Can Mateu" },
];

describe("normalización", () => {
  test("normalizarNif quita espacios/guiones/puntos y sube a mayúsculas", () => {
    assert.equal(normalizarNif(" b-22.22 "), "B2222");
    assert.equal(normalizarNif(null), "");
  });
  test("normalizarTexto quita acentos, colapsa espacios y baja a minúsculas", () => {
    assert.equal(normalizarTexto("  AigüES  de Girona "), "aigues de girona");
    assert.equal(normalizarTexto(undefined), "");
  });
});

describe("resolverLocalERP", () => {
  test("casa por local_contable y devuelve el nombre ERP", () => {
    assert.equal(resolverLocalERP("La Tapeta Blanes", LOCALES), "La Tapeta - Blanes");
  });
  test("casa por nombre ERP directo", () => {
    assert.equal(resolverLocalERP("Can Mateu - Tordera", LOCALES), "Can Mateu - Tordera");
  });
  test("desconocido → devuelve tal cual", () => {
    assert.equal(resolverLocalERP("Otro Sitio", LOCALES), "Otro Sitio");
  });
});

describe("indexarHistorialProveedor", () => {
  test("marca unico=true cuando el proveedor siempre fue al mismo local", () => {
    const h = indexarHistorialProveedor([
      { proveedor: "Makro", local: "La Tapeta Blanes" },
      { proveedor: "makro", local: "La Tapeta Blanes" },
    ]);
    assert.equal(h["makro"].total, 2);
    assert.equal(h["makro"].unico, true);
    assert.equal(h["makro"].top, "La Tapeta Blanes");
  });
  test("unico=false y top = el más frecuente cuando hay varios locales", () => {
    const h = indexarHistorialProveedor([
      { proveedor: "Coca", local: "La Tapeta Blanes" },
      { proveedor: "Coca", local: "La Tapeta Lloret" },
      { proveedor: "Coca", local: "La Tapeta Lloret" },
    ]);
    assert.equal(h["coca"].unico, false);
    assert.equal(h["coca"].top, "La Tapeta Lloret");
  });
  test("ignora filas sin proveedor o sin local", () => {
    const h = indexarHistorialProveedor([{ proveedor: "", local: "X" }, { proveedor: "Y", local: null }]);
    assert.deepEqual(Object.keys(h), []);
  });
});

describe("sugerirLocalPendiente", () => {
  test("CIF del receptor con un único local → alta confianza", () => {
    const s = sugerirLocalPendiente({ pendiente: { nif_receptor: "B 2222" }, locales: LOCALES });
    assert.equal(s.local, "Can Mateu - Tordera");
    assert.equal(s.confianza, "alta");
    assert.equal(s.motivo, "CIF del receptor");
  });
  test("CIF compartido por varios locales → NO decide por CIF", () => {
    const s = sugerirLocalPendiente({ pendiente: { nif_receptor: "B1111" }, locales: LOCALES });
    assert.equal(s.local, null);
  });
  test("empresa receptora con un único local → alta confianza", () => {
    const s = sugerirLocalPendiente({ pendiente: { nombre_receptor: "MATEU SL" }, locales: LOCALES });
    assert.equal(s.local, "Can Mateu - Tordera");
    assert.equal(s.motivo, "Empresa receptora");
  });
  test("proveedor habitual (>=2 veces mismo local) → alta; devuelve nombre ERP", () => {
    const historial = indexarHistorialProveedor([
      { proveedor: "Aguas Font", local: "La Tapeta Blanes" },
      { proveedor: "Aguas Font", local: "La Tapeta Blanes" },
    ]);
    const s = sugerirLocalPendiente({ pendiente: { proveedor: "aguas font" }, locales: LOCALES, historial });
    assert.equal(s.local, "La Tapeta - Blanes");
    assert.equal(s.confianza, "alta");
    assert.equal(s.motivo, "Proveedor habitual");
  });
  test("proveedor habitual visto 1 sola vez → media (sugerir, no autoasignar)", () => {
    const historial = indexarHistorialProveedor([{ proveedor: "Nuevo Prov", local: "Can Mateu" }]);
    const s = sugerirLocalPendiente({ pendiente: { proveedor: "nuevo prov" }, locales: LOCALES, historial });
    assert.equal(s.local, "Can Mateu - Tordera");
    assert.equal(s.confianza, "media");
  });
  test("proveedor con locales mixtos → sin sugerencia", () => {
    const historial = indexarHistorialProveedor([
      { proveedor: "Coca", local: "La Tapeta Blanes" },
      { proveedor: "Coca", local: "La Tapeta Lloret" },
    ]);
    const s = sugerirLocalPendiente({ pendiente: { proveedor: "coca" }, locales: LOCALES, historial });
    assert.equal(s.local, null);
    assert.equal(s.confianza, null);
  });
  test("sin señales → null seguro (no revienta con entrada vacía)", () => {
    assert.deepEqual(sugerirLocalPendiente(), { local: null, confianza: null, motivo: "" });
    assert.deepEqual(sugerirLocalPendiente({ pendiente: {}, locales: [], historial: {} }), { local: null, confianza: null, motivo: "" });
  });
  test("prioridad: CIF manda sobre proveedor habitual", () => {
    const historial = indexarHistorialProveedor([{ proveedor: "Makro", local: "La Tapeta Blanes" }, { proveedor: "Makro", local: "La Tapeta Blanes" }]);
    const s = sugerirLocalPendiente({ pendiente: { nif_receptor: "B2222", proveedor: "makro" }, locales: LOCALES, historial });
    assert.equal(s.local, "Can Mateu - Tordera");
    assert.equal(s.motivo, "CIF del receptor");
  });
});
