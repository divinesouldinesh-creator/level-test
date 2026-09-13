type CacheEntry = { value: unknown; expiresAt: number };

const store = new Map<string, CacheEntry>();

export const CACHE_TTL_MS = {
  catalog: 2 * 60 * 1000,
  branding: 5 * 60 * 1000,
  teacherClasses: 60 * 1000,
  studentProfile: 2 * 60 * 1000,
  studentMastery: 30 * 1000,
} as const;

export const CACHE_KEY = {
  adminClasses: "catalog:admin-classes",
  teacherClasses: "catalog:teacher-classes",
  adminSubjects: "catalog:admin-subjects",
  teacherSubjects: "catalog:teacher-subjects",
  adminTopics: "catalog:admin-topics",
  adminAreas: "catalog:admin-areas",
  branding: "branding:school",
  studentSubjects: (classId: string) => `student-catalog:subjects:${classId}`,
  studentAreas: (classId: string) => `student-catalog:areas:${classId}`,
  studentByUser: (userId: string) => `student:${userId}`,
  studentMastery: (studentId: string, filter = "all") => `student-mastery:${studentId}:${filter}`,
} as const;

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

export function cacheDeletePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export async function cacheGetOrSet<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  cacheSet(key, value, ttlMs);
  return value;
}

/** Classes, subjects, topics, areas — not live scores/attendance. */
export function invalidateCatalog(): void {
  cacheDeletePrefix("catalog:");
  cacheDeletePrefix("student-catalog:");
}

export function invalidateBranding(): void {
  cacheDelete(CACHE_KEY.branding);
}

export function invalidateStudentMastery(studentId: string): void {
  cacheDeletePrefix(`student-mastery:${studentId}:`);
}
