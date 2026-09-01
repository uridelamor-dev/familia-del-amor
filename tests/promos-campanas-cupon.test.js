// `{cupon}` en campañas: un cupón distinto para cada destinatario.
//
// La pieza delicada no es la sustitución, es CUÁNDO se emite y qué pasa si algo falla a mitad.
// Una campaña de trescientos se corta a menudo aquí (redespliegue, tope diario), y cada corte
// mal resuelto deja cupones vivos en manos de nadie o mensajes con el hueco vacío.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aplicarVariables, pideCupon } from "../src/modules/messaging/queue.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/promos/schema.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

const lote = (() => {
  const i = server.indexOf("async function enviarLoteWA(");
  assert.ok(i > 0);
  const f = server.indexOf("\n/**", i + 10);
  assert.ok(f > i);
  return server.slice(i, f);
})();

describe("la variable {cupon}", () => {
  test("se sustituye por el enlace de esa persona", () => {
    const t = aplicarVariables("Hola {nombre}, te invitamos 👉 {cupon}",
      { nombre: "Ana", cupon: "https://x.org/cupon.html?t=abc" });
    assert.equal(t, "Hola Ana, te invitamos 👉 https://x.org/cupon.html?t=abc");
  });

  test("no le estropea el enlace ninguna de las limpiezas de puntuación", () => {
    // Las limpiezas existen para los nombres vacíos («¡Felicidades,!»). Una dirección web
    // lleva dos puntos y barras, y no puede salir tocada.
    const url = "https://familiadelamor.org/cupon.html?t=aB3-_xYz";
    const t = aplicarVariables("{cupon}", { cupon: url });
    assert.equal(t, url);
    const t2 = aplicarVariables("Toma: {cupon}", { cupon: url });
    assert.ok(t2.endsWith(url), t2);
  });

  test("convive con el resto de variables", () => {
    const t = aplicarVariables("Hola {nombre}, en {local}: {cupon}",
      { nombre: "Ana", local: "La Tapeta - Blanes", cupon: "https://x.org/c?t=1" });
    assert.equal(t, "Hola Ana, en La Tapeta - Blanes: https://x.org/c?t=1");
  });

  test("sin cupón no deja «undefined» en el mensaje", () => {
    // Aun así el envío no llega aquí: se corta antes. Pero si algún día llegara, lo que queda
    // es un hueco, no la palabra «undefined» delante del cliente.
    const t = aplicarVariables("Toma {cupon}", { nombre: "Ana" });
    assert.ok(!/undefined/.test(t), t);
  });

  test("pideCupon reconoce la llave escriba como se escriba", () => {
    assert.equal(pideCupon("toma {cupon}"), true);
    assert.equal(pideCupon("toma {CUPON}"), true);
    assert.equal(pideCupon("toma un café"), false);
    assert.equal(pideCupon(""), false);
    assert.equal(pideCupon(null), false);
  });
});

describe("cuándo se emite el cupón de una campaña", () => {
  test("uno por persona y justo antes de mandarle el mensaje", () => {
    // No antes y en bloque: una campaña cortada a la mitad habría dejado la otra mitad de los
    // cupones vivos y sin dueño, imposibles de distinguir de los entregados.
    assert.match(lote, /if \(promocion && pideCupon\(base\)\)/);
    assert.match(lote, /clase: "cupon", promocionId: promocion\.id/);
  });

  test("si no se puede emitir, NO se envía el mensaje", () => {
    // «Te invitamos a un café 👉» con el hueco vacío detrás es peor que no escribir: el
    // cliente viene a reclamar algo que no existe.
    assert.match(lote, /if \(!tel\) throw new Error\("sin teléfono para emitir el cupón"\)/);
    assert.match(lote, /if \(!baseUrl\) throw new Error/);
  });

  test("el QR se marca como enviado DESPUÉS de que salga el mensaje", () => {
    const iEnvio = lote.indexOf("await sendMensajeLibre");
    const iMarca = lote.indexOf("UPDATE pro_qr SET enviado_en");
    assert.ok(iEnvio > 0 && iMarca > iEnvio,
      "marcarlo antes haría aparecer como entregado un cupón que nadie ha recibido");
  });

  test("y si el mensaje falla, el error queda en el propio QR", () => {
    // Es el listado desde el que se reenvía a quien se quedó sin él.
    assert.match(lote, /UPDATE pro_qr SET enviado_error = \? WHERE id = \?/);
  });
});

describe("no se manda un cupón que no se va a poder canjear", () => {
  test("la promoción se comprueba ACTIVA en el momento de enviar", () => {
    // Entre que se programa una campaña para el viernes y sale, Marketing puede haberla parado.
    assert.match(server, /FROM pro_promociones WHERE id = \? AND activa/);
    assert.match(server, /const promocion = await promocionDeCampana\(camp\.promocion_id\)/);
  });

  test("no se puede guardar una campaña que diga {cupon} sin promoción", () => {
    const avisos = [...server.matchAll(/pideCupon\(mensaje\) && !promo/g)];
    assert.equal(avisos.length, 2, "hace falta en el alta Y en la edición");
  });

  test("el enlace nunca sale relativo aunque no haya petición", () => {
    // El reloj programado envía sin `req`. Sin el respaldo, el cliente recibiría
    // «/cupon.html?t=…» a secas, que no lleva a ninguna parte.
    assert.match(server, /async function baseEnlaces\(req = null\)[\s\S]{0,400}familiadelamor\.org/);
    assert.match(server, /baseUrl: await baseEnlaces\(\)/);
  });
});

describe("la vista previa enseña lo que va a salir", () => {
  test("resuelve {cupon} con un ejemplo, no lo deja en literal", () => {
    // Aquí ya hubo un fallo caro —la previa decía 40 y salían 300— y la lección fue que la
    // vista previa tiene que pasar por lo mismo que el envío.
    assert.match(server, /cupon: `\$\{base\}\/cupon\.html\?t=EJEMPLO`/);
    assert.match(panel, /\\{cupon\\}\/gi, location\.origin \+ "\/cupon\.html\?t=EJEMPLO"/);
  });

  test("y avisa si falta la promoción, mientras aún se puede arreglar", () => {
    assert.match(server, /avisoCupon: pideCupon/);
    assert.match(panel, /const avisarCupon = \(\)/);
  });

  test("emitir de verdad para una previsualización dejaría cupones vivos: no se hace", () => {
    const preview = server.slice(server.indexOf('app.post("/api/campanas/preview"'));
    const hasta = preview.indexOf("\napp.");
    assert.ok(!/proEmitir\(/.test(preview.slice(0, hasta)), "la previa no puede emitir nada");
  });
});

describe("la promoción viaja con la campaña de punta a punta", () => {
  test("la columna existe y se engancha desde el esquema de promociones", () => {
    assert.match(esquema, /ALTER TABLE campanas_wa ADD COLUMN IF NOT EXISTS promocion_id INTEGER/);
  });

  test("se guarda al crear y al editar", () => {
    assert.match(server, /INSERT INTO campanas_wa \([^)]*promocion_id/);
    assert.match(server, /UPDATE campanas_wa SET[^`]*promocion_id=\?/);
  });

  test("el panel la manda y la arrastra al editar y duplicar", () => {
    assert.match(panel, /promocion_id: Number\(ov\.querySelector\("#campPromo"\)\.value\) \|\| null/);
    const edit = panel.slice(panel.indexOf("async function campEditar"));
    assert.match(edit.slice(0, 500), /promocion_id: c\.promocion_id/);
    const dup = panel.slice(panel.indexOf("async function campDuplicar"));
    assert.match(dup.slice(0, 500), /promocion_id: c\.promocion_id/);
  });
});

describe("anular en masa", () => {
  test("solo toca los que nadie ha usado", () => {
    // Quitarle el descuento a quien ya lo canjeó no tiene sentido y además dejaría su canje
    // apuntando a un cupón anulado.
    assert.match(server, /UPDATE pro_qr SET anulado_en = \?, anulado_por = \?\s*WHERE promocion_id = \? AND anulado_en IS NULL AND usos = 0/);
  });

  test("se niega si el número ha cambiado desde que se miró", () => {
    // Si entre medias ha salido una campaña, anularían más cupones de los que se vieron.
    assert.match(server, /Ahora hay \$\{vivos\.n\} sin usar, no \$\{esperado\}/);
    assert.match(panel, /esperados: Number\(n\)/);
  });

  test("el botón solo aparece si hay algo que anular", () => {
    // Un botón peligroso que no hace nada la mayor parte del tiempo se acaba pulsando por
    // costumbre.
    assert.match(panel, /p\.sin_usar \? `[\s\S]{0,120}promo-anular-lote/);
  });
});
