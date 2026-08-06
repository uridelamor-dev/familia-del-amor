// Editor de la web pública — lógica pura.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { groupRegistry, fieldValue, saveKeyFor, missingLangs, parseGallery, serializeGallery, matchCampo, i18nKey } from "../../src/modules/web/web.service.js";

const REG = {
  locales: [{ slug: "la-tapeta-blanes", name: "La Tapeta Blanes" }, { slug: "cooperativa", name: "Cooperativa" }],
  campos: {
    hero_title: { label: "Título", section: "Hero", type: "text_i18n", scope: "global" },
    hero_image_url: { label: "Fondo", section: "Hero", type: "image", scope: "global" },
    gallery_images: { label: "Galería", section: "Galería", type: "gallery", scope: "global" },
    "local_la-tapeta-blanes_menu_pdf": { label: "Carta de La Tapeta Blanes", section: "La Tapeta Blanes", type: "pdf", scope: "local", local: "la-tapeta-blanes" },
    "local_la-tapeta-blanes_hours": { label: "Horario de La Tapeta Blanes", section: "La Tapeta Blanes", type: "text", scope: "local", local: "la-tapeta-blanes" },
    "local_cooperativa_gallery": { label: "Galería de Cooperativa", section: "Cooperativa", type: "gallery", scope: "local", local: "cooperativa" },
  },
};

describe("groupRegistry", () => {
  test("separa secciones globales y bloques por local (en orden)", () => {
    const g = groupRegistry(REG);
    assert.deepEqual(g.global.map((s) => s.section), ["Hero", "Galería"]);
    assert.equal(g.global[0].campos.length, 2); // hero_title + hero_image_url
    assert.deepEqual(g.locales.map((l) => l.slug), ["la-tapeta-blanes", "cooperativa"]);
    assert.equal(g.locales[0].campos.length, 2); // menu_pdf + hours
  });
  test("un local sin campos aparece igualmente (vacío)", () => {
    const g = groupRegistry({ locales: [{ slug: "x", name: "X" }], campos: {} });
    assert.equal(g.locales.length, 1); assert.equal(g.locales[0].campos.length, 0);
  });
});

describe("fieldValue / saveKeyFor (i18n)", () => {
  // Los campos, en uso real, llevan `key` (lo añade groupRegistry).
  const heroTitle = { key: "hero_title", ...REG.campos.hero_title };
  const hours = { key: "local_la-tapeta-blanes_hours", ...REG.campos["local_la-tapeta-blanes_hours"] };
  const content = { hero_title_es: "Hola", hero_title: "base", "local_la-tapeta-blanes_hours": "9-23" };
  test("i18n devuelve el valor del idioma; fallback a base", () => {
    assert.equal(fieldValue(content, heroTitle, "es"), "Hola");
    assert.equal(fieldValue(content, heroTitle, "ca"), "base"); // sin _ca → base
  });
  test("campo simple devuelve su valor", () => {
    assert.equal(fieldValue(content, hours, "es"), "9-23");
  });
  test("saveKeyFor añade sufijo solo en i18n", () => {
    assert.equal(saveKeyFor(heroTitle, "ca"), "hero_title_ca");
    assert.equal(saveKeyFor(hours, "ca"), "local_la-tapeta-blanes_hours");
  });
});

describe("missingLangs", () => {
  test("detecta idiomas sin traducir", () => {
    assert.deepEqual(missingLangs({ hero_title_es: "Hola" }, "hero_title"), ["ca", "en"]);
    assert.deepEqual(missingLangs({ hero_title: "base" }, "hero_title"), []); // base cubre todos
  });
});

describe("galería", () => {
  test("parse/serialize ida y vuelta, limpia vacíos", () => {
    const urls = parseGallery("/a.jpg\n  /b.jpg  \n\n/c.jpg");
    assert.deepEqual(urls, ["/a.jpg", "/b.jpg", "/c.jpg"]);
    assert.equal(serializeGallery(urls), "/a.jpg\n/b.jpg\n/c.jpg");
  });
});

describe("matchCampo", () => {
  test("filtra por etiqueta o key", () => {
    assert.ok(matchCampo(REG.campos.hero_title, "título"));
    assert.ok(matchCampo({ key: "hero_title", label: "T" }, "hero"));
    assert.ok(!matchCampo({ key: "x", label: "y" }, "zzz"));
    assert.ok(matchCampo({ key: "x", label: "y" }, "")); // sin query pasa todo
  });
  test("i18nKey", () => { assert.equal(i18nKey("a", "ca"), "a_ca"); });
});
