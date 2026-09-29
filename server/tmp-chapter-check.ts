import "dotenv/config";
import { prisma } from "./src/lib/prisma.js";

const student = await prisma.user.findFirst({
  where: { role: "STUDENT", passwordPlain: { not: null }, studentLoginId: { not: null } },
  select: { studentLoginId: true, passwordPlain: true, student: { select: { classId: true } } },
});
if (!student?.student || !student.passwordPlain || !student.studentLoginId) {
  console.log(JSON.stringify({ error: "no student" }));
  await prisma.$disconnect();
  process.exit(0);
}
const link = await prisma.classSubject.findFirst({
  where: { classId: student.student.classId, subject: { testMode: "CHAPTER" } },
  select: { subjectId: true },
});
const login = await fetch("http://localhost:4000/api/v1/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ studentId: student.studentLoginId, password: student.passwordPlain }),
}).then((r) => r.json());
if (!link) {
  console.log(JSON.stringify({ chapterSubject: false }));
} else {
  const res = await fetch("http://localhost:4000/api/v1/student/subjects/" + link.subjectId + "/chapters", {
    headers: { authorization: "Bearer " + login.token },
  });
  const text = await res.text();
  console.log(JSON.stringify({ status: res.status, ok: res.ok, snippet: text.slice(0, 160) }));
}
await prisma.$disconnect();
