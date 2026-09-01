import { api, getToken, mediaUrl } from "./api";

export type SchoolBranding = {
  schoolName: string;
  logoUrl: string | null;
};

/** Absolute URL for images in printable certificate HTML. */
export function certificateMediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const fromApi = mediaUrl(path);
  if (!fromApi) return undefined;
  if (/^https?:\/\//i.test(fromApi)) return fromApi;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${fromApi.startsWith("/") ? "" : "/"}${fromApi}`;
  }
  return fromApi;
}

export async function fetchSchoolBranding(): Promise<SchoolBranding> {
  const r = await api<SchoolBranding>("/api/v1/settings/school");
  if (!r.ok || !r.data) {
    return { schoolName: "Your School", logoUrl: null };
  }
  return r.data;
}

export async function updateSchoolBrandingName(schoolName: string) {
  return api<SchoolBranding>("/api/v1/admin/school-branding", {
    method: "PATCH",
    json: { schoolName },
  });
}

export async function uploadSchoolLogo(file: File) {
  const base = import.meta.env.VITE_API_URL ?? "";
  const fd = new FormData();
  fd.append("file", file);
  const token = getToken();
  const res = await fetch(`${base}/api/v1/admin/school-logo`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const text = await res.text();
  let data: SchoolBranding | { error?: string } | undefined;
  try {
    data = text ? (JSON.parse(text) as SchoolBranding | { error?: string }) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const err =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : res.statusText || "Upload failed";
    return { ok: false as const, error: err };
  }
  return { ok: true as const, data: data as SchoolBranding };
}

export async function removeSchoolLogo() {
  return api<SchoolBranding>("/api/v1/admin/school-logo", { method: "DELETE" });
}
