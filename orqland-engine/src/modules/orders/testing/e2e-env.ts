/** Jest setupFiles for the Orders & Delivery end-to-end specs (`*.e2e.spec.ts`). */
import { tmpdir } from 'os';

process.env.DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/orqland_e2e';
process.env.DA_ENCRYPTION_KEY ??= '6f2c1a9e4b7d3c8a0e5f9b2d7c4a1e8f3b6d9c2a5e8f1b4d7a0c3e6f9b2d5a8c';
process.env.DA_FINGERPRINT_SECRET ??= 'e2e-fingerprint-secret-0123456789abcdefghijk';
process.env.SUREPASS_MODE = 'mock';
// Small workspace limit so the connection-limit rule is exercised.
process.env.DELIVERY_MAX_AGENTS_PER_WORKSPACE = '1';
process.env.DELIVERY_UPLOAD_DIR ??= `${tmpdir()}/orqland-e2e-uploads`;
