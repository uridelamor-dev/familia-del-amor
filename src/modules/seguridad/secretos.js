// Cifrado de secretos en reposo. PURO salvo por el `crypto` de Node.
//
// Esto vivía suelto dentro de server.js como `agoraEncToken` / `agoraDecToken` (la contraseña
// del TPV). Sale aquí porque ya hay un segundo sitio que lo necesita —las claves de firma de
// Apple y Google Wallet— y dos copias de un cifrado son dos formatos que se separan el día que
// alguien arregla un detalle en una sola.
//
// AES-256-GCM: cifra y además autentica, así que un valor manipulado en la base no se descifra
// «a otra cosa», falla. La clave se deriva del JWT_SECRET con scrypt y una sal por uso, para que
// un secreto de Ágora no se pueda descifrar con la clave de wallet ni al revés.
//
// FORMATO: "enc:<iv-hex>:<tag-hex>:<ciphertext-hex>". Lo que no empieza por "enc:" se devuelve
// tal cual: hubo valores en claro sembrados desde variables de entorno, y romperlos al leer
// habría dejado el TPV sin conexión sin decir por qué.

import crypto from "crypto";

/** La clave de un uso concreto. `sal` separa los dominios: "agora-token-v1", "wallet-v1"… */
export function derivarClave(secreto, sal) {
  return crypto.scryptSync(String(secreto || "tapeta"), String(sal), 32);
}

export function cifrar(plano, clave) {
  if (!plano) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", clave, iv);
  const ct = Buffer.concat([c.update(String(plano), "utf8"), c.final()]);
  return "enc:" + iv.toString("hex") + ":" + c.getAuthTag().toString("hex") + ":" + ct.toString("hex");
}

export function descifrar(guardado, clave) {
  if (!guardado) return null;
  const s = String(guardado);
  if (!s.startsWith("enc:")) return s;   // compat: valores en claro de antes
  try {
    const [, ivh, tagh, cth] = s.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", clave, Buffer.from(ivh, "hex"));
    d.setAuthTag(Buffer.from(tagh, "hex"));
    return Buffer.concat([d.update(Buffer.from(cth, "hex")), d.final()]).toString("utf8");
  } catch { return null; }
}

/** «••••1234»: lo justo para reconocer cuál de dos certificados está cargado, sin enseñar nada.
 *  Se usa en el panel, donde el secreto NUNCA sale por la API. */
export function pista(plano) {
  const s = String(plano || "");
  return s.length > 4 ? "••••" + s.slice(-4) : "••••";
}
