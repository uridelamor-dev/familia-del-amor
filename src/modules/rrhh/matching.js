// RRHH — emparejado PURO de operadores de Ágora con perfiles de trabajador. Sin efectos.
// La integración Ágora solo expone el `UserName` (nombre de operador) de quien facturó; aquí
// proponemos a qué perfil corresponde cada uno, sin auto-enlazar en caso de duda.

// Normaliza un nombre para comparar: minúsculas, sin acentos, sin puntuación, espacios colapsados.
export function normalizaNombre(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Empareja una lista de UserName de Ágora con los perfiles existentes.
//  perfiles: [{ id, nombre, agora_username }]
// Devuelve por cada operador: { userName, match:'exacto'|'probable'|'ninguno', worker_id, candidatos:[{id,nombre}] }
//  - exacto: algún perfil ya tiene ese agora_username guardado.
//  - probable: un ÚNICO perfil cuyo nombre normalizado coincide.
//  - ninguno: sin coincidencia, o varias (colisión) → candidatos para que decida una persona.
export function emparejaOperadores(userNames, perfiles) {
  const arr = Array.isArray(perfiles) ? perfiles : [];
  const porAgora = new Map();
  for (const p of arr) if (p.agora_username) porAgora.set(normalizaNombre(p.agora_username), p);
  const porNombre = new Map();
  for (const p of arr) {
    const k = normalizaNombre(p.nombre);
    if (!k) continue;
    (porNombre.get(k) || porNombre.set(k, []).get(k)).push(p);
  }
  const vistos = new Set();
  const out = [];
  for (const raw of (Array.isArray(userNames) ? userNames : [])) {
    const un = String(raw == null ? "" : raw).trim();
    const key = normalizaNombre(un);
    if (!un || un === "—" || !key || vistos.has(key)) continue;
    vistos.add(key);
    const ya = porAgora.get(key);
    if (ya) { out.push({ userName: un, match: "exacto", worker_id: ya.id, candidatos: [{ id: ya.id, nombre: ya.nombre }] }); continue; }
    const cand = porNombre.get(key) || [];
    if (cand.length === 1) out.push({ userName: un, match: "probable", worker_id: cand[0].id, candidatos: [{ id: cand[0].id, nombre: cand[0].nombre }] });
    else out.push({ userName: un, match: "ninguno", worker_id: null, candidatos: cand.map((c) => ({ id: c.id, nombre: c.nombre })) });
  }
  return out;
}

// De un informe `empleado` de Ágora (filas con {empleado, ventas, cancelado, ...}), devuelve la
// fila cuyo `empleado` coincide (normalizado) con `agoraUsername`, o null.
export function rendimientoDeEmpleado(filas, agoraUsername) {
  if (!agoraUsername) return null;
  const k = normalizaNombre(agoraUsername);
  return (Array.isArray(filas) ? filas : []).find((f) => normalizaNombre(f.empleado) === k) || null;
}
