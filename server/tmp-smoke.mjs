const base = "http://localhost:4000";
const web = "http://localhost:5173";
const results = [];

function brief(body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text.length > 220 ? text.slice(0, 220) : text;
}

async function check(name, url, opts = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* html or js */
    }
    const ok = res.ok;
    const error =
      body && typeof body === "object" && "error" in body ? body.error : ok ? "" : brief(body);
    results.push({
      name,
      status: res.status,
      ms: Date.now() - started,
      ok,
      error: typeof error === "string" ? error : brief(error),
    });
    return { res, body, ok };
  } catch (err) {
    results.push({
      name,
      status: 0,
      ms: Date.now() - started,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return { res: null, body: null, ok: false };
  }
}

async function login(label, payload) {
  const out = await check(label, base + "/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const token = out.body && typeof out.body === "object" ? out.body.token : null;
  return token || null;
}

function auth(token) {
  return { authorization: "Bearer " + token };
}

const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);

await check("health", base + "/health");
await check("web login page", web + "/login");
await check("web app module", web + "/src/main.tsx");
await check("web app routes", web + "/src/App.tsx");

const pages = [
  "/src/pages/LoginPage.tsx",
  "/src/layouts/AdminLayout.tsx",
  "/src/layouts/OfficeLayout.tsx",
  "/src/pages/admin/AdminHome.tsx",
  "/src/pages/admin/AdminCurriculumPage.tsx",
  "/src/pages/admin/AdminCoveragePage.tsx",
  "/src/pages/admin/AdminQuestionBankPage.tsx",
  "/src/pages/admin/AdminStaffPage.tsx",
  "/src/pages/admin/AdminSecurityPage.tsx",
  "/src/pages/admin/AdminSchoolBrandingPage.tsx",
  "/src/pages/admin/AdminTopicLessonsPage.tsx",
  "/src/pages/admin/AdminAttendancePage.tsx",
  "/src/pages/admin/AdminStudentsPage.tsx",
  "/src/pages/office/OfficeOverviewPage.tsx",
  "/src/pages/office/OfficeFeesPage.tsx",
  "/src/pages/office/OfficeTransportPage.tsx",
  "/src/pages/teacher/TeacherOverviewPage.tsx",
  "/src/pages/teacher/TeacherAttendancePage.tsx",
  "/src/pages/teacher/TeacherFeeStatusPage.tsx",
  "/src/pages/teacher/TeacherAnalyticsPage.tsx",
  "/src/pages/teacher/TeacherDailyPracticePage.tsx",
  "/src/pages/teacher/TeacherClassroomTestPage.tsx",
  "/src/pages/teacher/TeacherCareCallPage.tsx",
  "/src/pages/student/StudentHomePage.tsx",
  "/src/pages/student/StudentSubjectAreasPage.tsx",
  "/src/pages/student/StudentSubjectAreaPage.tsx",
  "/src/pages/student/StudentSubjectFixPage.tsx",
  "/src/pages/student/StudentPartHubPage.tsx",
  "/src/pages/student/StudentPartLearnPage.tsx",
  "/src/pages/student/StudentLevels.tsx",
  "/src/pages/student/StudentTest.tsx",
  "/src/pages/student/StudentDailyChallengeHubPage.tsx",
  "/src/pages/student/StudentDailyChallengePage.tsx",
  "/src/pages/student/StudentMasteryPage.tsx",
  "/src/pages/student/StudentAttendancePage.tsx",
];
for (const page of pages) {
  await check("compile " + page.split("/").pop(), web + page);
}

const adminToken = await login("login admin", {
  email: "admin@school.local",
  password: "password123",
});
const officeToken = await login("login office", {
  email: "office@school.local",
  password: "password123",
});
const teacherToken = await login("login teacher", {
  email: "teacher@school.local",
  password: "password123",
});
const studentToken = await login("login student", {
  studentId: "STU001",
  password: "password123",
});

if (adminToken) {
  const h = auth(adminToken);
  const gets = [
    ["/api/v1/auth/me", "admin me"],
    ["/api/v1/settings/school", "admin school settings"],
    ["/api/v1/settings/holidays", "admin holidays"],
    ["/api/v1/admin/dashboard/summary", "admin dashboard"],
    ["/api/v1/admin/coverage/summary", "admin coverage"],
    ["/api/v1/admin/classes", "admin classes"],
    ["/api/v1/admin/attendance/overview?range=last_7_days", "admin attendance overview"],
    ["/api/v1/admin/attendance/marking-status?month=" + month, "admin marking status"],
    ["/api/v1/admin/attendance/holiday-settings", "admin holiday settings"],
    ["/api/v1/admin/subject-areas", "admin subject areas"],
    ["/api/v1/admin/subjects", "admin subjects"],
    ["/api/v1/admin/topics", "admin topics"],
    ["/api/v1/admin/topic-lessons", "admin topic lessons"],
    ["/api/v1/admin/question-reports", "admin question reports"],
    ["/api/v1/admin/students?pageSize=5", "admin students"],
    ["/api/v1/admin/teachers", "admin teachers"],
    ["/api/v1/admin/office-users", "admin office users"],
    ["/api/v1/admin/school-branding", "admin branding"],
  ];
  let classes = [];
  let subjects = [];
  let students = [];
  for (const [path, name] of gets) {
    const out = await check(name, base + path, { headers: h });
    if (name === "admin classes" && Array.isArray(out.body)) classes = out.body;
    if (name === "admin subjects" && Array.isArray(out.body)) subjects = out.body;
    if (name === "admin students") {
      const body = out.body;
      students = body?.students || body?.items || body?.data || (Array.isArray(body) ? body : []);
    }
  }
  const subjectId = subjects[0]?.id;
  if (subjectId) {
    await check("admin question counts", base + "/api/v1/admin/questions/counts?subjectId=" + subjectId, {
      headers: h,
    });
    await check("admin questions", base + "/api/v1/admin/questions?subjectId=" + subjectId, { headers: h });
  }
  const klass = classes.find((c) => c.sections?.length) || classes[0];
  const section = klass?.sections?.[0];
  const student = students[0];
  if (klass && section) {
    await check(
      "admin attendance summary",
      base + `/api/v1/admin/attendance/summary?classId=${klass.id}&sectionId=${section.id}&range=monthly`,
      { headers: h }
    );
  }
  if (student?.id) {
    await check(
      "admin attendance report",
      base + `/api/v1/admin/attendance/report?studentId=${student.id}&range=monthly`,
      { headers: h }
    );
  }
}

if (officeToken) {
  const h = auth(officeToken);
  await check("office me", base + "/api/v1/auth/me", { headers: h });
  await check("office fees meta", base + "/api/v1/admin/fees/meta", { headers: h });
  await check("office fee structures", base + "/api/v1/admin/fees/structures", { headers: h });
  await check("office fee collections", base + "/api/v1/admin/fees/collections", { headers: h });
  await check("office transport", base + "/api/v1/admin/transport", { headers: h });
  await check("office students", base + "/api/v1/admin/students?pageSize=5", { headers: h });
  await check("office classes", base + "/api/v1/admin/classes", { headers: h });
  await check("office teachers", base + "/api/v1/admin/teachers", { headers: h });
  await check("office attendance overview", base + "/api/v1/admin/attendance/overview?range=monthly", {
    headers: h,
  });
  const studentsOut = await check("office student list for account", base + "/api/v1/admin/students?pageSize=1", {
    headers: h,
  });
  const body = studentsOut.body;
  const student = body?.students?.[0] || body?.items?.[0] || body?.data?.[0] || (Array.isArray(body) ? body[0] : null);
  if (student?.id) {
    await check("office fee account", base + "/api/v1/admin/fees/students/" + student.id, { headers: h });
  }
}

if (teacherToken) {
  const h = auth(teacherToken);
  const classesOut = await check("teacher classes", base + "/api/v1/teacher/classes", { headers: h });
  const classes = Array.isArray(classesOut.body) ? classesOut.body : [];
  const klass = classes.find((c) => c.sections?.length) || classes[0];
  const section = klass?.sections?.[0];
  const subjectsOut = await check(
    "teacher subjects",
    base + "/api/v1/teacher/subjects" + (klass ? "?classId=" + klass.id : ""),
    { headers: h }
  );
  await check("teacher weak topics", base + "/api/v1/teacher/analytics/weak-topics", { headers: h });
  await check("teacher analytics students", base + "/api/v1/teacher/analytics/students", { headers: h });
  await check("teacher daily practice", base + "/api/v1/teacher/analytics/daily-practice?preset=today", {
    headers: h,
  });
  await check("teacher topic ryg", base + "/api/v1/teacher/analytics/topic-ryg", { headers: h });
  if (klass && section) {
    const q = `classId=${klass.id}&sectionId=${section.id}`;
    await check("teacher fee status", base + "/api/v1/teacher/fees/status?" + q, { headers: h });
    await check("teacher section students", base + `/api/v1/teacher/sections/${section.id}/students`, {
      headers: h,
    });
    await check("teacher attendance", base + `/api/v1/teacher/attendance?${q}&date=${today}`, { headers: h });
    await check("teacher marked dates", base + `/api/v1/teacher/attendance/marked-dates?${q}&month=${month}`, {
      headers: h,
    });
    await check(
      "teacher attendance summary",
      base + `/api/v1/teacher/attendance/summary?${q}&range=monthly`,
      { headers: h }
    );
    await check("teacher care calls", base + "/api/v1/teacher/care-calls?" + q, { headers: h });
    await check("teacher care months", base + "/api/v1/teacher/care-calls/months?" + q, { headers: h });
    const subjects = Array.isArray(subjectsOut.body) ? subjectsOut.body : [];
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
    const students = await fetch(base + `/api/v1/teacher/sections/${section.id}/students`, { headers: h }).then((r) =>
      r.json()
    );
    const student = Array.isArray(students) ? students[0] : null;
    if (student?.id) {
      await check(
        "teacher student progress",
        base + `/api/v1/teacher/analytics/student/${student.id}/progress`,
        { headers: h }
      );
      await check(
        "teacher student detail",
        base + `/api/v1/teacher/analytics/student/${student.id}/detail`,
        { headers: h }
      );
    }
  }
}

if (studentToken) {
  const h = auth(studentToken);
  await check("student me", base + "/api/v1/auth/me", { headers: h });
  await check("student home", base + "/api/v1/student/home", { headers: h });
  await check("student subjects", base + "/api/v1/student/subjects", { headers: h });
  const areas = await check("student subject areas", base + "/api/v1/student/subject-areas", { headers: h });
  await check("student mastery", base + "/api/v1/student/mastery", { headers: h });
  await check("student attendance", base + "/api/v1/student/attendance/report?range=monthly", { headers: h });
  const list = Array.isArray(areas.body) ? areas.body : areas.body?.areas || [];
  const area = list[0];
  const subject = area?.subjects?.[0] || area?.subject;
  const subjectId = subject?.id || area?.subjects?.[0]?.id;
  if (subjectId) {
    await check("student chapters", base + "/api/v1/student/subjects/" + subjectId + "/chapters", { headers: h });
    await check("student levels", base + "/api/v1/student/subjects/" + subjectId + "/levels", { headers: h });
  }
}

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
