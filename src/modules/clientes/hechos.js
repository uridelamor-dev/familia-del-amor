// Clientes — lo que sabemos de cada uno. PURO.
//
// Un camarero veterano sabe que la mesa 4 viene siempre los martes, que ella es celíaca y que
// tienen casa en el pueblo pero viven en Girona. Eso hoy vive en su cabeza y se pierde el día
// que libra. Esto es ese cuaderno, escrito.
//
// TRES REGLAS QUE NO SE NEGOCIAN:
//
//  1. CON LA FRASE DELANTE. Se guarda siempre lo que dijo, tal cual. Es lo único que separa un
//     dato de un rumor: dentro de seis meses, «celíaca» sin la frase no se sabe si lo dijo
//     ella o lo dedujo una máquina.
//
//  2. SOLO SI ES SOBRE ELLA MISMA. «Mi amiga es celíaca» NO convierte a nadie en celíaco. Lo
//     pide el prompt, pero además se comprueba aquí: un modelo se equivoca, y este error se
//     descubre el día que alguien se fía.
//
//  3. NO SE PISA NADA. Un dato nuevo no borra el viejo: lo sucede. La gente cambia de gustos y
//     el historial explica por qué en la ficha pone lo que pone.

/** Lo que merece la pena saber. Una lista blanca, y no «lo que diga»: guardar cualquier frase
 *  de un cliente deja de ser un cuaderno y pasa a ser un perfil. */
export const ETIQUETAS = {
  dieta: { label: "Dieta o alergia", ejemplo: "celíaca, sin lactosa, vegetariano", sensible: true },
  no_le_gusta: { label: "No le gusta", ejemplo: "el cilantro, el picante" },
  prefiere_dia: { label: "Viene los", ejemplo: "martes, fines de semana" },
  prefiere_local: { label: "Su local", ejemplo: "La Tapeta - Blanes" },
  con_ninos: { label: "Viene con niños", ejemplo: "dos, de 4 y 7" },
  vive_fuera: { label: "Vive fuera", ejemplo: "en Girona, con casa en Blanes" },
  horario: { label: "Horario", ejemplo: "trabaja de mañanas" },
  ocasion: { label: "Celebra", ejemplo: "su aniversario en junio" },
  trabajo: { label: "Trabajo", ejemplo: "tiene una peluquería en el pueblo" },
  otro: { label: "Otros", ejemplo: "lo que no encaje en el resto" },
};

/**
 * Marcas de que la frase habla de OTRA persona. No es una lista perfecta —ninguna lo sería—,
 * pero convierte «mi amiga es celíaca» en algo que hay que confirmar a mano en vez de en un
 * dato de la ficha, que es la diferencia que importa.
 */
const TERCEROS = /\b(mi|su|una?|el|la)\s+(amig[oa]s?|hij[oa]s?|mujer|marido|pareja|novi[oa]|madre|padre|hermanos?|suegr[oa]|cuñad[oa]s?|prim[oa]s?|vecin[oa]s?|compañer[oa]s?|jefe|nieto?s?|abuel[oa]s?|sobrin[oa]s?)\b/i;
// «Para mi hijo», «para ella»: la petición es para otro, aunque la haga quien escribe.
const PARA_OTRO = /\bpara\s+(mi|su|el|la|ella|él)\b/i;

/** ¿La frase deja claro que habla de quien escribe? */
export function atribucionDudosa(texto) {
  const t = String(texto || "");
  if (!t.trim()) return true;                 // sin frase no se puede saber: siempre a mano
  return TERCEROS.test(t) || PARA_OTRO.test(t);
}

const limpio = (s, max) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Un hecho listo para guardar, o null si no vale.
 *
 * `estado` sale de aquí y no de quien lo propone: lo que la IA saca de una conversación entra
 * como PROPUESTO, y lo que escribe una persona en la ficha entra confirmado — porque esa
 * persona ya está confirmándolo al escribirlo.
 */
export function sanearHecho(crudo = {}, { fuente = "panel" } = {}) {
  const etiqueta = String(crudo.etiqueta || "").trim().toLowerCase();
  if (!ETIQUETAS[etiqueta]) return null;
  const valor = limpio(crudo.valor, 120);
  if (!valor) return null;
  const texto = limpio(crudo.texto_original, 400);
  // De la IA no se acepta un hecho sin la frase que lo respalda: sin ella no hay forma de
  // comprobarlo y es justo cuando más falta hace.
  if (fuente !== "panel" && !texto) return null;

  const dudosa = atribucionDudosa(texto);
  return {
    etiqueta,
    valor,
    texto_original: texto || null,
    fuente,
    // A mano se da por bueno. De una conversación, nunca: se propone. Y si la frase suena a
    // que habla de otra persona, se marca para que se vea por qué hay que mirarla.
    estado: fuente === "panel" ? "confirmado" : "propuesto",
    atribucion_dudosa: fuente === "panel" ? false : dudosa,
  };
}

/** Los hechos agrupados por etiqueta y en el orden de ETIQUETAS, que va de lo más útil a lo
 *  más anecdótico. Dentro de cada una, lo más reciente primero. */
export function agruparHechos(hechos = []) {
  const vivos = hechos.filter((h) => h && h.estado !== "descartado");
  return Object.keys(ETIQUETAS)
    .map((et) => ({
      etiqueta: et,
      label: ETIQUETAS[et].label,
      sensible: !!ETIQUETAS[et].sensible,
      hechos: vivos.filter((h) => h.etiqueta === et)
        .sort((a, b) => String(b.creado_en || "").localeCompare(String(a.creado_en || ""))),
    }))
    .filter((g) => g.hechos.length);
}

/**
 * La línea que se lee de un vistazo en la lista de clientes: solo lo confirmado. Lo propuesto
 * no puede aparecer como si fuera un hecho — para eso está la ficha, donde se confirma.
 */
export function resumenHechos(hechos = [], max = 3) {
  const conf = hechos.filter((h) => h && h.estado === "confirmado");
  if (!conf.length) return "";
  const orden = Object.keys(ETIQUETAS);
  return conf
    .sort((a, b) => orden.indexOf(a.etiqueta) - orden.indexOf(b.etiqueta))
    .slice(0, max)
    .map((h) => h.valor)
    .join(" · ");
}

// ── El extractor: de las conversaciones a propuestas ────────────────────────
//
// Lo de abajo es lo que se puede probar sin llamar a ningún modelo: qué conversaciones vale la
// pena leer, cómo se le presentan y qué de lo que devuelve es nuevo. La llamada en sí vive en
// server.js, que es donde están las credenciales.

/** Frases que no dicen nada de nadie. Leer «ok» con un modelo es pagar por nada. */
const VACÍAS = /^(ok|okey|vale|gracias|graci?es|thx|👍+|👌+|si|sí|no|hola|buenas|adios|adiós|perfecto|genial|hasta luego)[\s!.…]*$/i;

/** ¿Merece la pena leer esta conversación? */
export function mereceLaPena(mensajes = []) {
  const útiles = mensajes
    .map((m) => String(m || "").trim())
    .filter((m) => m.length > 12 && !VACÍAS.test(m));
  // Menos de 20 caracteres útiles en total no es una conversación, es un «ok» largo.
  return útiles.join(" ").length >= 20 ? útiles : null;
}

/**
 * Las conversaciones de la tanda, agrupadas por teléfono y recortadas.
 *
 * Se recorta por dos motivos: una conversación de cien mensajes cuesta cien veces más de leer,
 * y lo que alguien contó de sí mismo suele estar en lo último, no en el «hola» de hace un año.
 */
export function conversacionesParaLeer(filas = [], { maxMensajes = 12, maxConversaciones = 40 } = {}) {
  const porTel = new Map();
  for (const f of filas) {
    const tel = String(f.telefono || "").trim();
    if (!tel || !f.mensaje) continue;
    if (!porTel.has(tel)) porTel.set(tel, []);
    porTel.get(tel).push(String(f.mensaje));
  }
  const salida = [];
  for (const [telefono, todos] of porTel) {
    const mensajes = mereceLaPena(todos.slice(-maxMensajes));
    if (mensajes) salida.push({ telefono, mensajes });
  }
  return salida.slice(0, maxConversaciones);
}

const clave = (h) => `${h.etiqueta}|${String(h.valor || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim()}`;

/**
 * De lo que propone el modelo, lo que de verdad es nuevo.
 *
 * Se compara también con lo DESCARTADO: si alguien ya dijo que no, volver a proponérselo cada
 * noche convierte la ficha en un sitio del que huir.
 */
export function hechosNuevos(propuestos = [], yaHay = []) {
  const vistos = new Set(yaHay.map(clave));
  const nuevos = [];
  for (const p of propuestos) {
    if (!p) continue;
    const k = clave(p);
    if (vistos.has(k)) continue;
    vistos.add(k);
    nuevos.push(p);
  }
  return nuevos;
}
