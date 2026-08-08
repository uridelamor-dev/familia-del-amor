// Escritor de PDF mínimo, sin dependencias. No sabe nada de horarios: solo sabe pintar
// texto, líneas y rectángulos, y serializar un PDF 1.4 válido.
//
// POR QUÉ A MANO: no se puede añadir ninguna dependencia npm (el lockfile apunta al
// firewall de Replit y un despliegue que falle al instalar es una caída). Con las fuentes
// base de PDF —que todo lector trae— y WinAnsiEncoding se cubre el castellano y el catalán
// sin incrustar nada. El fichero resultante pesa unos pocos KB.
//
// Es DETERMINISTA: con la misma entrada y el mismo `ahora` salen los mismos bytes, lo que
// permite congelar un hash en los tests y detectar cualquier cambio no intencionado.

import { aWinAnsi, literalPdf } from "./winansi.js";
import { anchoDe } from "./afm-helvetica.js";

export const A4_APAISADO = { ancho: 842, alto: 595 };
export const A3_APAISADO = { ancho: 1191, alto: 842 };

export function crearDoc({ ancho = A4_APAISADO.ancho, alto = A4_APAISADO.alto, titulo = "", autor = "", ahora } = {}) {
  return { ancho, alto, titulo, autor, ahora, paginas: [], perdidos: [] };
}

export function nuevaPagina(doc) {
  const pg = { ops: [] };
  doc.paginas.push(pg);
  return pg;
}

const n2 = (x) => (Math.round(Number(x) * 100) / 100).toString();

// El origen de coordenadas del PDF está ABAJO a la izquierda. Aquí se trabaja con `y`
// desde arriba, que es como se piensa un cuadrante, y se convierte al escribir.
const flip = (doc, y) => doc.alto - y;

export function texto(doc, pg, x, y, str, { tam = 10, fuente = "normal", color = [0, 0, 0] } = {}) {
  const { codigos, perdidos } = aWinAnsi(str);
  if (perdidos.length) doc.perdidos.push(...perdidos);
  pg.ops.push(
    `BT /${fuente === "negrita" ? "F2" : "F1"} ${n2(tam)} Tf ` +
    `${n2(color[0])} ${n2(color[1])} ${n2(color[2])} rg ` +
    `1 0 0 1 ${n2(x)} ${n2(flip(doc, y))} Tm ${literalPdf(codigos)} Tj ET`
  );
  return anchoDe(codigos, tam, fuente);
}

// Texto girado 90° a la izquierda, para el lateral "SEMANA …" del cuadrante.
export function textoRotado(doc, pg, x, y, str, { tam = 10, fuente = "normal", color = [0, 0, 0] } = {}) {
  const { codigos, perdidos } = aWinAnsi(str);
  if (perdidos.length) doc.perdidos.push(...perdidos);
  pg.ops.push(
    `BT /${fuente === "negrita" ? "F2" : "F1"} ${n2(tam)} Tf ` +
    `${n2(color[0])} ${n2(color[1])} ${n2(color[2])} rg ` +
    `0 1 -1 0 ${n2(x)} ${n2(flip(doc, y))} Tm ${literalPdf(codigos)} Tj ET`
  );
}

export function linea(doc, pg, x1, y1, x2, y2, { grosor = 0.5, color = [0.8, 0.8, 0.8] } = {}) {
  pg.ops.push(`${n2(color[0])} ${n2(color[1])} ${n2(color[2])} RG ${n2(grosor)} w ` +
    `${n2(x1)} ${n2(flip(doc, y1))} m ${n2(x2)} ${n2(flip(doc, y2))} l S`);
}

export function rect(doc, pg, x, y, w, h, { relleno = null, borde = null, grosor = 0.5 } = {}) {
  let op = "";
  if (relleno) op += `${n2(relleno[0])} ${n2(relleno[1])} ${n2(relleno[2])} rg `;
  if (borde) op += `${n2(borde[0])} ${n2(borde[1])} ${n2(borde[2])} RG ${n2(grosor)} w `;
  op += `${n2(x)} ${n2(flip(doc, y + h))} ${n2(w)} ${n2(h)} re `;
  op += relleno && borde ? "B" : relleno ? "f" : "S";
  pg.ops.push(op);
}

// Medir sin pintar: es lo que usa el layout para decidir tamaños.
export function anchoTexto(str, tam, fuente = "normal") {
  return anchoDe(aWinAnsi(str).codigos, tam, fuente);
}

// Recorta con "…" si no cabe. Devuelve el texto ya recortado.
export function recortar(str, anchoMax, tam, fuente = "normal") {
  if (anchoTexto(str, tam, fuente) <= anchoMax) return str;
  let s = String(str);
  while (s.length > 1 && anchoTexto(s + "…", tam, fuente) > anchoMax) s = s.slice(0, -1);
  return s + "…";
}

// ── Serialización ──────────────────────────────────────────────────────────
// Se construye la lista de objetos, se anotan los desplazamientos y se escribe la tabla
// xref. Un PDF sin xref correcta no lo abre nada.
export function serializar(doc) {
  const objetos = [];
  const push = (cuerpo) => { objetos.push(cuerpo); return objetos.length; };   // 1-indexado

  const idCatalogo = push(null);   // se rellena al final: necesita el id de Pages
  const idPaginas = push(null);
  const idFuente1 = push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const idFuente2 = push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const idInfo = push(null);

  const idsPagina = [];
  for (const pg of doc.paginas) {
    const contenido = pg.ops.join("\n");
    const idContenido = push(`<< /Length ${Buffer.byteLength(contenido, "latin1")} >>\nstream\n${contenido}\nendstream`);
    const idPag = push(
      `<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${n2(doc.ancho)} ${n2(doc.alto)}] ` +
      `/Resources << /Font << /F1 ${idFuente1} 0 R /F2 ${idFuente2} 0 R >> >> /Contents ${idContenido} 0 R >>`
    );
    idsPagina.push(idPag);
  }

  objetos[idCatalogo - 1] = `<< /Type /Catalog /Pages ${idPaginas} 0 R >>`;
  objetos[idPaginas - 1] = `<< /Type /Pages /Kids [${idsPagina.map((i) => `${i} 0 R`).join(" ")}] /Count ${idsPagina.length} >>`;
  const fecha = fechaPdf(doc.ahora);
  objetos[idInfo - 1] = `<< /Title ${literalPdf(aWinAnsi(doc.titulo).codigos)} /Author ${literalPdf(aWinAnsi(doc.autor).codigos)} ` +
    `/Producer (Familia del Amor) /CreationDate (${fecha}) >>`;

  const trozos = [];
  let pos = 0;
  const escribir = (txt) => { const b = Buffer.from(txt, "latin1"); trozos.push(b); pos += b.length; return b.length; };

  escribir("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets = [];
  objetos.forEach((cuerpo, i) => {
    offsets[i] = pos;
    escribir(`${i + 1} 0 obj\n${cuerpo}\nendobj\n`);
  });

  const inicioXref = pos;
  let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += String(off).padStart(10, "0") + " 00000 n \n";
  escribir(xref);
  escribir(`trailer\n<< /Size ${objetos.length + 1} /Root ${idCatalogo} 0 R /Info ${idInfo} 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);

  return Buffer.concat(trozos);
}

// D:AAAAMMDDHHmmSS+HH'mm'. `ahora` se inyecta para que el PDF sea reproducible.
function fechaPdf(ahora) {
  const iso = typeof ahora === "string" ? ahora : new Date(ahora || 0).toISOString();
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?/.exec(iso);
  if (!m) return "D:19700101000000Z";
  const off = !m[7] || m[7] === "Z" ? "Z" : `${m[7].slice(0, 3)}'${m[7].slice(4, 6)}'`;
  return `D:${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}${off}`;
}
