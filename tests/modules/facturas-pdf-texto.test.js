import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { construirPdf, facturaConTexto, contenidoDe, PIE } from "../helpers/pdf-falso.js";
import { readFileSync } from "node:fs";
import { extraerTextoPdf, componerPagina, pareceCapaDeTexto, bloqueTextoParaClaude }
  from "../../src/modules/facturas/pdf-texto.js";

// ── Fábrica de PDF de mentira ──────────────────────────────────────────────
// No se puede usar una librería (no se pueden añadir dependencias), así que los PDF de prueba
// se escriben a mano. Es además lo que se quiere probar: el lector tiene que entenderse con
// PDF de verdad, escritos por programas ajenos, no con los que generaría él mismo.

// La fábrica de PDF vive en `tests/helpers/pdf-falso.js`: la usa también el contraste de la
// fecha, y tenerla duplicada acabaría con dos fábricas que divergen.

// ── Lo básico ──────────────────────────────────────────────────────────────

describe("leer la capa de texto de un PDF", () => {
  test("de un PDF con texto se saca lo que PONE, no lo que parece: es la razón de existir del módulo", () => {
    const r = extraerTextoPdf(facturaConTexto([
      { x: 40, y: 780, t: "DISTRIBUCIONES GIRONA SL" },
      { x: 40, y: 760, t: "Factura numero 2026/00418" },
      { x: 40, y: 740, t: "NIF B17972860" },
    ]));
    assert.ok(r.hayTexto, "el PDF trae texto: " + r.motivo);
    assert.match(r.texto, /DISTRIBUCIONES GIRONA SL/);
    assert.match(r.texto, /2026\/00418/);
    assert.match(r.texto, /B17972860/);
  });

  test("el texto comprimido (que es como viene siempre) se lee igual", () => {
    const r = extraerTextoPdf(facturaConTexto([{ x: 40, y: 780, t: "Factura numero 2026/00418" }], { comprimir: true }));
    assert.ok(r.hayTexto, r.motivo);
    assert.match(r.texto, /2026\/00418/);
  });

  test("se respeta el orden de arriba abajo aunque el PDF pinte al revés", () => {
    const r = extraerTextoPdf(facturaConTexto([
      { x: 40, y: 700, t: "Segunda linea del documento" },
      { x: 40, y: 780, t: "Primera linea del documento" },
    ]));
    assert.ok(r.texto.indexOf("Primera") < r.texto.indexOf("Segunda"), "primero lo de arriba");
  });
});

// ── La disposición: es lo que distingue al emisor del receptor ─────────────

describe("la disposición se conserva", () => {
  test("dos bloques a la misma altura NO se pegan: el de la izquierda emite y el de la derecha recibe", () => {
    const r = extraerTextoPdf(facturaConTexto([
      { x: 40, y: 780, t: "DISTRIBUCIONES GIRONA SL" },
      { x: 340, y: 780, t: "Cliente: LA TAPETA BLANES" },
    ]));
    const linea = r.texto.split("\n").find((l) => l.includes("GIRONA"));
    assert.match(linea, /GIRONA SL\s{5,}Cliente/, "entre columnas tiene que quedar hueco, no un espacio");
  });

  test("las columnas de la tabla de líneas caen unas debajo de otras", () => {
    const r = extraerTextoPdf(facturaConTexto([
      { x: 40, y: 700, t: "GAMBA LANGOSTINERA 30/40" }, { x: 400, y: 700, t: "48,50" },
      { x: 40, y: 685, t: "ACEITE OLIVA VIRGEN EXTRA 5L" }, { x: 400, y: 685, t: "39,90" },
    ]));
    const filas = r.texto.split("\n").filter((l) => /GAMBA|ACEITE/.test(l));
    assert.equal(filas.length, 2);
    assert.equal(filas[0].indexOf("48,50"), filas[1].indexOf("39,90"), "los importes van en la misma columna");
  });

  test("un hueco vertical grande separa bloques, para que no parezca todo el mismo párrafo", () => {
    const r = extraerTextoPdf(facturaConTexto([
      { x: 40, y: 780, t: "Cabecera de la factura" },
      { x: 40, y: 600, t: "Detalle de las lineas" },
    ]));
    assert.match(r.texto, /Cabecera de la factura\n\nDetalle/);
  });
});

// ── Los casos que rompen un extractor ingenuo ──────────────────────────────

describe("cosas que hacen los PDF de verdad", () => {
  test("un PDF que pinta LETRA A LETRA no puede salir como «F a c t u r a»", () => {
    // Hay programas que emiten una orden de posición por glifo para ajustar el interletraje.
    const letras = "IMPORTE".split("").map((c, i) => ({ x: 40 + i * 5.6, y: 780, t: c }));
    const r = extraerTextoPdf(facturaConTexto(letras));
    assert.match(r.texto, /IMPORTE/, "las letras contiguas se pegan; solo el hueco real separa");
  });

  test("el kerning de un TJ tampoco parte las palabras por dentro", () => {
    const crudo = "[(Fac) -20 (tura) -15 (2026)] TJ";
    const pdf = construirPdf([
      "<</Type/Catalog/Pages 2 0 R>>",
      "<</Type/Pages/Kids[3 0 R]/Count 1>>",
      "<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
      { stream: `BT /F1 10 Tf 1 0 0 1 40 780 Tm ${crudo} ET\n` + contenidoDe(PIE) },
      "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]);
    const r = extraerTextoPdf(pdf);
    assert.match(r.texto, /Factura ?2026/, "un ajuste de -20/1000 de em no es un espacio");
  });

  test("lo que se pinta dentro de un formulario XObject también cuenta: muchas facturas van así", () => {
    const pdf = construirPdf([
      "<</Type/Catalog/Pages 2 0 R>>",
      "<</Type/Pages/Kids[3 0 R]/Count 1>>",
      "<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 5 0 R>>/XObject<</X1 6 0 R>>>>/Contents 4 0 R>>",
      { stream: "q 1 0 0 1 0 0 cm /X1 Do Q\n" + contenidoDe(PIE) },
      "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
      { dict: "/Type/XObject/Subtype/Form/BBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>",
        stream: contenidoDe([{ x: 40, y: 780, t: "PESCADOS DEL MARESME SL" }]) },
    ]);
    const r = extraerTextoPdf(pdf);
    assert.match(r.texto, /PESCADOS DEL MARESME SL/);
  });

  test("un PDF moderno guarda las páginas dentro de un flujo comprimido, y hay que abrirlo", () => {
    // Sin leer los /ObjStm, un PDF 1.5+ parece no tener ni páginas y se perdería el texto.
    const dicts = [
      "<</Type/Catalog/Pages 2 0 R>>",
      "<</Type/Pages/Kids[3 0 R]/Count 1>>",
      "<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
    ];
    let desp = 0;
    const pares = dicts.map((d, i) => { const p = `${i + 1} ${desp}`; desp += d.length + 1; return p; }).join(" ");
    const cabecera = pares + " ";
    const objstm = cabecera + dicts.join(" ");
    const primero = cabecera.length;
    const pdf = construirPdf([
      { dict: `/Type/ObjStm/N 3/First ${primero}`, stream: objstm, comprimir: true },
      "<</Nada true>>",
      "<</Nada true>>",
      { stream: contenidoDe([{ x: 40, y: 780, t: "CARNICAS TORDERA SA" }, ...PIE]) },
      "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]);
    const r = extraerTextoPdf(pdf);
    assert.ok(r.hayTexto, r.motivo);
    assert.match(r.texto, /CARNICAS TORDERA SA/);
  });
});

// ── Codificaciones: que un importe no se lea con letras de otro alfabeto ───

describe("cada byte se traduce con la fuente que dice el PDF", () => {
  test("una fuente con /Differences se decodifica con SU tabla, no con la del sistema", () => {
    const fuente = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding<</Differences[1/eacute 2/ntilde]>>>>";
    const r = extraerTextoPdf(facturaConTexto([{ x: 40, y: 780, crudo: "(Espa\\002a caf\\001)" }], { fuente }));
    assert.match(r.texto, /España café/);
  });

  test("el € de WinAnsi (byte 0x80) es un euro, no un carácter de control", () => {
    const r = extraerTextoPdf(facturaConTexto([{ x: 40, y: 780, crudo: "(Total 121,00 \\200)" }]));
    assert.match(r.texto, /121,00 €/);
  });

  test("una fuente Type0 se lee con el mapa /ToUnicode que trae el propio PDF", () => {
    const cmap = `/CIDInit /ProcSet findresource begin
begincmap
1 beginbfrange
<0003> <0005> <0041>
endbfrange
1 beginbfchar
<0010> <20AC>
endbfchar
endcmap end`;
    const fuente = "<</Type/Font/Subtype/Type0/BaseFont/AAAAAA+Arial/Encoding/Identity-H"
      + "/DescendantFonts[<</Subtype/CIDFontType2/DW 600>>]/ToUnicode 7 0 R>>";
    const r = extraerTextoPdf(facturaConTexto(
      [{ x: 40, y: 780, crudo: "<000300040005 0010>" }],
      { fuente, extraObjetos: [{ stream: cmap }] }));
    assert.match(r.texto, /ABC ?€/, "los códigos 3,4,5 son A,B,C y el 0x10 es el euro");
  });

  test("una Type0 SIN mapa no se inventa letras: sus códigos no son texto", () => {
    const fuente = "<</Type/Font/Subtype/Type0/BaseFont/AAAAAA+Arial/Encoding/Identity-H"
      + "/DescendantFonts[<</Subtype/CIDFontType2/DW 600>>]>>";
    const r = extraerTextoPdf(facturaConTexto([{ x: 40, y: 780, crudo: "<00030004>" }], { fuente }));
    assert.ok(r.texto.startsWith("Base imponible"), "mejor nada que un galimatías que parezca un dato");
    assert.doesNotMatch(r.texto, /[\u0000-\u0009\u000b-\u001f\ufffd]/, "y desde luego nada ilegible");
  });
});

// ── No leer nunca es peor que leer mal: el módulo no puede tumbar nada ─────

describe("cuando no hay nada que sacar, se dice y ya", () => {
  test("un PDF escaneado (solo imagen) no tiene capa de texto, y eso NO es un error", () => {
    const pdf = construirPdf([
      "<</Type/Catalog/Pages 2 0 R>>",
      "<</Type/Pages/Kids[3 0 R]/Count 1>>",
      "<</Type/Page/Parent 2 0 R/Resources<</XObject<</Im1 5 0 R>>>>/Contents 4 0 R>>",
      { stream: "q 595 0 0 842 0 0 cm /Im1 Do Q" },
      { dict: "/Type/XObject/Subtype/Image/Width 100/Height 100/Filter/DCTDecode", stream: "\xff\xd8\xff\xe0basura" },
    ]);
    const r = extraerTextoPdf(pdf);
    assert.equal(r.hayTexto, false);
    assert.equal(r.texto, "");
    assert.ok(r.motivo, "se dice por qué, para poder mirarlo en el log");
  });

  test("cuatro palabras sueltas de un sello o un pie no cuelan como capa de texto", () => {
    // Un escaneado suele traer algo de texto (la marca de agua del escáner). Mandarlo como si
    // fuera «el texto exacto de la factura» invita a fiarse de un trozo que no es la factura.
    assert.equal(pareceCapaDeTexto("Escaneado con CamScanner"), false);
    assert.equal(pareceCapaDeTexto(""), false);
  });

  test("una factura entera sí cuela", () => {
    assert.equal(pareceCapaDeTexto(
      "DISTRIBUCIONES GIRONA SL NIF B17972860 Factura 2026/00418 fecha 12/07/2026 "
      + "base imponible 100,00 cuota de IVA 21,00 total a pagar 121,00 euros"), true);
  });

  test("basura, un archivo vacío o un JPG no revientan: devuelven que no hay texto", () => {
    for (const entrada of [Buffer.alloc(0), null, Buffer.from("no soy un pdf"), Buffer.from([0xff, 0xd8, 0xff, 0xe0])]) {
      const r = extraerTextoPdf(entrada);
      assert.equal(r.hayTexto, false);
      assert.equal(r.texto, "");
    }
  });

  test("un PDF cortado por la mitad tampoco: se lee lo que se pueda o nada", () => {
    const entero = facturaConTexto([{ x: 40, y: 780, t: "DISTRIBUCIONES GIRONA SL" }]);
    const r = extraerTextoPdf(entero.subarray(0, Math.floor(entero.length * 0.6)));
    assert.equal(typeof r.hayTexto, "boolean");
  });

  test("un PDF cifrado se descarta antes de intentarlo: descomprimiría basura", () => {
    const pdf = Buffer.concat([
      facturaConTexto([{ x: 40, y: 780, t: "DISTRIBUCIONES GIRONA SL" }]),
      Buffer.from("\ntrailer <</Root 1 0 R/Encrypt 9 0 R>>\n%%EOF\n", "latin1"),
    ]);
    assert.equal(extraerTextoPdf(pdf).hayTexto, false);
  });
});

// ── Composición y bloque para el modelo ────────────────────────────────────

describe("componer la página", () => {
  test("sin trozos no hay texto", () => {
    assert.equal(componerPagina([]), "");
  });
  test("los trozos de la misma altura van a la misma línea aunque bailen un punto", () => {
    const t = componerPagina([
      { x: 10, y: 700.4, texto: "Concepto", size: 10, ancho: 40 },
      { x: 60, y: 700, texto: "Importe", size: 10, ancho: 35 },
    ]);
    assert.equal(t.split("\n").length, 1);
  });
});

describe("lo que se le manda al modelo", () => {
  test("va el texto y va dicho qué manda cuando la imagen y el texto no coinciden", () => {
    const b = bloqueTextoParaClaude("Factura 2026/00418");
    assert.match(b, /Factura 2026\/00418/);
    assert.match(b, /copia lo de aquí/, "para los números manda el texto: es exacto");
    assert.match(b, /manda el documento/, "para saber quién es quién manda la imagen");
    assert.match(b, /No inventes/, "y si no está en ninguna, no se rellena");
  });
});

// ── Cómo lo usa facturas.js ────────────────────────────────────────────────
// `facturas.js` importa pdf-lib, que aquí no está instalado, así que no se puede importar el
// módulo: se lee como texto. Vale la pena igual, porque lo que se blinda es que la capa de
// texto viaje JUNTO al documento y solo para PDF — mandar la capa sin el documento haría
// perder la disposición, que es justo lo que distingue al emisor del receptor.

describe("facturas.js manda la capa junto al documento", () => {
  const fuente = readFileSync(new URL("../../facturas.js", import.meta.url), "utf8");
  const cuerpo = fuente.slice(fuente.indexOf("export async function extraerDatosDocumento"),
                              fuente.indexOf("// ── Google Drive API"));

  test("el documento va siempre, y la capa de texto se añade sin sustituirlo", () => {
    assert.match(cuerpo, /const contenido = \[adjunto\]/);
    assert.match(cuerpo, /contenido\.push\(\{ type: "text", text: bloqueTextoParaClaude/);
    assert.match(cuerpo, /messages: \[\{ role: "user", content: contenido \}\]/);
  });

  test("solo se intenta con PDF: una foto no tiene capa de texto que sacar", () => {
    assert.match(cuerpo, /if \(isPdf\) \{[\s\S]*extraerTextoPdf\(buffer\)/);
  });

  test("las instrucciones de extracción siguen yendo las últimas", () => {
    assert.ok(cuerpo.lastIndexOf("promptExtraccion(") > cuerpo.indexOf("bloqueTextoParaClaude"));
  });

  test("y la capa de texto se GUARDA, no solo se manda", () => {
    // Es la única prueba determinista de qué año hay escrito en el papel. Tirarla dejaba la
    // comprobación de la fecha sin nada contra lo que contrastar.
    assert.match(cuerpo, /pistas = pistasDeFecha\(capa\.texto\)/);
  });
});
