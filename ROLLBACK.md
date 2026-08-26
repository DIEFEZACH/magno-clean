# Rollback

## Aplicación

1. Detener promoción y conservar logs/requestId del incidente.
2. Revertir frontend al artefacto del último commit sano.
3. Revertir backend al artefacto compatible con el esquema actual.
4. Validar `/health`, `/ready`, login, catálogo, admin y webhook TEST.

## Base de datos

`prisma migrate deploy` es hacia adelante. No revertir SQL automáticamente ni asumir que un rollback de código revierte el esquema. Si una migración es incompatible, crear una migración correctiva revisada o restaurar en un entorno aislado siguiendo `BACKUP_AND_RESTORE.md`. Cualquier restauración productiva exige ventana, respaldo previo y aprobación explícita.
