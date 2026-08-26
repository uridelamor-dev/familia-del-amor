// ¿Se sostiene la fecha que se ha leído de la factura? PURO.
//
// EL CASO: una factura de 2026 se guardó como 2025. El prompt no decía ni una palabra sobre la
// fecha de emisión —tiene un párrafo entero para el vencimiento, y para esto solo el formato en
// el esquema JSON— y ninguna comprobación posterior la miraba: `coherencia.js` valida importes.
//
// Y DE LA FECHA CUELGA TODO: en qué carpeta de Drive se archiva, en qué pestaña del Sheet, EN QUÉ
// TRIMESTRE SE DECLARA EL IVA, cuándo hay que pagarla, y la ventana con la que se detectan las
// repetidas. Un año mal no se nota hasta que ya está declarado.
//
// AQUÍ NO SE CORRIGE NADA, se avisa — igual que en `coherencia.js`. Pero se avisa PROPONIENDO el
// año bueno y diciendo de dónde sale, que es lo que convierte «abre el PDF, búscala y edítala»
// en «sí, es 2026». Un aviso que no se puede resolver en un clic se acaba acumulando.

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];
// Catalán y las abreviaturas que se ven de verdad en las facturas de aquí.
const MESES_ALT = { gener: 1, febrer: 2, marc: 3, març: 3, abril: 4, maig: 5, juny: 6, juliol: 7,
  agost: 8, setembre: 9, octubre: 10, novembre: 11, desembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, des: 12 };

const ANIO_MIN = 2000;
const dosD = (n) => String(n).padStart(2, "0");
const iso = (a, m, d) => `${a}-${dosD(m)}-${dosD(d)}`;
const bisiesto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const diasDelMes = (a, m) => [31, bisiesto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const valida = (a, m, d) => a >= ANIO_MIN && a <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= diasDelMes(a, m);
const anioDe = (f) => Number(String(f || "").slice(0, 4)) || null;

/** Un año de dos cifras es 20xx. No hay facturas del siglo pasado en este sistema. */
const cuatroCifras = (n) => (n < 100 ? 2000 + n : n);

/**
 * Todas las fechas que hay en un texto, en ISO.
 *
 * TOLERA ESPACIOS ALREDEDOR DE LOS SEPARADORES, y no es un detalle: hay PDF que se pintan letra
 * a letra, y al recomponer la línea una fecha sale como «03 / 12 / 2026». Sin esto, la
 * comprobación más fuerte del módulo fallaría justo en los documentos más raros.
 */
export function fechasDelTexto(texto) {
  const t = String(texto || "");
  const out = [];
  const mete = (a, m, d, crudo) => { if (valida(a, m, d)) out.push({ iso: iso(a, m, d), crudo }); };

  // dd/mm/aaaa, dd-mm-aa, dd.mm.aaaa — el formato de aquí, día primero.
  // El `(?<!\d)` del principio no sobra: sin él, «2026-12-03» casaba también empezando por el
  // «26» y daba un 26 de diciembre de 2003 que no está en ninguna parte del documento.
  for (const m of t.matchAll(/(?<!\d)(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})(?!\d)/g)) {
    mete(cuatroCifras(Number(m[3])), Number(m[2]), Number(m[1]), m[0]);
  }
  // aaaa-mm-dd, el formato de máquina.
  for (const m of t.matchAll(/(?<!\d)(\d{4})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{1,2})(?!\d)/g)) {
    mete(Number(m[1]), Number(m[2]), Number(m[3]), m[0]);
  }
  // «3 de diciembre de 2026», «3 des. 2026», «3 December 2026».
  const nombres = [...MESES.map((x, i) => [x, i + 1]), ...Object.entries(MESES_ALT)]
    .sort((a, b) => b[0].length - a[0].length);
  const sinAcentos = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [nombre, num] of nombres) {
    const clave = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const m of sinAcentos.matchAll(new RegExp(`(\\d{1,2})\\s*(?:de\\s+)?${clave}\\.?\\s*(?:de\\s+)?(\\d{2,4})(?!\\d)`, "g"))) {
      mete(cuatroCifras(Number(m[2])), num, Number(m[1]), m[0]);
    }
  }
  // Sin repetidas, conservando el orden en que aparecen.
  const vistas = new Set();
  return out.filter((f) => (vistas.has(f.iso) ? false : vistas.add(f.iso)));
}

/**
 * Lo que se guarda de la capa de texto del PDF para poder recalcular mañana sin el documento.
 *
 * Se guarda LA EVIDENCIA, no el aviso, y es a propósito: el botón de «Repasar» reescribe la
 * columna de avisos con lo que sepa recalcular, así que un aviso que solo se puede sacar con el
 * PDF delante se borraría en el primer repaso. La regla más fuerte del módulo sería la que menos
 * dura. Son unos ochenta bytes por factura.
 */
export function pistasDeFecha(texto) {
  const t = String(texto || "");
  if (!t.trim()) return { hayTexto: false, fechas: [], anios: [] };
  const fechas = fechasDelTexto(t);
  return {
    hayTexto: true,
    fechas: fechas.map((f) => f.iso).slice(0, 40),
    // SOLO años que venían dentro de algo con forma de fecha. Un «2026» suelto puede ser un
    // código de producto, un tramo de IBAN o el número del registro mercantil.
    anios: [...new Set(fechas.map((f) => anioDe(f.iso)))].filter(Boolean),
  };
}

/**
 * El año que lleva dentro el número de factura, si lo lleva y se puede afirmar.
 *
 * SOLO CUATRO CIFRAS. Distinguir el «26» de año del «26» de serie o de número de cliente no se
 * puede hacer sin conocer el formato de cada proveedor, y un aviso que se equivoca es peor que
 * no tenerlo.
 */
export function anioDeNumeroFactura(numero, { hasta = 2100 } = {}) {
  const t = String(numero || "");
  const años = [...t.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/g)]
    .map((m) => Number(m[1]))
    .filter((a) => a >= ANIO_MIN && a <= hasta);
  // Con dos años distintos dentro no se afirma nada: no se sabe cuál es el del ejercicio.
  const unicos = [...new Set(años)];
  return unicos.length === 1 ? unicos[0] : null;
}

const dias = (a, b) => {
  const x = Date.parse(a + "T00:00:00Z"), y = Date.parse(b + "T00:00:00Z");
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 86400000) : null;
};
const mesDia = (f) => String(f || "").slice(5);

/** El texto de un año en una fecha ISO, cambiando solo el año. */
const conAnio = (fechaIso, anio) => `${anio}${String(fechaIso).slice(4)}`;

/** ¿Es un abono o una rectificativa? Ahí una fecha vieja es normal y no se avisa por ello. */
function esCorrectivo({ tipo, concepto, numero_factura, total } = {}) {
  const t = `${concepto || ""} ${numero_factura || ""}`.toLowerCase();
  if (/abono|rectificativ|nota de credito|nota de crèdit|\bn\/c\b/.test(t)) return true;
  return Number(total) < 0;
}

/**
 * ¿Se sostiene la fecha leída?
 *
 * → { avisos, grave, anioProbable, propuesta, fuentes }
 *
 * LAS REGLAS VOTAN, no se suman como avisos sueltos. La factura del caso real habría producido
 * cuatro avisos diciendo lo mismo, y cuatro etiquetas que dicen lo mismo se leen igual de mal
 * que ninguna. Cuando dos fuentes INDEPENDIENTES coinciden en otro año, sale un aviso y una
 * propuesta; si solo hay una, se dice lo que se ha visto y ya.
 */
export function revisarFecha(doc = {}, ctx = {}) {
  const { hoy = null, recibida = null, pistas = null, vencimientoDelPapel = false, historial = {} } = ctx;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(doc.fecha || "")) ? String(doc.fecha) : null;
  const avisos = [], fuentes = [];
  const votos = new Map();
  const vota = (anio, peso, texto) => {
    if (!anio || anio === anioDe(fecha)) return;
    votos.set(anio, (votos.get(anio) || 0) + peso);
    fuentes.push({ anio, peso, texto });
  };

  // Sin fecha no hay nada que contrastar, pero tampoco se calla: hoy una factura sin fecha
  // desaparece de las estadísticas y del modelo 303 sin que nadie lo sepa. No es «un dato
  // menos», es gasto que no se declara.
  if (!fecha) {
    avisos.push({ clave: "sin_fecha", grave: false,
      texto: "No se ha podido leer la fecha del documento. Sin ella, esta factura no cuenta en el IVA del trimestre ni en las estadísticas." });
    return { avisos, grave: false, anioProbable: null, propuesta: null, fuentes };
  }

  const anio = anioDe(fecha);
  const anioHoy = hoy ? anioDe(hoy) : null;
  const correctivo = esCorrectivo(doc);

  // ── Imposibles. Baratas, obvias, y hoy no existían ──────────────────────────────────────
  if (hoy && dias(hoy, fecha) > 7) {
    avisos.push({ clave: "fecha_futura", grave: true,
      texto: `La fecha (${fecha}) es posterior a hoy. Una factura no se emite con fecha de dentro de un mes: casi seguro está mal leída.` });
  }
  if (anioHoy && (anio < ANIO_MIN || anio > anioHoy + 1)) {
    avisos.push({ clave: "anio_imposible", grave: true, texto: `El año ${anio} no puede ser: revisa la fecha.` });
  }

  // ── 1. El año no está en el texto del PDF. La más fuerte con diferencia ─────────────────
  // Los dígitos exactos que escribió el emisor. Si el año leído no aparece por ninguna parte,
  // ese año no está en el documento: no hay lectura razonable que lo justifique.
  if (pistas && pistas.hayTexto && pistas.anios && pistas.anios.length && !pistas.anios.includes(anio)) {
    const otros = pistas.anios.filter((a) => a !== anio);
    for (const a of otros) vota(a, 3, `en el texto del PDF solo aparece ${otros.join(" y ")}`);
  }

  // ── 2. El año del número de factura ─────────────────────────────────────────────────────
  const anioNum = anioDeNumeroFactura(doc.numero_factura, { hasta: anioHoy ? anioHoy + 1 : 2100 });
  if (anioNum && anioNum !== anio) {
    // LA SERIE QUE NO SE HA RENOVADO: una factura del 3 de enero de 2026 numerada «2025/09912»
    // es legítima y frecuente —el proveedor sigue con la serie del año anterior las primeras
    // semanas— y si esto avisara, sería ruido cada enero.
    //
    // SOLO ESE CASO, y con cuidado: al revés —diciembre con el número del año siguiente— es
    // raro y sí merece mirarse. La primera versión de esta excepción cubría los dos, y se
    // tragaba justo el fallo que vino a cazar: fecha de diciembre de 2025, número 2026/00418.
    const serieVieja = Number(fecha.slice(5, 7)) === 1 && anioNum === anio - 1;
    if (!serieVieja) vota(anioNum, 2, `el número de factura dice ${anioNum}`);
  }

  // ── 3. Desfase de casi exactamente un año contra cuándo llegó ───────────────────────────
  // La huella del dígito cambiado: 365 días clavados y el mismo día del mes. Un retraso de
  // subida real no produce eso. La versión genérica —«está lejos de cuando llegó»— NO se
  // emite: la dispara cualquier subida de atrasos y sería puro ruido.
  if (recibida && !correctivo) {
    const d = dias(fecha, recibida);
    const mismoDia = Math.abs((Number(fecha.slice(8)) || 0) - (Number(recibida.slice(8)) || 0)) <= 5
      && fecha.slice(5, 7) === recibida.slice(5, 7);
    if (d != null && d >= 330 && d <= 400 && mismoDia) {
      vota(anioDe(recibida), 2, `llegó el ${recibida}, casi un año exacto después`);
    }
  }

  // ── 4. El vencimiento, pero SOLO si se leyó del papel ───────────────────────────────────
  // Si se calculó a partir de la fecha, contrastarlo es comparar un número consigo mismo: no
  // probaría nada y encima parecería que sí.
  if (vencimientoDelPapel && /^\d{4}-\d{2}-\d{2}$/.test(String(doc.vencimiento || ""))) {
    const d = dias(fecha, doc.vencimiento);
    if (d != null && d < 0) {
      avisos.push({ clave: "vencimiento_antes", grave: true,
        texto: `El vencimiento (${doc.vencimiento}) es anterior a la fecha de la factura (${fecha}). Uno de los dos está mal leído.` });
      vota(anioDe(doc.vencimiento), 1, `el vencimiento dice ${doc.vencimiento}`);
    } else if (d != null && d > 300) {
      avisos.push({ clave: "vencimiento_lejos", grave: true,
        texto: `Entre la factura (${fecha}) y su vencimiento (${doc.vencimiento}) hay ${d} días. Aquí no se paga a más de cuatro meses: puede que el año de la fecha esté mal.` });
      vota(anioDe(doc.vencimiento), 1, `el vencimiento dice ${doc.vencimiento}`);
    }
  }

  // ── 5. Contra lo que ese proveedor ha facturado antes ───────────────────────────────────
  // Con poca masa no se afirma nada — mismo criterio que `contraHistorial` con los importes.
  const previas = (historial.fechas || []).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || "")));
  if (previas.length >= 4 && !correctivo) {
    const ultima = previas.slice().sort().pop();
    const d = dias(fecha, ultima);
    if (d != null && d > 60) vota(anioDe(ultima), 1, `su factura anterior es del ${ultima}`);
  }

  // ── La votación ─────────────────────────────────────────────────────────────────────────
  let anioProbable = null;
  let mejor = 0;
  for (const [a, peso] of votos) {
    const distintas = fuentes.filter((f) => f.anio === a).length;
    if (peso >= 3 && distintas >= 2 && peso > mejor) { mejor = peso; anioProbable = a; }
  }

  if (anioProbable) {
    const razones = fuentes.filter((f) => f.anio === anioProbable).map((f) => f.texto);
    avisos.push({
      clave: "anio_mal_leido", grave: true, anioProbable,
      texto: `La fecha dice ${fecha}, pero ${razones.join(", ")}. El año parece mal leído: sería ${anioProbable}. `
        + "Corrígelo antes de que entre en el IVA del trimestre.",
    });
  } else if (fuentes.length === 1 && !avisos.some((a) => a.grave)) {
    // Una sola fuente no basta para proponer, pero sí para decir lo que se ha visto.
    avisos.push({ clave: "fecha_dudosa", grave: false,
      texto: `Comprueba la fecha (${fecha}): ${fuentes[0].texto}.` });
  }

  // Tope duro: uno sobre el año y uno estructural. Cinco etiquetas diciendo lo mismo se leen
  // igual de mal que ninguna.
  const delAnio = avisos.filter((a) => a.clave === "anio_mal_leido" || a.clave === "fecha_dudosa");
  const otros = avisos.filter((a) => !delAnio.includes(a));
  const finales = [...delAnio.slice(0, 1), ...otros.slice(0, 1)];

  return {
    avisos: finales,
    grave: finales.some((a) => a.grave),
    anioProbable,
    propuesta: anioProbable ? conAnio(fecha, anioProbable) : null,
    fuentes,
  };
}
