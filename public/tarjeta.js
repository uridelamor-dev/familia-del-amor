/* La tarjeta de cliente en su móvil: su cuenta.
 *
 * Autocontenida y sin dependencias, como cupon.js: sin sesión, sin app.js y sin auth.js. La
 * llave es el token de la URL.
 *
 * AQUÍ NO SE DECIDE NADA. Si la tarjeta vale, cuántas visitas lleva y qué descuentos tiene lo
 * dice el servidor con los mismos módulos que usa la tablet de la barra
 * (src/modules/promos/promos.js y src/modules/tarjeta/cuenta.js). Si esta pantalla dedujera por
 * su cuenta que algo está bien y en la barra dijeran que no, el cliente tendría razón y el
 * camarero también, que es la peor discusión posible.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var TOKEN = new URLSearchParams(location.search).get("t") || "";

  function avisar(texto) {
    $("tjCargando").classList.add("hidden");
    var caja = $("tjAviso");
    caja.textContent = texto;
    caja.classList.remove("hidden");
  }

  function mostrar(id) { $(id).classList.remove("hidden"); }

  /** Los dos botones, siempre los dos que estén disponibles.
   *
   * Se ordena primero el que corresponde al móvil que está mirando, pero NO se esconde el otro:
   * este enlace se comparte, se abre desde el ordenador de casa y hay iPhones con la wallet de
   * Google. Esconder uno por adivinar el sistema operativo deja a gente sin poder guardarla y
   * sin saber por qué. */
  function pintarWallet(wallet, token) {
    if (!wallet || (!wallet.apple && !wallet.google)) return;
    var caja = $("tjWallet");
    var esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    var botones = [];
    if (wallet.apple) {
      botones.push({
        orden: esIOS ? 0 : 1,
        html: '<a class="tj-badge tj-badge-apple" href="/api/wallet/apple/' + encodeURIComponent(token) + '">' +
              '<img src="/assets/wallet/apple-wallet.svg" alt="" aria-hidden="true">' +
              'Añadir a Apple Wallet</a>',
      });
    }
    if (wallet.google) {
      botones.push({
        orden: esIOS ? 1 : 0,
        html: '<a class="tj-badge tj-badge-google" href="/api/wallet/google/' + encodeURIComponent(token) + '">' +
              '<img src="/assets/wallet/google-wallet.svg" alt="" aria-hidden="true">' +
              'Guardar en Google Wallet</a>',
      });
    }
    botones.sort(function (a, b) { return a.orden - b.orden; });
    caja.insertAdjacentHTML("beforeend", botones.map(function (b) { return b.html; }).join(""));
    caja.classList.remove("hidden");
  }

  function pintarDescuentos(d) {
    var disp = (d.descuentos && d.descuentos.disponibles) || [];
    var usados = (d.descuentos && d.descuentos.usados) || [];
    mostrar("tjDtos");

    if (!disp.length && !usados.length) { mostrar("tjDtosVacio"); return; }

    var filas = [];
    // Disponibles primero. Un descuento gastado que se enseñe igual que uno nuevo hace que el
    // cliente venga a reclamarlo, y con razón.
    disp.forEach(function (c) {
      filas.push('<li class="tj-item"><p class="tj-item-t">' + esc(c.nombre) + "</p>" +
        '<p class="tj-item-d">' + esc([c.descripcion, c.donde,
          c.hasta ? "Hasta el " + String(c.hasta).split("-").reverse().join("/") : ""]
          .filter(Boolean).join(" · ")) + "</p></li>");
    });
    usados.forEach(function (c) {
      filas.push('<li class="tj-item tj-usado"><p class="tj-item-t">' + esc(c.nombre) + "</p>" +
        '<p class="tj-item-d">' + esc(c.texto || "Ya no está disponible.") + "</p></li>");
    });
    $("tjDtosLista").innerHTML = filas.join("");
  }

  /** El historial es SUYO: es lo que el RGPD llama derecho de acceso, contestado sin pedirlo. */
  function pintarHistorial(d) {
    var h = d.historial || [];
    if (!h.length) return;
    $("tjHistLista").innerHTML = h.map(function (v) {
      return "<li><b>" + esc(v.fecha) + "</b><span>" + esc(v.local || "") + "</span></li>";
    }).join("");
    mostrar("tjHist");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pintar(d) {
    $("tjCargando").classList.add("hidden");
    mostrar("tjCard");

    $("tjTitular").textContent = d.titular ? "Hola, " + d.titular.split(" ")[0] : "Tu tarjeta";
    if (d.qr) $("tjQr").src = d.qr;
    else $("tjQrCaja").classList.add("hidden");   // sin imagen queda el número, que basta
    $("tjCodigo").textContent = d.codigo_legible || d.codigo || "—";

    if (!d.vale) {
      $("tjCard").classList.add("tj-mal");
      var est = $("tjEstado");
      est.textContent = d.texto || "Esta tarjeta ya no se puede usar.";
      est.classList.remove("hidden");
      return;   // ni wallet ni visitas: lo único que hay que hacer es ir al local a rehacerla
    }

    pintarWallet(d.wallet, TOKEN);

    mostrar("tjVisitas");
    $("tjVisitasN").textContent = (d.resumen && d.resumen.texto) || "";
    if (d.ultima_visita && d.ultima_visita.texto) {
      $("tjUltima").textContent = d.ultima_visita.texto;
      mostrar("tjUltima");
    }
    if (d.locales && d.locales.length > 1) {
      $("tjLocales").textContent = "Nos has visitado en " + d.locales.join(", ") + ".";
      mostrar("tjLocales");
    }

    pintarDescuentos(d);
    pintarHistorial(d);
  }

  if (!TOKEN) {
    avisar("Este enlace no es válido. Pídenos otro por WhatsApp o hazte la tarjeta otra vez.");
    return;
  }

  fetch("/api/tarjeta/" + encodeURIComponent(TOKEN))
    .then(function (r) { return r.json().then(function (j) { return { http: r.status, datos: j }; }); })
    .then(function (r) {
      // Un token de cupón abierto aquí: se le manda a su página en vez de decirle que su enlace
      // no vale, que sería mentira.
      if (r.datos && r.datos.cupon) { location.replace("/cupon.html?t=" + encodeURIComponent(TOKEN)); return; }
      if (!r.datos.ok) return avisar(r.datos.error || "Este enlace no es válido.");
      pintar(r.datos);
    })
    .catch(function () {
      avisar("No hemos podido cargarla. Prueba otra vez en un momento.");
    });
})();
