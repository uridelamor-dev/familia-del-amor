async function loadAnnouncements() {
  const list = document.getElementById("annList");
  if (!list) return;
  const res = await fetch("/api/announcements?rol=trabajadores");
  const data = await res.json();
  if (!data.ok || data.data.length === 0) {
    list.innerHTML = "<div class=\"card\">Sin comunicados.</div>";
    return;
  }
  list.innerHTML = data.data
    .map((a) => `<div class=\"card\">${a.mensaje}</div>`)
    .join("");
}

loadAnnouncements();
