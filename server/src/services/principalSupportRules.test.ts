import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleSupportRows,
  countByView,
  describeAttendance,
  describeMaths,
  describeSpeaking,
  isMathsSubject,
  isSpeakingSubject,
  matchesView,
  pickLatestByStudent,
  pickWeakestMaths,
  statusFor,
  type ActionSnap,
  type StudentRef,
} from "./principalSupportRules.js";

const settings = {
  speakingMaxLevelOrder: 0,
  mathsBelowPct: 40,
  attendanceBelowPct: 75,
  recheckDays: 14,
};

const student: StudentRef = {
  id: "s1",
  fullName: "Asha",
  studentLoginId: "STU001",
  classId: "c1",
  className: "Class 6",
  sectionId: "sec1",
  sectionName: "A",
};

function action(partial: Partial<ActionSnap> & Pick<ActionSnap, "area" | "outcome" | "recheckOn">): ActionSnap {
  return {
    id: "a1",
    studentId: "s1",
    actionKind: "CALLED_PARENT",
    note: null,
    snapshotLabel: "was weak",
    snapshotValue: 0,
    outcomeNote: null,
    outcomeLabel: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    recordedByName: "Principal",
    ...partial,
  };
}

describe("subject match", () => {
  it("recognises speaking and maths", () => {
    assert.equal(isSpeakingSubject({ name: "Speaking", code: "SPEAK" }), true);
    assert.equal(isSpeakingSubject({ name: "English", code: "ENG" }), false);
    assert.equal(isMathsSubject({ name: "Basic Mathematics", code: "MATH" }), true);
    assert.equal(isMathsSubject({ name: "Speaking", code: "SPEAK" }), false);
  });
});

describe("signals", () => {
  it("flags speaking level 0 and a missing level", () => {
    const level0 = describeSpeaking(
      { studentId: "s1", levelOrder: 0, levelName: "Level 0: Start Speaking", date: "2026-10-02", subjectName: "Speaking" },
      0
    );
    assert.equal(level0.weak, true);
    assert.equal(level0.label, "Level 0: Start Speaking on 2026-10-02");
    assert.equal(
      describeSpeaking(
        { studentId: "s1", levelOrder: null, levelName: null, date: "2026-10-02", subjectName: "Speaking" },
        0
      ).weak,
      true
    );
    assert.equal(
      describeSpeaking(
        { studentId: "s1", levelOrder: 2, levelName: "English in Class", date: "2026-10-02", subjectName: "Speaking" },
        0
      ).weak,
      false
    );
  });

  it("flags maths under the cut-off", () => {
    assert.equal(
      describeMaths({ studentId: "s1", subjectId: "m", subjectName: "Maths", percentage: 28, date: "2026-10-01" }, 40).weak,
      true
    );
    assert.equal(
      describeMaths({ studentId: "s1", subjectId: "m", subjectName: "Maths", percentage: 40, date: "2026-10-01" }, 40).weak,
      false
    );
  });

  it("flags attendance under 75 and ignores unmarked students", () => {
    const low = describeAttendance({ studentId: "s1", present: 6, absent: 4 }, 75, { from: "2026-10-01", to: "2026-10-06" });
    assert.equal(low?.weak, true);
    const ok = describeAttendance({ studentId: "s1", present: 8, absent: 2 }, 75, { from: "2026-10-01", to: "2026-10-06" });
    assert.equal(ok?.weak, false);
    assert.equal(describeAttendance({ studentId: "s1", present: 0, absent: 0 }, 75, { from: "2026-10-01", to: "2026-10-06" }), null);
    assert.equal(describeAttendance({ studentId: "s1", present: 1, absent: 1 }, 75, { from: "2026-10-01", to: "2026-10-06" }), null);
  });
});

describe("status", () => {
  it("keeps a case open until the result is above the cut-off", () => {
    assert.equal(statusFor(true, null, "2026-10-06"), "no_action");
    assert.equal(statusFor(true, action({ area: "SPEAKING", outcome: "OPEN", recheckOn: "2026-10-20" }), "2026-10-06"), "action_recorded");
    assert.equal(statusFor(true, action({ area: "SPEAKING", outcome: "OPEN", recheckOn: "2026-10-06" }), "2026-10-06"), "recheck_due");
    assert.equal(
      statusFor(true, action({ area: "SPEAKING", outcome: "IMPROVED", recheckOn: "2026-10-06" }), "2026-10-06"),
      "still_needs_support"
    );
    assert.equal(statusFor(false, null, "2026-10-06"), null);
    assert.equal(statusFor(false, action({ area: "MATHS", outcome: "OPEN", recheckOn: "2026-10-01" }), "2026-10-06"), "improved");
  });
});

describe("assembleSupportRows", () => {
  it("lists weak areas and an improved area that had an action", () => {
    const rows = assembleSupportRows({
      students: [student],
      speakingByStudent: new Map([
        ["s1", { studentId: "s1", levelOrder: 0, levelName: "Start Speaking", date: "2026-10-02", subjectName: "Speaking" }],
      ]),
      mathsByStudent: new Map([
        ["s1", { studentId: "s1", subjectId: "m", subjectName: "Maths", percentage: 55, date: "2026-10-03" }],
      ]),
      attendanceByStudent: new Map([["s1", { studentId: "s1", present: 5, absent: 5 }]]),
      latestAction: new Map([
        ["s1:MATHS", action({ area: "MATHS", outcome: "OPEN", recheckOn: "2026-10-01" })],
      ]),
      settings,
      today: "2026-10-06",
      attendanceRange: { from: "2026-10-01", to: "2026-10-06" },
    });
    const counts = countByView(rows);
    assert.equal(counts.needsSupport, 2);
    assert.equal(counts.noAction, 2);
    assert.equal(counts.improved, 1);
    assert.equal(rows.filter((r) => matchesView("needs_support", r.status)).length, 2);
    assert.equal(rows.some((r) => r.area === "MATHS" && r.status === "improved"), true);
  });

  it("keeps the latest fact per student", () => {
    const latest = pickLatestByStudent([
      { studentId: "s1", levelOrder: 1 },
      { studentId: "s1", levelOrder: 0 },
    ]);
    assert.equal(latest.get("s1")?.levelOrder, 1);
    const weakest = pickWeakestMaths([
      { studentId: "s1", subjectId: "a", subjectName: "Algebra", percentage: 70, date: "2026-10-01" },
      { studentId: "s1", subjectId: "b", subjectName: "Basic", percentage: 30, date: "2026-10-02" },
    ]);
    assert.equal(weakest.get("s1")?.percentage, 30);
  });
});
