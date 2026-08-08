// Serialización canónica: el mismo contenido produce SIEMPRE los mismos bytes.
//
// `JSON.stringify` conserva el orden en que se insertaron las claves, así que dos objetos
// con los mismos datos pueden dar cadenas distintas según cómo se construyeran. Para un
// hash que tiene que seguir cuadrando dentro de dos años, eso no vale: bastaría con
// reordenar un `SELECT` para que un horario publicado pareciera manipulado.
//
// Puro y sin dependencias. El hash se inyecta (crypto vive en el servidor, no aquí).

export function canonicalizar(valor) {
  if (valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.map(canonicalizar);
  const out = {};
  for (const k of Object.keys(valor).sort()) {
    if (valor[k] === undefined) continue;   // undefined no existe en JSON: fuera, y explícito
    out[k] = canonicalizar(valor[k]);
  }
  return out;
}

export function serializarCanonico(valor) {
  return JSON.stringify(canonicalizar(valor));
}

// `sha256` es una función (texto) => hex. En el servidor se le pasa la de node:crypto.
export function hashCanonico(valor, sha256) {
  return sha256(serializarCanonico(valor));
}
