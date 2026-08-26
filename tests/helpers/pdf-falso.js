// PDF escritos a mano para los tests.
//
// A mano y no con una librería, por dos razones: no se pueden añadir dependencias npm, y un PDF
// generado por la misma librería que lo lee no prueba nada. Estos se parecen a los que escriben
// los programas de facturación ajenos, que es lo que hay que saber leer.
//
// Vive en `helpers/` porque lo usan dos pruebas distintas: la del lector de PDF y la del
// contraste de la fecha. Tenerlo duplicado acabaría con dos fábricas que divergen.
import zlib from "node:zlib";

export function construirPdf(objetos, { comprimirContenido = false } = {}) {
  const partes = ["%PDF-1.5\n"];
  objetos.forEach((obj, i) => {
    const num = i + 1;
    if (typeof obj === "string") { partes.push(`${num} 0 obj\n${obj}\nendobj\n`); return; }
    let datos = Buffer.from(obj.stream, "latin1");
    let extra = "";
    if (comprimirContenido || obj.comprimir) { datos = zlib.deflateSync(datos); extra = "/Filter/FlateDecode"; }
    partes.push(`${num} 0 obj\n<<${obj.dict || ""}${extra}/Length ${datos.length}>>\nstream\n`);
    partes.push(datos.toString("latin1"));
    partes.push("\nendstream\nendobj\n");
  });
  partes.push("trailer\n<</Root 1 0 R>>\n%%EOF\n");
  return Buffer.from(partes.join(""), "latin1");
}

/** Relleno con palabras y cifras suficientes para que el resultado cuente como capa de texto. */
export const PIE = [
  { x: 40, y: 200, t: "Base imponible sin impuestos incluidos" },
  { x: 400, y: 200, t: "100,00" },
  { x: 40, y: 185, t: "Cuota de IVA al veintiuno por ciento" },
  { x: 400, y: 185, t: "21,00" },
  { x: 40, y: 170, t: "Total factura a pagar en euros" },
  { x: 400, y: 170, t: "121,00" },
];

export function contenidoDe(items, fuente = "/F1") {
  return items.map((i) => `BT ${fuente} 10 Tf 1 0 0 1 ${i.x} ${i.y} Tm ${i.crudo || `(${i.t})`} Tj ET`).join("\n");
}

/**
 * Una factura de una página con las posiciones que se le pidan, más el pie de relleno.
 * El pie va SIEMPRE en Helvetica (/F1) y lo que se está probando en /F2: si la fuente rara se
 * usara también para el relleno, un fallo de decodificación dejaría la página entera vacía y el
 * test no distinguiría «se decodifica mal» de «no hay página».
 */
export function facturaConTexto(items, { fuente, extraObjetos = [], comprimir = false } = {}) {
  const dictFuente = fuente || "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>";
  return construirPdf([
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>",
    { stream: contenidoDe(items, "/F2") + "\n" + contenidoDe(PIE, "/F1"), comprimir },
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    dictFuente,
    ...extraObjetos,
  ]);
}
