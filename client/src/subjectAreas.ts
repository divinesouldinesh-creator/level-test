/** Top-level subject areas shown to students. */
export type SubjectAreaId = string;

export type SubjectWithArea = {
  id: string;
  name: string;
  code?: string | null;
  areaId?: string | null;
  areaName?: string | null;
  areaCode?: string | null;
};

/** Fallback when area is not set on the subject. */
export function classifySubjectAreaFallback(subject: {
  name: string;
  code?: string | null;
}): "maths" | "english" {
  const hay = `${subject.name} ${subject.code ?? ""}`.toLowerCase();
  if (
    /\benglish\b/.test(hay) ||
    /\beng\b/.test(hay) ||
    /\blanguage\b/.test(hay) ||
    /\bgrammar\b/.test(hay) ||
    /\breading\b/.test(hay)
  ) {
    return "english";
  }
  return "maths";
}

export function subjectMatchesArea(
  subject: SubjectWithArea,
  areaParam: string
): boolean {
  if (subject.areaId && subject.areaId === areaParam) return true;
  if (subject.areaName && subject.areaName.toLowerCase() === areaParam.toLowerCase()) {
    return true;
  }
  // Legacy slug URLs: /subjects/maths or /subjects/english
  if (areaParam === "maths" || areaParam === "english") {
    if (subject.areaName) {
      return subject.areaName.toLowerCase() === areaParam;
    }
    return classifySubjectAreaFallback(subject) === areaParam;
  }
  return false;
}

export function areaLabelFromSubjects(
  areaParam: string,
  subjects: SubjectWithArea[]
): string {
  const hit = subjects.find(
    (s) =>
      s.areaId === areaParam ||
      s.areaName?.toLowerCase() === areaParam.toLowerCase()
  );
  if (hit?.areaName) return hit.areaName;
  if (areaParam === "maths") return "Maths";
  if (areaParam === "english") return "English";
  return areaParam;
}
