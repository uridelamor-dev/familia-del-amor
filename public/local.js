const cartaTapeta = "/documentos/carta-la-tapeta-lloret-girona.pdf";
const locals = {
  "la-tapeta-blanes": {
    name: "La Tapeta Blanes",
    desc: "Locales con ambiente y buen rollo.",
    type: "Bar de tapas",
    slug: "la-tapeta-blanes",
    locations: [
      { dir: "Blanes · Carrer de la Muralla 21", tel: "972916341" }
    ],
    instagram: "https://www.instagram.com/la.tapeta/",
    weeklyPdf: "/documentos/menu-semanal-tapeta-cooperativa.pdf",
    menuPdf: "/documentos/carta-cooperativa-tapeta-blanes.pdf",
    gallery: ["uploads/gallery/LaTapeta_Blanes_01.jpg"]
  },
  "la-tapeta-lloret": {
    name: "La Tapeta Lloret",
    desc: "Locales con ambiente y buen rollo.",
    type: "Bar de tapas",
    slug: "la-tapeta-lloret",
    locations: [
      { dir: "Lloret · Carrer Sant Pere 84", tel: "872266645" }
    ],
    instagram: "https://www.instagram.com/la.tapeta/",
    weeklyPdf: "/documentos/menu-semanal-tapeta-cooperativa.pdf",
    menuPdf: cartaTapeta,
    gallery: ["uploads/gallery/LaTapeta_Lloret_01.jpg"]
  },
  "la-tapeta-girona": {
    name: "La Tapeta Girona",
    desc: "Locales con ambiente y buen rollo.",
    type: "Bar de tapas",
    slug: "la-tapeta-girona",
    locations: [
      { dir: "Girona · Avinguda Sant Francesc 7", tel: "872071246" }
    ],
    instagram: "https://www.instagram.com/la.tapeta/",
    weeklyPdf: "/documentos/menu-semanal-tapeta-cooperativa.pdf",
    menuPdf: cartaTapeta,
    gallery: ["uploads/gallery/LaTapeta_Girona_01.jpg"]
  },
  cooperativa: {
    name: "Cooperativa",
    desc: "Tradición local y cocina con identidad.",
    type: "Restaurante",
    slug: "cooperativa",
    locations: [
      { dir: "Blanes · Carrer de la Muralla 28", tel: "972916341" }
    ],
    instagram: "https://www.instagram.com/lacooperativa1920/",
    weeklyPdf: "/documentos/menu-semanal-tapeta-cooperativa.pdf",
    menuPdf: "/documentos/carta-cooperativa-tapeta-blanes.pdf",
    gallery: ['uploads/gallery/Cooperativa_1.jpg', 'uploads/gallery/Cooperativa_208.jpg']
  },
  "can-mateu": {
    name: "Can Mateu",
    desc: "Cocina auténtica en el corazón de Tordera.",
    type: "Restaurante",
    slug: "can-mateu",
    directionsDestination: "41.7018796,2.7183261",
    locations: [
      { dir: "Tordera · Plaça de la Concòrdia 5", tel: "930317169" }
    ],
    instagram: "https://www.instagram.com/can_mateu/",
    menuPdf: "/documentos/carta-can-mateu.pdf",
    gallery: ['uploads/gallery/CanMateu_STR05254.jpg', 'uploads/gallery/CanMateu_STR04942.jpg']
  },
  "la-tapa-iberica": {
    name: "La Tapa Ibérica",
    desc: "Sabores ibéricos y tapeo con carácter.",
    type: "Bar de tapas",
    slug: "la-tapa-iberica",
    locations: [
      { dir: "Tordera · Camí Ral 6", tel: "937643371" }
    ],
    instagram: "https://www.instagram.com/la.tapa.iberica/",
    menuPdf: "/documentos/carta-tapa-iberica.pdf",
    gallery: ["uploads/gallery/TapaIberica_STR05538.jpg", "uploads/gallery/TapaIberica_STR05475.jpg"]
  },
  "botiga-d-en-mateu": {
    name: "Botiga d'en Mateu",
    desc: "Tienda de embutidos y jamonería.",
    type: "Tienda",
    slug: "botiga-d-en-mateu",
    locations: [
      { dir: "Tordera · Camí Ral 6", tel: "930317169" }
    ],
    instagram: "https://www.instagram.com/labotiga_tordera/",
    menuPdf: "",
    gallery: ['uploads/gallery/BotigaMateu_01.jpg']
  },
  "viva-la-pepa": {
    name: "Viva la Pepa",
    desc: "Fiestas al aire libre y eventos memorables.",
    type: "Eventos",
    slug: "viva-la-pepa",
    itinerant: true,
    locations: [
      { dir: "Eventos itinerantes", tel: null }
    ],
    instagram: "https://www.instagram.com/lapepafest/",
    menuPdf: "",
    gallery: ['uploads/gallery/VivaLaPepa_01.webp']
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

let localContent = {};
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
    const res = await (window.webContentFetch ? window.webContentFetch() : fetch("/api/content"));
    const data = await res.json();
    if (!data.ok) return;
    const content = data.data || {}; localContent = content;

    Object.values(locals).forEach((loc) => {
      const slug = loc.slug || slugify(loc.name);
      const insta = content[`local_${slug}_instagram`];
      const menu = content[`local_${slug}_menu_pdf`];
      const gallery = content[`local_${slug}_gallery`];
      const hours = content[`local_${slug}_hours`];
      const map = content[`local_${slug}_map`];
      const history = content[`local_${slug}_history`];
      if (insta) loc.instagram = insta;
      if (Object.hasOwn(content, `local_${slug}_menu_pdf`)) loc.menuPdf = menu;
      if (Object.hasOwn(content, `local_${slug}_weekly_pdf`)) loc.weeklyPdf = content[`local_${slug}_weekly_pdf`];
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
  locList.innerHTML = data.locations.map((l) => {
    if (typeof l === "string") return `<li>${l}</li>`;
    const telFmt = l.tel ? l.tel.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3") : null;
    const telLink = telFmt ? ` · <a href="tel:+34${l.tel}" style="color:var(--accent);font-weight:600;text-decoration:none;white-space:nowrap">📞 ${telFmt}</a>` : "";
    return `<li>${l.dir}${telLink}</li>`;
  }).join("");
  const curiosity = document.getElementById("localCuriosity");
  curiosity.hidden = true;
  curiosity.parentElement.classList.remove("split");

  const hoursEl = document.getElementById("localHours");
  const textFor = field => localContent[`local_${data.slug}_${field}_${localLang}`] ?? localContent[`local_${data.slug}_${field}`] ?? data[field];
  hoursEl.textContent = textFor("hours") || ({ es:"Consulta el horario con el local antes de venir.", ca:"Consulta l’horari amb el local abans de venir.", en:"Contact the venue to check opening hours before your visit." }[localLang] || "Consulta el horario con el local antes de venir.");
  hoursEl.setAttribute("data-edit-key", `local_${data.slug}_hours`);

  const mapEl = document.getElementById("localMap");
  const safeUrl = value => { try { const u=new URL(value, location.href); return ["https:","http:"].includes(u.protocol) ? u : null; } catch { return null; } };
  const cover = data.gallery[0] && safeUrl(data.gallery[0]);
  if (cover) document.getElementById("localHero").style.setProperty("--hero-image", `url(${JSON.stringify(cover.href)})`);
  // Directions use the postal address, not an embed URL or a relative website URL.
  const address = !data.itinerant && data.locations.map(l => typeof l === "string" ? l : l.dir).find(Boolean);
  mapEl.replaceChildren();
  if (address) {
    const parts = address.split('·').map(part => part.trim());
    const destination = parts.length > 1 ? [...parts.slice(1), parts[0], 'España'].join(', ') : address;
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('destination', data.directionsDestination || destination);
    const link = document.createElement('a');
    link.className='btn ghost';link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
    link.textContent=({es:'Cómo llegar ↗',ca:'Com arribar-hi ↗',en:'Get directions ↗'})[localLang] || 'Cómo llegar ↗';
    mapEl.append(link);
  }
  mapEl.hidden = !address;
  mapEl.setAttribute("data-edit-key", `local_${data.slug}_map`);

  const historyEl = document.getElementById("localHistory");
  historyEl.textContent = textFor("history") || "";
  historyEl.closest("section").hidden = !historyEl.textContent.trim();
  historyEl.setAttribute("data-edit-key", `local_${data.slug}_history`);

  const ctas = document.getElementById("localCtas");
  ctas.innerHTML = "";
  const reservationNames = { "la-tapeta-blanes":"La Tapeta - Blanes", "la-tapeta-lloret":"La Tapeta - Lloret", "la-tapeta-girona":"La Tapeta - Girona", cooperativa:"Cooperativa - Blanes", "can-mateu":"Can Mateu - Tordera", "la-tapa-iberica":"La Tapa Ibérica - Tordera" };
  if (reservationNames[slug]) {
    const a=document.createElement("a"); a.className="btn";
    a.href="/index.html?local=" + encodeURIComponent(reservationNames[slug]) + "#reservas";
    a.textContent=({es:"Reservar aquí",ca:"Reserva aquí",en:"Book a table"})[localLang] || "Reservar aquí";
    ctas.appendChild(a);
  }
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
    a.href = "#localMenu";
    a.rel = "noreferrer";
    a.textContent = t.cta_menu;
    ctas.appendChild(a);
  }

  renderCarta(data);

  const gallery = document.getElementById("localGallery");
  gallery.setAttribute("data-edit-key", `local_${data.slug}_gallery`);
  gallery.closest("section").hidden = data.gallery.length === 0;
  if (data.gallery.length === 0) { gallery.replaceChildren(); return; }
  gallery.innerHTML = data.gallery
    .map(
      (src) => `
      <div class=\"card\">
        <img src=\"${src}\" alt=\"${data.name}\" loading=\"lazy\" style=\"width:100%;border-radius:10px;display:block;\" />
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
    if (event.origin !== location.origin || event.source !== window.parent) return;
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

function renderCarta(data) {
  const section = document.getElementById('localMenu');
  section.hidden = !data.menuPdf && !data.weeklyPdf;
  if (section.hidden) return;
  const copy = {
    es: ['Nuestra carta','Menú semanal','Elige el idioma. Pulsa una página para verla ampliada.','Abrir PDF completo','Lunes a viernes · 13:00–16:00 · 18,50 €'],
    ca: ['La nostra carta','Menú setmanal','Tria l’idioma. Prem una pàgina per veure-la ampliada.','Obre el PDF complet','Dilluns a divendres · 13:00–16:00 · 18,50 €'],
    en: ['Our menu','Weekday menu','Choose a language. Tap a page to enlarge it.','Open full PDF','Monday to Friday · 13:00–16:00 · €18.50']
  }[localLang] || ['Nuestra carta','Menú semanal','Elige el idioma. Pulsa una página para verla ampliada.','Abrir PDF completo','Lunes a viernes · 13:00–16:00 · 18,50 €'];
  const tabs = document.getElementById('menuLanguages'), pages = document.getElementById('menuPages');
  let types = document.getElementById('menuTypes');
  if (!types) { types = document.createElement('div'); types.id='menuTypes'; types.className='menu-types'; section.prepend(types); }
  types.replaceChildren();
  const options = [[data.menuPdf,copy[0],false],[data.weeklyPdf,copy[1],true]].filter(x=>x[0]);
  function selectDocument(url, title, weekly) {
    for (const b of types.children) b.setAttribute('aria-pressed',String(b.dataset.url===url));
    document.getElementById('menuTitle').textContent=title;
    const catalog=window.menuCatalog?.[url];
    document.getElementById('menuHint').textContent=(weekly ? copy[4]+' · ' : '')+(catalog ? copy[2] : '');
    const download=document.getElementById('menuDownload'); download.href=url; download.textContent=copy[3];
    tabs.replaceChildren(); pages.replaceChildren();
    if(!catalog){
      const frame=document.createElement('iframe');frame.src=url;frame.title=title;frame.className='menu-pdf';frame.loading='lazy';pages.append(frame);return;
    }
    function showLanguage(lang){
      const entry=catalog.languages.find(x=>x[0]===lang)||catalog.languages.find(x=>x[0]==='es')||catalog.languages[0];
      for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.dataset.lang===entry[0]));
      pages.replaceChildren();
      // Weekly cover stays in the full PDF; show the dishes immediately on the website.
      const numbers=weekly ? [entry[2]+1] : [entry[2],entry[2]+1];
      pages.classList.toggle('menu-pages-weekly',weekly);
      for(const n of numbers){
        const a=document.createElement('a');a.href=`/documentos/${catalog.folder}/${n}.webp`;a.target='_blank';a.rel='noopener';
        const img=document.createElement('img');img.src=a.href;img.alt=`${title} · ${entry[1]} · ${n-entry[2]+1}`;img.loading='lazy';
        [img.width,img.height]=catalog.sizes[n-1];a.append(img);pages.append(a);
      }
    }
    for(const [lang,label] of catalog.languages){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.lang=lang;b.onclick=()=>showLanguage(lang);tabs.append(b);}
    showLanguage(localLang);
  }
  types.hidden=options.length<2;
  for(const option of options){const b=document.createElement('button');b.type='button';b.textContent=option[1];b.dataset.url=option[0];b.onclick=()=>selectDocument(...option);types.append(b);}
  selectDocument(...options[0]);
}
