## DXER Pay – Project Overview

**DXER Pay** is an accounting, payroll, and production audit platform with cryptographic anchoring of business records to a hybrid blockchain stack:
- **Backend**: Express + Prisma API (`apps/api`)
- **Frontend**: Next.js 15 app (`apps/web`)
- **Shared library**: TypeScript types/schemas/utilities (`packages/shared`)
- **Infra**: Local Supabase-style Postgres + auth + storage and a **Multichain** private chain via `docker-compose`, plus **Polygon Amoy** public-chain anchoring.

This document is written for AI/code agents to quickly understand the architecture, domain model, and how to run and extend the system.

---

## Monorepo & Tooling

- **Package manager / workspace**: `npm` workspaces rooted at this repo (`package.json`):
  - `apps/*`
  - `packages/*`
- **Task runner**: `turbo` (see root `package.json` scripts):
  - `npm run dev` → `turbo dev` (runs API + Web in dev mode)
  - `npm run build` → `turbo build`
  - `npm run lint` → `turbo lint`
  - `npm run test` → `turbo test`
  - `npm run docker:up` / `docker:down` → bring local infra up/down
- **Language**: TypeScript 5.7+, ES modules in the API (`"type": "module"`).
- **Node requirement**: `>=20` (see root `package.json.engines`).

---

## High-Level Architecture

- **Web App (`apps/web`)**
  - Next.js 15 app-router, React 19.
  - Uses an `auth-context` with Supabase-based auth and organization context.
  - Consumes the backend via `apps/web/src/lib/api.ts`, which wraps `fetch` and:
    - prefixes all paths with `NEXT_PUBLIC_API_URL` (from env).
    - attaches `Authorization: Bearer <token>` and `x-org-id` from props or `localStorage`.
  - Exposes a typed `api` object with helpers for:
    - `auth`, `orgs`, `expenses`, `invoices`, `customers`, `employees`,
      `payrolls`, `production-batches`, `production-events`, `audit-log`,
      `anchoring`, `dxexplorer`, `onboarding`, `hiring`.
  - The main dashboard page (`apps/web/src/app/(dashboard)/dashboard/page.tsx`):
    - Fetches stats from expenses, invoices, payrolls, production batches, audit logs.
    - Optionally loads employees and chain health/queue in the background.
    - Renders:
      - Employee list and employee-profile card.
      - Recent audit activity.
      - Dashboard stats + calendar.
      - Polygon wallet card (including MetaMask connect and PolygonScan links).

- **API (`apps/api`)**
  - Entry point: `apps/api/src/index.ts`.
  - Express server with:
    - Security: `helmet`, `cors` (restricted to dashboard origin + optional `CORS_ORIGIN`), JSON body parsing.
    - Rate limiting via `express-rate-limit`:
      - Tighter limiter on `/api/auth`, general limiter on `/api`.
    - Custom `logger` (pino-based) and `errorHandler` middleware.
  - Route groups (all mounted under `/api`):
    - `/api/health`
    - `/api/auth`
    - `/api/organizations`
    - `/api/expenses`
    - `/api/invoices`
    - `/api/customers`
    - `/api/employees`
    - `/api/payrolls`
    - `/api/production-batches`
    - `/api/production-events`
    - `/api/audit-log`
    - `/api/anchoring`
    - `/api/onboarding`
    - `/api/hiring`
  - Port is controlled by `API_PORT` (default **4000**).
  - Uses:
    - **Prisma** against Postgres (`apps/api/prisma/schema.prisma`).
    - **Supabase** JS client for auth.
    - **JWT** and `jwks-rsa` for Supabase token verification.
    - **Swagger** for API docs (via `swagger-jsdoc` and `swagger-ui-express`).
    - **multer** for file uploads, `nodemailer` for email flows.

- **Shared Library (`packages/shared`)**
  - Entry: `packages/shared/src/index.ts` re-exports:
    - `./schemas`, `./types`, `./constants`, `./utils`.
  - Contains:
    - Zod schemas for request/response validation.
    - Domain types (expenses, invoices, payroll, audit, anchoring payloads).
    - Constants for currencies, statuses, etc.
    - Utilities like `formatCurrency` used in the web app.

- **Infra (`docker-compose.yml` + `multichain/`)**
  - **Postgres** container (Supabase-compatible schema):
    - Exposed on `localhost:54322`, DB name `postgres`.
    - Data persisted in `dxer-db-data` volume.
    - Migrations mounted from `./supabase/migrations`.
  - **Supabase services**:
    - `auth` (GoTrue) on `localhost:9999`
    - `rest` (PostgREST) on `localhost:54321`
    - `storage` on `localhost:5000`
    - `studio` (optional UI) on `localhost:54323`
  - All Supabase JWT/anon/service keys are local/dev credentials (see compose file).
  - **Multichain**:
    - Built from `./multichain/Dockerfile`.
    - JSON-RPC exposed on `localhost:4798`.
    - Environment:
      - `MULTICHAIN_CHAIN_NAME=dxerchain`
      - `MULTICHAIN_RPC_USER=multichainrpc`
      - `MULTICHAIN_RPC_PASSWORD=dxer123` (dev only; override in `.env` for safety).
  - Volumes: `dxer-db-data`, `dxer-multichain-data`.

---

## Data Model (Prisma / Postgres)

The Prisma schema (`apps/api/prisma/schema.prisma`) is aligned with Supabase migrations and models core accounting + audit entities. Key models:

- **profiles**
  - Supabase user-profile table: `id`, `user_id`, `full_name`, `email`, optional `avatar_url`, `phone_number`.
  - Verification fields: `verification_status`, `verification_method`, `document_url`.

- **organizations**
  - Company/tenant entity: `name`, `slug`, `owner_id`, `registration_number`, `business_type`, `country`.
  - Blockchain-related fields:
    - `wallet_address` (Polygon public address).
    - `wallet_private_key_enc` (encrypted private key, server-only).
    - `metamask_address` (connected MetaMask address).
  - Relations to members, customers, employees, expenses, invoices, payrolls, production batches/events, audit logs, anchoring jobs, sequences.

- **organization_members**
  - Joins users to organizations with a `role`.
  - Anchoring fields (per membership):
    - `multichain_data_hex`, `multichain_txid`, `polygon_txhash`.

- **customers**
  - Customer details: `name`, `email`, `phone`, `address`, `tax_id`.
  - Optional anchoring references (`multichain_*`, `polygon_txhash`).
  - Related to `invoices`.

- **employees**
  - HR/payroll entity: `full_name`, `email`, `position`, `department`, `salary`, `currency`, `start_date`, `is_active`.
  - Wallet + onboarding:
    - `wallet_address`, `wallet_private_key_enc`.
    - `onboarding_status`, `invite_token`, `invite_expires_at`, `contract_signed_at`.
  - Anchoring fields for employee-level records.
  - Related to `payroll_entries`.

- **production_batches / production_events**
  - Production tracking:
    - Batches: `name`, `description`, `status`, planned/actual dates, anchoring fields.
    - Events: `event_type`, `description`, `metadata` JSON, anchoring fields.
  - Used for manufacturing/production audits.

- **expenses**
  - Financial records: `description`, `amount`, `currency`, `category`, `status`, `date`, tags, optional `receipt_url`.
  - Optional `production_batch_id` to link operating expenses to production.
  - Anchoring fields.

- **invoices / invoice_line_items**
  - Standard AR: `invoice_number`, `customer_id`, `status`, `due_date`, `currency`, `subtotal`, `tax_rate`, `tax_amount`, `total`, `notes`.
  - Line items with `description`, `quantity`, `unit_price`, `amount`.
  - Anchoring on the invoice.

- **payrolls / payroll_entries**
  - Payroll run: `period_start`, `period_end`, `pay_date`, `status`, `total_amount`, `currency`, `notes` + anchoring fields.
  - Entries: per-employee payroll records with `amount` and anchoring fields.

- **device_identities**
  - Registered devices: `device_name`, `public_key`, `is_active`, `last_seen_at`.

- **content_addresses**
  - Generic content-addressable storage for any entity (`entity_type`, `entity_id`, `hash_algorithm`, `hash_value`).

- **audit_log**
  - Immutable-ish audit chain for entity changes:
    - `action`, `entity_type`, `entity_id`, `version`, `previous_hash`, `previous_polygon_tx`, `changed_fields`, `before_data`, `after_data`.
    - `ip_address`, `user_agent`.
    - Anchoring fields.

- **dxer_system_config**
  - Key/value JSON config for system-level flags and settings.

- **dxer_anchor_jobs**
  - Queue of anchoring jobs: `entity_type`, `entity_id`, `status`, `payload`, `result`, `error`.
  - Used by auto-anchoring services.

- **dxer_sequences**
  - Per-org sequence generator (e.g., invoice numbers).

---

## Anchoring & DXExplorer (Blockchain Layer)

Anchoring logic is in `apps/api/src/services/anchoring.ts` plus blockchain clients in `apps/api/src/lib/multichain.ts` and `apps/api/src/lib/polygon.ts`.

### Conceptual Flow

1. **Canonical Metadata**
   - `buildCanonicalMetadata(record, entityType, entityId)`:
     - Strips out non-deterministic or blockchain-only fields (`created_at`, `updated_at`, `multichain_*`, `polygon_txhash`, `wallet_private_key_enc`, etc.).
     - Sorts keys and normalizes values (dates → ISO, decimals → numbers/strings).
     - Produces a stable JSON string: `{ entityType, entityId, data: { ... } }`.
2. **Hashing & Multichain**
   - `multichainPublishHash(metadata, entityType, entityId)`:
     - Computes `sha256(metadata)` as `hash`.
     - Builds `streamKey = "${entityType}:${entityId}"`.
     - Uses the Multichain JSON-RPC client (`multichain.ts`) to:
       - Ensure the configured stream exists (`ensureStream`).
       - `publish` a payload containing `{ hash, timestamp, entityType, entityId, metadataLength, fullMetadata }`.
     - Returns `{ hash, multichainTxid }`.
3. **Polygon Anchoring**
   - `polygonAnchorHash(hash, entityType, entityId, orgPrivateKey?)`:
     - Uses `polygon.ts` client and ethers.js.
     - Builds calldata: `0x + "DXER" prefix + <hash> + |entityType|entityId|` in hex.
     - Sends a 0-value self-transfer with that calldata to Polygon:
       - Using either the **org-specific wallet** (`orgPrivateKey`) or the **master wallet** from env.
     - Waits for 1 confirmation and returns:
       - `polygonTxHash`, `blockNumber`, `dataHex`, `explorerUrl`, `signerAddress`.
4. **Full Pipeline**
   - `anchorRecord(record, entityType, entityId, orgPrivateKey?)`:
     - Calls steps 1–3 and returns:
       - `multichainDataHex` (the hash), `multichainTxid`, `polygonTxhash`,
         `metadata`, `blockNumber`, `explorerUrl`, `signerAddress`.
   - Wrap helpers:
     - `buildAnchorPayload(record)` (for legacy/simple use).
     - `submitAnchor(payload)` and `verifyAnchor(txid)`.

### DXExplorer Verification

`dxExplorerVerify` (in `anchoring.ts`) implements the full verification path:

1. Given a **Polygon tx hash**:
   - Fetch the transaction via `getPolygonTransaction(txHash)` (in `polygon.ts`).
   - Parse DXER-formatted calldata with `parseDxerCalldata` to extract:
     - `hash`, `entityType`, `entityId`.
2. Fetch corresponding **Multichain stream items** via `getStreamItemsByKey("entityType:entityId")`.
   - Compare Multichain hash vs Polygon hash for sanity.
3. Fetch the **off-chain DB record**:
   - Use `ANCHORABLE_MODELS` mapping (from `services/auto-anchor.ts`) to determine which Prisma model to query.
4. If the DB record is missing:
   - Attempt **recovery** from Multichain `fullMetadata`.
5. Recompute the canonical metadata + `sha256`.
   - Compare to on-chain hash to determine integrity.
6. Return a rich `DXExplorerResult`:
   - `verified`, `identifier`, `polygonTxHash`, `onChainHash`, `recomputedHash`,
     `entityType`, `entityId`, `metadata`, `blockNumber`, `timestamp`,
     `explorerUrl`, `multichainTxid`, `multichainConfirmations`,
     `polygonConfirmations`, `recoveredFromBlockchain`, and optional `error`.

The web app exposes DXExplorer routes under `api.dxexplorer.*` and pages such as `apps/web/src/app/(dashboard)/dxexplorer/page.tsx` and `anchoring` dashboards.

---

## Environment & Configuration

Baseline env is documented in `.env.example` (copy to `.env`):

- **Supabase / DB**
  - `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key`
  - `SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres`

- **API**
  - `API_PORT=4000`
  - `API_URL=http://localhost:4000`
  - `NEXT_PUBLIC_API_URL=http://localhost:4000`

- **JWT / Auth**
  - `SUPABASE_JWT_SECRET=your-jwt-secret`

- **Storage**
  - `SUPABASE_STORAGE_BUCKET=receipts`

- **Rate limiting**
  - `RATE_LIMIT_WINDOW_MS=900000`
  - `RATE_LIMIT_MAX=100`

- **Logging & Node env**
  - `LOG_LEVEL=debug`
  - `NODE_ENV=development`

- **Multichain (private chain)**
  - `MULTICHAIN_RPC_HOST=127.0.0.1`
  - `MULTICHAIN_RPC_PORT=4798`
  - `MULTICHAIN_RPC_USER=multichainrpc`
  - `MULTICHAIN_RPC_PASSWORD=your-rpc-password`
  - `MULTICHAIN_CHAIN_NAME=dxerchain`
  - `MULTICHAIN_STREAM_NAME=dxer-anchors`

- **Polygon (public chain, Amoy by default)**
  - `POLYGON_NETWORK=amoy`
  - `POLYGON_CHAIN_ID=80002`
  - `POLYGON_RPC_URL=https://rpc-amoy.polygon.technology`
  - `POLYGON_PRIVATE_KEY=your-wallet-private-key`
  - `POLYGON_WALLET_ADDRESS=0xYourWalletAddress`
  - `POLYGON_EXPLORER_URL=https://amoy.polygonscan.com`

Agents should:
- Treat any `*_PRIVATE_KEY` and `*_PASSWORD` values as **secrets**.
- Avoid logging them or committing example secrets to VCS.

---

## How to Run Locally

**Prereqs**:
- Node.js 20+
- npm 10+
- Docker

**Steps** (from root of repo):

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Create env file**
   ```bash
   cp .env.example .env
   # Fill in Supabase keys, Polygon RPC & wallet, Multichain RPC password, etc.
   ```
3. **Start infra (Postgres + Supabase + Multichain)**
   ```bash
   npm run docker:up
   # or: docker compose up -d
   ```
4. **Start dev servers (API + Web)**
   ```bash
   npm run dev
   ```
5. **Access endpoints**
   - Web app: `http://localhost:3000`
   - API: `http://localhost:4000`

To stop infra:
```bash
npm run docker:down
```

---

## Testing & Linting

- **Root (all packages via Turborepo)**
  - `npm run lint` → runs `next lint` and `tsc --noEmit` etc across workspaces.
  - `npm test` → `turbo test` (Vitest in API and Web).

- **API (`apps/api`)**
  - `npm run dev` (from `apps/api`) → `tsx watch --env-file=.env src/index.ts`.
  - `npm run build` → `tsc`.
  - `npm run lint` → `tsc --noEmit`.
  - `npm test` / `npm run test:ci` → Vitest.
  - DB helpers:
    - `npm run db:generate` → `prisma generate`.
    - `npm run db:push` → `prisma db push`.
    - `npm run db:migrate` → `prisma migrate dev`.
    - `npm run seed` → `tsx src/scripts/seed.ts`.

- **Web (`apps/web`)**
  - `npm run dev` → `next dev --port 3000`.
  - `npm run build` → `next build`.
  - `npm start` → `next start`.
  - `npm run lint` → `next lint`.
  - `npm test` / `npm run test:ci` → Vitest.

---

## Auth & Org Context

- Auth is Supabase-backed.
- Frontend uses `useAuth` from `apps/web/src/lib/auth-context` (not detailed here, but key behaviors):
  - Provides `user`, `currentOrg`, `refreshUser`.
  - Stores Supabase access token and org ID in `localStorage` with keys like `dxer_token`, `dxer_org_id`.
- Backend routes generally expect:
  - `Authorization: Bearer <Supabase JWT>`.
  - `x-org-id` header to scope queries to the current organization.

When modifying or adding API routes, ensure:
- Requests validate authentication via existing auth middleware.
- Organization scoping is enforced via `org_id` in queries.
- Audit + anchoring hooks are maintained or extended.

---

## UI / UX Notes (Dashboard)

The dashboard (`apps/web/src/app/(dashboard)/dashboard/page.tsx`) aims for a polished, Crextio-style UI:

- **Layout**
  - 3-column grid:
    - Left: employees list + blockchain chain status.
    - Center: toolbar, stats, calendar, recent activity.
    - Right: selected employee (or current user) profile + Polygon wallet card.
- **Chain Status**
  - Uses `api.anchoring.health()` and `api.anchoring.queue()`:
    - Multichain: online/offline.
    - Polygon: online/offline, network label.
    - Queue: processed/anchored count.
- **Wallet Card**
  - Shows org `walletAddress`.
  - Copy-to-clipboard + PolygonScan link.
  - `Connect MetaMask` flow:
    - Requests accounts.
    - Ensures Polygon Amoy network is added/selected.
    - Calls `api.orgs.connectMetamask(address)` to link the account.

When extending the UI, prefer:
- Using the existing `api` helper for network calls.
- Respecting `useAuth` for current org/user context.
- Maintaining the established design tokens / Tailwind classes.

---

## Things for Future Agents to Watch Out For

- **Secrets & Keys**
  - Do not commit real Supabase keys, Polygon private keys, or Multichain passwords.
  - Treat `.env` as sensitive; `.env.example` can remain checked in.

- **Blockchain Dependencies**
  - Anchoring flows require both:
    - Multichain node reachable at configured RPC endpoint.
    - Polygon RPC with funded wallet(s).
  - For local dev, you can:
    - Stub or mock anchoring functions.
    - Use testnet with very small POL balances.

- **Schema Alignment**
  - Prisma schema is expected to match Supabase migrations.
  - If you update Prisma models, also update Supabase SQL migrations and vice versa.

- **Org & Tenant Isolation**
  - Nearly all queries are org-scoped via `org_id`.
  - When adding new tables or routes, ensure `org_id` is present and enforced.

- **Anchoring Coverage**
  - Many models have `multichain_*` and `polygon_txhash` fields.
  - If you introduce new anchorable entities, wire them into:
    - `dxer_anchor_jobs` queue (via `auto-anchor` service).
    - `ANCHORABLE_MODELS` mapping for DXExplorer.

---

## End-to-End Flows & Diagrams (Ultimate High-Level View)

This section documents how things behave from a **user + system** point of view, without diving into code. Treat this as the mental model for how DXER Pay works.

### Expense Lifecycle + Anchoring (Concrete Example)

**How it works now (simplified):**

| User Action                         | Result in System                                                                              |
|-------------------------------------|-----------------------------------------------------------------------------------------------|
| **Create expense**                  | Expense row created; `audit_log` entry A created; auto-anchor job enqueued → blockchain TX1. |
| **Update expense**                  | Expense row updated; `audit_log` entry B created; auto-anchor job enqueued → blockchain TX2. |
| **Void / cancel expense**          | Expense `status` set to `void`; `audit_log` entry C created; auto-anchor job → blockchain TX3 |
| **Re-run verification on any TX**  | DXExplorer traces TX back to `audit_log` + underlying expense and recomputes integrity.      |

High level rule: **every meaningful change** (create / update / void) for anchorable entities produces a **new audit_log row and an optional new blockchain proof.**

Anchorable entities today include (non‑exhaustive):
- **Expenses** (operating spend)
- **Invoices** (AR)
- **Payrolls** and **payroll entries**
- **Production batches** and **production events**
- **Org memberships** and other key records tied to accountability

Each anchoring operation writes the same blockchain references onto:
- The **domain record** itself (e.g. `expenses.multichain_txid`, `expenses.polygon_txhash`).
- The corresponding **audit_log row** for that action.

This means an auditor can start either from “business view” (expense in UI) or “chain view” (Polygon TX) and always join the dots.

---

### Anchoring Flow (Creating Proof)

At a high level, anchoring is **asynchronous** and non‑blocking for the user: the API responds first, then a worker anchors in the background.

```text
USER ACTION
(Create Expense, Payroll, Invoice, etc.)
    │
    ▼
DXER BACKEND (API)
  1. Save record to Database (Supabase Postgres)
  2. Write audit_log entry describing the action
  3. Enqueue auto-anchor job (dxer_anchor_jobs)

API responds immediately — anchoring continues in background
    │
    ▼
AUTO-ANCHOR JOB PROCESSOR
  1. Fetch record from DB using entityType + entityId
  2. Build {METADATA} — deterministic canonical JSON
       - Sorted keys
       - No randomness (same input → same output)
       - Strips blockchain-only fields and secrets

  Example {METADATA}:
    {
      "data": {
        "amount": 45.99,
        "category": "supplies",
        ...
      },
      "entityId": "uuid-here",
      "entityType": "expense"
    }
    │
    ▼
HYPERLEDGER (MULTICHAIN — PRIVATE CHAIN)
  Input:  {METADATA}
  Action: SHA-256 hash generation
  Output: HASH = "a3f8c2d1e9b7..."  (64-char hex)

  - Hash + metadata info published to stream "dxer-anchors"
  - Stream key: "expense:uuid-here"
  - Result: multichain_txid  (private chain TX ID)

  Property: same {METADATA} ⇒ same HASH every time
    │
    ▼
POLYGON BLOCKCHAIN (AMOY TESTNET — PUBLIC)
  Input:  HASH from Multichain
  Action: 0-value self-transfer with DXER-formatted calldata

  Calldata layout:
    0x + "DXER" prefix + SHA-256 HASH + |entityType|entityId| (hex)

    ┌──────────┬────────────────────┬──────────────────────────┐
    │ 0xDXER   │ SHA-256 HASH       │ |expense|uuid-here|      │
    │ 44584552 │ a3f8c2d1e9b7...    │ (traceback reference)    │
    └──────────┴────────────────────┴──────────────────────────┘

  Output:
    - polygon_txhash   (Polygon transaction hash)
    - block number
    - explorer URL (PolygonScan link)

  Property: immutable public record — cannot be altered or deleted
    │
    ▼
STORE REFERENCES IN DXER DATABASE
  Update:
    - Domain record (e.g. expense / invoice / payroll):
        • multichain_data_hex  = canonical HASH
        • multichain_txid      = Multichain TX ID
        • polygon_txhash       = Polygon TX hash
    - audit_log entry for that action with same fields

Every audit_log row now points at a specific **on-chain proof**.
```

---

### Verification Flow (DXExplorer — Tracing Back)

DXExplorer lets anyone start from a **Polygon transaction** or an **entity reference** and check that the current database record hasn’t been tampered with since anchoring.

```text
INPUT (DXEXPLORER)
  - Polygon TX hash   (e.g. 0x7b3e...)
  OR
  - entityType + entityId (e.g. "expense" + "uuid-here")
    │
    ▼
STEP 1 — POLYGON LOOKUP
  - Fetch transaction by hash on Polygon Amoy
  - Read calldata and parse DXER format:

      0x DXER  HASH  |entityType|entityId|

  - Extract:
      • on_chain_hash      (SHA-256 from HyperLedger)
      • entityType, entityId (from entity marker)
  - Build explorer URL (PolygonScan) for UI
    │
    ▼
STEP 2 — HYPERLEDGER (MULTICHAIN) CHECK
  - Compute stream key: "entityType:entityId"
  - Query "dxer-anchors" for that key
  - Confirm:
      • hash exists on private chain
      • confirmations count
  - Optionally cross-check that Multichain hash == on_chain_hash
    │
    ▼
STEP 3 — TRACE BACK TO DXER DATABASE
  - Use entityType + entityId to find the real record:
      • e.g. prisma.expenses.findUnique({ id: "uuid-here" })
  - If not found:
      • Attempt recovery: read stored fullMetadata from Multichain
      • Mark `recoveredFromBlockchain = true` if successful
    │
    ▼
STEP 4 — RECOMPUTE HASH
  - Take the effective record data (from DB or recovered metadata)
  - Run the same canonicalization function:
      • buildCanonicalMetadata(...) → canonical JSON
  - Compute SHA-256 → recomputed_hash
    │
    ▼
STEP 5 — COMPARE HASHES
  - on_chain_hash  (from Polygon calldata)
        vs
  - recomputed_hash (from current record)

  OUTCOME:
    - MATCH    → VERIFIED (data unchanged since anchoring)
    - MISMATCH → TAMPERED (something changed after anchoring)

  Returned result includes:
    - on_chain_hash, recomputed_hash
    - entityType, entityId
    - current metadata snapshot
    - Polygon block number, timestamp, confirmations
    - Multichain TX ID + confirmations
    - Polygon explorer URL
    - recoveredFromBlockchain flag (if DB record was missing)
```

---

### Traceback Chain Summary (From Chain Back to Business Record)

This is the mental “spine” of the system — every public transaction can be traced all the way back to the human‑readable business record (or a recovered copy).

```text
Polygon TX Hash (0x7b3e...)
      │
      ▼
Polygon Calldata (DXER format)
  → Extract SHA-256 hash ("a3f8c2d1...")
  → Extract entityType ("expense")
  → Extract entityId ("uuid-here")
      │
      ▼
DXER Database
  → Look up record by entityType + entityId
  → Optionally recover from Multichain if missing
      │
      ▼
Canonical {METADATA}
  → Deterministic JSON view of that record
      │
      ▼
Recompute SHA-256
  → Compare with on-chain hash
      │
  ┌───┴─────────────┐
  │                 │
MATCH           MISMATCH
VERIFIED        TAMPERED
```

---

### Other Key User / System Flows (High Level)

These flows complement the anchoring paths and show how users interact with DXER Pay at a business level.

- **Authentication & Org Selection**
  - User signs up / signs in via the web app (Supabase auth).
  - `useAuth` fetches profile + organization memberships from the API.
  - User chooses an organization (or is auto‑routed if they only have one).
  - The browser stores:
    - JWT access token (for `Authorization: Bearer ...`).
    - Current org ID (`x-org-id` header source).

- **Onboarding / Hiring Flow**
  - Admin invites a new employee via **Hiring**:
    - Creates `employees` row in draft/onboarding state.
    - Generates an invite token and sends an email.
  - Candidate opens onboarding link:
    - DXER validates the token (`onboarding.validate`).
    - Candidate registers, verifies identity, signs contract.
  - Once complete:
    - Employee record is marked as active.
    - Optionally, a wallet is generated and anchored for that employee.

- **Payroll Run Flow**
  - Admin configures employees with salary, currency, start dates.
  - For a pay period:
    - Create a `payroll` record (period start/end, pay date, notes).
    - System or user adds `payroll_entries` per employee.
  - When payroll is “completed”:
    - Status moves from draft → completed.
    - Auto‑anchor captures a canonical snapshot of amounts, employees, org wallets.
    - Polygon TX forms a tamper‑proof trail of the payout decision.

- **Production & Expenses Flow**
  - Org creates **production batches** and **production events** (e.g., started, QA passed, shipped).
  - Expenses can optionally reference a `production_batch_id` to tie spend to a batch.
  - Anchoring across batches, events, and expenses creates a **full provenance chain** for both costs and operational events.

- **DXExplorer Usage Scenarios**
  - **Auditor** starts from a Polygon TX hash:
    - Uses DXExplorer to confirm data is unaltered and see the human‑readable metadata.
  - **Org admin** starts from an expense/invoice/payroll in the UI:
    - Follows the Polygon link on the record to prove to external parties that the record is anchored.
  - **Regulator / third party** with only a TX hash:
    - Uses DXExplorer (public URL) to independently check integrity without access to internal dashboards.

---

## Wallet & Security Model (No User-Touched Private Keys)

This section explains how wallets work conceptually and who can touch what.

- **Master Polygon Wallet (System-Level)**
  - Configured via env:
    - `POLYGON_PRIVATE_KEY`
    - `POLYGON_WALLET_ADDRESS`
  - Owned by the **DXER backend only**:
    - Private key never leaves server environment.
    - Not exposed to clients, UI, or logs.
  - Used for:
    - Anchoring hashes when an organization does **not** have its own Polygon wallet.
    - Funding new **org wallets** on testnet with small amounts of POL (gas), when possible.

- **Organization Wallets**
  - Each organization can have its own Polygon wallet:
    - Public address stored as `organizations.wallet_address`.
    - Encrypted private key stored as `organizations.wallet_private_key_enc`.
  - Core rules:
    - Raw private key is **never** shown to the user.
    - Decryption happens only inside backend processes, only when signing a transaction.
    - When anchoring for that org, the system prefers the org wallet over the master wallet.
  - Benefits:
    - Per‑org separation of concerns: each tenant has a distinct on‑chain identity.
    - Regulators / auditors can see which org signed which anchor even if they share infrastructure.

- **Employee Wallets**
  - Some flows (e.g. hiring) can generate **employee wallets**:
    - Public address: `employees.wallet_address`.
    - Encrypted private key: `employees.wallet_private_key_enc`.
  - Intended for:
    - Future payroll / payout scenarios where an employee’s wallet might directly receive funds.
  - Same principle:
    - Private keys are generated and stored server‑side.
    - `*_private_key_enc` is treated as secret; keys never leave backend in raw form.

- **MetaMask (User-Controlled Wallet)**
  - MetaMask connection in the dashboard:
    - User connects MetaMask from the browser.
    - System:
      - Requests permission to view addresses.
      - Requests network switch / add to Polygon Amoy.
    - The selected MetaMask address is stored as:
      - `organizations.metamask_address`.
  - Conceptual difference:
    - **Org wallet**: managed by DXER backend, used for automated anchoring and gas; key is server-side.
    - **MetaMask address**: purely user‑controlled; used for UX and potential future flows (e.g., signature requests, external confirmations).
  - TODAY (as of this file):
    - MetaMask is used for linking an identity and presenting wallet state in the UI.
    - **Anchoring transactions are still signed by backend wallets** (master or org). Users do not sign anchoring TXs directly.

- **Separation of Concerns / Trust Model**
  - **Clients (web app, scripts)**:
    - Never directly talk to Polygon or Multichain for writes.
    - They call DXER API, which decides how to write to chains.
  - **DXER API + services**:
    - Contain all logic to sign, broadcast, and verify on-chain transactions.
    - Responsible for mapping DB records to anchors and vice versa.
  - **Blockchains (Multichain + Polygon)**:
    - Never hold raw business data — only hashes and minimal metadata.
    - Serve as immutable notaries for integrity, not as primary storage.

---

## Multi-Tenancy & Roles (Org Isolation Without Code Detail)

- **Tenants = Organizations**
  - Every business using DXER Pay is represented as an `organizations` row.
  - All core domain tables include `org_id`:
    - `expenses`, `invoices`, `payrolls`, `production_batches`, `production_events`, `customers`, `employees`, `audit_log`, etc.
  - Isolation principle:
    - Every query is evaluated within the current `org_id` context provided by the authenticated user.
    - Backend enforces that a user cannot read or modify another organization’s data just by guessing IDs.

- **Membership & Roles**
  - `organization_members` links users to organizations, with a `role`:
    - Example roles: owner, admin, member, viewer (actual enumeration is implementation detail).
  - Typical flow:
    - Owner creates org.
    - Owner/admin invites other emails to join.
    - Invited users accept invite and become `organization_members` with a role.
  - Roles define:
    - What data a user can read in that org.
    - Which actions they can perform (e.g., create payroll vs. view only).

- **How Auth + Org Resolving Works Conceptually**
  - User authenticates with Supabase → receives JWT.
  - Frontend stores JWT and a chosen org ID.
  - For each API call, frontend includes:
    - `Authorization: Bearer <JWT>`.
    - `x-org-id: <org UUID>`.
  - Backend validates:
    - Token is valid and not expired.
    - User is a member of `x-org-id` with a role that allows the requested action.

---

## Rate Limiting, Health & Resilience Concepts

- **Rate Limiting**
  - There are two conceptual buckets:
    - **Auth endpoints** (`/api/auth/...`):
      - Protected by a **strict** rate limiter to reduce credential stuffing and brute force attempts.
    - **General API endpoints** (`/api/...`):
      - Protected by a more generous limiter to avoid abuse and protect backend resources.
  - Limits (window size, max requests) can be tuned; defaults are safe for local/dev.

- **Health Checks**
  - `/api/health` exposes an overall health endpoint.
  - Anchoring health (used by dashboard chain status) includes:
    - **Multichain health**:
      - Is the private node reachable?
      - What is the chain name and latest block height?
    - **Polygon health**:
      - Is the RPC reachable?
      - What is the current latest block?
      - Is the wallet funded (approximate balance)?
  - Health checks are time‑boxed with short timeouts:
    - If chains are slow/unreachable, the API degrades gracefully instead of hanging.

- **Background Jobs & Non-Blocking UX**
  - Auto‑anchoring is run in the background:
    - API writes to the DB and audit log first.
    - Job queue picks up records to anchor after the fact.
  - This ensures:
    - **User experience**: forms and actions are snappy and not bound to blockchain latency.
    - **Reliability**: failed anchoring can be retried without blocking the primary business action.

- **Recoverability**
  - DXExplorer is explicitly designed so that:
    - If the main DB is missing a record, but Multichain still has `fullMetadata`, the system can reconstruct a truthful view of the past.
    - This is important for disaster recovery and for investigations into data loss or tampering.

---

## Conceptual Summary for New Agents

- **DXER Pay is a multi-tenant accounting + audit system** where all important business events (expenses, invoices, payrolls, production events) are:
  - Scoped to an organization.
  - Logged to `audit_log` with before/after snapshots.
  - Optionally anchored to Multichain (private) + Polygon (public) for cryptographic proof.
- **Wallets are always backend‑controlled** (master and per‑org/employee) and never directly exposed or manipulated by end‑users; MetaMask links are for identity and UX, not for core anchoring writes.
- **Anchoring is asynchronous**: business actions complete quickly, while background jobs create durable, chain‑backed proofs that can be verified via DXExplorer.
- **Every Polygon TX is traceable** all the way back to the exact business record (or its recovered canonical form), allowing auditors and regulators to independently verify data integrity over time.

This `pay.md` should be the entry point for any new developer or AI agent exploring DXER Pay; read this first, then dive into the referenced files for implementation details.

