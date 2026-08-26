// Facturas — repasar hacia atrás las que ya están guardadas. Lógica PURA.
//
// EL PROBLEMA: las comprobaciones que se han ido añadiendo —los descuentos por línea, los
// avisos de coherencia, la sospecha de duplicado— solo actúan sobre la factura que ENTRA. Las
// que ya estaban guardadas se quedaron como estaban, así que hay dos contabilidades: la de
// antes, sin revisar, y la de ahora. Y la de antes es la más grande.
//
// LA REGLA: el repaso deja las facturas viejas EXACTAMENTE como si hubieran entrado hoy. Ni
// más ni menos. Por eso el historial que se le pasa a cada comprobación es el de las facturas
// ANTERIORES a ella, no el de todas: si se usara todo, una factura vieja se compararía contra
// facturas que en su día no existían y saldrían avisos que nunca habrían saltado.
//
// Y NADA SE BORRA. En la entrada, una factura que se sabe repetida se rechaza antes de
// guardarse. Aquí no: las dos ya están dentro y ya han contado en los totales de un mes que
// alguien puede haber cerrado. Así que hasta la certeza se queda en «duda» y la decide una
// persona. Ver duplicados.js: el error de tirar una factura buena no se ve; el de contarla dos
// veces, tampoco. Pero solo uno de los dos se puede deshacer.

import { revisarCoherencia, textosDe } from "./coherencia.js";
import { revisarFecha } from "./fecha-documento.js";
import { buscarParecida, resumenMotivos } from "./duplicados.js";

/**
 * Versión del lector de líneas. Se sube cuando cambia lo que se SACA de la factura, no cuando
 * se toca el código: es lo que distingue «esta factura ya está leída con lo nuevo» de «hay que
 * volver a leerla». Sin este número habría que adivinarlo mirando las columnas, y una factura
 * que de verdad no tiene descuentos parecería eternamente pendiente de releer.
 *
 *   1 → lectura original (descripción, cantidad, precio, importe).
 *   2 → descuentos por línea: se guarda el precio NETO, y el bruto y el % aparte.
 */
export const VERSION_LINEAS = 2;

const normNombre = (s) => String(s || "").trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
const normNif = (s) => String(s || "").replace(/[\s.\-/]/g, "").toUpperCase();

/** Los estados de detalle en los que hay algo leído que se puede volver a leer. */
const LEIDAS = new Set(["ok", "dudas", "descuadre"]);

/**
 * ¿Hay que volver a pasar esta factura por el modelo?
 * Solo si su detalle se leyó con una versión anterior Y queda el archivo en Drive del que
 * releerlo. Las que nunca se leyeron son cosa del otro botón («Leer las que faltan»), y las
 * de gasto estructural no se leen a propósito.
 */
export function pideRelecturaDeLineas(f = {}, alcance = "faltan") {
  if (!f.drive_url) return false;
  if (!LEIDAS.has(String(f.lineas_estado || ""))) return false;

  // Que una factura esté marcada como leída con la versión de hoy NO garantiza que esté bien:
  // si la lectura se cortó, se guardaron las líneas que llegaron y quedó marcada igual. Por
  // eso hacen falta los otros dos alcances.
  if (alcance === "todas") return true;
  // Las que no cuadran con su base imponible: es justo la huella que deja una lectura
  // incompleta, y son pocas — releerlas cuesta poco y es donde está casi todo el fallo.
  if (alcance === "descuadre") return String(f.lineas_estado) === "descuadre";
  return Number(f.lineas_version || 1) < VERSION_LINEAS;
}

/** Los alcances que se pueden pedir, con lo que significan de verdad. */
export const ALCANCES_REPASO = [
  { clave: "faltan", label: "Las que faltan", ayuda: "Solo las que no han pasado por la versión de hoy. Es lo normal." },
  { clave: "descuadre", label: "Las que no cuadran", ayuda: "Las que tienen líneas que no suman su base imponible: es la huella que deja una lectura incompleta." },
  { clave: "todas", label: "Todas, otra vez", ayuda: "Vuelve a leer todas, aunque estén al día. Tarda y cuesta: una descarga y una lectura por factura." },
];
export const esAlcanceValido = (a) => ALCANCES_REPASO.some((x) => x.clave === String(a || ""));

/** Los textos de aviso que tiene guardados una factura (la columna `revisar` es JSON). */
export function avisosGuardados(fila = {}) {
  try {
    const a = JSON.parse(fila.revisar || "[]");
    return Array.isArray(a) ? a.map(String) : [];
  } catch { return []; }
}

/**
 * Una fila de la BD hablada en el idioma de las comprobaciones. La columna se llama `nif` y
 * ahí está el del PROVEEDOR (el del receptor no se guarda en la factura ya procesada); las
 * comprobaciones esperan `nif_proveedor`. Sin esta traducción el aviso de «NIF distinto del de
 * siempre» no saltaría nunca en el repaso, y es de los que más pesan.
 */
export function comoDocumento(fila = {}) {
  return {
    proveedor: fila.proveedor,
    nif_proveedor: fila.nif,
    fecha: fila.fecha,
    numero_factura: fila.numero_factura,
    // Para poder repasar también la FECHA hacia atrás. `vencimiento` solo cuenta si se leyó del
    // papel, y `concepto` es lo que distingue un abono —donde una fecha vieja es normal—.
    vencimiento: fila.vencimiento,
    concepto: fila.concepto,
    tipo: fila.tipo,
    base_imponible: fila.base_imponible,
    porcentaje_iva: fila.porcentaje_iva,
    cuota_iva: fila.cuota_iva,
    total: fila.total,
  };
}

/** Los años que había escritos en el PDF, guardados al dar de alta. */
function pistasGuardadas(fila) {
  if (!fila || !fila.fecha_pistas) return null;
  try { const p = typeof fila.fecha_pistas === "string" ? JSON.parse(fila.fecha_pistas) : fila.fecha_pistas;
    return p && p.hayTexto ? p : null; } catch { return null; }
}

const mismosTextos = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Repasa un conjunto de facturas YA GUARDADAS y dice qué habría que cambiar. No toca nada:
 * devuelve la lista de cambios para que quien llama decida si los aplica. Así se puede enseñar
 * antes lo que va a pasar, que con algo que aparta facturas de los totales no es un lujo.
 *
 * `filas` deben venir ORDENADAS POR ID ASCENDENTE (que es el orden en que entraron).
 *
 *   → { revisiones: [...], sospechas: [...] }
 *
 * revisiones: facturas cuyos avisos de coherencia cambian (aparecen, cambian o desaparecen).
 * sospechas:  facturas que se parecen demasiado a otra ANTERIOR y habría que apartar.
 */
export function repasarLote(filas = [], { ventanaDias = 10, maxHistorial = 40, hoy = null } = {}) {
  const revisiones = [];
  const sospechas = [];
  const fechas = [];

  // Historial por proveedor, que se va construyendo según se avanza: cuando le toca a una
  // factura, dentro solo están las que entraron antes que ella.
  const previasPorNombre = new Map();
  const previasPorNif = new Map();
  const empujar = (mapa, clave, fila) => {
    if (!clave) return;
    const l = mapa.get(clave) || [];
    l.push(fila);
    mapa.set(clave, l);
  };

  for (const f of filas) {
    const nombre = normNombre(f.proveedor);
    const nif = normNif(f.nif);

    // Candidatas: las anteriores del mismo proveedor, por nombre y por NIF. Hacen falta las
    // dos listas porque el mismo proveedor viene unas veces con NIF y otras sin él, y
    // buscándolo solo por una de las dos se escapan justo las parejas mal leídas.
    const vistas = new Set();
    const candidatas = [];
    for (const l of [previasPorNombre.get(nombre), previasPorNif.get(nif)]) {
      for (const c of l || []) { if (!vistas.has(c.id)) { vistas.add(c.id); candidatas.push(c); } }
    }

    // 1) Coherencia, contra las anteriores de ese proveedor (las últimas 40, como en la entrada).
    const previas = candidatas.slice(-maxHistorial);
    const historial = {
      nifs: previas.map((x) => normNif(x.nif)).filter(Boolean),
      totales: previas.map((x) => x.total),
      fechas: previas.map((x) => x.fecha).filter(Boolean),
    };
    const doc = comoDocumento(f);
    const r = revisarCoherencia(doc, historial);
    // Y LA FECHA. Se pasa la evidencia que se guardó del PDF —los años que había escritos— para
    // poder repetir la comprobación más fuerte sin volver a bajar el documento.
    const rf = revisarFecha(doc, {
      hoy, recibida: f.creado_en ? String(f.creado_en).slice(0, 10) : null,
      pistas: pistasGuardadas(f),
      vencimientoDelPapel: f.vencimiento_origen === "factura",
      historial,
    });
    const textos = [...textosDe(r.avisos), ...textosDe(rf.avisos)];
    const antes = avisosGuardados(f);
    if (!mismosTextos(antes, textos)) {
      revisiones.push({ id: f.id, local: f.local, proveedor: f.proveedor, fecha: f.fecha,
        numero_factura: f.numero_factura, antes, textos, grave: r.grave || rf.grave });
    }
    // Las que traen una PROPUESTA van aparte: un aviso se lee, una propuesta se aplica, y la
    // pantalla necesita poder ofrecer el botón.
    if (rf.anioProbable) {
      fechas.push({ id: f.id, local: f.local, proveedor: f.proveedor, numero_factura: f.numero_factura,
        total: f.total, drive_url: f.drive_url, fecha: f.fecha,
        anioProbable: rf.anioProbable, propuesta: rf.propuesta,
        fuentes: rf.fuentes.filter((x) => x.anio === rf.anioProbable).map((x) => x.texto) });
    }

    // 2) Duplicados. Solo se mira la que no tiene ya un veredicto: si alguien decidió que es
    //    distinta, no se le vuelve a preguntar, y si ya está en duda, ya está apartada.
    if (!f.dup_estado) {
      const parecida = buscarParecida(f, candidatas, { ventanaDias });
      if (parecida) {
        sospechas.push({
          id: f.id, local: f.local, proveedor: f.proveedor, fecha: f.fecha,
          numero_factura: f.numero_factura, total: f.total,
          contraId: parecida.contra.id, contra: parecida.contra,
          veredicto: parecida.veredicto, motivos: parecida.motivos,
          resumen: resumenMotivos(parecida.motivos),
        });
      }
    }

    empujar(previasPorNombre, nombre, f);
    empujar(previasPorNif, nif, f);
  }

  return { revisiones, sospechas, fechas };
}

/** Cuatro números para contarlo en una frase, sin recorrer las listas fuera de aquí. */
export function resumenRepaso({ revisiones = [], sospechas = [], fechas = [] } = {}) {
  return {
    avisosNuevos: revisiones.filter((r) => !r.antes.length && r.textos.length).length,
    avisosQuitados: revisiones.filter((r) => r.antes.length && !r.textos.length).length,
    avisosCambiados: revisiones.filter((r) => r.antes.length && r.textos.length).length,
    graves: revisiones.filter((r) => r.grave).length,
    sospechas: sospechas.length,
    certezas: sospechas.filter((s) => s.veredicto === "duplicada").length,
    fechas: fechas.length,
  };
}
