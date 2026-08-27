import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nifValido, esNuestra, corregirEmisorReceptor, normNif } from "../../src/modules/facturas/emisor.js";

// El caso real: factura de EUROCONTA a «DEL AMOR SALINAS, MATEO», que es el nombre fiscal de
// La Tapa Ibérica. La lectura puso al cliente como proveedor, y como NIF cogió el número de
// cliente que la gestoría nos tiene asignado.
const NUESTRAS = [
  { empresa: "Mateu Del Amor Salinas", cif: "43512345P" },   // nuestro CIF NO sale en esa factura
  { empresa: "Familia del Amor SL", cif: "B12345678" },
];
const MAL_LEIDA = {
  proveedor: "DEL AMOR SALINAS, MATEO", nif_proveedor: "430001836",
  nombre_receptor: "EUROCONTA ASSESSORIA", nif_receptor: "46535781L",
  numero_factura: "2602278", total: 133.1,
};

describe("el caso de Euroconta", () => {
  const r = corregirEmisorReceptor(MAL_LEIDA, NUESTRAS);
  test("se da cuenta de que el «proveedor» somos nosotros", () => {
    assert.equal(r.corregido, true);
  });
  test("y los cambia: Euroconta pasa a ser el proveedor", () => {
    assert.equal(r.datos.proveedor, "EUROCONTA ASSESSORIA");
    assert.equal(r.datos.nif_proveedor, "46535781L");
  });
  test("nosotros pasamos a ser quien recibe", () => {
    assert.equal(r.datos.nombre_receptor, "DEL AMOR SALINAS, MATEO");
  });
  test("y lo explica en el aviso, para que se pueda comprobar", () => {
    assert.match(r.aviso, /somos nosotros/);
    assert.match(r.aviso, /EUROCONTA/);
  });
  test("no toca nada más de la factura", () => {
    assert.equal(r.datos.numero_factura, "2602278");
    assert.equal(r.datos.total, 133.1);
  });
});

describe("reconocer que una empresa es nuestra", () => {
  test("por el CIF, aunque venga con puntos y guiones", () => {
    assert.equal(esNuestra("Lo que sea", "43.512.345-P", NUESTRAS), "cif");
  });
  test("por el nombre, aunque esté en otro orden", () => {
    // «DEL AMOR SALINAS, MATEO» y «Mateu Del Amor Salinas».
    assert.ok(esNuestra("DEL AMOR SALINAS, MATEO", null, NUESTRAS));
  });
  test("y con acentos o mayúsculas distintas", () => {
    assert.ok(esNuestra("familia del amor sl", null, NUESTRAS));
  });
  test("un proveedor cualquiera NO es nuestro", () => {
    for (const n of ["EUROCONTA ASSESSORIA", "Grau Distribucions", "Makro", ""]) {
      assert.equal(esNuestra(n, "B17972860", NUESTRAS), null, n);
    }
  });
  test("sin lista de empresas no se afirma nada", () => {
    assert.equal(esNuestra("Lo que sea", "B1", []), null);
  });
});

describe("el NIF tiene que poder ser un NIF", () => {
  test("«430001836» no lo es: son nueve dígitos sin letra, es el número de cliente", () => {
    assert.equal(nifValido("430001836"), false);
  });
  test("un DNI con su letra sí", () => {
    assert.equal(nifValido("12345678Z"), true);
    assert.equal(nifValido("12345678A"), false, "la letra tiene que cuadrar");
  });
  test("un CIF de sociedad también", () => {
    assert.equal(nifValido("B17972860"), true);
    assert.equal(nifValido("A58818501"), true);
  });
  test("un NIE también", () => {
    assert.equal(nifValido("X1234567L"), true);
  });
  test("y lo que no tiene forma de nada, no", () => {
    for (const v of ["", null, "CLIENTE 12", "1234", "ABCDEFGHI"]) assert.equal(nifValido(v), false, String(v));
  });
  test("se avisa cuando el NIF no puede serlo, aunque no haya nada que cambiar", () => {
    const r = corregirEmisorReceptor({ proveedor: "Euroconta", nif_proveedor: "430001836" }, NUESTRAS);
    assert.equal(r.corregido, false);
    assert.match(r.aviso, /número de cliente/);
  });
});

describe("cuándo NO se toca nada", () => {
  test("una factura bien leída se queda igual y sin aviso", () => {
    const buena = { proveedor: "Grau", nif_proveedor: "B17972860", nombre_receptor: "Familia del Amor SL", nif_receptor: "B12345678" };
    const r = corregirEmisorReceptor(buena, NUESTRAS);
    assert.equal(r.corregido, false);
    assert.equal(r.aviso, null);
    assert.deepEqual(r.datos, buena);
  });
  test("si somos el proveedor pero no hay otro nombre, NO se inventa uno", () => {
    // Cambiar los datos a medias es peor que dejarlos mal: encima parece revisado.
    const r = corregirEmisorReceptor({ proveedor: "Mateu Del Amor Salinas", nif_proveedor: "43512345P" }, NUESTRAS);
    assert.equal(r.corregido, false);
    assert.match(r.aviso, /Revisa quién emite/);
  });
  test("si los dos parecen nuestros, tampoco: se pregunta", () => {
    const r = corregirEmisorReceptor(
      { proveedor: "Mateu Del Amor Salinas", nif_proveedor: "43512345P", nombre_receptor: "Familia del Amor SL", nif_receptor: "B12345678" },
      NUESTRAS);
    assert.equal(r.corregido, false);
    assert.match(r.aviso, /Revísalo/);
  });
});

describe("normNif", () => {
  test("quita puntos, guiones, barras y espacios", () => {
    assert.equal(normNif(" b-17.972/860 "), "B17972860");
  });
});

describe("cableado: por qué el filtro que ya existía no saltaba", () => {
  test("ya no se compara el nombre por igualdad exacta contra la base", () => {
    // Era `UPPER(TRIM(empresa)) = UPPER(TRIM(?))`: «DEL AMOR SALINAS, MATEO» no es igual,
    // letra por letra, a «Mateu Del Amor Salinas», así que no filtraba nada.
    const src = readFileSync(new URL("../../facturas.js", import.meta.url), "utf8");
    assert.ok(!/UPPER\(TRIM\(empresa\)\) = UPPER\(TRIM\(\?\)\)/.test(src),
      "la comparación literal tiene que haber desaparecido");
    // Y ahora se le pasan también los nombres CON LOS QUE EXISTIMOS DE CARA AL MUNDO —«LA
    // TAPETA», «CAN MATEU»— además del nombre fiscal: en una factura ponemos esos, no «DEL AMOR
    // URIEL SLU», y sin ellos esas facturas entraban con nosotros mismos como proveedor.
    assert.match(src, /corregirEmisorReceptor\(datos, nuestras, propios\)/);
    assert.match(src, /nombresPropios\(LOCALES, marcados\.map/);
  });
});
