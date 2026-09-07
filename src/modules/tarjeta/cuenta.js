// La cuenta del cliente: lo que ve al abrir su tarjeta. Lógica PURA.
//
// AQUÍ NO SE DECIDE SI ALGO VALE. Los estados y las frases vienen ya calculados con
// `estadoDe()` / `textoEstado()` de src/modules/promos/promos.js, que es la misma función que
// usa la tablet de la barra. Si esta pantalla dedujera por su cuenta que un descuento está
// vivo y en la barra dijeran que no, el cliente tendría razón y el camarero también, que es la
// peor discusión posible. Este módulo solo AGRUPA y REDACTA.

import { dondeVale, fechaBonita } from "../promos/promos.js";

/**
 * «La Tapeta - Blanes» → «Blanes».
 *
 * El nombre largo es el que se guarda en toda la base y no se toca (ver el convenio en
 * locales/centros.js). Pero al cliente se le enseña el sitio, no nuestra nomenclatura interna:
 * «Has venido 7 veces a La Tapeta - Blanes» se lee como un error de programa.
 */
export function nombreCorto(local) {
  const s = String(local || "").trim();
  const guion = s.indexOf(" - ");
  return guion > 0 ? s.slice(guion + 3) : s;
}

/** «1234 5678». Ocho dígitos seguidos se dictan fatal por teléfono y se copian peor a mano. */
export function codigoLegible(codigo) {
  const c = String(codigo || "").replace(/\D/g, "");
  return c.length === 8 ? `${c.slice(0, 4)} ${c.slice(4)}` : c;
}

/** «Has venido 7 veces». El caso de cero es el que más importa: es el que más gente ve. */
export function fraseVisitas(n) {
  const v = Number(n) || 0;
  if (v === 0) return "Todavía no hemos registrado ninguna visita con tu tarjeta.";
  if (v === 1) return "Has venido 1 vez.";
  return `Has venido ${v} veces.`;
}

/**
 * La cuenta entera, lista para pintar.
 *
 * Todo llega ya resuelto desde el servidor:
 *  · `qr`         la fila del carné.
 *  · `metricas`   la fila de `cliente_metricas` (o null: solo hay fila para quien tiene visitas).
 *  · `cupones`    sus cupones, CADA UNO CON SU `estado` y su `texto` ya calculados.
 *  · `visitas`    sus últimos canjes (`pro_canjes`), que es el libro inmutable de la barra.
 *
 * LAS VISITAS SE CUENTAN DE `pro_canjes`, no de `pro_qr.usos` ni de `cliente_metricas.visitas`.
 * Las tres cifras son distintas y las tres son ciertas para otra pregunta: `usos` es un contador
 * que se podría desincronizar, `cliente_metricas` cuenta reservas y tickets del TPV (viene
 * gente que no enseña la tarjeta), y `pro_canjes` es exactamente las veces que un camarero pasó
 * ESTA tarjeta por el escáner. Es la única que el cliente puede reconocer como suya, y la única
 * sobre la que se pueden prometer premios sin que nadie se sienta estafado.
 */
export function construirCuenta({ qr = null, metricas = null, cupones = [], visitas = [], hoy = "" } = {}) {
  if (!qr) return null;

  const nVisitas = Array.isArray(visitas) ? visitas.length : 0;
  const ultima = nVisitas ? visitas[0] : null;

  // Los locales en los que ha estado: primero los del libro de canjes (los que ha vivido con la
  // tarjeta en la mano) y, si no hay ninguno todavía, los que sabemos por reservas y TPV.
  const deCanjes = [...new Set((visitas || []).map((v) => v.local).filter(Boolean))];
  const deMetricas = String((metricas && metricas.locales) || "").split(",").map((s) => s.trim()).filter(Boolean);
  const locales = (deCanjes.length ? deCanjes : deMetricas).map(nombreCorto);

  // Disponibles arriba y usados abajo: un descuento gastado que se enseñe igual que uno nuevo
  // hace que el cliente venga a reclamarlo, y con razón.
  const disponibles = [];
  const usados = [];
  for (const c of cupones || []) {
    const ficha = {
      token: c.token,
      codigo: c.codigo,
      codigo_legible: codigoLegible(c.codigo),
      nombre: (c.promo && c.promo.nombre) || "Descuento",
      descripcion: (c.promo && c.promo.descripcion) || "",
      donde: c.promo ? dondeVale(c.promo.locales) : "",
      hasta: c.caduca_en || (c.promo && c.promo.hasta) || null,
      estado: c.estado,
      texto: c.texto || "",
    };
    (c.estado === "valido" ? disponibles : usados).push(ficha);
  }

  return {
    titular: qr.nombre || "",
    codigo: qr.codigo,
    codigo_legible: codigoLegible(qr.codigo),

    resumen: {
      visitas: nVisitas,
      texto: fraseVisitas(nVisitas),
    },

    // `fechaBonita` con hora: «el 28 de agosto a las 21:40». La hora importa porque es lo que
    // le permite acordarse de la visita, y porque es la frase con la que se acaban las
    // discusiones en barra (mismo criterio que `textoEstado`).
    ultima_visita: ultima
      ? {
          texto: `La última, el ${fechaBonita(ultima.canjeado_en, { conHora: true })}` +
                 (ultima.local ? ` en ${nombreCorto(ultima.local)}` : "") + ".",
          local: nombreCorto(ultima.local || ""),
        }
      : null,

    locales,

    descuentos: { disponibles, usados },

    // El historial es SUYO: es su derecho de acceso del RGPD contestado sin tener que pedirlo.
    // Sin dinero: `cliente_metricas.gasto_est_min/max` es una estimación nuestra para segmentar,
    // y ponerle a alguien delante lo que creemos que se ha gastado es incómodo cuando acierta y
    // discutible cuando falla.
    historial: (visitas || []).map((v) => ({
      fecha: fechaBonita(v.canjeado_en),
      local: nombreCorto(v.local || ""),
      promocion: v.promocion || "",
    })),

    hoy,
  };
}
