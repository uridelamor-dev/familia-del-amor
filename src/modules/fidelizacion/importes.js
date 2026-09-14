// Proyección de importes de una factura de prueba. PURO: sin BD, sin Express, sin red.
//
// ⚠️ HERRAMIENTA DE OBSERVACIÓN, TEMPORAL. Existe para una sola cosa: mirar cinco facturas de
// prueba y averiguar qué campo de Ágora contiene el importe que de verdad se paga. Hoy no lo
// sabemos, y sin saberlo no se puede calcular ni un punto. Cuando la Fase de puntos esté
// validada, esto se borra.
//
// AQUÍ NO SE CALCULA NADA. Ni puntos, ni bases, ni totales derivados. Se enseñan los campos tal
// como llegan, uno al lado del otro, para poder compararlos contra el importe que ya sabíamos
// que esperábamos. La tentación de «ya que estoy, sumo» es exactamente lo que hay que evitar:
// sumar sin saber qué se suma es cómo se dan puntos mal.
//
// ── LA REGLA QUE HACE QUE ESTO SEA SEGURO ────────────────────────────────────────────────────
//
// SE RECORRE LA LISTA DE RUTAS PERMITIDAS, NUNCA EL DOCUMENTO.
//
// Es al revés de lo natural, y es deliberado. Si se recorriera el JSON tapando lo sensible, un
// campo nuevo de Ágora —un `Customer.Phone`, una nota, un dato fiscal— aparecería solo el día que
// lo añadieran, y nadie se enteraría hasta leerlo en una pantalla. Recorriendo la lista, lo que
// no está escrito aquí abajo NO SE VISITA: no se lee, no se tapa, no se cuenta. No existe.
//
// Y por eso lo que no coincide se OMITE en vez de devolverse redactado: un «[redactado]» dice que
// ahí hay algo, y eso ya es información.

/**
 * La lista cerrada. Cada entrada es una ruta; `[]` marca un array que se recorre entero.
 *
 * Sale de la Guía del Integrador (páginas 147-156 para la factura y sus líneas, 149 para
 * `Workplace`). `ProductName` entra porque sin él no se reconocen los productos de nuestras
 * propias pruebas. `Pos.Id` y `Pos.Name` NO entran: `Workplace` es la identidad del local, `Pos`
 * es el terminal concreto, y para lo que se mira aquí no hace falta saber en qué caja se cobró.
 */
export const RUTAS = Object.freeze([
  // ── El documento ──────────────────────────────────────────────────────────
  "DocumentType",
  "RefundSource",
  "RelatedInvoice.Serie",
  "RelatedInvoice.Number",
  "Workplace.Id",
  "Workplace.Name",

  // ── Los comprobantes ──────────────────────────────────────────────────────
  "InvoiceItems[].VatIncluded",
  "InvoiceItems[].GlobalId",            // ← NUNCA entero: ver GLOBAL_ID_PISTA
  "InvoiceItems[].Discounts.DiscountRate",
  "InvoiceItems[].Discounts.CashDiscount",
  "InvoiceItems[].Totals[].GrossAmount",
  "InvoiceItems[].Totals[].NetAmount",
  "InvoiceItems[].Totals[].VatAmount",

  // ── Las líneas ────────────────────────────────────────────────────────────
  "InvoiceItems[].Lines[].Index",
  "InvoiceItems[].Lines[].ProductId",
  "InvoiceItems[].Lines[].ProductName",
  "InvoiceItems[].Lines[].Quantity",
  "InvoiceItems[].Lines[].ProductPrice",
  "InvoiceItems[].Lines[].UnitPrice",
  "InvoiceItems[].Lines[].DiscountRate",
  "InvoiceItems[].Lines[].CashDiscount",
  "InvoiceItems[].Lines[].TotalAmount",
  "InvoiceItems[].Lines[].OfferId",
  "InvoiceItems[].Lines[].OfferCode",

  // ── Los pagos ─────────────────────────────────────────────────────────────
  // Los seis van juntos y por separado a propósito: la guía define `Amount` como la diferencia
  // entre `PaidAmount` y `ChangeAmount`, y no dice si `Tip` está dentro de los totales. Esto se
  // resuelve mirando, no razonando.
  "Payments[].MethodId",
  "Payments[].Amount",
  "Payments[].PaidAmount",
  "Payments[].ChangeAmount",
  "Payments[].Tip",
  "Payments[].IsPrepayment",

  // ── Los totales del documento ─────────────────────────────────────────────
  "Totals[].GrossAmount",
  "Totals[].NetAmount",
  "Totals[].VatAmount",
]);

/** La única ruta que no se devuelve tal cual: de ella sale una pista de ocho caracteres. */
export const GLOBAL_ID_PISTA = "InvoiceItems[].GlobalId";

/** Campos que NO pueden aparecer jamás. No se usa para filtrar —la lista blanca ya lo impide—
 *  sino para que los tests tengan algo concreto contra lo que comprobarlo. */
export const PROHIBIDOS = Object.freeze([
  "MemberId", "Customer", "User", "Phone", "Telefono", "Address", "Notes", "Note",
  "ExtraInformation", "TaxId", "VatNumber", "Email", "LoyaltyProgram",
]);

/** Un tramo de ruta: `Lines[]` → { clave: "Lines", array: true }. */
const tramo = (t) => (t.endsWith("[]") ? { clave: t.slice(0, -2), array: true } : { clave: t, array: false });

/**
 * Resuelve una ruta contra el documento y devuelve cada coincidencia con sus índices.
 *
 * No lee ni una clave que no esté en la ruta: cada paso es un acceso por nombre exacto.
 */
function resolver(json, ruta) {
  let actual = [{ indices: [], valor: json }];
  for (const t of ruta.split(".").map(tramo)) {
    const siguiente = [];
    for (const { indices, valor } of actual) {
      if (valor === null || valor === undefined || typeof valor !== "object") continue;
      const hijo = Object.prototype.hasOwnProperty.call(valor, t.clave) ? valor[t.clave] : undefined;
      if (hijo === undefined) continue;
      if (t.array) {
        if (!Array.isArray(hijo)) continue;
        hijo.forEach((x, i) => siguiente.push({ indices: [...indices, i], valor: x }));
      } else {
        siguiente.push({ indices, valor: hijo });
      }
    }
    actual = siguiente;
  }
  // Solo escalares: si una ruta permitida apuntara a un objeto, devolverlo sacaría sus hijos,
  // que NO están en la lista. Se descarta en silencio.
  return actual.filter((x) => x.valor === null || typeof x.valor !== "object");
}

const mete = (destino, indices, clave, valor) => {
  let n = destino;
  for (const i of indices) { n[i] = n[i] || {}; n = n[i]; }
  n[clave] = valor;
};

/**
 * La proyección legible: documento, totales, pagos y comprobantes con sus líneas.
 *
 * `hash` se inyecta para la pista del `GlobalId`; así este módulo no depende de `crypto` y se
 * puede probar sin él.
 */
export function proyectarImportes(json, { hash }) {
  const doc = {};
  const totales = [];
  const pagos = [];
  const comprobantes = [];
  const encontradas = [];
  const ausentes = [];

  for (const ruta of RUTAS) {
    const hits = resolver(json, ruta);
    (hits.length ? encontradas : ausentes).push(ruta);

    for (const { indices, valor } of hits) {
      const hojas = ruta.split(".");
      const hoja = hojas[hojas.length - 1].replace(/\[\]$/, "");

      if (ruta === GLOBAL_ID_PISTA) {
        // Nunca entero. Ocho caracteres bastan para distinguir dos comprobantes de la misma
        // factura, que es lo único para lo que hace falta aquí.
        mete(comprobantes, indices, "GlobalId_pista", valor ? String(hash(String(valor))).slice(0, 8) : null);
        continue;
      }
      if (ruta.startsWith("Totals[]")) { mete(totales, indices, hoja, valor); continue; }
      if (ruta.startsWith("Payments[]")) { mete(pagos, indices, hoja, valor); continue; }
      if (ruta.startsWith("InvoiceItems[]")) {
        const [ci, ...resto] = indices;
        comprobantes[ci] = comprobantes[ci] || {};
        const c = comprobantes[ci];
        if (ruta.includes(".Lines[].")) { c.Lines = c.Lines || []; mete(c.Lines, resto, hoja, valor); }
        else if (ruta.includes(".Totals[].")) { c.Totals = c.Totals || []; mete(c.Totals, resto, hoja, valor); }
        else if (ruta.includes(".Discounts.")) { c.Discounts = c.Discounts || {}; c.Discounts[hoja] = valor; }
        else c[hoja] = valor;
        continue;
      }
      // Documento: la clave completa, para que `RelatedInvoice.Serie` no se confunda con otra.
      doc[ruta] = valor;
    }
  }

  const compacta = (a) => a.filter((x) => x !== undefined && x !== null);
  return {
    documento: doc,
    totales: compacta(totales),
    pagos: compacta(pagos),
    comprobantes: compacta(comprobantes).map((c) => ({ ...c, Lines: compacta(c.Lines || []), Totals: compacta(c.Totals || []) })),
    // Qué rutas de NUESTRA lista trae y cuáles no. No dice nada del documento más allá de eso,
    // y es justo lo que hace falta para saber qué campos manda de verdad este Ágora.
    rutas: { encontradas, ausentes },
  };
}
