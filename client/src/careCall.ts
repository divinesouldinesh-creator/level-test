export type CareCallYesNo = "YES" | "NO";

export type CareCallRecord = {
  id: string;
  calledAt: string;
  englishMirrorPractice: CareCallYesNo | null;
  heavyPhoneTv: CareCallYesNo | null;
};

export const YES_NO_OPTIONS: { value: CareCallYesNo; label: string }[] = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
];

export function yesNoLabel(v: CareCallYesNo | null): string {
  if (!v) return "—";
  return v === "YES" ? "Yes" : "No";
}

export function emptyRoutine(): Pick<CareCallRecord, "englishMirrorPractice" | "heavyPhoneTv"> {
  return { englishMirrorPractice: null, heavyPhoneTv: null };
}
