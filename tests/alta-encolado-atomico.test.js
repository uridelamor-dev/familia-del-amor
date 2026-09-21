// EL ALTA DEJA SU MENSAJE EN LA COLA, O NO DEJA NADA.
//
// ── EL ESTADO QUE ESTE FICHERO EXISTE PARA QUE NO VUELVA ─────────────────────────────────────
//
// «Lead creado, código creado, ninguna fila en `cap_cola`». Esa persona tiene su cupón emitido y
// nada que enviarle: no sale como fallo, porque no hay fallo — no hay fila. Y en el camino
// clásico el sistema se cerraba encima, porque al reintentar reconocía el cupón y contestaba «te
// mandamos tu código en su día», que no era verdad.
//
// ── CÓMO SE PRUEBA SIN MANDAR NI UN WHATSAPP ────────────────────────────────────────────────
//
// No se importa `whatsapp.js` en ninguna línea: no hay socket, no hay Baileys, no puede salir un
// mensaje. Lo que se simula es lo único que decide aquí: una base con transacciones DE VERDAD
// —con su `ROLLBACK`— para poder provocar el fallo justo entre emitir el código y encolar, y ver
// qué queda después.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { renderPlantilla, LARGOS } from "../src/modules/fidelizacion/contenido.js";
import { plantillaWhatsApp, textoWhatsApp } from "../src/modules/captacion/mensaje.js";

const SERVER = readFileSync(new URL("../server.js", import.meta.url), "utf8");

/**
 * Extrae un bloque contando llaves. LANZA si el ancla no está, en vez de aprobar el vacío.
 *
 * La llave del CUERPO no es siempre la primera: `function f({ a, b }) {` abre una antes, la del
 * destructuring de los parámetros. Si se cuenta esa, el bloque se cierra en la lista de
 * argumentos y las aserciones caen sobre nada — que es la clase de falso negativo que este
 * fichero existe para no tener. Se busca la primera llave que esté FUERA de paréntesis.
 */
function bloque(texto, ancla) {
  const i = texto.indexOf(ancla);
  if (i === -1) throw new Error(`ancla no encontrada: «${ancla}»`);
  let par = 0, abre = -1;
  for (let k = i; k < texto.length; k++) {
    const c = texto[k];
    if (c === "(") par++;
    else if (c === ")") par--;
    else if (c === "{" && par === 0) { abre = k; break; }
  }
  if (abre === -1) throw new Error(`no hay cuerpo tras «${ancla}»`);
  let prof = 0, j = abre;
  for (; j < texto.length; j++) {
    if (texto[j] === "{") prof++;
    else if (texto[j] === "}") { prof--; if (prof === 0) { j++; break; } }
  }
  return texto.slice(i, j);
}

const ALTA_CLASICA = bloque(SERVER, 'app.post("/api/captacion", async');
const ALTA_FORM = bloque(SERVER, 'app.post("/api/publico/formulario/:clave"');
const RECONCILIADOR = bloque(SERVER, "async function capReconciliar()");
const COMPONER = bloque(SERVER, "function capComponerAlta(");

// ═════════════════════════════════════════════════════════════════════════════════════════════
//  UNA BASE CON TRANSACCIONES DE VERDAD
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Lo justo para esta prueba: `pro_qr` y `cap_cola`, y una transacción que deshace lo escrito si
 * el bloque lanza. Es lo que permite comprobar la única propiedad que importa — que emitir y
 * encolar caen juntos o no caen — sin levantar PostgreSQL.
 */
class BaseFalsa {
  constructor() { this.qr = []; this.cola = []; this.seq = 0; }

  async transaccion(fn) {
    const antesQr = [...this.qr], antesCola = [...this.cola], antesSeq = this.seq;
    try {
      return await fn({
        emitir: (fila) => { const q = { id: ++this.seq, ...fila }; this.qr.push(q); return q; },
        encolar: (fila) => {
          // La guarda por identidad: campaña + cupón. Es la del `WHERE NOT EXISTS` del servidor.
          if (this.cola.some((c) => c.campana === fila.campana && c.qr_id === fila.qr_id)) return null;
          const c = { id: ++this.seq, estado: "pendiente", enviado_en: null, intentos: 0, ...fila };
          this.cola.push(c);
          return c;
        },
      });
    } catch (e) {
      // ROLLBACK. Sin esto, el código emitido sobreviviría al fallo del encolado — que es
      // exactamente el estado huérfano.
      this.qr = antesQr; this.cola = antesCola; this.seq = antesSeq;
      throw e;
    }
  }

  /** El worker, resumido. `whatsappListo` y `cupo` son los dos frenos que no dejan error. */
  vaciar({ whatsappListo = true, cupo = Infinity, falla = () => false } = {}) {
    if (!whatsappListo) return 0;
    let salidas = 0;
    for (const f of this.cola) {
      if (f.estado !== "pendiente") continue;
      if (salidas >= cupo) break;
      f.intentos += 1;
      if (falla(f)) { f.estado = "fallido"; f.ultimo_error = "socket caído"; continue; }
      f.estado = "enviado"; f.enviado_en = "2026-09-21T10:00:00+02:00"; salidas += 1;
    }
    return salidas;
  }

  huerfanos() {
    return this.qr.filter((q) => !this.cola.some((c) => c.qr_id === q.id));
  }
}

/** Un alta, como la hace el servidor: emitir y encolar en la MISMA transacción. */
async function alta(base, { campana = "c1", telefono = "600000001", plantilla = "Tu código: {enlace}",
                            reventarAlEncolar = false } = {}) {
  return base.transaccion(async (x) => {
    const qr = x.emitir({ clase: "cupon", telefono, campana });
    if (!plantilla) return { qr, encolado: false };
    if (reventarAlEncolar) throw new Error("la base se cayó justo aquí");
    const fila = x.encolar({ campana, telefono, qr_id: qr.id, texto: plantilla.replace("{enlace}", `https://x/?t=t${qr.id}`) });
    return { qr, encolado: !!fila };
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════

describe("emitir el código y encolar su mensaje caen juntos", () => {
  test("el camino normal deja el código Y su fila", async () => {
    const b = new BaseFalsa();
    const r = await alta(b);
    assert.equal(b.qr.length, 1);
    assert.equal(b.cola.length, 1);
    assert.equal(b.cola[0].qr_id, r.qr.id, "la fila de la cola apunta al código de esa persona");
    assert.deepEqual(b.huerfanos(), []);
  });

  test("FALLO DELIBERADO entre emitir y encolar: no queda NADA a medias", async () => {
    // Es el escenario entero de este fichero. Antes eran dos escrituras sueltas: el código
    // sobrevivía, la fila no, y nadie podía saberlo.
    const b = new BaseFalsa();
    await assert.rejects(() => alta(b, { reventarAlEncolar: true }), /se cayó/);
    assert.equal(b.qr.length, 0, "el código ha sobrevivido al fallo del encolado: está huérfano");
    assert.equal(b.cola.length, 0);
    assert.deepEqual(b.huerfanos(), []);

    // Y volver a intentarlo funciona, porque no quedó nada que estorbara.
    await alta(b);
    assert.equal(b.qr.length, 1);
    assert.equal(b.cola.length, 1);
  });

  test("sin plantilla se emite el código y NO se encola nada, y eso no es un huérfano", async () => {
    const b = new BaseFalsa();
    await alta(b, { plantilla: "" });
    assert.equal(b.qr.length, 1);
    assert.equal(b.cola.length, 0, "una campaña sin plantilla no escribe a nadie");
  });
});

describe("lo que pasa cuando WhatsApp no está", () => {
  test("desconectado: la fila queda pendiente, SIN gastar intentos, y sale sola al volver", async () => {
    const b = new BaseFalsa();
    await alta(b);
    assert.equal(b.vaciar({ whatsappListo: false }), 0);
    assert.equal(b.cola[0].estado, "pendiente");
    assert.equal(b.cola[0].intentos, 0,
      "un WhatsApp caído no es un intento fallido: gastar reintentos por eso agota el mensaje");
    assert.equal(b.vaciar(), 1, "al reconectar tiene que salir solo");
  });

  test("cuota diaria agotada: queda pendiente y continúa al día siguiente", async () => {
    const b = new BaseFalsa();
    await alta(b, { telefono: "600000001" });
    await alta(b, { telefono: "600000002", campana: "c1" });
    assert.equal(b.vaciar({ cupo: 1 }), 1, "solo sale lo que cabe en el cupo");
    assert.equal(b.cola.filter((c) => c.estado === "pendiente").length, 1);
    assert.equal(b.vaciar(), 1, "al día siguiente sale el que quedaba");
  });

  test("reinicio del proceso: lo pendiente sobrevive porque está en la base", async () => {
    // Se simula el reinicio perdiendo TODO lo que vive en memoria y quedándose solo con las
    // tablas. Si la cola fuera una variable del proceso, aquí se perdería el mensaje.
    const b = new BaseFalsa();
    await alta(b);
    b.vaciar({ whatsappListo: false });
    const persistido = { qr: JSON.parse(JSON.stringify(b.qr)), cola: JSON.parse(JSON.stringify(b.cola)) };

    const trasReinicio = new BaseFalsa();
    trasReinicio.qr = persistido.qr; trasReinicio.cola = persistido.cola;
    assert.equal(trasReinicio.cola[0].estado, "pendiente");
    assert.equal(trasReinicio.vaciar(), 1, "el pendiente no sobrevivió al reinicio");
  });

  test("un fallo temporal no pierde el envío: queda reintentable", async () => {
    const b = new BaseFalsa();
    await alta(b);
    b.vaciar({ falla: () => true });
    assert.equal(b.cola[0].estado, "fallido");
    b.cola[0].estado = "pendiente";                    // lo que hace el reintento
    assert.equal(b.vaciar(), 1, "el reintento de un fallo real tiene que acabar saliendo");
  });
});

describe("reenviar el formulario no duplica mensajes", () => {
  test("dos altas seguidas del mismo cupón: una sola fila", async () => {
    const b = new BaseFalsa();
    const r = await alta(b);
    // La segunda vez el cupón ya existe: el servidor no emite otro y solo intenta encolar.
    const segunda = await b.transaccion(async (x) =>
      x.encolar({ campana: "c1", telefono: "600000001", qr_id: r.qr.id, texto: "otro" }));
    assert.equal(segunda, null, "la guarda por identidad no ha impedido la segunda fila");
    assert.equal(b.cola.length, 1);
    assert.equal(b.vaciar(), 1, "esa persona ha recibido el mensaje dos veces");
  });

  test("dos campañas distintas sobre el mismo cupón sí dan dos mensajes", async () => {
    const b = new BaseFalsa();
    const r = await alta(b, { campana: "a" });
    await b.transaccion(async (x) =>
      x.encolar({ campana: "b", telefono: "600000001", qr_id: r.qr.id, texto: "otra campaña" }));
    assert.equal(b.cola.length, 2, "apuntarse a dos campañas tiene que dar dos mensajes");
  });
});

describe("el enlace que llega al cliente es el suyo, y entero", () => {
  test("{enlace} no se trunca ni con el dominio más largo", () => {
    // `renderPlantilla` recortaba CADA variable al largo de un nombre (120). El enlace de
    // producción mide 85 y el del entorno de Replit 111: quedaban nueve de margen, y recortar una
    // URL no la acorta, la rompe.
    const P = "Aquí tens el teu codi:\n{enlace}\n\nLa Tapeta";
    for (const url of [
      "https://familiadelamor.org/tarjeta.html?t=" + "A".repeat(43),
      "https://familia-del-amor-uridelamorayllon.replit.app/tarjeta.html?t=" + "A".repeat(43),
      "https://" + "s".repeat(120) + ".example.org/tarjeta.html?t=" + "A".repeat(43),
    ]) {
      const salida = renderPlantilla(P, { enlace: url }).split("\n").find((l) => l.startsWith("https"));
      assert.equal(salida, url, `el enlace de ${url.length} caracteres ha salido cortado`);
    }
    assert.ok(LARGOS.url >= 300, "el largo de una URL se ha quedado corto");
  });

  test("cada destinatario recibe SU enlace, no el del de al lado", async () => {
    const b = new BaseFalsa();
    const uno = await alta(b, { telefono: "600000001" });
    const dos = await alta(b, { telefono: "600000002" });
    const suyo = (qrId) => b.cola.find((c) => c.qr_id === qrId).texto;
    assert.match(suyo(uno.qr.id), new RegExp(`t${uno.qr.id}$`));
    assert.match(suyo(dos.qr.id), new RegExp(`t${dos.qr.id}$`));
    assert.notEqual(suyo(uno.qr.id), suyo(dos.qr.id));
  });

  test("los dos caminos componen el enlace con `proEnlace`, nunca a mano", () => {
    // `proEnlace` es el único sitio de la casa que compone la URL de un QR, y el que decide entre
    // `/cupon.html` y la tarjeta según la CLASE del código y el interruptor. El camino clásico
    // llamaba a `proUrl` directamente, que es la mitad de abajo de esa decisión.
    assert.match(COMPONER, /enlace: proEnlace\(req, qr\)/,
      "el mensaje del camino clásico ya no compone su enlace con proEnlace");
    assert.match(ALTA_FORM, /enlace: proEnlace\(req, qr\)/,
      "el mensaje del formulario configurable ya no compone su enlace con proEnlace");
    for (const [nombre, texto] of [["clásico", ALTA_CLASICA], ["configurable", ALTA_FORM]]) {
      assert.ok(!/proUrl\(req/.test(texto),
        `el camino ${nombre} vuelve a componer la URL saltándose proEnlace`);
      assert.ok(!/tarjeta\.html\?t=|cupon\.html\?t=/.test(texto),
        `el camino ${nombre} tiene una URL de QR escrita a mano`);
    }
  });

  test("y la clase del QR no se toca: un cupón sigue siendo un cupón", () => {
    assert.match(ALTA_CLASICA, /clase: "cupon"/,
      "el camino clásico ha cambiado de cupón a carné: eso es un cambio de negocio, no una reparación");
    assert.match(ALTA_FORM, /clase: "carnet"/, "el formulario configurable ha dejado de emitir carné");
  });
});

describe("una campaña puede decir que no manda WhatsApp", () => {
  test("apagada explícitamente: no hay plantilla que componer", () => {
    const r = plantillaWhatsApp({ textos: JSON.stringify({ wa_activo: false, es: { wa: "algo" } }) }, "es");
    assert.equal(r.activo, false);
    assert.equal(r.plantilla, "");
  });

  test("vacía sigue usando la de la casa: no se cambia lo que ya funciona", () => {
    // El editor dice desde siempre «se deja vacío para usar el de por defecto», y hay campañas
    // vivas contando con eso. Cambiar el significado del vacío las dejaría mudas de un
    // despliegue a otro sin que nadie hubiera tocado nada.
    const r = plantillaWhatsApp({ textos: JSON.stringify({ es: { wa: "" } }) }, "es");
    assert.equal(r.activo, true);
    assert.equal(r.motivo, "por_defecto");
    assert.ok(r.plantilla.includes("{enlace}"), "la plantilla de la casa tiene que llevar el enlace");
  });

  test("su texto propio gana, y dos campañas dan mensajes distintos", () => {
    const a = plantillaWhatsApp({ textos: JSON.stringify({ ca: { wa: "Esmorzar: {enlace}" } }) }, "ca");
    const b = plantillaWhatsApp({ textos: JSON.stringify({ ca: { wa: "Sopar: {enlace}" } }) }, "ca");
    assert.equal(a.motivo, "propia");
    assert.notEqual(
      textoWhatsApp({ plantilla: a.plantilla, enlace: "https://x/?t=1" }),
      textoWhatsApp({ plantilla: b.plantilla, enlace: "https://x/?t=1" }));
  });

  test("unos textos corruptos no apagan la campaña por accidente", () => {
    assert.equal(plantillaWhatsApp({ textos: "{roto" }, "es").activo, true);
    assert.equal(plantillaWhatsApp({}, "es").activo, true);
  });

  test("el servidor decide con esa función y no con `textosDe`", () => {
    assert.match(COMPONER, /capPlantillaWA\(campana, idioma\)/,
      "el alta clásica ha vuelto a coger la plantilla sin mirar si la campaña quiere mandar");
    assert.match(COMPONER, /if \(!p\.activo/, "no se respeta el interruptor");
  });
});

describe("el reconciliador es una red, no el mecanismo", () => {
  test("el alta deja su fila ANTES de contestar: no depende del reconciliador", () => {
    // Si el flujo normal dependiera de la pasada de cinco minutos, quien se apunta esperaría ese
    // tiempo en el mejor de los casos, y el «se ha enviado» de la pantalla sería una promesa.
    // Se compara la POSICIÓN, no una ventana de caracteres: cuántos hay en medio depende de los
    // comentarios, y un candado que se rompe al escribir un comentario no vigila nada.
    for (const [nombre, texto] of [["clásica", ALTA_CLASICA], ["configurable", ALTA_FORM]]) {
      const encola = texto.indexOf("INSERT INTO cap_cola");
      const responde = texto.lastIndexOf("res.json");
      assert.ok(encola > 0, `el alta ${nombre} ya no encola`);
      assert.ok(encola < responde,
        `el alta ${nombre} responde ANTES de dejar la fila: el «se ha enviado» de la pantalla ` +
        `sería una promesa que depende de una pasada posterior`);
    }
  });

  test("solo mira códigos vivos, de campaña, sin salida y SIN NINGUNA fila", () => {
    assert.match(RECONCILIADOR, /NOT EXISTS \(SELECT 1 FROM cap_cola q WHERE q\.qr_id = r\.id\)/,
      "la definición de «huérfano» ha cambiado: tiene que ser «no hay fila», no «falló»");
    assert.match(RECONCILIADOR, /r\.anulado_en IS NULL/, "no puede escribir a un código anulado");
    assert.match(RECONCILIADOR, /r\.enviado_en IS NULL/, "no puede reescribir a quien ya lo recibió");
    assert.match(RECONCILIADOR, /LIMIT \?/, "tiene que ir por lotes");
  });

  test("no emite códigos, no manda nada y no toca la identidad de nadie", () => {
    assert.ok(!/proEmitir\(/.test(RECONCILIADOR),
      "el reconciliador emite códigos: mandaría uno nuevo a quien ya tiene el suyo");
    assert.ok(!/sendMensajeLibre|proEnviarWA/.test(RECONCILIADOR),
      "el reconciliador manda por su cuenta: se salta el ritmo, el cupo y el tope diario");
    assert.ok(!/UPDATE pro_qr|DELETE/.test(RECONCILIADOR), "el reconciliador modifica códigos");
  });

  test("avisa cuando encuentra algo, porque encontrarlo YA es una anomalía", () => {
    assert.match(RECONCILIADOR, /console\.warn/,
      "si el reconciliador encola algo, el flujo normal ha fallado y tiene que constar");
  });

  test("está programado, y con el mismo ritmo que el de Wallet", () => {
    assert.match(SERVER, /setInterval\(\(\) => \{ capReconciliar\(\)[\s\S]{0,40}5 \* 60 \* 1000\)/,
      "el reconciliador no corre solo: sin temporizador sigue dependiendo de que alguien pulse");
  });
});

describe("la pantalla de gracias no promete lo que no ha pasado", () => {
  test("«ya registrado» solo lo dice si consta salida; si no, repara", () => {
    assert.match(ALTA_CLASICA, /fila && \(fila\.enviado_en \|\| fila\.estado === "enviado"\)/,
      "vuelve a afirmarse que se envió sin mirar si salió");
    assert.match(ALTA_CLASICA, /capEncolarAlta\(/,
      "si no consta envío hay que repararlo: dejarlo pasar deja a esa persona sin salida");
  });

  test("encolado NO es enviado: no se promete un WhatsApp que la campaña no manda", () => {
    assert.match(ALTA_CLASICA, /salida\.encolado\s*\?/,
      "la pantalla promete un mensaje aunque la campaña no mande ninguno");
  });
});

describe("no se ha tocado lo que no había que tocar", () => {
  test("la transacción del alta solo escribe en PostgreSQL", () => {
    // El aviso del usuario, convertido en candado: una transacción que espera a un socket se
    // queda abierta cuando el socket no contesta, y bloquea filas mientras tanto.
    for (const [nombre, texto] of [["clásica", ALTA_CLASICA], ["configurable", ALTA_FORM]]) {
      const tx = texto.slice(texto.indexOf("fidTransaccion(async (x)"));
      const hasta = tx.indexOf("});");
      const cuerpo = hasta > 0 ? tx.slice(0, hasta) : tx;
      for (const prohibido of ["numeroTieneWhatsApp", "sendMensajeLibre", "capVaciarCola",
                               "baseEnlaces(", "fetch(", "marcarPaseActualizado"]) {
        assert.ok(!cuerpo.includes(prohibido),
          `la transacción del alta ${nombre} llama a «${prohibido}», que no es persistencia`);
      }
    }
  });

  test("no se enciende la tarjeta ni se toca Wallet desde el alta", () => {
    for (const texto of [ALTA_CLASICA, COMPONER, RECONCILIADOR]) {
      assert.ok(!/TARJETA_ACTIVA\s*=/.test(texto), "se está cambiando el interruptor de la tarjeta");
      assert.ok(!/wallet_|walVaciarCola|apnsAvisar/.test(texto), "el alta toca Wallet");
    }
  });

  test("`proEmitir` sigue funcionando igual para quien no le pasa transacción", () => {
    const emitir = bloque(SERVER, "async function proEmitir(");
    assert.match(emitir, /cliente = null/, "el cliente de transacción tiene que ser opcional");
    assert.match(emitir, /const correr = cliente \? \(q, p\) => cliente\.run\(q, p\) : dbRun/,
      "sin transacción tiene que seguir usando dbRun, como los otros ocho sitios que lo llaman");
  });
});
