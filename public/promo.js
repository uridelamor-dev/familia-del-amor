/* La página de campaña: la ruta a la que apunta un anuncio de pago.
 *
 * Autocontenida y sin dependencias, como cupon.js y tarjeta.js: sin sesión, sin app.js.
 *
 * AQUÍ NO SE DECIDE NADA. Si la campaña está abierta, en qué idioma se habla y qué se le dice
 * lo manda el servidor (`src/modules/captacion/`). Si esta página dedujera por su cuenta que se
 * puede pedir y el envío del formulario contestara que no, el cliente se llevaría un «no» tras
 * haber rellenado seis campos, que es la peor forma de perderlo.
 *
 * Y NUNCA se enseña el código. Llega solo por WhatsApp, y eso es precisamente lo que comprueba
 * que el teléfono es de verdad: un número inventado no recibe nada.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var P = new URLSearchParams(location.search);
  var CLAVE = P.get("c") || "";
  var T = null;          // etiquetas del idioma que decida el servidor
  var TOKEN = "";
  var sondeos = 0;

  function esc(s) { return String(s == null ? "" : s); }

  function avisar(texto) {
    $("pmCargando").classList.add("hidden");
    $("pmForm").classList.add("hidden");
    var caja = $("pmAviso");
    caja.textContent = texto;
    caja.classList.remove("hidden");
  }

  /* Sin clave de campaña no hay página. Se va a la portada en vez de enseñar un formulario que
     no lleva a ningún sitio: quien ha llegado aquí sin el anuncio no ha hecho nada malo. */
  if (!CLAVE) { location.replace("/"); return; }

  /** Los parámetros que Meta cuelga de la URL. Se mandan tal cual para poder saber después qué
      anuncio trajo a quién; el servidor los recorta. */
  function utm() {
    var out = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"]
      .forEach(function (k) { if (P.get(k)) out[k] = P.get(k); });
    return out;
  }

  // ── EL PÍXEL DE META YA NO SE INSTALA AQUÍ ──────────────────────────────────────────────────
  //
  // Estaba, y era el problema: el fragmento de Meta escrito a mano dentro del JavaScript de una
  // campaña, cargado SOLO desde el camino de la campaña clásica. Consecuencias, las dos vividas:
  //
  //   · Toda la web pública sin medir — Meta optimizaba los anuncios a ciegas.
  //   · Al migrar a los formularios configurables, `cargarPixel()` dejó de llamarse y esos
  //     formularios no mandaron ni una visita ni un alta. En silencio, sin ningún error.
  //
  // Ahora lo lleva `/js/meta.js`, que es el único sitio del proyecto que llama a `fbq`, y que no
  // carga nada sin consentimiento. Desde aquí solo se avisa de los eventos de negocio.

  /** Un evento de negocio. Si no hay consentimiento, no sale de aquí. */
  function meta(nombre) {
    if (window.fdaMeta) window.fdaMeta.evento(nombre);
  }

  function pintarFormulario(d) {
    T = d.etiquetas || {};
    document.documentElement.lang = d.idioma || "es";
    document.title = (d.titular || "") + " · Familia del Amor";

    $("pmCargando").classList.add("hidden");
    $("pmForm").classList.remove("hidden");
    $("pmTitular").textContent = esc(d.titular);
    $("pmSub").textContent = esc(d.subtitulo);

    // La oferta, con sus propias palabras y dónde vale. «Dónde» lo compone el servidor con la
    // misma función que el WhatsApp y que la barra: si se montara aquí, podrían contradecirse.
    var oferta = [d.promocion, d.descripcion, d.donde].filter(Boolean).join(" · ");
    if (oferta) { $("pmOferta").textContent = oferta; $("pmOferta").classList.remove("hidden"); }

    [["pmLNombre", "nombre"], ["pmLApellidos", "apellidos"], ["pmLNacimiento", "nacimiento"],
     ["pmLPoblacion", "poblacion"], ["pmLTelefono", "telefono"], ["pmLCorreo", "correo"],
     ["pmLConsent", "consent"]].forEach(function (par) {
      if (T[par[1]]) $(par[0]).textContent = T[par[1]];
    });
    if (T.enviar) $("pmBtn").textContent = T.enviar;
  }

  function error(texto, campo) {
    var caja = $("pmError");
    caja.textContent = texto;
    caja.classList.remove("hidden");
    if (campo) { campo.setAttribute("aria-invalid", "true"); campo.focus(); }
  }

  function gracias(titulo, texto, esperando) {
    $("pmForm").classList.add("hidden");
    var caja = $("pmGracias");
    caja.classList.remove("hidden");
    caja.classList.toggle("promo-esperando", !!esperando);
    $("pmGtitulo").textContent = esc(titulo);
    $("pmGtexto").textContent = esc(texto);
    window.scrollTo(0, 0);
  }

  /* ¿Ha salido ya? Se pregunta unas cuantas veces y se para: la respuesta solo puede ser un
     estado, nunca el código. Si tarda, no se miente — se dice que llegará en unos minutos. */
  function sondear() {
    if (!TOKEN || sondeos >= 12) { if (TOKEN) gracias($("pmGtitulo").textContent, T.gracias_tarda, false); return; }
    sondeos++;
    fetch("/api/captacion/estado/" + encodeURIComponent(TOKEN))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.estado === "enviado") { gracias(T.gracias_titulo, T.gracias_enviado, false); return; }
        if (d && (d.estado === "fallido" || d.estado === "descartado")) {
          gracias(T.gracias_titulo, T.gracias_tarda, false);
          return;
        }
        setTimeout(sondear, 2500);
      })
      .catch(function () { setTimeout(sondear, 4000); });
  }

  $("pmF").addEventListener("submit", function (ev) {
    ev.preventDefault();
    $("pmError").classList.add("hidden");
    ["pmNombre", "pmApellidos", "pmNacimiento", "pmPoblacion", "pmTelefono", "pmCorreo"]
      .forEach(function (id) { $(id).removeAttribute("aria-invalid"); });

    // El tarro: si viene relleno es un robot. Se le enseña la pantalla de gracias y no se manda
    // nada. Decirle que se le ha detectado solo sirve para que la siguiente vez lo esquive.
    if ($("pmWeb").value) { gracias(T.gracias_titulo, T.gracias_tarda, false); return; }

    if (!$("pmNombre").value.trim()) return error(T.falta_nombre, $("pmNombre"));
    if ($("pmTelefono").value.replace(/\D/g, "").length < 9) return error(T.falta_telefono, $("pmTelefono"));
    if (!$("pmConsent").checked) return error(T.consent, $("pmConsent"));

    var btn = $("pmBtn");
    btn.disabled = true;
    btn.textContent = T.enviando || "…";

    fetch("/api/captacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        c: CLAVE,
        lang: navigator.language || "",   // el idioma del móvil; el servidor decide con él
        nombre: $("pmNombre").value.trim(),
        apellidos: $("pmApellidos").value.trim(),
        nacimiento: $("pmNacimiento").value,
        poblacion: $("pmPoblacion").value.trim(),
        telefono: $("pmTelefono").value.trim(),
        correo: $("pmCorreo").value.trim(),
        consent: $("pmConsent").checked,
        utm: utm(),
      }),
    })
      .then(function (r) { return r.json().then(function (j) { return { http: r.status, d: j }; }); })
      .then(function (r) {
        var d = r.d || {};
        btn.disabled = false;
        btn.textContent = T.enviar || "";

        if (d.ok && d.ya_registrado) { gracias(d.titulo, d.texto, false); return; }
        if (d.ok) {
          TOKEN = d.token || "";
          gracias(d.titulo, d.texto, true);
          // El evento que Meta necesita para aprender a quién enseñar el anuncio. Sin píxel
          // configurado o sin consentimiento, esto no hace nada.
          meta("Lead");
          setTimeout(sondear, 2500);
          return;
        }
        if (d.cerrada) { avisar(d.error); return; }
        error(d.error || (T && T.error) || "");
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = T.enviar || "";
        error((T && T.error) || "");
      });
  });

  // ── EL FORMULARIO CONFIGURABLE ──────────────────────────────────────────────────────────────
  //
  // Si esta clave tiene un formulario configurado y PUBLICADO desde el panel, manda ése: título,
  // campos, textos legales y mensaje de éxito salen de la configuración. Si no lo tiene, sigue el
  // camino de siempre —`cap_campanas`— sin tocar ni una línea.
  //
  // Se intenta el nuevo PRIMERO y se cae al viejo, no al revés: así una campaña que ya funciona no
  // deja de funcionar porque alguien empiece a configurar otra cosa.
  // ── El catálogo de municipios, una sola vez ─────────────────────────────────────────────────
  //
  // Viaja con la página (5 KB) y la búsqueda ocurre AQUÍ, en el móvil de quien escribe. Ni una
  // petición por tecla, ni un servicio de fuera enterándose de lo que está tecleando alguien que
  // solo quiere un desayuno.
  var MUNI = null;
  function cargarMunicipios() {
    if (MUNI) return Promise.resolve(MUNI);
    return fetch("/data/municipios.json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { MUNI = (j && j.m) || []; return MUNI; })
      .catch(function () { MUNI = []; return MUNI; });
  }

  function normMuni(t) {
    return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
  }

  /** Los que empiezan por lo escrito primero; entre iguales, Cataluña; luego el nombre más corto. */
  function buscarMuni(q) {
    var n = normMuni(q);
    if (n.length < 2 || !MUNI) return [];
    var out = [];
    for (var i = 0; i < MUNI.length; i++) {
      var nom = MUNI[i][0], cat = MUNI[i][2], k = normMuni(nom), r = null;
      if (k.indexOf(n) === 0) r = 0;
      else if (k.split(" ").some(function (p) { return p.indexOf(n) === 0; })) r = 1;
      else if (k.indexOf(n) >= 0) r = 2;
      if (r === null) continue;
      out.push({ nombre: nom, cat: cat, r: r });
    }
    out.sort(function (a, b) { return a.r - b.r || (b.cat - a.cat) || a.nombre.length - b.nombre.length; });
    return out.slice(0, 6);
  }

  /**
   * El autocompletado. Teclado y táctil, y SIEMPRE se puede escribir libre.
   *
   * El catálogo es curado, no el padrón entero: si alguien vive en un pueblo que no sale, escribe
   * su nombre y se guarda igual. Un desplegable cerrado dejaría gente fuera por vivir donde vive.
   */
  function montarPoblacion(input) {
    var lista = document.createElement("ul");
    lista.className = "pm-sug";
    lista.setAttribute("role", "listbox");
    lista.hidden = true;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("autocomplete", "off");
    input.parentNode.appendChild(lista);
    var sel = -1, items = [];

    function cerrar() { lista.hidden = true; lista.innerHTML = ""; sel = -1; items = []; input.setAttribute("aria-expanded", "false"); }
    function elegir(i) { if (items[i]) { input.value = items[i].nombre; cerrar(); input.focus(); } }
    function pintar() {
      lista.innerHTML = "";
      items.forEach(function (m, i) {
        var li = document.createElement("li");
        li.className = "pm-sug-i" + (i === sel ? " on" : "");
        li.id = "pmSug" + i;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", i === sel ? "true" : "false");
        li.textContent = m.nombre;                       // TEXTO: nunca innerHTML con datos
        li.addEventListener("mousedown", function (ev) { ev.preventDefault(); elegir(i); });
        lista.appendChild(li);
      });
      lista.hidden = !items.length;
      input.setAttribute("aria-expanded", items.length ? "true" : "false");
      input.setAttribute("aria-activedescendant", sel >= 0 ? "pmSug" + sel : "");
    }

    input.addEventListener("input", function () {
      cargarMunicipios().then(function () { items = buscarMuni(input.value); sel = -1; pintar(); });
    });
    input.addEventListener("keydown", function (ev) {
      if (lista.hidden) return;
      if (ev.key === "ArrowDown") { ev.preventDefault(); sel = Math.min(sel + 1, items.length - 1); pintar(); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); sel = Math.max(sel - 1, -1); pintar(); }
      else if (ev.key === "Enter" && sel >= 0) { ev.preventDefault(); elegir(sel); }
      else if (ev.key === "Escape") { cerrar(); }
    });
    input.addEventListener("blur", function () { setTimeout(cerrar, 120); });
    cargarMunicipios();                                   // se precarga al montar, no al teclear
  }

  /**
   * LA FRASE DE CONSENTIMIENTO, CON EL ENLACE DENTRO.
   *
   * El enlace va EN LA FRASE y no debajo en su propia línea, porque «consulta la política de
   * privacidad» separada del enlace que la abre es una instrucción sin destino: se lee, no se
   * pulsa, y quien quiere leerla no encuentra dónde.
   *
   * Se compone con NODOS, nunca con `innerHTML`: el texto lo escribe una persona desde el panel y
   * esto lo abre un cliente en su móvil. Si el nombre del enlace no aparece literalmente en la
   * frase, se añade al final —así una campaña que se olvide de nombrarlo sigue teniendo enlace—.
   */
  function pintarConsentimiento(caja, c) {
    var frase = c.consentimiento_texto || "";
    var url = c.privacidad_url || "";
    var nombre = c.privacidad_texto || (c.idioma === "ca" ? "Política de privacitat" : "Política de privacidad");
    caja.textContent = "";
    if (!url) { caja.textContent = frase; return; }

    var a = document.createElement("a");
    a.className = "pm-legal";
    a.href = url;
    a.target = "_blank";
    // `noopener` por seguridad y `noreferrer` para no decirle a la política de dónde viene nadie.
    a.rel = "noopener noreferrer";
    a.textContent = nombre;

    var i = frase.indexOf(nombre);
    if (i < 0) {
      // No lo nombra: la frase entera y el enlace detrás, separados por un espacio.
      caja.appendChild(document.createTextNode(frase ? frase + " " : ""));
      caja.appendChild(a);
      return;
    }
    caja.appendChild(document.createTextNode(frase.slice(0, i)));
    caja.appendChild(a);
    caja.appendChild(document.createTextNode(frase.slice(i + nombre.length)));
  }

  // ── LA FECHA DE NACIMIENTO ──────────────────────────────────────────────────────────────────
  //
  // ── POR QUÉ YA NO ES UN `<input type="date">` ───────────────────────────────────────────────
  //
  // Era un selector nativo, y eso estaba bien. El problema es para qué se usa: un `type="date"`
  // está pensado para fechas CERCA DE HOY —una reserva, una cita— y por eso se abre en el mes
  // actual. Una fecha de nacimiento está cuarenta años atrás.
  //
  // En el iPhone eso significa que el calendario se abre en el mes de hoy y, para llegar a 1985,
  // o se pulsa la cabecera del mes —que casi nadie descubre que se puede pulsar— o se retrocede
  // mes a mes. Son cuatrocientos ochenta meses. Y esto lo abre alguien que viene de un anuncio.
  //
  // ── LO QUE SÍ ES NATIVO: TRES `<select>` ────────────────────────────────────────────────────
  //
  // Un `<select>` en el iPhone ABRE LA RUEDA DEL SISTEMA, la de verdad, la misma que sale al
  // elegir en cualquier app. Tres selectores son tres ruedas nativas, y el año es una lista
  // plana: 1985 está a un gesto. No hay ninguna rueda de Apple recreada con JavaScript aquí,
  // porque una imitación se comporta distinta justo cuando importa —con el teclado, con
  // VoiceOver, con el zoom— y la de verdad no hay que mantenerla.
  //
  // De paso desaparecen dos problemas que arrastraba el calendario:
  //
  //   · El MES VA EN LETRA. `05/12` es el 5 de diciembre aquí y el 12 de mayo en otros sitios, y
  //     el nativo se pinta en el idioma DEL MÓVIL, no en el de la página. Con «diciembre» escrito
  //     no hay nada que interpretar, y sobra el eco en dd/mm/aaaa que hacía de parche.
  //   · Tres controles con su rótulo los lee un lector de pantalla uno a uno. El soporte de
  //     `type="date"` en lectores de pantalla es desigual según el navegador.

  /** Cuántos años atrás se ofrecen. Nadie que rellene esto nació antes, y el servidor corta en 1900. */
  var NAC_ANIOS = 120;

  // El mes EN LETRA, en los tres idiomas en los que se publica. Es lo que quita la ambigüedad.
  var NAC_MESES = {
    es: ["enero", "febrero", "marzo", "abril", "mayo", "junio",
         "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    ca: ["gener", "febrer", "març", "abril", "maig", "juny",
         "juliol", "agost", "setembre", "octubre", "novembre", "desembre"],
    en: ["January", "February", "March", "April", "May", "June",
         "July", "August", "September", "October", "November", "December"],
  };
  var NAC_ROTULOS = {
    es: { dia: "Día", mes: "Mes", anio: "Año" },
    ca: { dia: "Dia", mes: "Mes", anio: "Any" },
    en: { dia: "Day", mes: "Month", anio: "Year" },
  };

  // ── NÚCLEO PURO ── sin DOM, para poder probarlo tal cual ────────────────────────────────────

  /**
   * Hasta qué mes se ofrece en un año. En el año en curso se corta en el mes de hoy: si no se
   * corta, se puede elegir una fecha que todavía no ha llegado.
   */
  function nacTopeMeses(anio, hoy) {
    return anio === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;
  }

  /**
   * Cuántos días se ofrecen. Dos recortes, y los dos hacen falta:
   *
   *   · LOS DEL MES. `Date.UTC(a, m, 0)` es el último día del mes `m`, así que febrero de 2000
   *     da 29 y el de 1900 da 28 sin escribir ninguna regla de bisiestos.
   *   · EL FUTURO. En el mes en curso se corta en el día de hoy.
   *
   * Sin mes o sin año todavía no se sabe, y se ofrecen 31: cortar antes de tiempo escondería
   * días que sí existen en cuanto se elija el resto.
   */
  function nacTopeDias(anio, mes, hoy) {
    if (!anio || !mes) return 31;
    var tope = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    if (anio === hoy.getFullYear() && mes === hoy.getMonth() + 1) {
      tope = Math.min(tope, hoy.getDate());
    }
    return tope;
  }

  /**
   * Las tres piezas a `AAAA-MM-DD`, que es EXACTAMENTE lo que ya recibía el servidor de un
   * `<input type="date">`. Incompleto vale cadena vacía, nunca una fecha a medias.
   */
  function nacComponer(anio, mes, dia) {
    if (!anio || !mes || !dia) return "";
    var m = String(mes), d = String(dia);
    return String(anio) + "-" + (m.length < 2 ? "0" + m : m) + "-" + (d.length < 2 ? "0" + d : d);
  }

  // ── FIN DEL NÚCLEO PURO ─────────────────────────────────────────────────────────────────────

  /**
   * Monta los tres selectores sobre el campo oculto.
   *
   * EL CAMPO OCULTO ES EL DATO. Conserva su `id` (`fx_nacimiento`) y su `name` (`nacimiento`), así
   * que ni la recogida del formulario ni el servidor se enteran de que esto ha cambiado.
   */
  function montarNacimiento(idioma) {
    var oculto = $("fx_nacimiento"), sD = $("fx_nac_d"), sM = $("fx_nac_m"), sA = $("fx_nac_a");
    if (!oculto || !sD || !sM || !sA) return;
    var meses = NAC_MESES[idioma] || NAC_MESES.es;
    var rot = NAC_ROTULOS[idioma] || NAC_ROTULOS.es;
    var hoy = new Date();

    sD.setAttribute("aria-label", rot.dia);
    sM.setAttribute("aria-label", rot.mes);
    sA.setAttribute("aria-label", rot.anio);

    function opcion(sel, valor, texto) {
      var o = document.createElement("option");
      o.value = valor;
      o.textContent = texto;
      sel.appendChild(o);
    }
    function vaciar(sel) { while (sel.firstChild) sel.removeChild(sel.firstChild); }

    // EL AÑO, DEL ACTUAL HACIA ATRÁS. Es el orden que hace que esto funcione: la rueda del iPhone
    // se abre por el principio de la lista, así que llegar a los años de nacimiento habituales es
    // un gesto corto y en la dirección natural.
    opcion(sA, "", rot.anio);
    for (var a = hoy.getFullYear(); a >= hoy.getFullYear() - NAC_ANIOS; a--) {
      opcion(sA, String(a), String(a));
    }

    function pintarMeses() {
      var anio = Number(sA.value) || 0;
      var tope = anio ? nacTopeMeses(anio, hoy) : 12;
      var elegido = sM.value;
      vaciar(sM);
      opcion(sM, "", rot.mes);
      for (var m = 1; m <= tope; m++) opcion(sM, String(m), meses[m - 1]);
      sM.value = elegido && Number(elegido) <= tope ? elegido : "";
    }

    function pintarDias() {
      var anio = Number(sA.value) || 0, mes = Number(sM.value) || 0;
      var tope = nacTopeDias(anio, mes, hoy);
      var elegido = Number(sD.value) || 0;
      vaciar(sD);
      opcion(sD, "", rot.dia);
      for (var d = 1; d <= tope; d++) opcion(sD, String(d), String(d));
      // SE CONSERVA LO ELEGIDO, pegado al último día si el mes se ha quedado corto. Quien había
      // dicho 31 y cambia a febrero quiere el 28, no volver a empezar con el desplegable vacío.
      sD.value = elegido ? String(Math.min(elegido, tope)) : "";
    }

    function componer() {
      oculto.value = nacComponer(sA.value, sM.value, sD.value);
    }

    // Cambiar el año puede dejar sin sitio al mes elegido, y cambiar el mes al día. Se repinta en
    // cascada y SIEMPRE en el mismo orden: año → mes → día.
    sA.addEventListener("change", function () { pintarMeses(); pintarDias(); componer(); });
    sM.addEventListener("change", function () { pintarDias(); componer(); });
    sD.addEventListener("change", componer);

    pintarMeses();
    pintarDias();
    componer();
  }

  function pintarConfigurable(c) {
    var caja = $("pmForm");
    var M = c.mensajes || {};
    document.documentElement.lang = c.idioma || "es";

    var campos = (c.campos || []).map(function (x) {
      // El consentimiento comercial ya no es una casilla: es una frase encima del botón.
      if (x.id === "comercial") return "";
      if (x.id === "local") {
        return '<div class="alta-campo"><label for="fx_local"></label><select id="fx_local" name="local"></select></div>';
      }
      if (x.id === "nacimiento") {
        // El rótulo apunta al DÍA: pulsarlo abre el primero de los tres, que es por donde se
        // empieza. El grupo entero se nombra con `aria-labelledby`, así que un lector de pantalla
        // dice «Fecha de nacimiento, grupo» y después cada rueda por su nombre.
        return '<div class="alta-campo">'
          + '<label id="fxL_nacimiento" for="fx_nac_d"></label>'
          + '<div class="pm-nac" role="group" aria-labelledby="fxL_nacimiento">'
          + '<select id="fx_nac_d" class="pm-nac-s"></select>'
          + '<select id="fx_nac_m" class="pm-nac-s"></select>'
          + '<select id="fx_nac_a" class="pm-nac-s"></select>'
          + '</div>'
          // EL DATO VIVE AQUÍ, con el mismo `id` y el mismo `name` de siempre.
          + '<input id="fx_nacimiento" name="nacimiento" type="hidden" />'
          + '</div>';
      }
      var tipo = x.id === "telefono" ? "tel" : x.id === "email" ? "email" : "text";
      var extra = x.id === "telefono" ? ' inputmode="tel" autocomplete="tel"'
        : x.id === "email" ? ' inputmode="email" autocomplete="email"'
        : x.id === "nombre" ? ' autocomplete="given-name"'
        : x.id === "poblacion" ? ' autocomplete="off"' : "";
      return '<div class="alta-campo"><label for="fx_' + x.id + '"></label>'
        + '<input id="fx_' + x.id + '" name="' + x.id + '" type="' + tipo + '"' + extra
        + (x.obligatorio ? " required" : "") + ' /></div>';
    }).join("");

    caja.innerHTML = '<h1 class="tj-titular" id="fxTitulo"></h1>'
      + '<p class="tj-sub" id="fxSub" hidden></p>'
      + '<p class="promo-oferta" id="fxDestacado" hidden></p>'
      + '<p class="pm-intro" id="fxIntro" hidden></p>'
      + '<form id="fxF" novalidate>' + campos
      + '<p class="pm-consent" id="fxConsentTxt"></p>'
      + '<button class="alta-btn" type="submit" id="fxBoton"></button></form>'
      + '<p class="pm-error" id="fxError" role="alert" hidden></p>';

    // TEXTO, NUNCA HTML: se asigna con `textContent`. Lo escribe una persona desde el panel y esto
    // lo abre un cliente en su móvil; pintarlo como HTML sería aceptar un `<script>` de regalo.
    $("fxTitulo").textContent = c.titulo || "";
    if (c.subtitulo) { $("fxSub").textContent = c.subtitulo; $("fxSub").hidden = false; }
    if (c.destacado) { $("fxDestacado").textContent = c.destacado; $("fxDestacado").hidden = false; }
    if (c.introduccion) { $("fxIntro").textContent = c.introduccion; $("fxIntro").hidden = false; }
    pintarConsentimiento($("fxConsentTxt"), c);
    $("fxBoton").textContent = c.texto_boton || "OK";

    (c.campos || []).forEach(function (x) {
      // Por `id` primero: un campo hecho de varios controles —la fecha— tiene su rótulo apuntando
      // al primero de ellos, no al campo, así que buscarlo solo por `for` no lo encontraría.
      var l = document.getElementById("fxL_" + x.id)
           || document.querySelector('label[for="fx_' + x.id + '"]');
      if (l) l.textContent = x.etiqueta + (x.obligatorio ? " *" : "");
    });
    var sel = $("fx_local");
    if (sel) {
      (c.locales || []).forEach(function (l) {
        var o = document.createElement("option"); o.value = l; o.textContent = l; sel.appendChild(o);
      });
    }
    if ($("fx_nacimiento")) montarNacimiento(c.idioma || "es");
    if (c.sugerir_poblacion && $("fx_poblacion")) montarPoblacion($("fx_poblacion"));

    caja.classList.remove("hidden");
    $("pmCargando").classList.add("hidden");

    function fallo(txt) {
      $("fxError").textContent = txt;
      $("fxError").hidden = false;
      $("fxBoton").disabled = false;
      $("fxBoton").textContent = c.texto_boton || "OK";
    }

    $("fxF").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var btn = $("fxBoton");
      if (btn.disabled) return;                       // doble clic: el segundo no hace nada
      $("fxError").hidden = true;
      btn.disabled = true;
      btn.textContent = M.enviando || "…";

      var cuerpo = { consentimiento: true };          // la frase está encima del botón: enviar es aceptar
      (c.campos || []).forEach(function (x) {
        var el = $("fx_" + x.id);
        if (el) cuerpo[x.id] = el.value;
      });

      fetch("/api/publico/formulario/" + encodeURIComponent(CLAVE), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
      }).then(function (r) { return r.json().catch(function () { return null; }); }).then(function (j) {
        if (!j || !j.ok) { fallo((j && j.error) || M.error || "…"); return; }
        // EL ALTA, A META. Esto faltaba: al migrar del formulario clásico al configurable se
        // perdió el evento y estos formularios no reportaban ni una conversión.
        if (j.evento_lead === true) meta("Lead");
        // La MISMA pantalla exista o no el teléfono: si se distinguieran, esto sería un
        // comprobador de qué números están en nuestra base.
        caja.innerHTML = "";
        var h = document.createElement("h1"); h.className = "tj-titular"; h.textContent = j.mensaje || "";
        caja.appendChild(h);
        // EL ESTADO DE SU MENSAJE, DICHO COMO ES. Recién encolado es «pendiente»: decir «te lo
        // hemos enviado» en el mismo instante de meterlo en la cola sería afirmar algo que aún
        // no ha pasado. «Enviado» solo aparece cuando consta la fecha de salida.
        if (j.envio && j.envio.texto) {
          var pe = document.createElement("p");
          pe.className = "pm-envio" + (j.envio.estado === "fallo_envio" ? " pm-envio-mal" : "");
          pe.textContent = j.envio.texto;
          caja.appendChild(pe);
        }
        if (j.texto_posterior) {
          var p2 = document.createElement("p"); p2.className = "tj-sub"; p2.textContent = j.texto_posterior;
          caja.appendChild(p2);
        }
        if (j.carnet) {
          var a = document.createElement("a"); a.className = "alta-btn"; a.href = j.carnet;
          a.textContent = c.idioma === "ca" ? "Veure la meva targeta" : "Ver mi tarjeta";
          caja.appendChild(a);
        }
      }).catch(function () { fallo(M.error || "…"); });
    });
  }

  var urlCampana = "/api/captacion/campana/" + encodeURIComponent(CLAVE) +
                   "?lang=" + encodeURIComponent(navigator.language || "");

  fetch("/api/publico/formulario/" + encodeURIComponent(CLAVE))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (j && j.ok) { pintarConfigurable(j); return null; }
      return arrancarCampanaClasica();
    })
    .catch(function () { return arrancarCampanaClasica(); });

  function arrancarCampanaClasica() {
  return fetch(urlCampana)
    .then(function (r) { return r.json().then(function (j) { return { http: r.status, d: j }; }); })
    .then(function (r) {
      // Una clave que no existe y una campaña apagada contestan lo mismo: a la portada. Si se
      // distinguieran, probar claves diría cuáles existen.
      if (r.http === 404) { location.replace("/"); return; }
      if (!r.d || !r.d.ok) { location.replace("/"); return; }
      T = r.d.etiquetas || {};
      if (!r.d.abierta) { avisar(r.d.texto || ""); return; }
      pintarFormulario(r.d);
    })
    .catch(function () { avisar("…"); });
  }
})();
