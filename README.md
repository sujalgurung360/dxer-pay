DXER Pay – Accounting & Audit Platform
======================================

This repo now lives at: https://github.com/sujalgurung360/dxer-pay

It contains:
- Next.js 15 web app in `apps/web`
- Express + Prisma API in `apps/api`
- Shared types/schemas in `packages/shared`

How to run locally
------------------

Requirements:
- Node.js 20+
- npm 10+
- Docker (for Supabase + Multichain via `docker-compose`)

Steps:
1. Clone the repo:
   ```bash
   git clone https://github.com/sujalgurung360/dxer-pay.git
   cd dxer-pay
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy env example and fill values:
   ```bash
   cp .env.example .env
   # edit .env with your keys (Supabase, Polygon, Multichain)
   ```
4. Start infra (Postgres + Supabase + Multichain):
   ```bash
   docker compose up -d
   ```
5. Start dev servers (web + API):
   ```bash
   npm run dev
   ```
6. Open the app:
   - Web app: http://localhost:3000
   - API: http://localhost:4000

Your friend can follow these same steps after cloning the repo.

