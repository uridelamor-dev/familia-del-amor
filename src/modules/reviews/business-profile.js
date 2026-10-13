// Cliente de reseñas Business Profile. No publica nada durante la sincronización.
const API = 'https://mybusiness.googleapis.com/v4/';
export const esNombreResena = name => /^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+\/reviews\/[A-Za-z0-9_-]+$/.test(String(name || ''));
export function clienteBusinessProfile({ token, fetchImpl = fetch }) {
  async function pedir(url, options = {}) {
    const res = await fetchImpl(url, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(`Google Business Profile: HTTP ${res.status}`);
    return data;
  }
  async function paginas(url, campo) {
    const out = [], vistos = new Set();
    let pageToken = '';
    do {
      const u = new URL(url);
      if (pageToken) u.searchParams.set('pageToken', pageToken);
      const data = await pedir(u.toString());
      if (!Array.isArray(data[campo]) && data[campo] != null) throw new Error('Respuesta de Google no reconocida');
      out.push(...(data[campo] || []));
      pageToken = data.nextPageToken || '';
      if (pageToken && vistos.has(pageToken)) throw new Error('Google ha repetido una página');
      vistos.add(pageToken);
    } while (pageToken);
    return out;
  }
  return {
    async ubicaciones() {
      const cuentas = await paginas('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', 'accounts');
      const out = [];
      for (const cuenta of cuentas) {
        if (!/^accounts\/[A-Za-z0-9_-]+$/.test(cuenta.name)) throw new Error('Cuenta de Google inválida');
        const locations = await paginas(`https://mybusinessbusinessinformation.googleapis.com/v1/${cuenta.name}/locations?readMask=name,title,storefrontAddress,metadata&pageSize=100`, 'locations');
        for (const loc of locations) out.push({ ...loc, account: cuenta.name });
      }
      return { accounts: cuentas.length, locations: out };
    },
    async resenas(loc) {
      const parent = `${loc.account}/${loc.name}`;
      if (!/^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+$/.test(parent)) throw new Error('Ficha de Google inválida');
      const rows = await paginas(`${API}${parent}/reviews?pageSize=50`, 'reviews');
      return rows.map(r => {
        const name = `${parent}/reviews/${r.reviewId}`;
        if (!esNombreResena(name)) throw new Error('Reseña de Google inválida');
        return { ...r, name };
      });
    },
    async leer(name) {
      if (!esNombreResena(name)) throw new Error('Reseña de Google inválida');
      return pedir(`${API}${name}`);
    },
    async publicar(name, comment) {
      if (!esNombreResena(name)) throw new Error('Esta reseña necesita sincronizarse con Business Profile');
      if (typeof comment !== 'string' || !comment.trim() || comment.length > 4096) throw new Error('La respuesta debe tener entre 1 y 4096 caracteres');
      const data = await pedir(`${API}${name}/reply`, { method: 'PUT', body: JSON.stringify({ comment: comment.trim() }) });
      if (data.comment !== comment.trim() || !data.updateTime) throw new Error('Google no confirmó la respuesta. Actualiza las reseñas antes de repetirla');
      return data;
    }
  };
}
