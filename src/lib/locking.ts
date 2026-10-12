import type { Prisma } from '@prisma/client';
export async function lockPage(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'page:' + id}))`;
}
export async function lockConversation(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
}
