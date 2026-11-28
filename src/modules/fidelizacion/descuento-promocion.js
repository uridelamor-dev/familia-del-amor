import { rewardsCoincidenConPromo } from './promos.js';
import { rewardsAplicados } from './puntos.js';

function numero(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

// Se mide el descuento de las líneas identificadas por el código de la oferta.
// Los importes netos de IVA y los descuentos sin atribución quedan sin medir.
export function descuentoPromocionCentimos(factura, promo) {
  if (promo?.tipo !== 'oferta_agora' || !Array.isArray(factura?.InvoiceItems)) return null;
  const rewards = rewardsAplicados(factura);
  if (!rewardsCoincidenConPromo(promo, rewards)) return null;
  const codigos = new Set(rewards.map(r => r.Code));
  let total = 0;
  const medidos = new Set();
  for (const comprobante of factura.InvoiceItems) {
    if (!Array.isArray(comprobante?.Lines)) return null;
    for (const linea of comprobante.Lines) {
      if (!codigos.has(linea?.OfferCode)) continue;
      const precio = numero(linea.UnitPrice);
      const cantidad = numero(linea.Quantity);
      const importe = numero(linea.TotalAmount);
      const fijo = numero(linea.CashDiscount ?? 0);
      const tasa = numero(linea.DiscountRate ?? 0);
      if (comprobante.VatIncluded !== true || [precio,cantidad,importe,fijo,tasa].includes(null)
          || precio < 0 || cantidad <= 0 || importe < 0 || fijo < 0 || tasa < 0 || tasa > 1
          || (fijo > 0) === (tasa > 0)) return null;
      const bruto = Math.round(precio * cantidad * 100);
      const diferencia = bruto - Math.round(importe * 100);
      const declarado = fijo ? Math.round(fijo * 100) : Math.round(precio * cantidad * tasa * 100);
      if (!Number.isSafeInteger(diferencia) || diferencia <= 0 || diferencia !== declarado) return null;
      total += diferencia;
      medidos.add(linea.OfferCode);
    }
  }
  return medidos.size === codigos.size && Number.isSafeInteger(total) && total <= 2147483647 ? total : null;
}
