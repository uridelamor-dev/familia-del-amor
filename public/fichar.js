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

  var estado = { equipo: [], local: "", ticket: null, worker: null, pin: "", pinTemporal: false, sinLinea: false };
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
  /**
   * La plantilla se pinta ANTES de que conteste el servidor.
   *
   * En una tablet clavada en la barra, con el wifi del local, esperar a la respuesta eran
   * uno o dos segundos de pantalla negra cada vez que alguien iba a fichar. Los nombres ya
   * están guardados de la última vez y cambian una vez cada varios meses: se enseñan de
   * inmediato y se corrigen cuando llega la respuesta de verdad.
   *
   * Lo que NO se pinta de la caché son los estados (dentro/fuera/pausa): un «dentro» de
   * ayer diría que sigue trabajando quien ya se fue. Sin respuesta, nadie tiene estado.
   */
  function pintarDesdeCache() {
    if (estado.equipo.length) return Promise.resolve();
    return leerPlantilla().then(function (g) {
      if (!g || estado.equipo.length) return;
      estado.local = g.local;
      estado.equipo = g.equipo.map(function (p) { return { id: p.id, nombre: p.nombre, tienePin: p.tienePin, pinLen: p.pinLen, estado: null }; });
      $("ficLocal").textContent = g.local;
      $("ficDisp").textContent = g.dispositivo || "";
      pintarEquipo();
    }).catch(function () {});
  }

  function cargarEquipo() {
    pintarDesdeCache();
    api("").then(function (r) {
      if (!r.datos.ok) return pintarVacio(r.datos.error || "Este dispositivo no está dado de alta.");
      estado.equipo = r.datos.equipo || [];
      estado.local = r.datos.local;
      estado.sinLinea = false;
      reloj.servidorMs = r.datos.servidorMs; reloj.refMs = performance.now();
      $("ficLocal").textContent = r.datos.local;
      $("ficDisp").textContent = r.datos.dispositivo || "";
      pintarReloj();
      pintarEquipo();
      // Se guarda la PLANTILLA (nombres y quién tiene PIN), nunca el estado. Un
      // "dentro/fuera" de ayer diría que sigue trabajando quien ya se fue, y esa pantalla
      // sería mentira; los nombres, en cambio, cambian una vez cada varios meses.
      guardarPlantilla({ local: r.datos.local, dispositivo: r.datos.dispositivo,
        equipo: estado.equipo.map(function (p) { return { id: p.id, nombre: p.nombre, tienePin: p.tienePin, pinLen: p.pinLen }; }) });
      subirCola();
    }).catch(function () {
      // Sin línea se enseña la plantilla guardada, sin estados: la pantalla en blanco no
      // ayuda a nadie, y quien ya tenga sesión abierta puede seguir fichando.
      leerPlantilla().then(function (guardada) {
        if (!guardada) return pintarVacio("Sin conexión con el servidor. Los fichajes pendientes se enviarán solos.");
        estado.sinLinea = true;
        estado.local = guardada.local;
        estado.equipo = guardada.equipo.map(function (p) { return { id: p.id, nombre: p.nombre, tienePin: p.tienePin, pinLen: p.pinLen, estado: "fuera" }; });
        $("ficLocal").textContent = guardada.local;
        $("ficDisp").textContent = guardada.dispositivo || "";
        pintarEquipo();
      });
    });
  }

  // La plantilla vive en la misma base que la cola, con una clave reservada.
  var CLAVE_PLANTILLA = "__plantilla__";
  function guardarPlantilla(p) {
    return conTienda("readwrite", function (s) { s.put({ id: CLAVE_PLANTILLA, ms: 0, plantilla: p }); }).catch(function () {});
  }
  function leerPlantilla() {
    return conTienda("readonly", function (s) { return s.getAll(); }).then(function (l) {
      var fila = (l || []).find(function (x) { return x.id === CLAVE_PLANTILLA; });
      return fila && fila.plantilla && fila.plantilla.equipo && fila.plantilla.equipo.length ? fila.plantilla : null;
    }).catch(function () { return null; });
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
    refrescarCola();   // el aviso de arriba cambia si estamos sin línea
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
    cancelarAuto();
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
    // Se pintan TODOS los huecos, no solo los llenos: así se ve cuántos faltan sin contar.
    var total = largoEsperado() || Math.max(4, estado.pin.length);
    for (var i = 0; i < total; i++) {
      var d = document.createElement("span");
      d.className = "fic-punto-pin" + (i < estado.pin.length ? " lleno" : "");
      c.appendChild(d);
    }
  }

  function montarTeclado() {
    var t = $("ficTeclado");
    // Ya no hay tecla «Entrar»: se entra solo al completar el PIN. El hueco que deja se
    // rellena centrando el cero, que es donde el pulgar lo busca.
    // El hueco a la IZQUIERDA: así el 0 queda centrado y el borrar a la derecha, que es
    // donde los tiene cualquier teclado numérico de móvil. Al revés el 0 se descoloca.
    var teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "borrar"];
    teclas.forEach(function (k) {
      if (k === "") { var hueco = document.createElement("span"); hueco.className = "fic-tecla-hueco"; t.appendChild(hueco); return; }
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fic-tecla" + (k === "borrar" ? " fic-tecla--aux" : "");
      b.setAttribute("aria-label", k === "borrar" ? "Borrar el último dígito" : k);
      b.textContent = k === "borrar" ? "⌫" : k;
      b.addEventListener("click", function () { pulsar(k); });
      t.appendChild(b);
    });
  }

  /**
   * Cuántos dígitos tiene el PIN de quien está tecleando.
   *
   * Lo dice el servidor (`pinLen`). A quien todavía no lo tenga guardado —los PINes de
   * antes de esto— se le trata como de 4, que es lo normal, y se le da un respiro: si sigue
   * tecleando un quinto dígito antes de que salte, se cancela el envío. Así nadie gasta un
   * intento de los cinco por una prisa del programa.
   */
  function largoEsperado() {
    var n = estado.worker && Number(estado.worker.pinLen);
    return n >= 4 && n <= 6 ? n : null;
  }

  var temporizadorAuto = null;
  function cancelarAuto() { if (temporizadorAuto) { clearTimeout(temporizadorAuto); temporizadorAuto = null; } }

  function pulsar(k) {
    aplazarVuelta();
    cancelarAuto();
    $("ficPinError").textContent = "";
    if (k === "borrar") { estado.pin = estado.pin.slice(0, -1); return pintarPuntos(); }
    if (estado.pin.length >= 6) return;
    estado.pin += k;
    pintarPuntos();

    // ENTRA SOLO. Nadie tiene que buscar un botón con las manos mojadas.
    var largo = largoEsperado();
    if (largo) {
      if (estado.pin.length === largo) temporizadorAuto = setTimeout(enviarPin, 140);   // deja ver el último punto
    } else if (estado.pin.length === 6) {
      temporizadorAuto = setTimeout(enviarPin, 140);                                    // el máximo: no cabe más
    } else if (estado.pin.length === 4) {
      temporizadorAuto = setTimeout(enviarPin, 900);                                    // sin longitud conocida, con respiro
    }
  }

  function enviarPin() {
    cancelarAuto();
    if (estado.pin.length < 4) { $("ficPinError").textContent = "El PIN tiene 4 dígitos como mínimo."; return; }
    var pin = estado.pin;
    // Se bloquea el teclado mientras se comprueba: dos envíos gastarían dos intentos.
    $("ficTeclado").classList.add("comprobando");
    estado.pin = ""; pintarPuntos();
    api("/pin", { method: "POST", body: JSON.stringify({ worker_id: estado.worker.id, pin: pin }) })
      .then(function (r) {
        $("ficTeclado").classList.remove("comprobando");
        if (!r.datos.ok) {
          $("ficPinError").textContent = r.datos.error || "PIN incorrecto.";
          // Un temblor corto: se nota sin leer, que es lo que hace falta con prisa.
          var caja = $("ficPuntos"); caja.classList.remove("mal"); void caja.offsetWidth; caja.classList.add("mal");
          return;
        }
        estado.ticket = r.datos.ticket;
        estado.pinTemporal = !!r.datos.pinTemporal;
        estado.sinLinea = false;
        pintarAcciones(r.datos);
      })
      .catch(function () {
        $("ficTeclado").classList.remove("comprobando");
        // Sin línea NO se puede comprobar un PIN, y no se va a fingir que sí: dejar entrar
        // sin comprobarlo permitiría fichar en nombre de cualquiera. Se dice qué hacer.
        $("ficPinError").textContent = "Sin conexión: no se puede comprobar el PIN ahora. Apunta tu hora y dísela a tu encargado.";
      });
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
      // La hora del PULSO, no la del envío. Si esto se queda en la cola seis horas, es la
      // única forma de que quede registrado a la hora en que ocurrió de verdad.
      ms: Date.now(),
    };
    aplazarVuelta(OK_MS + 500);
    api("/evento", {
      method: "POST",
      body: JSON.stringify({ ticket: trabajo.ticket, tipo: tipo, cliente_id: trabajo.id, cliente_ms: trabajo.ms }),
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
  // En IndexedDB, no en localStorage. Un fichaje perdido es, legalmente, un fichaje que
  // nunca ocurrió: la persona trabajó y no consta. localStorage se escribe de forma
  // síncrona, falla en silencio cuando no cabe y el navegador lo borra antes que la base
  // de datos cuando anda justo de espacio. Aquí la durabilidad no es un lujo.
  //
  // La hora del fichaje se guarda AL PULSAR, no al subir. Es la única forma de que una
  // salida de las 02:10 que sube a las nueve de la mañana quede registrada a las 02:10;
  // el servidor la marca como `kiosco_offline` para que se vea de dónde salió.
  var DB_NOMBRE = "fichar", DB_TIENDA = "cola", _db = null;

  function abrirDb() {
    return new Promise(function (resolve) {
      if (_db) return resolve(_db);
      if (!self.indexedDB) return resolve(null);
      var req;
      try { req = indexedDB.open(DB_NOMBRE, 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(DB_TIENDA)) db.createObjectStore(DB_TIENDA, { keyPath: "id" });
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { resolve(null); };   // modo privado, cuota, etc.
    });
  }

  function conTienda(modo, fn) {
    return abrirDb().then(function (db) {
      if (!db) return respaldo(modo, fn);            // sin IndexedDB, localStorage
      return new Promise(function (resolve) {
        var tx = db.transaction(DB_TIENDA, modo);
        var res = fn(tx.objectStore(DB_TIENDA));
        tx.oncomplete = function () { resolve(res && res.result !== undefined ? res.result : res); };
        tx.onerror = tx.onabort = function () { resolve(null); };
      });
    });
  }

  // Respaldo para navegadores sin IndexedDB (o en modo privado). Peor, pero mejor que nada.
  function respaldo(modo, fn) {
    var lista = [];
    try { lista = JSON.parse(localStorage.getItem(COLA_KEY) || "[]"); } catch (e) { lista = []; }
    var falso = {
      add: function (v) { lista.push(v); },
      put: function (v) { lista = lista.filter(function (x) { return x.id !== v.id; }); lista.push(v); },
      delete: function (id) { lista = lista.filter(function (x) { return x.id !== id; }); },
      getAll: function () { return { result: lista.slice() }; },
    };
    var r = fn(falso);
    if (modo === "readwrite") { try { localStorage.setItem(COLA_KEY, JSON.stringify(lista)); } catch (e) { /* sin sitio */ } }
    return Promise.resolve(r && r.result !== undefined ? r.result : r);
  }

  function leerCola() {
    return conTienda("readonly", function (t) { return t.getAll(); }).then(function (l) {
      return (l || [])
        .filter(function (x) { return x.id !== CLAVE_PLANTILLA; })   // comparte tienda, no es un fichaje
        .sort(function (a, b) { return a.ms - b.ms; });              // el orden ES la jornada
    });
  }
  function encolar(t) { return conTienda("readwrite", function (s) { s.add(t); }).then(refrescarCola); }
  function desencolar(id) { return conTienda("readwrite", function (s) { s.delete(id); }).then(refrescarCola); }

  function refrescarCola() { return leerCola().then(pintarCola); }
  // Una sola franja arriba. Los pendientes mandan sobre el aviso de "sin conexión": son lo
  // accionable, y decir las dos cosas a la vez en una tablet no cabe ni se lee.
  function pintarCola(c) {
    var n = (c || []).length;
    var texto = n ? (n === 1 ? "1 fichaje pendiente de enviar" : n + " fichajes pendientes de enviar")
      : estado.sinLinea ? "Sin conexión — se recupera sola en cuanto vuelva" : "";
    $("ficCola").classList.toggle("hidden", !texto);
    $("ficCola").textContent = texto;
  }

  // Se sube de uno en uno y EN ORDEN: si la salida entrara antes que la entrada, la máquina
  // de estados vería una salida sin entrada y generaría una incidencia que no existe.
  var subiendo = false;
  function subirCola() {
    if (subiendo) return Promise.resolve();
    subiendo = true;
    return leerCola().then(function (cola) {
      if (!cola.length) { subiendo = false; return pintarCola(cola); }
      var t = cola[0];
      return api("/evento", {
        method: "POST",
        // `offline: true` + la hora de CUANDO SE PULSÓ. El servidor la acepta con el ticket
        // caducado y marca el evento como diferido.
        body: JSON.stringify({ ticket: t.ticket, tipo: t.tipo, cliente_id: t.id, cliente_ms: t.ms, offline: true }),
      }).then(function (r) {
        subiendo = false;
        // 409 = el servidor lo ha valorado y dice que no cabe (o que la tablet tiene la
        // hora mal). Se quita de la cola porque reintentarlo daría siempre lo mismo, pero
        // el problema ya está anotado en el servidor para que lo vea una persona.
        // Si el servidor ha contestado, hay línea: se quita el aviso y se recupera la
        // lista de verdad, con los estados al día.
        if (estado.sinLinea) { estado.sinLinea = false; cargarEquipo(); }
        if (r.datos.ok || r.http === 409) return desencolar(t.id).then(subirCola);
      }).catch(function () { subiendo = false; });
    });
  }
  setInterval(subirCola, 30000);
  window.addEventListener("online", subirCola);

  // Migración de la cola vieja de localStorage, por si la tablet venía de la versión anterior.
  (function migrar() {
    var viejos = [];
    try { viejos = JSON.parse(localStorage.getItem(COLA_KEY) || "[]"); } catch (e) { return; }
    if (!viejos.length || !self.indexedDB) return;
    abrirDb().then(function (db) {
      if (!db) return;
      Promise.all(viejos.map(function (v) { return encolar({ id: v.id, tipo: v.tipo, ticket: v.ticket, ms: v.ms || Date.now(), nombre: v.nombre }); }))
        .then(function () { try { localStorage.removeItem(COLA_KEY); } catch (e) { /* da igual */ } });
    });
  })();

  // ── Arranque ─────────────────────────────────────────────────────────────
  montarTeclado();
  refrescarCola();
  // El service worker solo sirve para que la pantalla siga abriéndose sin línea. No cachea
  // ninguna respuesta de la API: un listado de ayer diría que está dentro quien ya se fue.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/fichar-sw.js").catch(function () { /* http, modo privado… */ });
  }
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
