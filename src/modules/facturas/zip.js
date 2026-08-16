// Un ZIP escrito a mano. PURO.
//
// POR QUÉ A MANO: aquí no se pueden añadir dependencias npm, y bajar veinte facturas de una en
// una no es exportar —el navegador bloquea las descargas encadenadas y, si no las bloquea,
// deja veinte archivos sueltos en la carpeta de descargas—. Mismo caso que el PDF del cuadrante,
// que también se escribe a mano por lo mismo.
//
// SIN COMPRIMIR (método «store»). Lo que va dentro son JPG y PDF, que ya están comprimidos: el
// deflate ganaría un 2 % a cambio de traerse un compresor entero. Un ZIP «store» es cabecera,
// datos, cabecera, datos… y un índice al final; eso sí cabe en un archivo de cien líneas.
//
// Formato: APPNOTE de PKWARE, secciones 4.3.7 (cabecera local), 4.3.12 (índice) y 4.3.16 (fin).

/** Tabla del CRC-32 (polinomio 0xEDB88320). Se calcula una vez y se reutiliza. */
const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ TABLA_CRC[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

/**
 * El nombre dentro del ZIP. Se limpia porque un nombre con «/» crearía carpetas y uno con «:»
 * o «\» no se puede escribir en Windows: el archivo se descargaría y no se podría abrir.
 */
export function nombreSeguro(s, porDefecto = "documento") {
  const limpio = String(s || "")
    // Uno a uno y SIN RANGOS: un guion suelto entre corchetes se lee como rango y cambia en
    // silencio qué entra y qué no.
    .replace(/[/\\:*?"<>|]/g, " ")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return limpio || porDefecto;
}

/** Si dos facturas se llaman igual, la segunda pasa a «nombre (2).pdf»: un ZIP con dos entradas
 *  del mismo nombre se abre enseñando solo una, y la otra desaparece sin decir nada. */
export function sinRepetir(nombres) {
  const vistos = new Map();
  return nombres.map((n) => {
    const clave = n.toLowerCase();
    const veces = (vistos.get(clave) || 0) + 1;
    vistos.set(clave, veces);
    if (veces === 1) return n;
    const punto = n.lastIndexOf(".");
    return punto > 0 ? `${n.slice(0, punto)} (${veces})${n.slice(punto)}` : `${n} (${veces})`;
  });
}

// La fecha en formato MS-DOS, que es lo que guarda el ZIP: segundos en pasos de dos, y los años
// contados desde 1980. Se pasa siempre una fecha desde fuera: aquí dentro no se lee el reloj.
function fechaDos(d) {
  const y = Math.max(1980, d.getFullYear());
  return {
    hora: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31),
    fecha: (((y - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31),
  };
}

/**
 * Construye el ZIP entero en memoria.
 *
 * `archivos` = [{ nombre, datos }] con `datos` en Buffer/Uint8Array. Devuelve un Buffer.
 * Se monta entero porque son unas decenas de facturas, no un archivo de vídeo: escribirlo por
 * trozos obligaría a llevar la cuenta de los desplazamientos a mano y no compensa.
 */
export function crearZip(archivos = [], { fecha = new Date(2026, 0, 1) } = {}) {
  const { hora: hDos, fecha: fDos } = fechaDos(fecha);
  const nombres = sinRepetir(archivos.map((a) => nombreSeguro(a.nombre)));
  const trozos = [];
  const indice = [];
  let offset = 0;

  archivos.forEach((a, i) => {
    const nombre = Buffer.from(nombres[i], "utf8");
    const datos = Buffer.from(a.datos || []);
    const crc = crc32(datos);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // firma de cabecera local
    local.writeUInt16LE(20, 4);           // versión necesaria: 2.0
    local.writeUInt16LE(0x0800, 6);       // bandera: el nombre va en UTF-8
    local.writeUInt16LE(0, 8);            // método 0 = sin comprimir
    local.writeUInt16LE(hDos, 10);
    local.writeUInt16LE(fDos, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);           // sin campo extra
    trozos.push(local, nombre, datos);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);         // versión con la que se creó
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(hDos, 12);
    central.writeUInt16LE(fDos, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(datos.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt16LE(0, 30);         // extra
    central.writeUInt16LE(0, 32);         // comentario
    central.writeUInt16LE(0, 34);         // disco
    central.writeUInt16LE(0, 36);         // atributos internos
    central.writeUInt32LE(0, 38);         // atributos externos
    central.writeUInt32LE(offset, 42);    // dónde empieza su cabecera local
    indice.push(central, nombre);

    offset += local.length + nombre.length + datos.length;
  });

  const cuerpo = Buffer.concat(trozos);
  const dir = Buffer.concat(indice);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);                // número de disco
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(archivos.length, 8);  // entradas en este disco
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(dir.length, 12);
  fin.writeUInt32LE(cuerpo.length, 16);   // dónde empieza el índice
  fin.writeUInt16LE(0, 20);               // sin comentario

  return Buffer.concat([cuerpo, dir, fin]);
}

/**
 * Cómo se llama el archivo de una factura dentro del ZIP.
 *
 * «TUPINAMBA, S.A. · 2026-07-31 · FA-16973.pdf» — proveedor primero porque es como se busca, y
 * la fecha en ISO para que el gestor los vea en orden al ordenar por nombre.
 */
export function nombreDeFactura(f = {}, extension = "pdf") {
  const partes = [f.proveedor, String(f.fecha || "").slice(0, 10), f.numero_factura]
    .map((x) => nombreSeguro(x, ""))
    .filter(Boolean);
  const base = partes.length ? partes.join(" · ") : `factura-${f.id || "sin-id"}`;
  return `${nombreSeguro(base)}.${String(extension || "pdf").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "pdf"}`;
}
