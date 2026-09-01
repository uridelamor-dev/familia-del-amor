/* La página del cupón, la que el cliente abre en su móvil.
 *
 * Autocontenida y minúscula a propósito: sin sesión, sin dependencias y sin app.js. La llave
 * es el token de la URL, igual que en el pulso y en el kiosco.
 *
 * Quién decide si el cupón vale: EL SERVIDOR, con el mismo módulo que usa la tablet de la
 * barra (src/modules/promos/promos.js). Aquí no se calcula nada. Si esta pantalla dedujera
 * por su cuenta que un cupón está bien y en la barra dijeran que no, el cliente tendría razón
 * y el camarero también, que es la peor discusión posible.
 *
 * Lo que sí se omite a propósito: el local. Desde el móvil no se sabe en qué barra lo va a
 * canjear, así que el servidor no comprueba eso y aquí se dice «vale en Blanes» en vez de un
 * «no vale» que sería mentira.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var TOKEN = new URLSearchParams(location.search).get("t") || "";

  function avisar(texto) {
    $("cupCargando").classList.add("hidden");
    $("cupCard").classList.add("hidden");
    var caja = $("cupAviso");
    caja.textContent = texto;
    caja.classList.remove("hidden");
  }

  /** «1234 5678»: partido por la mitad porque ocho dígitos seguidos se dictan fatal. */
  function agrupar(codigo) {
    var c = String(codigo || "");
    return c.length === 8 ? c.slice(0, 4) + " " + c.slice(4) : c;
  }

  function pintar(d) {
    $("cupCargando").classList.add("hidden");
    $("cupCard").classList.remove("hidden");

    var promo = d.promocion || {};
    $("cupTitulo").textContent = d.clase === "carnet"
      ? "Tu carné de cliente"
      : (promo.nombre || "Tu descuento");
    $("cupDesc").textContent = promo.descripcion || (d.clase === "carnet"
      ? "Enséñalo cuando vengas y te reconocemos al momento."
      : "");

    if (d.qr) $("cupQr").src = d.qr;
    else $("cupQrCaja").classList.add("hidden");   // sin imagen queda el número, que basta

    $("cupCodigo").textContent = agrupar(d.codigo);

    // El estado con todas las letras. Un cupón gastado que siga enseñándose igual que uno
    // nuevo hace que el cliente venga a reclamar, y con razón.
    var est = $("cupEstado");
    est.textContent = d.vale ? "" : d.texto || "Este código ya no se puede usar.";
    est.className = "cup-estado" + (d.vale ? " hidden" : " mal");
    $("cupCard").classList.toggle("gastado", !d.vale);

    // El pie: dónde vale y hasta cuándo. La frase de los locales viene YA HECHA del servidor
    // (`dondeVale` en src/modules/promos/promos.js), la misma que se le mandó por WhatsApp.
    // Montarla aquí por separado permitiría que el mensaje y esta pantalla se contradijeran.
    var pie = [];
    if (d.vale) {
      if (promo.donde) pie.push(promo.donde);
      var hasta = d.caduca_en || promo.hasta;
      if (hasta) pie.push("Hasta el " + hasta.split("-").reverse().join("/"));
    }
    $("cupPie").textContent = pie.join(" · ");
  }

  if (!TOKEN) {
    avisar("Este enlace no es válido. Pídenos otro por WhatsApp.");
    return;
  }

  fetch("/api/cupon/" + encodeURIComponent(TOKEN))
    .then(function (r) { return r.json().then(function (j) { return { http: r.status, datos: j }; }); })
    .then(function (r) {
      if (!r.datos.ok) return avisar(r.datos.error || "Este enlace no es válido.");
      pintar(r.datos);
    })
    .catch(function () {
      avisar("No hemos podido cargarlo. Prueba otra vez en un momento.");
    });
})();
