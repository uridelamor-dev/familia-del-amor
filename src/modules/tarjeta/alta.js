// El alta de la tarjeta, hecha por el propio cliente. Lógica PURA: sin Express, sin DOM y sin SQL.
//
// Dos entradas y una sola puerta:
//   · desde la web  → /alta.html
//   · desde el local → /alta.html?l=La%20Tapeta%20-%20Blanes  (el QR del cartel de la mesa)
//
// NO hay alta automática ni emisión en masa. La tarjeta se la hace quien la quiere, y por eso
// este módulo existe: si el alta la disparase el formulario de leads o una campaña, no haría
// falta decidir nada de lo que se decide aquí.

/** Los últimos 9 dígitos: la misma clave con la que cruza todo el CRM (ver `tel9` en
 *  promos.js y MATCH_TEL9 en server.js). Se repite la función y no se importa para que este
 *  módulo no arrastre promos entero a un test de tres líneas. */
export function tel9(t) {
  return String(t || "").replace(/\D/g, "").slice(-9);
}

const texto = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

/** Un correo suficientemente correo. No se valida más: rechazar direcciones raras que existen
 *  cuesta altas de verdad, y el correo aquí es opcional. */
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Saneado del formulario. Mismo contrato que `sanearPromocion()`: devuelve TAMBIÉN lo que se ha
 * caído, porque un campo que desaparece en silencio se convierte en «pues yo lo puse» delante
 * de un camarero que no puede hacer nada.
 *
 * `locales` es la lista blanca de locales reales: el `?l=` de la URL viene de un cartel impreso,
 * pero un cartel se fotografía y el enlace se edita, y `local_alta` acaba en estadísticas.
 */
export function sanearAlta(crudo = {}, { locales = [] } = {}) {
  const descartados = [];
  const a = {};

  a.nombre = texto(crudo.nombre, 80);
  if (!a.nombre) descartados.push({ campo: "nombre", motivo: "Dinos cómo te llamas" });

  // El teléfono es la identidad. Sin él no hay tarjeta: es lo que ata esta fila a las visitas,
  // a las reservas y a los cupones que ya tuviera esta persona.
  const digitos = String(crudo.telefono || "").replace(/\D/g, "");
  a.telefono = digitos.length >= 9 ? digitos : "";
  if (!a.telefono) descartados.push({ campo: "telefono", motivo: "El teléfono no está completo" });

  const correo = texto(crudo.correo, 120);
  if (correo && !CORREO.test(correo)) {
    descartados.push({ campo: "correo", valor: correo, motivo: "Ese correo no parece válido" });
    a.correo = "";
  } else {
    a.correo = correo;
  }

  // Consentimiento explícito, y por defecto NO. Marcarlo por omisión sería meter a alguien en
  // una lista de difusión porque se hizo una tarjeta de fidelidad, que no es lo mismo.
  a.opt_in = crudo.consent === true || crudo.consent === 1 || crudo.consent === "1";

  const pedido = texto(crudo.local, 80);
  if (pedido) {
    const encaja = (Array.isArray(locales) ? locales : []).find(
      (l) => String(l).toLowerCase() === pedido.toLowerCase());
    if (encaja) a.local_alta = encaja;
    else { a.local_alta = null; descartados.push({ campo: "local", valor: pedido, motivo: "Ese local no existe" }); }
  } else {
    a.local_alta = null;
  }

  // El origen se deduce del local y no se acepta del cliente: si viniera en el cuerpo, cualquiera
  // podría escribir «local» desde su casa y las cuentas del cartel dejarían de significar nada.
  a.origen = a.local_alta ? "local" : "web";

  return { alta: a, descartados };
}

/**
 * QUÉ SE LE ENSEÑA AL QUE ACABA DE ENVIAR EL FORMULARIO.
 *
 * Esta es la decisión delicada del módulo, y es la misma que ya razonó `bienvenidaWeb()` para
 * el cupón del 10 %: el formulario es público y la única prueba de identidad es escribir un
 * teléfono. Si la respuesta enseñara siempre la tarjeta, cualquiera podría ir probando móviles
 * ajenos y quedarse con el enlace —y con él, con las visitas y los descuentos— de otra persona.
 *
 *   · Teléfono SIN tarjeta previa → se le crea y se le enseña aquí mismo. No hay nada de nadie
 *     que revelar: la acaba de crear él.
 *   · Teléfono que YA TENÍA tarjeta → no se enseña NADA. Se le reenvía el enlace por WhatsApp,
 *     al móvil que ha escrito, y se le dice eso. Quien sea el dueño lo recibe; quien esté
 *     probando teléfonos ajenos se lleva una frase que no le confirma gran cosa.
 *
 * Y por eso el texto de las dos ramas dice lo mismo sobre el WhatsApp: si una dijera «te lo
 * hemos mandado» y la otra no, la diferencia entre las dos frases sería exactamente el oráculo
 * que esto intenta no ser.
 */
export function respuestaAlta({ yaTenia = false, token = "", enviado = false } = {}) {
  if (yaTenia) {
    return {
      revelar: false,
      token: "",
      titulo: "Ya tienes tarjeta",
      texto: enviado
        ? "Te la hemos vuelto a mandar por WhatsApp al número que nos has dado."
        : "Búscala en el WhatsApp que te mandamos cuando te la hiciste. Si no la encuentras, pídenosla en el local.",
    };
  }
  return {
    revelar: true,
    token,
    titulo: "Ya es tuya",
    texto: enviado
      ? "También te la hemos mandado por WhatsApp, para que la tengas a mano."
      : "Guárdala en el móvil desde el botón de abajo y enséñala cuando vengas.",
  };
}

/** El mensaje de WhatsApp del alta. Vive aquí, junto a la decisión de a quién se le manda, y no
 *  suelto en server.js: son la misma regla contada dos veces. */
export function textoWhatsApp({ nombre = "", url = "", yaTenia = false } = {}) {
  const n = String(nombre || "").split(" ")[0];
  const hola = n ? `Hola ${n} 👋` : "Hola 👋";
  return yaTenia
    ? `${hola}\n\nAquí tienes otra vez tu tarjeta de Familia del Amor:\n${url}`
    : `${hola}\n\nYa tienes tu tarjeta de Familia del Amor. Enséñala cuando vengas y te reconocemos al momento — y ahí ves tus visitas y tus descuentos:\n${url}`;
}
