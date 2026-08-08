/* Kiosco de fichaje. Autocontenido: sin sesión, sin dependencias, sin app.js.
 *
 * Tres cosas que parecen detalle y son el motivo de que esto funcione en una barra:
 *
 *  · LA HORA LA PONE EL SERVIDOR. Aquí solo se pinta un reloj, y se pinta a partir de la
 *    hora que mandó el servidor más lo que ha corrido `performance.now()`. La hora de la
 *    tablet no entra jamás en un fichaje; se envía aparte, solo para poder detectar que
 *    esa tablet tiene la hora mal.
 *  · La cola de pendientes vive en localStorage y REINTENTA SOLA. Si se cae internet a
 *    media noche, nadie se queda sin fichar; se ve un aviso amarillo y se sube después.
 *    (El offline de verdad —Service Worker— es de la fase 7. El `cliente_id` ya viaja
 *    desde hoy, así que aquella fase no tocará ni una línea del servidor.)
 *  · Todo se olvida a los 20 segundos: nombre, ticket, PIN. Es una pantalla pública.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var TOKEN = new URLSearchParams(location.search).get("t") || "";
  var COLA_KEY = "fic_cola_v1";
  var VUELTA_MS = 20000;          // inactividad → volver a la lista
  var OK_MS = 3200;               // cuánto se queda la confirmación en pantalla

  var estado = { equipo: [], local: "", ticket: null, worker: null, pin: "", pinTemporal: false };
  var reloj = { servidorMs: 0, refMs: 0 };
  var temporizadorVuelta = null;

  // ── Reloj: servidor + tiempo transcurrido. Nunca Date.now() a pelo. ───────
  function ahoraServidor() {
    if (!reloj.servidorMs) return null;
    return reloj.servidorMs + (performance.now() - reloj.refMs);
  }
  function pintarReloj() {
    var t = ahoraServidor();
    if (t == null) return;
    var d = new Date(t);
    $("ficReloj").textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  setInterval(pintarReloj, 10000);

  // ── Red ──────────────────────────────────────────────────────────────────
  function api(ruta, opciones) {
    return fetch("/api/fichar/" + encodeURIComponent(TOKEN) + ruta, Object.assign({
      headers: { "Content-Type": "application/json" },
    }, opciones || {})).then(function (r) {
      return r.json().then(function (j) { return { http: r.status, datos: j }; });
    });
  }

  // ── Pasos ────────────────────────────────────────────────────────────────
  function mostrar(id) {
    ["ficPasoQuien", "ficPasoPin", "ficPasoAcciones", "ficPasoOk"].forEach(function (p) {
      $(p).classList.toggle("hidden", p !== id);
    });
  }
  function aplazarVuelta(ms) {
    clearTimeout(temporizadorVuelta);
    temporizadorVuelta = setTimeout(volverAlInicio, ms || VUELTA_MS);
  }
  function volverAlInicio() {
    clearTimeout(temporizadorVuelta);
    // Se borra TODO: esta pantalla la ve el siguiente que pase por la barra.
    estado.ticket = null; estado.worker = null; estado.pin = ""; estado.pinTemporal = false;
    // También del DOM: el nombre se queda escrito en la pantalla del PIN aunque esté
    // oculta, y esta tablet la ve todo el que pase por la barra.
    $("ficPinNombre").textContent = "";
    $("ficPinError").textContent = "";
    $("ficHola").textContent = "";
    $("ficHoy").innerHTML = "";
    pintarPuntos();
    mostrar("ficPasoQuien");
    cargarEquipo();
  }

  // ── 1 · Quién eres ───────────────────────────────────────────────────────
  function cargarEquipo() {
    api("").then(function (r) {
      if (!r.datos.ok) return pintarVacio(r.datos.error || "Este dispositivo no está dado de alta.");
      estado.equipo = r.datos.equipo || [];
      estado.local = r.datos.local;
      reloj.servidorMs = r.datos.servidorMs; reloj.refMs = performance.now();
      $("ficLocal").textContent = r.datos.local;
      $("ficDisp").textContent = r.datos.dispositivo || "";
      pintarReloj();
      pintarEquipo();
      subirCola();
    }).catch(function () {
      // Sin conexión no se puede saber quién hay: se dice, no se finge.
      pintarVacio("Sin conexión con el servidor. Los fichajes pendientes se enviarán solos.");
    });
  }

  function pintarVacio(texto) {
    $("ficEquipo").innerHTML = "";
    $("ficVacio").textContent = texto;
    $("ficVacio").classList.remove("hidden");
  }

  var ETIQUETA_ESTADO = { dentro: "Dentro", pausa: "En pausa", fuera: "" };
  function pintarEquipo() {
    var cont = $("ficEquipo");
    cont.innerHTML = "";
    $("ficVacio").classList.toggle("hidden", estado.equipo.length > 0);
    if (!estado.equipo.length) {
      $("ficVacio").textContent = "Todavía no hay nadie con PIN en " + estado.local +
        ". Los PINes se asignan desde el panel, en Fichajes.";
    }
    estado.equipo.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fic-persona";
      b.disabled = !p.tienePin;
      var partes = String(p.nombre || "?").trim().split(/\s+/);
      var iniciales = (partes[0][0] || "") + (partes.length > 1 ? partes[1][0] : "");
      b.innerHTML =
        '<span class="fic-inicial"></span>' +
        '<span><span class="fic-nombre"></span>' +
        '<span class="fic-sub"><span class="fic-punto"></span><span class="fic-sub-txt"></span></span></span>';
      b.querySelector(".fic-inicial").textContent = iniciales.toUpperCase();
      b.querySelector(".fic-nombre").textContent = p.nombre;
      var texto = p.tienePin ? (ETIQUETA_ESTADO[p.estado] || "") : "sin PIN";
      b.querySelector(".fic-punto").className = "fic-punto " + p.estado;
      b.querySelector(".fic-sub-txt").textContent = texto;
      // Quien está fuera no lleva ni punto ni texto: la lista se lee de un vistazo
      // porque solo destacan los que están trabajando.
      if (!texto) b.querySelector(".fic-sub").style.display = "none";
      b.addEventListener("click", function () { irAlPin(p); });
      cont.appendChild(b);
    });
  }

  // ── 2 · PIN ──────────────────────────────────────────────────────────────
  function irAlPin(persona) {
    estado.worker = persona; estado.pin = "";
    $("ficPinNombre").textContent = persona.nombre;
    $("ficPinError").textContent = "";
    pintarPuntos();
    mostrar("ficPasoPin");
    aplazarVuelta();
  }

  function pintarPuntos() {
    var c = $("ficPuntos");
    c.innerHTML = "";
    for (var i = 0; i < estado.pin.length; i++) {
      var d = document.createElement("span");
      d.className = "fic-punto-pin lleno";
      c.appendChild(d);
    }
  }

  function montarTeclado() {
    var t = $("ficTeclado");
    var teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "borrar", "0", "ok"];
    teclas.forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fic-tecla" + (k === "ok" ? " fic-tecla--ok fic-tecla--aux" : k === "borrar" ? " fic-tecla--aux" : "");
      b.textContent = k === "borrar" ? "Borrar" : k === "ok" ? "Entrar" : k;
      b.addEventListener("click", function () { pulsar(k); });
      t.appendChild(b);
    });
  }

  function pulsar(k) {
    aplazarVuelta();
    $("ficPinError").textContent = "";
    if (k === "borrar") { estado.pin = estado.pin.slice(0, -1); return pintarPuntos(); }
    if (k === "ok") return enviarPin();
    if (estado.pin.length >= 6) return;
    estado.pin += k;
    pintarPuntos();
    // Con 4 dígitos NO se envía solo: hay PINes de 6 y enviar a los 4 gastaría un intento
    // (y con 5 intentos hasta el bloqueo, gastarlos por una prisa del programa es cruel).
  }

  function enviarPin() {
    if (estado.pin.length < 4) { $("ficPinError").textContent = "El PIN tiene 4 dígitos como mínimo."; return; }
    var pin = estado.pin;
    estado.pin = ""; pintarPuntos();
    api("/pin", { method: "POST", body: JSON.stringify({ worker_id: estado.worker.id, pin: pin }) })
      .then(function (r) {
        if (!r.datos.ok) { $("ficPinError").textContent = r.datos.error || "PIN incorrecto."; return; }
        estado.ticket = r.datos.ticket;
        estado.pinTemporal = !!r.datos.pinTemporal;
        pintarAcciones(r.datos);
      })
      .catch(function () { $("ficPinError").textContent = "Sin conexión. Inténtalo en un momento."; });
  }

  // ── 3 · Fichar ───────────────────────────────────────────────────────────
  var TEXTO_ESTADO = {
    fuera: "Ahora mismo no estás fichado.",
    dentro: "Estás dentro.",
    pausa: "Estás en pausa.",
  };

  function pintarAcciones(d) {
    $("ficHola").textContent = "Hola, " + primerNombre(d.nombre || (estado.worker && estado.worker.nombre));
    $("ficEstado").textContent = TEXTO_ESTADO[d.estado] || "";
    var cont = $("ficAcciones");
    cont.innerHTML = "";
    (d.acciones || []).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fic-accion" + (a.principal ? " fic-accion--principal" : "") + (a.tipo === "salida" ? " fic-accion--salir" : "");
      b.textContent = a.etiqueta;
      b.addEventListener("click", function () { fichar(a.tipo); });
      cont.appendChild(b);
    });
    pintarHoy(d.hoy || [], d.jornada);
    var aviso = $("ficAvisoPin");
    aviso.classList.toggle("hidden", !estado.pinTemporal);
    if (estado.pinTemporal) aviso.textContent = "Tu PIN es el que te dio tu encargado. Cámbialo desde tu perfil cuando puedas.";
    mostrar("ficPasoAcciones");
    aplazarVuelta();
  }

  var NOMBRE_EVENTO = { entrada: "Entrada", salida: "Salida", pausa_inicio: "Pausa", pausa_fin: "Vuelta de pausa" };
  function pintarHoy(eventos, jornada) {
    var ul = $("ficHoy");
    ul.innerHTML = "";
    eventos.forEach(function (e) {
      var li = document.createElement("li");
      li.innerHTML = "<span></span><span></span>";
      li.children[0].textContent = NOMBRE_EVENTO[e.tipo] || e.tipo;
      li.children[1].textContent = e.hora;
      ul.appendChild(li);
    });
    if (jornada && jornada.minPresencia > 0) {
      var tot = document.createElement("li");
      tot.className = "fic-tot";
      tot.innerHTML = "<span>Hoy llevas</span><span></span>";
      tot.children[1].textContent = enHoras(jornada.minEfectivo);
      ul.appendChild(tot);
    }
  }

  function primerNombre(n) { return String(n || "").trim().split(/\s+/)[0] || ""; }
  function enHoras(min) {
    var h = Math.floor((min || 0) / 60), m = (min || 0) % 60;
    return h ? h + " h " + String(m).padStart(2, "0") + " min" : m + " min";
  }

  function fichar(tipo) {
    var trabajo = {
      id: "k" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      tipo: tipo, ticket: estado.ticket, nombre: estado.worker && estado.worker.nombre,
    };
    aplazarVuelta(OK_MS + 500);
    api("/evento", {
      method: "POST",
      body: JSON.stringify({ ticket: trabajo.ticket, tipo: tipo, cliente_id: trabajo.id, cliente_ms: Date.now() }),
    }).then(function (r) {
      if (r.datos.ok) return confirmar(tipo, r.datos);
      // 409 = la máquina de estados dice que eso no cabe (p. ej. entrar estando dentro).
      // No es un fallo de red: NO se encola, se explica.
      $("ficEstado").textContent = r.datos.error || r.datos.mensaje || "No se pudo registrar.";
      if (r.datos.acciones) pintarAcciones({ estado: r.datos.estado, acciones: r.datos.acciones, nombre: trabajo.nombre });
    }).catch(function () {
      // Aquí sí: se cayó la red. Se guarda y se reintenta solo.
      encolar(trabajo);
      confirmar(tipo, { pendiente: true });
    });
  }

  function confirmar(tipo, d) {
    var tic = $("ficTic");
    var aviso = !!(d.incidencia || d.pendiente);
    tic.className = "fic-tic" + (aviso ? " fic-tic--aviso" : "");
    tic.textContent = aviso ? "!" : "✓";
    $("ficOkTitulo").textContent = {
      entrada: "Entrada registrada", salida: "Hasta luego",
      pausa_inicio: "Pausa registrada", pausa_fin: "Vuelta registrada",
    }[tipo] || "Registrado";
    $("ficOkHora").textContent = d.hora || "";
    $("ficOkMsg").textContent = d.pendiente
      ? "Sin conexión: tu fichaje está guardado en la tablet y se enviará solo. La hora buena es esta."
      : (d.mensaje || (tipo === "salida" && d.jornada ? "Hoy has hecho " + enHoras(d.jornada.minEfectivo) + "." : ""));
    mostrar("ficPasoOk");
    aplazarVuelta(OK_MS);
  }

  // ── Cola de pendientes ───────────────────────────────────────────────────
  function leerCola() {
    try { return JSON.parse(localStorage.getItem(COLA_KEY) || "[]"); } catch (e) { return []; }
  }
  function guardarCola(c) {
    try { localStorage.setItem(COLA_KEY, JSON.stringify(c)); } catch (e) { /* tablet sin espacio */ }
    pintarCola(c);
  }
  function encolar(t) { var c = leerCola(); c.push(t); guardarCola(c); }
  function pintarCola(c) {
    var n = (c || leerCola()).length;
    $("ficCola").classList.toggle("hidden", n === 0);
    $("ficCola").textContent = n === 1 ? "1 fichaje pendiente de enviar" : n + " fichajes pendientes de enviar";
  }

  // Se sube de uno en uno y en orden: el orden de los eventos ES la jornada.
  // El ticket puede haber caducado, así que el servidor los rechazará con 401; para eso
  // está la fase 7 (offline de verdad, con firma del dispositivo). Mientras tanto, si un
  // pendiente no entra, NO se tira: se deja para que un humano lo vea en el panel.
  var subiendo = false;
  function subirCola() {
    if (subiendo) return;
    var cola = leerCola();
    if (!cola.length) return pintarCola(cola);
    subiendo = true;
    var t = cola[0];
    api("/evento", {
      method: "POST",
      body: JSON.stringify({ ticket: t.ticket, tipo: t.tipo, cliente_id: t.id, cliente_ms: Date.now() }),
    }).then(function (r) {
      subiendo = false;
      if (r.datos.ok || r.http === 409) { guardarCola(leerCola().slice(1)); subirCola(); }
    }).catch(function () { subiendo = false; });
  }
  setInterval(subirCola, 30000);
  window.addEventListener("online", subirCola);

  // ── Arranque ─────────────────────────────────────────────────────────────
  montarTeclado();
  pintarCola();
  $("ficVolver").addEventListener("click", volverAlInicio);
  $("ficSalir").addEventListener("click", volverAlInicio);
  // Teclado físico, por si la tablet lleva uno acoplado.
  document.addEventListener("keydown", function (e) {
    if ($("ficPasoPin").classList.contains("hidden")) return;
    if (/^\d$/.test(e.key)) pulsar(e.key);
    else if (e.key === "Backspace") pulsar("borrar");
    else if (e.key === "Enter") pulsar("ok");
  });
  // Al despertar la tablet, la hora del servidor puede estar vieja: se recarga la lista.
  document.addEventListener("visibilitychange", function () { if (!document.hidden) volverAlInicio(); });

  if (!TOKEN) pintarVacio("Falta el enlace del dispositivo. Pídeselo a tu encargado.");
  else cargarEquipo();
})();
