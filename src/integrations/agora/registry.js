// Configuración de Ágora POR ESTABLECIMIENTO, leída del entorno (Replit Secrets).
// Una única variable JSON para todo el grupo, fácil de mantener:
//
//   AGORA_LOCALES = [
//     { "local": "La Tapeta - Blanes", "host": "latapetablanes.chickenkiller.com:8984", "token": "<apiToken>", "localId": "" },
//     { "local": "La Tapeta - Lloret",  "host": "...:8984", "token": "<apiToken>" },
//     ...
//   ]
//
// - "local" DEBE coincidir con el nombre canónico del establecimiento (establecimientos.local_text).
// - "host" admite con o sin http:// y con puerto; se normaliza a http://host:puerto.
// - "token" es el apiToken de Ágora (Módulos Adicionales) — NUNCA se hardcodea ni se imprime.
// - "localId" opcional (solo si el TPV tiene ACMS / varios locales).
// - "activo": false desactiva ese local sin borrarlo.
//
// Añadir un establecimiento = añadir una entrada al JSON. Nada de código.

function normHost(h) {
  h = String(h || "").trim();
  if (!h) return "";
  if (!/^https?:\/\//i.test(h)) h = "http://" + h;
  return h.replace(/\/+$/, "");
}

export function loadAgoraConfigs(env) {
  const src = env || (typeof process !== "undefined" ? process.env : {});
  const raw = src && src.AGORA_LOCALES;
  if (!raw) return [];
  let arr;
  try { arr = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((c) => c && c.local && c.host && c.token && c.activo !== false)
    .map((c) => ({
      local: String(c.local).trim(),
      host: normHost(c.host),
      token: String(c.token),
      localId: c.localId != null && c.localId !== "" ? String(c.localId) : null,
    }))
    .filter((c) => c.host);
}

// Vista segura para exponer estado por API: nunca incluye el token.
export function publicConfig(cfg) {
  return { local: cfg.local, host: cfg.host, localId: cfg.localId || null };
}
