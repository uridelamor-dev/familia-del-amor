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

  var urlCampana = "/api/captacion/campana/" + encodeURIComponent(CLAVE) +
                   "?lang=" + encodeURIComponent(navigator.language || "");
  fetch(urlCampana)
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
})();
