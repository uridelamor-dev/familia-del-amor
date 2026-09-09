// Migración del cifrado legado (R01) al formato v2. PURO respecto a la base: recibe un `x` con
// `{ get, all, run }`, igual que el resto de migraciones de la casa.
//
// QUÉ MIGRA. Siete valores reales en producción, repartidos en tres columnas: los tokens y las
// contraseñas de los cuatro TPV de Ágora, y la configuración de firma de la wallet. Poca cosa en
// número y todo lo que hay que perder si sale mal: sin ellos, los TPV dejan de sincronizar y las
// tarjetas dejan de firmarse, y en ninguno de los dos casos se sabe la contraseña original para
// volver a escribirla a mano.
//
// DE AHÍ LAS TRES REGLAS DE ESTE FICHERO:
//
//  1. Antes de tocar un valor se guarda el CRIPTOGRAMA anterior en `cifrado_copia_v1`. El
//     criptograma, no el contenido: la copia no vale para nadie que no tenga la clave, y sirve
//     para deshacer sin conocer ni una contraseña.
//  2. Antes de confirmar, cada valor nuevo se descifra y se compara con el original en memoria.
//     Un `UPDATE` que escribe algo que no se puede volver a leer es exactamente la avería que
//     nadie detecta hasta el día siguiente.
//  3. Todo en UNA transacción. Si algo falla —un valor que no descifra, una fila que ha cambiado
//     debajo— no se queda nada a medias: se deshace entero y la base sigue como estaba, que es un
//     estado que funciona.
//
// REANUDABLE E IDEMPOTENTE. Como es una sola transacción, una interrupción no deja nada escrito y
// basta con volver a lanzarla. Y una segunda pasada con todo ya migrado no reescribe nada: los
// valores que ya están en v2 se saltan, y la copia solo se inserta si no existía (`DO NOTHING`),
// así que nunca se pisa la copia buena con el valor nuevo.

import { abrir, cifrar, formatoDe, DOMINIOS } from "./secretos.js";
import crypto from "crypto";

export const TABLA_COPIA = "cifrado_copia_v1";

/**
 * Identificador del candado de PostgreSQL. Es arbitrario pero tiene que ser estable: dos
 * migraciones a la vez —alguien lanzándola dos veces, o el arranque de un segundo proceso—
 * se pisarían entre la lectura y la escritura.
 */
export const CANDADO = 8412771;

/** Las tres columnas que llevan secretos cifrados. No hay más; si las hubiera, van aquí. */
export const OBJETIVOS = Object.freeze([
  { tabla: "agora_locales", pk: "local", columna: "token", dominio: DOMINIOS.AGORA },
  { tabla: "agora_locales", pk: "local", columna: "pass_enc", dominio: DOMINIOS.AGORA },
  { tabla: "wallet_config", pk: "plataforma", columna: "datos_enc", dominio: DOMINIOS.WALLET },
]);

/** Los nombres se interpolan en SQL, así que se comprueban. Vienen de la constante de arriba y
 *  no de nadie de fuera, pero un identificador interpolado sin mirar es una costumbre mala. */
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(String(s))) throw new Error(`identificador no válido: ${s}`);
  return s;
};

export const SQL_COPIA = `CREATE TABLE IF NOT EXISTS ${TABLA_COPIA} (
  tabla TEXT NOT NULL,
  columna TEXT NOT NULL,
  clave TEXT NOT NULL,
  valor_anterior TEXT NOT NULL,
  formato_anterior TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  PRIMARY KEY (tabla, columna, clave)
)`;

const contadorVacio = () => ({ total: 0, nulo: 0, claro: 0, legado: 0, v2: 0, corrupto: 0, no_descifrable: 0, pendientes: 0 });

/** Comparación sin fugas de tiempo. Aquí los dos lados son nuestros, pero comparar secretos con
 *  `===` es una costumbre que acaba copiándose a donde sí importa. */
export function igualSeguro(a, b) {
  const A = Buffer.from(String(a), "utf8"), B = Buffer.from(String(b), "utf8");
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

async function filasDe(x, obj, { bloquear = false } = {}) {
  const t = ident(obj.tabla), pk = ident(obj.pk), col = ident(obj.columna);
  try {
    return await x.all(`SELECT ${pk} AS clave, ${col} AS valor FROM ${t} ORDER BY ${pk}${bloquear ? " FOR UPDATE" : ""}`);
  } catch (e) {
    if (e && e.code === "42P01") return null;   // la tabla no existe todavía: no es un error
    throw e;
  }
}

/**
 * Cuenta en qué estado está cada valor. NO escribe, NO crea la tabla de copia y NO devuelve
 * ningún contenido: solo números.
 *
 * `no_descifrable` es el conteo que decide si se puede migrar o no. Si sale distinto de cero hay
 * que averiguar por qué ANTES de aplicar nada: puede ser una fila escrita con otra clave, o un
 * valor tocado a mano, y en los dos casos migrar a ciegas lo dejaría igual de ilegible pero sin
 * el original.
 */
export async function contar(x, llavero) {
  const por = [];
  const total = contadorVacio();
  for (const obj of OBJETIVOS) {
    const filas = await filasDe(x, obj);
    const c = contadorVacio();
    if (filas === null) { por.push({ ...obj, ausente: true, ...c }); continue; }
    for (const f of filas) {
      c.total++;
      const fmt = formatoDe(f.valor);
      if (fmt === "vacio") { c.nulo++; continue; }
      if (fmt === "corrupto") { c.corrupto++; continue; }
      if (fmt === "v2") {
        // Que esté en v2 no basta: si el `kid` no es de ninguna clave cargada, no se puede leer.
        if (abrir(f.valor, llavero, obj.dominio).ok) c.v2++;
        else { c.v2++; c.no_descifrable++; }
        continue;
      }
      if (fmt === "claro") c.claro++; else c.legado++;
      if (abrir(f.valor, llavero, obj.dominio).ok) c.pendientes++;
      else c.no_descifrable++;
    }
    for (const k of Object.keys(c)) total[k] += c[k];
    por.push({ tabla: obj.tabla, columna: obj.columna, ausente: false, ...c });
  }
  return { por, total, listo: total.no_descifrable === 0 && total.corrupto === 0 };
}

/**
 * Migra. En seco por defecto: `aplicar` tiene que llegar en `true` explícitamente.
 *
 * El llamante es quien abre la transacción y quien pone el candado, porque es quien tiene el
 * cliente de verdad. Aquí solo se hace el trabajo, y se lanza a la primera para que ese `catch`
 * de fuera haga ROLLBACK.
 */
export async function migrar(x, llavero, { aplicar = false, ahora = () => new Date().toISOString() } = {}) {
  if (aplicar && !llavero.actual) throw new Error("no hay DATA_ENC_KEY: no se puede migrar");
  if (aplicar) await x.run(SQL_COPIA);

  const por = [];
  let migrados = 0, saltados = 0;

  for (const obj of OBJETIVOS) {
    const t = ident(obj.tabla), pk = ident(obj.pk), col = ident(obj.columna);
    const filas = await filasDe(x, obj, { bloquear: aplicar });
    if (filas === null) { por.push({ tabla: obj.tabla, columna: obj.columna, ausente: true, migrados: 0, saltados: 0 }); continue; }

    let m = 0, s = 0;
    for (const f of filas) {
      const fmt = formatoDe(f.valor);
      if (fmt === "vacio" || fmt === "v2") { s++; continue; }   // nada que hacer, o ya está
      if (fmt === "corrupto") throw new Error(`${obj.tabla}.${obj.columna}: hay un valor en formato irreconocible`);

      const leido = abrir(f.valor, llavero, obj.dominio);
      if (!leido.ok) throw new Error(`${obj.tabla}.${obj.columna}: un valor no se puede descifrar (${leido.motivo})`);

      if (!aplicar) { m++; continue; }

      const nuevo = cifrar(leido.valor, llavero, obj.dominio);

      // LA COMPROBACIÓN QUE JUSTIFICA TODO ESTO: lo que vamos a escribir, ¿se vuelve a leer y
      // dice exactamente lo mismo? Si no, se para aquí y no se escribe una sola fila.
      const vuelta = abrir(nuevo, llavero, obj.dominio);
      if (!vuelta.ok || !igualSeguro(vuelta.valor, leido.valor)) {
        throw new Error(`${obj.tabla}.${obj.columna}: el valor nuevo no se relee igual; se aborta`);
      }

      // La copia va ANTES del UPDATE, y con DO NOTHING para no pisar una copia ya buena si esto
      // se repite. Guarda el criptograma viejo; el contenido no aparece por ningún lado.
      await x.run(
        `INSERT INTO ${TABLA_COPIA} (tabla, columna, clave, valor_anterior, formato_anterior, creado_en)
         VALUES (?,?,?,?,?,?) ON CONFLICT (tabla, columna, clave) DO NOTHING`,
        [obj.tabla, obj.columna, String(f.clave), String(f.valor), fmt, ahora()]);

      // El `AND ${col} = ?` es el seguro contra una escritura de otro que se haya colado entre
      // la lectura y ahora: si el valor ya no es el que leímos, no se actualiza y se aborta.
      const hecho = await x.run(
        `UPDATE ${t} SET ${col} = ? WHERE ${pk} = ? AND ${col} = ? RETURNING ${pk}`,
        [nuevo, f.clave, f.valor]);
      if (!hecho) throw new Error(`${obj.tabla}.${obj.columna}: la fila cambió durante la migración; se aborta`);
      m++;
    }
    migrados += m; saltados += s;
    por.push({ tabla: obj.tabla, columna: obj.columna, ausente: false, migrados: m, saltados: s });
  }

  return { aplicado: aplicar, por, migrados, saltados };
}

/** ¿Queda algo sin migrar? Es la pregunta que decide cuándo se puede borrar el lector legado. */
export async function quedaLegado(x) {
  let n = 0;
  const detalle = [];
  for (const obj of OBJETIVOS) {
    const filas = await filasDe(x, obj);
    if (filas === null) continue;
    const c = filas.filter((f) => { const t = formatoDe(f.valor); return t === "legado" || t === "claro"; }).length;
    n += c;
    detalle.push({ tabla: obj.tabla, columna: obj.columna, sin_migrar: c });
  }
  return { limpio: n === 0, sin_migrar: n, detalle };
}

/**
 * Deshace: devuelve a cada columna el criptograma que tenía antes, tal cual se guardó.
 *
 * No necesita saber ninguna contraseña, y por eso funciona. Es el camino de vuelta si un TPV
 * deja de conectar después del despliegue.
 */
export async function restaurar(x, { aplicar = false } = {}) {
  let filas;
  try { filas = await x.all(`SELECT tabla, columna, clave, valor_anterior FROM ${TABLA_COPIA} ORDER BY tabla, columna, clave`); }
  catch (e) { if (e && e.code === "42P01") return { aplicado: aplicar, restaurados: 0, sin_copia: true }; throw e; }

  let n = 0;
  for (const f of filas) {
    const obj = OBJETIVOS.find((o) => o.tabla === f.tabla && o.columna === f.columna);
    if (!obj) throw new Error(`la copia menciona ${f.tabla}.${f.columna}, que no es una columna conocida`);
    if (!aplicar) { n++; continue; }
    const hecho = await x.run(
      `UPDATE ${ident(obj.tabla)} SET ${ident(obj.columna)} = ? WHERE ${ident(obj.pk)} = ? RETURNING ${ident(obj.pk)}`,
      [f.valor_anterior, f.clave]);
    if (hecho) n++;
  }
  return { aplicado: aplicar, restaurados: n, sin_copia: false };
}
