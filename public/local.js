const locals = {
  "la-tapeta": {
    name: "La Tapeta",
    desc: "Locales con ambiente y buen rollo.",
    type: "Bar de tapas",
    slug: "la-tapeta",
    locations: [
      "Blanes · Calle Muralla 21",
      "Lloret · Calle Sant Pere 84",
      "Girona · Avinguda Sant Francesc 7"
    ],
    instagram: "https://www.instagram.com/la.tapeta/",
    menuPdf: "",
    gallery: [
      "https://familiadelamor.com/wp-content/uploads/elementor/thumbs/Tapeta_Lloret-30-ratgtjh9xi7hw5vtvqz47f25dmzpdau9n8kowi9w8g.jpg",
      "https://familiadelamor.com/wp-content/uploads/elementor/thumbs/Tapeta_Lloret-27-ratgthllju4x8xyk6q5v2fj86v8yxwmsyz9pxycokw.jpg",
      "https://familiadelamor.com/wp-content/uploads/elementor/thumbs/DSC03669-ratgsvzb6nbbtwtyoytfz2zmj07j0v8z809jwl8qk0.jpg"
    ]
  },
  cooperativa: {
    name: "Cooperativa",
    desc: "Tradición local y cocina con identidad.",
    type: "Restaurante",
    slug: "cooperativa",
    locations: ["Blanes · Calle Muralla 28"],
    instagram: "https://www.instagram.com/lacooperativa1920/",
    menuPdf: "",
    gallery: []
  },
  "can-mateu": {
    name: "Can Mateu",
    desc: "Cocina auténtica en el corazón de Tordera.",
    type: "Restaurante",
    slug: "can-mateu",
    locations: ["Tordera · Plaça Concòrdia 7"],
    instagram: "https://www.instagram.com/can_mateu/",
    menuPdf: "",
    gallery: []
  },
  "la-tapa-iberica": {
    name: "La Tapa Ibérica",
    desc: "Sabores ibéricos y tapeo con carácter.",
    type: "Bar de tapas",
    slug: "la-tapa-iberica",
    locations: ["Tordera · Camí Ral 6"],
    instagram: "https://www.instagram.com/la.tapa.iberica/",
    menuPdf: "",
    gallery: [
      "https://familiadelamor.com/wp-content/uploads/elementor/thumbs/245204088_613764569787043_5673992419701949693_n-ratgreeid39zg4zsdtnpiyico1jlu4ca0n2vjtg6eo.jpg",
      "https://familiadelamor.com/wp-content/uploads/elementor/thumbs/190886663_1883026418526578_4589012771461431346_n-ratgr9pbex3ju36m59mkohp1p46rrmtmbztg5fn59s.jpg",
      "https://familiadelamor.com/wp-content/uploads/elementor/thumbs/464759389_3011549445658838_1759756202266847061_n-ratgrnsw9fmuo8m4uxpz7w4ylw99z3dldxlqcl28og.jpg"
    ]
  },
  "botiga-d-en-mateu": {
    name: "Botiga d'en Mateu",
    desc: "Tienda de embutidos y jamonería.",
    type: "Tienda",
    slug: "botiga-d-en-mateu",
    locations: ["Tordera · Camí Ral 8"],
    instagram: "https://www.instagram.com/labotiga_tordera/",
    menuPdf: "",
    gallery: []
  },
  "viva-la-pepa": {
    name: "Viva la Pepa",
    desc: "Fiestas al aire libre y eventos memorables.",
    type: "Eventos",
    slug: "viva-la-pepa",
    locations: ["Eventos itinerantes"],
    instagram: "https://www.instagram.com/lapepafest/",
    menuPdf: "",
    gallery: []
  }
};

const i18nLocal = {
  es: {
    nav_home: "Inicio",
    nav_companies: "Empresas",
    nav_reservas: "Reservas",
    nav_contact: "Contacto",
    hero_eyebrow: "Local",
    section_location: "Ubicación",
    section_gallery: "Galería",
    section_gallery_sub: "Imágenes del local.",
    section_hours: "Horarios",
    section_map: "Mapa",
    section_history: "Historia",
    section_history_sub: "Curiosidades y recorrido del local.",
    cta_instagram: "Instagram",
    cta_menu: "Carta",
    cta_map: "Ver mapa",
    empty_gallery: "Sin imágenes todavía.",
    coming_curiosity: "Próximamente: historia, curiosidades y logros del local.",
    coming_map: "Próximamente: mapa interactivo.",
    coming_history: "Próximamente: historia del local."
  },
  ca: {
    nav_home: "Inici",
    nav_companies: "Empreses",
    nav_reservas: "Reserves",
    nav_contact: "Contacte",
    hero_eyebrow: "Local",
    section_location: "Ubicació",
    section_gallery: "Galeria",
    section_gallery_sub: "Imatges del local.",
    section_hours: "Horaris",
    section_map: "Mapa",
    section_history: "Història",
    section_history_sub: "Curiositats i recorregut del local.",
    cta_instagram: "Instagram",
    cta_menu: "Carta",
    cta_map: "Veure mapa",
    empty_gallery: "Encara no hi ha imatges.",
    coming_curiosity: "Properament: història, curiositats i assoliments del local.",
    coming_map: "Properament: mapa interactiu.",
    coming_history: "Properament: història del local."
  },
  en: {
    nav_home: "Home",
    nav_companies: "Companies",
    nav_reservas: "Reservations",
    nav_contact: "Contact",
    hero_eyebrow: "Venue",
    section_location: "Location",
    section_gallery: "Gallery",
    section_gallery_sub: "Images from the venue.",
    section_hours: "Hours",
    section_map: "Map",
    section_history: "History",
    section_history_sub: "Curiosities and venue journey.",
    cta_instagram: "Instagram",
    cta_menu: "Menu",
    cta_map: "View map",
    empty_gallery: "No images yet.",
    coming_curiosity: "Coming soon: history, curiosities and achievements.",
    coming_map: "Coming soon: interactive map.",
    coming_history: "Coming soon: venue history."
  }
};

let localLang = localStorage.getItem("familia_lang") || "es";

function applyLocalLang() {
  document.documentElement.lang = localLang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const dict = i18nLocal[localLang] || i18nLocal.es;
    if (dict[key]) el.textContent = dict[key];
  });
  document.querySelectorAll(".lang button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === localLang);
  });
}

async function loadLocalOverrides() {
  try {
    const res = await fetch("/api/content");
    const data = await res.json();
    if (!data.ok) return;
    const content = data.data || {};

    Object.values(locals).forEach((loc) => {
      const slug = loc.slug || slugify(loc.name);
      const insta = content[`local_${slug}_instagram`];
      const menu = content[`local_${slug}_menu_pdf`];
      const gallery = content[`local_${slug}_gallery`];
      const hours = content[`local_${slug}_hours`];
      const map = content[`local_${slug}_map`];
      const history = content[`local_${slug}_history`];
      if (insta) loc.instagram = insta;
      if (menu) loc.menuPdf = menu;
      if (hours) loc.hours = hours;
      if (map) loc.map = map;
      if (history) loc.history = history;
      if (gallery) {
        loc.gallery = gallery
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    });
  } catch {
    // ignore
  }
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[áàä]/g, "a")
    .replace(/[éèë]/g, "e")
    .replace(/[íìï]/g, "i")
    .replace(/[óòö]/g, "o")
    .replace(/[úùü]/g, "u")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getSlug() {
  const params = new URLSearchParams(window.location.search);
  return params.get("slug");
}

function renderLocal() {
  const slug = getSlug();
  const data = locals[slug];
  if (!data) {
    document.getElementById("localName").textContent = "Local no encontrado";
    return;
  }

  const t = i18nLocal[localLang] || i18nLocal.es;
  document.title = `${data.name} · Familia del Amor`;
  document.getElementById("localType").textContent = t.hero_eyebrow;
  document.getElementById("localName").textContent = data.name;
  document.getElementById("localDesc").textContent = data.desc;

  const locList = document.getElementById("localLocations");
  locList.innerHTML = data.locations.map((l) => `<li>${l}</li>`).join("");
  const curiosity = document.getElementById("localCuriosity");
  curiosity.textContent = t.coming_curiosity;

  const hoursEl = document.getElementById("localHours");
  hoursEl.textContent = data.hours || "08:00 – 00:00";
  hoursEl.setAttribute("data-edit-key", `local_${data.slug}_hours`);

  const mapEl = document.getElementById("localMap");
  if (data.map) {
    const isEmbed = data.map.includes("google.com/maps") && data.map.includes("embed");
    mapEl.innerHTML = isEmbed
      ? `<iframe src="${data.map}" width="100%" height="220" style="border:0;border-radius:12px;" allowfullscreen="" loading="lazy"></iframe>`
      : `<a class="btn ghost" href="${data.map}" target="_blank" rel="noreferrer">${t.cta_map}</a>`;
  } else {
    mapEl.textContent = t.coming_map;
  }
  mapEl.setAttribute("data-edit-key", `local_${data.slug}_map`);

  const historyEl = document.getElementById("localHistory");
  historyEl.textContent = data.history || t.coming_history;
  historyEl.setAttribute("data-edit-key", `local_${data.slug}_history`);

  const ctas = document.getElementById("localCtas");
  ctas.innerHTML = "";
  if (data.instagram) {
    const a = document.createElement("a");
    a.className = "btn ghost";
    a.href = data.instagram;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = t.cta_instagram;
    ctas.appendChild(a);
  }
  if (data.menuPdf) {
    const a = document.createElement("a");
    a.className = "btn";
    a.href = data.menuPdf;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = t.cta_menu;
    ctas.appendChild(a);
  }

  const gallery = document.getElementById("localGallery");
  gallery.setAttribute("data-edit-key", `local_${data.slug}_gallery`);
  if (data.gallery.length === 0) {
    gallery.innerHTML = `<div class="card">${t.empty_gallery}</div>`;
    return;
  }
  gallery.innerHTML = data.gallery
    .map(
      (src) => `
      <div class=\"card\">
        <img src=\"${src}\" alt=\"${data.name}\" style=\"width:100%;border-radius:10px;display:block;\" />
      </div>
    `
    )
    .join("");
}

loadLocalOverrides().then(() => {
  applyLocalLang();
  renderLocal();
});

document.querySelectorAll(".lang button").forEach((btn) => {
  btn.addEventListener("click", () => {
    localLang = btn.dataset.lang;
    localStorage.setItem("familia_lang", localLang);
    applyLocalLang();
    renderLocal();
  });
});

const navToggle = document.getElementById("navToggle");
const nav = document.querySelector(".nav");
if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
  nav.querySelectorAll("a, button").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

window.addEventListener("load", () => {
  window.scrollTo(0, 0);
});

if (window.top !== window) {
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg && msg.type === "edit-mode") {
      const enabled = !!msg.enabled;
      document.documentElement.classList.toggle("edit-mode", enabled);
      window.__editModeEnabled = enabled;
      document.querySelectorAll("[data-edit-key]").forEach((el) => {
        if (el.tagName.toLowerCase() !== "iframe") {
          el.contentEditable = enabled ? "true" : "false";
        }
      });
    }
  });

  document.addEventListener("click", (e) => {
    if (!window.__editModeEnabled) return;
    const target = e.target;
    const editable = target.closest("[data-edit-key]");
    if (!editable) return;
    if (target.closest("a, button")) {
      e.preventDefault();
    }
    const key = editable.getAttribute("data-edit-key");
    if (!key) return;
    if (key.endsWith("_map")) {
      const next = window.prompt("Nueva URL de mapa (embed o link):", "");
      if (next) {
        editable.textContent = "";
        window.parent.postMessage(
          { type: "edit-update", key, lang: localLang, value: next },
          "*"
        );
      }
      return;
    }
    if (key.endsWith("_gallery")) {
      const next = window.prompt("Pega URLs de imágenes (1 por línea):", "");
      if (next) {
        window.parent.postMessage(
          { type: "edit-update", key, lang: localLang, value: next },
          "*"
        );
      }
      return;
    }
    window.parent.postMessage(
      {
        type: "edit-select",
        key,
        lang: localLang,
        enabled: window.__editModeEnabled
      },
      "*"
    );
  });

  document.addEventListener("input", (e) => {
    if (!window.__editModeEnabled) return;
    const editable = e.target.closest("[data-edit-key]");
    if (!editable) return;
    const key = editable.getAttribute("data-edit-key");
    if (!key) return;
    if (key.endsWith("_gallery") || key.endsWith("_map")) return;
    const value = editable.textContent.trim();
    window.parent.postMessage(
      { type: "edit-update", key, lang: localLang, value },
      "*"
    );
  });
}
