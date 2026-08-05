// Sincronización de ventas de Ágora → tabla ventas_diarias. Oportunista con CATCH-UP:
// como el TPV solo responde con el local abierto, cada ciclo intenta rellenar los días que
// falten (no un único timestamp). Robusto a servidor caído: si no responde, salta y reintenta
// en el siguiente ciclo. El "estado" (los días ya guardados) ES la fuente de verdad.
//
// Recibe x = { get, all, run } (wrappers dbGet/dbAll/dbRun de server.js; placeholders `?`).

function addDays(iso, n) { const d = new Date(iso + "T00:00:00.000Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// PURO y testeable: qué días hay que traer (hasta ayer), rellenando huecos, con tope maxDias.
export function diasFaltantes(existentes, { hoy, maxDias = 90 } = {}) {
  const ayer = addDays(hoy, -1);
  const inicio = addDays(ayer, -(maxDias - 1));
  const set = existentes instanceof Set ? existentes : new Set(existentes || []);
  const out = [];
  let d = inicio;
  while (d <= ayer) {
    if (!set.has(d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

// Sincroniza un local. Devuelve { local, reachable, insertados, error? }.
export async function syncVentasLocal(x, client, cfg, { hoy, maxDias = 90 } = {}) {
  let reachable = false;
  try { reachable = await client.ping(); } catch { reachable = false; }
  if (!reachable) return { local: cfg.local, reachable: false, insertados: 0 };

  let rows = [];
  try { rows = await x.all(`SELECT dia FROM ventas_diarias WHERE local = ?`, [cfg.local]); } catch { rows = []; }
  const existentes = new Set((rows || []).map((r) => String(r.dia).slice(0, 10)));
  const faltan = diasFaltantes(existentes, { hoy, maxDias });

  let insertados = 0, ultimoError = null;
  for (const dia of faltan) {
    try {
      const v = await client.getVentasDia(dia);
      if (!v) continue;
      await x.run(
        `INSERT INTO ventas_diarias (local, dia, ventas, tickets, comensales, ticket_medio, actualizado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(local, dia) DO UPDATE SET ventas=EXCLUDED.ventas, tickets=EXCLUDED.tickets,
           comensales=EXCLUDED.comensales, ticket_medio=EXCLUDED.ticket_medio, actualizado_en=EXCLUDED.actualizado_en`,
        [cfg.local, dia, v.ventas, v.tickets, v.comensales, v.ticket_medio, new Date().toISOString()]
      );
      insertados++;
    } catch (e) { ultimoError = e && e.message ? e.message : "error"; /* sigue: se reintenta el próximo ciclo */ }
  }
  return { local: cfg.local, reachable: true, insertados, error: ultimoError };
}

// Sincroniza todos los locales configurados. makeClient(cfg) crea el AgoraClient.
// setEstado(local, resultado) guarda el estado (para /api/agora/estado); opcional.
export async function syncVentas(x, { hoy, configs, makeClient, setEstado } = {}) {
  const cfgs = configs || [];
  const resultados = [];
  for (const cfg of cfgs) {
    let r;
    try { r = await syncVentasLocal(x, makeClient(cfg), cfg, { hoy }); }
    catch (e) { r = { local: cfg.local, reachable: false, insertados: 0, error: e && e.message ? e.message : "error" }; }
    resultados.push(r);
    if (setEstado) { try { await setEstado(cfg.local, r); } catch { /* no crítico */ } }
  }
  return resultados;
}
