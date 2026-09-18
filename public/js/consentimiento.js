// EL CONSENTIMIENTO DE COOKIES. Decide si podemos cargar cosas de terceros.
//
// ── QUÉ ES Y QUÉ NO ES ───────────────────────────────────────────────────────────────────────
//
// Esto NO es el «acepto recibir comunicaciones» de los formularios. Aquello permite ESCRIBIRLE a
// alguien por WhatsApp y se guarda con su ficha. Esto permite GUARDAR COSAS EN SU NAVEGADOR y
// CEDER su navegación a Meta. Son dos permisos distintos y se piden por separado.
//
// ── LAS REGLAS, Y NO SON DE ESTILO ───────────────────────────────────────────────────────────
//
// En España lo rige el artículo 22.2 de la LSSI:
//
//   · PREVIO. Antes del «sí» no se carga nada de terceros. Ni el script, ni `init`, ni PageView.
//     El silencio no es un sí, y seguir navegando tampoco.
//   · RECHAZAR IGUAL DE FÁCIL QUE ACEPTAR. Los dos botones son el MISMO componente: misma altura,
//     mismo relleno, misma tipografía, misma fila, sin segunda pantalla. En móvil ocupan además
//     exactamente la mitad cada uno. Si uno fuera grande y de color y el otro un enlace gris, el
//     consentimiento no sería libre.
//   · REVOCABLE. Se puede cambiar después, y hay un control permanente en TODA página que pueda
//     cargar Meta. Si la página no trae uno, este fichero lo crea: la garantía no puede depender
//     de que alguien se acuerde de editar un HTML.
//   · INFORMADO, Y EN SU IDIOMA. Se dice quién es el tercero y para qué, con el enlace apuntando a
//     LA SECCIÓN de la política —no al principio de un documento largo— y en el idioma de la
//     página.
//
// ── EL IDIOMA SALE DE DONDE YA ESTABA ────────────────────────────────────────────────────────
//
// De `document.documentElement.lang`, que es la fuente que YA usa todo el proyecto: lo escribe el
// selector de la web (`app.js` → `setLang`), lo escribe la campaña con el idioma que decide el
// servidor (`promo.js`), lo escribe la ficha de un local (`local.js`) y, si no, viene en el HTML.
//
// No se inventa un segundo sistema: se lee ese, y además SE VIGILA. Una campaña en catalán llega
// como `es` en el HTML y se convierte en `ca` cuando responde el servidor, unas décimas después —
// el aviso ya estaría pintado. Con el observador, se repinta solo.
//
// ── LO QUE NO SE GUARDA ──────────────────────────────────────────────────────────────────────
//
// Solo la decisión, su fecha y la versión del texto — en el navegador de quien decide, y en ningún
// sitio más. No se manda al servidor y no se crea ninguna tabla: registrarlo ahí exigiría
// identificar a quien visita, que es exactamente lo que dice que no quiere.

(function () {
  "use strict";

  var CLAVE = "fda_cookies";
  // Tiene que coincidir con VERSION_CONSENTIMIENTO de src/modules/marketing/meta.js. Hay un test.
  var VERSION = 1;

  // ── LOS TEXTOS ────────────────────────────────────────────────────────────────────────────
  //
  // Castellano y catalán. Un idioma que no esté aquí —el inglés del selector de la web— cae en
  // castellano, que es el de la casa: más vale pedir el permiso en un idioma que la persona
  // probablemente entienda que no pedirlo.
  var TEXTOS = {
    es: {
      aviso: "Usamos cookies de Meta para medir qué anuncios traen visitas a la web. "
           + "No hacen falta para reservar ni para usar tu tarjeta. ",
      mas: "Más información",
      politica: "/privacidad.html#cookies",
      no: "Rechazar",
      si: "Aceptar",
      control: "Cookies",
      rotulo: "Cookies y medición",
    },
    ca: {
      aviso: "Fem servir galetes de Meta per mesurar quins anuncis porten visites al web. "
           + "No són necessàries per reservar ni per utilitzar la teva targeta. ",
      mas: "Més informació",
      politica: "/privacitat.html#galetes",
      no: "Rebutjar",
      si: "Acceptar",
      control: "Galetes",
      rotulo: "Galetes i mesurament",
    },
  };

  /** El idioma de la página, de la única fuente que ya existe. */
  function idioma() {
    var l = String(document.documentElement.getAttribute("lang") || "es").slice(0, 2).toLowerCase();
    return TEXTOS[l] ? l : "es";
  }
  var T = function () { return TEXTOS[idioma()]; };

  var oyentes = [];
  var decision = null;
  var caja = null;

  // ── EL ALMACÉN ────────────────────────────────────────────────────────────────────────────
  //
  // Todo entre `try`: en navegación privada, con las cookies bloqueadas o dentro de un iframe,
  // `localStorage` LANZA al tocarlo. Y si no se puede leer la decisión, no hay decisión — que es
  // el estado seguro, el que no carga nada.

  function leer() {
    try {
      var crudo = window.localStorage.getItem(CLAVE);
      if (!crudo) return null;
      var j = JSON.parse(crudo);
      if (!j || Number(j.v) !== VERSION) return null;   // el texto cambió: se vuelve a preguntar
      return (j.d === "aceptado" || j.d === "rechazado") ? j.d : null;
    } catch (e) { return null; }
  }

  function escribir(d) {
    try {
      window.localStorage.setItem(CLAVE, JSON.stringify({
        v: VERSION, d: d, t: new Date().toISOString(),
      }));
    } catch (e) { /* sin almacén se respeta igual durante esta visita */ }
  }

  // ── EL BANNER ─────────────────────────────────────────────────────────────────────────────

  /** El botón flotante de WhatsApp está fijo abajo a la derecha y el aviso lo tapaba. Se anuncia
   *  el alto real del aviso para que el CSS lo suba exactamente lo que hace falta, sea cual sea
   *  el ancho de la pantalla y las líneas que ocupe el texto. */
  function anunciarAlto() {
    var alto = caja ? (caja.offsetHeight || 0) : 0;
    document.documentElement.style.setProperty("--ck-alto", alto + "px");
    if (document.body) {
      if (caja) document.body.classList.add("ck-abierto");
      else document.body.classList.remove("ck-abierto");
    }
  }

  function cerrar() {
    if (caja && caja.parentNode) caja.parentNode.removeChild(caja);
    caja = null;
    anunciarAlto();
  }

  function decidir(d) {
    var antes = decision;
    decision = d;
    escribir(d);
    cerrar();
    for (var i = 0; i < oyentes.length; i++) {
      try { oyentes[i](d); } catch (e) { /* un oyente roto no bloquea a los demás */ }
    }
    // REVOCAR DE VERDAD. Si Meta ya se había cargado en esta página, quitar el permiso no lo
    // descarga de la memoria: el script sigue ahí. Se recarga para que no quede nada corriendo.
    // Solo en ese caso — al aceptar no hace falta, y al decidir por primera vez tampoco.
    if (antes === "aceptado" && d === "rechazado" && window.fbq) window.location.reload();
  }

  function boton(texto, accion, principal) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "ck-btn" + (principal ? " ck-btn-si" : "");
    b.textContent = texto;
    b.addEventListener("click", accion);
    return b;
  }

  function pintar() {
    var t = T();
    caja.textContent = "";
    caja.setAttribute("aria-label", t.rotulo);

    var dentro = document.createElement("div");
    dentro.className = "ck-in";

    var p = document.createElement("p");
    p.className = "ck-txt";
    p.appendChild(document.createTextNode(t.aviso));
    var a = document.createElement("a");
    a.href = t.politica;          // A LA SECCIÓN, no al principio de un documento de 200 líneas
    a.className = "ck-link";
    a.textContent = t.mas;
    p.appendChild(a);
    p.appendChild(document.createTextNode("."));

    var fila = document.createElement("div");
    fila.className = "ck-acc";
    // LOS DOS, IGUALES. Mismo componente, misma fila, mismo alto. Rechazar va primero: quien solo
    // quiere quitarse el aviso de encima encuentra antes la opción que no cede nada.
    fila.appendChild(boton(t.no, function () { decidir("rechazado"); }, false));
    fila.appendChild(boton(t.si, function () { decidir("aceptado"); }, true));

    dentro.appendChild(p);
    dentro.appendChild(fila);
    caja.appendChild(dentro);
    anunciarAlto();
  }

  function abrir() {
    if (caja) return;
    caja = document.createElement("div");
    caja.className = "ck";
    caja.setAttribute("role", "dialog");
    caja.setAttribute("aria-live", "polite");
    document.body.appendChild(caja);
    pintar();
  }

  // ── EL CONTROL PERMANENTE ─────────────────────────────────────────────────────────────────
  //
  // LA REGLA: si una página puede cargar Meta, esa página ofrece una forma de volver a abrir las
  // preferencias. Y la garantía no puede depender de que alguien se acuerde de añadir un enlace al
  // pie — hubo tres páginas (`promo`, `alta` y `local`) que se quedaron sin él justo por eso, y
  // eran las de aterrizaje de una campaña.
  //
  // Así que si la página no trae control, se crea uno. Va al final del cuerpo y no dentro de la
  // tarjeta del formulario a propósito: esa tarjeta se vacía al enviar, y el control se iría con
  // ella justo cuando la persona acaba de tomar una decisión.

  var controles = [];

  function rotularControles() {
    var t = T();
    for (var i = 0; i < controles.length; i++) controles[i].textContent = t.control;
  }

  function montarControles() {
    var encontrados = document.querySelectorAll("[data-cookies]");
    for (var i = 0; i < encontrados.length; i++) controles.push(encontrados[i]);

    if (!controles.length && document.querySelector('script[src*="/js/meta.js"]')) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ck-pref";
      b.setAttribute("data-cookies", "");
      document.body.appendChild(b);
      controles.push(b);
    }
    for (var j = 0; j < controles.length; j++) {
      controles[j].addEventListener("click", function (ev) { ev.preventDefault(); abrir(); });
    }
    rotularControles();
  }

  // ── LA API ────────────────────────────────────────────────────────────────────────────────

  window.fdaConsent = {
    VERSION: VERSION,
    /** «aceptado», «rechazado» o `null` si todavía no ha decidido. */
    estado: function () { return decision; },
    aceptar: function () { decidir("aceptado"); },
    rechazar: function () { decidir("rechazado"); },
    /** Vuelve a enseñar el aviso para cambiar de opinión. */
    abrir: abrir,
    /** Avisa cuando la decisión cambia. Es por lo que `meta.js` puede arrancar después. */
    alCambiar: function (fn) { if (typeof fn === "function") oyentes.push(fn); },
    /** El idioma que se está usando. Para poder comprobarlo. */
    idioma: idioma,
  };

  decision = leer();

  function montar() {
    montarControles();
    // Sin decisión se pregunta. Con una decisión guardada no se molesta a nadie.
    if (decision === null) abrir();

    // EL IDIOMA PUEDE CAMBIAR DESPUÉS: el selector de la web, o la campaña cuando el servidor
    // contesta en qué idioma habla. Se vigila el mismo atributo que ya escriben todos.
    if (window.MutationObserver) {
      new window.MutationObserver(function () {
        rotularControles();
        if (caja) pintar();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    }
    // Y si cambia el ancho, el aviso cambia de alto: hay que volver a anunciarlo.
    window.addEventListener("resize", anunciarAlto);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", montar);
  } else {
    montar();
  }
})();
