// Facturas — quién emite y quién recibe. Lógica PURA.
//
// EL FALLO QUE ARREGLA: en una factura de la gestoría, la lectura puso como proveedor a
// «DEL AMOR SALINAS, MATEO», que somos nosotros —es el nombre fiscal de La Tapa Ibérica—, y
// como NIF cogió «430001836», que es el NÚMERO DE CLIENTE que nos tiene asignado la gestoría.
// El proveedor de verdad era Euroconta. En una factura de servicios los dos nombres están casi
// pegados, sin líneas de producto que ayuden a distinguir cuál es cuál.
//
// No se arregla solo pidiéndoselo mejor al modelo. Se arregla con lo que SÍ sabemos con
// certeza: nuestros propios CIF y nombres fiscales. Si el «proveedor» somos nosotros, no es el
// proveedor. Eso no es una heurística: es un hecho.

/** Quita puntos, guiones y espacios, y sube a mayúsculas. */
export const normNif = (s) => String(s || "").replace(/[\s.\-/]/g, "").toUpperCase();

// La barra y el guion separan igual que un espacio: «P.AYLLON/CAN MATEU» son tres palabras, no
// una. Sin esto, un nombre nuestro pegado con barra a otra cosa no se reconocía.
const norm = (s) => String(s || "").trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.,/\-]/g, " ").replace(/\s+/g, " ").trim();

const LETRAS_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";

/**
 * ¿Es un NIF español con la letra correcta? Vale para DNI/NIE (letra de control por módulo 23)
 * y para CIF de sociedad (letra inicial + 7 dígitos + control).
 *
 * Sirve para algo muy concreto: «430001836» son nueve dígitos sin letra, así que NO es un NIF.
 * Es el número de cliente. Un dato que no puede ser lo que dice ser es una señal de que la
 * lectura se ha equivocado de sitio.
 */
export function nifValido(valor) {
  const n = normNif(valor);
  if (!n) return false;
  const dni = /^(\d{8})([A-Z])$/.exec(n);
  if (dni) return LETRAS_DNI[Number(dni[1]) % 23] === dni[2];
  const nie = /^([XYZ])(\d{7})([A-Z])$/.exec(n);
  if (nie) return LETRAS_DNI[Number("XYZ".indexOf(nie[1]) + nie[2]) % 23] === nie[3];
  // CIF: no se comprueba el dígito de control (hay dos variantes según la letra inicial); se
  // comprueba la FORMA, que ya descarta un número de cliente suelto.
  return /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(n);
}

/**
 * ¿Este par (nombre, NIF) es una de NUESTRAS empresas?
 * `nuestras` viene de facturas_locales: [{empresa, cif}].
 */
/**
 * Los nombres con los que nos llamamos a nosotros mismos, más allá del nombre fiscal.
 *
 * `facturas_locales.empresa` tiene «DEL AMOR URIEL SLU», que es como consta en el registro —
 * pero en una factura ponemos «LA TAPETA», «CAN MATEU» o «LA TAPA IBERICA», que son los
 * nombres con los que existimos de cara al mundo. Sin esto, esas facturas entraban con
 * NOSOTROS MISMOS como proveedor, y acababan en «de qué es cada proveedor» pidiendo que
 * alguien les pusiera categoría.
 */
export const nombresPropios = (locales = [], extra = []) =>
  [...locales, ...extra].map((x) => String(x || "").split(/\s+-\s+/)[0]).filter((x) => x && x.length > 3);

export function esNuestra(nombre, nif, nuestras = [], propios = []) {
  const n = normNif(nif);
  if (n && nuestras.some((x) => normNif(x.cif) && normNif(x.cif) === n)) return "cif";
  const nom = norm(nombre);
  if (!nom) return null;
  // Los nombres de nuestros establecimientos y los que se hayan marcado a mano. Se comparan
  // ENTEROS o como principio/final —«LA TAPETA» dentro de «P.AYLLON/CAN MATEU» sí, pero
  // «Tapetería García» no—: la misma regla de «es», no «contiene», que ya usa el catálogo.
  for (const raw of propios) {
    const pn = norm(raw);
    if (!pn || pn.length < 4) continue;
    if (nom === pn || nom.startsWith(pn + " ") || nom.endsWith(" " + pn) || nom.includes(" " + pn + " ")) return "propio";
  }
  for (const x of nuestras) {
    const e = norm(x.empresa);
    if (!e) continue;
    if (e === nom) return "nombre";
    // «Mateu Del Amor Salinas» y «DEL AMOR SALINAS, MATEO»: las mismas palabras en otro orden
    // y una escrita en catalán. Por eso no se exige que coincidan TODAS —«mateu»/«mateo» no lo
    // hacen— sino la mayoría: tres de cada cuatro. Que un proveedor comparta tres palabras
    // largas con nuestro nombre fiscal y no sea nosotros no pasa.
    //
    // En la factura de la gestoría esto es lo ÚNICO que hay: nuestro NIF no aparece por
    // ningún lado, solo el número de cliente. Sin el emparejado por nombre no se caza.
    const pa = new Set(nom.split(" ").filter((w) => w.length > 2));
    const pb = new Set(e.split(" ").filter((w) => w.length > 2));
    const minimo = Math.min(pa.size, pb.size);
    if (minimo >= 2) {
      const comunes = [...pa].filter((w) => pb.has(w)).length;
      if (comunes >= 2 && comunes / minimo >= 0.7) return "nombre";
    }
  }
  return null;
}

/** ¿Es nuestra POR EL NOMBRE? Sirve para distinguir «se han cambiado los papeles» de «se ha
 * colado nuestro CIF en la casilla del proveedor», que piden respuestas distintas. */
export function esNuestraPorNombre(nombre, nuestras = [], propios = []) {
  const r = esNuestra(nombre, null, nuestras, propios);
  return r === "nombre" || r === "propio";
}

/**
 * Corrige la lectura si se han cambiado los papeles.
 *
 *   → { datos, corregido: bool, aviso: string|null }
 *
 * Solo se intercambia cuando hay a la vez las dos condiciones: el «proveedor» es nuestro Y el
 * «receptor» no lo es. Con una sola no se toca nada — cambiar los datos de una factura a medias
 * es peor que dejarla mal, porque encima parece revisada.
 */
export function corregirEmisorReceptor(datos = {}, nuestras = [], propios = []) {
  const d = { ...datos };
  const provEsNuestro = esNuestra(d.proveedor, d.nif_proveedor, nuestras, propios);
  const recEsNuestro = esNuestra(d.nombre_receptor, d.nif_receptor, nuestras, propios);

  if (provEsNuestro && !recEsNuestro && (d.nombre_receptor || d.nif_receptor)) {
    return {
      datos: {
        ...d,
        proveedor: d.nombre_receptor, nif_proveedor: d.nif_receptor,
        nombre_receptor: datos.proveedor, nif_receptor: datos.nif_proveedor,
      },
      corregido: true,
      aviso: `Se leyó al revés: «${datos.proveedor}» somos nosotros, así que es quien RECIBE la factura. El proveedor es «${d.nombre_receptor}».`,
    };
  }

  // Es nuestro y no hay con qué cambiarlo: no se inventa un proveedor, se avisa.
  if (provEsNuestro && !recEsNuestro) {
    return { datos: d, corregido: false,
      aviso: `El proveedor leído («${datos.proveedor}») somos nosotros, y no se ha leído ningún otro nombre. Revisa quién emite esta factura.` };
  }

  // NUESTRO PROPIO CIF COMO NIF DEL PROVEEDOR. Es el caso más silencioso de todos: el nombre
  // del proveedor está BIEN leído —«TRANSGOURMET»— y lo que se ha colado es nuestro CIF en la
  // casilla de su NIF. Como el nombre no es nuestro pero el NIF sí, `esNuestra` decía «sí» por
  // el CIF y esto acababa en «los dos parecen nuestros»: se avisaba y SE GUARDABA IGUAL.
  //
  // El daño no está en la factura suelta: cinco proveedores que no tienen nada que ver
  // acababan compartiendo NIF, y la pantalla de proveedores repetidos los proponía para UNIR
  // —«cuando comparten NIF son la misma empresa»— con un botón que habría fusionado treinta y
  // una facturas de empresas distintas.
  //
  // Nadie nos factura con nuestro propio CIF. Eso no es una heurística, es un hecho: se quita
  // el NIF y se avisa. Sin NIF se ve que falta; con el nuestro, no se ve nada.
  const nifEsNuestro = provEsNuestro === "cif" && !esNuestraPorNombre(d.proveedor, nuestras);
  if (nifEsNuestro) {
    return {
      datos: { ...d, nif_proveedor: null },
      corregido: true,
      aviso: `«${datos.nif_proveedor}» es NUESTRO CIF, así que no puede ser el del proveedor. `
        + `Se ha dejado el NIF de «${datos.proveedor}» en blanco: ponlo tú si lo tienes a mano.`,
    };
  }

  // Ni idea de quién es quién: los dos parecen nuestros, también por el nombre.
  if (provEsNuestro && recEsNuestro) {
    return { datos: d, corregido: false,
      aviso: "Tanto el emisor como el receptor parecen empresas nuestras. Revísalo." };
  }

  // El NIF no puede ser lo que dice ser: casi siempre es un número de cliente colado.
  if (d.nif_proveedor && !nifValido(d.nif_proveedor)) {
    return { datos: d, corregido: false,
      aviso: `«${d.nif_proveedor}» no tiene forma de NIF ni de CIF; puede ser el número de cliente. Comprueba el NIF del proveedor.` };
  }

  return { datos: d, corregido: false, aviso: null };
}
