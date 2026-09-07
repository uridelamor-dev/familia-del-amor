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

  /* La tarjeta viene APAGADA y de momento se queda así: no hay ni un enlace a esta página en
     toda la web. Quien llegue aquí probando rutas se va a la portada, en vez de rellenar un
     formulario que iba a fallar al enviarlo. Lo decide el servidor, no esta página. */
  fetch("/api/tarjeta/activa")
    .then(function (r) { return r.json(); })
    .then(function (d) { if (!d || !d.activa) location.replace("/"); })
    .catch(function () { /* si no se puede preguntar, se deja el formulario: el envío avisará */ });

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
        consent: $("altaConsent").checked,
        local: LOCAL,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) {
          btn.disabled = false;
          btn.textContent = "Hazme la tarjeta";
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
        window.scrollTo(0, 0);
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "Hazme la tarjeta";
        error("No hemos podido conectar. Prueba otra vez en un momento.");
      });
  });
})();
