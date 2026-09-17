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

  /* EL AVISO DE VOLVER A AÑADIR EL CARNÉ.
   *
   * Un pase que se guardó ANTES de que existiera el servicio de actualización no lleva dentro la
   * dirección a la que llamar, así que nunca se enterará de nada. No hay forma de arreglarlo a
   * distancia: hay que volver a añadirlo una vez, y entonces el móvil sí se registra.
   *
   * Discreto y en su sitio, debajo de los botones que ya están. Ni un mensaje, ni un WhatsApp, ni
   * una campaña: quien entre a mirar su tarjeta lo ve, y quien no, no se entera de nada. */
  function pintarAvisoPase(pase) {
    if (!pase || !pase.volver_a_anadir) return;
    var caja = $("tjWallet");
    if (!caja) return;
    caja.insertAdjacentHTML("beforeend",
      '<p class="tj-wallet-nota">Si ya la tenías guardada en el móvil, <b>vuelve a añadirla</b> ' +
      'una vez: así se actualizará sola con tus puntos y tus regalos.</p>');
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
    pintarAvisoPase(d.pase);

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

    pintarPuntos(d.fidelizacion);
    pintarDescuentos(d);
    pintarHistorial(d);
  }

  /**
   * SUS PUNTOS. Nada de identificadores internos: ni facturas, ni lotes, ni versiones de regla.
   *
   * Y mientras el programa esté solo en sombra NO se enseña ningún saldo. Un número que luego hay
   * que retirar es peor que no dar ninguno, y el cliente tendría razón en enfadarse.
   */
  function pintarPuntos(f) {
    if (!f) return;                       // sin datos, la tarjeta ni aparece
    mostrar("tjPuntos");

    if (f.estado !== "activo") {
      $("tjPtsPrepTxt").textContent = f.texto || "Programa de puntos en preparación.";
      mostrar("tjPtsPrep");
      return;
    }
    mostrar("tjPtsActivo");

    $("tjPtsN").textContent = String(f.disponible);
    $("tjPtsEti").textContent = f.disponible === 1 ? "punto disponible" : "puntos disponibles";

    var eq = f.equivalencia;
    if (eq) {
      $("tjPtsRegla").textContent = eq.puntos + " puntos = " + eur(eq.euros)
        + " de descuento, en compras de " + eur(eq.minimo) + " o más.";
    }

    // La barra: cuánto falta para el próximo descuento. Es lo que hace que un saldo sea una meta
    // y no un número suelto.
    if (f.necesarios) {
      var pct = Math.max(0, Math.min(100, f.progreso || 0));
      $("tjPtsBarraIn").style.width = pct + "%";
      $("tjPtsBarra").setAttribute("aria-valuenow", String(pct));
      $("tjPtsFalta").textContent = f.faltan > 0
        ? "Te faltan " + f.faltan + (f.faltan === 1 ? " punto" : " puntos") + " para tu próximo descuento."
        : "¡Ya puedes usar tu descuento!";
    }

    if (f.proxima_caducidad && f.caducan_pronto) {
      $("tjPtsCaduca").textContent = f.caducan_pronto + (f.caducan_pronto === 1 ? " punto caduca" : " puntos caducan")
        + " el " + fecha(f.proxima_caducidad) + ".";
      mostrar("tjPtsCaduca");
    }

    if (f.rewards && f.rewards.length) {
      $("tjPtsRewards").innerHTML = f.rewards.map(function (r) {
        return "<li><b>" + esc(r.nombre) + "</b><br><span class=\"tj-mut\">En compras de "
          + esc(eur(r.minimo)) + " o más.</span></li>";
      }).join("");
      mostrar("tjPtsRewards");
    }

    if (f.movimientos && f.movimientos.length) {
      var texto = { ganados: "Ganados", consumidos: "Usados en un descuento",
                    caducados: "Caducados", revertidos: "Devueltos", ajuste: "Ajuste" };
      $("tjPtsMovs").innerHTML = f.movimientos.map(function (m) {
        var signo = m.puntos > 0 ? "+" : "";
        return "<li>" + fecha(m.fecha) + " · " + esc(texto[m.tipo] || m.tipo)
          + " <b>" + signo + m.puntos + "</b></li>";
      }).join("");
      $("tjPtsResumen").textContent = "En total has ganado " + f.ganados + " puntos"
        + (f.consumidos ? ", usado " + f.consumidos : "")
        + (f.caducados ? " y se te han caducado " + f.caducados : "") + ".";
      mostrar("tjPtsMas");
    }
  }

  function eur(n) { return Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }
  function fecha(iso) {
    var p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(iso || "");
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
