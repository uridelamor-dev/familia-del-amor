requireRole(["contabilidad", "direccion"]).then((user) => {
  if (!user) return;
  const exportRes = document.getElementById("exportReservas");
  if (exportRes) {
    exportRes.addEventListener("click", (e) => {
      e.preventDefault();
      const token = localStorage.getItem("token");
      const a = document.createElement("a");
      a.href = `/api/reservas/export.csv?token=${token}`;
      a.download = "reservas.csv";
      a.click();
    });
  }
});
