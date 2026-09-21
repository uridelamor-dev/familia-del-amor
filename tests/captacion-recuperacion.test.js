// RECUPERAR LOS MENSAJES QUE NUNCA SALIERON.
//
// ── CÓMO SE PRUEBA ESTO SIN MANDAR NI UN WHATSAPP ────────────────────────────────────────────
//
// No se importa `whatsapp.js` en ningún sitio de este fichero, así que no hay socket, no hay
// Baileys y no hay forma de que salga un mensaje real. Lo que se prueba es la DECISIÓN: a quién
// alcanza cada acción y qué pasa al repetirla.
//
// La cola se simula con `ColaFalsa`, que respeta lo único que importa de `cap_cola` para esto:
// que `token` es UNIQUE y que un `ON CONFLICT DO NOTHING` no escribe. Si esa simulación se
// separara de la tabla real los tests dejarían de valer, así que hay una prueba que lee el SQL
// del servidor y comprueba que sigue siendo `ON CONFLICT (token) DO NOTHING`.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ESTADOS, ETIQUETAS, REINTENTABLES, puedeReintentar, claveRecuperacion,
         esRecuperacion, clasificar, telefonoValido, censar, motivoParada,
         aQuienAlcanza, ACCIONES, accionValida } from "../src/modules/captacion/recuperacion.js";

const SERVER = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const APP = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

/**
 * El cuerpo de un bloque, extraído CONTANDO LLAVES desde un ancla.
 *
 * No se usa `slice(indexOf(a), indexOf(b))`: si cualquiera de las dos anclas no está —porque se
 * renombró, o porque vive en un comentario que otro helper ha borrado— ese patrón devuelve la
 * cadena vacía y el test aprueba TODO sin comprobar nada. Es el fallo que una auditoría encontró
 * en nueve tests de esta casa. Aquí, si el ancla no aparece, se lanza.
 */
function bloqueDesde(texto, ancla) {
  const i = texto.indexOf(ancla);
  if (i === -1) throw new Error(`ancla no encontrada en el fuente: «${ancla}»`);
  const abre = texto.indexOf("{", i);
  if (abre === -1) throw new Error(`no hay bloque después de «${ancla}»`);
  let prof = 0, j = abre;
  for (; j < texto.length; j++) {
    if (texto[j] === "{") prof++;
    else if (texto[j] === "}") { prof--; if (prof === 0) { j++; break; } }
  }
  return texto.slice(i, j);
}

const RECUPERAR = bloqueDesde(SERVER, 'app.post("/api/captacion/campanas/:clave/recuperar"');
const CENSO = bloqueDesde(SERVER, 'app.get("/api/captacion/campanas/:clave/censo"');
const REC_ACCION = bloqueDesde(APP, "async function capRecAccion");
const REC_CUERPO = bloqueDesde(APP, "function capRecCuerpo");

const TEL = "600000001";
const OTRO = "600000002";

/**
 * Una cola con lo justo de `cap_cola`: estados, `enviado_en` y un `token` ÚNICO.
 *
 * `insertar` devuelve `null` si el token ya existía, igual que el `ON CONFLICT DO NOTHING
 * RETURNING id` del servidor. Es la pieza sobre la que se apoya toda la idempotencia.
 */
class ColaFalsa {
  constructor() { this.filas = []; this.enviados = 0; }
  insertar({ token, campana, telefono, qrId, texto }) {
    if (this.filas.some((f) => f.token === token)) return null;
    const fila = { id: this.filas.length + 1, token, campana, telefono, qr_id: qrId, texto,
                   estado: "pendiente", enviado_en: null, intentos: 0 };
    this.filas.push(fila);
    return fila;
  }
  /** El worker, resumido: manda lo pendiente. `falla` decide cuáles revientan. */
  vaciar({ whatsappListo = true, falla = () => false } = {}) {
    if (!whatsappListo) return;                   // el freno real: ni se intenta, ni deja error
    for (const f of this.filas) {
      if (f.estado !== "pendiente") continue;
      f.intentos += 1;
      if (falla(f)) { f.estado = "fallido"; f.ultimo_error = "socket caído"; continue; }
      f.estado = "enviado"; f.enviado_en = "2026-09-21T10:00:00+02:00"; this.enviados += 1;
    }
  }
  /** El `UPDATE` del reintento, con su mismo `WHERE`. */
  reintentar(telefono) {
    const f = this.filas.find((x) => x.telefono === telefono && REINTENTABLES.includes(x.estado));
    if (!f) return null;
    f.estado = "pendiente"; f.intentos = 0; f.ultimo_error = null;
    return f;
  }
  de(telefono) { return this.filas.filter((f) => f.telefono === telefono); }
  paraDestinatario(telefono) {
    const suyas = this.de(telefono);
    return suyas.find((f) => f.enviado_en || f.estado === "enviado") || suyas[suyas.length - 1] || null;
  }
}

/** Lo que hace el endpoint «Enviar pendientes», con las mismas dos capas de candado. */
function enviarPendientes(cola, destinatarios, campana) {
  let hechos = 0, omitidos = 0;
  for (const d of aQuienAlcanza("pendientes", destinatarios)) {
    const token = claveRecuperacion({ campana, qrId: d.qrId });
    if (!token) { omitidos += 1; continue; }
    const met = cola.insertar({ token, campana, telefono: d.telefono, qrId: d.qrId,
                                texto: `código de ${campana} → qr ${d.qrId}` });
    if (met) hechos += 1; else omitidos += 1;
  }
  return { hechos, omitidos };
}

/** Lo que hace el endpoint «Reintentar errores». */
function reintentarErrores(cola, destinatarios) {
  let hechos = 0, omitidos = 0;
  for (const d of aQuienAlcanza("reintentar", destinatarios)) {
    if (cola.reintentar(d.telefono)) hechos += 1; else omitidos += 1;
  }
  return { hechos, omitidos };
}

/** El censo se recalcula SIEMPRE desde la cola, nunca se arrastra. */
const censoDe = (cola, gente) =>
  gente.map((g) => ({ ...g, cola: cola.paraDestinatario(g.telefono) }));

// ═════════════════════════════════════════════════════════════════════════════════════════════

describe("en qué estado está cada persona", () => {
  test("sin teléfono válido no hay nada que hacer", () => {
    assert.equal(clasificar({ telefono: "", qrId: 7 }), ESTADOS.SIN_TELEFONO);
    assert.equal(clasificar({ telefono: "12345", qrId: 7 }), ESTADOS.SIN_TELEFONO);
    assert.equal(telefonoValido("600 00 00 01"), true);
    assert.equal(telefonoValido("+34600000001"), true);
  });

  test("la baja manda sobre cualquier otra cosa, incluso sobre una fila pendiente", () => {
    const e = clasificar({ telefono: TEL, qrId: 7, baja: true, cola: { estado: "pendiente" } });
    assert.equal(e, ESTADOS.BAJA,
      "quien pidió que no le escribiéramos no puede salir en «pendientes» esperando su turno");
  });

  test("con código y sin fila es el agujero que hay que tapar", () => {
    assert.equal(clasificar({ telefono: TEL, qrId: 7, cola: null }), ESTADOS.SIN_COLA);
  });

  test("sin código no se puede componer el mensaje", () => {
    assert.equal(clasificar({ telefono: TEL, qrId: null, cola: null }), ESTADOS.SIN_QR);
  });

  test("`enviado_en` gana al estado: es el único dato que registra un HECHO", () => {
    const e = clasificar({ telefono: TEL, qrId: 7, cola: { estado: "fallido", enviado_en: "2026-09-21" } });
    assert.equal(e, ESTADOS.ENVIADO,
      "si consta la fecha de salida, salió, diga lo que diga la columna de estado");
  });

  test("cada etiqueta tiene su texto y no falta ninguna", () => {
    for (const e of Object.values(ESTADOS)) {
      assert.ok(ETIQUETAS[e], `el estado «${e}» no tiene etiqueta`);
    }
  });
});

describe("una alta nueva", () => {
  test("con WhatsApp conectado, sale UNA vez", () => {
    const cola = new ColaFalsa();
    cola.insertar({ token: "alta:1", campana: "c1", telefono: TEL, qrId: 7 });
    cola.vaciar();
    assert.equal(cola.enviados, 1);
    assert.equal(clasificar({ telefono: TEL, qrId: 7, cola: cola.paraDestinatario(TEL) }), ESTADOS.ENVIADO);

    // Y una segunda pasada del worker NO la vuelve a mandar.
    cola.vaciar();
    assert.equal(cola.enviados, 1, "el worker ha reenviado algo que ya estaba enviado");
  });

  test("con WhatsApp desconectado, queda recuperable y NO se pierde el alta", () => {
    const cola = new ColaFalsa();
    cola.insertar({ token: "alta:1", campana: "c1", telefono: TEL, qrId: 7 });
    cola.vaciar({ whatsappListo: false });

    assert.equal(cola.enviados, 0);
    const fila = cola.paraDestinatario(TEL);
    assert.equal(fila.estado, "pendiente", "un WhatsApp caído no puede marcar la fila como fallida");
    assert.equal(fila.intentos, 0, "ni siquiera se intentó: no hay que gastar reintentos");
    // El alta y el código siguen ahí: es lo que se le prometió al cliente.
    assert.equal(clasificar({ telefono: TEL, qrId: 7, cola: fila }), ESTADOS.PENDIENTE);

    // Y al volver WhatsApp, sale solo.
    cola.vaciar();
    assert.equal(cola.enviados, 1);
  });

  test("si el encolado nunca ocurrió, la persona queda SIN_COLA y es recuperable", () => {
    // Es el caso real: el lead y el cupón se crearon, el INSERT en la cola se cayó.
    const gente = [{ telefono: TEL, qrId: 7 }];
    const cola = new ColaFalsa();
    assert.equal(censar(censoDe(cola, gente)).sin_cola, 1);
    assert.equal(censar(censoDe(cola, gente)).recuperables, 1);
  });
});

describe("un fallo real de envío", () => {
  test("deja la fila reintentable, y el reintento la saca", () => {
    const cola = new ColaFalsa();
    cola.insertar({ token: "alta:1", campana: "c1", telefono: TEL, qrId: 7 });
    cola.vaciar({ falla: () => true });

    const gente = [{ telefono: TEL, qrId: 7 }];
    assert.equal(censar(censoDe(cola, gente)).error, 1);
    assert.equal(puedeReintentar("fallido"), true);
    assert.equal(puedeReintentar("descartado"), true);
    assert.equal(puedeReintentar("pendiente"), false, "lo pendiente ya está en cola");
    assert.equal(puedeReintentar("enviado"), false);

    const r = reintentarErrores(cola, censoDe(cola, gente));
    assert.equal(r.hechos, 1);
    cola.vaciar();
    assert.equal(cola.enviados, 1, "el reintento legítimo tiene que acabar saliendo");
  });
});

describe("pulsar dos veces no manda nada dos veces", () => {
  test("«Enviar pendientes» dos veces seguidas escribe UNA fila", () => {
    const cola = new ColaFalsa();
    const gente = [{ telefono: TEL, qrId: 7 }];

    const a = enviarPendientes(cola, censoDe(cola, gente), "c1");
    const b = enviarPendientes(cola, censoDe(cola, gente), "c1");

    assert.equal(a.hechos, 1);
    assert.equal(b.hechos, 0, "la segunda pulsación ha vuelto a encolar");
    assert.equal(cola.filas.length, 1);
    cola.vaciar();
    assert.equal(cola.enviados, 1, "esa persona ha recibido el mensaje dos veces");
  });

  test("dos peticiones a la vez (dos pestañas) escriben UNA fila", () => {
    const cola = new ColaFalsa();
    const gente = [{ telefono: TEL, qrId: 7 }];
    // Las dos leen el MISMO censo —nadie ha escrito aún— y las dos intentan escribir.
    const censo = censoDe(cola, gente);
    const a = enviarPendientes(cola, censo, "c1");
    const b = enviarPendientes(cola, censo, "c1");
    assert.equal(a.hechos + b.hechos, 1,
      "la clave determinista es lo que resuelve la carrera; sin ella salen dos filas");
    assert.equal(cola.filas.length, 1);
  });

  test("«Enviar pendientes» NO alcanza a quien ya lo recibió", () => {
    const cola = new ColaFalsa();
    cola.insertar({ token: "alta:1", campana: "c1", telefono: TEL, qrId: 7 });
    cola.vaciar();

    const gente = [{ telefono: TEL, qrId: 7 }];
    const r = enviarPendientes(cola, censoDe(cola, gente), "c1");
    assert.equal(r.hechos, 0);
    assert.equal(cola.filas.length, 1);
    cola.vaciar();
    assert.equal(cola.enviados, 1);
  });

  test("«Enviar pendientes» tampoco alcanza a quien tiene fila con OTRO token", () => {
    // El camino clásico guarda un token ALEATORIO. Si la idempotencia se apoyara solo en la
    // clave determinista, esta persona recibiría un segundo mensaje.
    const cola = new ColaFalsa();
    cola.insertar({ token: "9f3a-aleatorio-largo", campana: "c1", telefono: TEL, qrId: 7 });

    const gente = [{ telefono: TEL, qrId: 7 }];
    const r = enviarPendientes(cola, censoDe(cola, gente), "c1");
    assert.equal(r.hechos, 0,
      "la comprobación por IDENTIDAD es la que evita duplicar lo que ya existía con otro token");
    assert.equal(cola.filas.length, 1);
  });

  test("«Reintentar errores» dos veces no deja la fila en un estado raro ni duplica", () => {
    const cola = new ColaFalsa();
    cola.insertar({ token: "alta:1", campana: "c1", telefono: TEL, qrId: 7 });
    cola.vaciar({ falla: () => true });

    const gente = [{ telefono: TEL, qrId: 7 }];
    const a = reintentarErrores(cola, censoDe(cola, gente));
    const b = reintentarErrores(cola, censoDe(cola, gente));
    assert.equal(a.hechos, 1);
    assert.equal(b.hechos, 0, "la segunda no encuentra nada reintentable, que es lo correcto");
    assert.equal(cola.filas.length, 1);
  });
});

describe("cada acción toca solo lo suyo", () => {
  const gente = [
    { telefono: "600000001", qrId: 1 },   // sin cola  → recuperable
    { telefono: "600000002", qrId: 2 },   // enviado
    { telefono: "600000003", qrId: 3 },   // fallido   → reintentable
    { telefono: "600000004", qrId: 4 },   // pendiente
    { telefono: "600000005", qrId: null }, // sin código
    { telefono: "", qrId: 6 },             // sin teléfono
    { telefono: "600000007", qrId: 7 },   // baja
  ];

  function escenario() {
    const cola = new ColaFalsa();
    cola.insertar({ token: "a2", campana: "c1", telefono: "600000002", qrId: 2 });
    cola.vaciar();
    cola.insertar({ token: "a3", campana: "c1", telefono: "600000003", qrId: 3 });
    cola.vaciar({ falla: (f) => f.telefono === "600000003" });
    cola.insertar({ token: "a4", campana: "c1", telefono: "600000004", qrId: 4 });
    const censo = gente.map((g) => ({ ...g, baja: g.telefono === "600000007",
                                      cola: cola.paraDestinatario(g.telefono) }));
    return { cola, censo };
  }

  test("el censo cuenta cada uno en su sitio", () => {
    const { censo } = escenario();
    const c = censar(censo);
    assert.equal(c.total, 7);
    assert.equal(c.sin_cola, 1);
    assert.equal(c.enviado, 1);
    assert.equal(c.error, 1);
    assert.equal(c.pendiente, 1);
    assert.equal(c.sin_qr, 1);
    assert.equal(c.sin_telefono, 1);
    assert.equal(c.baja, 1);
    assert.equal(c.recuperables, 1);
    assert.equal(c.reintentables, 1);
  });

  test("«Enviar pendientes» alcanza SOLO al que no tiene fila", () => {
    const { censo } = escenario();
    const alcanzados = aQuienAlcanza("pendientes", censo);
    assert.deepEqual(alcanzados.map((d) => d.telefono), ["600000001"]);
  });

  test("«Reintentar errores» alcanza SOLO al que falló", () => {
    const { censo } = escenario();
    const alcanzados = aQuienAlcanza("reintentar", censo);
    assert.deepEqual(alcanzados.map((d) => d.telefono), ["600000003"]);
  });

  test("ninguna acción alcanza jamás a quien ya lo recibió", () => {
    const { censo } = escenario();
    for (const accion of ACCIONES) {
      const tocados = aQuienAlcanza(accion, censo).map((d) => d.telefono);
      assert.ok(!tocados.includes("600000002"), `«${accion}» ha alcanzado a alguien ya enviado`);
    }
  });

  test("una acción que no existe no toca nada", () => {
    const { censo } = escenario();
    assert.deepEqual(aQuienAlcanza("borrar", censo), []);
    assert.equal(accionValida("borrar"), false);
    assert.equal(accionValida("pendientes"), true);
    assert.equal(accionValida("reintentar"), true);
  });
});

describe("cada campaña, su mensaje y su código", () => {
  test("dos campañas distintas dan claves distintas y no se pisan", () => {
    const a = claveRecuperacion({ campana: "esmorzar-girona", qrId: 7 });
    const b = claveRecuperacion({ campana: "sopar-blanes", qrId: 7 });
    assert.notEqual(a, b, "el mismo cupón en dos campañas tiene que poder recibir las dos");
    assert.ok(esRecuperacion(a) && esRecuperacion(b));
  });

  test("el mismo cupón en la misma campaña da SIEMPRE la misma clave", () => {
    assert.equal(claveRecuperacion({ campana: "c1", qrId: 7 }),
                 claveRecuperacion({ campana: "c1", qrId: 7 }));
  });

  test("sin campaña o sin cupón no hay clave, y por tanto no se escribe nada", () => {
    assert.equal(claveRecuperacion({ campana: "", qrId: 7 }), null);
    assert.equal(claveRecuperacion({ campana: "c1", qrId: null }), null);
    assert.equal(claveRecuperacion({ campana: "c1", qrId: 0 }), null);
  });

  test("cada destinatario recibe el texto de SU cupón, no el del de al lado", () => {
    const cola = new ColaFalsa();
    const gente = [{ telefono: TEL, qrId: 11 }, { telefono: OTRO, qrId: 22 }];
    enviarPendientes(cola, censoDe(cola, gente), "c1");
    const uno = cola.paraDestinatario(TEL), dos = cola.paraDestinatario(OTRO);
    assert.match(uno.texto, /qr 11/);
    assert.match(dos.texto, /qr 22/);
    assert.equal(uno.qr_id, 11);
    assert.equal(dos.qr_id, 22);
  });

  test("dos campañas sobre la MISMA persona no se bloquean entre sí", () => {
    const cola = new ColaFalsa();
    const gente = [{ telefono: TEL, qrId: 7 }];
    const a = enviarPendientes(cola, censoDe(cola, gente), "campana-a");
    // La segunda campaña tiene su propia cola: se simula con una cola nueva, que es lo que pasa
    // de verdad porque el censo se filtra por campaña.
    const cola2 = new ColaFalsa();
    const b = enviarPendientes(cola2, censoDe(cola2, gente), "campana-b");
    assert.equal(a.hechos, 1);
    assert.equal(b.hechos, 1, "apuntarse a dos campañas tiene que dar dos mensajes");
  });
});

describe("por qué no sale nada", () => {
  test("los tres frenos se nombran, y en el orden en que hay que arreglarlos", () => {
    assert.equal(motivoParada({ colaParada: true, whatsappListo: false, cupoLibre: 0 }).motivo,
      "cola_parada", "el interruptor de pánico manda sobre todo lo demás");
    assert.equal(motivoParada({ whatsappListo: false, cupoLibre: 10 }).motivo, "whatsapp_caido");
    assert.equal(motivoParada({ whatsappListo: true, cupoLibre: 0 }).motivo, "sin_cupo");
    const bien = motivoParada({ whatsappListo: true, cupoLibre: 10 });
    assert.equal(bien.parado, false);
    assert.equal(bien.texto, "");
  });

  test("cada freno explica qué pasa con lo que está en cola", () => {
    for (const caso of [{ colaParada: true }, { whatsappListo: false }, { whatsappListo: true, cupoLibre: 0 }]) {
      const m = motivoParada({ whatsappListo: true, cupoLibre: 10, ...caso });
      assert.ok(m.texto.length > 20, `el freno «${m.motivo}» no explica nada`);
    }
  });
});

describe("el cableado del servidor", () => {
  test("los dos endpoints existen y exigen permiso", () => {
    assert.match(SERVER,
      /app\.get\("\/api\/captacion\/campanas\/:clave\/censo",\s*requireAuth\(PROMOS_ROLES\)/,
      "el censo tiene que pedir permiso: cuenta gente de una campaña");
    assert.match(SERVER,
      /app\.post\("\/api\/captacion\/campanas\/:clave\/recuperar",\s*requireAuth\(PROMOS_ROLES\)/,
      "recuperar escribe en la cola: no puede estar abierto");
  });

  test("la fila que se escribe lleva la clave determinista y el ON CONFLICT", () => {
    const bloque = RECUPERAR;
    assert.match(bloque, /claveRecuperacion\(\{\s*campana:\s*clave,\s*qrId:\s*d\.qrId\s*\}\)/,
      "la clave de idempotencia ya no sale de claveRecuperacion()");
    assert.match(bloque, /ON CONFLICT \(token\) DO NOTHING RETURNING id/,
      "sin el ON CONFLICT, pulsar dos veces escribe dos filas");
    assert.match(bloque, /estado IN \('fallido','descartado'\)/,
      "el reintento tiene que seguir acotado a los estados reintentables");
  });

  test("el enlace del QR se compone con proEnlace, nunca a mano", () => {
    const bloque = RECUPERAR;
    assert.match(bloque, /enlace:\s*proEnlace\(req,\s*qr\)/,
      "proEnlace es el único sitio que compone la URL del QR y el que pasa por urlTarjeta()");
    assert.ok(!/tarjeta\.html\?t=|cupon\.html\?t=/.test(bloque),
      "hay una URL de QR escrita a mano en la recuperación");
  });

  test("la recuperación NO manda nada por su cuenta: deja la fila y despierta al worker", () => {
    const bloque = RECUPERAR;
    assert.ok(!/sendMensajeLibre|sendMensaje\(/.test(bloque),
      "la recuperación llama a WhatsApp directamente: se salta el ritmo, el cupo y el tope diario");
    assert.match(bloque, /capVaciarCola\(\)/,
      "hay que despertar al worker, que es quien manda");
  });

  test("no se emite ningún QR nuevo desde la recuperación", () => {
    const bloque = RECUPERAR;
    assert.ok(!/proEmitir\(/.test(bloque),
      "la recuperación manda el código que YA tiene esa persona; emitir otro sería una segunda " +
      "identidad para el mismo cliente");
  });

  test("queda escrito quién lo pulsó", () => {
    const bloque = RECUPERAR;
    assert.match(bloque, /ficAuditar\("captacion"[\s\S]*?req\.user\.username/,
      "mandar mensajes a gente real tiene que dejar rastro de quién lo hizo");
  });

  test("el censo no devuelve ni un dato personal", () => {
    const bloque = CENSO;
    assert.ok(!/telefono|nombre|token/.test(bloque.replace(/^\s*\/[/*].*$/gm, "")),
      "el censo devuelve datos personales: solo puede devolver números");
  });
});

describe("el panel", () => {
  test("hay una forma de abrir los envíos de una campaña", () => {
    assert.match(APP, /data-act="cap-recuperar"/, "no hay botón para ver los envíos de una campaña");
    assert.match(APP, /act === "cap-recuperar"/, "el botón no está cableado a ninguna función");
    assert.match(APP, /async function capRecuperar/);
  });

  test("los botones se deshabilitan cuando no hay nada que hacer", () => {
    const bloque = REC_CUERPO;
    assert.match(bloque, /Number\(c\.recuperables\) \? "" : "disabled"/,
      "«Enviar pendientes» tiene que estar apagado si no hay nadie sin encolar");
    assert.match(bloque, /Number\(c\.reintentables\) \? "" : "disabled"/,
      "«Reintentar errores» tiene que estar apagado si no hay errores");
  });

  test("el doble clic se corta también en el navegador", () => {
    const bloque = REC_ACCION;
    assert.match(bloque, /boton\.disabled\s*=\s*true/,
      "sin deshabilitar el botón, el doble clic sale dos veces a la red");
    assert.match(bloque, /boton && boton\.disabled\)+\s*return/,
      "hay que ignorar la segunda pulsación si el botón ya está apagado");
  });

  test("se avisa de por qué no sale nada antes de ofrecer el botón", () => {
    const bloque = REC_CUERPO;
    assert.match(bloque, /f\.parado/,
      "pulsar «Enviar» con WhatsApp caído encola bien y no sale nada: hay que decirlo");
  });
});
