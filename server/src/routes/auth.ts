import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken, authMiddleware } from "../middleware/auth.js";

const router = Router();

const loginSchema = z.object({
  studentId: z.string().optional(),
  password: z.string(),
  email: z.string().email().optional(),
});

function normalizeLoginInput(parsed: z.infer<typeof loginSchema>) {
  const studentId = parsed.studentId?.trim() || undefined;
  const email = parsed.email?.trim().toLowerCase() || undefined;
  const password = parsed.password;
  return { studentId, email, password };
}

router.post("/login", async (req, res) => {
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body === "object") {
    if (typeof body.studentId === "string") body.studentId = body.studentId.trim();
    if (typeof body.email === "string") body.email = body.email.trim();
  }
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { password, studentId, email } = normalizeLoginInput(parsed.data);

  let user = null;
  if (studentId) {
    user = await prisma.user.findFirst({
      where: { studentLoginId: studentId, role: "STUDENT" },
      include: { student: { include: { schoolClass: true } }, teacher: true, admin: true },
    });
  } else if (email) {
    user = await prisma.user.findFirst({
      where: { email },
      include: { teacher: true, admin: true, student: true },
    });
  } else {
    res.status(400).json({ error: "Provide studentId or email" });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const studentWithClass = user.student
    ? await prisma.student.findUnique({
        where: { userId: user.id },
        include: { schoolClass: true },
      })
    : null;

  const token = signToken(user.id, user.role);
  res.json({
    token,
    user: {
      id: user.id,
      role: user.role,
      email: user.email,
      studentLoginId: user.studentLoginId,
      profile:
        user.student
          ? {
              type: "student" as const,
              fullName: user.student.fullName,
              studentId: user.studentLoginId,
              className: studentWithClass?.schoolClass.name,
            }
          : user.teacher
            ? { type: "teacher" as const, fullName: user.teacher.fullName }
            : user.admin
              ? { type: "admin" as const, fullName: user.admin.fullName }
              : null,
    },
  });
});

router.get("/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { student: { include: { schoolClass: true } }, teacher: true, admin: true },
  });
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    id: user.id,
    role: user.role,
    email: user.email,
    studentLoginId: user.studentLoginId,
    profile:
      user.student
        ? {
            type: "student" as const,
            fullName: user.student.fullName,
            studentId: user.studentLoginId,
            className: user.student.schoolClass.name,
          }
        : user.teacher
          ? { type: "teacher" as const, fullName: user.teacher.fullName }
          : user.admin
            ? { type: "admin" as const, fullName: user.admin.fullName }
            : null,
  });
});

export default router;
