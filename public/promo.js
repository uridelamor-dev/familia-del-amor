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

  /**
   * El píxel de Meta, solo si hay uno configurado y solo en ESTA página.
   *
   * Es lo que permite que Meta aprenda a quién enseñar el anuncio: sin él optimiza a ciegas y
   * cada formulario sale mucho más caro. Se carga aquí y no en toda la web a propósito — un
   * script de terceros en la portada es otra conversación (y otro consentimiento).
   */
  function cargarPixel(id) {
    if (!id || window.fbq) return;
    var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    var t = document.createElement("script");
    t.async = true; t.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(t);
    window.fbq("init", String(id));
    window.fbq("track", "PageView");
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
          // El evento que Meta necesita para aprender a quién enseñar el anuncio. Si no hay
          // píxel puesto, esto no hace nada.
          if (typeof window.fbq === "function") window.fbq("track", "Lead");
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
   * La fecha de nacimiento.
   *
   * Selector NATIVO (`type="date"`): en iPhone y en Android abre la rueda del sistema, que es la
   * que la gente sabe usar, y no hace falta ninguna librería. Se enseña en dd/mm/aaaa debajo para
   * que se lea sin ambigüedad —un `2026-09-15` no lo lee nadie de un vistazo—.
   *
   * `max` es hoy: el calendario no deja ir más allá. El servidor lo vuelve a comprobar, porque el
   * `max` no impide mandar otra cosa por debajo.
   */
  function montarFecha(input, eco, etiquetaEco) {
    input.setAttribute("max", new Date().toISOString().slice(0, 10));
    input.setAttribute("min", "1900-01-01");
    // El eco no es un adorno: el calendario nativo se pinta en el idioma del NAVEGADOR, no en el
    // de la página, así que alguien con el móvil en inglés vería `05/12/1990` y entendería el 5 de
    // diciembre. Repetirlo debajo en dd/mm/aaaa quita la duda, y vacío hace de pista de formato.
    function pinta() {
      var p = String(input.value || "").split("-");
      eco.textContent = p.length === 3 && p[0].length === 4
        ? (etiquetaEco + ": " + p[2] + "/" + p[1] + "/" + p[0])
        : etiquetaEco;
    }
    input.addEventListener("input", pinta);
    input.addEventListener("change", pinta);
    pinta();
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
        return '<div class="alta-campo"><label for="fx_nacimiento"></label>'
          + '<input id="fx_nacimiento" name="nacimiento" type="date" class="pm-fecha"'
          + (x.obligatorio ? " required" : "") + ' aria-describedby="fxNacEco" />'
          + '<span class="pm-eco" id="fxNacEco" aria-live="polite"></span></div>';
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
      + '<p class="pm-legal"><a id="fxPriv" target="_blank" rel="noopener noreferrer"></a></p>'
      + '<button class="alta-btn" type="submit" id="fxBoton"></button></form>'
      + '<p class="pm-error" id="fxError" role="alert" hidden></p>';

    // TEXTO, NUNCA HTML: se asigna con `textContent`. Lo escribe una persona desde el panel y esto
    // lo abre un cliente en su móvil; pintarlo como HTML sería aceptar un `<script>` de regalo.
    $("fxTitulo").textContent = c.titulo || "";
    if (c.subtitulo) { $("fxSub").textContent = c.subtitulo; $("fxSub").hidden = false; }
    if (c.destacado) { $("fxDestacado").textContent = c.destacado; $("fxDestacado").hidden = false; }
    if (c.introduccion) { $("fxIntro").textContent = c.introduccion; $("fxIntro").hidden = false; }
    $("fxConsentTxt").textContent = c.consentimiento_texto || "";
    $("fxBoton").textContent = c.texto_boton || "OK";
    if (c.privacidad_url) {
      $("fxPriv").href = c.privacidad_url;
      $("fxPriv").textContent = c.idioma === "ca" ? "Política de privacitat" : "Política de privacidad";
    } else { $("fxPriv").parentNode.hidden = true; }

    (c.campos || []).forEach(function (x) {
      var l = document.querySelector('label[for="fx_' + x.id + '"]');
      if (l) l.textContent = x.etiqueta + (x.obligatorio ? " *" : "");
    });
    var sel = $("fx_local");
    if (sel) {
      (c.locales || []).forEach(function (l) {
        var o = document.createElement("option"); o.value = l; o.textContent = l; sel.appendChild(o);
      });
    }
    if ($("fx_nacimiento")) montarFecha($("fx_nacimiento"), $("fxNacEco"), "dd/mm/aaaa");
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
        // La MISMA pantalla exista o no el teléfono: si se distinguieran, esto sería un
        // comprobador de qué números están en nuestra base.
        caja.innerHTML = "";
        var h = document.createElement("h1"); h.className = "tj-titular"; h.textContent = j.mensaje || "";
        caja.appendChild(h);
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
      cargarPixel(r.d.pixel);
      pintarFormulario(r.d);
    })
    .catch(function () { avisar("…"); });
  }
})();
