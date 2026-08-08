// Ayuda para probar SQL contra un PostgreSQL DE VERDAD, en un esquema desechable.
//
// Por qué no `tests/helpers/memdb.js`: el emulador solo entiende las consultas exactas que
// ya se le portaron, y sobre todo NO valida el DDL — que es justo lo que hay que comprobar
// aquí (tipos, CHECK, índices únicos parciales, claves ajenas). Un esquema temporal en un
// Postgres real cuesta milisegundos y prueba lo que importa.
//
// Si no hay `TEST_DATABASE_URL`, estos tests se saltan con un mensaje claro para que
// `npm test` siga funcionando en cualquier máquina. Con Postgres local:
//   TEST_DATABASE_URL=postgres://localhost/postgres node --test tests/db/...

let pgModulo = null;
async function cargarPg() {
  if (pgModulo !== null) return pgModulo;
  try { pgModulo = (await import("pg")).default; } catch { pgModulo = false; }
  return pgModulo;
}

export async function disponible() {
  return !!process.env.TEST_DATABASE_URL && !!(await cargarPg());
}

export function motivoSalto() {
  if (!process.env.TEST_DATABASE_URL) return "sin TEST_DATABASE_URL (ej.: postgres://localhost/postgres)";
  return "el paquete pg no está instalado en esta máquina";
}

// Crea un esquema aislado, devuelve { run, get, all, fin } con el mismo contrato que
// dbRun/dbGet/dbAll de server.js (placeholders `?`), y lo borra entero al terminar.
export async function conEsquema() {
  const pg = await cargarPg();
  if (!pg) throw new Error("pg no disponible");
  const nombre = "test_" + Math.random().toString(36).slice(2, 10);
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
  await pool.query(`CREATE SCHEMA ${nombre}`);
  await pool.query(`SET search_path TO ${nombre}`);

  // Mismo truco que server.js: `?` → $1, $2… respetando el orden.
  const aPosicional = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
  const query = async (sql, params = []) => {
    const c = await pool.connect();
    try {
      await c.query(`SET search_path TO ${nombre}`);
      return await c.query(aPosicional(sql), params);
    } finally { c.release(); }
  };

  return {
    esquema: nombre,
    run: async (sql, params) => (await query(sql, params)).rows[0],
    get: async (sql, params) => (await query(sql, params)).rows[0],
    all: async (sql, params) => (await query(sql, params)).rows,
    raw: query,
    fin: async () => {
      try { await pool.query(`DROP SCHEMA ${nombre} CASCADE`); } finally { await pool.end(); }
    },
  };
}
