export function avisosDatos(personas,{privado=false,hoy}={}){
 const campos={telefono:'Teléfono',nombre:'Nombre completo',puesto:'Categoría',fecha_nac:'Fecha de nacimiento',email:'Correo electrónico',...(privado?{dni:'DNI/NIE',direccion:'Dirección',iban:'IBAN',tipo_jornada:'Tipo de jornada',tipo_contrato:'Tipo de contrato',talla_camiseta:'Talla de camiseta',talla_sudadera:'Talla de sudadera'}:{})};
 return personas.filter(p=>p.activo!==0&&p.activo!==false&&(!p.fecha_baja||String(p.fecha_baja).slice(0,10)>=hoy)).flatMap(p=>Object.entries(campos).filter(([k])=>!String(p[k]||'').trim()).map(([campo,label])=>({id:`rrhh:${p.id}:${campo}`,departamento:'RR. HH.',worker_id:p.id,nombre:p.nombre||p.username,local:p.local,campo,titulo:`Falta ${label.toLowerCase()}`})));
}
