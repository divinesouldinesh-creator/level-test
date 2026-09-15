/** Oral speaking ladder shown in class tests. Times and requirements are the teacher legend. */
export const SPEAKING_RUBRIC = [
  { order: 0, name: "Start Speaking", time: "30 sec", requirement: "Simple sentences" },
  { order: 1, name: "Confident Speaking", time: "1 min", requirement: "Eye contact + basic body language" },
  { order: 2, name: "English in Class", time: "2 min", requirement: "Use English for classroom communication" },
  { order: 3, name: "Connected Speaking", time: "3 min", requirement: "Connect and develop ideas" },
  { order: 4, name: "Expressive Speaking", time: "4 min", requirement: "Opinions + reasons + voice expression" },
  { order: 5, name: "Spontaneous Speaking", time: "5 min", requirement: "Think, respond and speak naturally" },
] as const;

export function isSpeakingSubject(subject: { name: string; code: string | null } | undefined): boolean {
  if (!subject) return false;
  const code = (subject.code ?? "").toUpperCase();
  return code === "SPEAK" || subject.name.trim().toLowerCase() === "speaking";
}
