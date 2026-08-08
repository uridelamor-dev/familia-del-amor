// Campañas — plantillas de partida. PURO: solo datos y unas pocas funciones sobre ellos.
//
// La idea no es dar un texto bonito, que eso se cambia en diez segundos. Es que cuando
// alguien quiera lanzar algo NO EMPIECE DE CERO: cada plantilla trae ya a quién va dirigida
// (el segmento), qué escribir y, sobre todo, cuándo tiene sentido usarla.
//
// TRES REGLAS QUE ATRAVIESAN TODAS ELLAS, y que son la diferencia entre una campaña y
// molestar a la gente:
//
//   1. Se escribe a personas, no a una lista. El mensaje lleva {nombre} y {local} porque
//      un «Hola» seco a un cliente de doce años se nota, y se nota mal.
//   2. Cada mensaje trae UNA razón para responder. Un texto que no propone nada —«¡Hola,
//      seguimos aquí!»— gasta el único permiso que tienes para escribirle.
//   3. Nunca se manda a quien pidió la baja. De eso se encarga el envío (marketing_prefs),
//      pero conviene recordarlo porque es lo que hace que el canal siga sirviendo.
//
// Variables disponibles (ver src/modules/messaging/queue.js): {nombre}, {apellidos},
// {nombre_completo} y {local}. Cualquier otra se queda escrita tal cual, así que no se usan.

export const VARIABLES = ["{nombre}", "{apellidos}", "{nombre_completo}", "{local}"];

// `segmento` usa las mismas claves que construirSegmento() del panel, así que la plantilla
// puede dejar los filtros puestos y no solo el texto.
export const PLANTILLAS = [
  {
    id: "cumple-mes",
    nombre: "Cumpleaños del mes",
    grupo: "Fechas señaladas",
    cuando: "Una vez al mes, a principios. Es la que mejor funciona de todas: la excusa es suya, no tuya.",
    mensaje: "¡Felicidades, {nombre}! 🎂 Desde {local} queremos celebrarlo contigo: este mes, si vienes a comer o cenar, la tarta la ponemos nosotros. Solo tienes que decirlo al reservar.",
    segmento: { cumple_mes: 1 },
    nota: "Hay un envío automático de cumpleaños en la configuración de campañas. Esta plantilla es para hacerlo a mano o para un mes concreto.",
  },
  {
    id: "reactivacion",
    nombre: "Hace tiempo que no viene",
    grupo: "Recuperar clientes",
    cuando: "Cada tres o cuatro meses, a quien lleve medio año sin aparecer. No más a menudo: si insistes, dejas de ser un sitio al que volver y pasas a ser un mensaje que se ignora.",
    mensaje: "{nombre}, hace tiempo que no te vemos por {local} y se nota 😊 Si te apetece volver, dilo al reservar y te invitamos al café. Aquí seguimos.",
    segmento: {},
    nota: "Filtra por «última visita» antes de mandarla. Sin ese filtro se la mandas también a quien vino ayer, y eso queda raro.",
  },
  {
    id: "carta-nueva",
    nombre: "Carta nueva",
    grupo: "Novedades",
    cuando: "Cuando cambia la carta de verdad, dos o tres veces al año. Anunciar cada plato nuevo quema la lista.",
    mensaje: "{nombre}, hemos cambiado la carta en {local} 🍽️ Hay cosas nuevas que creemos que te van a gustar. ¿Te guardamos mesa esta semana?",
    segmento: {},
    nota: "Si puedes, nombra un plato concreto en lugar de decir «cosas nuevas». Un plato con nombre da mucha más curiosidad que una carta entera.",
  },
  {
    id: "llenar-dia",
    nombre: "Llenar un día flojo",
    grupo: "Ocupación",
    cuando: "Con dos o tres días de antelación, no el mismo día. Y solo a la gente de ese local: no vas a mover a nadie de Girona para llenar Blanes un martes.",
    mensaje: "{nombre}, esta semana tenemos mesa libre en {local} y nos encantaría verte. Si vienes entre semana, te invitamos al postre 🍮 ¿Te reservamos?",
    segmento: {},
    nota: "Pon el local en el filtro. Y no lo repitas cada semana: el día flojo deja de serlo, pero la promo deja de valer.",
  },
  {
    id: "evento",
    nombre: "Evento o cena especial",
    grupo: "Eventos",
    cuando: "Con dos semanas de margen para algo con fecha, y un recordatorio a los que respondieron. Una cena de fin de año se llena en octubre, no en diciembre.",
    mensaje: "{nombre}, en {local} preparamos algo especial y queremos que lo sepas antes que nadie 🎉 Plazas limitadas. Responde a este mensaje y te contamos.",
    segmento: {},
    nota: "Deja el mensaje abierto a que respondan: una campaña que genera conversación vale el doble que una que solo informa.",
  },
  {
    id: "grupos-navidad",
    nombre: "Reservas de grupo (Navidad, comuniones)",
    grupo: "Eventos",
    cuando: "Muy pronto. Las comidas de empresa se cierran en octubre y las comuniones en enero. Llegar tarde a esto es perder el año entero.",
    mensaje: "{nombre}, ya estamos cogiendo reservas de grupo en {local} para estas fechas. Si tienes que organizar una comida de empresa o una celebración, escríbenos y lo cuadramos sin prisas 🗓️",
    segmento: {},
    nota: "Esta es la que más dinero mueve. Mándala antes de que la mande la competencia.",
  },
  {
    id: "terraza",
    nombre: "Abrimos terraza",
    grupo: "Novedades",
    cuando: "El primer día bueno de la temporada, no por calendario. Si hace frío el mensaje no funciona por muy abril que sea.",
    mensaje: "{nombre}, ya tenemos la terraza abierta en {local} ☀️ Si te apetece comer fuera, avísanos y te guardamos una mesa buena.",
    segmento: {},
    nota: "Va bien mandarla a mediodía de un día soleado. El mensaje llega cuando la gente está decidiendo dónde comer.",
  },
  {
    id: "resena",
    nombre: "Pedir una reseña",
    grupo: "Reputación",
    cuando: "Uno o dos días después de la visita, nunca el mismo día. Y solo a quien se fue contento.",
    mensaje: "{nombre}, gracias por venir a {local} 🙏 Si te ha gustado, contarlo en Google nos ayuda muchísimo — es lo que hace que otros se atrevan a probarnos. Y si algo no estuvo bien, dínoslo a nosotros primero.",
    segmento: {},
    nota: "La última frase no es de adorno: da salida a quien no quedó contento y evita que esa queja acabe en la reseña.",
  },
  {
    id: "no-vino",
    nombre: "Reservó y no vino",
    grupo: "Recuperar clientes",
    cuando: "Al día siguiente, y con tono de preocuparse, no de reproche. La mitad de las veces pasó algo y la otra mitad se les olvidó.",
    mensaje: "{nombre}, te esperábamos ayer en {local} y al final no pudiste venir. ¿Todo bien? Si quieres cambiar la reserva a otro día, dínoslo y lo movemos sin problema.",
    segmento: {},
    nota: "Ni una palabra sobre la mesa vacía. Esto es para recuperar a la persona, no para cobrarle la ausencia.",
  },
  {
    id: "aniversario",
    nombre: "Aniversario del local",
    grupo: "Fechas señaladas",
    cuando: "Una vez al año, con unos días de antelación. Es de las pocas veces que se puede escribir sin ofrecer nada y aun así funciona.",
    mensaje: "{nombre}, {local} cumple años y lo queremos celebrar con quien lo ha hecho posible 🥂 Pásate esta semana y te invitamos a brindar con nosotros.",
    segmento: {},
    nota: "Funciona porque no pide nada. Si le metes un descuento encima, pierde justo lo que la hace especial.",
  },
];

export const GRUPOS = [...new Set(PLANTILLAS.map((p) => p.grupo))];

export const porId = (id) => PLANTILLAS.find((p) => p.id === id) || null;
export const porGrupo = (grupo) => PLANTILLAS.filter((p) => p.grupo === grupo);

// Las variables que usa una plantilla, para poder avisar si alguien escribe una que no existe.
export function variablesDe(texto) {
  return [...String(texto || "").matchAll(/\{[a-z_]+\}/gi)].map((m) => m[0].toLowerCase());
}

export function variablesDesconocidas(texto) {
  return [...new Set(variablesDe(texto))].filter((v) => !VARIABLES.includes(v));
}
