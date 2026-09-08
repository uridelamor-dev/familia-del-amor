// Vales impresos: cupones anónimos con QR para repartir en mano.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanearTirada, nombreVale, nombreZip, numeroVale, csvDeVales, leeme,
         MAX_POR_TIRADA, USOS_POR_VALE, QR_OPCIONES, CSV_CABECERA } from "../../src/modules/promos/vales.js";

const promos = [{ id: 7 }, { id: 9 }];

describe("un vale se usa UNA vez", () => {
  test("USOS_POR_VALE es 1, y no puede ser 0", () => {
    // Éste es EL test del fichero. `usos_max = 0` significa ILIMITADO en `estadoDe()`
    // (`if (max > 0 && …)`) y en `SQL_CANJEAR` (`usos_max = 0 OR usos < usos_max`). Un vale
    // impreso emitido con 0 sería infinitamente canjeable: cien desayunos gratis con un papel.
    // El fallo no daría ningún error — se descubriría contando la caja a final de mes.
    assert.equal(USOS_POR_VALE, 1);
    assert.notEqual(USOS_POR_VALE, 0);
  });
});

describe("saneado de la tirada", () => {
  test("una tirada normal pasa entera", () => {
    const { tirada, descartados } = sanearTirada(
      { nombre: "Buzoneo Girona", promocion_id: 7, cantidad: 50, caduca_en: "2026-10-01" },
      { promociones: promos });
    assert.equal(tirada.nombre, "Buzoneo Girona");
    assert.equal(tirada.clave, "buzoneo-girona", "la clave agrupa la tirada");
    assert.equal(tirada.promocion_id, 7);
    assert.equal(tirada.cantidad, 50);
    assert.equal(tirada.caduca_en, "2026-10-01");
    assert.deepEqual(descartados, []);
  });

  test("la cantidad va entre 1 y el techo, y se dice si no", () => {
    // 1 es válido: «solo voy a hacer un vale» es un caso real y frecuente.
    assert.equal(sanearTirada({ nombre: "X Y Z", promocion_id: 7, cantidad: 1 }, { promociones: promos }).tirada.cantidad, 1);
    for (const mala of [0, -3, 1.5, MAX_POR_TIRADA + 1, "muchos", undefined]) {
      const r = sanearTirada({ nombre: "X Y Z", promocion_id: 7, cantidad: mala }, { promociones: promos });
      assert.equal(r.tirada.cantidad, 0, `${mala} no debería colar`);
      assert.ok(r.descartados.some((d) => d.campo === "cantidad"));
    }
  });

  test("una promoción que no existe se descarta y se dice", () => {
    // Una tirada apuntando a una promoción borrada serían papeles impresos que no valen en
    // ninguna barra, y se descubriría con el cliente delante del camarero.
    const r = sanearTirada({ nombre: "X Y Z", promocion_id: 123, cantidad: 5 }, { promociones: promos });
    assert.equal(r.tirada.promocion_id, null);
    assert.ok(r.descartados.some((d) => d.campo === "promocion_id"));
  });

  test("el nombre se normaliza a algo que sirva de clave", () => {
    assert.equal(sanearTirada({ nombre: "  Reparto MERCADO ñ  ", promocion_id: 7, cantidad: 5 }, { promociones: promos }).tirada.clave,
      "reparto-mercado-n");
  });

  test("sin nombre, o con uno que no da ni tres letras, se dice", () => {
    assert.ok(sanearTirada({ promocion_id: 7, cantidad: 5 }, { promociones: promos })
      .descartados.some((d) => d.campo === "nombre"));
    assert.ok(sanearTirada({ nombre: "· ·", promocion_id: 7, cantidad: 5 }, { promociones: promos })
      .descartados.some((d) => d.campo === "nombre"));
  });

  test("una fecha mal escrita se descarta, no se guarda a medias", () => {
    const r = sanearTirada({ nombre: "X Y Z", promocion_id: 7, cantidad: 5, caduca_en: "1/10/26" }, { promociones: promos });
    assert.equal(r.tirada.caduca_en, null);
    assert.ok(r.descartados.some((d) => d.campo === "caduca_en"));
  });
});

describe("los ficheros", () => {
  test("el número lleva ceros delante para que ordenen bien", () => {
    assert.equal(numeroVale(1), "001");
    assert.equal(numeroVale(42), "042");
    assert.equal(numeroVale(137), "137");
  });

  test("el nombre del fichero lleva el código dentro", () => {
    // Cuando en la imprenta se descuadra una fila, es lo único que permite volver a casar el
    // papel con su QR.
    assert.equal(nombreVale(7, "12345678"), "vale-007-12345678.svg");
    assert.equal(nombreVale(1, "12345678", "png"), "vale-001-12345678.png");
  });

  test("el ZIP se llama como la tirada", () => {
    assert.equal(nombreZip("Buzoneo Girona"), "vales-buzoneo-girona.zip");
    assert.equal(nombreZip(""), "vales-tirada.zip");
  });
});

describe("el CSV que recibe la imprenta", () => {
  const vales = [
    { codigo: "11112222", url: "https://x/cupon.html?t=A" },
    { codigo: "33334444", url: "https://x/cupon.html?t=B" },
  ];

  test("lleva BOM y punto y coma, como el resto de CSV de la casa", () => {
    // Es lo que Excel en español abre a la primera. Con coma, cualquier texto con decimales
    // parte la fila.
    const csv = csvDeVales(vales, { promocion: "Desayuno gratis" });
    assert.equal(csv.charCodeAt(0), 0xFEFF, "sin BOM, Excel se come los acentos");
    assert.ok(csv.includes(";"));
    assert.ok(csv.includes("\r\n"));
  });

  test("la columna «Fichero» casa con el nombre real del SVG", () => {
    // Es LA columna: es la que conecta cada fila con su QR en un montaje de dato variable.
    const csv = csvDeVales(vales, { promocion: "P" });
    const filas = csv.replace(/^﻿/, "").trim().split("\r\n");
    assert.equal(filas.length, 3, "cabecera + dos vales");
    assert.deepEqual(filas[0].split(";"), CSV_CABECERA);
    assert.ok(filas[1].includes(nombreVale(1, "11112222")));
    assert.ok(filas[2].includes(nombreVale(2, "33334444")));
  });

  test("lleva el código de ocho dígitos además del enlace", () => {
    // El vale tiene que llevar los ocho dígitos impresos: es lo que teclea el camarero cuando
    // el papel viene arrugado y la cámara no puede con él.
    const csv = csvDeVales(vales, {});
    assert.ok(csv.includes("11112222"));
    assert.ok(csv.includes("https://x/cupon.html?t=A"));
  });

  test("un texto con punto y coma no parte la fila", () => {
    const csv = csvDeVales([{ codigo: "1", url: "u" }], { promocion: 'Café; y "mini"' });
    const fila = csv.trim().split("\r\n")[1];
    assert.ok(fila.includes('"Café; y ""mini"""'), fila);
  });
});

describe("el LÉEME del ZIP", () => {
  const t = leeme({ promocion: "Desayuno gratis", tirada: "buzoneo-girona", cantidad: 50, caducaEn: "2026-10-01" });

  test("dice el tamaño mínimo, que es el fallo caro", () => {
    // Se maqueta a 1,5 cm, no lo lee ninguna cámara, y se descubre con los vales ya impresos.
    assert.match(t, /3 cm/);
    assert.match(t, /margen blanco/i);
  });

  test("avisa de que cada vale es distinto", () => {
    // Si la imprenta repite el mismo QR en todos los papeles, la tirada entera es un solo vale.
    assert.match(t, /Cada vale es DISTINTO/);
  });

  test("cuenta lo que hay dentro y para qué sirve cada cosa", () => {
    assert.match(t, /vales\.csv/);
    assert.match(t, /vale-XXX\.svg/);
    assert.match(t, /Desayuno gratis/);
    assert.match(t, /50 vales/);
  });
});

describe("las opciones del QR", () => {
  test("corrección de errores alta: el vale vive en un bolsillo", () => {
    // El nivel por defecto (M) está pensado para una pantalla limpia. Un papel se doblará, se
    // manchará y se arrugará antes de llegar a la barra.
    assert.equal(QR_OPCIONES.errorCorrectionLevel, "Q");
  });
});
