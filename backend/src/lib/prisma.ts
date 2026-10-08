import type { PrismaClient } from '@prisma/client';

// One PrismaClient per process: every `new PrismaClient()` opens its own
// connection pool, and ~30 modules each creating one exhausted Postgres
// connections under load. The client is keyed on the constructor so tests that
// swap the mocked '@prisma/client' between requires still get their own fake.
let instance: PrismaClient | null = null;
let instanceCtor: unknown = null;

export function getPrisma(): PrismaClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient: Client } = require('@prisma/client');
  if (!instance || instanceCtor !== Client) {
    instance = new Client() as PrismaClient;
    instanceCtor = Client;
  }
  return instance;
}
