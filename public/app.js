const companies = [
  {
    name: "La Tapeta",
    desc: "Locales con ambiente y buen rollo.",
    logo: "assets/logos/6.svg",
    slug: "la-tapeta",
    locations: [
      "Blanes · Calle Muralla 21",
      "Lloret · Calle Sant Pere 84",
      "Girona · Avinguda Sant Francesc 7"
    ]
  },
  {
    name: "Cooperativa",
    desc: "Tradición local y cocina con identidad.",
    logo: "assets/logos/7.svg",
    slug: "cooperativa",
    locations: ["Blanes · Calle Muralla 28"]
  },
  {
    name: "Can Mateu",
    desc: "Cocina auténtica en el corazón de Tordera.",
    logo: "assets/logos/3.svg",
    slug: "can-mateu",
    locations: ["Tordera · Plaça Concòrdia 7"]
  },
  {
    name: "La Tapa Ibérica",
    desc: "Sabores ibéricos y tapeo con carácter.",
    logo: "assets/logos/4.svg",
    slug: "la-tapa-iberica",
    locations: ["Tordera · Camí Ral 6"]
  },
  {
    name: "Botiga d'en Mateu",
    desc: "Tienda de embutidos y jamonería.",
    logo: "assets/logos/2.svg",
    slug: "botiga-mateu",
    locations: ["Tordera · Camí Ral 8"]
  },
  {
    name: "Viva la Pepa",
    desc: "Fiestas al aire libre y eventos memorables.",
    logo: "assets/logos/5.svg",
    slug: "viva-la-pepa",
    locations: ["Eventos itinerantes"]
  }
];

const i18n = {
  es: {
    hero_eyebrow: "Grupo familiar de empresas",
    hero_title: "Familia del Amor",
    hero_sub: "Sabor, tradición y alegría compartida en cada local.",
    hero_cta: "Reservar mesa",
    hero_cta_2: "Ver locales",
    about_title: "Sobre nosotros",
    about_text:
      "Somos un grupo familiar de tercera generación, dedicados a la atención al cliente desde los años 70. Llevamos décadas trabajando de cara al público y nuestra obsesión es que cada persona se sienta como en casa: cercana, cuidada y bien atendida.",
    about_tile:
      "Bares de tapas con mucho ambiente, cocina honesta y un equipo que cuida cada detalle.",
    companies_title: "Nuestras empresas",
    companies_sub: "Cada local con su carácter, historia y sabor.",
    history_title: "Historia y valores",
    history_sub: "Nuestra manera de hacer las cosas, desde dentro.",
    team_title: "Equipo y familia",
    team_text: "Somos una familia que crece con cada local y cada historia compartida.",
    events_title: "Eventos y experiencias",
    events_text: "Viva la Pepa: fiestas al aire libre y celebraciones a medida.",
    events_cta: "Pedir información",
    news_title: "Anuncios y novedades",
    news_sub: "Lo último del grupo y sus locales.",
    news_empty: "Pronto: anuncios y novedades.",
    reservations_title: "Reservas",
    reservations_sub: "Reserva confirmada al instante.",
    reservation_local: "Local",
    reservation_people: "Personas",
    reservation_day: "Día",
    reservation_time: "Hora",
    reservation_phone: "Teléfono",
    reservation_name: "Nombre de la reserva",
    reservation_submit: "Confirmar reserva",
    jobs_title: "Trabaja con nosotros",
    jobs_text: "Envíanos tu CV y cuéntanos en qué área te gustaría aportar.",
    faq_title: "Preguntas frecuentes",
    faq_sub: "Resolvemos las dudas más habituales.",
    faq_empty: "Pronto: preguntas frecuentes.",
    contact_title: "Contacto",
    contact_text: "Para cualquier consulta, escríbenos.",
    legal_title: "Legal y privacidad",
    legal_text: "Políticas de privacidad, cookies y condiciones.",
    popup_title: "¡Bienvenidos a Familia del Amor!",
    popup_text: "Déjanos tus datos y recibe un 10% de descuento.",
    lead_name: "Nombre",
    lead_lastname: "Apellidos",
    lead_birth: "Fecha de nacimiento",
    lead_city: "Población",
    lead_phone: "Teléfono",
    lead_email: "Correo",
    lead_consent: "Acepto recibir comunicaciones y la política de privacidad.",
    lead_submit: "Recibir premio"
  },
  ca: {
    hero_eyebrow: "Grup familiar d'empreses",
    hero_title: "Família de l'Amor",
    hero_sub: "Sabor, tradició i alegria compartida a cada local.",
    hero_cta: "Reservar taula",
    hero_cta_2: "Veure locals",
    about_title: "Sobre nosaltres",
    about_text:
      "Som un grup familiar de tercera generació, dedicats a l'atenció al client des dels anys 70. Portem dècades treballant de cara al públic i la nostra obsessió és que cada persona se senti com a casa: propera, cuidada i ben atesa.",
    about_tile:
      "Bars de tapes amb molt ambient, cuina honesta i un equip que cuida cada detall.",
    companies_title: "Les nostres empreses",
    companies_sub: "Cada local amb el seu caràcter, història i sabor.",
    history_title: "Història i valors",
    history_sub: "La nostra manera de fer les coses, des de dins.",
    team_title: "Equip i família",
    team_text: "Som una família que creix amb cada local i cada història compartida.",
    events_title: "Esdeveniments i experiències",
    events_text: "Viva la Pepa: festes a l'aire lliure i celebracions a mida.",
    events_cta: "Demanar informació",
    news_title: "Anuncis i novetats",
    news_sub: "L'últim del grup i els seus locals.",
    news_empty: "Ben aviat: anuncis i novetats.",
    reservations_title: "Reserves",
    reservations_sub: "Reserva confirmada a l'instant.",
    reservation_local: "Local",
    reservation_people: "Persones",
    reservation_day: "Dia",
    reservation_time: "Hora",
    reservation_phone: "Telèfon",
    reservation_name: "Nom de la reserva",
    reservation_submit: "Confirmar reserva",
    jobs_title: "Treballa amb nosaltres",
    jobs_text: "Envia'ns el teu CV i explica'ns en quin àmbit t'agradaria aportar.",
    faq_title: "Preguntes freqüents",
    faq_sub: "Resolem els dubtes més habituals.",
    faq_empty: "Ben aviat: preguntes freqüents.",
    contact_title: "Contacte",
    contact_text: "Per a qualsevol consulta, escriu-nos.",
    legal_title: "Legal i privacitat",
    legal_text: "Polítiques de privacitat, cookies i condicions.",
    popup_title: "Benvinguts a Família de l'Amor!",
    popup_text: "Deixa'ns les teves dades i rep un 10% de descompte.",
    lead_name: "Nom",
    lead_lastname: "Cognoms",
    lead_birth: "Data de naixement",
    lead_city: "Població",
    lead_phone: "Telèfon",
    lead_email: "Correu",
    lead_consent: "Accepto rebre comunicacions i la política de privacitat.",
    lead_submit: "Rebre premi"
  },
  en: {
    hero_eyebrow: "Family business group",
    hero_title: "Familia del Amor",
    hero_sub: "Flavor, tradition, and shared joy at every venue.",
    hero_cta: "Book a table",
    hero_cta_2: "See venues",
    about_title: "About us",
    about_text:
      "We are a third-generation family business, dedicated to customer care since the 1970s. We have spent decades working face to face, and our obsession is that every person feels at home: welcomed, cared for, and well served.",
    about_tile:
      "Tapas bars with great atmosphere, honest cooking, and a team that cares about every detail.",
    companies_title: "Our companies",
    companies_sub: "Each venue with its own character, history, and flavor.",
    history_title: "History and values",
    history_sub: "Our way of doing things, from the inside.",
    team_title: "Team and family",
    team_text: "We are a family that grows with every venue and shared story.",
    events_title: "Events and experiences",
    events_text: "Viva la Pepa: outdoor parties and tailor-made celebrations.",
    events_cta: "Request info",
    news_title: "News and updates",
    news_sub: "The latest from the group and its venues.",
    news_empty: "Coming soon: news and updates.",
    reservations_title: "Reservations",
    reservations_sub: "Instant reservation confirmation.",
    reservation_local: "Venue",
    reservation_people: "Guests",
    reservation_day: "Date",
    reservation_time: "Time",
    reservation_phone: "Phone",
    reservation_name: "Booking name",
    reservation_submit: "Confirm reservation",
    jobs_title: "Work with us",
    jobs_text: "Send us your CV and tell us which area you'd like to join.",
    faq_title: "FAQ",
    faq_sub: "We answer the most common questions.",
    faq_empty: "Coming soon: FAQs.",
    contact_title: "Contact",
    contact_text: "For any questions, get in touch.",
    legal_title: "Legal and privacy",
    legal_text: "Privacy policy, cookies and terms.",
    popup_title: "Welcome to Familia del Amor!",
    popup_text: "Leave your details and receive a 10% discount.",
    lead_name: "First name",
    lead_lastname: "Last name",
    lead_birth: "Date of birth",
    lead_city: "City",
    lead_phone: "Phone",
    lead_email: "Email",
    lead_consent: "I accept communications and the privacy policy.",
    lead_submit: "Get reward"
  }
};

const i18nDates = {
  es: {
    months: [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre"
    ],
    weekdays: ["L", "M", "X", "J", "V", "S", "D"]
  },
  ca: {
    months: [
      "gener",
      "febrer",
      "març",
      "abril",
      "maig",
      "juny",
      "juliol",
      "agost",
      "setembre",
      "octubre",
      "novembre",
      "desembre"
    ],
    weekdays: ["Dl", "Dt", "Dc", "Dj", "Dv", "Ds", "Dg"]
  },
  en: {
    months: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ],
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  }
};

let currentLang = "es";
let datepickerApi = null;
const LANG_KEY = "familia_lang";
let contentCache = {};

function renderCompanies() {
  const container = document.getElementById("companies");
  container.innerHTML = "";
  companies.forEach((c) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <a class="card-link" href="local.html?slug=${c.slug}">
        <div class="card-logo">
          <img src="${c.logo}" alt="${c.name}" />
        </div>
        <h3>${c.name}</h3>
        <p>${c.desc}</p>
      </a>
    `;
    container.appendChild(card);
  });
}

function setLang(lang) {
  document.documentElement.lang = lang;
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (i18n[lang] && i18n[lang][key]) {
      el.textContent = i18n[lang][key];
    }
  });

  applyContentOverrides();

  document.querySelectorAll(".lang button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  if (datepickerApi) {
    datepickerApi.refresh();
  }
  renderNewsAndFaq();
}

async function loadContent() {
  try {
    const res = await fetch("/api/content");
    const data = await res.json();
    if (data.ok) {
      contentCache = data.data || {};
      applyContentOverrides();
    }
  } catch {
    // ignore
  }
}

function applyContentOverrides() {
  document.querySelectorAll("[data-content-key]").forEach((el) => {
    const key = el.getAttribute("data-content-key");
    const langKey = `${key}_${currentLang}`;
    if (contentCache[langKey]) {
      el.textContent = contentCache[langKey];
      return;
    }
    if (contentCache[key]) {
      el.textContent = contentCache[key];
    }
  });
  if (contentCache.site_logo_url) {
    const logo = document.getElementById("siteLogo");
    if (logo) logo.src = contentCache.site_logo_url;
  }
  if (contentCache.hero_image_url) {
    document.documentElement.style.setProperty(
      "--hero-image",
      `url(\"${contentCache.hero_image_url}\")`
    );
  }
  renderNewsAndFaq();
  renderGallery();
}

function renderNewsAndFaq() {
  const newsEl = document.getElementById("newsList");
  const faqEl = document.getElementById("faqList");

  if (newsEl) {
    const key = `news_items_${currentLang}`;
    const raw = contentCache[key] || "";
    const items = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    newsEl.innerHTML = items.length
      ? items.map((t) => `<div class="card">${t}</div>`).join("")
      : `<div class="card">${i18n[currentLang].news_empty}</div>`;
  }

  if (faqEl) {
    const key = `faq_items_${currentLang}`;
    const raw = contentCache[key] || "";
    const items = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    faqEl.innerHTML = items.length
      ? items
          .map(
            (t) =>
              `<details class="faq-item"><summary>${t.split("|")[0].trim()}</summary><p>${(t.split("|")[1] || "").trim()}</p></details>`
          )
          .join("")
      : `<div class="card">${i18n[currentLang].faq_empty}</div>`;
  }
}

renderCompanies();

function renderGallery() {
  const grid = document.getElementById("galeriaGrid");
  if (!grid) return;
  const raw = contentCache.gallery_images || "";
  const urls = raw.split("\n").map(s => s.trim()).filter(Boolean);
  if (!urls.length) {
    grid.innerHTML = "";
    return;
  }
  grid.innerHTML = urls.map(url =>
    `<img src="${url}" alt="Foto del local" loading="lazy" />`
  ).join("");
}

// ── Selector de locales ───────────────────────────────────────────────────────

const RESERVA_LOCALS = [
  { value: "La Tapeta - Blanes",           name: "La Tapeta",        sub: "Blanes" },
  { value: "La Tapeta - Lloret",           name: "La Tapeta",        sub: "Lloret de Mar" },
  { value: "La Tapeta - Girona",           name: "La Tapeta",        sub: "Girona" },
  { value: "Cooperativa - Blanes",         name: "Cooperativa",      sub: "Blanes" },
  { value: "Can Mateu - Tordera",          name: "Can Mateu",        sub: "Tordera" },
  { value: "La Tapa Ibérica - Tordera",    name: "La Tapa Ibérica",  sub: "Tordera" },
  { value: "Botiga d'en Mateu - Tordera",  name: "Botiga d'en Mateu",sub: "Tordera" },
];

function renderLocalPicker() {
  const grid = document.getElementById("localGrid");
  if (!grid) return;
  grid.innerHTML = RESERVA_LOCALS.map((l) => `
    <button type="button" class="local-chip" data-value="${l.value}">
      <span class="chip-name">${l.name}</span>
      <span class="chip-sub">${l.sub}</span>
    </button>`).join("");

  grid.querySelectorAll(".local-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      grid.querySelectorAll(".local-chip").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      document.getElementById("localValue").value = btn.dataset.value;
    });
  });
}

renderLocalPicker();

// ── Stepper de personas ────────────────────────────────────────────────────────

let personasCount = 2;

function updateStepper() {
  document.getElementById("personasDisplay").textContent = personasCount;
  document.getElementById("personasValue").value = personasCount;
}

document.getElementById("personasMinus")?.addEventListener("click", () => {
  if (personasCount > 1) { personasCount--; updateStepper(); }
});
document.getElementById("personasPlus")?.addEventListener("click", () => {
  if (personasCount < 20) { personasCount++; updateStepper(); }
});

// ── Selector de hora por turnos ────────────────────────────────────────────────

const TIME_SLOTS = {
  "Mediodía": ["12:30","13:00","13:30","14:00","14:30","15:00","15:30"],
  "Cena":     ["19:30","20:00","20:30","21:00","21:30","22:00","22:30"]
};

function renderTimePicker() {
  const container = document.getElementById("timePicker");
  if (!container) return;
  container.innerHTML = Object.entries(TIME_SLOTS).map(([label, slots]) => `
    <div class="time-section">
      <div class="time-section-label">${label}</div>
      <div class="time-pills">
        ${slots.map((t) => `<button type="button" class="time-pill" data-time="${t}">${t}</button>`).join("")}
      </div>
    </div>`).join("");

  container.querySelectorAll(".time-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".time-pill").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      document.getElementById("horaValue").value = btn.dataset.time;
    });
  });
}

renderTimePicker();

function setupDatePicker() {
  let activeInput = null;
  let activeHidden = null;
  let activeMode = "future";
  let current = new Date();
  let selectedIso = "";

  let picker = document.getElementById("datePicker");
  if (!picker) {
    picker = document.createElement("div");
    picker.id = "datePicker";
    picker.className = "datepicker hidden";
    picker.innerHTML = `
      <div class="dp-head">
        <button class="dp-nav" data-dir="-1" aria-label="Mes anterior">‹</button>
        <div class="dp-title" id="dpTitle"></div>
        <button class="dp-nav" data-dir="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="dp-grid" id="dpWeekdays"></div>
      <div class="dp-grid" id="dpDays"></div>
    `;
    document.body.appendChild(picker);
  }

  const dpTitle = picker.querySelector("#dpTitle");
  const dpWeekdays = picker.querySelector("#dpWeekdays");
  const dpDays = picker.querySelector("#dpDays");

  function refreshWeekdays() {
    const locale = i18nDates[currentLang] || i18nDates.es;
    dpWeekdays.innerHTML = locale.weekdays
      .map((d) => `<div class="dp-weekday">${d}</div>`)
      .join("");
  }

  refreshWeekdays();

  function formatDisplay(date) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  function formatIso(date) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
  }

  function setSelected(date) {
    selectedIso = formatIso(date);
    if (activeInput) activeInput.value = formatDisplay(date);
    if (activeHidden) activeHidden.value = selectedIso;
  }

  function isDisabled(date) {
    if (activeMode !== "future") return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  }

  function renderCalendar() {
    const year = current.getFullYear();
    const month = current.getMonth();
    const locale = i18nDates[currentLang] || i18nDates.es;
    dpTitle.textContent = `${locale.months[month]} ${year}`;

    const first = new Date(year, month, 1);
    const startDay = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysPrev = new Date(year, month, 0).getDate();

    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const dayNum = i - startDay + 1;
      let date;
      let muted = false;
      if (dayNum < 1) {
        date = new Date(year, month - 1, daysPrev + dayNum);
        muted = true;
      } else if (dayNum > daysInMonth) {
        date = new Date(year, month + 1, dayNum - daysInMonth);
        muted = true;
      } else {
        date = new Date(year, month, dayNum);
      }
      const iso = formatIso(date);
      const selected = iso === selectedIso ? "selected" : "";
      const mutedClass = muted ? "muted" : "";
      const disabled = isDisabled(date) ? "disabled" : "";
      const disabledAttr = isDisabled(date) ? "disabled" : "";
      cells.push(
        `<button class="dp-day ${mutedClass} ${selected} ${disabled}" data-iso="${iso}" ${disabledAttr}>${date.getDate()}</button>`
      );
    }
    dpDays.innerHTML = cells.join("");
  }

  function openPicker(input) {
    activeInput = input;
    activeHidden = document.getElementById(
      input.getAttribute("data-date-input") + "Value"
    );
    activeMode = input.getAttribute("data-date-mode") || "future";

    const existing = activeHidden && activeHidden.value;
    if (existing) {
      const [y, m, d] = existing.split("-").map((n) => Number(n));
      current = new Date(y, m - 1, d);
      selectedIso = existing;
    } else {
      current = new Date();
      selectedIso = formatIso(current);
    }

    renderCalendar();

    const rect = input.getBoundingClientRect();
    picker.style.top = `${rect.bottom + window.scrollY + 8}px`;
    picker.style.left = `${Math.min(
      rect.left + window.scrollX,
      window.scrollX + window.innerWidth - 300
    )}px`;
    picker.classList.remove("hidden");
  }

  function closePicker() {
    picker.classList.add("hidden");
    activeInput = null;
    activeHidden = null;
  }

  picker.addEventListener("click", (e) => {
    const btn = e.target.closest(".dp-nav");
    if (btn) {
      const dir = Number(btn.getAttribute("data-dir"));
      current = new Date(current.getFullYear(), current.getMonth() + dir, 1);
      renderCalendar();
      return;
    }
    const day = e.target.closest(".dp-day");
    if (day) {
      if (day.hasAttribute("disabled")) return;
      const iso = day.getAttribute("data-iso");
      const [y, m, d] = iso.split("-").map((n) => Number(n));
      setSelected(new Date(y, m - 1, d));
      closePicker();
    }
  });

  document.addEventListener("click", (e) => {
    if (!picker.contains(e.target) && !e.target.matches("[data-date-input]")) {
      closePicker();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePicker();
  });

  document.querySelectorAll("[data-date-input]").forEach((input) => {
    input.addEventListener("click", () => openPicker(input));
  });

  window.addEventListener("resize", () => {
    if (activeInput) openPicker(activeInput);
  });

  datepickerApi = {
    refresh: () => {
      refreshWeekdays();
      if (!picker.classList.contains("hidden")) renderCalendar();
    }
  };
}

setupDatePicker();

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

const popup = document.getElementById("leadPopup");
const closePopup = document.getElementById("closePopup");
const POPUP_KEY = "lead_popup_next";
const POPUP_DONE_KEY = "lead_submitted";
const POPUP_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 horas

function shouldShowPopup() {
  if (localStorage.getItem(POPUP_DONE_KEY)) return false;
  const next = Number(localStorage.getItem(POPUP_KEY) || "0");
  return Date.now() > next;
}

function markPopupSeen() {
  localStorage.setItem(POPUP_KEY, String(Date.now() + POPUP_COOLDOWN_MS));
}

function markLeadSubmitted() {
  localStorage.setItem(POPUP_DONE_KEY, "1");
  localStorage.removeItem(POPUP_KEY);
}

if (shouldShowPopup()) {
  setTimeout(() => {
    popup.classList.add("show");
  }, 1200);
  markPopupSeen();
}

closePopup.addEventListener("click", () => {
  popup.classList.remove("show");
});

popup.addEventListener("click", (e) => {
  if (e.target === popup) {
    popup.classList.remove("show");
  }
});

const leadForm = document.getElementById("leadForm");
const leadMsg = document.getElementById("leadMsg");

leadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  leadMsg.textContent = "";
  const formData = new FormData(leadForm);
  const payload = Object.fromEntries(formData.entries());

  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.ok) {
    markLeadSubmitted();
    leadMsg.textContent = `Premio confirmado: ${data.premio}`;
    leadForm.reset();
    setTimeout(() => popup.classList.remove("show"), 2500);
  } else {
    leadMsg.textContent = "No se pudo guardar. Inténtalo de nuevo.";
  }
});

const reservaForm = document.getElementById("reservaForm");
const reservaMsg = document.getElementById("reservaMsg");

reservaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  reservaMsg.textContent = "";
  const formData = new FormData(reservaForm);
  const payload = Object.fromEntries(formData.entries());

  if (!payload.local) {
    reservaMsg.textContent = "Selecciona un local.";
    return;
  }
  if (!payload.dia) {
    reservaMsg.textContent = "Selecciona una fecha.";
    return;
  }
  if (!payload.hora) {
    reservaMsg.textContent = "Selecciona una hora.";
    return;
  }

  const res = await fetch("/api/reservas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.ok) {
    reservaMsg.textContent = `✓ Reserva confirmada · ${payload.local} · ${payload.dia} a las ${payload.hora}`;
    reservaForm.reset();
    document.getElementById("localGrid").querySelectorAll(".local-chip").forEach((b) => b.classList.remove("selected"));
    document.getElementById("localValue").value = "";
    document.getElementById("timePicker").querySelectorAll(".time-pill").forEach((b) => b.classList.remove("selected"));
    document.getElementById("horaValue").value = "";
    personasCount = 2; updateStepper();
  } else {
    reservaMsg.textContent = data.error || "No se pudo confirmar la reserva.";
  }
});

const savedLang = localStorage.getItem(LANG_KEY) || "es";
setLang(savedLang);
loadContent();

async function loadJobs() {
  const list = document.getElementById("jobsList");
  if (!list) return;
  const res = await fetch("/api/hr/jobs");
  const data = await res.json();
  if (!data.ok || data.data.length === 0) {
    list.innerHTML = `<div class="card">Pronto: nuevas vacantes.</div>`;
    return;
  }
  list.innerHTML = data.data
    .map(
      (j) => `
      <div class="card">
        <strong>${j.titulo}</strong><br />
        ${j.local} · ${j.tipo}<br />
        <span class="muted">${j.descripcion}</span>
      </div>
    `
    )
    .join("");
}

loadJobs();

const hrForm = document.getElementById("hrForm");
const hrMsg = document.getElementById("hrMsg");
if (hrForm) {
  hrForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hrMsg.textContent = "";
    const formData = new FormData(hrForm);
    const res = await fetch("/api/hr/applications", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (data.ok) {
      hrMsg.textContent = "Candidatura enviada. Gracias.";
      hrForm.reset();
    } else {
      hrMsg.textContent = "No se pudo enviar. Inténtalo de nuevo.";
    }
  });
}

document.querySelectorAll(".lang button").forEach((btn) => {
  btn.addEventListener("click", () => setLang(btn.dataset.lang));
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
  setTimeout(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, 0);
});

let editModeEnabled = false;

if (window.top !== window) {
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg && msg.type === "edit-mode") {
      editModeEnabled = !!msg.enabled;
      document.documentElement.classList.toggle("edit-mode", editModeEnabled);
      document.querySelectorAll("[data-content-key]").forEach((el) => {
        el.contentEditable = editModeEnabled ? "true" : "false";
        if (!editModeEnabled) el.removeAttribute("data-edited");
      });
    }
  });

  document.addEventListener("click", (e) => {
    if (!editModeEnabled) return;
    const target = e.target;
    const editable = target.closest("[data-content-key], [data-edit-key]");
    if (!editable) return;
    if (target.closest("a, button")) {
      e.preventDefault();
    }
    const key = editable.getAttribute("data-content-key") || editable.getAttribute("data-edit-key");
    if (!key) return;
    if (editable.hasAttribute("data-edit-key") && !editable.hasAttribute("data-content-key")) {
      if (key === "hero_image_url") {
        const next = window.prompt("Nueva URL de imagen de fondo:", "");
        if (next) {
          document.documentElement.style.setProperty("--hero-image", `url(\"${next}\")`);
          window.parent.postMessage(
            { type: "edit-update", key, lang: currentLang, value: next },
            "*"
          );
        }
      } else if (key === "site_logo_url") {
        const next = window.prompt("Nueva URL del logo:", "");
        if (next) {
          const logo = document.getElementById("siteLogo");
          if (logo) logo.src = next;
          window.parent.postMessage(
            { type: "edit-update", key, lang: currentLang, value: next },
            "*"
          );
        }
      }
      return;
    }
    window.parent.postMessage(
      {
        type: "edit-select",
        key,
        lang: currentLang,
        enabled: editModeEnabled
      },
      "*"
    );
  });

  document.addEventListener("input", (e) => {
    if (!editModeEnabled) return;
    const editable = e.target.closest("[data-content-key]");
    if (!editable) return;
    editable.setAttribute("data-edited", "true");
    const key = editable.getAttribute("data-content-key");
    const value = editable.textContent.trim();
    window.parent.postMessage(
      { type: "edit-update", key, lang: currentLang, value },
      "*"
    );
  });
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (e) => {
    const targetId = link.getAttribute("href");
    if (!targetId || targetId === "#") return;
    const el = document.querySelector(targetId);
    if (!el) return;
    e.preventDefault();
    const offset = 70;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: "smooth" });
  });
});
