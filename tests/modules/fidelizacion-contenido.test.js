// Los textos que configura Marketing y lee un cliente en su móvil.
//
// TODO LO QUE SE PRUEBA AQUÍ acaba pintado en una página PÚBLICA. Si se acepta HTML libre, se está
// aceptando que cualquiera con acceso al panel meta un `<script>` en la página que abren los
// clientes — y quien lo metiera podría no saber siquiera que puede hacerlo.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  textoSeguro, urlSegura, normalizarCampos, validarFormulario, formularioAbierto,
  renderPlantilla, variablesDesconocidas, puedeRecibir, paletaDe,
  PALETAS, CAMPOS, CAMPOS_FORZOSOS, CAMPOS_NUNCA_OBLIGATORIOS, VARIABLES, LARGOS,
} from "../../src/modules/fidelizacion/contenido.js";

describe("aquí dentro solo entra TEXTO", () => {
  test("un script no sobrevive, ni su contenido", () => {
    assert.equal(textoSeguro("<script>alert(1)</script>Hola"), "Hola");
    assert.equal(textoSeguro("<SCRIPT SRC=x></SCRIPT>Texto"), "Texto");
    assert.equal(textoSeguro("<style>body{display:none}</style>Texto"), "Texto");
  });

  test("ni una etiqueta con manejador", () => {
    // El clásico: no hace falta un `<script>` para ejecutar código.
    for (const a of ['<img src=x onerror=alert(1)>', '<svg onload=alert(1)>',
                     '<body onload=alert(1)>', '<a href="javascript:alert(1)">pincha</a>']) {
      const r = textoSeguro(a);
      assert.ok(!/[<>]/.test(r), `quedan signos de etiqueta: ${r}`);
      assert.ok(!/onerror|onload|javascript:/i.test(r), `queda un manejador: ${r}`);
    }
  });

  test("las entidades escapadas TAMPOCO, porque podrían volver a serlo", () => {
    // Dejar `&lt;script&gt;` y pintarlo con `innerHTML` en algún sitio lo convierte otra vez en
    // una etiqueta. Aquí no queda nada que pueda volver a serlo.
    const r = textoSeguro("&lt;script&gt;alert(1)&lt;/script&gt;");
    assert.ok(!r.includes("&lt;"), r);
    assert.ok(!r.includes("<"), r);
  });

  test("el texto normal sobrevive, y los saltos de párrafo también", () => {
    assert.equal(textoSeguro("Ven a por tu café"), "Ven a por tu café");
    assert.equal(textoSeguro("Línea 1\nLínea 2"), "Línea 1\nLínea 2");
    // Cuarenta líneas en blanco rompen cualquier diseño: como mucho, dos.
    assert.equal(textoSeguro("A\n\n\n\n\n\nB"), "A\n\nB");
  });

  test("un objeto o un array no son un texto", () => {
    for (const raro of [{}, [], true, null, undefined]) assert.equal(textoSeguro(raro), "");
  });

  test("y se corta por longitud", () => {
    assert.equal(textoSeguro("x".repeat(500), 100).length, 100);
    assert.equal(LARGOS.titulo, 120);
  });
});

describe("las URLs", () => {
  test("SOLO https, y las relativas de casa", () => {
    assert.equal(urlSegura("https://latapeta.com/privacidad"), "https://latapeta.com/privacidad");
    assert.equal(urlSegura("/privacidad"), "/privacidad");
  });

  test("un javascript: en un href ejecuta código al pinchar", () => {
    for (const malo of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<script>x</script>",
                        "vbscript:x", "//evil.com", "http://latapeta.com"]) {
      assert.equal(urlSegura(malo), null, malo);
    }
  });

  test("y un http:// en una página https lo bloquea el navegador sin decir nada", () => {
    // El enlace parecería simplemente roto, que es peor que rechazarlo aquí.
    assert.equal(urlSegura("http://cualquiera.com"), null);
  });
});

describe("la paleta es cerrada", () => {
  test("un color libre es un sitio donde escribir lo que sea dentro de un estilo", () => {
    assert.equal(paletaDe("verde").acento, PALETAS.verde.acento);
    // Lo que no está en la paleta cae al valor de la casa; no se pinta lo que llegue.
    for (const malo of ["#fff;background:url(javascript:1)", "red", "", null, "</style>"]) {
      assert.equal(paletaDe(malo).acento, PALETAS.verde.acento, String(malo));
    }
    assert.throws(() => { PALETAS.nuevo = {}; }, TypeError);
  });
});

describe("los campos del formulario", () => {
  test("nombre y teléfono son SIEMPRE obligatorios, se pida lo que se pida", () => {
    // El teléfono ES la cuenta. Que dependa de que alguien no desmarque una casilla sería dejar
    // la identidad del sistema a merced de un despiste.
    const r = normalizarCampos([{ id: "telefono", obligatorio: false, visible: false },
                                { id: "nombre", obligatorio: false }]);
    for (const id of CAMPOS_FORZOSOS) {
      const c = r.find((x) => x.id === id);
      assert.equal(c.obligatorio, true, id);
      assert.equal(c.visible, true, id);
    }
  });

  test("el consentimiento comercial NUNCA es obligatorio", () => {
    // Si hay que aceptarlo para poder enviar, no se ha elegido nada.
    assert.deepEqual([...CAMPOS_NUNCA_OBLIGATORIOS], ["comercial"]);
    const c = normalizarCampos([{ id: "comercial", obligatorio: true }]).find((x) => x.id === "comercial");
    assert.equal(c.obligatorio, false);
  });

  test("y NUNCA nace marcado", () => {
    const c = normalizarCampos([{ id: "comercial", marcado: true }]).find((x) => x.id === "comercial");
    assert.equal(c.marcado, false, "un consentimiento premarcado no es un consentimiento");
  });

  test("un campo que no está en el catálogo no se pide", () => {
    const r = normalizarCampos([{ id: "dni" }, { id: "iban" }, { id: "direccion" }]);
    assert.deepEqual(r.map((c) => c.id), ["nombre", "telefono"]);
  });

  test("los forzosos van primero, y el resto en su orden", () => {
    const r = normalizarCampos([{ id: "email" }, { id: "comercial" }, { id: "nombre" }]);
    assert.deepEqual(r.map((c) => c.id), ["nombre", "telefono", "email", "comercial"]);
  });

  test("la etiqueta configurada pasa por el saneado", () => {
    const c = normalizarCampos([{ id: "email", etiqueta: "<b>Correo</b><script>x</script>" }])
      .find((x) => x.id === "email");
    assert.equal(c.etiqueta, "Correo");
  });
});

describe("publicar un formulario", () => {
  const bueno = {
    titulo: "Desayuno gratis", texto_boton: "Apuntarme", mensaje_exito: "¡Listo!",
    consentimiento_texto: "Acepto que guardéis mis datos para esta campaña.",
    privacidad_url: "https://latapeta.com/privacidad", campos: [{ id: "nombre" }, { id: "telefono" }],
  };

  test("con todo puesto, se puede", () => {
    assert.equal(validarFormulario(bueno).ok, true);
  });

  test("sin consentimiento NO se pide un teléfono a nadie", () => {
    const r = validarFormulario({ ...bueno, consentimiento_texto: "" });
    assert.equal(r.ok, false);
    assert.ok(r.falta.some((f) => /consentimiento/i.test(f)));
  });

  test("sin política de privacidad tampoco, y tiene que ser https", () => {
    assert.equal(validarFormulario({ ...bueno, privacidad_url: "" }).ok, false);
    assert.equal(validarFormulario({ ...bueno, privacidad_url: "http://x.com" }).ok, false);
  });

  test("las fechas al revés se cazan", () => {
    const r = validarFormulario({ ...bueno, abre_en: "2026-10-02", cierra_en: "2026-10-01" });
    assert.ok(r.falta.some((f) => /posterior/i.test(f)));
  });

  test("un título que solo era HTML cuenta como vacío", () => {
    assert.equal(validarFormulario({ ...bueno, titulo: "<script>x</script>" }).ok, false);
  });
});

describe("cuándo está abierto", () => {
  const cfg = { estado: "publicado", abre_en: "2026-09-01", cierra_en: "2026-10-01" };
  test("dentro de sus fechas", () => {
    assert.equal(formularioAbierto(cfg, { fechaMadrid: "2026-09-15" }).ok, true);
    assert.equal(formularioAbierto(cfg, { fechaMadrid: "2026-10-01" }).ok, true, "el último día cuenta");
  });
  test("fuera, no", () => {
    assert.equal(formularioAbierto(cfg, { fechaMadrid: "2026-08-31" }).motivo, "aun_no_abre");
    assert.equal(formularioAbierto(cfg, { fechaMadrid: "2026-10-02" }).motivo, "ya_cerrado");
  });
  test("un borrador no existe para nadie", () => {
    assert.equal(formularioAbierto({ ...cfg, estado: "borrador" }, { fechaMadrid: "2026-09-15" }).motivo, "no_publicado");
    assert.equal(formularioAbierto(null, { fechaMadrid: "2026-09-15" }).motivo, "no_existe");
  });
});

describe("las plantillas de WhatsApp", () => {
  test("solo se sustituyen las variables de la lista", () => {
    assert.deepEqual([...VARIABLES], ["nombre", "enlace", "fecha", "local", "premio"]);
    const r = renderPlantilla("Hola {nombre}, aquí tienes {enlace}.",
      { nombre: "Marta", enlace: "https://x/t" });
    assert.equal(r, "Hola Marta, aquí tienes https://x/t.");
  });

  test("una variable que NO está en la lista se queda a la vista, sin sustituir", () => {
    // `{telefono}` mandaría el teléfono del cliente dentro de su propio mensaje, y `{token}` su
    // credencial por WhatsApp. Dejarlas escritas hace que quien redactó lo vea y lo corrija.
    const r = renderPlantilla("Tu {telefono} y tu {token} y {member_hash}",
      { telefono: "600111222", token: "SECRETO", member_hash: "abc" });
    assert.equal(r, "Tu {telefono} y tu {token} y {member_hash}");
    for (const secreto of ["600111222", "SECRETO", "abc"]) assert.ok(!r.includes(secreto));
  });

  test("y se avisa de cuáles son antes de aprobar nada", () => {
    assert.deepEqual(variablesDesconocidas("Hola {nombre} {telefono} {token} {nombre}"),
      ["telefono", "token"]);
    assert.deepEqual(variablesDesconocidas("Hola {nombre}"), []);
  });

  test("la propia plantilla pasa por el saneado", () => {
    assert.equal(renderPlantilla("<script>x</script>Hola {nombre}", { nombre: "Marta" }), "Hola Marta");
  });

  test("un valor de variable también se sanea", () => {
    const r = renderPlantilla("Hola {nombre}", { nombre: "<img src=x onerror=alert(1)>" });
    assert.ok(!/[<>]/.test(r), r);
  });
});

describe("a quién NO se le escribe", () => {
  test("los cuatro motivos, cada uno con su nombre", () => {
    assert.equal(puedeRecibir({ telefono: "600", consiente: true }).ok, true);
    assert.equal(puedeRecibir({ telefono: "", consiente: true }).motivo, "sin_telefono");
    assert.equal(puedeRecibir({ telefono: "600", consiente: true, baja: true }).motivo, "de_baja");
    assert.equal(puedeRecibir({ telefono: "600", consiente: false }).motivo, "sin_consentimiento");
    assert.equal(puedeRecibir({ telefono: "600", consiente: true, ya_enviado: true }).motivo, "ya_enviado");
  });

  test("sin consentimiento NO se escribe, aunque todo lo demás esté bien", () => {
    // Es el caso que importa: el resto son fallos técnicos, éste es una decisión de la persona.
    assert.equal(puedeRecibir({ telefono: "600111222", consiente: false, baja: false }).ok, false);
  });
});
