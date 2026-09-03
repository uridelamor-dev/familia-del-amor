// Los estados de Mantenimiento, escritos en un solo sitio de verdad.
//
// POR QUÉ ESTE TEST EXISTE: durante meses hubo dos pantallas mandando estados distintos para
// la misma cosa. El panel mandaba «en proceso»/«resuelta» y `public/mantenimiento.html` —una
// página que no enlazaba nadie pero que se servía igual— mandaba «en_proceso»/«cerrada». Como
// el `PUT` guardaba en crudo lo que llegara, una incidencia podía quedarse en un estado que no
// salía en ningún filtro del panel y que el Dashboard contaba como abierta para siempre.
//
// Ahora los valores buenos viven en src/modules/mantenimiento/estados.js. El problema es que
// el panel se carga como script clásico (`<script src="app.js">`, no módulo) y no puede
// importarlo, así que tiene una COPIA. Este test es lo que impide que las dos copias se
// separen: lee los ficheros como texto y comprueba que dicen lo mismo.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { ESTADOS, SIGUIENTE } from "../src/modules/mantenimiento/estados.js";

const url = (r) => new URL(r, import.meta.url);
const panel = readFileSync(url("../public/panel/app.js"), "utf8");
const dashboard = readFileSync(url("../src/modules/dashboard/dashboard.service.js"), "utf8");
const servicio = readFileSync(url("../src/modules/mantenimiento/maintenance.service.js"), "utf8");

// Del `const MANT_ESTADOS = ["a", "b"]` del panel a un array de verdad.
function arrayLiteral(texto, nombre) {
  const m = texto.match(new RegExp(`const ${nombre} = \\[([^\\]]*)\\]`));
  assert.ok(m, `no encuentro ${nombre} en el panel`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe("Mantenimiento · el panel no se separa de estados.js", () => {
  test("la lista de estados del panel es la misma, y en el mismo orden", () => {
    assert.deepEqual(arrayLiteral(panel, "MANT_ESTADOS"), ESTADOS,
      "añadiste un estado en estados.js y el desplegable del panel no lo ofrece (o al revés)");
  });

  test("la máquina de estados del panel es la misma", () => {
    const m = panel.match(/const MANT_SIGUIENTE = \{([^}]*\}[^}]*)\}/);
    assert.ok(m, "no encuentro MANT_SIGUIENTE en el panel");
    const desde = [...m[1].matchAll(/"([^"]+)":\s*\[/g)].map((x) => x[1]);
    assert.deepEqual(desde.sort(), Object.keys(SIGUIENTE).sort(),
      "el botón de avanzar del panel y SIGUIENTE ya no cuentan lo mismo");
    for (const d of desde) {
      const destino = m[1].match(new RegExp(`"${d}":\\s*\\["([^"]+)"`))[1];
      assert.equal(destino, SIGUIENTE[d], `desde «${d}» el panel lleva a «${destino}» y estados.js a «${SIGUIENTE[d]}»`);
    }
  });

  test("cada estado tiene color de píldora en el panel, y no sobra ninguno", () => {
    const m = panel.match(/const EST_PILL = \{([^}]*)\}/);
    assert.ok(m, "no encuentro EST_PILL");
    assert.deepEqual([...m[1].matchAll(/"([^"]+)":/g)].map((x) => x[1]).sort(), [...ESTADOS].sort());
  });
});

describe("Mantenimiento · los nombres viejos no vuelven", () => {
  // Ojo con buscar estas cadenas en todo el fichero: «cerrada» es una palabra legítima en
  // Conciliación de facturas (que tiene su propio estado «cerrada», sin relación) y en la
  // prosa de los comentarios. Se mira SOLO donde hablan de mantenimiento.
  const prohibidas = ["en_proceso", "'cerrada'", '"cerrada"'];

  // La sección de Mantenimiento del panel, del banner al siguiente banner.
  const seccion = panel.slice(panel.indexOf("VISTA: MANTENIMIENTO"));
  const mant = seccion.slice(0, seccion.indexOf("VISTA: INVENTARIOS"));

  test("la sección del panel está bien delimitada", () => {
    assert.ok(mant.length > 500 && mant.length < seccion.length, "los banners de sección cambiaron: arregla el recorte");
    assert.ok(mant.includes("renderMant"), "no he recortado la sección de Mantenimiento");
  });

  for (const mala of prohibidas) {
    test(`la sección de Mantenimiento del panel no menciona ${mala}`, () => {
      assert.ok(!mant.includes(mala),
        `${mala} es un estado que ya no existe: usa los de src/modules/mantenimiento/estados.js`);
    });
  }

  test("ninguna consulta a maintenance_issues escribe estados a mano", () => {
    const lineas = dashboard.split("\n").filter((l) => l.includes("maintenance_issues"));
    assert.ok(lineas.length >= 4, "esperaba al menos las cuatro consultas de mantenimiento");
    for (const l of lineas) {
      for (const mala of prohibidas) {
        assert.ok(!l.includes(mala), `${mala} sigue escrito a mano en: ${l.trim().slice(0, 90)}…`);
      }
      assert.ok(!l.includes("NOT IN"),
        `la lista de estados vuelve a estar en negativo; en negativo un estado nuevo entra solo en el recuento: ${l.trim().slice(0, 90)}…`);
    }
  });

  test("el servicio no escribe el estado sin pasarlo por normalizarEstado", () => {
    assert.ok(servicio.includes("normalizarEstado"), "el PUT dejó de validar el estado");
    assert.ok(!/SET estado = \?[^]*?\[estado[,\]]/.test(servicio),
      "hay un UPDATE guardando el `estado` crudo del cliente en vez del normalizado");
  });
});

describe("Mantenimiento · la página vieja sigue borrada", () => {
  // Se servía como estático, así que aunque no la enlazara nadie era alcanzable por URL y su
  // único efecto posible era meter estados que el panel no entiende.
  for (const f of ["../public/mantenimiento.html", "../public/mantenimiento.js"]) {
    test(`${f.replace("../", "")} no existe`, () => {
      assert.ok(!existsSync(url(f)), "volvió la página vieja: escribía «en_proceso» y «cerrada»");
    });
  }
});
