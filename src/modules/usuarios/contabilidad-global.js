// Proveedores y reglas de asignación forman un catálogo compartido del grupo.
// El rol Contabilidad lo administra aunque tenga Oficina como local principal.
// Se usa únicamente tras requireAuth, que sigue comprobando el módulo permitido;
// no altera el alcance de facturas individuales ni permisos de otros apartados.
export function contabilidadGlobal(user) {
  return Boolean(user && ['direccion', 'contabilidad'].includes(user.rol));
}
