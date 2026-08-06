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

// Normaliza y filtra una lista de configuraciones (misma forma venga del env o de la BD):
// exige local+host+token y activo!==false; normaliza host; localId opcional.
export function normalizeConfigs(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    // Válido si tiene host y credenciales de login (usuario+password) O token legado (Haddock).
    .filter((c) => c && c.local && c.host && (((c.usuario && c.password)) || c.token) && c.activo !== false)
    .map((c) => ({
      local: String(c.local).trim(),
      host: normHost(c.host),
      usuario: c.usuario != null && c.usuario !== "" ? String(c.usuario) : null,
      password: c.password != null && c.password !== "" ? String(c.password) : null,
      token: c.token != null && c.token !== "" ? String(c.token) : null,
      localId: c.localId != null && c.localId !== "" ? String(c.localId) : null,
    }))
    .filter((c) => c.host);
}

export function loadAgoraConfigs(env) {
  const src = env || (typeof process !== "undefined" ? process.env : {});
  const raw = src && src.AGORA_LOCALES;
  if (!raw) return [];
  let arr;
  try { arr = JSON.parse(raw); } catch { return []; }
  return normalizeConfigs(arr);
}

// Igual que loadAgoraConfigs pero desde filas de la BD (agora_locales).
// Cada fila: { local, host, token, local_id|localId, activo }. El token ya debe venir descifrado.
export function configsFromRows(rows) {
  return normalizeConfigs((rows || []).map((r) => ({
    local: r.local,
    host: r.host,
    usuario: r.usuario,
    password: r.password,
    token: r.token,
    localId: r.localId != null ? r.localId : r.local_id,
    activo: r.activo !== 0 && r.activo !== false,
  })));
}

// Vista segura para exponer estado por API: nunca incluye credenciales (token/password).
export function publicConfig(cfg) {
  return { local: cfg.local, host: cfg.host, localId: cfg.localId || null, usuario: cfg.usuario || null };
}
