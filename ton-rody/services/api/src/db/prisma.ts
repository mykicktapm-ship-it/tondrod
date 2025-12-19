import { PrismaClient } from '@prisma/client';

// Instantiate a single PrismaClient. In a real application you may want
// to attach hooks for logging or metrics. Prisma will handle
// connection pooling for you.
const prisma = new PrismaClient();

export default prisma;