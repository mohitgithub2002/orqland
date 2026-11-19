/**
 * Shared end-to-end harness for `src/modules/orders/**` and `src/modules/delivery/**` e2e specs.
 * Boots the real Nest application against a dedicated PostgreSQL database, applies migrations and seeds
 * fixtures into the existing ORQLAND tables. Not a spec file itself.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { AppModule } from '@/app.module';
import * as schema from '@/infrastructure/database/schema';

export const SEED = {
  owner: '00000000-0000-4000-8000-000000000001',
  customer: '00000000-0000-4000-8000-000000000002',
  agentRavi: '00000000-0000-4000-8000-000000000003',
  agentPriya: '00000000-0000-4000-8000-000000000004',
  admin: '00000000-0000-4000-8000-000000000005',
  orqspace: '00000000-0000-4000-8000-0000000000a1',
  address: '00000000-0000-4000-8000-0000000000b1',
  listingVariants: '00000000-0000-4000-8000-0000000000c1',
  variantSmall: '00000000-0000-4000-8000-0000000000d1',
  variantLarge: '00000000-0000-4000-8000-0000000000d2',
  /** Single product (has_variants = false) — like the engine, it still has a default variant row. */
  listingSimple: '00000000-0000-4000-8000-0000000000c2',
  variantSimpleDefault: '00000000-0000-4000-8000-0000000000d3',
  listingService: '00000000-0000-4000-8000-0000000000c3',
  variantService: '00000000-0000-4000-8000-0000000000d4',
};

/** Fixtures in the existing ORQLAND tables (users, workspace, address, listings, variants). Idempotent. */
export async function seedFixtures(databaseUrl = process.env.DATABASE_URL) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  const users = [
    { id: SEED.owner, orqUserId: 'ORQSHAJU0001', displayName: 'Shaju', fname: 'Shaju', phone: '+919800000001' },
    { id: SEED.customer, orqUserId: 'ORQMARIA0002', displayName: 'Maria Susan', fname: 'Maria', phone: '+919800000002' },
    { id: SEED.agentRavi, orqUserId: 'ORQRAVI00003', displayName: 'Ravi Kumar', fname: 'Ravi', phone: '+919800000003' },
    { id: SEED.agentPriya, orqUserId: 'ORQPRIYA0004', displayName: 'Priya Natarajan', fname: 'Priya', phone: '+919800000004' },
    { id: SEED.admin, orqUserId: 'ORQADMIN0005', displayName: 'Platform Admin', fname: 'Admin', phone: '+919800000005' },
  ];
  for (const u of users) {
    await db
      .insert(schema.orqUsers)
      .values({
        ...u,
        firebaseUid: `fb_${u.orqUserId}`,
        email: `${u.orqUserId.toLowerCase()}@example.com`,
        roles: u.id === SEED.admin ? ['WEB_USER', 'PLATFORM_ADMIN'] : ['WEB_USER'],
      })
      .onConflictDoNothing();
  }
  await db
    .insert(schema.orqspaces)
    .values({ id: SEED.orqspace, orqspaceId: 'WSID-ABCH12345678', ownerId: SEED.owner, name: 'Sj softwares', type: 'STREET' })
    .onConflictDoNothing();
  await db
    .insert(schema.orqUserAddresses)
    .values({
      id: SEED.address,
      userId: SEED.customer,
      recipientName: 'Maria Susan',
      recipientPhone: '+919800000002',
      doorNo: '12',
      street: 'Pondy Bazaar',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
      pincode: '600017',
      latitude: '13.041800',
      longitude: '80.234100',
      isPrimary: true,
    })
    .onConflictDoNothing();
  await db
    .insert(schema.orqListings)
    .values([
      { id: SEED.listingVariants, ownerId: SEED.owner, orqspaceId: SEED.orqspace, listingType: 'PRODUCT', title: 'Filter Coffee Pack', basePrice: '200.00', gstPercentage: '5', totalPrice: '210.00', hasVariants: true, images: [] },
      { id: SEED.listingSimple, ownerId: SEED.owner, orqspaceId: SEED.orqspace, listingType: 'PRODUCT', title: 'Brass Dabara Set', basePrice: '450.00', gstPercentage: '12', totalPrice: '504.00', hasVariants: false, images: [] },
      { id: SEED.listingService, ownerId: SEED.owner, orqspaceId: SEED.orqspace, listingType: 'SERVICE', title: 'Laptop Repair Visit', basePrice: '500.00', gstPercentage: '18', totalPrice: '590.00', hasVariants: false, images: [] },
    ])
    .onConflictDoNothing();
  await db
    .insert(schema.orqListingVariants)
    .values([
      { id: SEED.variantSmall, listingId: SEED.listingVariants, type: '250 g', sku: 'FC-250', basePrice: '200.00', gstPercentage: '5', totalPrice: '210.00', inventoryMode: 'LIMITED', totalCapacity: 10, remainingQuantity: 10 },
      { id: SEED.variantLarge, listingId: SEED.listingVariants, type: '1 kg', sku: 'FC-1000', basePrice: '700.00', gstPercentage: '5', totalPrice: '735.00', inventoryMode: 'NO_LIMIT' },
      // Default variant the engine creates for a has_variants = false product (review §2.1).
      { id: SEED.variantSimpleDefault, listingId: SEED.listingSimple, type: 'Default', sku: 'BDS-STD', basePrice: '450.00', gstPercentage: '12', totalPrice: '504.00', inventoryMode: 'LIMITED', totalCapacity: 20, remainingQuantity: 20 },
      { id: SEED.variantService, listingId: SEED.listingService, type: 'Default', sku: 'SVC-REPAIR', basePrice: '500.00', gstPercentage: '18', totalPrice: '590.00', inventoryMode: 'TIME_BASED' },
    ])
    .onConflictDoNothing();
  await pool.end();
}

let app: INestApplication | undefined;
let url = '';

/** Recreates the e2e database (name must end in `_e2e`), migrates, seeds and boots the app. */
export async function startE2eApp(): Promise<void> {
  const target = new URL(process.env.DATABASE_URL!);
  const dbName = target.pathname.slice(1);
  if (!dbName.endsWith('_e2e')) throw new Error(`Refusing to reset "${dbName}": e2e database names must end with _e2e`);
  const adminUrl = new URL(target.toString());
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: process.env.E2E_MIGRATIONS_FOLDER ?? './drizzle' });
  await pool.end();
  await seedFixtures();

  app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.listen(0);
  url = `${await app.getUrl()}/graphql`.replace('[::1]', 'localhost');
}

/** Resolves a provider from the running app (used to trigger scheduled jobs deterministically). */
export function appGet<T>(token: abstract new (...args: never[]) => T): T {
  if (!app) throw new Error('App not started');
  return app.get(token as never) as T;
}

export async function stopE2eApp(): Promise<void> {
  await app?.close();
  app = undefined;
}

export type GqlBody = { data?: any; errors?: { message: string }[] };

/**
 * Sends a GraphQL request as the given user. The standalone auth guard accepts `dev:<orq_users.id>`;
 * when merging, point this at your test-token helper.
 */
export async function call(userId: string, query: string, variables: Record<string, unknown> = {}): Promise<GqlBody> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer dev:${userId}` },
    body: JSON.stringify({ query, variables }),
  });
  return (await res.json()) as GqlBody;
}

/** A minimal valid JPEG (SOI + APP0 + EOI) used as an uploaded document image. */
export const TINY_JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

/** Uploads a delivery document through the REST endpoint and returns the HTTP status and body. */
export async function uploadRaw(userId: string, purpose: string, data: Buffer = TINY_JPEG, type = 'image/jpeg') {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(data)], { type }), 'document.jpg');
  const res = await fetch(url.replace(/\/graphql$/, `/delivery/files?purpose=${purpose}`), {
    method: 'POST',
    headers: { Authorization: `Bearer dev:${userId}` },
    body: form,
  });
  return { status: res.status, body: (await res.json()) as { id?: string; message?: string | string[] } };
}

export async function uploadFile(userId: string, purpose: string, data?: Buffer): Promise<string> {
  const { status, body } = await uploadRaw(userId, purpose, data);
  if (status !== 201 || !body.id) throw new Error(`Upload failed (${status}): ${JSON.stringify(body)}`);
  return body.id;
}

export async function downloadFile(userId: string, fileId: string) {
  const res = await fetch(url.replace(/\/graphql$/, `/delivery/files/${fileId}`), { headers: { Authorization: `Bearer dev:${userId}` } });
  return { status: res.status, type: res.headers.get('content-type'), bytes: Buffer.from(await res.arrayBuffer()) };
}

/** Licence front/back images for a registration input. */
export async function licenceImages(userId: string) {
  return {
    licenceFrontFileId: await uploadFile(userId, 'LICENCE_FRONT'),
    licenceBackFileId: await uploadFile(userId, 'LICENCE_BACK'),
  };
}

export async function gql(userId: string, query: string, variables: Record<string, unknown> = {}) {
  const body = await call(userId, query, variables);
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  return body.data;
}

export async function gqlError(userId: string, query: string, variables: Record<string, unknown> = {}) {
  const body = await call(userId, query, variables);
  if (!body.errors?.length) throw new Error('Expected an error but the call succeeded');
  return body.errors[0].message;
}

export async function sqlQuery<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export const variantStock = async (variantId: string) =>
  (await sqlQuery<{ remaining_quantity: number }>('select remaining_quantity from orq_listing_variants where id = $1', [variantId]))[0].remaining_quantity;

export const PLACE_ORDER = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { replayed orders { id orderNumber orderStatus totalAmount paymentStatus items { quantity lineTotal variantId } } } }`;

export async function advanceToReady(orderId: string) {
  for (const m of ['acceptOrder', 'startPreparingOrder', 'markOrderReady']) {
    await gql(SEED.owner, `mutation($id: ID!) { ${m}(input: { orderId: $id }) { orderStatus } }`, { id: orderId });
  }
}
