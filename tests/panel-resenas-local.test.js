import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Reseñas tenía DOS formas de elegir local además de la de la barra de arriba: una fila de
// píldoras que filtraba pero no informaba, y otra («Lloret · 4.2★ · 13 pend») que informaba
// pero no se podía pulsar. Tres selectores para lo mismo, ninguno completo. Manda el de la
// barra, como en el resto del panel.
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const bloqueReviews = panel.slice(panel.indexOf("VISTA: RESEÑAS"), panel.indexOf("function openResponder"));

describe("Reseñas obedece al selector de la barra", () => {
  test("no quedan píldoras de local en la pantalla", () => {
    assert.doesNotMatch(panel, /data-act="rev-local"/);
    assert.doesNotMatch(panel, /function revSetLocal/);
  });

  test("ni la fila de «★ · N pend», que no se podía pulsar", () => {
    assert.doesNotMatch(bloqueReviews, /pend<\/span>|· \$\{x\.pendientes\} pend/);
    assert.doesNotMatch(bloqueReviews, /REV_RESUMEN/);
  });

  test("el establecimiento sale del selector de la barra", () => {
    assert.match(bloqueReviews, /localActualFE\(\)/);
    assert.doesNotMatch(bloqueReviews, /REVF\.local/, "la pantalla ya no tiene filtro de local propio");
  });

  test("y se dice cuál se está mirando, que es lo que hacían las píldoras", () => {
    assert.match(bloqueReviews, /viendoVarios\(\) \? etiquetaAmbito\(\)/);
  });

  test("con varios locales se pide UNA vez por local y se juntan", () => {
    // Mismo camino que reservas y facturas: no se reescribe el filtrado del servidor.
    assert.match(bloqueReviews, /async function revPedir/);
    assert.match(bloqueReviews, /locales\.map\(\(l\) => apiSend\("GET", montaUrl\(l\)\)/);
  });

  test("juntando dos listas ordenadas hay que volver a ordenar", () => {
    // Pegar dos listas ordenadas no da una lista ordenada: saldría un local detrás del otro.
    assert.match(bloqueReviews, /revOrdenar\(partes\.flatMap/);
  });

  test("y los contadores se suman, no se coge el del primero", () => {
    assert.match(bloqueReviews, /suma\("total"\)/);
  });
});

describe("«Sin responder» sigue estando, y solo una vez", () => {
  test("está en el desplegable de Estado", () => {
    assert.match(bloqueReviews, /\["pendientes", "Sin responder"\]/);
  });

  test("y viaja al servidor, que lo traduce a «sin respuesta»", () => {
    assert.match(bloqueReviews, /"rating", "estado", "q", "autor", "from", "to", "sort"/);
    const servicio = readFileSync(new URL("../src/modules/reviews/reviews.service.js", import.meta.url), "utf8");
    assert.match(servicio, /f\.estado === "pendientes"\) cond\.push\("\(reply IS NULL OR reply = ''\)"\)/);
  });

  test("no se ha duplicado en un botón aparte: un solo sitio para el mismo filtro", () => {
    const veces = (bloqueReviews.match(/Sin responder/g) || []).length;
    assert.equal(veces, 1, "hay más de un «Sin responder» en la pantalla");
  });
});

describe("el nombre de la ficha de Google no se toca", () => {
  test("el local se traduce a fichas con locationNamesDeLocal, no se compara a pelo", () => {
    const manage = server.slice(server.indexOf('app.get("/api/reviews/manage"'), server.indexOf("// Genera un borrador"));
    assert.match(manage, /locationNamesDeLocal\(scope, allNames\)/);
    assert.doesNotMatch(manage, /UPDATE google_reviews SET location_name/, "renombrar la ficha rompería el casado");
  });

  test("si no casa ninguna ficha se dice, en vez de enseñar cero sin explicación", () => {
    const manage = server.slice(server.indexOf('app.get("/api/reviews/manage"'), server.indexOf("// Genera un borrador"));
    assert.match(manage, /sinFicha/);
    assert.match(bloqueReviews, /no tiene ninguna ficha de Google vinculada/);
    assert.match(bloqueReviews, /Vincular fichas de Google/);
  });

  test("con dos locales solo se avisa si le pasa a los dos", () => {
    // Con uno bien vinculado sí hay reseñas: el aviso sería falso.
    assert.match(bloqueReviews, /partes\.every\(\(p\) => p\.sinFicha\)/);
  });
});
