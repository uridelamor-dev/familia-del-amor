// Marketing — el segmento de una campaña, saneado y contado en palabras. PURO.
//
// Aquí llega lo que propone el modelo al leer una frase de Laura («leads mujeres de más de 35
// para el día de la madre»). El modelo propone; ESTE MÓDULO DECIDE qué de eso es un filtro de
// verdad. Dos reglas, y las dos importan:
//
//  1. Lo que no está en la lista, no entra. Ni un campo inventado ni un valor inventado. Un
//     filtro que el sistema no sabe aplicar y aun así se guarda haría una campaña que dice
//     filtrar por algo y no filtra por nada — y eso solo se descubre cuando ya ha salido.
//
//  2. Lo que se cae, SE DICE. Si Laura pide «españoles» y le damos «idioma español» sin
//     avisar, cree que ha filtrado por nacionalidad. No la tenemos, y callarlo es peor que no
//     poder hacerlo.

/** Los únicos filtros que existen. El resto se descarta, venga de donde venga. */
export const CAMPOS = {
  genero: { tipo: "enum", valores: ["hombre", "mujer"] },
  poblacion: { tipo: "texto" },
  local: { tipo: "catalogo" },                    // se valida contra los locales de verdad
  origen: { tipo: "enum", valores: ["lead", "reserva"] },
  idioma: { tipo: "enum", valores: ["es", "ca", "en"] },
  q: { tipo: "texto" },
  cumple_mes: { tipo: "mes" },
  cumple_en_dias: { tipo: "entero", min: 0, max: 60 },
  edad_min: { tipo: "entero", min: 0, max: 120 },
  edad_max: { tipo: "entero", min: 0, max: 120 },
  reservo_from: { tipo: "fecha" },
  reservo_to: { tipo: "fecha" },
  from: { tipo: "fecha" },
  to: { tipo: "fecha" },
  con_email: { tipo: "bool" },
  con_telefono: { tipo: "bool" },
  sin_nacimiento: { tipo: "bool" },
  sin_email: { tipo: "bool" },
  sin_poblacion: { tipo: "bool" },
  // Lo que sabemos de la gente: «los celíacos», «los que vienen los martes». Solo cuenta lo
  // confirmado, y por eso se puede usar para decidir a quién se escribe.
  hecho_etiqueta: { tipo: "enum", valores: ["dieta", "no_le_gusta", "prefiere_dia", "prefiere_local", "con_ninos", "vive_fuera", "horario", "ocasion", "trabajo", "otro"] },
  hecho_valor: { tipo: "texto" },
};

const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const entero = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; };

/**
 * Deja solo lo que se puede aplicar. Devuelve el segmento limpio y la lista de lo que se ha
 * caído, con el motivo, para poder enseñarlo.
 */
export function sanearSegmento(crudo = {}, { locales = [] } = {}) {
  const seg = {};
  const descartados = [];
  for (const [k, v] of Object.entries(crudo || {})) {
    if (v == null || v === "" || v === false) continue;
    const def = CAMPOS[k];
    if (!def) { descartados.push({ campo: k, valor: v, motivo: "ese filtro no existe" }); continue; }

    if (def.tipo === "enum") {
      const val = String(v).toLowerCase().trim();
      if (def.valores.includes(val)) seg[k] = val;
      else descartados.push({ campo: k, valor: v, motivo: `solo puede ser ${def.valores.join(" o ")}` });
    } else if (def.tipo === "catalogo") {
      // El nombre del local tiene que ser uno de los de verdad: «Blanes» a secas no vale, y
      // guardarlo colaría una campaña que no filtra por ningún local.
      const exacto = locales.find((l) => l.toLowerCase() === String(v).toLowerCase());
      const parecido = exacto || locales.find((l) => l.toLowerCase().includes(String(v).toLowerCase().trim()));
      if (parecido) seg[k] = parecido;
      else descartados.push({ campo: k, valor: v, motivo: "no es ninguno de los establecimientos" });
    } else if (def.tipo === "fecha") {
      if (esFecha(v)) seg[k] = String(v);
      else descartados.push({ campo: k, valor: v, motivo: "la fecha tiene que ser AAAA-MM-DD" });
    } else if (def.tipo === "mes") {
      const mm = String(v).padStart(2, "0");
      if (/^(0[1-9]|1[0-2])$/.test(mm)) seg[k] = mm;
      else descartados.push({ campo: k, valor: v, motivo: "no es un mes" });
    } else if (def.tipo === "entero") {
      const n = entero(v);
      if (n != null && n >= def.min && n <= def.max) seg[k] = n;
      else descartados.push({ campo: k, valor: v, motivo: `tiene que ser un número entre ${def.min} y ${def.max}` });
    } else if (def.tipo === "bool") {
      seg[k] = 1;
    } else {
      const t = String(v).trim().slice(0, 80);
      if (t) seg[k] = t;
    }
  }

  // Una edad al revés no filtra nada y se lee como si filtrara: «de 50 a 35» devuelve cero
  // personas y parece que no hay nadie de esa edad.
  if (seg.edad_min != null && seg.edad_max != null && seg.edad_min > seg.edad_max) {
    descartados.push({ campo: "edad", valor: `${seg.edad_min}–${seg.edad_max}`, motivo: "la edad mínima era mayor que la máxima; se han cambiado" });
    const t = seg.edad_min; seg.edad_min = seg.edad_max; seg.edad_max = t;
  }
  if (seg.reservo_from && seg.reservo_to && seg.reservo_from > seg.reservo_to) {
    const t = seg.reservo_from; seg.reservo_from = seg.reservo_to; seg.reservo_to = t;
    descartados.push({ campo: "reservó entre", valor: "fechas al revés", motivo: "se han cambiado de orden" });
  }

  return { segmento: seg, descartados };
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * El segmento en palabras: «Mujeres · de 35 años · que reservaron entre el 1 y el 31 de julio».
 * Es lo que se lee antes de dar a enviar, así que tiene que decir exactamente lo que filtra —ni
 * más ni menos— y en el idioma de la casa.
 */
export function describirSegmento(seg = {}) {
  const p = [];
  if (seg.genero) p.push(seg.genero === "mujer" ? "mujeres" : "hombres");
  if (seg.origen) p.push(seg.origen === "lead" ? "con ficha completa (leads)" : "que solo han reservado");
  if (seg.poblacion) p.push(`de ${seg.poblacion}`);
  if (seg.local) p.push(`que han reservado en ${seg.local}`);
  if (seg.idioma) p.push(`que hablan ${{ es: "español", ca: "catalán", en: "inglés" }[seg.idioma]}`);

  if (seg.edad_min != null && seg.edad_max != null) p.push(`de ${seg.edad_min} a ${seg.edad_max} años`);
  else if (seg.edad_min != null) p.push(`de ${seg.edad_min} años o más`);
  else if (seg.edad_max != null) p.push(`de hasta ${seg.edad_max} años`);

  if (seg.cumple_en_dias === 0) p.push("que cumplen años hoy");
  else if (seg.cumple_en_dias) p.push(`que cumplen años en los próximos ${seg.cumple_en_dias} días`);
  if (seg.cumple_mes) p.push(`que cumplen años en ${MESES[Number(seg.cumple_mes) - 1]}`);

  if (seg.reservo_from && seg.reservo_to) p.push(`que reservaron entre el ${seg.reservo_from} y el ${seg.reservo_to}`);
  else if (seg.reservo_from) p.push(`que reservaron desde el ${seg.reservo_from}`);
  else if (seg.reservo_to) p.push(`que reservaron hasta el ${seg.reservo_to}`);

  if (seg.con_email) p.push("con email");
  if (seg.con_telefono) p.push("con teléfono");
  if (seg.sin_nacimiento) p.push("de quienes NO sabemos la fecha de nacimiento");
  if (seg.sin_email) p.push("de quienes no tenemos email");
  if (seg.sin_poblacion) p.push("de quienes no sabemos la población");
  if (seg.hecho_etiqueta) {
    const et = { dieta: "en su dieta", no_le_gusta: "que no les gusta", prefiere_dia: "que vienen", prefiere_local: "cuyo local es",
      con_ninos: "que vienen con niños", vive_fuera: "que viven fuera", horario: "de horario", ocasion: "que celebran", trabajo: "que trabajan en", otro: "de quienes sabemos" }[seg.hecho_etiqueta];
    p.push(seg.hecho_valor ? `${et} ${seg.hecho_valor}` : `de quienes sabemos algo sobre «${seg.hecho_etiqueta}»`);
  }
  if (seg.q) p.push(`cuyo nombre o contacto contiene «${seg.q}»`);

  if (!p.length) return "Todos los contactos, sin ningún filtro";
  return p.join(" · ").replace(/^./, (c) => c.toUpperCase());
}
