# Backup y restauración

## Política propuesta

- Responsable primario: propietario técnico de Magno Clean; suplente documentado antes del lanzamiento.
- Base de datos: backup administrado diario si el plan de Supabase lo incluye; además exportación lógica cifrada semanal antes de cambios relevantes.
- Retención objetivo: 30 días para diarios y 12 semanas para semanales.
- Storage: inventario semanal de objetos y copia externa cifrada; el backup de PostgreSQL no contiene los archivos de Storage.
- Prueba de restauración: mensual en un proyecto aislado, nunca sobre producción.

## Procedimiento

1. Registrar hora, commit y migración actual (`prisma migrate status`).
2. Generar/descargar el respaldo mediante las herramientas oficiales del proyecto sin escribir credenciales en el comando o historial.
3. Cifrar, almacenar fuera del proveedor principal y registrar checksum.
4. Restaurar en PostgreSQL aislado, aplicar sólo migraciones faltantes y comparar conteos de Product, Order, OrderItem, Payment, movimientos y reservas.
5. Verificar login, catálogo, una consulta de pedido y referencias a imágenes; documentar duración y resultado.

El repositorio incluye `npm run backup:database` en `backend`. Requiere `DATABASE_URL`, `BACKUP_DIRECTORY` absoluto y opcionalmente `BACKUP_RETENTION_DAYS`; no contiene credenciales. El resultado es un dump custom con permisos privados y checksum SHA-256. El job externo deberá copiarlo cifrado a un destino off-site. Para restaurar en un proyecto aislado: verificar primero el checksum y ejecutar `pg_restore --clean --if-exists --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" archivo.dump`; nunca apuntar esa variable a producción durante una prueba.

La frecuencia/retención debe ajustarse al plan real de Supabase antes de lanzamiento. El plan Free no incluye backups automáticos: exige `supabase db dump`/`pg_dump` periódico y copia off-site. Pro/Team/Enterprise incluyen backups diarios con retención dependiente del plan; PITR es un adicional. Consulte siempre la [documentación oficial de backups](https://supabase.com/docs/guides/platform/backups). Una restauración de código no restaura base de datos ni archivos.
