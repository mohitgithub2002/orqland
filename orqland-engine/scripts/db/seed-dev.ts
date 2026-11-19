// [HOST SHIM] Dev-only seed for the standalone harness — do not copy.
// Reuses the e2e fixtures (users, workspace, address, listings and their variants).
import { SEED, seedFixtures } from '../../src/modules/orders/testing/e2e-harness';

void seedFixtures().then(() => console.log('Seeded. Dev tokens: Bearer dev:<user id> —', SEED));
