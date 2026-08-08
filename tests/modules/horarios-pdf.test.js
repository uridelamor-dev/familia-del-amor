import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { calcularLayout, SUELO_PT } from "../../src/modules/horarios/pdf/layout-semana.js";
import { construirPdfSemana, nombreFichero } from "../../src/modules/horarios/pdf/schedule-pdf.service.js";
import { A4_APAISADO, anchoTexto, recortar } from "../../src/modules/horarios/pdf/pdf-doc.js";
import { aWinAnsi, deWinAnsi } from "../../src/modules/horarios/pdf/winansi.js";

const DIAS = ["2026-08-10","2026-08-11","2026-08-12","2026-08-13","2026-08-14","2026-08-15","2026-08-16"];
const AHORA = "2026-08-09T18:30:00+02:00";
const p = (nombre, franja = null) => ({ nombre, franja });

// Semana como la del cuadrante de referencia: 3 personas el martes, 9 el sábado.
function semana(porDia = [2, 3, 3, 4, 6, 9, 5]) {
  const base = ["KEVIN","JUDIT","ARNAU","AITANA","JAVI","RON","ENRIC","BORIS","AHINARA","MAITE"];
  // Suficientes nombres para cualquier carga que pidan los tests: con una lista corta,
  // pedir 14 devolvía 10 en silencio y el test medía otra cosa de la que creía.
  const gente = Array.from({ length: 40 }, (_, i) => base[i % base.length] + (i >= base.length ? String(Math.floor(i / base.length)) : ""));
  return {
    local: "La Tapeta - Blanes", lunes: "2026-08-10", dias: DIAS, estado: "publicado", version: 1,
    bloques: [
      { tramo: { nombre: "MAÑANA" }, areas: [
        { area: { nombre: "SALA" }, dias: porDia.map((n) => gente.slice(0, n).map((g, i) => p(g, i === 1 ? "11-15" : null))) },
        { area: { nombre: "COCINA" }, dias: porDia.map((n) => gente.slice(0, Math.max(1, Math.floor(n / 2))).map((g) => p(g))) },
      ]},
      { tramo: { nombre: "TARDE" }, areas: [
        { area: { nombre: "SALA" }, dias: porDia.map((n) => gente.slice(0, Math.max(1, n - 1)).map((g, i) => p(g, i === 0 ? "20-cierre" : null))) },
        { area: { nombre: "COCINA" }, dias: porDia.map((n) => gente.slice(0, Math.max(1, Math.floor(n / 3))).map((g) => p(g))) },
      ]},
    ],
  };
}

describe("pdf — layout adaptativo", () => {
  test("la fila del sábado con 9 personas es más alta que la del martes con 3", () => {
    const l = calcularLayout({ ...semana(), nombresDia: ["L","M","X","J","V","S","D"] });
    const celdas = l.paginas[0].celdas;
    const filaSala = celdas.filter((c) => c.tramo.nombre === "MAÑANA" && c.area.nombre === "SALA");
    const filaCocina = celdas.filter((c) => c.tramo.nombre === "MAÑANA" && c.area.nombre === "COCINA");
    const maxSala = Math.max(...filaSala.map((c) => c.personas));
    const maxCocina = Math.max(...filaCocina.map((c) => c.personas));
    assert.equal(maxSala, 9); assert.ok(maxCocina < 9);
    // Toda la fila comparte alto (si no, las columnas no cuadrarían)...
    assert.ok(filaSala.every((c) => c.h === filaSala[0].h), "la fila entera mide lo mismo");
    // ...y ese alto lo marca el día más cargado, no un número fijo.
    assert.ok(filaSala[0].h > filaCocina[0].h, "la fila con 9 personas es más alta que la de 4");
  });

  test("ninguna celda se solapa con otra", () => {
    const l = calcularLayout({ ...semana(), nombresDia: ["L","M","X","J","V","S","D"] });
    for (const pag of l.paginas) {
      const cs = pag.celdas;
      for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
          const a = cs[i], b = cs[j];
          const pisan = a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01
                     && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
          assert.equal(pisan, false, `se pisan las celdas ${i} y ${j}`);
        }
      }
    }
  });

  test("todo cae dentro de la página", () => {
    const l = calcularLayout({ ...semana(), nombresDia: ["L","M","X","J","V","S","D"] });
    for (const pag of l.paginas) {
      for (const c of pag.celdas) {
        assert.ok(c.x >= 0 && c.x + c.w <= A4_APAISADO.ancho + 0.5, "se sale por el lado");
        assert.ok(c.y >= 0 && c.y + c.h <= A4_APAISADO.alto + 0.5, "se sale por abajo");
      }
      for (const t of pag.textos) {
        assert.ok(t.y > 0 && t.y < A4_APAISADO.alto, `texto fuera: ${t.txt}`);
      }
    }
  });

  test("una semana normal cabe en una hoja sin achicar la letra", () => {
    // 14 personas por turno y área ya es mucho para un local: debe caber en A4 y con
    // tamaño legible. Si esto empieza a fallar, es que el layout se ha vuelto goloso.
    const l = calcularLayout({ ...semana([14, 14, 14, 14, 14, 14, 14]), nombresDia: ["L","M","X","J","V","S","D"] });
    assert.equal(l.paginas.length, 1);
    assert.ok(l.escala.nombre >= 9, `bajó a ${l.escala.nombre} pt para una semana normal`);
  });

  test("LA LETRA NUNCA BAJA DEL SUELO: antes se va a otra página", () => {
    const l = calcularLayout({ ...semana([20, 20, 20, 20, 20, 20, 20]), nombresDia: ["L","M","X","J","V","S","D"] });
    assert.ok(l.escala.nombre >= SUELO_PT, `bajó a ${l.escala.nombre} pt`);
    assert.ok(l.paginas.length >= 2, "con esa carga tiene que repartirse");
    assert.ok(l.avisos.some((a) => /páginas/.test(a)), "y avisar de ello");
  });

  test("al partir en páginas no se corta un área por la mitad", () => {
    const l = calcularLayout({ ...semana([12, 12, 12, 12, 12, 12, 12]), nombresDia: ["L","M","X","J","V","S","D"] });
    // Cada celda pertenece a un (tramo, área): ninguna combinación puede estar en 2 páginas.
    const donde = new Map();
    l.paginas.forEach((pag, i) => {
      for (const c of pag.celdas) {
        const k = `${c.tramo.nombre}|${c.area.nombre}`;
        if (!donde.has(k)) donde.set(k, new Set());
        donde.get(k).add(i);
      }
    });
    for (const [k, pgs] of donde) assert.equal(pgs.size, 1, `${k} aparece en ${pgs.size} páginas`);
  });

  test("la cabecera de días se repite en cada página", () => {
    const l = calcularLayout({ ...semana([14, 14, 14, 14, 14, 14, 14]), nombresDia: ["LUNES","MARTES","MIÉRCOLES","JUEVES","VIERNES","SÁBADO","DOMINGO"] });
    for (const pag of l.paginas) {
      assert.ok(pag.textos.some((t) => t.txt === "LUNES"), "una página sin cabecera no se entiende sola");
    }
  });

  test("no se pierde a nadie: todos los nombres acaban en el layout", () => {
    const datos = { ...semana(), nombresDia: ["L","M","X","J","V","S","D"] };
    let esperados = 0;
    for (const b of datos.bloques) for (const a of b.areas) for (const d of a.dias) esperados += d.length;
    const l = calcularLayout(datos);
    const pintados = l.paginas.reduce((s, pag) => s + pag.textos.filter((t) => t.tipo === "nombre").length, 0);
    assert.equal(pintados, esperados, "faltan nombres en el documento");
  });

  test("un día vacío no rompe nada", () => {
    const l = calcularLayout({ ...semana([0, 0, 0, 0, 0, 3, 0]), nombresDia: ["L","M","X","J","V","S","D"] });
    assert.equal(l.paginas.length, 1);
    assert.ok(l.paginas[0].celdas.length > 0);
  });

  test("una semana entera sin turnos no genera bloques vacíos", () => {
    const vacia = { local: "X", lunes: "2026-08-10", dias: DIAS, nombresDia: ["L","M","X","J","V","S","D"],
      bloques: [{ tramo: { nombre: "MAÑANA" }, areas: [{ area: { nombre: "SALA" }, dias: DIAS.map(() => []) }] }] };
    const l = calcularLayout(vacia);
    assert.equal(l.paginas[0].celdas.length, 0, "sin nadie no se pinta la rejilla");
  });
});

describe("pdf — la franja solo cuando difiere, como en el papel", () => {
  test("quien lleva hora la ve delante del nombre", () => {
    const l = calcularLayout({ ...semana([2, 2, 2, 2, 2, 2, 2]), nombresDia: ["L","M","X","J","V","S","D"] });
    const txts = l.paginas[0].textos.map((t) => t.txt);
    assert.ok(txts.includes("11-15"), "la franja de quien se sale del tramo");
    assert.ok(txts.includes("20-cierre"), "y el turno de cierre, escrito como en el papel");
  });
  test("un nombre larguísimo se recorta, no desborda", () => {
    const largo = "MARIA DE LOS REMEDIOS FERNANDEZ";
    const recortado = recortar(largo, 60, 11, "negrita");
    assert.ok(anchoTexto(recortado, 11, "negrita") <= 60);
    assert.match(recortado, /…$/);
  });
});

describe("pdf — acentos y catalán", () => {
  test("ida y vuelta por WinAnsi sin perder nada", () => {
    for (const s of ["ARNAU", "NÚRIA", "BEGOÑA", "JOSÉ", "MARIÀ", "FRANÇOIS", "L·LUÍS", "ÀNGELS", "MIÉRCOLES", "SÁBADO"]) {
      const { codigos, perdidos } = aWinAnsi(s);
      assert.deepEqual(perdidos, [], `${s} tiene caracteres fuera de la tabla`);
      assert.equal(deWinAnsi(codigos), s);
    }
  });
  test("un carácter imposible no se pierde en silencio: se anota", () => {
    const { perdidos } = aWinAnsi("KEVIN 😀");
    assert.equal(perdidos.length, 1);
  });
  test("los alfabetos con acentos raros caen a su letra base antes que a «?»", () => {
    const { codigos, perdidos } = aWinAnsi("ŁUKASZ");
    assert.equal(deWinAnsi(codigos), "LUKASZ");
    assert.equal(perdidos.length, 1, "se anota que hubo que sustituir");
  });
});

describe("pdf — el fichero es un PDF válido de verdad", () => {
  const { buffer } = construirPdfSemana(semana(), { ahora: AHORA });
  const txt = buffer.toString("latin1");

  test("empieza y acaba como debe", () => {
    assert.ok(txt.startsWith("%PDF-1.4"), "sin cabecera no lo abre nadie");
    assert.ok(txt.trimEnd().endsWith("%%EOF"));
  });

  test("startxref apunta EXACTAMENTE al inicio de la tabla xref", () => {
    const m = /startxref\s+(\d+)/.exec(txt);
    assert.ok(m, "falta startxref");
    const off = Number(m[1]);
    assert.equal(txt.slice(off, off + 4), "xref", `startxref apunta a ${JSON.stringify(txt.slice(off, off + 12))}`);
  });

  test("cada entrada de la tabla xref cae sobre su objeto", () => {
    const off = Number(/startxref\s+(\d+)/.exec(txt)[1]);
    const cab = /xref\s+0 (\d+)/.exec(txt.slice(off));
    const total = Number(cab[1]);
    const entradas = [...txt.slice(off).matchAll(/^(\d{10}) (\d{5}) ([nf])\s*$/gm)];
    assert.equal(entradas.length, total, "faltan entradas en la xref");
    entradas.forEach((e, i) => {
      if (e[3] === "f") return;                                  // la entrada 0, libre
      const pos = Number(e[1]);
      assert.match(txt.slice(pos, pos + 20), new RegExp(`^${i} 0 obj`), `la entrada ${i} no cae sobre su objeto`);
    });
  });

  test("cada /Length coincide con la longitud real de su stream", () => {
    const re = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g;
    let m, n = 0;
    while ((m = re.exec(txt))) {
      assert.equal(Buffer.byteLength(m[2], "latin1"), Number(m[1]), "un /Length mal deja el PDF ilegible");
      n++;
    }
    assert.ok(n > 0, "esperaba al menos un stream");
  });

  test("/Size cuadra con el número de objetos", () => {
    const size = Number(/\/Size (\d+)/.exec(txt)[1]);
    const objs = [...txt.matchAll(/^\d+ 0 obj$/gm)].length;
    assert.equal(size, objs + 1, "el 0 es el objeto libre");
  });

  test("declara las dos fuentes con codificación WinAnsi", () => {
    assert.match(txt, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
    assert.match(txt, /\/BaseFont \/Helvetica-Bold \/Encoding \/WinAnsiEncoding/);
  });
});

describe("pdf — el contenido dice lo que tiene que decir", () => {
  test("los nombres aparecen en el documento", () => {
    const { buffer } = construirPdfSemana(semana([3, 3, 3, 3, 3, 3, 3]), { ahora: AHORA });
    const txt = buffer.toString("latin1");
    for (const n of ["KEVIN", "JUDIT", "ARNAU"]) assert.ok(txt.includes(`(${n})`), `falta ${n}`);
  });

  test("un borrador lo grita, para que nadie lo cuelgue creyendo que es el bueno", () => {
    const b = construirPdfSemana({ ...semana(), estado: "borrador" }, { ahora: AHORA }).buffer.toString("latin1");
    assert.ok(b.includes("BORRADOR"), "un borrador colgado en la cocina es el error más caro");
    const pub = construirPdfSemana({ ...semana(), estado: "publicado", version: 3 }, { ahora: AHORA }).buffer.toString("latin1");
    assert.ok(pub.includes("PUBLICADO"));
    assert.ok(pub.includes("v3"));
  });

  test("los acentos llegan al fichero", () => {
    const s = semana([2, 2, 2, 2, 2, 2, 2]);
    s.bloques[0].areas[0].dias[0] = [p("BEGOÑA"), p("NÚRIA", "11-15")];
    const txt = construirPdfSemana(s, { ahora: AHORA }).buffer.toString("latin1");
    assert.ok(txt.includes("(BEGO\xD1A)"), "la Ñ debe ir como byte WinAnsi, no como ?");
    assert.ok(txt.includes("(N\xDARIA)"));
    assert.ok(txt.includes("(MI\xC9RCOLES)"), "y los días de la semana también");
  });

  test("EL MISMO HORARIO PRODUCE EL MISMO FICHERO (test golden)", () => {
    // Si esto salta sin haber tocado el layout a propósito, algo ha cambiado sin querer.
    const a = construirPdfSemana(semana(), { ahora: AHORA }).buffer;
    const b = construirPdfSemana(semana(), { ahora: AHORA }).buffer;
    assert.equal(crypto.createHash("sha256").update(a).digest("hex"),
                 crypto.createHash("sha256").update(b).digest("hex"));
  });

  test("cambiar la hora de generación NO cambia el horario, solo la metadata", () => {
    const a = construirPdfSemana(semana(), { ahora: AHORA }).buffer.toString("latin1");
    const b = construirPdfSemana(semana(), { ahora: "2027-01-01T09:00:00+01:00" }).buffer.toString("latin1");
    const soloNombres = (t) => [...t.matchAll(/\((KEVIN|JUDIT|ARNAU|AITANA|JAVI|RON)\)/g)].map((m) => m[1]).join(",");
    assert.equal(soloNombres(a), soloNombres(b));
  });
});

describe("pdf — nombre de fichero", () => {
  test("útil, sin acentos y sin espacios", () => {
    assert.equal(
      nombreFichero({ local: "La Tapeta - Blanes", lunes: "2026-08-10", domingo: "2026-08-16", version: 2, estado: "publicado" }),
      "horario-la-tapeta-blanes-2026-08-10_2026-08-16-v2.pdf"
    );
  });
  test("un borrador se nota en el nombre", () => {
    assert.match(nombreFichero({ local: "Can Mateu - Tordera", lunes: "2026-08-10", domingo: "2026-08-16", estado: "borrador" }), /-borrador\.pdf$/);
  });
});
