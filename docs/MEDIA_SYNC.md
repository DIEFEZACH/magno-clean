# Sincronización de medios de producto

`media:sync` valida y concilia los WebP derivados del manifest canónico con el
bucket `product-media` de Supabase staging. No consulta ni modifica la base de
datos.

## DRY-RUN

Ejecutar desde `backend/`:

```sh
npm run media:sync -- \
  --manifest ../docs/product-data/media-manifest.json \
  --source-root ../.local/product-media-optimized \
  --environment staging \
  --project-ref heqneuhptatgybddoply \
  --bucket product-media \
  --dry-run
```

La herramienta carga exclusivamente `backend/.env.staging`. Sólo lee de ese
archivo `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`; no carga `.env` ni usa la
configuración global del backend. También puede indicarse un `.env.staging`
explícito mediante `--env-file`, principalmente para worktrees locales.

El DRY-RUN:

- valida manifest, rutas, WebP real, tamaño, dimensiones y SHA-256;
- omite archivos que necesitan revisión, asociaciones ambiguas y documentos;
- inspecciona objetos existentes mediante GET autenticado;
- marca contenido idéntico como `EXISTING_MATCH`;
- marca un path ocupado por bytes distintos como `REMOTE_CONFLICT`;
- nunca llama al método de upload y nunca produce `UPLOADED`.

Los reportes JSON y CSV se escriben con permisos privados en
`.local/reports/`. La carpeta y sus archivos están ignorados por Git. Los
conteos de `reviewRequired` y asociaciones ambiguas son métricas independientes
porque ambas condiciones pueden coexistir en una misma entrada.

## Protección de entorno

La ejecución se aborta antes de acceder a Storage si no coinciden todos estos
datos:

- entorno `staging`;
- Project Ref `heqneuhptatgybddoply`;
- host exacto `heqneuhptatgybddoply.supabase.co` en `SUPABASE_URL`;
- bucket `product-media`.

El Project Ref productivo `fxbgxjpgfkeuapbmgpmv` se rechaza explícitamente. La
salida y los reportes usan listas de campos permitidos y nunca incluyen la
Service Role Key.

## Ejecución futura

Una sincronización con escrituras sólo puede iniciarse mediante `--execute` y
la confirmación exacta adicional:

```text
--confirm SYNC_PRODUCT_MEDIA_STAGING
```

Ese modo debe utilizarse únicamente tras una autorización operativa separada.
Los objetos se crean con `x-upsert: false`: nunca se sobrescriben, actualizan,
mueven o eliminan. Tras un fallo transitorio ambiguo, la herramienta reinspecciona
el objeto antes de considerar otro intento.

## Paths y caché

Los `storagePath` se consideran inmutables. Para cambiar un asset se debe crear
un filename o path versionado nuevo y, en una fase posterior, actualizar la
asociación editorial. El upload declara una recomendación de caché larga:

```text
public, max-age=31536000, immutable
```

La herramienta no cambia la configuración de Storage ni del CDN.
