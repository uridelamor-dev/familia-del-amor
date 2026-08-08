// Selector de fecha propio de Familia del Amor.
//
// Vivía dentro de public/app.js, que arrastra reservas, botón de WhatsApp y contenido
// editable. Al necesitarlo también en el espacio del trabajador se extrajo aquí, para que
// sea UNO solo en toda la casa en lugar de tres calendarios distintos.
//
// Uso:
//   <input type="text" data-date-input="miCampo" data-date-mode="birth" readonly>
//   <input type="hidden" id="miCampoValue" name="lo_que_sea">
// El visible muestra dd/mm/aaaa y el oculto guarda AAAA-MM-DD, que es lo que se envía.
// data-date-mode: "future" (por defecto, no deja elegir días pasados) o "birth" (permite
// el pasado y muestra selector de año).
//
// El idioma se lee de window.currentLang si existe (lo pone setLang de la web pública);
// si no, español. Los estilos (.datepicker, .dp-*) están en styles.css.

let datepickerApi = null;

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
        <div class="dp-title" id="dpTitle">
          <select id="dpMonthSel" style="font:inherit;background:transparent;border:none;cursor:pointer;font-weight:600"></select>
          <select id="dpYearSel" style="font:inherit;background:transparent;border:none;cursor:pointer;font-weight:600"></select>
        </div>
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
    const locale = i18nDates[window.currentLang] || i18nDates.es;
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

  const dpMonthSel = picker.querySelector("#dpMonthSel");
  const dpYearSel = picker.querySelector("#dpYearSel");

  function populateSelects() {
    const locale = i18nDates[window.currentLang] || i18nDates.es;
    dpMonthSel.innerHTML = locale.months.map((m, i) =>
      `<option value="${i}">${m}</option>`).join("");
    const nowYear = new Date().getFullYear();
    const minYear = activeMode === "birth" ? 1920 : nowYear;
    const maxYear = activeMode === "birth" ? nowYear : nowYear + 2;
    let yearHtml = "";
    for (let y = maxYear; y >= minYear; y--) yearHtml += `<option value="${y}">${y}</option>`;
    dpYearSel.innerHTML = yearHtml;
  }

  dpMonthSel.addEventListener("change", () => {
    current = new Date(current.getFullYear(), Number(dpMonthSel.value), 1);
    renderCalendar();
  });
  dpYearSel.addEventListener("change", () => {
    current = new Date(Number(dpYearSel.value), current.getMonth(), 1);
    renderCalendar();
  });

  function renderCalendar() {
    const year = current.getFullYear();
    const month = current.getMonth();
    dpMonthSel.value = month;
    dpYearSel.value = year;

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

    populateSelects();
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

// Arranque: se engancha a todos los [data-date-input] que haya en la página.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupDatePicker);
} else {
  setupDatePicker();
}

// Expuesto para el resto de scripts (app.js llama a datepickerApi.refresh() al cambiar idioma).
window.i18nDates = i18nDates;
window.setupDatePicker = setupDatePicker;
Object.defineProperty(window, "datepickerApi", { get: () => datepickerApi });
