import { normHost } from './registry.js';

const nombre = value => typeof value === 'string' ? value.trim() : '';
const centimos = value => {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const numero = Math.round(Number(value) * 100);
  return Number.isSafeInteger(numero) ? numero : null;
};

function saldo(ticket) {
  const total = centimos(ticket.Totals?.GrossAmount);
  if (total === null || total < 0 || !Array.isArray(ticket.Payments)) return null;
  let pendiente = total;
  for (const pago of ticket.Payments) {
    if (pago?.Canceled === true || pago?.Cancelled === true) continue;
    const importe = centimos(pago?.Amount);
    // En la exportación documentada los prepagos reducen el saldo con Amount negativo.
    // Un importe positivo en un ticket abierto necesita contraste con el TPV.
    if (importe === null || importe > 0) return null;
    pendiente += importe;
  }
  return Math.max(0, pendiente);
}

function tipoUbicacion(centro, ubicacion) {
  const area = nombre(centro?.Name);
  if (centro?.StartTakeOutOrder || /delivery|llevar|takeaway/i.test(area)) return 'otras';
  if (/\bbarra\b/i.test(area) || /^barra\b/i.test(ubicacion)) return 'barra';
  if (ubicacion && (/\b(mesas?|sala|sal[oó]n|terraza|comedor)\b/i.test(area) || /^\d+$/.test(ubicacion))) return 'mesas';
  return 'otras';
}

export function resumirOcupacion(respuesta, maestro) {
  const origen = Array.isArray(respuesta) ? respuesta : respuesta?.Tickets;
  if (!Array.isArray(origen) || origen.some(t => !t || typeof t !== 'object' || Array.isArray(t))) return null;
  const centros = new Map(
    (Array.isArray(maestro?.SaleCenters) ? maestro.SaleCenters : [])
      .filter(c => c && !c.DeletionDate && c.Id != null)
      .map(c => [String(c.Id), c])
  );
  const ubicaciones = new Map();
  for (const [id, centro] of centros) {
    if (centro.StartTakeOutOrder) continue;
    for (const lugar of (Array.isArray(centro.SaleLocations) ? centro.SaleLocations : [])) {
      const ubicacion = nombre(lugar?.Name);
      if (ubicacion) ubicaciones.set(JSON.stringify([id, ubicacion]), tipoUbicacion(centro, ubicacion));
    }
  }
  const vistos = new Set();
  const ocupadas = new Map();
  const centrosActivos = new Map();
  const tickets = [];
  for (const t of origen) {
    if (t.Canceled === true || t.Cancelled === true || t.CancellationDate ||
       ['cancelled', 'canceled', 'voided'].includes(nombre(t.Status).toLowerCase())) continue;
    const uuid = nombre(t.GlobalId);
    if (uuid && vistos.has(uuid)) continue;
    if (uuid) vistos.add(uuid);
    const id = t.SaleCenter?.Id == null ? '' : String(t.SaleCenter.Id);
    const ubicacion = nombre(t.SaleCenter?.Location);
    const centro = centros.get(id) || t.SaleCenter;
    const clave = JSON.stringify([id, ubicacion]);
    const zona = ubicaciones.get(clave) ?? tipoUbicacion(centro, ubicacion);
    const cuentaUbicacion = id && ubicacion && !centro?.StartTakeOutOrder
      && (!centros.has(id) || ubicaciones.has(clave));
    if (cuentaUbicacion) ocupadas.set(clave, zona);
    const nombreCentro = nombre(centro?.Name);
    const caja = centrosActivos.get(id) || { nombre:nombreCentro, ubicaciones:new Set(), tickets:[] };
    const ticket = { centro:nombreCentro, ubicacion:ubicaciones.has(clave) ? ubicacion : '',
      zona, pendienteCentimos:saldo(t) };
    if (cuentaUbicacion) caja.ubicaciones.add(clave);
    caja.tickets.push(ticket);
    centrosActivos.set(id,caja);
    tickets.push(ticket);
  }
  const cuenta = (filas, zona) => [...filas.values()].filter(value => value === zona).length;
  const zonas = Object.fromEntries(['mesas', 'barra', 'otras'].map(zona => [zona, {
    ocupadas: cuenta(ocupadas, zona), total: ubicaciones.size ? cuenta(ubicaciones, zona) : null,
  }]));
  const total = filas => filas.every(t=>t.pendienteCentimos !== null)
    ? filas.reduce((importe, t)=>importe + t.pendienteCentimos,0) : null;
  const porCentro = [...centrosActivos.values()].map(c=>({
    nombre:c.nombre, ocupadas:c.ubicaciones.size, pendienteCentimos:total(c.tickets),
  }));
  return {
    ocupadas: ocupadas.size, capacidad: ubicaciones.size && [...ocupadas.keys()].every(k => ubicaciones.has(k)) ? ubicaciones.size : null,
    zonas, tickets, porCentro, pendienteCentimos:total(tickets),
  };
}

export function crearLecturaOcupacion({ fetchFn = fetch, ahora = Date.now } = {}) {
  const cache = new Map();
  async function leer(cfg) {
    const base = normHost(cfg.host);
    const opciones = () => ({
      headers: { 'Api-Token': cfg.token, Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    const json = async ruta => {
      const res = await fetchFn(base + ruta, opciones());
      if (!res.ok) throw new Error('Ágora no disponible');
      return res.json();
    };
    const anterior = cache.get(cfg.local);
    const ts = ahora();
    if (anterior?.base === base && ts - anterior.ts < 30000) return anterior.lectura;
    const lectura = Promise.all([
      json('/api/export/tickets/'),
      json('/api/export-master/?filter=SaleCenters').catch(() => null),
    ]).then(([tickets, maestro]) => {
      const datos = resumirOcupacion(tickets, maestro);
      return datos ? { ...datos, actualizado: new Date(ahora()).toISOString() } : null;
    }).catch(() => null);
    cache.set(cfg.local, { base, ts, lectura });
    return lectura;
  }
  return async (locales, configs) => {
    const hosts = new Map();
    for (const c of configs) hosts.set(c.host, (hosts.get(c.host) || 0) + 1);
    const porLocal = await Promise.all(locales.map(async local => {
      const cfg = configs.find(c => c.local === local);
      // El listado de tickets no ofrece filtro por establecimiento de ACMS.
      const datos = cfg?.token && !cfg.localId && hosts.get(cfg.host) === 1 ? await leer(cfg) : null;
      return { local, ...datos, disponible: datos !== null };
    }));
    const ocupacion = porLocal.filter(l => l.disponible);
    const saldos = ocupacion.filter(l => l.pendienteCentimos != null);
    return {
      porLocal, cobertura: { ocupacion: ocupacion.length, saldo: saldos.length, total: locales.length },
      actualizado: ocupacion.map(l => l.actualizado).sort()[0] ?? null,
      ocupadas: ocupacion.length ? ocupacion.reduce((sum, l) => sum + l.ocupadas, 0) : null,
      pendienteCentimos: saldos.length ? saldos.reduce((sum, l) => sum + l.pendienteCentimos, 0) : null,
    };
  };
}
