// AgoraClient — cliente de la API "Servicios de Integración" de Ágora para UN establecimiento.
// Fase 1: solo LECTURA (ping + ventas por día). Las escrituras (reservas, descuentos, clientes)
// son Fase 3 y se añadirán aquí con salvaguardas.
//
// ⚠️ Los PATHS y el esquema de autenticación exactos de Ágora no son públicos: van marcados como
// TODO(agora) y se confirman con la doc del distribuidor o un script de sondeo contra un local
// abierto. La forma del cliente (métodos, timeouts, reachability) es estable; solo cambian esos
// detalles y los mappers.

import { requestJSON } from "./http.js";
import { mapVentasDia } from "./mappers.js";

export function createAgoraClient(cfg, { request = requestJSON } = {}) {
  const base = cfg.host; // ya normalizado a http://host:puerto
  // TODO(agora): confirmar cómo viaja el apiToken (cabecera 'Api-Token', 'Authorization', o query).
  const headers = { "Api-Token": cfg.token };

  return {
    local: cfg.local,

    // ¿El servidor del TPV responde? (el PC solo está encendido con el local abierto).
    // Cualquier respuesta HTTP —incluso 401/404— significa que el servidor está VIVO.
    async ping(timeoutMs = 5000) {
      try {
        await request(base + "/api/status", { headers, timeoutMs }); // TODO(agora): ruta de salud real
        return true;
      } catch (e) {
        if (e && typeof e.status === "number") return true; // respondió (aunque sea error de auth/ruta)
        return false; // timeout / conexión rechazada / DNS → apagado o inalcanzable
      }
    },

    // Ventas agregadas de un día (YYYY-MM-DD) para este local.
    async getVentasDia(dia, timeoutMs = 8000) {
      // TODO(agora): confirmar endpoint real de ventas/tickets por fecha.
      const q = `fecha=${encodeURIComponent(dia)}` + (cfg.localId ? `&local=${encodeURIComponent(cfg.localId)}` : "");
      const json = await request(`${base}/api/ventas?${q}`, { headers, timeoutMs });
      return mapVentasDia(json, { dia });
    },
  };
}
