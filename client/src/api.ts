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
  const err = !res.ok ? (data as { error?: string })?.error ?? res.statusText : undefined;
  return { ok: res.ok, data, error: err, status: res.status };
}
