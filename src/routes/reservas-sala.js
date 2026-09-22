import { validarSala, puedeGestionarSala, validarEdicionReserva } from '../modules/reservas/sala.js';
export function registrarSala(app, { pool, requireAuth, localesPermitidos, ahora }) {
  app.patch('/api/reservas/:id/sala', requireAuth(['direccion', 'encargado']), async (req, res) => {
    const validacion = validarSala(req.body);
    if (validacion.error) return res.status(400).json({ ok: false, error: validacion.error });
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ ok: false, error: 'Reserva inválida' });
    let db;
    try {
      db = await pool.connect();
      await db.query('BEGIN');
      const antes = (await db.query('SELECT * FROM reservas WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      const fail = async (code, error) => { await db.query('ROLLBACK'); return res.status(code).json({ ok: false, error }); };
      if (!antes) return await fail(404, 'Reserva no encontrada');
      if (!puedeGestionarSala(antes.local, localesPermitidos(req, antes.local))) return await fail(403, 'Sin permiso sobre esta reserva');
      const d = validacion.data;
      if (antes.version_sala !== d.version_sala) return await fail(409, 'Otra persona ha cambiado esta reserva. Cierra y vuelve a abrirla para ver sus cambios.');
      const edicion = validarEdicionReserva(antes, req.body.reserva, ahora?.() || {});
      if(edicion.error) return await fail(edicion.status || 400, edicion.error);
      const nueva=edicion.data;
      if(edicion.cambiaTurno) {
        const bloqueo=(await db.query('SELECT id FROM bloqueos_reservas WHERE local=$1 AND desde <= $2 AND hasta >= $2 LIMIT 1',[antes.local,nueva.dia])).rows[0];
        if(bloqueo) return await fail(400,'Ese día está bloqueado para reservas en este local.');
      }
      const despues = (await db.query(`UPDATE reservas SET estado_sala=$2, mesa=$3, notas_sala=$4, nombre_reserva=$5, personas=$6, dia=$7, hora=$8, version_sala=version_sala+1 WHERE id=$1 RETURNING *`, [antes.id, d.estado_sala, d.mesa, d.notas_sala, nueva.nombre_reserva, nueva.personas, nueva.dia, nueva.hora])).rows[0];
      // Un seguimiento legado se identifica por teléfono, día y local. Si otra reserva ocupa
      // esa misma visita, se conserva; no se reasigna por conjetura a una persona diferente.
      if(edicion.cambia && nueva.dia!==antes.dia) {
        await db.query(`UPDATE followup_scheduled SET dia=$1, send_at=to_char($1::date + 1,'YYYY-MM-DD') || 'T11:00:00', nombre=$2
          WHERE sent=0 AND local=$3 AND dia=$4 AND RIGHT(REGEXP_REPLACE(jid,'[^0-9]','','g'),9)=$5
          AND NOT EXISTS (SELECT 1 FROM reservas WHERE id<>$6 AND local=$3 AND dia=$4 AND RIGHT(REGEXP_REPLACE(telefono,'[^0-9]','','g'),9)=$5)`,
          [nueva.dia,nueva.nombre_reserva,antes.local,antes.dia,String(antes.telefono).replace(/\D/g,'').slice(-9),antes.id]);
      }

      await db.query('INSERT INTO reservas_sala_historial (reserva_id,autor,antes,despues) VALUES ($1,$2,$3,$4)', [antes.id, req.user.username, JSON.stringify(antes), JSON.stringify(despues)]);
      await db.query('COMMIT');
      res.json({ ok: true, data: despues });
    } catch (e) {
      if (db) await db.query('ROLLBACK').catch(() => {});
      res.status(500).json({ ok: false, error: 'No se ha podido guardar la gestión de sala.' });
    } finally { if(db) db.release(); }
  });
}
