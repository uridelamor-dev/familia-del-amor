// Pulso anónimo del equipo — formulario público.
//
// Autocontenido a propósito: NO carga public/app.js, que arrastra reservas, calendario,
// botón flotante de WhatsApp y contenido editable. Aquí solo hay un formulario.
//
// El token va en la URL (?t=...). No se guarda en ningún sitio, no se registra en consola
// y la página no enlaza a ninguna parte, para que no viaje en cabeceras Referer.

const TOKEN = new URLSearchParams(location.search).get("t") || "";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function aviso(texto, ocultarPromesa = false) {
  $("pulsoAvisoTxt").textContent = texto;
  $("pulsoAviso").classList.remove("hidden");
  $("pulsoForm").classList.add("hidden");
  if (ocultarPromesa) $("pulsoPromesa").classList.add("hidden");
}

// Escala 1-5 en botones grandes: en el móvil, un <select> o un slider se manejan peor
// y aquí lo que importa es que contestar cueste diez segundos.
function pintarPregunta(p) {
  const opciones = [1, 2, 3, 4, 5].map((n) => `
    <label class="escala-op">
      <input type="radio" name="${esc(p.key)}" value="${n}" ${p.obligatoria ? "required" : ""} />
      <span>${n}</span>
    </label>`).join("");
  return `
    <fieldset class="escala">
      <legend>${esc(p.texto)}${p.obligatoria ? "" : " <small>(opcional)</small>"}</legend>
      <div class="escala-ops">${opciones}</div>
      <div class="escala-pies"><span>${esc(p.min)}</span><span>${esc(p.max)}</span></div>
    </fieldset>`;
}

async function cargar() {
  if (!TOKEN) return aviso("Este enlace no es válido. Pídele uno nuevo a tu encargado.", true);
  try {
    const r = await fetch("/api/pulso/" + encodeURIComponent(TOKEN));
    const j = await r.json();
    if (!j.ok) return aviso(j.error || "Este enlace no es válido.", true);

    const [y, m] = String(j.mes || "").split("-");
    if (y && m) {
      const nombre = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" })
        .format(new Date(Number(y), Number(m) - 1, 15));
      $("pulsoTitulo").textContent = `¿Cómo ha ido ${nombre}?`;
    }
    $("pulsoPreguntas").innerHTML = (j.preguntas || []).map(pintarPregunta).join("");
    $("pulsoForm").classList.remove("hidden");
    $("pulsoHablemos").classList.remove("hidden");
  } catch {
    aviso("No hay conexión. Inténtalo dentro de un rato.");
  }
}

$("pulsoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = $("pulsoEnviar");
  btn.disabled = true;
  $("pulsoMsg").textContent = "Enviando…";
  try {
    const r = await fetch("/api/pulso/" + encodeURIComponent(TOKEN), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p1: fd.get("p1"), p2: fd.get("p2"), p3: fd.get("p3") || null,
        comentario: (fd.get("comentario") || "").toString().trim() || null,
        idioma: "es",
      }),
    });
    const j = await r.json();
    if (!j.ok) { $("pulsoMsg").textContent = j.error || "No se pudo enviar."; btn.disabled = false; return; }
    $("pulsoForm").classList.add("hidden");
    $("pulsoPromesa").classList.add("hidden");
    $("pulsoGracias").classList.remove("hidden");
    // El bloque de «hablemos» sigue disponible tras enviar: puede que justo al contestar
    // se dé cuenta de que sí quiere hablar. Su petición va por otra vía y no lleva las
    // respuestas, así que no rompe nada.
  } catch {
    $("pulsoMsg").textContent = "No hay conexión. Inténtalo dentro de un rato.";
    btn.disabled = false;
  }
});

// ── «Quiero que hablemos» ────────────────────────────────────────────────────
// Petición aparte, con su propio textarea. Nunca se copia aquí el comentario anónimo:
// son dos cosas distintas y el trabajador tiene derecho a que lo sigan siendo.
$("hbCheck").addEventListener("change", (e) => {
  $("hbDetalle").classList.toggle("hidden", !e.target.checked);
});

$("hbEnviar").addEventListener("click", async () => {
  const btn = $("hbEnviar");
  btn.disabled = true;
  $("hbMsg").textContent = "Enviando…";
  try {
    const r = await fetch("/api/pulso/" + encodeURIComponent(TOKEN) + "/contacto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ con_quien: $("hbConQuien").value, mensaje: $("hbMensaje").value.trim() || null }),
    });
    const j = await r.json();
    if (!j.ok) { $("hbMsg").textContent = j.error || "No se pudo enviar."; btn.disabled = false; return; }
    $("hbDetalle").innerHTML = `<p class="form-note" style="margin:0">Hecho. Te buscarán para hablar. Tus respuestas del formulario siguen siendo anónimas.</p>`;
    $("hbCheck").disabled = true;
  } catch {
    $("hbMsg").textContent = "No hay conexión. Inténtalo dentro de un rato.";
    btn.disabled = false;
  }
});

cargar();
