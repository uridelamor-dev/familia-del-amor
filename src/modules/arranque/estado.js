// Vida y disponibilidad: las dos preguntas del arranque, que NO son la misma.
//
// EL PROBLEMA QUE RESUELVE. Replit pide `GET /` en bucle desde que lanza el deployment y marca
// el despliegue como caído mientras no le contesten. Durante ~24 segundos no había nadie
// escuchando: en un módulo ESM los `import` se evalúan ANTES que cualquier línea de código, y
// `server.js` importa 118 módulos —incluido el árbol entero de Baileys— antes de llegar a
// `app.listen`. Ni una sola instrucción nuestra corre hasta que ese árbol está cargado.
//
// LAS DOS PREGUNTAS:
//
//   VIDA (`/healthz`)         ¿está el proceso en pie y atendiendo el socket?
//                             No mira la base, ni WhatsApp, ni Ágora. Si mirara algo de eso,
//                             una caída de PostgreSQL haría que Replit reiniciara el proceso
//                             —que es exactamente lo que no arregla una caída de PostgreSQL.
//
//   DISPONIBILIDAD (`/readyz`) ¿puede este proceso hacer su trabajo de verdad?
//                             Aquí sí: el esquema inicializado Y un `SELECT 1` que responde.
//                             Si la base se cae después, esto vuelve a 503 solo.
//
// Y `GET /` sigue siendo lo que era. La página pública es un fichero estático que nunca dependió
// de la base, así que durante el arranque se sirve la MISMA que después. No se finge un 200: se
// contesta lo que esa ruta contesta siempre.

/** Lo que se responde a cualquier otra cosa mientras el sistema arranca. */
export const MENSAJE_ARRANCANDO = "El sistema está arrancando. Vuelve a intentarlo en unos segundos.";

const enviar = (res, codigo, tipo, cuerpo) => {
  res.statusCode = codigo;
  res.setHeader("Content-Type", tipo);
  res.setHeader("Cache-Control", "no-store");
  res.end(cuerpo);
};

/**
 * El manejador que atiende el socket ANTES de que Express exista.
 *
 * Deliberadamente diminuto: solo `node:http` y una lectura de fichero. Cuanto menos necesite,
 * antes puede contestar, y contestar pronto es lo único que se le pide.
 *
 * `leerIndex` se inyecta para poder probar esto sin tocar el disco.
 */
export function manejadorProvisional({ leerIndex, fase = () => "arrancando" }) {
  return (req, res) => {
    const ruta = String(req.url || "/").split("?")[0];

    // VIDA: 200 siempre, sin mirar nada. Es la promesa de este endpoint.
    if (ruta === "/healthz") return enviar(res, 200, "text/plain; charset=utf-8", "ok");

    // DISPONIBILIDAD: durante el arranque la respuesta honesta es «todavía no».
    if (ruta === "/readyz") {
      res.setHeader("Retry-After", "3");
      return enviar(res, 503, "application/json; charset=utf-8",
        JSON.stringify({ ok: false, listo: false, fase: fase() }));
    }

    // La página pública, la misma que sirve Express cuando ya está.
    if (ruta === "/" || ruta === "/index.html") {
      const html = leerIndex();
      if (html) return enviar(res, 200, "text/html; charset=utf-8", html);
    }

    // Todo lo demás espera. Un 503 con `Retry-After` se entiende y se reintenta; servir media
    // aplicación sin base de datos es lo que produce errores que no apuntan a ningún sitio.
    res.setHeader("Retry-After", "3");
    return enviar(res, 503, "application/json; charset=utf-8",
      JSON.stringify({ ok: false, arrancando: true, error: MENSAJE_ARRANCANDO }));
  };
}

/** Una promesa con fecha límite. Sin esto, un `SELECT 1` contra una base colgada cuelga
 *  también el healthcheck, y entonces no informa de nada. */
export function conTiempo(promesa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("tiempo agotado")), ms);
    promesa.then((v) => { clearTimeout(t); resolve(v); },
                 (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * La respuesta de `/readyz`, calculada.
 *
 * Dos condiciones, y hacen falta las dos: que `initDB()` haya terminado (si no, las columnas
 * nuevas todavía no existen) y que la base CONTESTE ahora mismo. Lo segundo es lo que hace que
 * esto sirva de algo: sin el ping, `/readyz` diría «listo» para siempre desde el primer arranque,
 * aunque PostgreSQL se cayera media hora después.
 *
 * Nunca sale de aquí el mensaje de la excepción: diría host, usuario o consulta.
 */
export async function readinessDe({ esquemaListo, ping, timeoutMs = 2000 }) {
  if (!esquemaListo) {
    return { codigo: 503, cuerpo: { ok: false, listo: false, fase: "esquema" } };
  }
  try {
    await conTiempo(Promise.resolve(ping()), timeoutMs);
    return { codigo: 200, cuerpo: { ok: true, listo: true, bd: "ok" } };
  } catch {
    return { codigo: 503, cuerpo: { ok: false, listo: false, fase: "bd", bd: "no responde" } };
  }
}
