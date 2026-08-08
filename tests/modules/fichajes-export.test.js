import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { celda, filaDeEvento, construirCsv, nombreFicheroRegistro, CABECERAS } from "../../src/modules/fichajes/export.js";

const ev = (extra = {}) => ({
  nombre: "Ana Ruiz Soler", dni: "12345678Z", dia_negocio: "2026-08-08",
  tipo: "entrada", ocurrido_en: "2026-08-08T20:00:00+02:00", origen: "kiosco",
  autor: null, motivo: null, anulado_por: null, ...extra,
});

describe("export — las celdas no rompen el fichero", () => {
  test("lo normal va tal cual", () => {
    assert.equal(celda("Ana Ruiz"), "Ana Ruiz");
    assert.equal(celda(""), "");
    assert.equal(celda(null), "");
  });
  test("UN PUNTO Y COMA EN EL MOTIVO NO PARTE LA FILA", () => {
    assert.equal(celda("se fue; volvió a las 22h"), '"se fue; volvió a las 22h"');
  });
  test("las comillas se duplican", () => {
    assert.equal(celda('dijo "me voy"'), '"dijo ""me voy"""');
  });
  test("un salto de línea también se entrecomilla", () => {
    assert.equal(celda("linea1\nlinea2"), '"linea1\nlinea2"');
  });
});

describe("export — la fila cuenta lo que pasó", () => {
  test("un fichaje normal de tablet", () => {
    assert.deepEqual(filaDeEvento(ev()),
      ["Ana Ruiz Soler", "12345678Z", "2026-08-08", "Entrada", "20:00", "Tablet", "", "", ""]);
  });
  test("uno metido a mano dice QUIÉN y POR QUÉ", () => {
    const f = filaDeEvento(ev({ tipo: "salida", origen: "manual", autor: "direccion", motivo: "Se fue y olvidó fichar" }));
    assert.equal(f[3], "Salida");
    assert.equal(f[5], "Introducido a mano");
    assert.equal(f[6], "direccion");
    assert.equal(f[7], "Se fue y olvidó fichar");
  });
  test("la hora sale del instante guardado, con su huso", () => {
    assert.equal(filaDeEvento(ev({ ocurrido_en: "2026-08-09T02:10:00+02:00" }))[4], "02:10");
  });
  test("un tipo desconocido no se traga la fila", () => {
    assert.equal(filaDeEvento(ev({ tipo: "raro" }))[3], "raro");
  });
});

describe("export — el fichero entero", () => {
  test("empieza por el BOM y usa CRLF: Excel en español lo abre a la primera", () => {
    const csv = construirCsv([ev()]);
    assert.ok(csv.startsWith("﻿"), "sin BOM, los acentos salen rotos");
    assert.ok(csv.includes("\r\n"));
    assert.equal(csv.split("\r\n")[0].replace("﻿", ""), CABECERAS.join(";"));
  });

  test("LOS ANULADOS VAN DENTRO, marcados: no se entrega un registro depurado", () => {
    const csv = construirCsv([ev(), ev({ tipo: "salida", anulado_por: 12 })]);
    const filas = csv.trim().split("\r\n");
    assert.equal(filas.length, 3, "cabecera + los dos fichajes");
    assert.ok(filas[2].endsWith(";SI"), "el anulado se ve, no desaparece");
  });

  test("un fichero sin eventos sigue siendo un CSV válido, no una cadena vacía", () => {
    const csv = construirCsv([]);
    assert.equal(csv.trim().split("\r\n").length, 1);
    assert.ok(csv.includes("Trabajador"));
  });

  test("cada fila tiene tantas columnas como la cabecera, pase lo que pase", () => {
    const csv = construirCsv([
      ev({ motivo: "con ; y \"comillas\"" }),
      ev({ nombre: "Josep L·luís Ferrà", dni: null, autor: "encargado" }),
    ]);
    // Se cuentan los `;` que están FUERA de comillas, que son los separadores de verdad.
    for (const fila of csv.replace("﻿", "").trim().split("\r\n")) {
      let dentro = false, sep = 0;
      for (let i = 0; i < fila.length; i++) {
        if (fila[i] === '"') dentro = !dentro;
        else if (fila[i] === ";" && !dentro) sep++;
      }
      assert.equal(sep, CABECERAS.length - 1, `fila con ${sep + 1} columnas: ${fila}`);
    }
  });
});

describe("export — el nombre del fichero", () => {
  test("sin espacios ni acentos: sobrevive al correo y al USB del gestor", () => {
    assert.equal(nombreFicheroRegistro("La Tapeta - Blanes", "2026-08"), "registro-jornada_la-tapeta-blanes_2026-08.csv");
    assert.equal(nombreFicheroRegistro("Botiga d'en Mateu", "2026-08"), "registro-jornada_botiga-d-en-mateu_2026-08.csv");
  });
  test("no deja guiones sueltos al principio ni al final", () => {
    assert.equal(nombreFicheroRegistro("  Oficina  ", "2026-01"), "registro-jornada_oficina_2026-01.csv");
  });
  test("sin local no se genera un nombre roto", () => {
    assert.match(nombreFicheroRegistro(null, "2026-01"), /^registro-jornada_local_2026-01\.csv$/);
  });
});
