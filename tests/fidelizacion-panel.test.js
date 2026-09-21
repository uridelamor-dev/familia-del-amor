// TODO SE CONFIGURA DESDE EL PANEL. Si algo solo se pudiera hacer con `curl`, no está terminado.
//
// ── QUÉ PROTEGEN ESTOS TESTS ─────────────────────────────────────────────────────────────────
//
// Son de COMPORTAMIENTO, no de aspecto. Lo que se blinda es que:
//
//   · Una versión PUBLICADA no se edita. Se copia y se guarda otra. Editarla en sitio cambiaría
//     lo que ya se ofreció a clientes que aún tienen el ticket abierto.
//   · Una vista previa NO escribe ni envía. Es la pantalla donde más fácil sería colar un envío.
//   · Nada sale sin que Dirección escriba ENVIAR, ni siquiera llamando a la API directamente.
//   · Un doble clic o dos pestañas no duplican nada: el candado es un índice único, no un `if`.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const promo = readFileSync(new URL("../public/promo.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
const trozo = (a, b) => {
  const i = server.indexOf(a), f = server.indexOf(b, i + 1);
  if (i < 0 || f < 0) throw new Error(`recorte no encontrado: ${a} … ${b}`);
  return server.slice(i, f);
};
/** Un endpoint entero, desde su `app.x(` hasta el `});` que lo cierra. Más robusto que un ancla
 *  al bloque siguiente, que se rompe en cuanto se reordena algo. */
const ruta = (firma) => {
  const i = server.indexOf(firma);
  if (i < 0) throw new Error(`no existe la ruta ${firma}`);
  const f = server.indexOf("\n});", i);
  return server.slice(i, f + 4);
};
const bloque = (a, b) => panel.slice(panel.indexOf(a), panel.indexOf(b));

describe("todo se crea y se versiona DESDE EL PANEL", () => {
  test("hay formulario de creación para las cuatro cosas", () => {
    // Si una de estas faltara, esa parte solo se podría configurar con `curl`.
    for (const [fn, accion] of [["fidgPromoNueva", "fidg-promo-nueva"],
                                ["fidgFormNuevo", "fidg-form-nuevo"],
                                ["fidgTarjetaNueva", "fidg-tarjeta-nueva"],
                                ["fidgComNueva", "fidg-com-nueva"]]) {
      assert.ok(panel.includes(`async function ${fn}(`), `falta el formulario ${fn}`);
      // El botón puede estar escrito literal o pasado a `renderFidgListaSimple`, que lo compone.
      assert.ok(panel.includes(`data-act="${accion}"`) || panel.includes(`"${accion}"`),
        `falta el botón que abre ${fn}`);
      assert.ok(panel.includes(`act === "${accion}"`), `${accion} no está cableado`);
    }
  });

  test("y cada una tiene su guardar y su publicar, por separado", () => {
    for (const a of ["fidg-promo-guardar", "fidg-form-guardar", "fidg-tarjeta-guardar"]) {
      assert.ok(panel.includes(`data-act="${a}" data-pub="0"`), `${a}: falta guardar borrador`);
      assert.ok(panel.includes(`data-act="${a}" data-pub="1"`), `${a}: falta publicar`);
    }
    for (const a of ["fidg-form-nuevo", "fidg-tarjeta-nueva"]) {
      assert.ok(panel.includes(`"${a}"`), `${a} no llega al renderizador de listas`);
    }
    // La comunicación no se «publica»: se aprueba, que es otra cosa y es de Dirección.
    assert.ok(panel.includes('data-act="fidg-com-guardar"'));
    assert.ok(!panel.includes('data-act="fidg-com-guardar" data-pub="1"'));
  });

  test("PUBLICAR siempre pregunta, y dice qué va a pasar", () => {
    for (const [fn, patron] of [["fidgPromoGuardar", /Se PUBLICARÁ/],
                                ["fidgFormGuardar", /Se PUBLICARÁ/],
                                ["fidgTarjetaGuardar", /Se PUBLICARÁ/]]) {
      const f = panel.slice(panel.indexOf(`async function ${fn}(`), panel.indexOf(`async function ${fn}(`) + 1400);
      assert.match(f, /if \(publicar === "1" && !confirm\(/, fn);
      assert.match(f, patron, fn);
    }
  });

  test("una versión publicada se COPIA por dentro, aunque el botón diga «Editar»", () => {
    // ── LO QUE PROTEGE ESTE CANDADO CAMBIÓ DE SITIO, NO DE FONDO ────────────────────────────
    //
    // Antes exigía que el botón dijera «Copiar a versión nueva». Eso describía la MECÁNICA, y la
    // mecánica es lo que no puede cambiar: una versión publicada nunca se reescribe. El rótulo sí
    // podía, y ahora dice «Editar», que es lo que la persona está haciendo.
    //
    // Así que se vigila lo de verdad importante: que el botón de una versión publicada dispare la
    // MISMA acción que crear —la que escribe una fila nueva— y que el rótulo venga de fuera.
    assert.match(panel, /x\.estado === "borrador"\) \? "Seguir editando" : verbo/,
      "el rótulo del botón ha dejado de ser configurable");
    assert.match(panel, /verbo = "Copiar a versión nueva"/,
      "el rótulo por defecto ya no describe la mecánica para las listas que no son de formularios");
    assert.match(panel, /data-act="\$\{accion\}" data-id="\$\{x\.id\}"/,
      "el botón de una versión publicada tiene que disparar la misma acción que crear una nueva");
    // Y que no haya aparecido ningún camino de edición en sitio.
    assert.ok(!/fidg-form-editar|fidg-form-guardar-en-sitio/.test(panel),
      "ha aparecido una acción de editar en sitio: una versión publicada no se reescribe");

    // Las PROMOCIONES conservan su rótulo: el cambio de verbo es solo de formularios.
    assert.match(panel, /p\.estado === "borrador" \? "Seguir editando" : "Copiar"/,
      "la lista de promociones ha cambiado de rótulo sin haberlo pedido");

    // Y el aviso sigue existiendo y sigue diciendo que se crea una versión nueva, en las dos
    // redacciones: la de copiar y la de editar.
    assert.match(panel, /const avisoCopia = \(v, \{ editar = false \} = \{\}\) =>/,
      "el aviso ha perdido su parámetro: las dos redacciones eran lo que permitía cambiar el " +
      "rótulo sin esconder que por debajo se versiona");
    assert.match(panel, /versión nueva<\/b>/, "el aviso ya no dice que se crea una versión nueva");
    assert.match(panel, /se cierra intacta/,
      "el aviso de edición ya no dice qué pasa con la versión anterior");
  });

  test("el servidor NO tiene ninguna ruta para editar una versión publicada", () => {
    // El candado de verdad no está en la pantalla: no existe el endpoint.
    //
    // ── LA ÚNICA EXCEPCIÓN, Y POR QUÉ SE LE HACE SITIO ──────────────────────────────────────
    //
    // Cambiar EL ORDEN de los campos. No toca ninguna condición ni ningún texto legal —que es lo
    // que el versionado protege—, y hacerlo por el camino de copiar y publicar sube la versión,
    // que es lo que entra en la clave del WhatsApp del alta: mover los apellidos podía acabar
    // mandándole el mensaje otra vez a quien ya se había apuntado.
    //
    // Se recorta esa ruta y se escanea el resto. Que ELLA solo escriba `campos` se comprueba
    // aparte, en `formulario-orden.test.js`.
    const i = server.indexOf('app.patch("/api/fidelizacion/formularios/:id/orden"');
    assert.ok(i >= 0, "ya no existe la ruta de orden: revisa este candado");
    const f = server.indexOf("\n});", i);
    const resto = server.slice(0, i) + server.slice(f);

    for (const tabla of ["fid_reglas", "fid_promos", "fid_formularios", "fid_tarjeta_config"]) {
      const ups = [...resto.matchAll(new RegExp(`UPDATE ${tabla} SET ([^\`]*)`, "g"))].map((m) => m[1]);
      for (const u of ups) {
        // Lo único que se actualiza son estados y cierres de vigencia, nunca condiciones.
        assert.ok(!/puntos_necesarios|descuento_euros|consumo_minimo|valor =|titulo =|campos =/.test(u),
          `${tabla}: se edita una versión publicada — ${u}`);
      }
    }
    // Y que la excepción sea UNA: `campos = ?` no puede aparecer en ningún otro sitio.
    assert.equal((server.match(/campos = \?/g) || []).length, 1,
      "hay más de un sitio que reescribe los campos de un formulario");
  });
});

describe("las vistas previas no escriben ni envían", () => {
  test("la del formulario y la de la tarjeta se pintan EN EL NAVEGADOR", () => {
    for (const fn of ["fidgFormPrev", "fidgTarjetaPrev"]) {
      const f = bloque(`function ${fn}(`, `async function fidg${fn === "fidgFormPrev" ? "FormGuardar" : "TarjetaGuardar"}(`);
      assert.ok(!/apiSend\(/.test(f), `${fn} llama a la API`);
      assert.ok(!/fetch\(/.test(f), `${fn} hace una petición`);
      assert.match(f, /no se ha guardado nada/);
    }
  });

  test("las dos ofrecen móvil Y escritorio", () => {
    for (const a of ["fidg-form-prev", "fidg-tarjeta-prev"]) {
      assert.ok(panel.includes(`data-act="${a}" data-v="movil"`), `${a}: falta móvil`);
      assert.ok(panel.includes(`data-act="${a}" data-v="escritorio"`), `${a}: falta escritorio`);
    }
    assert.match(panel, /vista === "movil" \? 390 : 900/);
  });

  test("la de la comunicación cuenta destinatarios pero NO encola", () => {
    const f = bloque("async function fidgComPrev()", "async function fidgComGuardar()");
    assert.match(f, /comunicaciones\/preparar/);
    assert.ok(!/encolar|aprobar/.test(f), "la vista previa encola o aprueba");
    // Y el endpoint tampoco escribe.
    const prep = ruta('app.post("/api/fidelizacion/comunicaciones/preparar"');
    for (const escritura of ["INSERT INTO", "UPDATE ", "DELETE FROM", "cap_cola"]) {
      assert.ok(!prep.includes(escritura), `preparar escribe: ${escritura}`);
    }
    assert.match(prep, /No se ha enviado nada/);
  });

  test("el ejemplo del mensaje usa datos INVENTADOS, no el teléfono de nadie", () => {
    const prep = ruta('app.post("/api/fidelizacion/comunicaciones/preparar"');
    assert.match(prep, /nombre: "Marta"/);
    assert.match(prep, /NO se usa el teléfono de nadie/);
    // Y la respuesta no lleva ni un teléfono real: solo recuentos.
    const resp = prep.slice(prep.lastIndexOf("res.json("));
    assert.ok(!/destinatarios\.map|destinatarios\.join|telefono:/.test(resp), "salen teléfonos");
    assert.match(resp, /destinatarios: destinatarios\.length/);
  });

  test("la previsualización de la tarjeta enseña los CUATRO estados del cliente", () => {
    const f = bloque("function fidgTarjetaPrev(", "async function fidgTarjetaGuardar(");
    for (const estado of ["En preparación", "Sin puntos todavía", "a medio camino", "Ya puede canjear"]) {
      assert.ok(f.includes(estado), `falta el estado «${estado}»`);
    }
  });
});

describe("nada sale sin que Dirección escriba ENVIAR", () => {
  const aprobar = ruta('app.post("/api/fidelizacion/comunicaciones/:id/aprobar"');
  const encolar = ruta('app.post("/api/fidelizacion/comunicaciones/:id/encolar"');

  test("aprobar es SOLO de Dirección y exige la palabra escrita", () => {
    assert.match(server, /app\.post\("\/api\/fidelizacion\/comunicaciones\/:id\/aprobar", requireAuth\(\["direccion"\]\)/);
    assert.match(aprobar, /!== "ENVIAR"/);
    assert.match(aprobar, /res\.status\(400\)/);
  });

  test("Marketing puede PREPARAR pero no aprobar ni encolar ni cancelar", () => {
    // Es la línea entera: preparar la lista es trabajo comercial; autorizar el envío no.
    const dePromos = ["/api/fidelizacion/comunicaciones", "/api/fidelizacion/comunicaciones/preparar",
                      "/api/fidelizacion/comunicaciones/:id/pausa"];
    const soloDireccion = ["/api/fidelizacion/comunicaciones/:id/aprobar",
                           "/api/fidelizacion/comunicaciones/:id/encolar",
                           "/api/fidelizacion/comunicaciones/:id/cancelar"];
    for (const r of dePromos) {
      const firmas = [...server.matchAll(new RegExp(`app\\.(get|post)\\("${r.replace(/\//g, "\\/")}", ([^,]+),`, "g"))];
      assert.ok(firmas.length >= 1, `falta ${r}`);
      for (const f of firmas) assert.equal(f[2].trim(), "requireAuth(PROMOS_ROLES)", r);
    }
    for (const r of soloDireccion) {
      const i = server.indexOf(`app.post("${r}"`);
      assert.ok(i > 0, `falta ${r}`);
      assert.match(server.slice(i, i + r.length + 60), /requireAuth\(\["direccion"\]\)/, r);
    }
  });

  test("ENCOLAR sobre un borrador devuelve 409: la ruta NO aprueba", () => {
    assert.match(encolar, /if \(c\.estado !== "aprobada"\)/);
    assert.match(encolar, /res\.status\(409\)/);
    assert.match(encolar, /Solo Dirección puede aprobarla, escribiendo ENVIAR/);
  });

  test("el token de la cola es DETERMINISTA: dos pestañas no duplican", () => {
    // El candado es el índice único de `cap_cola.token`, no una comprobación previa que una de las
    // dos peticiones podría adelantar.
    assert.match(encolar, /const token = `com:\$\{c\.id\}:\$\{e\.telefono\}`/);
    assert.match(encolar, /ON CONFLICT \(token\) DO NOTHING/);
    const cola = readFileSync(new URL("../src/modules/captacion/schema.js", import.meta.url), "utf8");
    assert.match(cola, /token TEXT NOT NULL UNIQUE/);
  });

  test("y el envío se marca con un WHERE que solo pasa una vez", () => {
    assert.match(encolar, /WHERE id = \? AND estado = 'pendiente'/);
    // Y el destinatario es único por comunicación: el índice lo impide desde la base.
    assert.match(server, /ON CONFLICT \(comunicacion_id, telefono\) DO NOTHING/);
  });

  test("Dirección puede CANCELAR lo que siga pendiente", () => {
    const cancelar = ruta('app.post("/api/fidelizacion/comunicaciones/:id/cancelar"');
    assert.match(cancelar, /estado = 'descartado'/);
    assert.match(cancelar, /AND estado = 'pendiente'/);
    // Lo ya enviado no se desenvía, y se dice.
    assert.match(cancelar, /Un mensaje ya enviado no se desenvía/);
  });

  test("una comunicación ya aprobada NO se puede reescribir", () => {
    // Lo que se aprobó es lo que sale: si se pudiera editar después, la aprobación no valdría nada.
    const guardar = ruta('app.post("/api/fidelizacion/comunicaciones", requireAuth');
    assert.match(guardar, /if \(previa && previa\.estado !== "borrador"\)/);
    assert.match(guardar, /ya está aprobada\. Crea otra con clave distinta/);
  });
});

describe("el formulario público", () => {
  test("`/promo.html` prueba PRIMERO el configurable y cae al de siempre", () => {
    // Así una campaña que ya funciona no deja de funcionar porque alguien empiece a configurar otra.
    assert.match(promo, /fetch\("\/api\/publico\/formulario\/" \+ encodeURIComponent\(CLAVE\)\)/);
    assert.match(promo, /if \(j && j\.ok\) \{ pintarConfigurable\(j\); return null; \}/);
    assert.match(promo, /return arrancarCampanaClasica\(\)/);
    assert.match(promo, /function arrancarCampanaClasica\(\)/);
  });

  test("los textos configurados se pintan como TEXTO, nunca como HTML", () => {
    const f = promo.slice(promo.indexOf("function pintarConfigurable("), promo.indexOf("var urlCampana"));
    // `textContent` en todo lo que viene de la configuración.
    for (const id of ["fxTitulo", "fxSub", "fxIntro", "fxBoton"]) {
      assert.ok(new RegExp(`\\$\\("${id}"\\)\\.textContent`).test(f), `${id} no usa textContent`);
    }
    // El consentimiento es el único que se compone por partes, porque lleva un enlace DENTRO de
    // la frase. Se monta con nodos —`createTextNode` y un `<a>`—, que es igual de seguro que
    // `textContent` y, a diferencia de `innerHTML`, no interpreta nada de lo que venga escrito.
    // El recorte SE COMPRUEBA. Un ancla que desaparece deja `indexOf` en -1, el recorte sale
    // vacío y una comprobación de «esto no aparece» pasa sin mirar nada.
    const desde = promo.indexOf("function pintarConsentimiento(");
    const hasta = promo.indexOf("var NAC_ANIOS", desde);
    assert.ok(desde >= 0 && hasta > desde, "el recorte del consentimiento ya no encuentra sus anclas");
    const consent = promo.slice(desde, hasta);
    assert.ok(!/innerHTML/.test(consent), "el consentimiento se pinta como HTML");
    assert.match(consent, /caja\.textContent = "";/);
    assert.match(consent, /document\.createTextNode\(frase\.slice\(/);
    assert.match(consent, /a\.textContent = nombre;/);
    assert.match(f, /TEXTO, NUNCA HTML/);
    // Y las etiquetas de los campos tampoco.
    assert.match(f, /l\.textContent = x\.etiqueta/);
  });

  test("un DOBLE CLIC no manda el formulario dos veces", () => {
    const f = promo.slice(promo.indexOf("function pintarConfigurable("), promo.indexOf("var urlCampana"));
    assert.match(f, /if \(btn\.disabled\) return;/);
    assert.match(f, /btn\.disabled = true;/);
    // Y si falla, se vuelve a habilitar: si no, un error dejaría al cliente sin poder reintentar.
    // La rehabilitación vive en `fallo()`, que es el único camino de error de todo el formulario.
    assert.match(f, /function fallo\(txt\) \{[\s\S]{0,240}\$\("fxBoton"\)\.disabled = false;/);
    // Y todos los errores pasan por ahí: ninguno deja el botón bloqueado.
    const errores = (f.match(/fallo\(/g) || []).length;
    assert.ok(errores >= 3, `solo ${errores} caminos de error pasan por fallo()`);
  });

  test("la respuesta es la MISMA exista o no el teléfono", () => {
    const alta = ruta('app.post("/api/publico/formulario/:clave"');
    assert.match(alta, /MISMA RESPUESTA, exista o no/);
    // No hay ninguna rama que conteste distinto según si había lead previo.
    assert.ok(!/previo \?[^;]*res\.json|if \(previo\)[\s\S]{0,200}res\.json/.test(alta),
      "la respuesta distingue si el teléfono existía");
    assert.match(alta, /no dice si es nuevo o de antes/);
  });

  test("UN TELÉFONO ES UNA CUENTA: se busca antes de crear", () => {
    const alta = ruta('app.post("/api/publico/formulario/:clave"');
    assert.match(alta, /const tel = proTel9\(b\.telefono\)/);
    assert.match(alta, /FROM leads WHERE telefono = \?/);
    assert.match(alta, /FROM pro_qr\s+WHERE clase = 'carnet' AND telefono = \?/,
      "el alta ya no busca el carné que la persona ya tenga: crearía uno nuevo cada vez");
    // Y si el nombre no coincide, se REUTILIZA y se anota; no se pisa.
    assert.match(alta, /avisoNombre = /);
    assert.ok(!/UPDATE leads SET nombre/.test(alta), "se sobrescribe el nombre guardado");
  });

  test("sin consentimiento no se guarda nada", () => {
    const alta = ruta('app.post("/api/publico/formulario/:clave"');
    assert.match(alta, /if \(b\.consentimiento !== true\)/);
    assert.match(alta, /res\.status\(400\)/);
  });

  test("el consentimiento se guarda CON SU TEXTO y su versión", () => {
    const alta = ruta('app.post("/api/publico/formulario/:clave"');
    assert.match(alta, /INSERT INTO fid_consentimientos/);
    assert.match(alta, /formulario_version/);
    assert.match(alta, /f\.consentimiento_texto/);
    // Se guarda el texto ENTERO que se aceptó, no una marca: «aceptó» sin decir qué no sirve el
    // día que alguien pregunte, que es justo cuando hace falta.
    assert.match(alta, /String\(f\.consentimiento_texto \|\| ""\)\.slice\(0, 4000\)/);
    assert.match(alta, /f\.version/);
  });

  test("un formulario no publicado o cerrado contesta lo MISMO que uno que no existe", () => {
    // Si se distinguieran, probar claves diría cuáles existen.
    const pub = ruta('app.get("/api/publico/formulario/:clave"');
    assert.match(pub, /estado = 'publicado'/);
    assert.match(pub, /Este formulario no está disponible/);
    assert.match(pub, /no se cuenta si existe pero está cerrado o si no existe/);
  });
});

describe("los estados visuales", () => {
  test("la lista de promociones distingue los cuatro estados", () => {
    const f = bloque("function renderFidgPromos()", "function renderFidgListaSimple(");
    assert.match(f, /p\.estado === "publicada" \? "ok" : p\.estado === "pausada" \? "warn" : ""/);
    assert.match(f, /data-e="pausada"/);
    assert.match(f, /data-e="publicada"/);
  });

  test("y el vacío dice que está vacío, no se queda en blanco", () => {
    for (const patron of [/Todavía no hay ninguna\./, /Todavía no hay ningún \$\{que\}\./,
                          /No hay nada pendiente\./, /Sin productos\. Sincroniza el catálogo\./]) {
      assert.ok(patron.test(panel), `falta un estado vacío: ${patron}`);
    }
  });

  test("las comunicaciones tienen sus cinco estados con nombre", () => {
    const f = bloque("function renderFidgComunicaciones()", "function renderFidgRevisiones()");
    for (const e of ["borrador", "aprobada", "enviando", "pausada", "terminada"]) {
      assert.ok(f.includes(e + ":"), `falta el estado ${e}`);
    }
    assert.match(f, /Nada sale sin aprobación de Dirección/);
  });

  test("el catálogo distingue activo de dado de baja, y el error de sincronización", () => {
    const f = bloque("function renderFidgCatalogo(local)", "function renderFidgPromos()");
    assert.match(f, /p\.activo \? "activo" : "de baja"/);
    assert.match(f, /u\.ok \? "OK" : "Error"/);
    assert.match(f, /Último intento \(falló\)/);
  });

  test("y la puerta, sus cinco, con lo que significa cada uno", () => {
    const f = bloque("const FIDG_PUERTA_TXT", "function renderFidGestion()");
    for (const e of ["no_preparado", "sombra", "listo_para_activar", "activo", "pausado"]) {
      assert.ok(f.includes(e + ":"), `falta ${e}`);
    }
  });
});

describe("nada de lo que se ve expone lo que no debe", () => {
  test("ninguna pantalla nueva pinta un teléfono, un token ni un cuerpo JSON", () => {
    // `telefono` aparece como NOMBRE DE CAMPO del formulario, que es legítimo: se está
    // configurando qué se pide. Lo que no puede haber es el VALOR de nadie pintado en pantalla.
    // ACOTADO: sin el final, el recorte llega al resto del panel y caza código ajeno que sí
    // trabaja con teléfonos legítimamente (segmentos, exclusiones de envío).
    // ACOTADO Y SIN COMENTARIOS: sin el final, el recorte llega al resto del panel y caza código
    // ajeno que sí trabaja con teléfonos legítimamente; y en los comentarios se explica a
    // propósito que los TOKENS no se configuran aquí, cosa que una búsqueda a pelo confundiría
    // con un token pintado en pantalla.
    const f = bloque("// ── La puesta en producción y la configuración comercial", "// ── LA PANTALLA DE ÁGORA, EN TRES APARTADOS")
      .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    // Se buscan ACCESOS A DATO, no la palabra: «Los tokens y el Workplace no» es una frase que se
    // le enseña a quien configura, y es justo la que explica dónde está la línea.
    for (const malo of [".token", "token_hash", "token_pista", "cuerpo_enc", "member_hash",
                        "pass_enc", "JSON.stringify(j)"]) {
      assert.ok(!f.includes(malo), `la pantalla enseña «${malo}»`);
    }
    // Ni un acceso a la propiedad `telefono` de un dato para pintarlo.
    for (const acceso of [".telefono", "telefono}", "telefono)"]) {
      assert.ok(!f.includes(acceso), `la pantalla pinta un teléfono: «${acceso}»`);
    }
    // Y cada `telefono` que queda es un IDENTIFICADOR, no el dato de nadie: el id del campo
    // configurable, la casilla que lo acompaña o la clave del mensaje de error. Se enseñan las
    // líneas que sobran en vez de contarlas: un número no dice dónde mirar.
    const PERMITIDO = /"telefono"|fc[VOT]_telefono|telefono_no_valido|id === "telefono"/;
    const sobran = f.split("\n")
      .filter((l) => l.replace(new RegExp(PERMITIDO.source, "g"), "").includes("telefono"));
    assert.deepEqual(sobran, [], `hay un \`telefono\` que no es un identificador:\n${sobran.join("\n")}`);
  });

  test("ni el listado de comunicaciones, que es donde más fácil sería", () => {
    const lista = ruta('app.get("/api/fidelizacion/comunicaciones", requireAuth');
    assert.match(lista, /los teléfonos NO salen nunca de aquí/);
    // La consulta de progreso solo cuenta; no trae la columna.
    assert.ok(!/SELECT[^;]*telefono[^;]*FROM fid_comunicacion_envios/.test(lista));
  });

  test("y un error de sincronización no lleva host ni token", () => {
    const sync = ruta('app.post("/api/fidelizacion/catalogo/sincronizar"');
    assert.match(sync, /fidErrorSync\(e, \{ host: cfg\.host, token \}\)/);
    assert.match(sync, /Se dice QUÉ falta, nunca qué hay puesto/);
    assert.ok(!/error: .*cfg\.host|error: .*token/.test(sync), "el error lleva credenciales");
  });
});
