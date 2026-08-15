// Facturas — el mismo proveedor metido varias veces. Lógica PURA.
//
// EL PROBLEMA: «GRAU», «Vins i Licors Grau, S.A.» y «VINS I LICORS GRAU SA» son la misma
// empresa, y salen como tres proveedores distintos. Hay que etiquetarlos tres veces, el gasto
// sale partido en tres y «cuánto le compro a Grau» no se puede contestar.
//
// `claveProveedor` ya junta las variantes de ESCRITURA del mismo nombre («GRAU, S.L.» con
// «Grau»). Lo que no puede es saber que «GRAU» y «Vins i Licors Grau, S.A.» son lo mismo:
// como texto no se parecen en nada.
//
// LA SEÑAL BUENA ES EL NIF. Dos proveedores con el mismo NIF son la misma empresa — no «se
// parecen»: lo son, con el número de identificación fiscal delante. Por eso el NIF manda y el
// parecido de nombre es solo el segundo criterio, para los que no lo traen.
//
// Y AUN ASÍ NO SE UNE SOLO. Unir dos proveedores reescribe todas sus facturas: si se
// equivocara, deshacerlo es ir factura por factura. Se propone y decide una persona, igual que
// con los productos.

import { claveProveedor } from "./categorias.js";
import { distancia } from "./duplicados.js";

const limpiaNif = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Un NIF español válido de forma: letra o dígito + 7-8 caracteres. No valida la letra. */
export function nifUtil(nif) {
  const n = limpiaNif(nif);
  return n.length >= 8 && n.length <= 10 ? n : null;
}

/**
 * Cuánto se parecen dos nombres de empresa, de 0 a 100. Se compara sobre la clave —sin formas
 * jurídicas ni puntuación—, porque «S.L.» no distingue a nadie.
 *
 * Una palabra compartida NO basta: «Distribuciones Martínez» y «Distribuciones Gómez»
 * comparten «distribuciones» y son dos empresas. Se exige que compartan lo que las nombra.
 */
export function parecidoNombre(a, b) {
  const ca = claveProveedor(a), cb = claveProveedor(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 100;

  const pa = ca.split(" ").filter(Boolean), pb = cb.split(" ").filter(Boolean);
  const comunes = pa.filter((p) => pb.includes(p) && p.length > 3).length;
  const base = Math.round((comunes / Math.max(pa.length, pb.length)) * 100);

  // Una letra bailada en un nombre largo es un error de lectura, no otra empresa.
  const casi = ca.length > 8 && distancia(ca, cb, 2) <= 2 ? 85 : 0;
  return Math.max(base, casi);
}

/** A partir de aquí se propone unir por nombre. Por debajo, ni se enseña. */
export const MINIMO_NOMBRE = 60;

/**
 * Los proveedores que son el mismo, agrupados.
 *
 * `filas` = [{ proveedor, nif, facturas, gasto }] — una por forma de escribirlo, ya agregada.
 * Devuelve grupos de 2 o más, con el motivo y con cuál conviene quedarse.
 */
export function gruposDuplicados(filas = [], { minimo = MINIMO_NOMBRE } = {}) {
  const items = (filas || [])
    .filter((f) => f && f.proveedor)
    .map((f) => ({ ...f, clave: claveProveedor(f.proveedor), nif: nifUtil(f.nif) }))
    .filter((f) => f.clave);

  // Una fila por CLAVE: las variantes de escritura del mismo nombre ya las junta la clave, y
  // enseñarlas como duplicados sería pedir que se decida algo que ya está decidido.
  const porClave = new Map();
  for (const it of items) {
    if (!porClave.has(it.clave)) { porClave.set(it.clave, { ...it, nombres: [it.proveedor] }); continue; }
    const g = porClave.get(it.clave);
    g.facturas = (Number(g.facturas) || 0) + (Number(it.facturas) || 0);
    g.gasto = Math.round(((Number(g.gasto) || 0) + (Number(it.gasto) || 0)) * 100) / 100;
    g.nif = g.nif || it.nif;
    if (!g.nombres.includes(it.proveedor)) g.nombres.push(it.proveedor);
    // Se enseña el nombre con el que más se le conoce: el de más facturas.
    if ((Number(it.facturas) || 0) > (Number(g.facturas) || 0) / 2) g.proveedor = g.proveedor;
  }
  const unicos = [...porClave.values()];

  // Unión-búsqueda: si A va con B y B con C, los tres son el mismo grupo.
  const padre = new Map(unicos.map((u) => [u.clave, u.clave]));
  const raiz = (k) => { while (padre.get(k) !== k) k = padre.get(k); return k; };
  const unir = (a, b) => { const ra = raiz(a), rb = raiz(b); if (ra !== rb) padre.set(ra, rb); };

  const motivos = new Map();
  const anota = (a, b, motivo) => { motivos.set(`${a}|${b}`, motivo); motivos.set(`${b}|${a}`, motivo); };

  // 1. Mismo NIF: no «se parecen», SON la misma empresa.
  const porNif = new Map();
  for (const u of unicos) {
    if (!u.nif) continue;
    if (!porNif.has(u.nif)) porNif.set(u.nif, []);
    porNif.get(u.nif).push(u);
  }
  for (const [nif, lista] of porNif) {
    for (let i = 1; i < lista.length; i++) {
      unir(lista[0].clave, lista[i].clave);
      anota(lista[0].clave, lista[i].clave, `mismo NIF ${nif}`);
    }
  }

  // 2. Nombres casi iguales, solo entre los que NO se contradicen por NIF: dos NIF distintos
  //    son dos empresas por mucho que se llamen parecido (una matriz y su filial, por ejemplo).
  for (let i = 0; i < unicos.length; i++) {
    for (let j = i + 1; j < unicos.length; j++) {
      const a = unicos[i], b = unicos[j];
      if (a.nif && b.nif && a.nif !== b.nif) continue;
      if (raiz(a.clave) === raiz(b.clave)) continue;
      if (parecidoNombre(a.proveedor, b.proveedor) < minimo) continue;
      unir(a.clave, b.clave);
      anota(a.clave, b.clave, "se escriben casi igual");
    }
  }

  const grupos = new Map();
  for (const u of unicos) {
    const r = raiz(u.clave);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(u);
  }

  return [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      // El que se queda: el que más facturas tiene, y a igualdad el nombre más largo —que
      // suele ser el completo («Vins i Licors Grau, S.A.») y no la abreviatura («GRAU»).
      const orden = [...g].sort((a, b) =>
        (Number(b.facturas) || 0) - (Number(a.facturas) || 0) ||
        String(b.proveedor).length - String(a.proveedor).length);
      const nifs = [...new Set(g.map((x) => x.nif).filter(Boolean))];
      return {
        sugerido: orden[0],
        otros: orden.slice(1),
        motivo: nifs.length === 1 ? `mismo NIF ${nifs[0]}` : "se escriben casi igual",
        facturas: g.reduce((s, x) => s + (Number(x.facturas) || 0), 0),
        gasto: Math.round(g.reduce((s, x) => s + (Number(x.gasto) || 0), 0) * 100) / 100,
      };
    })
    .sort((a, b) => b.gasto - a.gasto);
}
