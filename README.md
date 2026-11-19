# ORQLAND — Order Management & Delivery Management modules

| Path | What it is |
|---|---|
| `docs/SCHEMA_DESIGN.md` | Database design: 22 approved tables + 3 proposed additions (§11), no changes to existing tables. ER diagram, lifecycles, open questions |
| `docs/GUIDE_COVERAGE.md` | Each requirement of the reference guide → where it is implemented |
| `docs/screenshots/` | 43 screens: workspace operations console (01–10), Orqland Run on a phone (11–28), Figma order management — summary, tabs, status cards, order view with live tracking (30–40), geofenced pickup and camera-only proof photo in Run (41–44) |
| `orqland-engine/` | NestJS 11 + GraphQL + Drizzle harness: `src/modules/orders`, `src/modules/delivery`, new schema files, migration, tests |
| `orqland-web/` | Next.js 16 harness: `features/dashboard/{orders,delivery,common}` (order queue + delivery operations console: overview, live map, assignment, agents, COD, costs & statements, settings), `features/orqlandRun` (mobile Run app: registration & KYC with licence photos + 6 screens), `features/myOrders` (checkout + My orders), shared primitives in `components/ui`, 4 route pages |

Files marked `[HOST SHIM]` stand in for code that already exists in your repositories, so the harness runs on its own. They are not part of the merge.

## Run the harness locally

```bash
cd orqland-engine
pnpm install
cp .env.example .env              # needs a local PostgreSQL; SUREPASS_MODE=mock
pnpm run migration:migrate
pnpm run seed:dev
pnpm run start:dev                # http://localhost:4000/graphql
pnpm test && pnpm run test:e2e    # unit + end-to-end (creates orqland_e2e DB)
```

```bash
cd orqland-web
pnpm install
pnpm run dev                      # http://localhost:3000/orders · /delivery · /orqland-run
```

Pages: workspace `/orders`, `/delivery` (tabs via `?tab=overview|live|assign|agents|cod|costs|settings`); agent `/orqland-run` (best viewed at phone width); customer `/checkout-demo`, `/my-orders`. Use the dashed "Dev:" selector in the header to switch between the seeded workspace owner, the agents and the customer. `orqland-engine/schema.gql` is the generated GraphQL schema for the whole API.
