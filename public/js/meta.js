// EL PÍXEL DE META. El ÚNICO sitio del proyecto que carga el SDK de Meta y llama a `fbq`.
//
// ── POR QUÉ ESTÁ AQUÍ Y NO EN CADA PÁGINA ────────────────────────────────────────────────────
//
// Antes lo instalaba `promo.js`: el fragmento de Meta escrito a mano dentro del JavaScript de una
// campaña. Eso dejó dos agujeros que estuvieron activos en producción — la web entera sin medir, y
// los formularios configurables sin mandar ni una visita ni un alta desde que se migraron.
//
// Con un solo cargador: una sola inicialización, un solo sitio donde mirar, y las páginas solo
// tienen que incluir una etiqueta.
//
// ── NADA ANTES DEL «SÍ» ──────────────────────────────────────────────────────────────────────
//
// Sin consentimiento explícito NO se pide el script, NO se llama a `init` y NO se manda PageView.
// Ni siquiera se descarga `fbevents.js`: bajar el fichero YA es una llamada a un servidor de Meta
// con la dirección IP de quien visita. Ver `consentimiento.js`.
//
// ── EL IDENTIFICADOR VIENE DEL SERVIDOR ──────────────────────────────────────────────────────
//
// De `config.meta_pixel_id`, servido por `/api/publico/meta`. No está escrito en ningún HTML ni en
// ningún JavaScript: cambiarlo es cambiarlo en el panel, no desplegar.

(function () {
  "use strict";

  var pixel = "";
  var iniciado = false;
  var pidiendo = false;

  // Eventos que se piden ANTES de que todo esté listo —la respuesta del servidor tarda un par de
  // décimas y alguien puede enviar el formulario justo entonces—. Se guardan y se sueltan solo si
  // se llega a arrancar, que exige consentimiento. Con un rechazo se quedan aquí y se pierden,
  // que es lo correcto.
  var cola = [];
  var COLA_MAX = 10;

  function consentido() {
    return !!(window.fdaConsent && window.fdaConsent.estado() === "aceptado");
  }

  /** El fragmento de Meta, tal cual lo publica Meta. Solo se ejecuta con permiso. */
  function cargarSdk() {
    if (window.fbq) return;
    var n = window.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    var t = document.createElement("script");
    t.async = true;
    t.src = "https://connect.facebook.net/en_US/fbevents.js";
    var primero = document.getElementsByTagName("script")[0];
    if (primero && primero.parentNode) primero.parentNode.insertBefore(t, primero);
    else document.head.appendChild(t);
  }

  /**
   * ARRANCAR. Idempotente a propósito y comprobado con un test.
   *
   * `iniciado` corta la segunda llamada, y se puede llamar varias veces sin querer: una al
   * responder el servidor y otra cada vez que cambia el consentimiento. Inicializar dos veces el
   * mismo píxel duplica las visitas y ensucia las métricas de una campaña sin dar ningún error.
   */
  function arrancar() {
    if (iniciado) return;
    if (!pixel || !consentido()) return;

    cargarSdk();
    window.fbq("init", pixel);
    window.fbq("track", "PageView");
    iniciado = true;

    while (cola.length) {
      var e = cola.shift();
      try { window.fbq("track", e[0], e[1]); } catch (err) { /* un evento no tumba la página */ }
    }
  }

  window.fdaMeta = {
    /**
     * Un evento de negocio. Devuelve si se ha mandado.
     *
     * NO comprueba el consentimiento por su cuenta: comprueba `iniciado`, que solo es cierto si
     * hubo consentimiento. Una sola puerta, y es la de arriba.
     */
    evento: function (nombre, params) {
      if (!nombre) return false;
      if (iniciado) {
        try { window.fbq("track", nombre, params || undefined); return true; } catch (e) { return false; }
      }
      // Todavía no. Si nunca llega el permiso, esto no sale de aquí.
      if (cola.length < COLA_MAX) cola.push([nombre, params]);
      return false;
    },
    iniciado: function () { return iniciado; },
  };

  // Se pregunta el identificador SIEMPRE —es un número público, no un secreto, y no toca a Meta—,
  // pero cargar el SDK depende del permiso.
  if (!pidiendo) {
    pidiendo = true;
    fetch("/api/publico/meta")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        pixel = (j && j.ok && j.activo && j.pixel) ? String(j.pixel) : "";
        arrancar();
      })
      .catch(function () { /* sin identificador no se mide, y ya está */ });
  }

  // Y si el permiso llega después de cargar la página, se arranca en ese momento.
  if (window.fdaConsent) window.fdaConsent.alCambiar(arrancar);
})();
