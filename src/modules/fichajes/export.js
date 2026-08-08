// Fichajes — el registro que se entrega. PURO.
//
// El art. 34.9 del Estatuto de los Trabajadores dice que el registro debe estar «a
// disposición de las personas trabajadoras, sus representantes legales y la Inspección de
// Trabajo». Un fichero que hay que pelear con el asistente de importación de Excel no está
// a disposición de nadie, así que:
//
//   · Separador `;` y BOM UTF-8, que es lo que Excel en español abre a la primera.
//   · Fin de línea CRLF, por lo mismo.
//   · LOS EVENTOS ANULADOS VAN DENTRO, marcados. Entregar el registro «limpio» sería
//     entregar una versión depurada, que es exactamente lo contrario de lo que se pide:
//     lo que prueba que el registro es honesto es que se vean las correcciones.

export const CABECERAS = [
  "Trabajador", "DNI", "Dia de trabajo", "Fichaje", "Hora",
  "Origen", "Introducido por", "Motivo", "Anulado",
];

export const NOMBRE_TIPO = {
  entrada: "Entrada", salida: "Salida",
  pausa_inicio: "Inicio pausa", pausa_fin: "Fin pausa",
};
export const NOMBRE_ORIGEN = {
  kiosco: "Tablet", kiosco_offline: "Tablet (sin conexion)",
  manual: "Introducido a mano", importado: "Importado",
};

// Una celda de CSV. Se entrecomilla si lleva separador, comillas o salto de línea, y las
// comillas de dentro se duplican. Sin esto, un motivo como «se fue; volvió a las 22h»
// partiría la fila y el fichero contaría otra cosa.
export function celda(valor) {
  const s = String(valor == null ? "" : valor);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function filaDeEvento(e) {
  return [
    e.nombre || "",
    e.dni || "",
    e.dia_negocio || "",
    NOMBRE_TIPO[e.tipo] || e.tipo || "",
    String(e.ocurrido_en || "").slice(11, 16),
    NOMBRE_ORIGEN[e.origen] || e.origen || "",
    e.autor || "",
    e.motivo || "",
    e.anulado_por ? "SI" : "",
  ];
}

export function construirCsv(eventos = []) {
  const lineas = [CABECERAS.join(";")];
  for (const e of eventos) lineas.push(filaDeEvento(e).map(celda).join(";"));
  return "﻿" + lineas.join("\r\n") + "\r\n";
}

// Nombre del fichero: sin espacios ni acentos, para que sobreviva a cualquier sistema por
// el que pase (correo, unidad de red, el USB del gestor).
export function nombreFicheroRegistro(local, etiqueta) {
  const limpio = String(local || "local")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `registro-jornada_${limpio}_${etiqueta}.csv`;
}
