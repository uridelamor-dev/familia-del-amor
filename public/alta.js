/* El alta de la tarjeta, hecha por el propio cliente.
 *
 * Autocontenida y sin dependencias, como cupon.js y tarjeta.js.
 *
 * LO QUE SE ENSEÑA AL TERMINAR LO DECIDE EL SERVIDOR, no esta página. Si el teléfono ya tenía
 * tarjeta, la respuesta viene SIN token y aquí no hay nada que enseñar: se le manda el enlace
 * por WhatsApp a ese número y punto. Es lo que impide que alguien vaya probando móviles ajenos
 * y se quede con la tarjeta —y con las visitas y los descuentos— de otra persona. Si esa
 * decisión se tomara aquí, bastaría con abrir las herramientas del navegador para saltársela.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var LOCAL = new URLSearchParams(location.search).get("l") || "";

  // El modal y la página de alta comparten formulario y validación del servidor.
  var embedded = !!document.getElementById("clubDialog");
  var submitLabel = $("altaBtn").textContent;
  fetch("/api/tarjeta/activa")
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (d) {
      if (!d || !d.activa) {
        if (!embedded) { location.replace("/"); return; }
        $("altaBtn").disabled = true;
        error("El registro no está disponible ahora. Vuelve a intentarlo más tarde.");
      }
    })
    .catch(function () { /* El envío valida también la disponibilidad. */ });

  // El cartel de la mesa lleva el local dentro. Decirlo en pantalla es lo que hace que el
  // cliente entienda que esto es de aquí y no un formulario cualquiera.
  if (LOCAL) {
    var corto = LOCAL.indexOf(" - ") > 0 ? LOCAL.slice(LOCAL.indexOf(" - ") + 3) : LOCAL;
    $("altaSub").textContent = "Es gratis. Te reconocemos al llegar a " + corto +
      ", guardas tus descuentos y ves tus visitas.";
  }

  function error(texto, campo) {
    var caja = $("altaError");
    caja.textContent = texto;
    caja.classList.remove("hidden");
    if (campo) { campo.setAttribute("aria-invalid", "true"); campo.focus(); }
  }

  function limpiarError() {
    $("altaError").classList.add("hidden");
    ["altaNombre", "altaTel", "altaCorreo"].forEach(function (id) { $(id).removeAttribute("aria-invalid"); });
  }

  $("altaF").addEventListener("submit", function (ev) {
    ev.preventDefault();
    limpiarError();

    var nombre = $("altaNombre").value.trim();
    var telefono = $("altaTel").value.trim();
    if (!nombre) return error("Dinos cómo te llamas.", $("altaNombre"));
    if (telefono.replace(/\D/g, "").length < 9) return error("El teléfono no está completo.", $("altaTel"));

    if (!$("altaCorreo").value.trim()) return error("Dinos tu correo electrónico.", $("altaCorreo"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($("altaCorreo").value.trim()) || !$("altaCorreo").checkValidity()) return error("Revisa tu dirección de correo.", $("altaCorreo"));

    var btn = $("altaBtn");
    btn.disabled = true;
    btn.textContent = "Un momento…";

    fetch("/api/tarjeta/alta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: nombre,
        telefono: telefono,
        correo: $("altaCorreo").value.trim(),
        consent: embedded ? true : $("altaConsent").checked,
        local: LOCAL,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) {
          btn.disabled = false;
          btn.textContent = submitLabel;
          return error((d && d.error) || "No hemos podido hacerte la tarjeta. Prueba otra vez.");
        }
        $("altaForm").classList.add("hidden");
        $("altaHecho").classList.remove("hidden");
        $("altaHechoT").textContent = d.titulo || "Listo";
        $("altaHechoD").textContent = d.texto || "";
        // El botón solo aparece si el servidor ha mandado token, es decir, si esta tarjeta se
        // acaba de crear. Nunca para un teléfono que ya la tenía.
        if (d.revelar && d.token) {
          var ver = $("altaVer");
          ver.href = "/tarjeta.html?t=" + encodeURIComponent(d.token);
          ver.classList.remove("hidden");
        }
        if (embedded && d.revelar && d.token && window.showClubProfile) {
          var successNode = $("altaHecho");
          window.showClubProfile(d.token, $("clubFormHost")).catch(function () {
            // Mantener una salida al carné si no carga el segundo paso.
            $("clubFormHost").replaceChildren(successNode);
          });
          return;
        }
        if (embedded) { $("altaHechoT").setAttribute("tabindex", "-1"); $("altaHechoT").focus(); }
        else window.scrollTo(0, 0);
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = submitLabel;
        error("No hemos podido conectar. Prueba otra vez en un momento.");
      });
  });
})();
