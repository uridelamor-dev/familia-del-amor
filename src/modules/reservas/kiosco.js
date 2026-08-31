// Las reservas del día tal como se ven en la tablet de fichar. PURO.
//
// POR QUÉ EN EL SERVIDOR Y NO EN EL KIOSCO: `public/fichar.js` es un script clásico dentro de
// una función anónima, sin módulos ni empaquetador — no puede importar nada. Si esto se pintara
// allí, la lógica viviría suelta y sin un solo test. Aquí se prepara ya masticado y el kiosco
// solo dibuja lo que le llega.
//
// LO QUE SE ENSEÑA Y LO QUE NO: nombre, hora y cuántos son. NO el teléfono, y es deliberado:
// `GET /api/fichar/:token` es el único endpoint que contesta sin sesión, y su llave va en la
// URL de la tablet. Quien copie ese enlace ve esta pantalla desde cualquier sitio. El nombre y
// la hora hacen falta para recibir la mesa; el teléfono no, y es el dato caro si se escapa.

import { agendaDia, horaAMin } from "./agenda.js";

/**
 * El nombre de barra recortado a lo que de verdad distingue.
 *
 * En Blanes las dos barras son «La Tapeta - Blanes» y «Cooperativa - Blanes»: repetir «Blanes»
 * en cada línea de una lista que solo es de Blanes no informa de nada y, en una pantalla
 * estrecha, se come el nombre del cliente. Se quita la parte que comparten TODAS y queda «La
 * Tapeta» / «Cooperativa», que es lo único que hay que leer para saber a qué barra va la mesa.
 *
 * Si no comparten nada, se dejan enteras: es preferible un nombre largo a uno equivocado.
 */
export function acortarBarras(nombres) {
  const lista = [...new Set((nombres || []).map((x) => String(x || "").trim()).filter(Boolean))];
  if (lista.length < 2) return new Map(lista.map((n) => [n, n]));
  const trozos = lista.map((n) => n.split(/\s+-\s+/));
  // El sufijo común, por trozos y no por letras: cortar a mitad de palabra da «La Tapeta - Bla».
  let comunes = 0;
  while (trozos.every((t) => t.length > comunes + 1
      && t[t.length - 1 - comunes] === trozos[0][trozos[0].length - 1 - comunes])) comunes++;
  return new Map(lista.map((n, i) => [n, comunes ? trozos[i].slice(0, trozos[i].length - comunes).join(" - ") : n]));
}

/**
 * Cuántas mesas se listan como mucho.
 *
 * Hay un tope porque esto NO es la pantalla de reservas: es una chuleta al lado de los botones
 * de fichar. Un sábado de fiesta mayor con cuarenta mesas empujaría los nombres del equipo
 * fuera de la pantalla y estropearía lo único que la tablet tiene que hacer bien. Doce entran
 * en dos o tres columnas sin crecer, y el resto se cuenta en una línea.
 */
export const MAX_LISTA = 12;

/**
 * El día resumido para la pantalla de la barra.
 *
 * → { totalReservas, totalPersonas, porLlegar, personasPorLlegar, lista, mas, turnos, proxima }
 *
 * `lista` es SOLO lo que queda por llegar, que es lo que se pinta. A las nueve de la noche, las
 * doce mesas de la comida no son información: son doce líneas que hay que saltarse para
 * encontrar la de las 21:30. El total del día sigue en la cabecera, en una línea, para quien
 * quiera saber cómo ha ido la jornada.
 *
 * `ahora` ("HH:MM") es lo que separa lo hecho de lo que viene. Sin hora no se corta nada —salen
 * todas— en vez de inventarse un punto del día.
 */
export function resumenDelDia(reservas, { ahora = null, max = MAX_LISTA } = {}) {
  const min = horaAMin(ahora);
  const filas = Array.isArray(reservas) ? reservas : [];
  const dia = agendaDia(filas);
  const cortas = acortarBarras(filas.map((r) => r && r.barra));

  let proxima = null;
  const turnos = dia.turnos.map((t) => ({
    key: t.key,
    label: t.label,
    total: t.total,
    personas: t.personas,
    reservas: t.reservas.map((r) => {
      const h = horaAMin(r.hora);
      // El margen de media hora: una mesa de las 21:00 sigue siendo «la de ahora» a las 21:20,
      // porque casi nadie llega clavado. Tacharla en cuanto pasa el minuto haría que la mesa
      // que está entrando por la puerta apareciera como pasada.
      const pasada = min != null && h != null && h < min - 30;
      if (!pasada && !proxima && h != null) proxima = { hora: r.hora, nombre: r.nombre, personas: r.personas };
      // Campo a campo, NUNCA `{ ...r }`. Quien llame a esto puede pasarle la fila de la base
      // entera —con teléfono dentro— y una copia ciega lo mandaría a una pantalla que se ve
      // sin contraseña. Que lo que sale esté escrito aquí es lo que hace que se pueda probar.
      return {
        hora: r.hora,
        personas: Number(r.personas) || 0,
        nombre: r.nombre,
        barra: r.barra ? (cortas.get(String(r.barra).trim()) || r.barra) : null,
        pasada,
      };
    }),
  }));

  // Lo que queda por venir, que es el número que se mira al entrar a currar.
  const quedan = [];
  for (const t of turnos) for (const r of t.reservas) if (!r.pasada) quedan.push({ ...r, turno: t.label });
  const tope = Math.max(1, Number(max) || MAX_LISTA);
  // El turno solo se dice si en lo que queda hay más de uno. A las ocho de la tarde, poner
  // «CENA» encima de las ocho mesas que quedan no añade nada: ya se ve en las horas.
  const variosTurnos = new Set(quedan.map((r) => r.turno)).size > 1;
  const lista = quedan.slice(0, tope).map((r) => ({ ...r, turno: variosTurnos ? r.turno : null }));

  return {
    totalReservas: dia.totalReservas,
    totalPersonas: dia.totalPersonas,
    porLlegar: quedan.length,
    personasPorLlegar: quedan.reduce((s, r) => s + (Number(r.personas) || 0), 0),
    lista,
    // Las que no caben se cuentan, no se esconden: «+9 más» avisa de que hay que abrir el panel.
    mas: Math.max(0, quedan.length - lista.length),
    cabecera: cabeceraDelDia({
      totalReservas: dia.totalReservas, totalPersonas: dia.totalPersonas,
      porLlegar: quedan.length, personasPorLlegar: quedan.reduce((x, r) => x + (Number(r.personas) || 0), 0),
      hayHora: min != null,
    }),
    proxima,
  };
  // `turnos` NO sale de aquí, y no es por ahorrar bytes: lo que se manda por esta ruta se ve
  // sin contraseña, así que las mesas que ya han pasado —con su nombre— no tienen por qué
  // viajar a una tablet que no las va a pintar. Lo que no se usa, no se envía.
}

const mesas = (n) => `${n} ${n === 1 ? "mesa" : "mesas"}`;

/**
 * Las dos frases de la cabecera, en una sola línea de pantalla.
 *
 * → { principal, secundario }
 *
 * Lo GRANDE es lo que queda por llegar, porque es lo que se hace con esto: mirar de reojo
 * cuántas mesas vienen. El total del día va detrás y en pequeño; interesa al cerrar, no a
 * media tarde. Sin reloj no se puede decir «quedan», así que se enseña el día y ya está.
 */
export function cabeceraDelDia({ totalReservas = 0, totalPersonas = 0, porLlegar = 0,
  personasPorLlegar = 0, hayHora = true } = {}) {
  if (!totalReservas) return null;
  const total = `${totalReservas} ${totalReservas === 1 ? "reserva" : "reservas"} hoy · ${totalPersonas} pax`;
  if (!hayHora) return { principal: total, secundario: "" };
  if (!porLlegar) return { principal: "No queda ninguna mesa", secundario: total };
  // Antes de abrir, «quedan» y «hoy» son el mismo número: decirlo dos veces con distintas
  // palabras hace dudar de si son dos datos distintos. Se enseña solo el del día.
  if (porLlegar === totalReservas) return { principal: total, secundario: "" };
  return { principal: `Quedan ${mesas(porLlegar)} · ${personasPorLlegar} pax`, secundario: total };
}
