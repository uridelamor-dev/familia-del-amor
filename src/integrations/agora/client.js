// AgoraClient — cliente REAL de la web de administración de Ágora para UN establecimiento.
// Mecánica confirmada (2026-08) contra el TPV en vivo:
//   1) GET  {host}/version/           → versión del servidor (var AGORA_VERSION = 'X.Y.Z').
//   2) POST {host}/auth/  LoginRequest {UserName, UserPassword} → cookie de sesión "auth-token".
//   3) POST {host}/bus/   GetAllPosGroupsRequest                → IDs de grupos de TPV.
//   4) POST {host}/bus/   GetGlobalSalesReportRequest {From,To,PosGroupsIds} → líneas de venta.
// El "message bus" exige que Sender.ApplicationVersion coincida con la versión del servidor.
// Autenticación por cookie de sesión (la API-Token de Haddock es otra API no accesible aquí).

import { agregarVentasPorDia, parseAgoraVersion, extraerPosGroupIds } from "./mappers.js";

const APP_NAME = "AgoraWebAdmin";

export function createAgoraClient(cfg, { fetchFn = fetch } = {}) {
  const base = String(cfg.host || "").replace(/\/+$/, "");
  let cookie = cfg.cookie || null;
  let version = cfg.version || null;
  let posGroups = Array.isArray(cfg.posGroupsIds) && cfg.posGroupsIds.length ? cfg.posGroupsIds : null;
  let familias = null;
  let categorias = null;

  const sender = (v) => ({ ApplicationName: APP_NAME, ApplicationVersion: v, LanguageCode: "es", MachineType: 4, MachineName: "Web Device", UserName: cfg.usuario || "" });
  const envelope = (clrType, extra, v) => JSON.stringify({ CLRType: clrType, Message: { CLRType: clrType, IsBlocking: true, OutOfBandMessages: [], Sender: sender(v), ...extra } });

  async function getVersion() {
    if (version) return version;
    try {
      const r = await fetchFn(base + "/version/", {});
      version = parseAgoraVersion(await r.text());
    } catch { version = "8.7.4"; }
    return version;
  }

  async function login() {
    const v = await getVersion();
    const body = JSON.stringify({
      CLRType: "IGT.POS.Bus.Security.Messages.LoginRequest",
      Message: { CLRType: "IGT.POS.Bus.Security.Messages.LoginRequest", IsBlocking: true, OutOfBandMessages: [], Sender: sender(v), UserName: cfg.usuario, UserPassword: cfg.password, DefaultLanguageCode: "es", RememberMe: true, RestorePreviousSession: false },
    });
    const r = await fetchFn(base + "/auth/", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body });
    if (!r.ok) throw new Error("login_" + r.status);
    const sc = r.headers.get("set-cookie") || "";
    const m = sc.match(/auth-token=[^;]+/);
    if (!m) throw new Error("login_sin_cookie");
    cookie = m[0];
    return true;
  }

  async function busRaw(clrType, extra) {
    const v = await getVersion();
    const headers = { "Content-Type": "application/json; charset=utf-8" };
    if (cookie) headers.Cookie = cookie;
    return fetchFn(base + "/bus/", { method: "POST", headers, body: envelope(clrType, extra, v) });
  }

  // POST al bus con JSON de vuelta; si la sesión caducó (401) reintenta tras re-login.
  async function busJson(clrType, extra) {
    if (!cookie) await login();
    let r = await busRaw(clrType, extra);
    if (r.status === 401) { await login(); r = await busRaw(clrType, extra); }
    if (!r.ok) { let t = ""; try { t = await r.text(); } catch { /* noop */ } throw new Error(`bus_${r.status}:${String(t).slice(0, 140)}`); }
    return r.json();
  }

  async function getPosGroups() {
    if (posGroups) return posGroups;
    const j = await busJson("IGT.POS.Bus.SystemManagement.Messages.GetAllPosGroupsRequest", {});
    posGroups = extraerPosGroupIds(j);
    return posGroups;
  }

  // IDs de TODAS las familias (varios informes filtran por familias: [] = ninguna, hay que darlas todas).
  async function getFamilias() {
    if (familias) return familias;
    const j = await busJson("IGT.POS.Bus.SystemManagement.Messages.GetAllFamiliesRequest", {});
    const all = (j && j.Message && Array.isArray(j.Message.All)) ? j.Message.All : [];
    familias = all.map((f) => f && f.Id).filter((x) => x != null);
    return familias;
  }
  // IDs de TODAS las categorías (el informe de cancelaciones filtra por categorías: [] da error SQL).
  async function getCategorias() {
    if (categorias) return categorias;
    const j = await busJson("IGT.POS.Bus.SystemManagement.Messages.GetAllCategoriesRequest", {});
    const all = (j && j.Message && Array.isArray(j.Message.All)) ? j.Message.All : [];
    categorias = all.map((c) => c && c.Id).filter((x) => x != null);
    return categorias;
  }

  return {
    local: cfg.local,

    // Ejecuta un mensaje de informe del bus (login/re-login automáticos) y devuelve el JSON crudo.
    async informe(clrType, extra = {}) { return busJson(clrType, extra); },
    async posGroups() { return getPosGroups(); },
    async familiaIds() { return getFamilias(); },
    async categoriaIds() { return getCategorias(); },

    // ¿El servidor del TPV responde? (basta /version/, sin sesión). Alive = el local está abierto.
    async ping(timeoutMs = 6000) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try { await fetchFn(base + "/version/", { signal: ctrl.signal }); return true; }
      catch { return false; }
      finally { clearTimeout(timer); }
    },

    // Ventas agregadas por día en el rango [desde, hasta) (YYYY-MM-DD). Login + grupos automáticos.
    async getVentasRango(desde, hasta) {
      const groups = await getPosGroups();
      const j = await busJson("IGT.POS.Bus.Reporting.Messages.GetGlobalSalesReportRequest", {
        From: desde + "T00:00:00.000",
        To: hasta + "T00:00:00.000",
        PosGroupsIds: groups,
      });
      const sales = (j && j.Message && j.Message.Report && j.Message.Report.Sales) || [];
      return agregarVentasPorDia(sales);
    },
  };
}
