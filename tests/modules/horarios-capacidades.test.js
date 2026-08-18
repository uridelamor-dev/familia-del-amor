// Qué trabajo sabe hacer cada persona.
//
// La decisión que sujetan estos tests: mientras alguien no esté configurado, el generador se
// comporta EXACTAMENTE como antes. Es lo que permite desplegar esto un martes sin que el
// cuadrante del miércoles se quede vacío.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  estaConfigurado, indiceCapacidades, puedeEnArea, areasDe, resumenConfiguracion, capacidadPorArea,
} from "../../src/modules/horarios/capacidades.js";

const SALA = 10, BARRA = 11, COCINA = 12;
const juan = { id: 1, nombre: "Juan", areas_configuradas_en: "2026-08-01T10:00:00+02:00" };
const marta = { id: 2, nombre: "Marta", areas_configuradas_en: "2026-08-01T10:00:00+02:00" };
const nuevo = { id: 3, nombre: "Recién llegado", areas_configuradas_en: null };
const CAPS = [
  { worker_id: 1, area_id: SALA }, { worker_id: 1, area_id: BARRA },
  { worker_id: 2, area_id: COCINA },
];
const IDX = indiceCapacidades(CAPS);

describe("«sin configurar» NO es lo mismo que «cero áreas»", () => {
  test("quien nunca se ha tocado vale para todo, como antes", () => {
    // Es la compatibilidad que evita que el generador se quede sin nadie el día del despliegue.
    assert.equal(estaConfigurado(nuevo), false);
    for (const a of [SALA, BARRA, COCINA]) assert.equal(puedeEnArea(nuevo, a, IDX), true, String(a));
  });

  test("quien SÍ se ha configurado con cero áreas no entra en ninguna", () => {
    // Es un caso legítimo: alguien de oficina, o de baja larga. Contar filas no los
    // distinguiría del anterior, y por eso hace falta la marca.
    const fuera = { id: 9, nombre: "Oficina", areas_configuradas_en: "2026-08-01T10:00:00+02:00" };
    assert.equal(estaConfigurado(fuera), true);
    for (const a of [SALA, BARRA, COCINA]) assert.equal(puedeEnArea(fuera, a, IDX), false, String(a));
  });

  test("la marca es la fecha, no el número de filas", () => {
    assert.equal(estaConfigurado({ id: 1, areas_configuradas_en: "" }), false);
    assert.equal(estaConfigurado({ id: 1 }), false);
    assert.equal(estaConfigurado(null), false);
  });
});

describe("quién puede cubrir qué", () => {
  test("Juan hace sala y barra, no cocina", () => {
    assert.equal(puedeEnArea(juan, SALA, IDX), true);
    assert.equal(puedeEnArea(juan, BARRA, IDX), true);
    assert.equal(puedeEnArea(juan, COCINA, IDX), false);
  });
  test("Marta solo cocina", () => {
    assert.equal(puedeEnArea(marta, COCINA, IDX), true);
    assert.equal(puedeEnArea(marta, SALA, IDX), false);
  });
  test("un hueco sin área no restringe a nadie", () => {
    assert.equal(puedeEnArea(marta, null, IDX), true);
  });
  test("los ids se comparan como texto: da igual que vengan como número o como cadena", () => {
    assert.equal(puedeEnArea(juan, "10", IDX), true);
    assert.equal(puedeEnArea(juan, 10, IDX), true);
    assert.equal(puedeEnArea({ ...juan, id: "1" }, SALA, IDX), true);
  });
});

describe("un área desactivada deja de contar como capacidad", () => {
  test("pero no se borra el histórico de quién la sabía hacer", () => {
    // Quitar BARRA del local no puede hacer que se pierda que Juan la hacía.
    const soloVivas = indiceCapacidades(CAPS, { areasActivas: [SALA, COCINA] });
    assert.equal(puedeEnArea(juan, BARRA, soloVivas), false, "ya no cuenta");
    assert.equal(puedeEnArea(juan, SALA, soloVivas), true);
    assert.equal(CAPS.filter((c) => c.area_id === BARRA).length, 1, "la fila sigue ahí");
  });
  test("sin lista de activas no se filtra nada", () => {
    assert.equal(puedeEnArea(juan, BARRA, indiceCapacidades(CAPS)), true);
  });
});

describe("las áreas de una persona, para pintarlas", () => {
  test("las suyas si está configurada", () => {
    assert.deepEqual(areasDe(juan, IDX).sort(), ["10", "11"]);
  });
  test("y ninguna si no lo está: no se inventa que puede con todo", () => {
    // Puede con todo en el generador, pero en la ficha no hay nada que enseñar.
    assert.deepEqual(areasDe(nuevo, IDX), []);
  });
});

describe("cuánta gente falta por configurar", () => {
  test("se cuenta y se dice quiénes son", () => {
    const r = resumenConfiguracion([juan, marta, nuevo]);
    assert.equal(r.total, 3);
    assert.equal(r.configurados, 2);
    assert.equal(r.sinConfigurar, 1);
    assert.deepEqual(r.quienes.map((q) => q.nombre), ["Recién llegado"]);
    assert.equal(r.completo, false);
  });
  test("con toda la plantilla configurada, las áreas mandan de verdad", () => {
    assert.equal(resumenConfiguracion([juan, marta]).completo, true);
  });
  test("una plantilla vacía no está «completa»", () => {
    assert.equal(resumenConfiguracion([]).completo, false);
  });
});

describe("cuántas horas hay para cada área", () => {
  const AREAS = [{ id: SALA, nombre: "SALA" }, { id: COCINA, nombre: "COCINA" }];
  // Cocina pide dos turnos de 8 h obligatorios; sala uno.
  const HUECOS = [
    { area_id: COCINA, inicio_min: 960, fin_min: 1440, obligatorio: true },
    { area_id: COCINA, inicio_min: 960, fin_min: 1440, obligatorio: true },
    { area_id: SALA, inicio_min: 960, fin_min: 1440, obligatorio: true },
  ];

  test("cuando no hay gente suficiente que sepa hacerlo, lo dice", () => {
    // Marta es la única de cocina y tiene 20 h: los mínimos piden 16 h de cocina. Cabe.
    // Con solo 10 h contratadas, ya no.
    const c = capacidadPorArea({ huecos: HUECOS, trabajadores: [juan, marta], indice: IDX, areas: AREAS,
      horasDe: (w) => (w.id === 2 ? 10 * 60 : 40 * 60) });
    const cocina = c.find((x) => x.nombre === "COCINA");
    assert.equal(cocina.habilitados, 1, "solo Marta");
    assert.equal(cocina.horasMinimas, 16);
    assert.equal(cocina.horasDisponibles, 10);
    assert.equal(cocina.faltaGente, true);
  });

  test("y cuando sí hay, no molesta", () => {
    const c = capacidadPorArea({ huecos: HUECOS, trabajadores: [juan, marta], indice: IDX, areas: AREAS,
      horasDe: () => 40 * 60 });
    assert.equal(c.find((x) => x.nombre === "COCINA").faltaGente, false);
    assert.equal(c.find((x) => x.nombre === "SALA").faltaGente, false);
  });

  test("quien no está configurado cuenta para todas las áreas", () => {
    // Es la misma compatibilidad: mientras no se le configure, el generador cuenta con él.
    const c = capacidadPorArea({ huecos: HUECOS, trabajadores: [nuevo], indice: IDX, areas: AREAS,
      horasDe: () => 40 * 60 });
    assert.equal(c.find((x) => x.nombre === "COCINA").habilitados, 1);
    assert.equal(c.find((x) => x.nombre === "SALA").habilitados, 1);
  });
});

describe("sin índice no se restringe; con índice vacío, sí", () => {
  test("no pasar capacidades es «esto no está en uso»", () => {
    // Quien llame al generador o a los conflictos sin capacidades tiene que comportarse igual
    // que antes de que existieran, no vaciar el cuadrante en silencio.
    assert.equal(puedeEnArea(juan, COCINA, null), true);
    assert.equal(puedeEnArea(juan, COCINA, undefined), true);
  });
  test("un índice VACÍO sí restringe: la pregunta se ha hecho", () => {
    const vacio = indiceCapacidades([]);
    assert.equal(puedeEnArea(juan, SALA, vacio), false, "está configurado y no tiene esa área");
    assert.equal(puedeEnArea(nuevo, SALA, vacio), true, "este sigue sin configurar");
  });
});
