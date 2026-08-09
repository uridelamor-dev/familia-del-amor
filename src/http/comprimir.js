// Compresión gzip sin dependencias.
//
// Por qué existe: `app.js` pesa 474 KB y `index.html` 52 KB, y salían tal cual por el cable.
// Comprimidos son 126 KB y 13 KB — la cuarta parte. No se puede instalar el paquete
// `compression` (npm install no funciona aquí), así que se usa `zlib`, que viene con Node.
//
// La decisión de comprimir o no es una función pura (`debeComprimir`) y es lo que se prueba;
// el middleware solo enchufa esa decisión a la respuesta.

import zlib from "node:zlib";

// text/* entero, más los que son texto pero no lo parecen por el nombre.
const TIPOS = [/^text\//i, /^application\/(javascript|json|xml|manifest\+json)/i, /^image\/svg\+xml/i, /\+json\b/i, /\+xml\b/i];

/** Umbral por debajo del cual comprimir cuesta más de lo que ahorra (una cabecera gzip son 20 bytes). */
export const UMBRAL = 1024;

/** ¿El navegador acepta gzip? Acepta `gzip`, `gzip;q=0.8`, `*`; rechaza `gzip;q=0`. */
export function aceptaGzip(cabecera) {
  if (!cabecera) return false;
  for (const parte of String(cabecera).split(",")) {
    const [nombre, ...params] = parte.trim().split(";");
    const n = nombre.trim().toLowerCase();
    if (n !== "gzip" && n !== "*") continue;
    const q = params.map((p) => p.trim().toLowerCase()).find((p) => p.startsWith("q="));
    if (q && Number(q.slice(2)) === 0) continue; // `gzip;q=0` es un NO explícito
    return true;
  }
  return false;
}

export const tipoComprimible = (contentType) => {
  const t = String(contentType || "").split(";")[0].trim();
  return !!t && TIPOS.some((re) => re.test(t));
};

/**
 * Decide si esta respuesta concreta se comprime. Pura: no toca nada.
 * @param {{metodo:string, aceptaEncoding:string, contentType:string, contentEncoding?:string,
 *          cacheControl?:string, bytes:number, codigo?:number}} r
 */
export function debeComprimir(r) {
  const metodo = String(r.metodo || "GET").toUpperCase();
  if (metodo === "HEAD") return false;             // sin cuerpo que comprimir
  if (r.codigo === 204 || r.codigo === 304) return false; // tampoco tienen cuerpo
  if (r.contentEncoding) return false;             // ya viene comprimido (una imagen, un zip)
  if (/\bno-transform\b/i.test(r.cacheControl || "")) return false; // nos han pedido no tocarlo
  if (!aceptaGzip(r.aceptaEncoding)) return false;
  if (!tipoComprimible(r.contentType)) return false;
  return r.bytes >= UMBRAL;
}

/**
 * Middleware. Acumula el cuerpo y lo comprime al cerrar.
 *
 * Acumular en memoria es aceptable AQUÍ porque solo se acumula lo que ya sabemos que es texto
 * comprimible: HTML, JS, CSS y JSON de la API. Las fotos, los PDF y las subidas no pasan por el
 * acumulador — se detectan por Content-Type en el primer write y se dejan ir directas. Aun así
 * hay un tope: si un JSON supera `maxBuffer` se suelta sin comprimir en vez de tragarse la RAM.
 */
export function comprimir({ maxBuffer = 8 * 1024 * 1024 } = {}) {
  return function (req, res, next) {
    const acepta = req.headers["accept-encoding"];
    const metodo = String(req.method || "GET").toUpperCase();
    if (metodo === "HEAD" || !aceptaGzip(acepta)) return next();

    const write = res.write.bind(res), end = res.end.bind(res);
    let trozos = null;   // null = todavía no decidido; false = pasar de largo
    let acumulado = 0;

    /** Se llama en el primer write/end, cuando el Content-Type ya está puesto. */
    const decidir = () => {
      if (trozos !== null) return;
      const pasar = () => { trozos = false; };
      if (res.getHeader("Content-Encoding")) return pasar();
      if (!tipoComprimible(res.getHeader("Content-Type"))) return pasar();
      if (/\bno-transform\b/i.test(String(res.getHeader("Cache-Control") || ""))) return pasar();
      if (res.statusCode === 204 || res.statusCode === 304) return pasar();
      trozos = [];
    };

    const aBuffer = (c, enc) => (Buffer.isBuffer(c) ? c : Buffer.from(String(c), enc || "utf8"));

    /** Suelta lo acumulado sin comprimir y se aparta: para cuerpos enormes. */
    const rendirse = () => {
      const pendiente = trozos;
      trozos = false;
      for (const b of pendiente) write(b);
    };

    res.write = function (chunk, enc, cb) {
      decidir();
      if (trozos === false || chunk == null) return write(chunk, enc, cb);
      const b = aBuffer(chunk, enc);
      acumulado += b.length;
      if (acumulado > maxBuffer) { rendirse(); return write(b, undefined, cb); }
      trozos.push(b);
      if (typeof enc === "function") enc();
      else if (typeof cb === "function") cb();
      return true;
    };

    res.end = function (chunk, enc, cb) {
      if (typeof chunk === "function") { cb = chunk; chunk = undefined; }
      else if (typeof enc === "function") { cb = enc; enc = undefined; }
      decidir();
      if (trozos === false) return end(chunk, enc, cb);
      if (chunk != null) trozos.push(aBuffer(chunk, enc));
      const cuerpo = Buffer.concat(trozos);

      if (!debeComprimir({
        metodo, aceptaEncoding: acepta, contentType: res.getHeader("Content-Type"),
        contentEncoding: res.getHeader("Content-Encoding"), cacheControl: res.getHeader("Cache-Control"),
        bytes: cuerpo.length, codigo: res.statusCode,
      })) { trozos = false; return end(cuerpo.length ? cuerpo : undefined, undefined, cb); }

      // `Vary` es obligatorio: sin él, una caché intermedia puede servir el cuerpo gzip a un
      // cliente que no lo acepta, y ese cliente ve basura binaria.
      res.setHeader("Vary", [...new Set(String(res.getHeader("Vary") || "").split(",").map((s) => s.trim()).filter(Boolean).concat("Accept-Encoding"))].join(", "));

      zlib.gzip(cuerpo, { level: zlib.constants.Z_DEFAULT_COMPRESSION }, (err, gz) => {
        trozos = false;
        if (err || gz.length >= cuerpo.length) { // si no ahorra, no se manda comprimido
          res.setHeader("Content-Length", String(cuerpo.length));
          return end(cuerpo, undefined, cb);
        }
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Content-Length", String(gz.length));
        end(gz, undefined, cb);
      });
      return res;
    };

    next();
  };
}
