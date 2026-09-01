import type { PrismaClient } from "@prisma/client";

export const SCHOOL_BRANDING_ID = "default";

export type SchoolBrandingDto = {
  schoolName: string;
  logoUrl: string | null;
};

export async function getSchoolBranding(prisma: PrismaClient): Promise<SchoolBrandingDto> {
  const row = await prisma.schoolBranding.upsert({
    where: { id: SCHOOL_BRANDING_ID },
    create: { id: SCHOOL_BRANDING_ID, schoolName: "Your School" },
    update: {},
  });
  return { schoolName: row.schoolName, logoUrl: row.logoUrl };
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
  return { schoolName: row.schoolName, logoUrl: row.logoUrl };
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
  return { schoolName: row.schoolName, logoUrl: row.logoUrl };
}
