// MARCAR UN PASE COMO CAMBIADO. La parte que TIENE que ser atómica.
//
// ── EL FALLO QUE ESTO ARREGLA ────────────────────────────────────────────────────────────────
//
// Antes eran dos escrituras sueltas, en este orden:
//
//     UPDATE wallet_pases SET etiqueta = etiqueta + 1, huella = <la nueva>
//     ← el proceso muere aquí
//     INSERT INTO wallet_avisos …
//
// Y eso deja el sistema CIEGO. La huella guardada ya coincide con lo que se ve, así que el
// reconciliador pasa, compara, no encuentra diferencia y sigue de largo. El aviso no se manda
// nunca y el pase de ese cliente se queda viejo hasta que vuelva a cambiarle algo — que pueden ser
// semanas. Es peor que no tener reconciliador: parecía que había red y no la había.
//
// Aquí las dos escrituras van DENTRO DE UNA TRANSACCIÓN. Si muere antes del COMMIT no queda ni
// huella nueva ni aviso, y el reconciliador lo vuelve a ver en su siguiente vuelta. Si muere
// después, quedan las dos.
//
// ── QUÉ SIGNIFICA CADA COLUMNA ───────────────────────────────────────────────────────────────
//
//   `wallet_pases.huella`    el estado visible QUE YA ESTÁ ANUNCIADO: o servido dentro de un
//                            `.pkpass`, o con su aviso puesto en cola en esta misma transacción.
//                            Nunca se escribe sin que exista una de las dos cosas.
//   `wallet_pases.etiqueta`  el `lastUpdated` de Apple. Contador que solo sube, uno por pase.
//   `wallet_avisos.etiqueta` la etiqueta PARA LA QUE se levantó ese aviso. Al reutilizar un aviso
//                            pendiente se actualiza, así que siempre apunta a la última versión.
//
// ── UN SOLO PENDIENTE POR PASE, Y LO GARANTIZA LA BASE ───────────────────────────────────────
//
// El candado es un ÍNDICE ÚNICO PARCIAL sobre `qr_id` cuando `estado = 'pendiente'`, no una clave
// de texto. Con una clave de texto, cerrar un aviso obligaba a reescribirla para liberar el hueco,
// y si un solo camino de cierre se olvidaba de hacerlo, ESE PASE no volvía a recibir un aviso
// nunca más — en silencio. Con el índice parcial, una fila terminal deja de estorbar sola.

/** El nombre de la generación, para poder leer en la fila a qué versión correspondía. */
export const claveDe = (qrId, etiqueta) => `wal:${qrId}:v${etiqueta}`;

/**
 * Sube la versión del pase y deja un aviso pendiente. TODO O NADA.
 *
 * `x` es el manejador de una transacción ya abierta: `get`, `all`, `run`. Se recibe en vez de
 * abrirla aquí para que quien llama decida el alcance —y para poder probar el fallo a mitad con
 * una transacción de mentira—.
 *
 * @returns {{ok, cambio, encolado, etiqueta?, motivo?}}
 */
export async function aplicarCambio(x, { qrId, huella, motivo = "", ahora = "" } = {}) {
  const id = parseInt(qrId);
  if (!Number.isFinite(id)) return { ok: false, motivo: "sin_id" };

  // `FOR UPDATE` serializa dos cambios simultáneos del mismo pase: sin él, dos facturas a la vez
  // leerían la misma etiqueta y una de las dos subidas se perdería.
  const pase = await x.get(
    `SELECT qr_id, etiqueta, huella FROM wallet_pases WHERE qr_id = ? FOR UPDATE`, [id]);
  if (!pase) return { ok: false, motivo: "sin_pase" };

  // SIN CAMBIO VISIBLE NO SE HACE NADA. Despertar el móvil de alguien para no cambiarle nada es
  // la forma más rápida de que borre el carné.
  if (String(pase.huella ?? "") === String(huella ?? "")) {
    return { ok: true, cambio: false, encolado: false, etiqueta: Number(pase.etiqueta) };
  }

  const etiqueta = Number(pase.etiqueta || 0) + 1;
  await x.run(
    `UPDATE wallet_pases SET etiqueta = ?, huella = ?, actualizado_en = ?, motivo = ?
      WHERE qr_id = ?`,
    [etiqueta, huella, ahora, String(motivo || "").slice(0, 60), id]);

  // ¿Hay alguien a quien avisar? Un carné que se bajó el pase pero no registró ningún dispositivo
  // no genera cola: bajarlo y registrarlo son dos cosas distintas.
  const hay = await x.get(
    `SELECT 1 AS hay FROM wallet_registros WHERE qr_id = ? AND activo LIMIT 1`, [id]);
  if (!hay) return { ok: true, cambio: true, encolado: false, etiqueta };

  // UPSERT sobre el pendiente que haya. Dos cambios seguidos no crean dos avisos: el segundo
  // actualiza la etiqueta del primero, que sigue sin mandarse. Y cuando ese aviso termina deja de
  // ser `pendiente`, así que el siguiente cambio SÍ crea una fila nueva.
  await x.run(
    `INSERT INTO wallet_avisos (qr_id, etiqueta, clave_idem, motivo, proximo_ms, creado_en)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT (qr_id) WHERE estado = 'pendiente'
     DO UPDATE SET etiqueta = EXCLUDED.etiqueta, clave_idem = EXCLUDED.clave_idem,
                   motivo = EXCLUDED.motivo`,
    [id, etiqueta, claveDe(id, etiqueta), String(motivo || "").slice(0, 60),
     Date.parse(ahora) || Date.now(), ahora]);

  return { ok: true, cambio: true, encolado: true, etiqueta };
}
