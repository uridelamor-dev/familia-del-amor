export async function ensureSchemaEscandallos(q) {
  await q(`CREATE TABLE IF NOT EXISTS esc_recetas (
    id SERIAL PRIMARY KEY, local TEXT NOT NULL, nombre TEXT NOT NULL,
    raciones NUMERIC NOT NULL CHECK(raciones > 0), pvp NUMERIC NOT NULL CHECK(pvp >= 0),
    iva NUMERIC NOT NULL CHECK(iva >= 0 AND iva <= 100),
    ingredientes JSONB NOT NULL CHECK(jsonb_typeof(ingredientes) = 'array'),
    version INTEGER NOT NULL DEFAULT 1, activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_por TEXT NOT NULL, actualizado_por TEXT NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await q(`CREATE INDEX IF NOT EXISTS esc_recetas_local ON esc_recetas(local, activo)`);
  await q(`CREATE TABLE IF NOT EXISTS esc_versiones (
    id SERIAL PRIMARY KEY, receta_id INTEGER NOT NULL REFERENCES esc_recetas(id),
    version INTEGER NOT NULL, datos JSONB NOT NULL, autor TEXT NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(receta_id, version))`);
}
