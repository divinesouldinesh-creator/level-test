import type { PrismaClient } from "@prisma/client";
import { CACHE_KEY, CACHE_TTL_MS, cacheGet, cacheSet } from "../lib/memoryCache.js";

export const SCHOOL_BRANDING_ID = "default";

export type SchoolBrandingDto = {
  schoolName: string;
  logoUrl: string | null;
};

export async function getSchoolBranding(prisma: PrismaClient): Promise<SchoolBrandingDto> {
  const cached = cacheGet<SchoolBrandingDto>(CACHE_KEY.branding);
  if (cached) return cached;
  const row = await prisma.schoolBranding.upsert({
    where: { id: SCHOOL_BRANDING_ID },
    create: { id: SCHOOL_BRANDING_ID, schoolName: "Your School" },
    update: {},
  });
  const dto = { schoolName: row.schoolName, logoUrl: row.logoUrl };
  cacheSet(CACHE_KEY.branding, dto, CACHE_TTL_MS.branding);
  return dto;
}

export async function updateSchoolName(
  prisma: PrismaClient,
  schoolName: string
): Promise<SchoolBrandingDto> {
  const row = await prisma.schoolBranding.upsert({
    where: { id: SCHOOL_BRANDING_ID },
    create: { id: SCHOOL_BRANDING_ID, schoolName },
    update: { schoolName },
  });
  const dto = { schoolName: row.schoolName, logoUrl: row.logoUrl };
  cacheSet(CACHE_KEY.branding, dto, CACHE_TTL_MS.branding);
  return dto;
}

export async function updateSchoolLogo(
  prisma: PrismaClient,
  logoUrl: string | null
): Promise<SchoolBrandingDto> {
  const row = await prisma.schoolBranding.upsert({
    where: { id: SCHOOL_BRANDING_ID },
    create: { id: SCHOOL_BRANDING_ID, schoolName: "Your School", logoUrl },
    update: { logoUrl },
  });
  const dto = { schoolName: row.schoolName, logoUrl: row.logoUrl };
  cacheSet(CACHE_KEY.branding, dto, CACHE_TTL_MS.branding);
  return dto;
}
