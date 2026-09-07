import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "office@school.local";
  const passwordHash = await bcrypt.hash("password123", 10);
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { office: true },
  });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "OFFICE",
        office: { create: { fullName: "School Office" } },
      },
    });
    console.log("Created", email);
    return;
  }
  if (existing.role !== "OFFICE") {
    console.log("Email exists with role", existing.role, "— skipped");
    return;
  }
  if (!existing.office) {
    await prisma.office.create({
      data: { userId: existing.id, fullName: "School Office" },
    });
    console.log("Linked Office profile for", email);
    return;
  }
  console.log("Already exists:", email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
