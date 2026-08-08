// Genera el PDF semanal del cuadrante. Une el layout (puro) con el escritor de PDF.
//
// Recibe SIEMPRE una versión concreta —el borrador que se está editando o el snapshot
// congelado de una publicación— nunca "lo que hay ahora mismo". Un horario publicado tiene
// que producir el mismo documento dentro de dos años, aunque para entonces se haya
// renombrado un área o dado de baja a alguien.

import { crearDoc, nuevaPagina, texto, textoRotado, linea, rect, serializar, anchoTexto, A4_APAISADO, A3_APAISADO } from "./pdf-doc.js";
import { calcularLayout } from "./layout-semana.js";

const DIAS_NOMBRE = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const ddmm = (iso) => {
  const p = String(iso || "").split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : String(iso || "");
};
const fechaLegible = (iso) => {
  const p = String(iso || "").split("-");
  return p.length === 3 ? `${Number(p[2])} ${MESES[Number(p[1]) - 1]} ${p[0]}` : String(iso || "");
};

// datos: { local, lunes, dias, bloques, estado, version, publicadoEn }
export function construirPdfSemana(datos, { ahora, pagina = A4_APAISADO, permitirA3 = true } = {}) {
  const conNombres = { ...datos, nombresDia: DIAS_NOMBRE };
  let layout = calcularLayout(conNombres, { pagina });

  // Si con A4 se van tres o más páginas, es que hay tanta gente que el documento deja de
  // leerse de un vistazo. Antes de romperlo en trozos, se prueba con A3: sigue siendo una
  // hoja que se cuelga en la pared, y es lo que hace un cuadrante grande.
  if (permitirA3 && layout.paginas.length > 2) {
    const enA3 = calcularLayout(conNombres, { pagina: A3_APAISADO });
    if (enA3.paginas.length < layout.paginas.length) {
      layout = enA3;
      layout.avisos.push("Había demasiada gente para A4: se ha usado A3 para que siga siendo legible.");
    }
  }

  const publicado = datos.estado === "publicado";
  const doc = crearDoc({
    ancho: layout.pagina.ancho, alto: layout.pagina.alto, ahora,
    titulo: `Horario ${datos.local || ""} ${datos.lunes || ""}`,
    autor: "Familia del Amor",
  });

  layout.paginas.forEach((pl, i) => {
    const pg = nuevaPagina(doc);

    // Cabecera: quién, qué semana y en qué estado. Sin adornos: lo importante es el cuadro.
    texto(doc, pg, 46, 30, "FAMILIA DEL AMOR", { tam: 8.5, fuente: "negrita", color: [0.45, 0.45, 0.45] });
    texto(doc, pg, 46, 47, datos.local || "", { tam: 15, fuente: "negrita" });
    const der = layout.pagina.ancho - 22;
    const rango = `${fechaLegible(datos.dias?.[0])} – ${fechaLegible(datos.dias?.[6])}`;
    texto(doc, pg, der - anchoAprox(rango, 10.5), 30, rango, { tam: 10.5, color: [0.3, 0.3, 0.3] });
    // Que se vea de lejos si esto es un borrador: colgar un borrador en la cocina y que la
    // gente lo dé por bueno es el error más caro de todo el módulo.
    const sello = publicado ? `PUBLICADO · v${datos.version ?? 1}` : "BORRADOR — NO PUBLICADO";
    texto(doc, pg, der - anchoAprox(sello, 9, "negrita"), 47, sello,
      { tam: 9, fuente: "negrita", color: publicado ? [0.16, 0.42, 0.31] : [0.76, 0.27, 0.22] });
    if (layout.paginas.length > 1) {
      texto(doc, pg, der - anchoAprox(`Hoja ${i + 1} de ${layout.paginas.length}`, 8), 60,
        `Hoja ${i + 1} de ${layout.paginas.length}`, { tam: 8, color: [0.5, 0.5, 0.5] });
    }

    // Lateral vertical con la semana, como en el cuadrante de siempre.
    textoRotado(doc, pg, pl.lateral.x, pl.lateral.y,
      `SEMANA  ${ddmm(datos.dias?.[0])}  ${ddmm(datos.dias?.[6])}`,
      { tam: 9, fuente: "negrita", color: [0.45, 0.45, 0.45] });

    for (const r of pl.reglas) {
      if (r.tipo === "rect") rect(doc, pg, r.x, r.y, r.w, r.h, { relleno: r.relleno });
      else linea(doc, pg, r.x1, r.y1, r.x2, r.y2, { grosor: r.grosor || 0.5, color: [0.82, 0.80, 0.76] });
    }
    for (const t of pl.textos) {
      const x = t.centrado ? t.x - anchoAprox(t.txt, t.tam, t.fuente) / 2 : t.x;
      texto(doc, pg, x, t.y, t.txt, { tam: t.tam, fuente: t.fuente, color: t.color });
    }

    // Pie discreto con cuándo se generó: sirve para saber si alguien mira una copia vieja.
    const pie = `Generado ${String(ahora || "").slice(0, 16).replace("T", " ")}`;
    texto(doc, pg, 46, layout.pagina.alto - 12, pie, { tam: 7, color: [0.6, 0.6, 0.6] });
  });

  return { buffer: serializar(doc), layout, perdidos: doc.perdidos };
}

const anchoAprox = (txt, tam, fuente) => anchoTexto(txt, tam, fuente);

// Nombre de fichero útil y saneado.
export function nombreFichero({ local, lunes, domingo, version, estado }) {
  const limpio = String(local || "horario").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `horario-${limpio}-${lunes}_${domingo}-v${version ?? 1}${estado === "publicado" ? "" : "-borrador"}.pdf`;
}
