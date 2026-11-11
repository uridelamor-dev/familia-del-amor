// Especificación OBJETIVO del aislamiento por local y permisos.
// Son la meta (pasos 6-7 del plan): se marcan como `todo` para que aparezcan como
// pendientes sin hacer fallar la suite. Documentan el comportamiento a implementar.
import { test, describe } from "node:test";

describe("Permisos y aislamiento por establecimiento (spec objetivo)", () => {
  test("encargado de Blanes ve únicamente Blanes", { todo: true }, () => {});
  test("encargado de Lloret ve únicamente Lloret", { todo: true }, () => {});
  test("trabajador de Blanes no ve Girona", { todo: true }, () => {});
  test("trabajador no ve facturación", { todo: true }, () => {});
  test("usuario sin permiso obtiene 403", { todo: true }, () => {});
  test("manipular local/establecimiento_id no da acceso a otro local", { todo: true }, () => {});
  test("Dirección ve todos los establecimientos", { todo: true }, () => {});
  test("usuario asignado a dos locales ve solo esos dos", { todo: true }, () => {});
  test("datos financieros denegados sin permiso explícito", { todo: true }, () => {});
  test("grandfather: usuario sin locales asignados ve todo hasta ser configurado", { todo: true }, () => {});
});
