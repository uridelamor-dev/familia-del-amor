// CAMBIAR EL ORDEN DE UN FORMULARIO YA PUBLICADO, SIN PUBLICAR UNA VERSIÓN NUEVA.
//
// ── QUÉ SE BLINDA, Y POR QUÉ IMPORTA TANTO ───────────────────────────────────────────────────
//
// Mover un campo tenía que pasar por «copiar a versión nueva y publicar», y eso tiene un coste que
// no se ve desde el panel: la versión va DENTRO de la clave con la que se decide si a alguien ya
// se le mandó su WhatsApp del alta (`alta:<clave>:v<version>:…`). Subirla rompe esa protección y
// quien ya se apuntó puede recibir el mensaje otra vez.
//
// Así que lo que hay que demostrar aquí no es que el orden cambie —eso es lo fácil— sino que NO
// cambia nada más:
//
//   · ni `version` —de ahí cuelga todo lo anterior—,
//   · ni el texto de consentimiento, que es lo que el versionado existe para proteger,
//   · ni las etiquetas, la visibilidad ni la obligatoriedad de ningún campo,
//   · ni la campaña, ni la promoción, ni el estado.
//
// Y que el teléfono siga siendo obligatorio y visible aunque acabe el último de la lista.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reordenarCampos, normalizarCampos } from "../src/modules/fidelizacion/contenido.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

/** La ruta entera, desde su firma hasta el `});` que la cierra. */
const ruta = (firma) => {
  const i = server.indexOf(firma);
  assert.ok(i >= 0, `no existe la ruta ${firma}`);
  const f = server.indexOf("\n});", i);
  assert.ok(f > i, `la ruta ${firma} no se cierra`);
  return server.slice(i, f + 4);
};

const FIRMA = 'app.patch("/api/fidelizacion/formularios/:id/orden"';

/** Un formulario guardado de verdad, con el orden «malo» del que se parte. */
const guardados = normalizarCampos([
  { id: "nombre", visible: true, obligatorio: true, etiqueta: "Nom" },
  { id: "telefono", visible: true, obligatorio: true, etiqueta: "Telèfon" },
  { id: "apellidos", visible: true, obligatorio: true, etiqueta: "Cognoms" },
  { id: "email", visible: true, obligatorio: false, etiqueta: "Correu electrònic" },
  { id: "poblacion", visible: true, obligatorio: false, etiqueta: "Població" },
  { id: "nacimiento", visible: true, obligatorio: false, etiqueta: "Data de naixement" },
  { id: "local", visible: false, obligatorio: false, etiqueta: "Local preferit" },
]);
const ids = guardados.map((c) => c.id);

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("solo se acepta una permutación exacta", () => {
  test("el mismo conjunto en otro orden: se acepta", () => {
    const r = reordenarCampos(guardados,
      ["nombre", "apellidos", "telefono", "email", "poblacion", "nacimiento", "local"]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.campos.map((c) => c.id),
      ["nombre", "apellidos", "telefono", "email", "poblacion", "nacimiento", "local"]);
  });

  test("añadir un campo: se rechaza", () => {
    // Si esto colara, el orden sería una puerta trasera para pedirle al cliente algo que nadie
    // aprobó en el formulario.
    const r = reordenarCampos(guardados, [...ids, "codigo_postal"]);
    assert.equal(r.ok, false);
    assert.match(r.error, /8 campos y el formulario tiene 7/);
  });

  test("quitar un campo: se rechaza", () => {
    const r = reordenarCampos(guardados, ids.slice(0, -1));
    assert.equal(r.ok, false);
    assert.match(r.error, /6 campos y el formulario tiene 7/);
  });

  test("repetir un campo: se rechaza", () => {
    // Con el mismo número de elementos, repetir uno implica perder otro. La cuenta cuadra y el
    // conjunto no: por eso se comprueban las dos cosas y no solo la longitud.
    const r = reordenarCampos(guardados, ["nombre", "nombre", ...ids.slice(2)]);
    assert.equal(r.ok, false);
    assert.match(r.error, /repite/);
  });

  test("un identificador inventado: se rechaza", () => {
    const r = reordenarCampos(guardados, [...ids.slice(0, -1), "dni"]);
    assert.equal(r.ok, false);
    assert.match(r.error, /«dni»/);
  });

  test("sin orden, o con algo que no es una lista: se rechaza", () => {
    for (const malo of [null, undefined, "nombre,telefono", 7, { 0: "nombre" }]) {
      assert.equal(reordenarCampos(guardados, malo).ok, false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("LO ÚNICO QUE CAMBIA ES EL SITIO", () => {
  const nuevoOrden = ["nombre", "apellidos", "telefono", "email", "poblacion", "nacimiento", "local"];

  test("las fichas salen de lo guardado, NUNCA de lo que llega", () => {
    // Se manda el orden con fichas completas y mentirosas: teléfono opcional e invisible, y una
    // etiqueta reescrita. Nada de eso puede entrar — del cuerpo solo se usa el NOMBRE.
    const r = reordenarCampos(guardados, [
      { id: "nombre", etiqueta: "PIRATEADO", visible: false, obligatorio: false },
      { id: "apellidos", etiqueta: "PIRATEADO" },
      { id: "telefono", visible: false, obligatorio: false, etiqueta: "PIRATEADO" },
      { id: "email", obligatorio: true },
      { id: "poblacion", obligatorio: true },
      { id: "nacimiento", obligatorio: true },
      { id: "local", visible: true },
    ]);
    assert.equal(r.ok, true);
    assert.ok(!JSON.stringify(r.campos).includes("PIRATEADO"), "una etiqueta del cuerpo ha entrado");
    for (const c of r.campos) {
      assert.deepEqual(c, guardados.find((g) => g.id === c.id),
        `la ficha de «${c.id}» no es la guardada`);
    }
  });

  test("el teléfono sigue obligatorio y visible aunque vaya el último", () => {
    const r = reordenarCampos(guardados, [...ids.filter((i) => i !== "telefono"), "telefono"]);
    assert.equal(r.ok, true);
    assert.equal(r.campos[r.campos.length - 1].id, "telefono");
    assert.equal(r.campos[r.campos.length - 1].obligatorio, true);
    assert.equal(r.campos[r.campos.length - 1].visible, true);
  });

  test("un campo oculto sigue oculto: ordenar no lo enciende", () => {
    const r = reordenarCampos(guardados, ["local", ...ids.filter((i) => i !== "local")]);
    assert.equal(r.campos[0].id, "local");
    assert.equal(r.campos[0].visible, false);
  });

  test("el conjunto de fichas es idéntico, solo cambia la sucesión", () => {
    const r = reordenarCampos(guardados, nuevoOrden);
    const porId = (l) => [...l].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(porId(r.campos), porId(guardados));
    assert.notDeepEqual(r.campos.map((c) => c.id), ids);   // y algo ha cambiado de verdad
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("la ruta escribe UNA columna y nada más", () => {
  const r = ruta(FIRMA);

  test("solo la puede usar quien lleva promociones", () => {
    assert.ok(r.includes("requireAuth(PROMOS_ROLES)"), "la ruta no exige permiso");
  });

  test("el único UPDATE toca `campos`, y ninguna otra columna", () => {
    const updates = [...r.matchAll(/UPDATE\s+(\w+)\s+SET\s+([^`]*?)WHERE/gis)];
    assert.equal(updates.length, 1, "hay más de un UPDATE en la ruta de orden");
    assert.equal(updates[0][1], "fid_formularios");
    const columnas = [...updates[0][2].matchAll(/(\w+)\s*=/g)].map((m) => m[1]);
    assert.deepEqual(columnas, ["campos"],
      `la ruta escribe columnas que no debería: ${columnas.join(", ")}`);
  });

  test("NO crea ninguna versión", () => {
    // Es el motivo de que esta ruta exista. Un INSERT aquí sería volver al problema de partida.
    assert.ok(!/INSERT\s+INTO\s+fid_formularios/i.test(r), "la ruta inserta una versión nueva");
    assert.ok(!/MAX\(version\)/i.test(r), "la ruta calcula una versión");
  });

  test("y NO TOCA `version` — de ahí cuelga la clave del WhatsApp del alta", () => {
    // `alta:<clave>:v<version>:…` es lo que impide mandar dos veces el mismo mensaje. Si la
    // versión se moviera al ordenar, quien ya se apuntó volvería a recibirlo.
    assert.ok(!/\bversion\s*=/i.test(r), "la ruta escribe `version`");
    // Y que la clave siga llevándola: si alguien la quitara, este test dejaría de tener sentido y
    // más vale que se entere aquí.
    assert.match(server, /const claveIdem = `alta:\$\{clave\}:v\$\{f\.version\}/);
  });

  test("no toca ningún texto ni ninguna configuración", () => {
    for (const col of ["consentimiento_texto", "privacidad_url", "mensajes", "mensaje_wa",
                       "campana", "promo_clave", "titulo", "estado", "abre_en", "cierra_en"]) {
      // `=(?!=)`: una ASIGNACIÓN. Sin el descarte, `f.estado === "cerrado"` —que es una lectura,
      // y justamente la que protege las versiones cerradas— contaría como escritura.
      assert.ok(!new RegExp(`${col}\\s*=(?!=)`).test(r), `la ruta escribe «${col}»`);
    }
  });

  test("una versión cerrada no se modifica", () => {
    assert.match(r, /estado === "cerrado"/);
    assert.match(r, /status\(409\)|codigo: 409/);
  });

  test("se lee y se escribe bajo cerrojo", () => {
    // Se lee la lista, se recoloca y se vuelve a escribir: sin `FOR UPDATE`, dos pestañas
    // ordenando a la vez se pisan y gana la última en escribir, no la última en decidir.
    assert.match(r, /FOR UPDATE/);
    assert.match(r, /fidTransaccion/);
  });

  test("delega la regla en la función pura, no la reescribe", () => {
    assert.match(r, /fidReordenar\(fidLeerLista\(f\.campos\), req\.body\.orden\)/);
  });

  test("queda constancia de quién lo movió y a qué orden", () => {
    assert.match(r, /ficAuditar\("fidelizacion", id, "formulario_orden", req\.user\.username/);
    assert.match(r, /orden: r\.campos\.map\(\(c\) => c\.id\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("se hace desde el panel, no con curl", () => {
  test("hay un botón para cambiar el orden en la lista de formularios", () => {
    assert.match(panel, /data-act="fidg-orden" data-id=/);
    assert.match(panel, /Cambiar el orden/);
    assert.match(panel, /else if \(act === "fidg-orden"\) fidgOrdenAbrir\(/);
    assert.match(panel, /else if \(act === "fidg-orden-guardar"\) fidgOrdenGuardar\(/);
  });

  test("solo para formularios: una versión de tarjeta no tiene campos que ordenar", () => {
    assert.match(panel, /renderFidgListaSimple\(FIDG\.formularios, "formulario", "fidg-form-nuevo", "Nuevo formulario…", true, "Editar"\)/);
    assert.match(panel, /renderFidgListaSimple\(FIDG\.tarjeta, "versión de tarjeta", "fidg-tarjeta-nueva", "Nueva versión…"\)/);
  });

  test("no se ofrece sobre una versión cerrada", () => {
    assert.match(panel, /ordenable && x\.estado !== "cerrado"/);
  });

  const dialogo = (() => {
    const i = panel.indexOf("function fidgOrdenAbrir(");
    const f = panel.indexOf("async function fidgOrdenGuardar(");
    assert.ok(i >= 0 && f > i, "el diálogo de orden ya no encuentra sus anclas");
    return panel.slice(i, f);
  })();

  test("el diálogo enseña TODOS los campos, también los que no se ven", () => {
    // Un campo oculto sigue ocupando su sitio en el orden. Si no saliera, la lista del panel no
    // se correspondería con lo guardado y mover algo daría un resultado inesperado.
    assert.match(dialogo, /\(f\.campos \|\| \[\]\)\.map\(/);
    assert.ok(!/f\.campos[^\n]*\.filter\(/.test(dialogo), "el diálogo esconde campos");
    assert.match(dialogo, /no se muestra/);
  });

  test("en el diálogo SOLO se puede mover: no hay casillas ni rótulos", () => {
    // Si aquí se pudiera cambiar una etiqueta o desmarcar «obligatorio», esto dejaría de ser una
    // reordenación y haría falta publicar versión, que es justo lo que se evita.
    assert.ok(!/<input/.test(dialogo), "el diálogo deja editar algo más que el orden");
    assert.ok(!/checkbox/.test(dialogo), "el diálogo tiene casillas");
    assert.match(dialogo, /data-act="ff-subir"/);
    assert.match(dialogo, /data-act="ff-bajar"/);
  });

  test("se manda el orden y nada más, por PATCH", () => {
    const guardar = panel.slice(panel.indexOf("async function fidgOrdenGuardar("),
                                panel.indexOf("/** VISTA PREVIA."));
    assert.match(guardar, /apiSend\("PATCH", `\/api\/fidelizacion\/formularios\/\$\{encodeURIComponent\(id\)\}\/orden`, \{ orden \}\)/);
    // El orden sale del DOM, que es donde está lo que el usuario acaba de mover.
    // Acotado a LAS FILAS: las flechas llevan el mismo `data-campo` y sin `:scope >` se mandaría
    // cada campo tres veces, que el servidor rechaza por no ser una permutación.
    assert.match(guardar, /getElementById\("foCampos"\)\?\.querySelectorAll\(":scope > \[data-campo\]"\)/);
    // Y se recarga del servidor antes de dar nada por hecho.
    assert.match(guardar, /await loadFidPiloto\(\)/);
  });

  test("las flechas buscan su lista desde el botón, no por un id fijo", () => {
    // Las mismas flechas sirven en el formulario entero y en este diálogo. Ancladas a un `id`,
    // uno de los dos movería las filas del otro.
    assert.match(panel, /const caja = boton\?\.closest\("\.rows"\) \|\| document\.getElementById\("ffCampos"\)/);
    assert.match(panel, /fidgMoverCampo\(t\.getAttribute\("data-campo"\), true, t\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("y la página pública lo refleja tal cual", () => {
  test("sirve el orden guardado, sin recolocarlo", () => {
    const publica = ruta('app.get("/api/publico/formulario/:clave"');
    assert.match(publica, /campos: fidCampos\(fidLeerLista\(f\.campos\)\)\.filter\(\(c\) => c\.visible\)/);
    assert.ok(!/\.sort\(/.test(publica), "la ruta pública reordena los campos");
  });

  test("lo que se guarda al ordenar es exactamente lo que se sirve", () => {
    // El mismo `normalizarCampos` que pasa la ruta pública sobre lo que dejó la reordenación: si
    // recolocara algo, el panel y la página dirían cosas distintas.
    const r = reordenarCampos(guardados, ["nombre", "apellidos", "telefono", "email", "poblacion", "nacimiento", "local"]);
    const servido = normalizarCampos(r.campos).filter((c) => c.visible);
    assert.deepEqual(servido.map((c) => c.id),
      ["nombre", "apellidos", "telefono", "email", "poblacion", "nacimiento"]);
  });
});
