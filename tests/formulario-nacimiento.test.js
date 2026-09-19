// LA FECHA DE NACIMIENTO DEL FORMULARIO PÚBLICO, Y EL ORDEN DE LOS CAMPOS.
//
// ── QUÉ SE BLINDA AQUÍ ───────────────────────────────────────────────────────────────────────
//
//   · Que lo que se envía siga siendo `AAAA-MM-DD`. El selector ha cambiado entero; el dato que
//     llega al servidor NO. Si esto se rompe, `leads.nacimiento` se llena de basura en silencio y
//     no se nota hasta que alguien filtra por edad meses después.
//   · Que el identificador del campo siga siendo `nacimiento`. Es el nombre de una columna.
//   · Que no se pueda elegir una fecha futura DESDE LA PÁGINA. El servidor también lo comprueba
//     —`fechaNacimientoValida`— y esa es la que manda; ésta es para que nadie llegue a intentarlo.
//   · Que `promo.js` NO tenga ningún orden de campos escrito. El orden es del formulario, se
//     mueve desde el panel, y la página solo pinta lo que le llega.
//
// ── POR QUÉ SE EJECUTA EL CÓDIGO Y NO SOLO SE LEE ────────────────────────────────────────────
//
// El resto de comprobaciones sobre `promo.js` leen el fichero como texto, porque lo que miran es
// que algo no aparezca. Aquí lo que importa es el RESULTADO —cuántos días tiene febrero de 1900,
// qué sale al componer el 7 de marzo— y eso leyendo no se sabe. El núcleo de cálculo está aislado
// a propósito entre dos marcas, sin tocar el DOM, para poder sacarlo y ejecutarlo tal cual.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fechaNacimientoValida } from "../src/modules/captacion/municipios.js";
import { normalizarCampos } from "../src/modules/fidelizacion/contenido.js";

const promo = readFileSync(new URL("../public/promo.js", import.meta.url), "utf8");
/**
 * `promo.js` sin comentarios, para las comprobaciones de «esto NO aparece».
 *
 * Sobre el fichero entero no valen: estos comentarios explican precisamente qué se ha dejado de
 * usar y por qué, así que nombran lo que se está prohibiendo. Se quitan las líneas que son
 * comentario ENTERAS —las únicas que hay aquí—, sin cruzar a mitad de línea: un `//` dentro de una
 * cadena se llevaría por delante código de verdad.
 */
const codigo = promo
  .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");
const css = readFileSync(new URL("../public/promo.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

/** El núcleo de cálculo, sacado del fichero de verdad y ejecutado. Sin DOM: no lo necesita. */
const nucleo = (() => {
  const i = promo.indexOf("// ── NÚCLEO PURO");
  const f = promo.indexOf("// ── FIN DEL NÚCLEO PURO");
  assert.ok(i >= 0 && f > i, "el núcleo puro de la fecha ya no está marcado en promo.js");
  return new Function(
    promo.slice(i, f) + "\nreturn { nacTopeMeses, nacTopeDias, nacComponer };")();
})();

const { nacTopeMeses, nacTopeDias, nacComponer } = nucleo;

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("lo que se envía no ha cambiado", () => {
  test("tres piezas se componen en AAAA-MM-DD, con el cero delante", () => {
    assert.equal(nacComponer("1985", "3", "7"), "1985-03-07");
    assert.equal(nacComponer(1985, 12, 31), "1985-12-31");
    assert.equal(nacComponer("2000", "10", "9"), "2000-10-09");
  });

  test("incompleto vale cadena vacía, nunca una fecha a medias", () => {
    // Guardar «1985-03-» o «1985-03-01» porque falte el día sería inventarse un dato.
    assert.equal(nacComponer("1985", "3", ""), "");
    assert.equal(nacComponer("1985", "", "7"), "");
    assert.equal(nacComponer("", "3", "7"), "");
    assert.equal(nacComponer("", "", ""), "");
  });

  test("lo que se compone es EXACTAMENTE lo que el servidor da por bueno", () => {
    // El contrato entre la página y `fechaNacimientoValida`, comprobado de verdad y no de palabra.
    for (const [a, m, d] of [["1985", "3", "7"], ["2000", "2", "29"], ["1948", "11", "30"]]) {
      const iso = nacComponer(a, m, d);
      assert.deepEqual(fechaNacimientoValida(iso, { hoy: "2026-09-18" }),
                       { ok: true, motivo: null }, `el servidor rechaza ${iso}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("los días que se ofrecen son los que existen", () => {
  const hoy = new Date(Date.UTC(2026, 8, 18));   // 18/09/2026, fijo: un test no depende del reloj

  test("cada mes con los suyos", () => {
    assert.equal(nacTopeDias(1985, 1, hoy), 31);
    assert.equal(nacTopeDias(1985, 4, hoy), 30);
    assert.equal(nacTopeDias(1985, 2, hoy), 28);
  });

  test("los bisiestos salen solos, sin escribir la regla", () => {
    assert.equal(nacTopeDias(2024, 2, hoy), 29);
    assert.equal(nacTopeDias(2000, 2, hoy), 29);   // divisible por 400: SÍ es bisiesto
    assert.equal(nacTopeDias(1900, 2, hoy), 28);   // divisible por 100 y no por 400: NO lo es
  });

  test("sin año o sin mes todavía no se recorta nada", () => {
    // Recortar antes de tiempo escondería días que sí existen en cuanto se elija el resto.
    assert.equal(nacTopeDias(0, 0, hoy), 31);
    assert.equal(nacTopeDias(1985, 0, hoy), 31);
    assert.equal(nacTopeDias(0, 2, hoy), 31);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("no se puede elegir una fecha que no ha llegado", () => {
  const hoy = new Date(Date.UTC(2026, 8, 18));   // 18 de septiembre de 2026

  test("en el año en curso no se ofrecen los meses que faltan", () => {
    assert.equal(nacTopeMeses(2026, hoy), 9);
    assert.equal(nacTopeMeses(2025, hoy), 12);
    assert.equal(nacTopeMeses(1985, hoy), 12);
  });

  test("en el mes en curso no se ofrecen los días que faltan", () => {
    assert.equal(nacTopeDias(2026, 9, hoy), 18);
    // Y un mes ya pasado del mismo año se ofrece entero.
    assert.equal(nacTopeDias(2026, 8, hoy), 31);
  });

  test("ninguna combinación que se pueda elegir da una fecha futura", () => {
    // La comprobación de verdad: se recorre TODO lo que la página deja elegir y se le pregunta al
    // servidor. Si un solo hueco se colara, aquí se ve.
    const hoyIso = "2026-09-18";
    for (let a = 2026; a >= 2026 - 3; a--) {
      for (let m = 1; m <= nacTopeMeses(a, hoy); m++) {
        for (let d = 1; d <= nacTopeDias(a, m, hoy); d++) {
          const r = fechaNacimientoValida(nacComponer(a, m, d), { hoy: hoyIso });
          assert.ok(r.ok, `la página deja elegir ${nacComponer(a, m, d)} y el servidor dice ${r.motivo}`);
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("el campo sigue siendo el mismo campo", () => {
  test("conserva el identificador y el nombre de siempre", () => {
    // `fx_nacimiento` es lo que busca la recogida del formulario; `nacimiento`, la columna.
    assert.match(promo, /id="fx_nacimiento" name="nacimiento" type="hidden"/);
  });

  test("la recogida del formulario no se ha tocado: sigue leyendo por id", () => {
    assert.match(promo, /var el = \$\("fx_" \+ x\.id\);/);
  });

  test("ya no hay ningún `type=\"date\"` en la página", () => {
    // Es lo que se ha sustituido. Si vuelve a aparecer, alguien ha rehecho el calendario.
    assert.ok(!/type="date"/.test(codigo), "promo.js vuelve a pintar un input de fecha");
  });

  test("son tres selectores nativos, no una rueda dibujada a mano", () => {
    for (const id of ["fx_nac_d", "fx_nac_m", "fx_nac_a"]) {
      assert.ok(promo.includes(`<select id="${id}"`), `falta el selector ${id}`);
    }
    // Nada de recrear la rueda de Apple: ni arrastre, ni inercia, ni transformaciones.
    for (const señal of ["touchmove", "touchstart", "requestAnimationFrame", "translateY"]) {
      assert.ok(!codigo.includes(señal), `promo.js imita una rueda a mano (${señal})`);
    }
  });

  test("el grupo se puede leer con un lector de pantalla", () => {
    assert.match(promo, /role="group" aria-labelledby="fxL_nacimiento"/);
    assert.match(promo, /sD\.setAttribute\("aria-label", rot\.dia\)/);
    assert.match(promo, /sM\.setAttribute\("aria-label", rot\.mes\)/);
    assert.match(promo, /sA\.setAttribute\("aria-label", rot\.anio\)/);
  });

  test("el rótulo del campo se sigue pintando, aunque apunte al primer selector", () => {
    assert.match(promo, /document\.getElementById\("fxL_" \+ x\.id\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("el mes va en letra, y en el idioma de la campaña", () => {
  const meses = (() => {
    const i = promo.indexOf("var NAC_MESES = {");
    const f = promo.indexOf("};", i);
    return promo.slice(i, f);
  })();

  test("los tres idiomas en los que se publica, con sus doce meses", () => {
    for (const idioma of ["es", "ca", "en"]) {
      const m = new RegExp(`${idioma}: \\[([^\\]]*)\\]`, "s").exec(meses);
      assert.ok(m, `no hay meses en «${idioma}»`);
      assert.equal(m[1].split(",").filter((t) => t.trim()).length, 12,
                   `«${idioma}» no tiene doce meses`);
    }
  });

  test("y se elige con el idioma del formulario, no con el del móvil", () => {
    // Es la razón de que el mes vaya en letra: el calendario nativo se pintaba en el idioma del
    // NAVEGADOR, así que `05/12` se leía distinto según quién lo abriera.
    assert.match(promo, /montarNacimiento\(c\.idioma \|\| "es"\)/);
    assert.match(promo, /NAC_MESES\[idioma\] \|\| NAC_MESES\.es/);
  });

  test("se ofrecen suficientes años para cualquier cliente", () => {
    const m = /var NAC_ANIOS = (\d+);/.exec(promo);
    assert.ok(m, "no se sabe cuántos años se ofrecen");
    assert.ok(Number(m[1]) >= 100, "se ofrecen menos de cien años de antigüedad");
  });

  test("el año se lista del más reciente al más antiguo", () => {
    // Es lo que hace que esto sea cómodo: la rueda del iPhone se abre por el principio de la
    // lista. Al revés habría que recorrerla entera para llegar a un año de nacimiento normal.
    assert.match(promo, /for \(var a = hoy\.getFullYear\(\); a >= hoy\.getFullYear\(\) - NAC_ANIOS; a--\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("el aspecto encaja con el resto del formulario", () => {
  test("los tres caben en una fila", () => {
    assert.match(css, /\.pm-nac \{[^}]*grid-template-columns/s);
  });

  test("16 px, para que Safari no dé zoom al enfocar", () => {
    // Por debajo de 16 px, Safari en iPhone amplía la página al enfocar y se queda torcida.
    assert.match(css, /\.alta-campo select \{[^}]*font-size: 16px/s);
  });

  test("se le quita el marco del sistema, que en cada navegador es distinto", () => {
    // ── UNA CREENCIA EQUIVOCADA, CORREGIDA ────────────────────────────────────────────────
    //
    // Aquí se exigía LO CONTRARIO: que NO hubiera `appearance:none`, por creer que quitarlo
    // se llevaba por delante la rueda nativa del iPhone. No es así. `appearance` cambia cómo
    // se ve el control CERRADO; lo que pasa al tocarlo lo decide iOS, y en iOS un `<select>`
    // abre siempre la rueda del sistema tenga el CSS que tenga.
    //
    // Por creer eso, el formulario se quedó con el desplegable gris del navegador.
    const sel = css.slice(css.indexOf(".alta-campo select {"), css.indexOf(".pm-nac {"));
    assert.match(sel, /appearance: none/, "vuelve el marco gris del navegador");
    assert.match(sel, /-webkit-appearance: none/);
    // Y la punta se dibuja aquí, en un SVG dentro del CSS: sin pedir un archivo más.
    assert.match(sel, /background-image: url\("data:image\/svg\+xml/);
  });

  test("LOS TRES SEGMENTOS SON UN SOLO CAMPO", () => {
    // Eran tres cajas sueltas y se leían como tres preguntas. Son una fecha: comparten borde,
    // fondo y radio, y por dentro se separan con un filete.
    const nac = css.slice(css.indexOf(".pm-nac {"), css.indexOf("@media (max-width: 380px)"));
    assert.match(nac, /\.pm-nac \{[^}]*border: 1px solid/s, "el grupo no tiene un borde propio");
    assert.match(nac, /\.pm-nac \{[^}]*border-radius/s);
    assert.match(nac, /\.pm-nac-s \{[^}]*border: 0/s, "los segmentos conservan su borde");
    assert.match(nac, /\.pm-nac-s \+ \.pm-nac-s \{ border-left: 1px solid/,
      "faltan los filetes entre segmentos");
    // ── Y LA ESPECIFICIDAD, QUE ES LO QUE LO ROMPIÓ ─────────────────────────────────────
    //
    // `.alta-campo select` tiene dos partes —una clase y un elemento— y gana a `.pm-nac-s`,
    // que es una clase sola. Con el selector corto, cada segmento seguía dibujando su borde y
    // su radio: tres cajas en vez de un campo. Se vio en la captura, no en el CSS.
    assert.ok(!/\n\.pm-nac-s \{/.test(css),
      "el segmento se estiliza con un selector que pierde contra `.alta-campo select`");
    assert.match(css, /\.pm-nac \.pm-nac-s \{/);

    // El aro de foco rodea el GRUPO: lo que se rellena es una fecha, no tres cosas.
    assert.match(nac, /\.pm-nac:focus-within \{/, "el foco no rodea el grupo");
    assert.match(nac, /\.pm-nac-s:focus-visible \{ outline: none/, "hay dos aros anidados");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("EL ORDEN ES DEL FORMULARIO, NO DEL CÓDIGO", () => {
  /** Los campos de la propuesta, en el orden en que están escritos. */
  const propuesta = (() => {
    const i = app.indexOf("campos: [", app.indexOf('"esmorzar-girona"'));
    const f = app.indexOf("],", i);
    assert.ok(i >= 0 && f > i, "no se encuentran los campos de la propuesta");
    return [...app.slice(i, f).matchAll(/id: "([a-z_]+)"/g)].map((m) => m[1]);
  })();

  test("la propuesta arranca en el orden pedido", () => {
    assert.deepEqual(propuesta.slice(0, 6),
      ["nombre", "apellidos", "telefono", "email", "poblacion", "nacimiento"]);
  });

  test("y ese orden llega intacto a lo que se publica", () => {
    // `normalizarCampos` es lo único que toca la lista entre el panel y la página. Antes
    // recolocaba `nombre` y `telefono` al principio y tiraba lo configurado.
    const salida = normalizarCampos(propuesta.map((id) => ({ id, visible: true })));
    assert.deepEqual(salida.map((c) => c.id), propuesta);
  });

  test("el teléfono conserva toda su lógica aunque no vaya el primero", () => {
    const salida = normalizarCampos(propuesta.map((id) => ({ id, visible: true })));
    const tel = salida.find((c) => c.id === "telefono");
    assert.equal(salida.indexOf(tel), 2, "el teléfono se ha movido solo");
    assert.equal(tel.obligatorio, true);
    assert.equal(tel.visible, true);
  });

  test("`promo.js` no lleva escrito NINGÚN orden de campos", () => {
    // La página pinta lo que le llega, en el orden en que le llega. Si aquí apareciera una lista,
    // mover una pregunta en el panel dejaría de servir para nada.
    assert.match(promo, /\(c\.campos \|\| \[\]\)\.map\(function \(x\) \{/);
    // Nada de una lista de campos escrita, ni de reordenar lo que llega. `.sort(` a secas no
    // vale como señal: la búsqueda de poblaciones ordena sus sugerencias, y eso es otra cosa.
    for (const orden of [/\["nombre",\s*"apellidos"/, /\["nombre",\s*"telefono"/,
                         /ORDEN_CAMPOS/, /campos[^\n]*\.sort\(/]) {
      assert.ok(!orden.test(codigo), `promo.js impone un orden de campos (${orden})`);
    }
  });
});
