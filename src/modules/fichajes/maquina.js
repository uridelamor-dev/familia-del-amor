// Fichajes — máquina de estados. PURA: recibe los eventos vivos de una jornada y dice en
// qué estado está la persona y qué botones tiene sentido enseñarle.
//
// Está pensada para una tablet en la barra, con prisa y las manos mojadas. Eso marca tres
// decisiones que parecen detalles y no lo son:
//
//   · Salir estando en pausa CIERRA la pausa. Nadie se acuerda de dar a "volver" antes de
//     irse, y si el sistema lo exige acaba habiendo pausas abiertas toda la noche.
//   · Tocar dos veces el mismo botón en menos de un minuto es un rebote de pantalla táctil,
//     no dos fichajes. Se ignora el segundo.
//   · Salir sin haber entrado SE REGISTRA IGUAL. Nunca se rechaza registrar la realidad:
//     se anota y se marca como incidencia para que lo mire una persona. Un sistema que dice
//     "no puedes fichar" a alguien que acaba de trabajar seis horas es peor que inútil.

export const FUERA = "fuera";
export const DENTRO = "dentro";
export const PAUSA = "pausa";

export const ACCIONES = {
  [FUERA]: [{ tipo: "entrada", etiqueta: "Entrar", principal: true }],
  [DENTRO]: [
    { tipo: "pausa_inicio", etiqueta: "Pausa" },
    { tipo: "salida", etiqueta: "Salir", principal: true },
  ],
  [PAUSA]: [
    { tipo: "pausa_fin", etiqueta: "Volver", principal: true },
    { tipo: "salida", etiqueta: "Salir" },
  ],
};

// Estado a partir de los eventos NO anulados de la jornada, en orden.
export function estadoDe(eventos = []) {
  let estado = FUERA;
  for (const e of ordenados(eventos)) {
    if (e.anulado_por) continue;
    if (e.tipo === "entrada") estado = DENTRO;
    else if (e.tipo === "salida") estado = FUERA;
    else if (e.tipo === "pausa_inicio" && estado === DENTRO) estado = PAUSA;
    else if (e.tipo === "pausa_fin" && estado === PAUSA) estado = DENTRO;
  }
  return estado;
}

export function accionesPermitidas(estado) {
  return ACCIONES[estado] || ACCIONES[FUERA];
}

const ordenados = (evs) => [...evs].sort((a, b) => Number(a.epoch_ms) - Number(b.epoch_ms) || Number(a.id) - Number(b.id));

// ¿Se puede hacer esta acción ahora? Devuelve qué pasaría, y por qué si no.
//
// `registrar` distingue lo que se guarda de lo que solo se avisa:
//   registrar:true  + incidencia → se guarda Y se marca para revisión
//   registrar:false + duplicado  → NO se guarda (rebote de la pantalla)
//   registrar:false + error      → NO se guarda y se explica al usuario
export function evaluar(eventos, tipo, ahoraMs, { ventanaDuplicadoSeg = 60 } = {}) {
  const vivos = ordenados(eventos).filter((e) => !e.anulado_por);
  const ultimo = vivos[vivos.length - 1];
  const estado = estadoDe(vivos);

  // Rebote táctil: mismo botón, misma persona, menos de un minuto.
  if (ultimo && ultimo.tipo === tipo && Math.abs(Number(ahoraMs) - Number(ultimo.epoch_ms)) < ventanaDuplicadoSeg * 1000) {
    return { registrar: false, duplicado: true, estado, mensaje: "Ya estaba fichado hace un momento." };
  }

  switch (tipo) {
    case "entrada":
      if (estado === DENTRO || estado === PAUSA) {
        return { registrar: false, error: "ya_dentro", estado,
          mensaje: `Ya habías entrado${ultimo ? " a las " + horaDe(ultimo) : ""}.` };
      }
      return { registrar: true, estado: DENTRO };

    case "pausa_inicio":
      if (estado === FUERA) return { registrar: false, error: "sin_entrada", estado, mensaje: "Primero tienes que fichar la entrada." };
      if (estado === PAUSA) return { registrar: false, error: "ya_en_pausa", estado, mensaje: "Ya estabas en pausa." };
      return { registrar: true, estado: PAUSA };

    case "pausa_fin":
      if (estado !== PAUSA) return { registrar: false, error: "sin_pausa", estado, mensaje: "No tenías ninguna pausa abierta." };
      return { registrar: true, estado: DENTRO };

    case "salida":
      if (estado === FUERA) {
        // Se registra igual: pasó de verdad, y que lo arregle un humano.
        return { registrar: true, estado: FUERA, incidencia: "sin_entrada",
          mensaje: "No constaba tu entrada. Queda registrada la salida y lo revisará tu encargado." };
      }
      // Salir estando en pausa la cierra sola.
      return { registrar: true, estado: FUERA, cierraPausa: estado === PAUSA };

    default:
      return { registrar: false, error: "tipo_desconocido", estado, mensaje: "Acción no válida." };
  }
}

const horaDe = (e) => String(e.ocurrido_en || "").slice(11, 16);

// Minutos trabajados y de pausa de una jornada, a partir de los eventos vivos.
// SIEMPRE se resta epoch: en las noches del cambio de hora el reloj de pared miente.
// Devuelve también si quedó algo abierto, que es lo que genera la incidencia.
// `hastaMs` cierra virtualmente lo que quede abierto para poder enseñar el tiempo que
// alguien LLEVA hoy. No inventa ningún evento ni toca la base: es solo para la pantalla.
// Lo fichado sigue siendo lo fichado; por eso el resultado viene marcado con `enCurso`.
export function calcularJornada(eventos = [], { hastaMs = null } = {}) {
  const vivos = ordenados(eventos).filter((e) => !e.anulado_por);
  let entrada = null, pausaIni = null;
  let trabajado = 0, pausa = 0;
  let sinEntrada = false, sinSalida = false;

  for (const e of vivos) {
    const t = Number(e.epoch_ms);
    if (e.tipo === "entrada") { entrada = t; pausaIni = null; }
    else if (e.tipo === "pausa_inicio") { if (entrada != null) pausaIni = t; }
    else if (e.tipo === "pausa_fin") { if (pausaIni != null) { pausa += t - pausaIni; pausaIni = null; } }
    else if (e.tipo === "salida") {
      if (entrada == null) { sinEntrada = true; continue; }
      if (pausaIni != null) { pausa += t - pausaIni; pausaIni = null; }   // salir cierra la pausa
      trabajado += t - entrada;
      entrada = null;
    }
  }
  const abiertaDesdeMs = entrada;
  if (entrada != null) sinSalida = true;      // se fue sin fichar la salida

  let enCurso = false;
  if (entrada != null && hastaMs != null && Number(hastaMs) > entrada) {
    if (pausaIni != null) { pausa += Number(hastaMs) - pausaIni; pausaIni = null; }
    trabajado += Number(hastaMs) - entrada;
    entrada = null;
    enCurso = true;
  }

  return {
    enCurso,
    minPresencia: Math.round(trabajado / 60000),
    minPausa: Math.round(pausa / 60000),
    minEfectivo: Math.max(0, Math.round((trabajado - pausa) / 60000)),
    sinEntrada, sinSalida,
    abierta: sinSalida,
    // Desde cuándo lleva abierta. Sin esto no se puede distinguir "está trabajando ahora"
    // de "se marchó y olvidó fichar", que en la tabla de hoy son la misma fila.
    abiertaDesdeMs,
  };
}

// ¿Hay que avisar de que falta la salida? A media tarde NO: todo el que está dentro tiene
// la jornada abierta, y marcarlos a todos en rojo hace que el aviso deje de significar nada.
// Solo cuando el día ya está cerrado, o cuando lleva tantas horas que no puede ser real.
export const HORAS_ABSURDAS = 14;
export function faltaLaSalida(jornada, { diaCerrado = false, ahoraMs = Date.now() } = {}) {
  if (!jornada || !jornada.sinSalida) return false;
  if (diaCerrado) return true;
  if (jornada.abiertaDesdeMs == null) return true;
  return (ahoraMs - Number(jornada.abiertaDesdeMs)) / 3600000 > HORAS_ABSURDAS;
}
