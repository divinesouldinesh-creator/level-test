import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Visible class label for CSV / print (grade or name). */
export function classLabelForDisplay(sc) {
    const g = sc.grade?.trim();
    if (g)
        return g;
    const m = sc.name.match(/(\d+)\s*$/);
    if (m)
        return m[1];
    return sc.name;
}
/** Username prefix like 5A from grade/name + section (e.g. 5 + A → 5A). */
export function loginPrefixFromSchoolClass(sc, sectionName) {
    const sec = sectionName.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const g = sc.grade?.trim();
    if (g)
        return `${g.replace(/[^A-Za-z0-9]/g, "")}${sec}`;
    const m = sc.name.match(/(\d+)\s*$/);
    if (m)
        return `${m[1]}${sec}`;
    const slug = sc.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
    return `${slug}${sec}`;
}
export function randomFourDigitPassword() {
    return String(Math.floor(1000 + Math.random() * 9000));
}
function formatLoginSuffix(index) {
    if (index < 100)
        return String(index).padStart(2, "0");
    return String(index);
}
export async function maxLoginIndexForPrefix(db, prefix) {
    const re = new RegExp(`^${escapeRegex(prefix)}_(\\d+)$`);
    const users = await db.user.findMany({
        where: {
            role: "STUDENT",
            studentLoginId: { startsWith: `${prefix}_` },
        },
        select: { studentLoginId: true },
    });
    let max = 0;
    for (const u of users) {
        const id = u.studentLoginId;
        if (!id)
            continue;
        const m = id.match(re);
        if (m)
            max = Math.max(max, parseInt(m[1], 10));
    }
    return max;
}
async function ensureClassSubjects(db, classId) {
    const subjects = await db.subject.findMany({ select: { id: true } });
    for (const s of subjects) {
        await db.classSubject.upsert({
            where: { classId_subjectId: { classId, subjectId: s.id } },
            update: {},
            create: { classId, subjectId: s.id },
        });
    }
}
/**
 * Resolve SchoolClass + Section from labels; create class/section if missing.
 */
export async function resolveOrCreateClassSection(prisma, classStr, sectionStr) {
    const cTrim = classStr.trim();
    const sTrim = sectionStr.trim();
    if (!cTrim || !sTrim)
        throw new Error("Class and section are required");
    let schoolClass = await prisma.schoolClass.findFirst({
        where: {
            OR: [
                { grade: cTrim },
                { name: cTrim },
                { name: `Class ${cTrim}` },
                { name: { equals: cTrim, mode: "insensitive" } },
            ],
        },
        include: { sections: true },
    });
    if (!schoolClass) {
        schoolClass = await prisma.schoolClass.create({
            data: { name: `Class ${cTrim}`, grade: cTrim },
            include: { sections: true },
        });
        await ensureClassSubjects(prisma, schoolClass.id);
    }
    let section = schoolClass.sections.find((x) => x.name.toLowerCase() === sTrim.toLowerCase());
    if (!section) {
        section = await prisma.section.create({
            data: { classId: schoolClass.id, name: sTrim },
        });
    }
    const loginPrefix = loginPrefixFromSchoolClass(schoolClass, section.name);
    return {
        classId: schoolClass.id,
        sectionId: section.id,
        className: schoolClass.name,
        sectionName: section.name,
        grade: schoolClass.grade,
        loginPrefix,
    };
}
export async function loadClassSectionForIds(prisma, classId, sectionId) {
    const schoolClass = await prisma.schoolClass.findUnique({
        where: { id: classId },
        include: { sections: true },
    });
    if (!schoolClass)
        throw new Error("Class not found");
    const section = schoolClass.sections.find((s) => s.id === sectionId);
    if (!section)
        throw new Error("Section not found for this class");
    return {
        classId: schoolClass.id,
        sectionId: section.id,
        className: schoolClass.name,
        sectionName: section.name,
        grade: schoolClass.grade,
        loginPrefix: loginPrefixFromSchoolClass(schoolClass, section.name),
    };
}
export async function generateStudentRows(prisma, params) {
    if (params.count < 1 || params.count > 500)
        throw new Error("Count must be between 1 and 500");
    const meta = await loadClassSectionForIds(prisma, params.classId, params.sectionId);
    const start = (await maxLoginIndexForPrefix(prisma, meta.loginPrefix)) + 1;
    const rows = [];
    for (let i = 0; i < params.count; i++) {
        const idx = start + i;
        rows.push({
            fullName: `Student ${i + 1}`,
            studentLoginId: `${meta.loginPrefix}_${formatLoginSuffix(idx)}`,
            password: randomFourDigitPassword(),
            classId: meta.classId,
            sectionId: meta.sectionId,
            className: meta.className,
            classLabel: classLabelForDisplay({ name: meta.className, grade: meta.grade }),
            sectionName: meta.sectionName,
        });
    }
    return rows;
}
export async function buildRowsFromUpload(prisma, rows) {
    if (!rows.length || rows.length > 2000)
        throw new Error("Between 1 and 2000 rows required");
    const metaCache = new Map();
    const counters = new Map();
    const out = [];
    for (const r of rows) {
        const labelKey = `${r.class.trim().toLowerCase()}|${r.section.trim().toLowerCase()}`;
        let meta = metaCache.get(labelKey);
        if (!meta) {
            meta = await resolveOrCreateClassSection(prisma, r.class, r.section);
            metaCache.set(labelKey, meta);
        }
        const counterKey = `${meta.classId}|${meta.sectionId}`;
        if (!counters.has(counterKey)) {
            const max = await maxLoginIndexForPrefix(prisma, meta.loginPrefix);
            counters.set(counterKey, max);
        }
        const next = counters.get(counterKey) + 1;
        counters.set(counterKey, next);
        out.push({
            fullName: r.name.trim(),
            studentLoginId: `${meta.loginPrefix}_${formatLoginSuffix(next)}`,
            password: randomFourDigitPassword(),
            classId: meta.classId,
            sectionId: meta.sectionId,
            className: meta.className,
            classLabel: classLabelForDisplay({ name: meta.className, grade: meta.grade }),
            sectionName: meta.sectionName,
        });
    }
    return out;
}
function normHeader(s) {
    return s.trim().toLowerCase().replace(/[\s_]+/g, "");
}
/**
 * Parse first sheet of .xlsx / .xls / .csv into { name, class, section } rows.
 */
export function parseStudentSheetBuffer(buf) {
    const wb = XLSX.read(buf, { type: "buffer" });
    if (!wb.SheetNames.length)
        throw new Error("Empty workbook");
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const out = [];
    for (const raw of rawRows) {
        const mapped = new Map();
        for (const [k, v] of Object.entries(raw)) {
            mapped.set(normHeader(String(k)), String(v ?? "").trim());
        }
        const name = mapped.get("name") ?? mapped.get("fullname") ?? mapped.get("studentname") ?? "";
        const classVal = mapped.get("class") ?? mapped.get("grade") ?? "";
        const section = mapped.get("section") ?? mapped.get("sec") ?? "";
        if (!name && !classVal && !section)
            continue;
        if (!name || !classVal || !section) {
            throw new Error("Each data row must include Name, Class, and Section");
        }
        out.push({ name, class: classVal, section });
    }
    if (!out.length)
        throw new Error("No data rows found in file");
    return out;
}
export async function saveStudentAccounts(prisma, rows) {
    if (!rows.length || rows.length > 2000)
        throw new Error("Between 1 and 2000 students per save");
    let created = 0;
    let skipped = 0;
    const errors = [];
    for (const row of rows) {
        try {
            const exists = await prisma.user.findUnique({
                where: { studentLoginId: row.studentLoginId },
            });
            if (exists) {
                skipped++;
                errors.push(`Skipped (exists): ${row.studentLoginId}`);
                continue;
            }
            const passwordHash = await bcrypt.hash(row.password, 10);
            await prisma.user.create({
                data: {
                    studentLoginId: row.studentLoginId,
                    passwordHash,
                    role: "STUDENT",
                    student: {
                        create: {
                            fullName: row.fullName,
                            classId: row.classId,
                            sectionId: row.sectionId,
                        },
                    },
                },
            });
            created++;
        }
        catch (e) {
            skipped++;
            errors.push(`${row.studentLoginId}: ${String(e)}`);
        }
    }
    return { created, skipped, errors };
}
