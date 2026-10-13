// Mensajes cerrados: nunca exponemos códigos, tokens ni respuestas completas de Google.
export async function autorizarResenas({ code, clientId, clientSecret, redirectUri, fetchImpl = fetch }) {
  const fallo = (status, error) => ({ ok: false, status, error });
  if (!clientId || !clientSecret) return fallo(503, 'La conexión de reseñas no tiene configuradas sus credenciales de Google.');
  let res, data;
  try {
    res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      signal: AbortSignal.timeout(20000)
    });
    data = await res.json();
  } catch {
    return fallo(502, 'No se ha podido completar la conexión con Google. Inicia de nuevo la conexión desde Reseñas.');
  }
  if (!res.ok || data?.error) {
    if (data?.error === 'invalid_client') return fallo(503, 'Google rechaza las credenciales de la aplicación. Hay que comprobar que el ID y el secreto del cliente pertenecen al mismo cliente de Google y están actualizados en la publicación. No es necesario revocar permisos.');
    if (data?.error === 'invalid_grant') return fallo(400, 'Esta autorización ha caducado o ya se ha utilizado. Inicia de nuevo la conexión desde Reseñas; no recargues esta página.');
    if (data?.error === 'redirect_uri_mismatch') return fallo(503, 'La dirección de retorno de Google no coincide con la configuración de la aplicación.');
    return fallo(502, 'Google ha rechazado la conexión. Revisa la configuración de acceso de la aplicación e inicia una nueva conexión.');
  }
  if (typeof data?.refresh_token !== 'string' || !data.refresh_token.trim()) {
    return fallo(400, 'Google ha autorizado el acceso, pero no ha entregado el permiso para mantener la conexión. Inicia de nuevo la conexión desde Reseñas con la cuenta de marketing. Si se repite, habrá que revisar el acceso de esta aplicación en tu cuenta de Google.');
  }
  return { ok: true, refreshToken: data.refresh_token };
}
