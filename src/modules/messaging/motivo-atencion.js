// El motivo de una intervención se comparte entre el panel y sus avisos.
export function tareaHumana(tarea) {
 return ['pendiente','en_curso'].includes(tarea?.estado) && (tarea.motivo !== 'sin_respuesta' || tarea.estado === 'en_curso');
}
export function motivoAtencion(tarea = {}, cliente = {}) {
 if(tarea.motivo==='pidio_persona'||cliente.pausa_motivo==='pidio_persona')return 'El cliente ha pedido hablar con una persona.';
 const detalle=tarea.resumen?.trim();
 if(tarea.motivo?.startsWith('error_'))return 'Fallo al procesar o responder una petición. Hay que comprobar qué se completó antes de repetir acciones.'+(detalle?' '+detalle:'');
 if(detalle)return detalle;
 if(tarea.estado==='en_curso'||cliente.estado_ia==='pausada'&&cliente.pausado_por!=='sara')return 'El equipo ha tomado el control de esta conversación.';
 return 'Consulta derivada al equipo sin detalle registrado; revisa el historial.';
}
export function enlaceConversacion(jid) {
 return 'https://familiadelamor.org/panel/#conversaciones/'+encodeURIComponent(jid);
}
