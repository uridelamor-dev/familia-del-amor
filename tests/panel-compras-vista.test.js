// Compras y Productos: lo que se ve al abrirlas.
//
// Estas dos pantallas se abren todos los días y son tablas: cada píxel que se gasta arriba es
// una fila menos que se ve sin desplazar. Medido en un portátil de 1440×800, la primera fila
// empezaba a 448 px en Compras y a 539 px en Productos — cinco filas de catorce.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/panel/index.html", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

describe("Compras: las cifras de arriba contestan la pregunta del día", () => {
  test("qué hay que pagar y cuándo, no cuánto se gastó", () => {
    // Antes eran cuatro tarjetas —facturas, base, IVA, total— que son cuatro vistas del mismo
    // número; para saber si algo estaba vencido había que irse a la pestaña de Pagos.
    assert.match(panel, /stat\("Por pagar"/);
    assert.match(panel, /stat\("Vence en 7 días"/);
    assert.match(panel, /Vencido<\/div>/);
  });

  test("y la base y el IVA no se pierden: bajan a una línea", () => {
    assert.match(panel, /base \$\{esc\(eur\(t\.base\)\)\} · IVA \$\{esc\(eur\(t\.iva\)\)\}/);
  });

  test("el servidor los calcula con el MISMO filtro que la tabla", () => {
    // Si las cifras fueran del año entero y la tabla del filtro, se leerían como del filtro.
    const i = server.indexOf("AS vencidas");
    assert.ok(i > 0, "faltan los agregados de vencimiento");
    assert.match(server.slice(i - 900, i + 900), /FROM facturas \$\{where\}/);
  });

  test("y los «?» de esos agregados van antes que los del WHERE", () => {
    // `toPositional` numera los «?» por su sitio en el SQL: pasarlos al final los cruzaría con
    // los del filtro y la consulta compararía fechas con nombres de establecimiento.
    assert.match(server, /\[hoyISO\(\), hoyISO\(\), hoyISO\(\), hoyMas\(7\), hoyISO\(\), hoyMas\(7\), \.\.\.params\]/);
  });
});

describe("los importes se escriben igual en toda la pantalla", () => {
  test("los miles se separan también con cuatro cifras", () => {
    // En español, Intl por defecto NO agrupa «7809», y salía junto a «12.481» como si vinieran
    // de dos sitios distintos. Pasa en la misma tarjeta, así que se nota.
    assert.match(panel, /new Intl\.NumberFormat\("es-ES", \{ useGrouping: "always" \}\)/);
    assert.match(panel, /maximumFractionDigits: 2, useGrouping: "always"/);
  });
});

describe("Compras: la tabla", () => {
  test("no repite el establecimiento en cada fila cuando solo hay uno", () => {
    assert.match(panel, /const conLocal = !localActualFE\(\);/);
  });

  test("la fecha se lee («16 ago»), no se descifra («2026-08-16»)", () => {
    assert.match(panel, /esc\(fechaCorta\(f\.fecha\) \|\| \(f\.fecha \|\| ""\)\.slice\(0, 10\)\)/);
  });

  test("la fila entera abre la ficha, pero la casilla de marcar sigue siendo suya", () => {
    assert.match(panel, /class="\$\{FAC_SEL\.has\(f\.id\) \? "sel" : ""\} facrow"/);
    assert.match(panel, /t\.classList\.contains\("facrow"\) && e\.target\.closest\("input,button,a,label"\)/);
  });
});

describe("Productos: la tabla se lee de un vistazo", () => {
  test("los nombres no van pintados del color de marca", () => {
    // En rojo, una tabla de 167 productos se lee como una lista de errores.
    assert.match(css, /\.linkbtn\.prod\{color:var\(--ink\)/);
    assert.match(css, /\.linkbtn\.prod\{[^}]*text-overflow:ellipsis/);
  });

  test("la cantidad lleva su unidad, y solo si es una", () => {
    assert.match(panel, /g\.unidad \? ` <span class="mut" style="font-size:11px">\$\{esc\(g\.unidad\)\}<\/span>` : ""/);
    assert.match(server, /array_agg\(DISTINCT l\.unidad\) FILTER \(WHERE COALESCE\(l\.unidad,''\) <> ''\)/);
  });

  test("el gasto lleva su proporción, medida contra el que más gasta", () => {
    // Contra el total, con 167 productos todas las barras serían un pelo.
    assert.match(panel, /const topeGasto = Math\.max\(1, \.\.\.j\.grupos\.map\(\(g\) => Number\(g\.importe\) \|\| 0\)\)/);
  });

  test("los avisos son chips y los accionables son botones", () => {
    // Eran cuatro líneas de texto seguido encima de la tabla.
    assert.match(panel, /data-comp="releer-descuadre" data-n=/);
    assert.match(panel, /facRepasoLineas\(Number\(rd\.getAttribute\("data-n"\)\) \|\| 0, "descuadre"\)/);
  });

  test("«En qué se va el dinero» dice algo aun estando cerrado", () => {
    // Cerrado ponía «6 categorías», que no es información. Sigue cerrado: nada se abre solo.
    assert.match(panel, /g\.categorias\.slice\(0, 3\)\.map/);
    assert.match(panel, /<details class="card fold" style="margin-bottom:14px">/);
  });

  test("sin cola pendiente sigue habiendo forma de deshacer una unión", () => {
    // La caja de revisar se va, pero la lista del diccionario NO: ahí está el botón de quitar
    // una forma mal unida. Antes se iban las dos y no quedaba manera de deshacer.
    assert.match(panel, /pintarConservandoPliegues\(caja, dicProductosHtml\(\)\);/);
  });
});

describe("todo se entrega también en móvil", () => {
  // En un iPhone (390×844), la primera factura empezaba a 838 px: una pantalla entera de
  // deslizar sin ver ni una factura. Ahora empieza a 421 px.
  test("las tres cifras no se apilan: una línea de tres", () => {
    assert.match(css, /\.statsm\{grid-template-columns:repeat\(3,1fr\)/);
  });

  test("las pestañas no se parten en dos filas: se deslizan", () => {
    assert.match(css, /\.tabstrip\{flex-wrap:nowrap;overflow-x:auto/);
    assert.match(panel, /<div class="toolbar tabstrip"/);
  });

  test("la columna de marcar se va: 60 px de 390 para algo que es de escritorio", () => {
    assert.match(css, /\.tbl th\.facsel,\.tbl td\.facsel\{display:none\}/);
  });

  test("la columna pegajosa se limita en píxeles, para que el dinero quepa", () => {
    // Con nombres largos se comía la pantalla entera: se veían los productos y ni un euro.
    assert.match(css, /\.tbl td:first-child,\.tbl th:first-child\{max-width:180px\}/);
  });

  test("la fecha pierde el día de la semana, que son 34 px", () => {
    assert.match(panel, /<span class="solosm">\$\{esc\(fechaMini\(f\.fecha\)/);
    assert.match(css, /\.solosm\{display:none\}/);
    assert.match(css, /\.solosm\{display:inline\}/);
  });

  test("y el importe no se parte en dos líneas", () => {
    assert.match(panel, /<td class="r tnum" style="white-space:nowrap"><b>\$\{eur\(f\.total\)\}/);
  });
});

describe("las listas largas se recorren", () => {
  test("la cabecera se queda arriba, y por eso la tabla larga tiene altura propia", () => {
    // `position:sticky` se agarra al antecesor que se desplaza, y `.tw` ya se desplaza en
    // horizontal: sin darle altura, «top:0» no se agarra a nada y la cabecera se iba.
    assert.match(css, /\.tw\.alta\{max-height:calc\(100vh - 300px\)/);
    assert.match(css, /\.tbl thead th\{position:sticky;top:0/);
    assert.match(panel, /list\.length > 25 \? " alta" : ""/);
    assert.match(panel, /j\.grupos\.length > 25 \? " alta" : ""/);
  });

  test("y hay bandas de mes, pero solo cuando la lista es larga", () => {
    // En una lista corta la banda es más ruido que ayuda.
    assert.match(panel, /function bandasDeMes\(list, fila, columnas, minimo = 30\)/);
    assert.match(panel, /if \(list\.length < minimo\) return list\.map\(fila\)\.join\(""\)/);
  });
});

describe("la evolución del precio, dibujada", () => {
  test("se dibuja a mano en SVG: aquí no se pueden añadir librerías", () => {
    assert.match(panel, /function sparkPrecio\(g\)/);
    assert.match(panel, /<svg class="spark"/);
  });

  test("con menos de tres compras no se dibuja nada", () => {
    // Dos puntos son una recta, y una recta se lee como una tendencia que no existe.
    assert.match(panel, /if \(ps\.length < 3\) return "";/);
  });

  test("si todos los precios son iguales, la línea va por el medio", () => {
    // Aplastada contra el borde parecería que el precio está por los suelos.
    assert.match(panel, /max === min \? H \/ 2 :/);
  });

  test("y en móvil la columna se va, que el ancho hace más falta para el nombre", () => {
    assert.match(css, /\.tbl th\.sparkcel,\.tbl td\.sparkcel\{display:none\}/);
  });
});

describe("el trabajo en lote se hace donde se ve", () => {
  test("marcar varias facturas como pagadas dice el estado, no lo conmuta", () => {
    // El endpoint de una sola factura es un interruptor: aplicado a veinte, las que ya estaban
    // pagadas se quedarían sin pagar.
    const i = server.indexOf('app.post("/api/facturas/pago-lote"');
    assert.ok(i > 0, "falta el endpoint de pago en lote");
    const fn = server.slice(i, server.indexOf("\n});\n", i));
    assert.match(fn, /const pagado = req\.body\?\.pagado \? 1 : 0;/);
    assert.doesNotMatch(fn, /row\.pagado \? 0 : 1/);
  });

  test("y solo toca los establecimientos que esa persona puede tocar", () => {
    const i = server.indexOf('app.post("/api/facturas/pago-lote"');
    assert.match(server.slice(i, i + 1800), /filter\(\(f\) => puedeAccederLocal\(req, f\.local\)\)/);
  });

  test("antes de marcar se dice cuántas son y cuánto suman", () => {
    // Marcar veinte por error es fácil de hacer y molesto de deshacer.
    assert.match(panel, /Se marcan \$\{sel\.length\}[^`]*\$\{eur\(suma\)\}/);
  });

  test("unificar productos se hace desde la lista, en una sola operación", () => {
    const i = server.indexOf('app.post("/api/facturas/diccionario/unificar"');
    assert.ok(i > 0, "falta el endpoint de unificar");
    const fn = server.slice(i, server.indexOf("\n});\n", i));
    // Los tres casos: producto existente, descripción suelta, y varios productos a la vez.
    assert.match(fn, /\/\^p:\(\\d\+\)\$\//);
    assert.match(fn, /INSERT INTO producto_alias/);
    assert.match(fn, /UPDATE producto_alias SET producto_id = \? WHERE producto_id = \?/);
  });

  test("al fusionar dos productos, primero se mueven las formas y luego se borra", () => {
    // Al revés, el borrado en cascada se las lleva por delante y vuelven todas a la cola.
    const i = server.indexOf('app.post("/api/facturas/diccionario/unificar"');
    const fn = server.slice(i, server.indexOf("\n});\n", i));
    assert.ok(fn.indexOf("UPDATE producto_alias SET producto_id") < fn.indexOf("DELETE FROM productos_canonicos"));
  });

  test("el nombre que se propone es el limpio, no el más largo", () => {
    // El más largo era justo la línea de albarán que se quiere enterrar.
    assert.match(panel, /function nombreParaUnificar\(descripciones\)/);
    assert.match(panel, /letras - cifras \* 2/);
  });
});

describe("la cola del diccionario se puede despachar por establecimiento", () => {
  test("la cola lleva local; el diccionario que sale de ahí, no", () => {
    assert.match(panel, /"\/api\/facturas\/diccionario" \+ \(loc \? "\?local=" \+ encodeURIComponent\(loc\) : ""\)/);
  });

  test("y la cobertura se mide sobre lo mismo que la cola", () => {
    // Si la cola es de Blanes y el «ya revisado» de los siete, el porcentaje no dice nada.
    assert.match(server, /WHERE \$\{SIN_DUDAS\}\$\{local \? " AND f\.local = \?" : ""\} GROUP BY a\.clave/);
  });

  test("y se dice en pantalla que lo decidido vale para todos los locales", () => {
    assert.match(panel, /lo que decidas vale para todos: el producto es el mismo en todas partes/);
  });
});

describe("exportar da los papeles, no una hoja de cálculo", () => {
  test("«Descargar documentos» está en la barra de selección, y el CSV aparte", () => {
    assert.match(panel, /data-act="fac-sel-docs">Descargar documentos</);
    assert.match(panel, /data-act="fac-sel-export" title="Solo los datos/);
  });

  test("uno solo se baja directo; varios van en un ZIP que arma el servidor", () => {
    // Encadenar descargas desde el navegador no vale: Safari se queda con la primera.
    assert.match(panel, /if \(ids\.length === 1\)/);
    assert.match(panel, /"\/api\/facturas\/export\.zip"/);
  });

  test("el servidor solo mete las que esa persona puede ver", () => {
    const i = server.indexOf('app.post("/api/facturas/export.zip"');
    assert.ok(i > 0, "falta el endpoint del ZIP");
    assert.match(server.slice(i, i + 2200), /filter\(\(f\) => puedeAccederLocal\(req, f\.local\) && f\.drive_url\)/);
  });

  test("y dice cuántas se han quedado fuera", () => {
    // Un ZIP con menos facturas de las pedidas y en silencio es una trampa.
    assert.match(server, /res\.setHeader\("X-Faltan"/);
    assert.match(panel, /Number\(r\.headers\.get\("X-Faltan"\)\)/);
  });

  test("con un tope por tanda, que se monta entero en memoria", () => {
    assert.match(server, /const TOPE_ZIP = 60;/);
    assert.match(server, /ids\.length > TOPE_ZIP/);
  });
});

describe("la ficha de una factura", () => {
  test("enseña el papel, que es para lo que se abre una ficha", () => {
    assert.match(panel, /facPintarPapel\(ov\.querySelector\("\[data-ficthumb\]"\), f\.id\)/);
    assert.match(css, /\.ficha\{display:grid;grid-template-columns:minmax\(200px,300px\) 1fr/);
  });

  test("y si lo que vuelve no es una imagen, lo dice con palabras", () => {
    // Pintarlo daría el icono de foto rota, que parece un fallo del panel.
    assert.match(panel, /startsWith\("image\/"\)/);
  });

  test("los datos van agrupados: quién, documento y dinero", () => {
    // Con doce casillas iguales, el NIF pesaba lo mismo que el total.
    assert.match(panel, /<span class="fic-gt">Quién<\/span>/);
    assert.match(panel, /<span class="fic-gt">Documento<\/span>/);
    assert.match(panel, /<span class="fic-gt">Dinero<\/span>/);
  });

  test("la suma se comprueba mientras se escribe", () => {
    assert.match(panel, /Base \+ IVA da el total/);
    assert.match(panel, /el\.addEventListener\("input", pintarSuma\)/);
  });

  test("y «Eliminar» deja de ser un botón rojo al lado de «Guardar»", () => {
    // Es lo que no se quiere pulsar sin querer: se va al otro extremo y pierde peso.
    assert.match(panel, /<button class="linkbtn danger" id="ficDel">/);
  });

  test("en la lista manda el proveedor y el número queda debajo", () => {
    // «250048061012013» no se reconoce; «Tupinamba» sí.
    assert.match(panel, /<div class="t1">\$\{esc\(f\.proveedor \|\| "Sin proveedor"\)\}<\/div>/);
  });
});

describe("«sin fecha de pago» es una lista de proveedores, no de facturas", () => {
  test("porque las condiciones se ponen en el proveedor", () => {
    // Se ponen una vez en su ficha y valen para todas sus facturas, las de hoy y las que
    // entren mañana. Enseñar la lista factura a factura invita a arreglarlo donde no es.
    assert.match(panel, /if \(g\.clave === "sin_fecha"\)/);
    assert.match(panel, /data-pago="prov"[^>]*>Poner condiciones</);
  });

  test("una factura suelta también se enseña como proveedor", () => {
    // Si no, media sección serían proveedores y la otra media facturas.
    assert.match(panel, /const comoProveedor = \(f\) => f\.facturas \? f :/);
  });

  test("y se agrupan por proveedor Y empresa, que es como se guardan las condiciones", () => {
    // La regla de pago tiene clave (prov_clave, empresa): dos empresas del grupo necesitan
    // dos reglas, así que son dos filas por arreglar.
    assert.match(panel, /const k = `\$\{String\(x\.proveedor \|\| ""\)\.toLowerCase\(\)\}\|\$\{x\.empresa \|\| ""\}`/);
  });

  test("la cabecera cuenta proveedores, no facturas", () => {
    assert.match(panel, /provs\.length === 1 \? "proveedor" : "proveedores"/);
  });
});

describe("Productos: ordenar, exportar y columnas (de haddock)", () => {
  test("el orden va en la CONSULTA, no en el navegador", () => {
    // La lista viene topada: ordenar después de recortar daría «la A-Z de los cinco mil que
    // más gastan», que no es la A-Z de nada.
    assert.match(server, /const ORDENES_COMPRAS = \{/);
    assert.match(server, /ORDER BY \$\{ordenCompras\(req\.query\.orden\)\}/);
  });

  test("y solo se aceptan los órdenes de la lista", () => {
    // Esto se pega dentro de un ORDER BY: cualquier otra cosa sería inyección.
    assert.match(server, /const ordenCompras = \(o\) => ORDENES_COMPRAS\[String\(o \|\| ""\)\] \|\| ORDENES_COMPRAS\.gasto;/);
  });

  test("el CSV sale con los MISMOS filtros y el mismo orden que la pantalla", () => {
    // Un CSV que no coincide con la pantalla de la que salió es peor que no tenerlo.
    assert.match(panel, /COMP_FILTROS\.forEach\(\(k\) => \{ if \(COMP\[k\]\) qs\.set\(k, COMP\[k\]\); \}\);\s*\n\s*\/\/ Con `fetch`/);
    assert.match(server, /app\.get\("\/api\/facturas\/compras\.csv"/);
  });

  test("y se baja con fetch, porque un enlace no lleva el token", () => {
    assert.match(panel, /fetch\("\/api\/facturas\/compras\.csv\?"/);
  });

  test("el proveedor tiene columna propia y no va en rojo", () => {
    // Una columna entera de nombres en rojo se lee como una lista de errores: el mismo fallo
    // que ya tuvimos con los nombres de producto.
    assert.match(panel, /<td class="provcol">/);
    assert.match(css, /\.linkbtn\.provlink\{[^}]*color:var\(--ink2\)/);
  });

  test("la categoría se lee con su nombre, no solo con un color", () => {
    assert.match(panel, /<td class="catcol">/);
    assert.match(panel, /<span class="pill cat" style="--cat:var\(--cat-/);
  });

  test("y con la ventana estrecha se van antes que el dinero", () => {
    assert.match(css, /@media \(max-width:1180px\)\{\.tbl td\.catcol/);
    assert.match(css, /@media \(max-width:1040px\)\{\.tbl td\.provcol/);
  });
});

describe("un descuadre se puede perseguir y arreglar", () => {
  test("la ficha dice de cuánto es y hacia dónde", () => {
    // La etiqueta decía «descuadre» y ahí se acababa: ni cuánto suman las líneas, ni cuánto
    // dice la factura, ni de cuánto va la cosa. Una factura marcada que no se puede revisar
    // acaba ignorándose.
    assert.match(panel, /No cuadra por \$\{esc\(eur2\(Math\.abs\(dif\)\)\)\}/);
    assert.match(panel, /Sobra detalle: puede haber una línea repetida/);
    assert.match(panel, /Falta detalle: puede haber una línea que no se leyó/);
  });

  test("y los números del detalle se corrigen ahí mismo", () => {
    assert.match(panel, /<input class="lincel" data-campo="importe"/);
    assert.match(panel, /<input class="lincel" data-campo="cantidad"/);
  });

  test("se guarda al SALIR del recuadro, no en cada tecla", () => {
    // Escribiendo «121,49» se pasa por «1», «12», «121»… y se guardaría cuatro veces, tres de
    // ellas con un número que nadie ha querido poner.
    assert.match(panel, /inp\.addEventListener\("change"/);
    assert.doesNotMatch(panel, /lincel[\s\S]{0,400}addEventListener\("input"/);
  });

  test("si no se pudo guardar, el número vuelve a como estaba", () => {
    // Dejarlo en pantalla haría creer que se guardó.
    assert.match(panel, /inp\.value = inp\.dataset\.antes;\s*\/\/ si no se pudo guardar/);
  });

  test("y el cuadre se recalcula en el servidor, no en el navegador", () => {
    // Es lo que hace que la etiqueta de «descuadre» desaparezca sola de la lista.
    assert.match(server, /async function recalcularCuadre\(facturaId, baseImponible\)/);
    assert.match(server, /const v = await recalcularCuadre\(l\.factura_id, l\.base_imponible\);/);
  });
});

describe("descartar en conciliaciones sale donde tiene que salir", () => {
  test("una propuesta NO es un vínculo: en una factura sin conciliar se puede descartar", () => {
    // Tratando los albaranes propuestos como ya ligados, el botón no aparecía nunca — que es
    // justo donde hace falta. El banco de pruebas no lo cazó porque su respuesta falsa no se
    // parecía a la del servidor.
    assert.match(panel, /const yaConciliada = p\.estado === "conciliada" \|\| p\.estado === "conciliada-parcial";/);
    assert.match(panel, /const ligados = yaConciliada \? \(p\.albaranes \|\| \[\]\)\.map\(\(a\) => a\.id\) : \[\];/);
  });
});

describe("la ✕ de descartar tiene que descartar", () => {
  test("nada de `stopPropagation` en el botón", () => {
    // Lo llevaba para que el clic no marcara la casilla —la fila es un <label>— y con eso el
    // evento no llegaba al manejador delegado, que es quien escucha: el botón no hacía nada.
    // Quien evita que se marque la casilla es el preventDefault() del manejador.
    const i = panel.indexOf('data-conc="descartar"');
    const linea = panel.slice(i - 200, i + 260);
    assert.doesNotMatch(linea, /stopPropagation/);
    assert.match(panel, /if \(w === "descartar"\) \{ e\.preventDefault\(\);/);
  });
});

describe("cerrar una factura que no lleva albarán", () => {
  test("existe y se guarda con nombre y fecha", () => {
    // Hay proveedores que no dejan albarán nunca y su factura se queda para siempre en la
    // lista pidiendo algo que no va a llegar. Es una decisión, no un dato del papel: por eso
    // se firma.
    assert.match(server, /app\.post\("\/api\/facturas\/:id\/sin-albaran"/);
    assert.match(server, /SET sin_albaran_por = \?, sin_albaran_en = \? WHERE id = \?/);
  });

  test("no se puede cerrar una que ya está conciliada", () => {
    // Sería contradecir lo que se ve en la propia tarjeta.
    assert.match(server, /if \(f\.conciliado_con\) return res\.status\(409\)/);
  });

  test("se puede reabrir, porque el albarán a veces aparece un mes después", () => {
    assert.match(server, /if \(req\.body\?\.reabrir\)/);
    assert.match(panel, /data-conc="reabrir"/);
  });

  test("y no se esconde: tiene su propio filtro", () => {
    assert.match(panel, /\["cerrada", "Cerradas"\]/);
  });

  test("cerrar pregunta; reabrir no", () => {
    // Deshacer tiene que ser más fácil que hacer.
    assert.match(panel, /if \(!reabrir\) \{\s*\n\s*const ok = await confirmModal\(/);
  });
});
