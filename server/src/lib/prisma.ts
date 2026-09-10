import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function isDatabaseUnreachable(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P1001");
}
