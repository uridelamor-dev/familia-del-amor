// Captación por campaña — la lógica pura: la puerta, la cola y lo que se le dice.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { estadoCampana, admiteAltas, textoEstadoCampana, urlCampana, sanearCampana,
         normalizarClave, sanearTextos } from "../../src/modules/captacion/campana.js";
import { esperaTrasFallo, seRinde, trasIntento, cuantasSacar, estadoParaCliente,
         MAX_INTENTOS, ESPERAS_MS } from "../../src/modules/captacion/cola.js";
import { elegirIdioma, textosDe, textoWhatsApp, telefonoBonito, POR_DEFECTO,
         ETIQUETAS, IDIOMAS } from "../../src/modules/captacion/mensaje.js";

const viva = (extra = {}) => ({ activa: true, altas_hasta: "2026-10-01", tope_altas: 0, ...extra });

describe("la puerta de la campaña", () => {
  test("abierta en plazo y sin tope", () => {
    assert.equal(estadoCampana(viva(), { hoy: "2026-09-20", altas: 999 }), "viva");
    assert.equal(admiteAltas("viva"), true);
  });

  test("el último día de plazo TODAVÍA admite altas", () => {
    // Se decidió que la gente pueda apuntarse el mismo día del desayuno, incluso en la puerta.
    assert.equal(estadoCampana(viva(), { hoy: "2026-10-01", altas: 0 }), "viva");
    assert.equal(estadoCampana(viva(), { hoy: "2026-10-02", altas: 0 }), "cerrada");
  });

  test("el tope corta, y 0 significa sin tope", () => {
    assert.equal(estadoCampana(viva({ tope_altas: 100 }), { hoy: "2026-09-20", altas: 99 }), "viva");
    assert.equal(estadoCampana(viva({ tope_altas: 100 }), { hoy: "2026-09-20", altas: 100 }), "agotada");
    assert.equal(estadoCampana(viva({ tope_altas: 0 }), { hoy: "2026-09-20", altas: 100000 }), "viva");
  });

  test("apagar a mano gana a todo lo demás", () => {
    // Si alguien la apaga porque se ha liado algo, el motivo que se enseña tiene que ser ése y
    // no «agotada», que sería mentira y mandaría a mirar la cocina en vez del panel.
    const c = viva({ activa: false, tope_altas: 1 });
    assert.equal(estadoCampana(c, { hoy: "2026-09-20", altas: 50 }), "apagada");
  });

  test("una campaña que no existe no revienta", () => {
    assert.equal(estadoCampana(null, { hoy: "2026-09-20" }), "no_existe");
    assert.equal(admiteAltas("no_existe"), false);
  });

  test("a quien llega con la puerta cerrada se le habla en su idioma, y sin culparle", () => {
    for (const idioma of IDIOMAS) {
      for (const est of ["cerrada", "agotada", "apagada", "aun_no_abre"]) {
        const t = textoEstadoCampana(est, null, idioma);
        assert.ok(t.length > 10, `«${est}/${idioma}» se queda sin frase`);
        assert.ok(!/error|fallo|inválid/i.test(t), `«${est}/${idioma}» le echa la culpa: ${t}`);
      }
    }
  });
});

describe("la clave, que viaja en el enlace del anuncio", () => {
  test("se normaliza a algo que se puede copiar y dictar", () => {
    assert.equal(normalizarClave("Girona Desayuno"), "girona-desayuno");
    assert.equal(normalizarClave("  Ñoño  ÁÉÍ  "), "nono-aei");
    assert.equal(normalizarClave("a---b"), "a-b");
    assert.equal(normalizarClave("-x-"), "x");
  });

  test("el enlace lleva la clave codificada", () => {
    assert.equal(urlCampana("https://familiadelamor.org/", "girona-desayuno"),
      "https://familiadelamor.org/promo.html?c=girona-desayuno");
  });
});

describe("saneado de la campaña", () => {
  const promos = [{ id: 7 }, { id: 9 }];

  test("una campaña normal pasa entera", () => {
    const { campana, descartados } = sanearCampana({
      clave: "Girona Desayuno", nombre: "Desayuno Girona", promocion_id: 7,
      altas_hasta: "2026-10-01", tope_altas: 200, idioma: "ca",
    }, { promociones: promos });
    assert.equal(campana.clave, "girona-desayuno");
    assert.equal(campana.promocion_id, 7);
    assert.equal(campana.tope_altas, 200);
    assert.equal(campana.idioma, "ca");
    assert.deepEqual(descartados, []);
  });

  test("una promoción que no existe se descarta y se dice", () => {
    // Una campaña apuntando a una promoción borrada emitiría cupones que no valen en ninguna
    // barra, y el cliente lo descubriría delante del camarero.
    const { campana, descartados } = sanearCampana(
      { clave: "x-y-z", nombre: "N", promocion_id: 123 }, { promociones: promos });
    assert.equal(campana.promocion_id, null);
    assert.ok(descartados.some((d) => d.campo === "promocion_id"));
  });

  test("cerrar antes de abrir no se guarda", () => {
    const { campana, descartados } = sanearCampana(
      { clave: "x-y-z", nombre: "N", promocion_id: 7, altas_desde: "2026-10-05", altas_hasta: "2026-10-01" },
      { promociones: promos });
    assert.equal(campana.altas_hasta, null);
    assert.ok(descartados.some((d) => d.campo === "altas_hasta"));
  });

  test("una clave corta o rara se descarta", () => {
    const { descartados } = sanearCampana({ clave: "a", nombre: "N", promocion_id: 7 }, { promociones: promos });
    assert.ok(descartados.some((d) => d.campo === "clave"));
  });

  test("los textos se recortan y solo se guardan los que hay", () => {
    const t = sanearTextos({ ca: { titular: " Esmorzar ", wa: "" }, xx: { titular: "no" } });
    assert.deepEqual(t, { ca: { titular: "Esmorzar" } });
  });
});

describe("la cola", () => {
  test("el primer reintento es corto y luego crece", () => {
    // El fallo más común no es un número malo: es WhatsApp reconectando tras un despliegue, y
    // eso se arregla solo en un minuto.
    assert.equal(esperaTrasFallo(0), 60_000);
    assert.ok(esperaTrasFallo(1) > esperaTrasFallo(0));
    assert.ok(esperaTrasFallo(4) >= esperaTrasFallo(3));
    assert.equal(esperaTrasFallo(99), ESPERAS_MS[ESPERAS_MS.length - 1], "se queda en el último escalón");
  });

  test("se rinde a los cinco intentos y queda VISIBLE, no borrada", () => {
    // La cola de reservas que ya existía borraba la fila tras intentarlo, incluso si no había
    // salido: el mensaje desaparecía sin que nadie se enterara. Aquí solo cambia de estado.
    assert.equal(seRinde(MAX_INTENTOS - 1), false);
    const r = trasIntento({ ok: false, intentos: MAX_INTENTOS - 1, error: "boom" });
    assert.equal(r.estado, "fallido");
    assert.equal(r.ultimo_error, "boom");
  });

  test("un fallo intermedio vuelve a la cola con su espera", () => {
    const r = trasIntento({ ok: false, intentos: 1, error: "socket", ahora: 1000 });
    assert.equal(r.estado, "pendiente");
    assert.equal(r.intentos, 2);
    assert.equal(r.proximo_ms, 1000 + esperaTrasFallo(1));
  });

  test("cuando sale, se apunta cuándo y se limpia el error", () => {
    const r = trasIntento({ ok: true, intentos: 3, ahora: Date.parse("2026-10-01T08:00:00Z") });
    assert.equal(r.estado, "enviado");
    assert.equal(r.ultimo_error, null);
    assert.match(r.enviado_en, /^2026-10-01T08:00/);
  });

  test("el tope diario manda sobre todo lo demás", () => {
    // Es lo único que separa una campaña que funciona de un número baneado, y ese número es el
    // mismo que lleva las reservas y Sara.
    assert.equal(cuantasSacar({ pendientes: 100, cupoQuedan: 7, porPasada: 12 }), 7);
    assert.equal(cuantasSacar({ pendientes: 3, cupoQuedan: 50, porPasada: 12 }), 3);
    assert.equal(cuantasSacar({ pendientes: 100, cupoQuedan: 0, porPasada: 12 }), 0);
  });

  test("a la pantalla de gracias solo le llega un estado", () => {
    assert.equal(estadoParaCliente({ estado: "pendiente" }), "enviando");
    assert.equal(estadoParaCliente({ estado: "enviado" }), "enviado");
    assert.equal(estadoParaCliente(null), "desconocido");
  });
});

describe("el idioma y lo que se le dice", () => {
  test("manda lo que ya sabíamos de esa persona, luego su móvil, luego la campaña", () => {
    assert.equal(elegirIdioma({ deFicha: "es", delMovil: "ca-ES", deCampana: "ca" }), "es");
    assert.equal(elegirIdioma({ deFicha: "", delMovil: "ca-ES", deCampana: "es" }), "ca");
    assert.equal(elegirIdioma({ deFicha: "", delMovil: "", deCampana: "ca" }), "ca");
  });

  test("un idioma que no hablamos cae al siguiente escalón, no se cuela", () => {
    // `navigator.language` puede ser cualquier cosa. Un «ru-RU» no puede acabar buscando textos
    // en ruso que no existen.
    assert.equal(elegirIdioma({ delMovil: "ru-RU", deCampana: "ca" }), "ca");
    assert.equal(elegirIdioma({ delMovil: "zzz", deCampana: "zzz" }), "es");
  });

  test("los tres idiomas tienen TODAS las etiquetas", () => {
    // Una etiqueta que falta se pinta como «undefined» en medio de un formulario por el que se
    // está pagando tráfico.
    const claves = Object.keys(ETIQUETAS.es);
    for (const i of IDIOMAS) {
      for (const k of claves) {
        assert.ok(ETIQUETAS[i][k], `falta «${k}» en ${i}`);
      }
    }
    for (const i of IDIOMAS) {
      for (const k of ["titular", "subtitulo", "wa"]) assert.ok(POR_DEFECTO[i][k], `falta «${k}» en ${i}`);
    }
  });

  test("EL MENSAJE NO LE RECUERDA QUE NOS DIO SUS DATOS", () => {
    // Se le está haciendo un regalo, no cobrando un peaje. Es la misma regla que ya blinda el
    // cupón de bienvenida.
    for (const i of IDIOMAS) {
      const t = textoWhatsApp({ plantilla: POR_DEFECTO[i].wa, nombre: "Marta", promocion: "esmorzar",
                                enlace: "https://x/c?t=A", donde: "Vàlid a Girona." });
      assert.ok(!/dades|datos|data|a cambio|formulari|formulario|registr/i.test(t), `${i}: ${t}`);
      assert.match(t, /Marta/);
      assert.match(t, /https:\/\/x\/c\?t=A/);
    }
  });

  test("agradece la confianza, que es lo que se pidió", () => {
    assert.match(textoWhatsApp({ plantilla: POR_DEFECTO.es.wa }), /[Gg]racias por confiar/);
    assert.match(textoWhatsApp({ plantilla: POR_DEFECTO.ca.wa }), /[Gg]ràcies per confiar/);
  });

  test("saluda por el nombre de pila, no por el completo", () => {
    const t = textoWhatsApp({ plantilla: POR_DEFECTO.es.wa, nombre: "Marta García Puig" });
    assert.match(t, /Hola Marta/);
    assert.ok(!/García/.test(t));
  });

  test("un hueco vacío no deja líneas en blanco sueltas", () => {
    const t = textoWhatsApp({ plantilla: "A\n{donde}\n\n{promocion}\nB", donde: "", promocion: "" });
    assert.ok(!/\n{3,}/.test(t), `quedan huecos: ${JSON.stringify(t)}`);
    assert.ok(!/undefined|null/.test(t));
  });

  test("la campaña puede poner sus textos, y lo que no ponga se rellena solo", () => {
    const c = { textos: JSON.stringify({ ca: { titular: "Esmorzar gratis" } }) };
    const t = textosDe(c, "ca");
    assert.equal(t.titular, "Esmorzar gratis");
    assert.equal(t.subtitulo, POR_DEFECTO.ca.subtitulo, "lo que no escriba Marketing sale por defecto");
    assert.ok(t.etiquetas.enviar);
  });

  test("unos textos rotos no dejan la página en blanco", () => {
    const t = textosDe({ textos: "{no es json" }, "ca");
    assert.equal(t.titular, POR_DEFECTO.ca.titular);
  });

  test("el teléfono se le enseña legible", () => {
    assert.equal(telefonoBonito("+34 666123456"), "666 12 34 56");
  });
});
