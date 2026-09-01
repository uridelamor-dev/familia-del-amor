# 30 · Preguntas abiertas

Cosas que **no se pueden determinar leyendo el código**. Sin respuestas inventadas.

## 🔴 Críticas — condicionan hallazgos de seguridad

**1. ¿Está `APP_ENV=production` (o `NODE_ENV=production`) en los Secrets de Replit?**
De esto depende que la protección refuse-to-boot esté activa. Si NO lo está y `JWT_SECRET` falta o
es débil, se usa un secreto que está en el repositorio y **cualquiera puede firmar un token de
dirección**. → `07_SEGURIDAD.md` §2.
*Cómo comprobarlo: buscar en los logs de arranque el aviso «Ejecutando en Replit sin APP_ENV…».*

**2. ¿`JWT_SECRET` es fuerte (≥24 caracteres, aleatorio)?**

**3. ¿Se ha rotado alguna vez `JWT_SECRET`?** Rotarlo invalidaría todas las sesiones **y** los
tickets del kiosko **y** (hoy, por el bug) no afectaría al cifrado de Ágora.

**4. ¿Quién tiene acceso a la base de datos de producción?** Es relevante por el bug del cifrado de
Ágora: quien tenga acceso a la BD tiene, de hecho, las credenciales del TPV.

**5. ¿El repositorio de GitHub es público o privado?** Si es público, `DEV_JWT_SECRET` y toda la
lógica de autenticación son conocidos. Cambia por completo la severidad de la pregunta 1.

## 🟠 Operativas

**6. ¿Qué pasa hoy cuando caduca un refresh token de Google?** ¿Alguien se entera, o el pipeline de
facturas se para en silencio hasta que se echa en falta una factura?

**7. ¿Con qué frecuencia hay que reescanear el QR de WhatsApp?** ¿Diaria, semanal? ¿Quién lo hace?
¿Qué pasa las horas que está caído — se pierden reservas?

**8. ¿Se ha baneado alguna vez el número de WhatsApp?** ¿Hay plan si ocurre?

**9. ¿El directorio `/home/runner/latapeta-data/baileys_auth` persiste realmente entre despliegues?**
El código intenta usarlo, pero `CLAUDE.md` dice que la sesión se cae igual.

**10. ¿Hay copias de seguridad de la base de datos? ¿Se ha probado restaurarlas?**
No he encontrado ningún script de backup en el repositorio.

**11. ¿Cuántos registros hay hoy en `leads`, `reservas`, `facturas`, `whatsapp_messages`,
`fic_eventos`?** Determina si los problemas de índices son teóricos o ya duelen.

**12. ¿Cuánto tarda hoy el dashboard en cargar?** No hay ninguna medición.

## 🟡 De producto

**13. ¿Se usa el módulo de Inventarios de verdad, o quedó a medias?**
Está incompleto (sin precios, sin consumo) — ¿es porque no se necesita, o porque no dio tiempo?

**14. ¿Cómo se gestiona hoy el aforo de reservas?** El sistema no lo controla. ¿Se lleva a mano?
¿Se ha aceptado alguna vez una reserva imposible?

**15. ¿`agora_product_id` en `inv_productos` se rellena?** Es el enlace que permitiría descontar
stock al vender.

**16. ¿Alguien usa el «Pulso del equipo»? ¿Con qué participación?**

**17. ¿Sara usa `cliente_hechos` (alergias, preferencias) al atender?** No he podido determinarlo
leyendo el prompt.

**18. ¿Cuánto se gasta al mes en la API de Claude?** Hay 6 puntos de llamada, uno con Sonnet 5.

**19. ¿Los paneles legacy (`direccion.html`, etc.) los usa alguien todavía?**
Antes de borrarlos conviene confirmarlo, aunque no estén enlazados.

**20. ¿Qué es `sara_respuestas`?** Existe la tabla; no he podido determinar si se usa.

## 🟢 De contexto y futuro

**21. ¿Cuánta gente usa el panel a diario y con qué roles?**

**22. ¿Hay intención de vender esto a otros restaurantes?** Cambia por completo la prioridad de
`PERMISOS_V2`, del CRM global y de la dependencia de Ágora/Baileys.

**23. ¿Se abrirán más locales?** Los nombres están hardcodeados en `INV_LOCALES` (`server.js:3732`)
y espejados en `public/auth.js`.

**24. ¿Por qué se decidió no poder añadir dependencias npm?** ¿Es una limitación real de Replit
resoluble, o una decisión de diseño? Condiciona todas las recomendaciones de esta auditoría.

**25. ¿Hay algún requisito legal más allá del registro de jornada?**
(Facturación electrónica / Verifactu, RGPD formal, conservación de datos.)

**26. ¿Existe algún entorno de pruebas, o todo se despliega directamente a producción?**
El flujo `git push` → Replit sugiere lo segundo.

**27. ¿Qué se hace hoy si un empleado se va?** ¿Se le borra el usuario? (No cierra su sesión: 8 h.)

**28. ¿`ghostscript` está garantizado en el entorno de despliegue?** Está en `.replit` `packages`,
pero es una dependencia del sistema no declarada en el código.
