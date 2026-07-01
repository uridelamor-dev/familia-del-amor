requireRole(["contabilidad", "direccion"]).then((user) => {
  if (!user) return;
  const exportRes = document.getElementById("exportReservas");
  if (exportRes) {
    exportRes.addEventListener("click", async (e) => {
      e.preventDefault();
      const original = exportRes.textContent;
      exportRes.textContent = "Generando...";
      exportRes.style.pointerEvents = "none";
      try {
        // Descarga con cabecera de auth (no token en la URL) vía blob
        const res = await authFetch("/api/reservas/export.csv");
        if (!res.ok) throw new Error("Export falló");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "reservas.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast("CSV descargado", "success");
      } catch (err) {
        toast("No se pudo generar el CSV", "error");
      } finally {
        exportRes.textContent = original;
        exportRes.style.pointerEvents = "";
      }
    });
  }
});
