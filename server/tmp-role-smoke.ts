import "dotenv/config";
import { prisma } from "./src/lib/prisma.js";

const base = "http://localhost:4000";
const web = "http://localhost:5173";
const results: { name: string; status: number; ms: number; ok: boolean; error: string }[] = [];

function brief(body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text.length > 240 ? text.slice(0, 240) : text;
}

async function check(name: string, url: string, opts: RequestInit = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    const error =
      body && typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : res.ok
          ? ""
          : brief(body);
    results.push({ name, status: res.status, ms: Date.now() - started, ok: res.ok, error });
    return { body, ok: res.ok, status: res.status };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({ name, status: 0, ms: Date.now() - started, ok: false, error });
    return { body: null, ok: false, status: 0 };
  }
}

async function login(label: string, payload: Record<string, string>) {
  const out = await check(label, base + "/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const token =
    out.body && typeof out.body === "object" && "token" in out.body
      ? String((out.body as { token: unknown }).token)
      : "";
  return token;
}

function auth(token: string) {
  return { authorization: "Bearer " + token };
}

const today = new Date().toISOString().slice(0, 10);
const monthStart = today.slice(0, 7) + "-01";

const [office, teacher, student] = await Promise.all([
  prisma.user.findFirst({ where: { role: "OFFICE", passwordPlain: { not: null } }, select: { email: true, passwordPlain: true } }),
  prisma.user.findFirst({ where: { role: "TEACHER", passwordPlain: { not: null } }, select: { email: true, passwordPlain: true } }),
  prisma.user.findFirst({
    where: { role: "STUDENT", passwordPlain: { not: null }, studentLoginId: { not: null } },
    select: { studentLoginId: true, passwordPlain: true },
  }),
]);

const admin = await login("login admin", { email: "admin@school.local", password: "password123" });
if (admin) {
  await check(
    "admin holidays",
    base + `/api/v1/settings/holidays?from=${monthStart}&to=${today}`,
    { headers: auth(admin) }
  );
  await check("vite proxy me", web + "/api/v1/auth/me", { headers: auth(admin) });
}

const officeToken =
  office?.email && office.passwordPlain
    ? await login("login office", { email: office.email, password: office.passwordPlain })
    : "";
const teacherToken =
  teacher?.email && teacher.passwordPlain
    ? await login("login teacher", { email: teacher.email, password: teacher.passwordPlain })
    : "";
const studentToken =
  student?.studentLoginId && student.passwordPlain
    ? await login("login student", { studentId: student.studentLoginId, password: student.passwordPlain })
    : "";

if (officeToken) {
  const h = auth(officeToken);
  await check("office me", base + "/api/v1/auth/me", { headers: h });
  await check("office fees meta", base + "/api/v1/admin/fees/meta", { headers: h });
  await check("office fee structures", base + "/api/v1/admin/fees/structures", { headers: h });
  await check("office fee collections", base + "/api/v1/admin/fees/collections", { headers: h });
  await check("office transport", base + "/api/v1/admin/transport", { headers: h });
  const studentsOut = await check("office students", base + "/api/v1/admin/students?pageSize=1", { headers: h });
  await check("office classes", base + "/api/v1/admin/classes", { headers: h });
  await check("office teachers", base + "/api/v1/admin/teachers", { headers: h });
  await check("office attendance", base + "/api/v1/admin/attendance/overview?range=monthly", { headers: h });
  const body = studentsOut.body as { students?: { id: string }[]; items?: { id: string }[] } | { id: string }[] | null;
  const row = Array.isArray(body) ? body[0] : body?.students?.[0] ?? body?.items?.[0];
  if (row?.id) {
    await check("office fee account", base + "/api/v1/admin/fees/students/" + row.id, { headers: h });
  } else {
    results.push({ name: "office fee account", status: 0, ms: 0, ok: false, error: "no student id in list" });
  }
}

if (teacherToken) {
  const h = auth(teacherToken);
  const classesOut = await check("teacher classes", base + "/api/v1/teacher/classes", { headers: h });
  const classes = Array.isArray(classesOut.body) ? (classesOut.body as { id: string; sections: { id: string }[] }[]) : [];
  const klass = classes.find((c) => c.sections?.length) ?? classes[0];
  const section = klass?.sections?.[0];
  const subjectsOut = await check(
    "teacher subjects",
    base + "/api/v1/teacher/subjects" + (klass ? "?classId=" + klass.id : ""),
    { headers: h }
  );
  await check("teacher weak topics", base + "/api/v1/teacher/analytics/weak-topics" + (klass ? "?classId=" + klass.id : ""), {
    headers: h,
  });
  await check(
    "teacher analytics students",
    base + "/api/v1/teacher/analytics/students" + (klass ? "?classId=" + klass.id : ""),
    { headers: h }
  );
  await check("teacher daily practice", base + "/api/v1/teacher/analytics/daily-practice?preset=today", { headers: h });
  await check(
    "teacher tests by date",
    base + "/api/v1/teacher/analytics/tests-by-date?preset=last7" + (klass ? "&classId=" + klass.id : ""),
    { headers: h }
  );
  const topic = await prisma.topic.findFirst({ select: { id: true } });
  if (topic) {
    await check("teacher topic ryg", base + "/api/v1/teacher/analytics/topic-ryg?topicId=" + topic.id, { headers: h });
  }
  if (klass && section) {
    const q = `classId=${klass.id}&sectionId=${section.id}`;
    await check("teacher fee status", base + "/api/v1/teacher/fees/status?" + q, { headers: h });
    await check("teacher section students", base + `/api/v1/teacher/sections/${section.id}/students`, { headers: h });
    await check("teacher attendance", base + `/api/v1/teacher/attendance?${q}&date=${today}`, { headers: h });
    await check(
      "teacher marked dates",
      base + `/api/v1/teacher/attendance/marked-dates?${q}&from=${monthStart}&to=${today}`,
      { headers: h }
    );
    await check("teacher attendance summary", base + `/api/v1/teacher/attendance/summary?${q}&range=monthly`, {
      headers: h,
    });
    await check("teacher care calls", base + "/api/v1/teacher/care-calls?" + q, { headers: h });
    await check("teacher care months", base + "/api/v1/teacher/care-calls/months?" + q, { headers: h });
    const subjects = Array.isArray(subjectsOut.body)
      ? (subjectsOut.body as { id: string; levels?: { id: string }[] }[])
      : [];
    const subject = subjects[0];
    if (subject?.id) {
      const level = subject.levels?.[0]?.id;
      const levelQ = level ? "&testedLevelId=" + level : "";
      await check(
        "teacher class test dates",
        base + `/api/v1/teacher/classroom-assessments/dates?${q}&subjectId=${subject.id}${levelQ}`,
        { headers: h }
      );
    }
    const students = (await (
      await fetch(base + `/api/v1/teacher/sections/${section.id}/students`, { headers: h })
    ).json()) as { id: string }[];
    const first = Array.isArray(students) ? students[0] : undefined;
    if (first?.id) {
      await check("teacher student progress", base + `/api/v1/teacher/analytics/student/${first.id}/progress`, {
        headers: h,
      });
      await check("teacher student detail", base + `/api/v1/teacher/analytics/student/${first.id}/detail`, {
        headers: h,
      });
      await check(
        "teacher attendance report",
        base + `/api/v1/teacher/attendance/report?studentId=${first.id}&range=monthly`,
        { headers: h }
      );
    }
  }
}

if (studentToken) {
  const h = auth(studentToken);
  await check("student me", base + "/api/v1/auth/me", { headers: h });
  await check("student home", base + "/api/v1/student/home", { headers: h });
  const subjectsOut = await check("student subjects", base + "/api/v1/student/subjects", { headers: h });
  await check("student subject areas", base + "/api/v1/student/subject-areas", { headers: h });
  await check("student mastery", base + "/api/v1/student/mastery", { headers: h });
  await check("student attendance", base + "/api/v1/student/attendance/report?range=monthly", { headers: h });
  const subjects = Array.isArray(subjectsOut.body) ? (subjectsOut.body as { id: string }[]) : [];
  const subjectId = subjects[0]?.id;
  if (subjectId) {
    await check("student chapters", base + "/api/v1/student/subjects/" + subjectId + "/chapters", { headers: h });
    await check("student levels", base + "/api/v1/student/subjects/" + subjectId + "/levels", { headers: h });
    await check("student mastery by subject", base + "/api/v1/student/mastery?subjectId=" + subjectId, { headers: h });
  }
  const challenge = await prisma.dailyChallenge.findFirst({
    where: { student: { user: { studentLoginId: student?.studentLoginId ?? "" } } },
    select: { id: true },
    orderBy: { startedAt: "desc" },
  });
  if (challenge) {
    await check("student daily challenge", base + "/api/v1/student/daily-challenge/" + challenge.id, { headers: h });
  }
}

const failed = results.filter((r) => !r.ok);
console.log(
  JSON.stringify(
    {
      found: { office: Boolean(office), teacher: Boolean(teacher), student: Boolean(student) },
      total: results.length,
      failed: failed.length,
      results,
    },
    null,
    2
  )
);

await prisma.$disconnect();
