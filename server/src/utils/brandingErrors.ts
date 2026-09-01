import type { Response } from "express";

export function isPrismaMissingTableError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2021"
  );
}

export function brandingErrorMessage(e: unknown): string {
  if (isPrismaMissingTableError(e)) {
    return "School branding database table is missing. Ask your admin to run: cd server && npx prisma migrate deploy";
  }
  if (e instanceof Error && e.message) return e.message;
  return "School branding operation failed";
}

export function sendBrandingError(res: Response, e: unknown, status = 500): void {
  console.error("[school-branding]", e);
  res.status(status).json({ error: brandingErrorMessage(e) });
}
