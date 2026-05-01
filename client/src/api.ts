const base = import.meta.env.VITE_API_URL ?? "";

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(t: string | null): void {
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = init?.body;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${base}${path}`, { ...init, headers, body });
  const text = await res.text();
  let data: T | undefined;
  try {
    data = text ? (JSON.parse(text) as T) : undefined;
  } catch {
    data = undefined;
  }
  const err = !res.ok ? formatApiError(data, res.statusText) : undefined;
  return { ok: res.ok, data, error: err, status: res.status };
}

function formatApiError(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.error === "string" && d.error) return d.error;
    const form = d.formErrors;
    if (Array.isArray(form) && form.length) return String(form[0]);
    const field = d.fieldErrors;
    if (field && typeof field === "object") {
      for (const v of Object.values(field as Record<string, unknown>)) {
        if (Array.isArray(v) && v[0]) return String(v[0]);
      }
    }
  }
  return fallback;
}
