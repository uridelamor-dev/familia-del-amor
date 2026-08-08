// Layout del cuadrante semanal. PURO: recibe los datos y devuelve posiciones. No escribe
// ni un byte de PDF, y por eso se puede probar de verdad — los tests interesantes van
// contra este objeto, no contra el fichero.
//
// EL PROBLEMA A RESOLVER: el martes hay 3 personas y el sábado 9. Un layout con filas de
// alto fijo deja el martes medio vacío y corta el sábado. Aquí cada fila mide lo que
// necesita el día más cargado, y si el total no cabe se va reduciendo por pasos hasta un
// SUELO DURO de 8 pt. Por debajo de ahí no se baja: es preferible una segunda página a un
// PDF que no se lee. El cuadrante se mira colgado en la pared de la cocina.

import { anchoTexto, recortar, A4_APAISADO } from "./pdf-doc.js";

export const SUELO_PT = 8;

const MARGEN = { arriba: 34, abajo: 26, izq: 46, der: 22 };
const ANCHO_LATERAL = 26;          // franja izquierda con "SEMANA …" en vertical
const ALTO_CABECERA = 40;          // título del documento
const ALTO_DIAS = 26;              // fila con LUNES…DOMINGO
const ALTO_TRAMO = 15;             // banda con MAÑANA / TARDE
const ALTO_AREA_MIN = 18;

const ESCALAS = [
  { nombre: 12, franja: 8.5, interlineado: 1.34, padding: 5 },
  { nombre: 11, franja: 8,   interlineado: 1.28, padding: 4 },
  { nombre: 10, franja: 7.5, interlineado: 1.22, padding: 3.5 },
  { nombre: 9,  franja: 7,   interlineado: 1.16, padding: 3 },
  { nombre: SUELO_PT, franja: 6.5, interlineado: 1.1, padding: 2.5 },
];

// Cuántas personas hay como máximo en una fila (área) mirando los 7 días.
function maxPorFila(area) {
  return Math.max(0, ...area.dias.map((d) => d.length));
}

// Alto que necesita un bloque entero (tramo) con una escala dada.
function altoBloque(bloque, esc) {
  let alto = ALTO_TRAMO;
  for (const area of bloque.areas) {
    const n = maxPorFila(area);
    const filas = Math.max(1, n);
    alto += Math.max(ALTO_AREA_MIN, filas * esc.nombre * esc.interlineado + esc.padding * 2);
  }
  return alto;
}

// Reparte los bloques en páginas SIN CORTAR NUNCA POR DENTRO DE UN ÁREA: si un bloque no
// cabe entero, se va a la página siguiente. Partir "SALA del sábado" a la mitad haría el
// documento inservible justo el día que más gente hay.
function repartirPaginas(bloques, esc, altoUtil) {
  const paginas = [[]];
  let usado = 0;
  for (const b of bloques) {
    const h = altoBloque(b, esc);
    if (usado > 0 && usado + h > altoUtil) { paginas.push([]); usado = 0; }
    paginas[paginas.length - 1].push(b);
    usado += h;
  }
  return paginas;
}

export function calcularLayout(datos, { pagina = A4_APAISADO, forzarEscala = null } = {}) {
  const bloques = (datos.bloques || []).filter((b) =>
    b.areas.some((a) => a.dias.some((d) => d.length))
  );
  const anchoUtil = pagina.ancho - MARGEN.izq - MARGEN.der;
  const anchoEtiqueta = 66;                                  // columna de SALA / COCINA
  const anchoDia = (anchoUtil - anchoEtiqueta) / 7;
  const altoUtil = pagina.alto - MARGEN.arriba - MARGEN.abajo - ALTO_CABECERA - ALTO_DIAS;

  // Se prueba de mayor a menor y se para en cuanto todo cabe en UNA página.
  let esc = ESCALAS[ESCALAS.length - 1];
  let paginas = null;
  for (const cand of (forzarEscala ? [forzarEscala] : ESCALAS)) {
    const rep = repartirPaginas(bloques, cand, altoUtil);
    if (rep.length === 1) { esc = cand; paginas = rep; break; }
    esc = cand; paginas = rep;                                // si ninguna cabe, queda la más pequeña
  }
  if (!paginas) paginas = repartirPaginas(bloques, esc, altoUtil);

  const avisos = [];
  if (paginas.length > 1) {
    avisos.push(`La semana no cabe en una hoja: se reparte en ${paginas.length} páginas, cortando por bloques enteros.`);
  }

  const salida = paginas.map((bloquesPag, idxPag) => {
    const celdas = [], reglas = [], textos = [];
    let y = MARGEN.arriba + ALTO_CABECERA;

    // Cabecera de días, repetida en cada página para que la segunda se entienda sola.
    (datos.dias || []).forEach((dia, i) => {
      const x = MARGEN.izq + anchoEtiqueta + i * anchoDia;
      textos.push({ x: x + anchoDia / 2, y: y + 11, txt: (datos.nombresDia || [])[i] || "", tam: 8.5, fuente: "negrita", centrado: true, color: [0.35, 0.35, 0.35] });
      textos.push({ x: x + anchoDia / 2, y: y + 22, txt: String(Number(String(dia).slice(-2))), tam: 12, fuente: "negrita", centrado: true });
      reglas.push({ tipo: "linea", x1: x, y1: y, x2: x, y2: y + ALTO_DIAS });
    });
    reglas.push({ tipo: "linea", x1: MARGEN.izq, y1: y + ALTO_DIAS, x2: pagina.ancho - MARGEN.der, y2: y + ALTO_DIAS, grosor: 1 });
    y += ALTO_DIAS;

    for (const bloque of bloquesPag) {
      reglas.push({ tipo: "rect", x: MARGEN.izq, y, w: anchoUtil, h: ALTO_TRAMO, relleno: [0.93, 0.93, 0.90] });
      textos.push({ x: MARGEN.izq + 5, y: y + 11, txt: (bloque.tramo && bloque.tramo.nombre) || "", tam: 9, fuente: "negrita" });
      y += ALTO_TRAMO;

      for (const area of bloque.areas) {
        const n = maxPorFila(area);
        const alto = Math.max(ALTO_AREA_MIN, Math.max(1, n) * esc.nombre * esc.interlineado + esc.padding * 2);
        textos.push({ x: MARGEN.izq + 5, y: y + esc.padding + esc.nombre, txt: (area.area && area.area.nombre) || "", tam: 8.5, fuente: "negrita", color: [0.4, 0.4, 0.4] });

        area.dias.forEach((gente, i) => {
          const x = MARGEN.izq + anchoEtiqueta + i * anchoDia;
          celdas.push({ x, y, w: anchoDia, h: alto, dia: (datos.dias || [])[i], area: area.area, tramo: bloque.tramo, personas: gente.length });
          gente.forEach((p, j) => {
            const ty = y + esc.padding + esc.nombre + j * esc.nombre * esc.interlineado;
            // La franja va delante y en gris, como en el papel: la mirada busca el nombre.
            let tx = x + 4;
            const anchoDisponible = anchoDia - 8;
            if (p.franja) {
              const wf = anchoTexto(p.franja, esc.franja, "normal");
              // Si el nombre no cabe al lado de la hora, la hora se pone encima.
              const cabeAlLado = wf + 3 + anchoTexto(p.nombre, esc.nombre, "negrita") <= anchoDisponible;
              if (cabeAlLado) {
                textos.push({ x: tx, y: ty, txt: p.franja, tam: esc.franja, color: [0.45, 0.45, 0.45] });
                tx += wf + 3;
              } else {
                textos.push({ x: tx, y: ty - esc.nombre * 0.62, txt: p.franja, tam: esc.franja - 0.5, color: [0.45, 0.45, 0.45] });
              }
            }
            textos.push({
              x: tx, y: ty, tam: esc.nombre, fuente: "negrita", tipo: "nombre",
              txt: recortar(p.nombre, Math.max(10, x + anchoDia - 4 - tx), esc.nombre, "negrita"),
            });
          });
          reglas.push({ tipo: "linea", x1: x, y1: y, x2: x, y2: y + alto });
        });
        reglas.push({ tipo: "linea", x1: MARGEN.izq, y1: y + alto, x2: pagina.ancho - MARGEN.der, y2: y + alto });
        y += alto;
      }
    }

    return {
      indice: idxPag, celdas, reglas, textos,
      lateral: { x: MARGEN.izq - ANCHO_LATERAL + 6, y: pagina.alto - MARGEN.abajo - 6 },
      limites: { x: MARGEN.izq, y: MARGEN.arriba, w: anchoUtil, h: y - MARGEN.arriba },
    };
  });

  return { escala: esc, paginas: salida, avisos, anchoDia, pagina };
}
