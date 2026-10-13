import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autorizarResenas } from '../../src/modules/reviews/oauth.js';
const options = { code: 'codigo-privado', clientId: 'id', clientSecret: 'secreto', redirectUri: 'https://example.test/callback' };
const response = (data, ok = false) => async () => ({ ok, json: async () => data });
test('guarda únicamente una autorización válida', async () => {
  let calls = 0;
  const result = await autorizarResenas({ ...options, fetchImpl: async (url, req) => {
    calls++;
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(req.body.get('grant_type'), 'authorization_code');
    assert.equal(req.body.get('client_secret'), options.clientSecret);
    return { ok: true, json: async () => ({ refresh_token: 'token-valido' }) };
  }});
  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: true, refreshToken: 'token-valido' });
});
test('distingue credenciales inválidas de autorización caducada sin revelar la respuesta', async () => {
  for (const [error, expected] of [['invalid_client', /credenciales/], ['invalid_grant', /caducado/], ['redirect_uri_mismatch', /dirección de retorno/], ['otro', /rechazado/]]) {
    const r = await autorizarResenas({ ...options, fetchImpl: response({ error, error_description: 'secreto codigo-privado', refresh_token: 'no-guardar' }) });
    assert.equal(r.ok, false); assert.match(r.error, expected);
    assert.doesNotMatch(r.error, /codigo-privado|no-guardar|error_description/);
    assert.equal(r.refreshToken, undefined);
  }
});
test('distingue respuesta correcta sin permiso persistente', async () => {
  const r = await autorizarResenas({ ...options, fetchImpl: response({ access_token: 'privado' }, true) });
  assert.equal(r.ok, false); assert.match(r.error, /mantener la conexión/);
  assert.doesNotMatch(r.error, /privado/);
});
test('fallos de red, JSON o configuración no provocan rechazo sin manejar ni reintentos', async () => {
  for (const fetchImpl of [async () => { throw new Error('secreto'); }, async () => ({ ok: true, json: async () => { throw new Error('secreto'); } })]) {
    const r = await autorizarResenas({ ...options, fetchImpl });
    assert.equal(r.status, 502); assert.doesNotMatch(r.error, /secreto/);
  }
  const r = await autorizarResenas({ ...options, clientSecret: '', fetchImpl: () => assert.fail('No llamar a Google sin configurar') });
  assert.equal(r.status, 503);
});
