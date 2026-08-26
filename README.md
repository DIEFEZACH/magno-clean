# Magno Clean

Ecommerce React/Vite con API Express/Prisma, PostgreSQL y Storage en Supabase, y Checkout Pro de Mercado Pago.

## Desarrollo

Backend: copie `backend/.env.example` a `backend/.env`, configure valores locales y ejecute `npm ci`, `npx prisma generate`, `npm run build`, `npm run dev`.

Frontend: copie `frontend/.env.example` a `frontend/.env`, configure las URLs locales y ejecute `npm ci`, `npm run lint`, `npm run build`, `npm run dev`.

Nunca se deben versionar `.env`, credenciales, catálogos privados ni respaldos. Producción se opera siguiendo [DEPLOYMENT.md](DEPLOYMENT.md) y [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).
