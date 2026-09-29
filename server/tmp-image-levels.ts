import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const url = "/uploads/questions/d1e85b4a-db2c-4711-bef1-076b8307aeff.jpeg";
const q = await prisma.question.findFirst({
  where: { stemImageUrl: url },
  select: { id: true, stem: true, createdAt: true, stemImageUrl: true, optionImageA: true },
});
const stored = await prisma.$queryRaw<{ n: number }[]>`
  SELECT octet_length("data")::int AS n FROM "StoredUpload" WHERE "path" = ${url}
`;
const recent = await prisma.question.findMany({
  where: { stemImageUrl: { not: null } },
  orderBy: { createdAt: "desc" },
  take: 8,
  select: { stem: true, stemImageUrl: true, createdAt: true, subject: { select: { name: true } } },
});
console.log(JSON.stringify({ q, stored: stored[0]?.n ?? null, recent }, null, 2));
await prisma.$disconnect();
