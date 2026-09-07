// El enlace de «Guardar en Google Wallet».
//
// Es un JWT firmado con RS256 con la clave privada de una service account. Dentro va la clase y
// el objeto enteros, así que Google los crea al guardarlo: NO hay ninguna llamada
// servidor-a-servidor, ni OAuth, ni token que refrescar, ni cuota que se agote un sábado por la
// noche. Firmar es todo lo que hay que hacer, y `jsonwebtoken` ya está instalado (hoy solo se
// usa con HS256 para las sesiones del panel).

import jwt from "jsonwebtoken";

export const BASE_GUARDAR = "https://pay.google.com/gp/v/save/";

/**
 * Firma la carga y devuelve la URL a la que hay que mandar al cliente.
 *
 * `origins` es la lista de sitios desde los que se puede pulsar el botón. Se pone el dominio
 * público de verdad: sin restricción, un JWT copiado del historial del navegador valdría desde
 * cualquier página.
 *
 * `expiresIn` corto a propósito. El JWT no es la tarjeta: es el permiso para guardarla, se
 * genera de nuevo en cada visita a la página y no se almacena en ningún sitio. Cinco minutos
 * sobran para pulsar un botón, y limitan lo que se puede hacer con un enlace que se filtre por
 * el historial o por un log de servidor intermedio.
 */
export function enlaceGuardar(carga, { saEmail, saKey, origins = [], expiresIn = "5m" } = {}) {
  if (!saEmail) throw new Error("Falta el correo de la service account de Google");
  if (!saKey) throw new Error("Falta la clave privada de la service account de Google");

  const payload = {
    iss: saEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    origins: Array.isArray(origins) ? origins.filter(Boolean) : [],
    payload: carga,
  };

  const token = jwt.sign(payload, saKey, { algorithm: "RS256", expiresIn });
  return BASE_GUARDAR + token;
}

/**
 * La clave privada tal como sale del JSON de Google trae los saltos de línea escapados
 * («-----BEGIN PRIVATE KEY-----\\nMIIE…»). Si se guarda copiando y pegando ese JSON a mano, la
 * clave llega con `\n` de dos caracteres y openssl —y `jsonwebtoken`— dicen que la clave no es
 * válida, que es de los errores que más tiempo hacen perder porque a la vista está bien.
 */
export function normalizarClave(pem) {
  const s = String(pem || "").trim();
  return s.includes("\\n") ? s.replace(/\\n/g, "\n") : s;
}
