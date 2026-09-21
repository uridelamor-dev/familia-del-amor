// QUIÉN SE APUNTÓ POR UN FORMULARIO.
//
// ── LOS DOS FALLOS QUE ESTO EVITA ────────────────────────────────────────────────────────────
//
// 1. EL JOIN QUE MULTIPLICA PERSONAS. Una persona con tres consentimientos, dos carnés y cuatro
//    mensajes en la cola saldría veinticuatro veces con joins directos, y «312 inscritos» dejaría
//    de significar 312 personas. Cada tabla auxiliar se agrega por teléfono ANTES de unirla.
//
// 2. LLAMAR «ENTREGADO» A LO QUE NO CONSTA. El formulario configurable enseña el enlace del carné
//    en pantalla y no manda nada; nadie sabe si esa persona llegó a verlo. Decir «código enviado»
//    sería afirmar algo que no está escrito en ningún sitio.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MENSAJES as MENSAJES_FORM, MENSAJES_POR_IDIOMA }
  from "../src/modules/fidelizacion/contenido.js";
const MENSAJES_CA = MENSAJES_POR_IDIOMA.ca;
import { CONSENTIMIENTO, ENTREGA, ETIQUETA, AYUDA, estadoEntrega, estadoConsentimiento,
         filtrosSeguros, filtrosAplicados, csvInscritos, nombreCsv, COLUMNAS_CSV,
         POR_PAGINA, POR_PAGINA_MAX, CSV_MAX }
  from "../src/modules/captacion/inscritos.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const ruta = (firma) => {
  const i = server.indexOf(firma);
  if (i < 0) throw new Error(`no existe la ruta ${firma}`);
  return server.slice(i, server.indexOf("\n});", i) + 4);
};
const sinComentarios = (t) => t.split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*|--)/.test(l)).join("\n");

const LISTA = ruta('app.get("/api/fidelizacion/formularios/:clave/inscritos"');
const CSV = ruta('app.get("/api/fidelizacion/formularios/:clave/inscritos.csv"');
const RESUMEN = ruta('app.get("/api/captacion/inscritos/resumen"');
const SQL = server.slice(server.indexOf("function sqlInscritos("),
                         server.indexOf("function insFila("));

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("NADIE SE MULTIPLICA", () => {
  test("cada tabla auxiliar se agrega por teléfono antes de unirla", () => {
    // Son cuatro, y las cuatro tienen que traer UNA fila por persona.
    for (const tabla of ["marketing_prefs", "fid_consentimientos", "pro_qr", "cap_cola"]) {
      const i = SQL.indexOf(`FROM ${tabla}`);
      assert.ok(i > 0, `no se usa ${tabla}`);
      const trozo = SQL.slice(i, i + 200);
      assert.match(trozo, /GROUP BY 1/, `${tabla} se une sin agregar: multiplicaría personas`);
    }
  });

  test("y ninguna se une directamente contra leads", () => {
    // Un `LEFT JOIN fid_consentimientos` a pelo es el fallo que esto evita.
    for (const tabla of ["marketing_prefs", "fid_consentimientos", "pro_qr", "cap_cola"]) {
      assert.ok(!new RegExp(`JOIN ${tabla}\\s`).test(SQL), `${tabla} se une sin agregar`);
    }
  });

  test("el total se pide con LA MISMA consulta y los MISMOS filtros", () => {
    // Dos consultas distintas para el número de arriba y las filas de abajo es como se acaba con
    // «312 inscritos» encima de una lista de 280.
    assert.match(SQL, /function sqlInscritos\(clave, f, params, \{ soloContar = false \} = \{\}\)/);
    assert.match(SQL, /if \(soloContar\) return `SELECT COUNT\(\*\)::int AS n \$\{base\}`;/);
    assert.match(LISTA, /sqlInscritos\(clave, f, cuenta, \{ soloContar: true \}\)/);
  });

  test("y `leads` ya es una fila por persona: se cuenta gente, no filas", () => {
    assert.match(RESUMEN, /COUNT\(\*\)::int AS total/);
    assert.match(RESUMEN, /FROM leads/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("DOS FORMULARIOS, UNA CLAVE, SIN `LIKE` ABIERTO", () => {
  test("se unen por igualdad exacta con los dos valores", () => {
    assert.match(SQL, /where\.push\(`\(l\.campana = \? OR l\.fuente = \?\)`\);/);
    assert.match(SQL, /params\.push\(clave, `form:\$\{clave\}`\);/);
  });

  test("NUNCA con un LIKE sobre la clave", () => {
    // `LIKE 'form:%'` mezclaría campañas distintas; `LIKE '%girona%'` se llevaría cualquier
    // clave que contenga esa palabra.
    const cuerpo = sinComentarios(SQL);
    for (const m of cuerpo.matchAll(/LIKE[^\n]*/g)) {
      // El único LIKE admisible es el de buscar por nombre, que es texto escrito a mano.
      assert.match(m[0], /LOWER\(\?\)/, `LIKE sobre algo que no es la búsqueda: ${m[0]}`);
    }
    assert.ok(!/campana LIKE|fuente LIKE/.test(cuerpo), "se agrupa con un LIKE");
  });

  test("el configurable escribe ahora `leads.campana`", () => {
    const alta = ruta('app.post("/api/publico/formulario/:clave"');
    assert.match(alta, /INSERT INTO leads \([^)]*campana\)/);
    // Y a quien ya existía se le anota por dónde vuelve SIN pisar de dónde vino.
    assert.match(alta, /UPDATE leads SET actualizado_en = \?, campana = COALESCE\(campana, \?\) WHERE id = \?/);
  });

  test("y NO se migra nada de lo ya guardado", () => {
    // Lo escrito, escrito está: el respaldo por `fuente` es lo que recoge las altas anteriores.
    const esquemas = ["../src/modules/captacion/schema.js", "../src/modules/fidelizacion/schema.js"]
      .map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
    assert.ok(!/UPDATE leads/.test(esquemas), "una migración reescribe leads");
    assert.ok(!/UPDATE leads SET campana/.test(server), "hay una migración de campana");
  });

  test("el resumen suma `form:<clave>` y `<clave>` bajo la misma campaña", () => {
    assert.match(RESUMEN, /String\(f\.clave \|\| ""\)\.replace\(\/\^form:\/, ""\)/);
    assert.match(RESUMEN, /e\.total \+= Number\(f\.total \|\| 0\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("«CARNÉ DISPONIBLE» NO ES «CÓDIGO ENVIADO»", () => {
  test("los estados son los acordados y están congelados", () => {
    assert.deepEqual([...CONSENTIMIENTO], ["activo", "baja"]);
    assert.deepEqual([...ENTREGA],
      ["sin_carne", "fallido", "pendiente", "carne_disponible", "enviado"]);
    assert.throws(() => { ENTREGA.push("x"); }, TypeError);
  });

  test("SOLO se dice «enviado» si consta una fecha de envío", () => {
    // Es la única evidencia fuerte que hay. Sin ella no se afirma.
    assert.equal(estadoEntrega({ colaEnviadoEn: "2026-09-15T10:00:00+02:00" }), "enviado");
    assert.equal(estadoEntrega({ carnetEnviadoEn: "2026-09-15T10:00:00+02:00" }), "enviado");
  });

  test("un carné sin envío es «carné disponible», nunca «entregado»", () => {
    // El configurable enseña el enlace en pantalla y no queda rastro de que se viera.
    const e = estadoEntrega({ carnetVivos: 1 });
    assert.equal(e, "carne_disponible");
    assert.ok(!/enviad|entregad/i.test(ETIQUETA[e]), `la etiqueta afirma de más: ${ETIQUETA[e]}`);
    assert.match(AYUDA[e], /No consta que se le haya enviado/);
  });

  test("y la escalera entera, en orden", () => {
    assert.equal(estadoEntrega({}), "sin_carne");
    assert.equal(estadoEntrega({ carnetVivos: 1, colaFallidos: 1 }), "fallido");
    assert.equal(estadoEntrega({ carnetVivos: 1, colaPendientes: 1 }), "pendiente");
    // Pendiente gana a fallido: hay un reintento vivo.
    assert.equal(estadoEntrega({ colaPendientes: 1, colaFallidos: 2 }), "pendiente");
  });

  test("consentimiento y entrega son DOS cosas, y no se mezclan", () => {
    // Alguien de baja que sí recibió su código no es lo mismo que alguien de baja sin nada.
    assert.equal(estadoConsentimiento({ prefBaja: 1 }), "baja");
    assert.equal(estadoConsentimiento({ consentimientosDeBaja: 2 }), "baja");
    assert.equal(estadoConsentimiento({}), "activo");
    // La baja no toca el estado de entrega.
    assert.equal(estadoEntrega({ carnetVivos: 1 }), "carne_disponible");
  });

  test("una baja sigue APARECIENDO: es histórico, no se borra", () => {
    // Se excluye de los envíos, no de la lista.
    assert.match(AYUDA.baja, /Sigue aquí como histórico/);
    // Lo que se comprueba es que la baja NO aparece en el `WHERE`: se calcula y se enseña, pero
    // no filtra. (`baja_en IS NOT NULL` dentro de un `COUNT(... FILTER)` sí es legítimo: cuenta,
    // no excluye.)
    const donde = SQL.slice(SQL.indexOf("const where = []"), SQL.indexOf("// Cada auxiliar"));
    assert.ok(!/baja/i.test(donde), `la consulta excluye a quien se dio de baja: ${donde}`);
    assert.match(SQL, /COALESCE\(mp\.baja, 0\) AS pref_baja/);
  });

  test("cada estado tiene etiqueta y explicación", () => {
    for (const k of [...CONSENTIMIENTO, ...ENTREGA]) {
      assert.ok(ETIQUETA[k], `${k} sin etiqueta`);
      assert.ok(AYUDA[k] && AYUDA[k].length > 20, `${k} sin explicación`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("NI UN TELÉFONO", () => {
  test("la consulta NO proyecta el teléfono", () => {
    const proyeccion = SQL.slice(SQL.indexOf("SELECT l.id AS lead_id"), SQL.indexOf("${base}"));
    assert.ok(!/l\.telefono/.test(proyeccion), "la lista devuelve el teléfono");
    // Sí se usa para CRUZAR —es la única forma— pero no sale.
    assert.match(SQL, /INS_TEL9\("l\.telefono"\)/);
  });

  test("la fila que llega a la pantalla tampoco lo lleva", () => {
    const fila = server.slice(server.indexOf("function insFila(r)"),
                              server.indexOf("app.get(\"/api/fidelizacion/formularios/:clave/inscritos\""));
    assert.ok(!/telefono/.test(fila), "insFila devuelve el teléfono");
    assert.match(fila, /lead_id: r\.lead_id/);
  });

  test("EL CSV NO LLEVA TELÉFONO, y no es un olvido", () => {
    assert.ok(!COLUMNAS_CSV.some(([k]) => /tel/i.test(k)), "el CSV lleva el teléfono");
    const csv = csvInscritos([{ fecha: "2026-09-15", nombre: "Marta", apellidos: "Puig",
      poblacion: "Arbúcies", campana: "esmorzar-girona", formulario: "histórico",
      consentimiento: "activo", entrega: "enviado", telefono: "600111222" }]);
    assert.ok(!csv.includes("600111222"), "el teléfono se ha colado en el CSV");
  });

  test("y el panel no lo pinta ni lo pide", () => {
    const vista = app.slice(app.indexOf("function insCuerpo()"), app.indexOf("function insCsvDescargar()"));
    assert.ok(!/telefono|data-tel/.test(vista), "la lista del panel enseña el teléfono");
    // La ficha se abre por el buscador de Clientes, con el NOMBRE: no hay ruta nueva que exponga
    // un número que hoy está guardado.
    const ficha = app.slice(app.indexOf("function insFicha(leadId)"), app.indexOf("function insCsvDescargar()"));
    assert.match(ficha, /CLIF\.q = nombre;/);
    assert.match(ficha, /go\("clientes"\)/);
    assert.ok(!/api\/contactos/.test(ficha), "se llama a una ruta de contactos con el teléfono");
  });

  test("tampoco salen tokens, hashes ni JSON interno", () => {
    for (const r of [LISTA, CSV, RESUMEN]) {
      for (const fuga of ["token", "hash", "utm", "pass_enc", "JSON.stringify(j)"]) {
        assert.ok(!sinComentarios(r).includes(fuga), `una ruta devuelve ${fuga}`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("los filtros y la paginación van EN SQL", () => {
  test("nunca se trae el censo entero", () => {
    assert.match(LISTA, /LIMIT \? OFFSET \?/);
    assert.equal(POR_PAGINA, 50);
    assert.ok(POR_PAGINA_MAX <= 200);
  });

  test("lo que llega por la URL se sanea a listas cerradas y números acotados", () => {
    const f = filtrosSeguros({ consentimiento: "loquesea", entrega: "'; DROP", limite: "99999",
                               offset: "-5", desde: "no-es-fecha", buscar: "x".repeat(500) });
    assert.equal(f.consentimiento, null);
    assert.equal(f.entrega, null);
    assert.equal(f.limite, POR_PAGINA_MAX);
    assert.equal(f.offset, 0);
    assert.equal(f.desde, null);
    assert.equal(f.buscar.length, 80);
  });

  test("y lo válido pasa tal cual", () => {
    const f = filtrosSeguros({ consentimiento: "baja", entrega: "enviado", desde: "2026-01-01",
                               poblacion: "Arbúcies", limite: "25", offset: "50" });
    assert.equal(f.consentimiento, "baja");
    assert.equal(f.entrega, "enviado");
    assert.equal(f.desde, "2026-01-01");
    assert.equal(f.poblacion, "Arbúcies");
    assert.equal(f.limite, 25);
    assert.equal(f.offset, 50);
  });

  test("NADA se concatena en el SQL: todo va como parámetro", () => {
    // Se miran SOLO los trozos que acaban siendo SQL, no las líneas que empujan parámetros
    // —ahí `${f.buscar}` va DENTRO de un valor (`%...%`), que es exactamente lo correcto—.
    const cuerpo = sinComentarios(SQL);
    const soloSql = cuerpo.split("\n").filter((l) => !/params\.push\(/.test(l)).join("\n");
    for (const m of soloSql.matchAll(/\$\{([^}]*)\}/g)) {
      assert.match(m[1], /^(INS_TEL9\("[a-z_.]+"\)|where\.join\(" AND "\)|base|clave)$/,
        `se interpola un valor en el SQL: ${m[1]}`);
    }
    // Y cada filtro empuja su valor como parámetro.
    assert.equal([...cuerpo.matchAll(/params\.push\(/g)].length, 5);
    assert.match(cuerpo, /params\.push\(`%\$\{f\.buscar\}%`\)/);
  });

  test("el orden es el pedido: más recientes primero", () => {
    assert.match(SQL, /ORDER BY l\.creado_en DESC, l\.id DESC/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("el CSV", () => {
  test("BOM, punto y coma y CRLF, como el resto de la casa", () => {
    const csv = csvInscritos([]);
    assert.equal(csv.charCodeAt(0), 0xFEFF);
    assert.ok(csv.includes(";"));
    assert.ok(csv.includes("\r\n"));
  });

  test("un nombre con punto y coma no parte la fila", () => {
    const csv = csvInscritos([{ nombre: 'Puig; "Roca"', apellidos: "", fecha: "", poblacion: "",
      campana: "", formulario: "", consentimiento: "activo", entrega: "enviado" }]);
    const filas = csv.replace(/^﻿/, "").trim().split("\r\n");
    assert.equal(filas.length, 2, "la fila se ha partido");
    assert.ok(filas[1].includes('""Roca""'), "las comillas no se han doblado");
  });

  test("los estados salen en palabras, no en códigos", () => {
    const csv = csvInscritos([{ consentimiento: "baja", entrega: "carne_disponible" }]);
    assert.ok(csv.includes("Baja"));
    assert.ok(csv.includes("Carné disponible"));
    assert.ok(!csv.includes("carne_disponible"));
  });

  test("tiene tope: un fichero que sale del sistema no puede ser ilimitado", () => {
    assert.equal(CSV_MAX, 5000);
    assert.match(CSV, /LIMIT \?`, \[\.\.\.params, INS_CSV_MAX\]/);
  });

  test("el nombre del fichero no se puede usar para escribir donde no toca", () => {
    assert.equal(nombreCsv("../../etc/passwd", "2026-09-15"), "inscritos-etcpasswd-2026-09-15.csv");
    assert.match(nombreCsv("", ""), /^inscritos-campana-\.csv$/);
  });

  test("QUEDA ESCRITO QUIÉN EXPORTÓ Y CON QUÉ FILTROS", () => {
    assert.match(CSV, /ficAuditar\("captacion", null, "inscritos_exportados", req\.user\.username/);
    assert.match(CSV, /filtros: insFiltrosAudit\(f\)/);
    assert.match(CSV, /filas: data\.length/);
  });

  test("pero NO se guarda el texto buscado: puede ser el nombre de alguien", () => {
    const a = filtrosAplicados({ buscar: "Marta Puig", poblacion: "Blanes", desde: null });
    assert.ok(!String(a.buscar).includes("Marta"), a.buscar);
    assert.match(a.buscar, /car\./);
    assert.equal(a.poblacion, "Blanes");
    assert.ok(!("desde" in a), "se guardan filtros vacíos");
  });

  test("y el CSV usa los MISMOS filtros que la lista", () => {
    assert.match(CSV, /const f = insFiltros\(req\.query\);/);
    assert.match(CSV, /sqlInscritos\(clave, f, params\)/);
    assert.match(app, /const p = insQS\(\);\s*\n\s*window\.open\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("EL WHATSAPP QUE SE PROMETIÓ", () => {
  // La tarjeta verde decía «rebràs el codi al teu telèfon» y se exigía que el número tuviera
  // WhatsApp — pero no se mandaba nada: solo se enseñaba el enlace en pantalla. Era prometer una
  // cosa y hacer otra, y pedir un teléfono que no se iba a usar.
  const ALTA = ruta('app.post("/api/publico/formulario/:clave"');
  // El recorte LANZA si el ancla no está. Antes era `slice(indexOf(...), ...)` a secas y, cuando
  // el comentario que le servía de ancla se reescribió, `indexOf` devolvió -1 y el bloque quedó
  // casi vacío: ocho aserciones sobre nada. Es el fallo que una auditoría encontró en nueve tests
  // de esta casa.
  const desde = (texto, ancla, hasta) => {
    const i = texto.indexOf(ancla);
    if (i < 0) throw new Error(`ancla no encontrada: «${ancla}»`);
    const j = texto.indexOf(hasta, i);
    if (j < 0) throw new Error(`cierre no encontrado: «${hasta}»`);
    return texto.slice(i, j);
  };
  const cola = desde(ALTA, "// ── 3 y 4. EL CARNÉ Y SU MENSAJE", "await ficAuditar");

  test("se encola de verdad, con el enlace del carné", () => {
    assert.match(cola, /INSERT INTO cap_cola \(token, campana, telefono, texto, qr_id, proximo_ms, creado_en, prioridad\)/);
    // PRIORIDAD 0: quien acaba de apuntarse está esperando su código ahora mismo.
    assert.match(cola, /VALUES \(\?,\?,\?,\?,\?,\?,\?,0\)/);
    // EL ENLACE, POR `proEnlace` Y CON LA FILA DEL QR. Antes se le pasaba un objeto compuesto a
    // mano (`{ token, clase: "carnet" }`); ahora va la fila entera, que es la que sabe su clase
    // de verdad. Lo que no cambia —y es lo que hay que blindar— es que la URL salga de ahí y no
    // se escriba a mano en ningún sitio.
    assert.match(cola, /enlace: proEnlace\(req, qr\)/,
      "el enlace del mensaje ya no sale de proEnlace: ahí es donde se decide si va a /cupon.html " +
      "o a la tarjeta, y escribirlo a mano da un enlace que la tablet de la barra no sabe leer");
    assert.ok(!/tarjeta\.html\?t=|cupon\.html\?t=/.test(cola),
      "hay una URL de QR escrita a mano en el alta");
    assert.match(cola, /fidRender\(f\.mensaje_wa, \{ nombre, enlace: proEnlace/);
  });

  test("ES TRANSACCIONAL: no reutiliza ninguna comunicación masiva", () => {
    // Mezclarlos habría hecho que pausar una campaña dejara sin código a quien acaba de
    // apuntarse. Su clave empieza por `alta:`, no por `com:`.
    assert.match(cola, /`alta:\$\{clave\}:v\$\{f\.version\}/);
    assert.ok(!/com:/.test(cola), "reutiliza la clave de una comunicación");
    assert.ok(!/fid_comunicaciones|fid_comunicacion_envios/.test(cola), "toca las comunicaciones");
    // Antes esto se comprobaba mirando que el `INSERT` en `fid_bajas` llevara `comunicacion_id`
    // a NULL. Esa fila ya no existe —la entrega no lleva enlace de baja— así que se comprueba
    // sobre la que sí queda: la de la cola, que va con la campaña del FORMULARIO y con prioridad
    // de alta, no con la de ninguna comunicación.
    assert.match(cola, /INSERT INTO cap_cola[\s\S]{0,200}prioridad\)/,
      "el alta ya no encola con prioridad propia");
    assert.match(cola, /\[claveIdem, f\.campana \|\| clave, tel, texto, qr\.id/,
      "la fila de la cola ya no lleva la campaña del formulario ni el código de esa persona");
  });

  test("LA CLAVE IDEMPOTENTE lleva las cinco cosas que identifican la inscripción", () => {
    // formulario, versión, campaña, teléfono normalizado y carné… más el CICLO.
    assert.match(cola, /`alta:\$\{clave\}:v\$\{f\.version\}:\$\{f\.campana \|\| clave\}:\$\{tel\}:\$\{qr\.id\}:c\$\{ciclo\}`/);
    // `tel` ya viene normalizado por `proTel9`, que es el de la casa.
    assert.match(ALTA, /const tel = proTel9\(b\.telefono\);/);
  });

  test("y el CICLO, sin el cual quien vuelve tras una baja no recibía nada", () => {
    // Después de una baja las otras cinco son LAS MISMAS —el carné se reutiliza a propósito—, así
    // que `DO NOTHING` descartaba el mensaje en silencio. El ciclo distingue «volver a apuntarse»
    // de «pulsar dos veces»: recargar no lo cambia, darse de baja sí.
    assert.match(cola, /SELECT COUNT\(\*\)::int AS n FROM fid_bajas/);
    assert.match(cola, /confirmado_en IS NOT NULL/);
  });

  test("y la idempotencia la resuelve la BASE, no un contador", () => {
    // `cap_cola.token` es único. Pulsar dos veces, recargar o reenviar el POST da la misma fila:
    // no hay carrera que perder.
    assert.match(cola, /ON CONFLICT \(token\) DO NOTHING RETURNING id/);
    const esquema = readFileSync(new URL("../src/modules/captacion/schema.js", import.meta.url), "utf8");
    assert.match(esquema, /token TEXT NOT NULL UNIQUE/);
  });

  test("si ya había un envío, NO se vuelve a encolar: se mira cómo acabó", () => {
    assert.match(cola, /const fila = met \|\| await x\.get\(\s*\n?\s*`SELECT id, estado, enviado_en FROM cap_cola WHERE token = \?`/);
  });

  test("ES UNA ENTREGA, NO UNA COMUNICACIÓN: sin enlace de baja", () => {
    // ── ESTA REGLA SE INVIRTIÓ, Y CONVIENE QUE CONSTE POR QUÉ ───────────────────────────────
    //
    // Antes este mensaje llevaba pie de baja, con este razonamiento: «lleva un descuento dentro,
    // eso lo hace comercial también». La decisión se revisó mirando qué es este mensaje: la
    // persona rellenó el formulario hace diez segundos PARA recibir su código, y esto solo se lo
    // trae. No se la ha metido en ninguna lista, así que «para dejar de recibir estos mensajes»
    // debajo sugiere que sí.
    //
    // Lo que NO cambió: las comunicaciones comerciales posteriores —campañas, cumpleaños, envíos
    // masivos— siguen llevando el suyo. La diferencia es de TIPO y se decide en un solo sitio.
    assert.match(cola, /tipo: FID_TIPO_MENSAJE\.ENTREGA/,
      "el mensaje del alta ha dejado de declararse como entrega");
    const codigo = cola.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    assert.ok(!/fidConPieBaja|INSERT INTO fid_bajas|fidEnlaceBaja/.test(codigo),
      "la entrega vuelve a componer un enlace de baja que no usa");
    assert.ok(!/if \(!urlBaja\) return/.test(codigo),
      "vuelve la guarda que dejaba sin su código a quien acababa de pedirlo");
    // El token de baja NUNCA se guarda en claro.
    assert.ok(!/VALUES \(\?,\?,NULL,\?,\?\)[^;]*tokenBaja[^H)]/.test(cola.replace(/fidHuellaBaja\(tokenBaja\)/g, "H")),
      "el token de baja se guarda en claro");
  });

  test("VACÍO = NO SE MANDA NADA", () => {
    // Encenderlo en una campaña que no lo prometía enviaría un WhatsApp a quien se apuntó sin
    // que se le dijera que lo recibiría.
    assert.match(cola, /if \(!f\.mensaje_wa\) return \{ qr, cola: null, derecho \};/);
    const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
    assert.ok(esquema.includes('"mensaje_wa TEXT"'), "la columna no es aditiva ni opcional");
    assert.ok(!/mensaje_wa TEXT NOT NULL/.test(esquema), "la columna es obligatoria");
  });

  test("y es configurable desde el panel, no está en el código", () => {
    // El campo se movió a un apartado con su propio título —«WhatsApp al completar el
    // formulario»— y su rótulo pasó a ser «El mensaje», que dentro de ese apartado dice lo mismo
    // sin repetirlo. Lo que se vigila es que siga siendo configurable desde el panel.
    assert.match(app, /WhatsApp al completar el formulario/,
      "ha desaparecido el apartado de WhatsApp del editor de formularios");
    assert.match(app, /fgArea\("ffWaMsg", "El mensaje"/,
      "ha desaparecido el campo del mensaje");
    assert.match(app, /mensaje_wa: fgChk\("ffWaOn"\) \? fgVal\("ffWaMsg"\) : ""/,
      "el mensaje ya no se guarda desde el panel, o el interruptor no manda sobre el texto");
    // La aserción de arriba ya cubre el guardado desde el panel, y además exige que el
    // interruptor mande sobre el texto. Aquí se deja solo lo del servidor: que guarde lo que le
    // llega, sin imponer ningún texto suyo.
    assert.match(server, /mensaje_wa: fidTexto\(b\.mensaje_wa, FID_LARGOS\.parrafo\)/);
  });

  test("NO SE ENCOLA NADA SI EL ALTA NO LLEGÓ A GUARDARSE", () => {
    // El encolado va DESPUÉS de la transacción y después del carné: si la transacción lanza, no
    // se llega aquí y no queda mensaje en cola.
    const iTx = ALTA.indexOf("await fidTransaccion(");
    const iCola = ALTA.indexOf("INSERT INTO cap_cola");
    const iWa = ALTA.indexOf("if (f.exige_whatsapp)");
    assert.ok(iTx > 0 && iCola > iTx, "se encola antes de guardar el alta");
    assert.ok(iWa > 0 && iWa < iTx, "se comprueba WhatsApp después de guardar");
    // Y el 400/503 de WhatsApp salen antes de todo.
    assert.ok(ALTA.indexOf("M.sin_whatsapp") < iTx, "se guarda antes de saber si tiene WhatsApp");
    assert.ok(ALTA.indexOf("M.whatsapp_caido") < iTx, "se guarda sin poder comprobar el número");
  });

  test("un fallo al encolar NO tumba el alta ni pierde el carné", () => {
    assert.match(cola, /catch \(e\) \{/);
    assert.match(ALTA, /console\.error\(lineaErrorSql\("\[fidelizacion\] carné y mensaje del alta", e\)\)/);
  });

  test("RECIÉN ENCOLADO ES «PENDIENTE», nunca «enviado»", () => {
    // Decir «te lo hemos enviado» en el mismo instante de encolarlo sería afirmar algo que aún
    // no ha pasado. «Enviado» solo cuando `cap_cola` tiene fecha.
    assert.match(ALTA, /enCola\.enviado_en \? "enviado_wa"/);
    assert.match(ALTA, /enCola\.estado === "fallido" \? "fallo_envio"/);
    assert.match(ALTA, /: "pendiente_envio"/);
    for (const k of ["pendiente_envio", "enviado_wa", "fallo_envio"]) {
      assert.ok(MENSAJES_FORM[k], `falta el mensaje ${k}`);
      assert.ok(MENSAJES_CA[k], `falta el mensaje ${k} en catalán`);
      assert.notEqual(MENSAJES_CA[k], MENSAJES_FORM[k], `${k} sigue en castellano`);
    }
  });

  test("y la pantalla pública lo dice tal cual", () => {
    const promoJs = readFileSync(new URL("../public/promo.js", import.meta.url), "utf8");
    assert.match(promoJs, /if \(j\.envio && j\.envio\.texto\)/);
    assert.match(promoJs, /pe\.textContent = j\.envio\.texto;/);
    // Texto, nunca HTML.
    assert.ok(!/envio[^\n]*innerHTML/.test(promoJs));
  });

  test("EL WORKER VUELVE A MIRAR LA BAJA antes de mandar", () => {
    const worker = server.slice(server.indexOf("async function capVaciarCola()"),
                                server.indexOf("async function capVaciarCola()") + 7000);
    const iBaja = worker.indexOf("SELECT baja FROM marketing_prefs");
    const iManda = worker.indexOf("sendMensajeLibre");
    assert.ok(iBaja > 0 && iManda > iBaja, "manda antes de comprobar la baja");
  });

  test("NI TELÉFONO NI TOKEN DE BAJA EN REGISTROS NI AUDITORÍA", () => {
    const cuerpo = sinComentarios(ALTA);
    for (const m of cuerpo.matchAll(/console\.(log|error|warn)\(([^\n]*)/g)) {
      assert.match(m[2], /^lineaErrorSql\(/, `registro a pelo: ${m[2]}`);
    }
    // SIN COMENTARIOS: el de al lado explica que ahí NO va el teléfono, y esa palabra no puede
    // hacer fallar al candado que comprueba justo eso.
    const audit = sinComentarios(ALTA.slice(ALTA.indexOf('ficAuditar("fidelizacion", null, "alta_formulario"')));
    const detalle = audit.slice(0, audit.indexOf("} });"));
    for (const fuga of ["tel", "tokenBaja", "urlBaja", "urlCarnet", "texto"]) {
      assert.ok(!new RegExp(`\\b${fuga}\\b`).test(detalle), `la auditoría lleva ${fuga}: ${detalle}`);
    }
    assert.match(detalle, /encolado: !!enCola/);
  });

  test("y el mensaje que se manda NO sale por la ruta pública", () => {
    const GET = ruta('app.get("/api/publico/formulario/:clave"');
    assert.ok(!GET.includes("mensaje_wa"), "el texto del WhatsApp se expone en público");
  });

  test("esto no enciende puntos ni mueve la puerta", () => {
    for (const p of ["fid_puerta", "fid_movimientos", "aplicarPrograma", "conceder"]) {
      assert.ok(!ALTA.includes(p), `el alta toca ${p}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("permisos y efectos", () => {
  test("solo Dirección y Marketing", () => {
    for (const r of ['app.get("/api/fidelizacion/formularios/:clave/inscritos", requireAuth(PROMOS_ROLES)',
                     'app.get("/api/fidelizacion/formularios/:clave/inscritos.csv", requireAuth(PROMOS_ROLES)',
                     'app.get("/api/captacion/inscritos/resumen", requireAuth(PROMOS_ROLES)']) {
      assert.ok(server.includes(r), `falta el permiso en ${r.slice(0, 60)}`);
    }
    assert.match(server, /const PROMOS_ROLES = \["direccion", "marketing"\];/);
  });

  test("VER LA LISTA NO ESCRIBE NADA", () => {
    for (const [n, r] of [["lista", LISTA], ["resumen", RESUMEN]]) {
      const cuerpo = sinComentarios(r);
      for (const escritura of ["INSERT ", "UPDATE ", "DELETE ", "dbRun("]) {
        assert.ok(!cuerpo.includes(escritura), `${n} hace ${escritura.trim()}`);
      }
    }
    // El CSV solo escribe en la auditoría, que es justo lo que se pidió.
    const csv = sinComentarios(CSV);
    assert.ok(!/INSERT |UPDATE |DELETE |dbRun\(/.test(csv), "el CSV escribe en los datos");
    assert.match(csv, /ficAuditar/);
  });

  test("y contar altas vive en CAPTACIÓN: la zona de Ágora no toca `leads`", () => {
    // Es un invariante de la casa: allí se calculan puntos sobre facturas y no se toca el censo.
    const zona = server.slice(server.indexOf("// FIDELIZACIÓN CON ÁGORA · FASE 1"),
                              server.indexOf('app.get("/", (req, res)'));
    assert.ok(!zona.includes("leads"), "la zona de fidelización toca leads");
    assert.ok(server.indexOf('app.get("/api/captacion/inscritos/resumen"')
      < server.indexOf("// FIDELIZACIÓN CON ÁGORA · FASE 1"), "el resumen está dentro de la zona");
  });

  test("el público no cambia: el formulario contesta igual que antes", () => {
    const alta = ruta('app.post("/api/publico/formulario/:clave"');
    // Una sola salida buena, y sin decir si el teléfono ya existía.
    assert.equal([...sinComentarios(alta).matchAll(/res\.json\(\{ ok: true/g)].length, 1);
    assert.match(alta, /MISMA RESPUESTA, exista o no/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("«Origen» en Clientes", () => {
  test("se agrega por teléfono: quien se apuntó cinco veces sigue siendo una ficha", () => {
    const sql = server.slice(server.indexOf("function sqlContactosUnificados"),
                             server.indexOf("function sqlContactosUnificados") + 9000);
    const i = sql.indexOf("MIN(creado_en) AS primera_captacion");
    assert.ok(i > 0, "no se calcula la primera captación");
    assert.match(sql.slice(i, i + 400), /FROM leads GROUP BY 1/);
    const j = sql.indexOf("COUNT(*)::int AS veces, MAX(creado_en) AS ultimo");
    assert.ok(j > 0, "no se cuentan los consentimientos");
    assert.match(sql.slice(j, j + 200), /FROM fid_consentimientos GROUP BY 1/);
  });

  test("enseña primera captación y última campaña", () => {
    assert.match(app, /function cliOrigen\(c\)/);
    assert.match(app, /c\.ultima_campana/);
    assert.match(app, /Primera captación/);
    assert.match(app, /function cliFichaOrigen\(d\)/);
  });

  test("y el historial de consentimientos sin duplicar al cliente", () => {
    const ficha = app.slice(app.indexOf("function cliFichaOrigen(d)"), app.indexOf("async function cliFicha(tel)"));
    assert.match(ficha, /Consentimientos dados/);
    assert.match(ficha, /Ha entrado por \$\{d\.campanas\} campañas distintas/);
  });

  test("la ficha individual también los devuelve, agregados", () => {
    const f = ruta('app.get("/api/contactos/:telefono"');
    assert.match(f, /FROM leads WHERE \$\{MATCH_TEL9\("telefono"\)\}/);
    assert.match(f, /COUNT\(DISTINCT COALESCE\(NULLIF\(campana, ''\), fuente\)\)::int AS campanas/);
    assert.match(f, /primera_captacion: origen\?\.primera_captacion \|\| null/);
  });

  test("y sigue siendo una ruta con sesión, no pública", () => {
    assert.match(server, /app\.get\("\/api\/contactos\/:telefono", requireAuth\(/);
    assert.match(server, /app\.get\("\/api\/contactos", requireAuth\(\["direccion", "marketing"\]\)/);
  });
});
