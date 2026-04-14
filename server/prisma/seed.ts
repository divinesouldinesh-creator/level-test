import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { questionContentHash } from "../src/utils/questionHash.js";

const prisma = new PrismaClient();

type Q = [string, string, string, string, string, number];

async function ensureStudent(params: {
  loginId: string;
  fullName: string;
  classId: string;
  sectionId: string;
  passwordHash: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { studentLoginId: params.loginId },
    include: { student: true },
  });
  if (!existing) {
    await prisma.user.create({
      data: {
        studentLoginId: params.loginId,
        passwordHash: params.passwordHash,
        role: "STUDENT",
        student: {
          create: {
            fullName: params.fullName,
            classId: params.classId,
            sectionId: params.sectionId,
          },
        },
      },
    });
    return;
  }
  if (existing.student) {
    await prisma.student.update({
      where: { id: existing.student.id },
      data: {
        fullName: params.fullName,
        classId: params.classId,
        sectionId: params.sectionId,
      },
    });
  }
}

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  let adminUser = await prisma.user.findUnique({ where: { email: "admin@school.local" } });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: "admin@school.local",
        passwordHash,
        role: "ADMIN",
        admin: { create: { fullName: "School Admin" } },
      },
    });
  }

  const teacherSeeds = [
    { email: "teacher@school.local", fullName: "Demo Teacher" },
    { email: "kanchan@school.local", fullName: "Kanchan Yadav" },
    { email: "yogesh@school.local", fullName: "Yogesh" },
    { email: "asha@school.local", fullName: "Asha" },
  ];
  for (const t of teacherSeeds) {
    const existing = await prisma.user.findUnique({
      where: { email: t.email },
      include: { teacher: true },
    });
    if (!existing) {
      await prisma.user.create({
        data: {
          email: t.email,
          passwordHash,
          role: "TEACHER",
          teacher: { create: { fullName: t.fullName } },
        },
      });
      continue;
    }
    if (existing.role !== "TEACHER") continue;
    if (existing.teacher) {
      await prisma.teacher.update({
        where: { id: existing.teacher.id },
        data: { fullName: t.fullName },
      });
    } else {
      await prisma.teacher.create({
        data: { userId: existing.id, fullName: t.fullName },
      });
    }
  }

  const subject = await prisma.subject.upsert({
    where: { id: "seed-subject-math" },
    update: { name: "Basic Mathematics", code: "MATH" },
    create: {
      id: "seed-subject-math",
      name: "Basic Mathematics",
      code: "MATH",
    },
  });

  const levels = [
    { id: "seed-level-0", order: 0, name: "Level 0: Basic Calculations" },
    { id: "seed-level-1", order: 1, name: "Level 1: Fractions" },
    { id: "seed-level-2", order: 2, name: "Level 2: Decimals" },
    { id: "seed-level-3", order: 3, name: "Level 3: Shapes and Angles" },
    { id: "seed-level-4", order: 4, name: "Level 4: Mensuration" },
    { id: "seed-level-5", order: 5, name: "Level 5: Integers" },
  ];
  for (const lvl of levels) {
    await prisma.level.upsert({
      where: { id: lvl.id },
      update: { name: lvl.name, order: lvl.order, subjectId: subject.id },
      create: { id: lvl.id, name: lvl.name, order: lvl.order, subjectId: subject.id },
    });
    await prisma.levelTestConfig.upsert({
      where: { levelId: lvl.id },
      update: { questionCount: 8 },
      create: { levelId: lvl.id, questionCount: 8 },
    });
  }
  const level0 = levels[0];
  const level1 = levels[1];
  const level2 = levels[2];

  const class6 = await prisma.schoolClass.upsert({
    where: { id: "seed-class-6" },
    update: { name: "Class 6", grade: "6" },
    create: { id: "seed-class-6", name: "Class 6", grade: "6" },
  });

  const sec6A = await prisma.section.upsert({
    where: { id: "seed-sec-6a" },
    update: { name: "A", classId: class6.id },
    create: { id: "seed-sec-6a", classId: class6.id, name: "A" },
  });

  await prisma.classSubject.upsert({
    where: { classId_subjectId: { classId: class6.id, subjectId: subject.id } },
    update: {},
    create: { classId: class6.id, subjectId: subject.id },
  });

  const legacyBasicMathSubjectId = "seed-subject-basic-math";
  const legacyBasicMathLevel0Id = "seed-basic-math-level-0";
  const basicMathSubject = subject;
  const class7 = await prisma.schoolClass.upsert({
    where: { id: "seed-class-7" },
    update: { name: "Class 7", grade: "7" },
    create: { id: "seed-class-7", name: "Class 7", grade: "7" },
  });
  const sec7A = await prisma.section.upsert({
    where: { id: "seed-sec-7a" },
    update: { name: "A", classId: class7.id },
    create: { id: "seed-sec-7a", classId: class7.id, name: "A" },
  });
  await prisma.classSubject.upsert({
    where: { classId_subjectId: { classId: class7.id, subjectId: basicMathSubject.id } },
    update: {},
    create: { classId: class7.id, subjectId: basicMathSubject.id },
  });
  await prisma.level.updateMany({
    where: { id: legacyBasicMathLevel0Id },
    data: { subjectId: subject.id },
  });
  await prisma.topic.updateMany({
    where: { levelId: legacyBasicMathLevel0Id },
    data: { subjectId: subject.id, levelId: level0.id },
  });
  await prisma.question.updateMany({
    where: { levelId: legacyBasicMathLevel0Id },
    data: { subjectId: subject.id, levelId: level0.id },
  });
  await prisma.test.updateMany({
    where: { levelId: legacyBasicMathLevel0Id },
    data: { subjectId: subject.id, levelId: level0.id },
  });
  await prisma.studentProgress.updateMany({
    where: { levelId: legacyBasicMathLevel0Id },
    data: { subjectId: subject.id, levelId: level0.id },
  });
  await prisma.testAttempt.updateMany({
    where: { suggestedNextLevelId: legacyBasicMathLevel0Id },
    data: { suggestedNextLevelId: level0.id },
  });
  await prisma.levelTopicParticipation.deleteMany({
    where: { levelId: legacyBasicMathLevel0Id },
  });
  await prisma.levelTestConfig.deleteMany({
    where: { levelId: legacyBasicMathLevel0Id },
  });
  await prisma.level.deleteMany({
    where: { id: legacyBasicMathLevel0Id },
  });
  await prisma.classSubject.deleteMany({
    where: { classId: class7.id, subjectId: legacyBasicMathSubjectId },
  });

  const class6Students = [
    { loginId: "C6001", fullName: "ANNU" },
    { loginId: "C6002", fullName: "ANUJ VERMA" },
    { loginId: "C6003", fullName: "ARUN" },
    { loginId: "C6004", fullName: "BALAJI THAKUR" },
    { loginId: "C6005", fullName: "DEV" },
    { loginId: "C6006", fullName: "DIVYA/PARVEEN" },
    { loginId: "C6007", fullName: "GUNJAN" },
    { loginId: "C6008", fullName: "ISHANT" },
    { loginId: "C6009", fullName: "MAHI" },
    { loginId: "C6010", fullName: "NAMO KUMAR" },
    { loginId: "C6011", fullName: "NAVYA" },
    { loginId: "C6012", fullName: "POOJA" },
    { loginId: "C6013", fullName: "PRAGIYA SHARMA" },
    { loginId: "C6014", fullName: "RAMAN" },
    { loginId: "C6015", fullName: "RIDHI" },
    { loginId: "C6016", fullName: "RITI" },
    { loginId: "C6017", fullName: "RIYA/jitender" },
    { loginId: "C6018", fullName: "RIYA/santosh" },
    { loginId: "C6019", fullName: "SAKSHI/Sunny" },
    { loginId: "C6020", fullName: "SAKSHI/bhupender" },
    { loginId: "C6021", fullName: "SAMPURNA" },
    { loginId: "C6022", fullName: "SARAS" },
    { loginId: "C6023", fullName: "VANSH" },
    { loginId: "C6024", fullName: "YASHU" },
    { loginId: "C6025", fullName: "DEEPIKA" },
    { loginId: "C6026", fullName: "SHIVANI" },
    { loginId: "C6027", fullName: "MANIT" },
    { loginId: "C6028", fullName: "Gourav" },
    { loginId: "C6029", fullName: "Ananya" },
    { loginId: "C6030", fullName: "Paridhi" },
    { loginId: "C6031", fullName: "Anmol" },
  ];
  const allowedLoginIds = new Set(class6Students.map((s) => s.loginId));
  const existingClass6 = await prisma.student.findMany({
    where: { classId: class6.id },
    include: { user: true },
  });
  for (const row of existingClass6) {
    const loginId = row.user.studentLoginId ?? "";
    if (!allowedLoginIds.has(loginId)) {
      await prisma.user.delete({ where: { id: row.userId } });
    }
  }
  for (const s of class6Students) {
    await ensureStudent({
      loginId: s.loginId,
      fullName: s.fullName,
      classId: class6.id,
      sectionId: sec6A.id,
      passwordHash,
    });
  }

  const class7Students = [
    { loginId: "C7001", fullName: "AACHAL" },
    { loginId: "C7002", fullName: "AJIT" },
    { loginId: "C7003", fullName: "AKASH" },
    { loginId: "C7004", fullName: "ANANYA" },
    { loginId: "C7005", fullName: "ANANYA" },
    { loginId: "C7006", fullName: "ANGEL" },
    { loginId: "C7007", fullName: "ANJALI" },
    { loginId: "C7008", fullName: "ANNU" },
    { loginId: "C7009", fullName: "Annu" },
    { loginId: "C7010", fullName: "ANSHIKA" },
    { loginId: "C7011", fullName: "ANTIM" },
    { loginId: "C7012", fullName: "Ayush Mishra" },
    { loginId: "C7013", fullName: "CHELSHI" },
    { loginId: "C7014", fullName: "EKTA" },
    { loginId: "C7015", fullName: "GAJAL" },
    { loginId: "C7016", fullName: "HARSH" },
    { loginId: "C7017", fullName: "HEMANT" },
    { loginId: "C7018", fullName: "HIMANSHI (" },
    { loginId: "C7019", fullName: "HIMANSHI ( Indal )" },
    { loginId: "C7020", fullName: "KANIKA/Sompal" },
    { loginId: "C7021", fullName: "KANIKA/Surender" },
    { loginId: "C7022", fullName: "KARTIK" },
    { loginId: "C7023", fullName: "KESHAV" },
    { loginId: "C7024", fullName: "KUNJAN" },
    { loginId: "C7025", fullName: "MADHAV" },
    { loginId: "C7026", fullName: "Madhav" },
    { loginId: "C7027", fullName: "MAHI" },
    { loginId: "C7028", fullName: "MANISH" },
    { loginId: "C7029", fullName: "MUKUL YADAV" },
    { loginId: "C7030", fullName: "MUSKAN" },
    { loginId: "C7031", fullName: "NAKSH" },
    { loginId: "C7032", fullName: "NANCY" },
    { loginId: "C7033", fullName: "NIRAV" },
    { loginId: "C7034", fullName: "NIRUPAMA" },
    { loginId: "C7035", fullName: "NISHANT" },
    { loginId: "C7036", fullName: "NITIN" },
    { loginId: "C7037", fullName: "PARAS" },
    { loginId: "C7038", fullName: "PARV YADAV" },
    { loginId: "C7039", fullName: "PREET" },
    { loginId: "C7040", fullName: "PREET" },
    { loginId: "C7041", fullName: "PUNEET" },
    { loginId: "C7042", fullName: "Purab" },
    { loginId: "C7043", fullName: "PURVI" },
    { loginId: "C7044", fullName: "RIDHIMA" },
    { loginId: "C7045", fullName: "RIYA" },
    { loginId: "C7046", fullName: "RUDER" },
    { loginId: "C7047", fullName: "SANVI" },
    { loginId: "C7048", fullName: "SENJEET" },
    { loginId: "C7049", fullName: "TARUN" },
    { loginId: "C7050", fullName: "VAIBHAV" },
    { loginId: "C7051", fullName: "VIR" },
    { loginId: "C7052", fullName: "VIVEK" },
    { loginId: "C7053", fullName: "YASH" },
    { loginId: "C7054", fullName: "YATHIN YADAV" },
  ];
  const allowedLoginIdsClass7 = new Set(class7Students.map((s) => s.loginId));
  const existingClass7 = await prisma.student.findMany({
    where: { classId: class7.id },
    include: { user: true },
  });
  for (const row of existingClass7) {
    const loginId = row.user.studentLoginId ?? "";
    if (!allowedLoginIdsClass7.has(loginId)) {
      await prisma.user.delete({ where: { id: row.userId } });
    }
  }
  for (const s of class7Students) {
    await ensureStudent({
      loginId: s.loginId,
      fullName: s.fullName,
      classId: class7.id,
      sectionId: sec7A.id,
      passwordHash,
    });
  }

  // Cleanup old multi-section seed data to keep a single section setup.
  await prisma.section.deleteMany({ where: { id: { in: ["seed-sec-6b"] } } });
  await prisma.schoolClass.deleteMany({ where: { id: { in: ["seed-class-6a", "seed-class-6b"] } } });

  const topicDefs = [
    { id: "seed-l0-table-recall", name: "Table Recall" },
    { id: "seed-l0-addition", name: "Addition" },
    { id: "seed-l0-subtraction", name: "Subtraction" },
    { id: "seed-l0-mul-single", name: "Single Digit Multiplication" },
    { id: "seed-l0-mul-double", name: "Double Digit Multiplication" },
    { id: "seed-l0-div-simple", name: "Simple Division" },
    { id: "seed-l0-div-double", name: "Double Digit Division" },
    { id: "seed-l0-bodmas", name: "Mixed Operation (BODMAS)" },
  ];
  const topicDefsL1 = [
    { id: "seed-l1-simplify", name: "Simplifying Fractions" },
    { id: "seed-l1-compare", name: "Comparing Fractions" },
    { id: "seed-l1-add", name: "Fraction Addition" },
    { id: "seed-l1-sub", name: "Fraction Subtraction" },
    { id: "seed-l1-recip", name: "Reciprocal" },
    { id: "seed-l1-order", name: "Fraction Ordering" },
    { id: "seed-l1-between", name: "Fraction Between Two Numbers" },
    { id: "seed-l1-tf", name: "True/False Fraction Comparison" },
  ];
  const topicDefsL2 = [
    { id: "seed-l2-add", name: "Decimal Addition" },
    { id: "seed-l2-sub", name: "Decimal Subtraction" },
    { id: "seed-l2-f2d", name: "Fraction to Decimal Conversion" },
    { id: "seed-l2-d2f", name: "Decimal to Fraction Conversion" },
    { id: "seed-l2-compare", name: "Decimal Comparison" },
    { id: "seed-l2-mul", name: "Decimal Multiplication" },
    { id: "seed-l2-div", name: "Decimal Division" },
    { id: "seed-l2-between", name: "Decimal Between Two Numbers" },
  ];
  const topicDefsClass7L0 = [
    { id: "seed-c7-l0-table-recall", name: "Table Recall" },
    { id: "seed-c7-l0-addition", name: "Addition" },
    { id: "seed-c7-l0-subtraction", name: "Subtraction" },
    { id: "seed-c7-l0-mul-single", name: "Single Digit Multiplication" },
    { id: "seed-c7-l0-mul-double", name: "Double Digit Multiplication" },
    { id: "seed-c7-l0-div-simple", name: "Simple Division" },
    { id: "seed-c7-l0-div-double", name: "Double Digit Division" },
    { id: "seed-c7-l0-bodmas", name: "Mixed Operation (BODMAS)" },
  ];
  const allTopicDefs = [
    ...topicDefs.map((t) => ({ ...t, levelId: level0.id })),
    ...topicDefsL1.map((t) => ({ ...t, levelId: level1.id })),
    ...topicDefsL2.map((t) => ({ ...t, levelId: level2.id })),
    ...topicDefsClass7L0.map((t) => ({ ...t, levelId: level0.id })),
  ];
  for (const t of allTopicDefs) {
    await prisma.topic.upsert({
      where: { id: t.id },
      update: {
        name: t.name,
        subjectId: subject.id,
        levelId: t.levelId,
      },
      create: {
        id: t.id,
        name: t.name,
        subjectId: subject.id,
        levelId: t.levelId,
      },
    });
  }

  for (const lvl of [level0, level1, level2]) {
    const lvlTopics = allTopicDefs.filter((t) => t.levelId === lvl.id);
    await prisma.levelTopicParticipation.deleteMany({ where: { levelId: lvl.id } });
    for (let i = 0; i < lvlTopics.length; i++) {
      await prisma.levelTopicParticipation.create({
        data: {
          levelId: lvl.id,
          topicId: lvlTopics[i].id,
          quota: 1,
          sortOrder: i,
        },
      });
    }
  }

  const questionBank: Record<string, Q[]> = {
    "seed-l0-table-recall": [
      ["13 × 6 = ?", "68", "78", "88", "98", 1],
      ["14 × 7 = ?", "88", "98", "108", "118", 1],
      ["15 × 8 = ?", "110", "120", "130", "140", 1],
      ["16 × 9 = ?", "134", "144", "154", "164", 1],
      ["17 × 6 = ?", "92", "102", "112", "122", 1],
      ["18 × 7 = ?", "116", "126", "136", "146", 1],
      ["19 × 8 = ?", "142", "152", "162", "172", 1],
      ["13 × 9 = ?", "107", "117", "127", "137", 1],
      ["14 × 6 = ?", "74", "84", "94", "104", 1],
      ["15 × 7 = ?", "95", "105", "115", "125", 1],
    ],
    "seed-l0-addition": [
      ["4,327 + 1,586 = ?", "5,803", "5,913", "5,923", "5,933", 1],
      ["2,145 + 3,278 = ?", "5,423", "5,313", "5,523", "5,223", 0],
      ["5,682 + 2,417 = ?", "8,099", "8,089", "8,109", "8,999", 0],
      ["1,938 + 4,256 = ?", "6,184", "6,194", "6,294", "6,104", 1],
      ["3,764 + 2,189 = ?", "5,953", "5,943", "5,963", "5,853", 0],
      ["4,876 + 3,214 = ?", "8,090", "8,080", "8,190", "8,000", 0],
      ["2,999 + 1,502 = ?", "4,401", "4,501", "4,511", "4,601", 1],
      ["6,134 + 2,765 = ?", "8,899", "8,799", "8,999", "8,889", 0],
      ["3,285 + 4,716 = ?", "8,101", "8,001", "7,901", "8,201", 1],
      ["1,457 + 5,328 = ?", "6,685", "6,795", "6,785", "6,885", 2],
    ],
    "seed-l0-subtraction": [
      ["8,402 − 3,178 = ?", "5,224", "5,324", "5,214", "5,124", 0],
      ["7,650 − 2,489 = ?", "5,151", "5,161", "5,261", "5,061", 1],
      ["9,001 − 4,999 = ?", "4,002", "4,012", "4,102", "4,001", 0],
      ["6,730 − 2,845 = ?", "3,895", "3,885", "3,985", "3,875", 1],
      ["8,120 − 3,456 = ?", "4,654", "4,764", "4,664", "4,554", 2],
      ["7,000 − 2,999 = ?", "4,001", "4,101", "4,011", "4,000", 0],
      ["9,876 − 5,432 = ?", "4,344", "4,444", "4,454", "4,244", 1],
      ["5,500 − 2,775 = ?", "2,825", "2,725", "2,735", "2,625", 1],
      ["8,888 − 4,444 = ?", "4,344", "4,444", "4,544", "4,434", 1],
      ["6,101 − 2,987 = ?", "3,114", "3,124", "3,214", "3,104", 0],
    ],
    "seed-l0-mul-single": [
      ["36 × 8 = ?", "278", "288", "298", "268", 1],
      ["54 × 6 = ?", "324", "314", "334", "344", 0],
      ["72 × 5 = ?", "350", "360", "370", "340", 1],
      ["49 × 7 = ?", "333", "343", "353", "363", 1],
      ["64 × 4 = ?", "246", "256", "266", "276", 1],
      ["83 × 3 = ?", "249", "239", "259", "269", 0],
      ["57 × 8 = ?", "446", "456", "466", "476", 1],
      ["91 × 5 = ?", "445", "455", "465", "475", 1],
      ["68 × 6 = ?", "398", "408", "418", "428", 1],
      ["75 × 4 = ?", "290", "300", "310", "320", 1],
    ],
    "seed-l0-mul-double": [
      ["24 × 13 = ?", "312", "322", "332", "342", 0],
      ["18 × 15 = ?", "260", "270", "280", "290", 1],
      ["32 × 12 = ?", "374", "384", "394", "404", 1],
      ["27 × 14 = ?", "368", "378", "388", "398", 1],
      ["21 × 16 = ?", "326", "336", "346", "356", 1],
      ["35 × 11 = ?", "375", "385", "395", "405", 1],
      ["28 × 13 = ?", "354", "364", "374", "384", 1],
      ["19 × 17 = ?", "313", "323", "333", "343", 1],
      ["34 × 12 = ?", "398", "408", "418", "428", 1],
      ["23 × 14 = ?", "312", "322", "332", "342", 1],
    ],
    "seed-l0-div-simple": [
      ["972 ÷ 9 = ?", "108", "118", "98", "88", 0],
      ["756 ÷ 7 = ?", "108", "118", "98", "128", 0],
      ["648 ÷ 6 = ?", "118", "108", "98", "88", 1],
      ["945 ÷ 9 = ?", "95", "105", "115", "125", 1],
      ["832 ÷ 8 = ?", "104", "114", "94", "124", 0],
      ["924 ÷ 7 = ?", "122", "132", "142", "152", 1],
      ["864 ÷ 9 = ?", "96", "86", "106", "76", 0],
      ["777 ÷ 7 = ?", "111", "101", "121", "131", 0],
      ["936 ÷ 8 = ?", "117", "127", "107", "137", 0],
      ["999 ÷ 9 = ?", "101", "111", "121", "131", 1],
    ],
    "seed-l0-div-double": [
      ["960 ÷ 12 = ?", "70", "80", "90", "100", 1],
      ["1,116 ÷ 12 = ?", "83", "93", "103", "113", 1],
      ["1,224 ÷ 12 = ?", "92", "102", "112", "122", 1],
      ["1,320 ÷ 12 = ?", "100", "110", "120", "130", 1],
      ["1,440 ÷ 12 = ?", "110", "120", "130", "140", 1],
      ["1,008 ÷ 14 = ?", "62", "72", "82", "92", 1],
      ["936 ÷ 12 = ?", "68", "78", "88", "98", 1],
      ["1,560 ÷ 12 = ?", "120", "130", "140", "150", 1],
      ["1,200 ÷ 15 = ?", "70", "80", "90", "100", 1],
      ["1,344 ÷ 12 = ?", "102", "112", "122", "132", 1],
    ],
    "seed-l0-bodmas": [
      ["12 + 6 × 3 − 4 = ?", "22", "26", "30", "18", 1],
      ["20 − 8 ÷ 2 + 5 = ?", "21", "19", "17", "15", 0],
      ["7 × 4 + 10 − 6 = ?", "22", "30", "32", "28", 2],
      ["18 + 12 ÷ 3 − 2 = ?", "18", "20", "22", "24", 1],
      ["25 − 3 × 4 + 2 = ?", "15", "13", "17", "19", 0],
      ["6 × 5 − 8 + 3 = ?", "23", "25", "27", "29", 1],
      ["30 ÷ 5 + 7 × 2 = ?", "18", "20", "22", "24", 1],
      ["16 − 4 + 3 × 5 = ?", "27", "23", "19", "15", 0],
      ["9 + 8 × 2 − 5 = ?", "18", "20", "22", "24", 1],
      ["40 ÷ 4 + 6 − 3 = ?", "11", "12", "13", "14", 2],
    ],
  };

  const questionBankExtra: Record<string, Q[]> = {
    "seed-c7-l0-table-recall": [
      ["13 × 6 = ?", "68", "78", "88", "98", 1],
      ["14 × 7 = ?", "88", "98", "108", "118", 1],
      ["15 × 8 = ?", "110", "120", "130", "140", 1],
      ["16 × 9 = ?", "134", "144", "154", "164", 1],
      ["17 × 6 = ?", "92", "102", "112", "122", 1],
      ["18 × 7 = ?", "116", "126", "136", "146", 1],
      ["19 × 8 = ?", "142", "152", "162", "172", 1],
      ["13 × 9 = ?", "107", "117", "127", "137", 1],
      ["14 × 6 = ?", "74", "84", "94", "104", 1],
      ["15 × 7 = ?", "95", "105", "115", "125", 1],
    ],
    "seed-c7-l0-addition": [
      ["4,327 + 1,586 = ?", "5,803", "5,913", "5,923", "5,933", 1],
      ["2,145 + 3,278 = ?", "5,423", "5,313", "5,523", "5,223", 0],
      ["5,682 + 2,417 = ?", "8,099", "8,089", "8,109", "8,999", 0],
      ["1,938 + 4,256 = ?", "6,184", "6,194", "6,294", "6,104", 1],
      ["3,764 + 2,189 = ?", "5,953", "5,943", "5,963", "5,853", 0],
      ["4,876 + 3,214 = ?", "8,090", "8,080", "8,190", "8,000", 0],
      ["2,999 + 1,502 = ?", "4,401", "4,501", "4,511", "4,601", 1],
      ["6,134 + 2,765 = ?", "8,899", "8,799", "8,999", "8,889", 0],
      ["3,285 + 4,716 = ?", "8,101", "8,001", "7,901", "8,201", 1],
      ["1,457 + 5,328 = ?", "6,685", "6,795", "6,785", "6,885", 2],
    ],
    "seed-c7-l0-subtraction": [
      ["8,402 − 3,178 = ?", "5,224", "5,324", "5,214", "5,124", 0],
      ["7,650 − 2,489 = ?", "5,151", "5,161", "5,261", "5,061", 1],
      ["9,001 − 4,999 = ?", "4,002", "4,012", "4,102", "4,001", 0],
      ["6,730 − 2,845 = ?", "3,895", "3,885", "3,985", "3,875", 1],
      ["8,120 − 3,456 = ?", "4,654", "4,764", "4,664", "4,554", 2],
      ["7,000 − 2,999 = ?", "4,001", "4,101", "4,011", "4,000", 0],
      ["9,876 − 5,432 = ?", "4,344", "4,444", "4,454", "4,244", 1],
      ["5,500 − 2,775 = ?", "2,825", "2,725", "2,735", "2,625", 1],
      ["8,888 − 4,444 = ?", "4,344", "4,444", "4,544", "4,434", 1],
      ["6,101 − 2,987 = ?", "3,114", "3,124", "3,214", "3,104", 0],
    ],
    "seed-c7-l0-mul-single": [
      ["3,248 × 6 = ______", "19,388", "19,488", "19,588", "19,688", 1],
      ["4,125 × 8 = ______", "32,900", "33,000", "33,100", "33,200", 1],
      ["2,764 × 9 = ______", "24,776", "24,876", "24,976", "25,076", 1],
      ["5,432 × 4 = ______", "21,628", "21,728", "21,828", "21,928", 1],
      ["6,105 × 7 = ______", "42,635", "42,735", "42,835", "42,935", 1],
      ["3,908 × 5 = ______", "19,440", "19,540", "19,640", "19,740", 1],
      ["7,124 × 3 = ______", "21,272", "21,372", "21,472", "21,572", 1],
      ["8,236 × 6 = ______", "49,316", "49,416", "49,516", "49,616", 1],
      ["4,567 × 8 = ______", "36,436", "36,536", "36,636", "36,736", 1],
      ["2,999 × 7 = ______", "20,893", "20,993", "21,093", "21,193", 1],
      ["5,678 × 4 = ______", "22,612", "22,712", "22,812", "22,912", 1],
      ["3,456 × 9 = ______", "30,904", "31,004", "31,104", "31,204", 1],
      ["6,789 × 5 = ______", "33,845", "33,945", "34,045", "34,145", 1],
      ["4,321 × 6 = ______", "25,826", "25,926", "26,026", "26,126", 1],
      ["7,654 × 3 = ______", "22,862", "22,962", "23,062", "23,162", 1],
      ["9,876 × 2 = ______", "19,652", "19,752", "19,852", "19,952", 1],
      ["2,345 × 8 = ______", "18,660", "18,760", "18,860", "18,960", 1],
      ["5,432 × 7 = ______", "37,924", "38,024", "38,124", "38,224", 1],
      ["8,765 × 4 = ______", "34,960", "35,060", "35,160", "35,260", 1],
      ["6,543 × 9 = ______", "58,787", "58,887", "58,987", "59,087", 1],
    ],
    "seed-c7-l0-mul-double": [
      ["124 × 56 = ______", "6,844", "6,944", "7,044", "7,144", 1],
      ["215 × 64 = ______", "13,660", "13,760", "13,860", "13,960", 1],
      ["348 × 75 = ______", "25,900", "26,000", "26,100", "26,200", 2],
      ["427 × 58 = ______", "24,666", "24,766", "24,866", "24,966", 1],
      ["562 × 67 = ______", "37,554", "37,654", "37,754", "37,854", 1],
      ["639 × 54 = ______", "34,406", "34,506", "34,606", "34,706", 1],
      ["781 × 62 = ______", "48,322", "48,422", "48,522", "48,622", 1],
      ["854 × 73 = ______", "62,242", "62,342", "62,442", "62,542", 1],
      ["916 × 81 = ______", "74,096", "74,196", "74,296", "74,396", 1],
      ["243 × 95 = ______", "22,985", "23,085", "23,185", "23,285", 1],
      ["378 × 66 = ______", "24,848", "24,948", "25,048", "25,148", 1],
      ["495 × 57 = ______", "28,115", "28,215", "28,315", "28,415", 1],
      ["628 × 74 = ______", "46,372", "46,472", "46,572", "46,672", 1],
      ["742 × 59 = ______", "43,678", "43,778", "43,878", "43,978", 1],
      ["863 × 68 = ______", "58,584", "58,684", "58,784", "58,884", 1],
      ["934 × 76 = ______", "70,884", "70,984", "71,084", "71,184", 1],
      ["157 × 82 = ______", "12,774", "12,874", "12,974", "13,074", 1],
      ["286 × 65 = ______", "18,490", "18,590", "18,690", "18,790", 1],
      ["519 × 72 = ______", "37,268", "37,368", "37,468", "37,568", 1],
      ["674 × 83 = ______", "55,842", "55,942", "56,042", "56,142", 1],
    ],
    "seed-c7-l0-div-simple": [
      ["924 ÷ 12 = ______", "67", "77", "87", "97", 1],
      ["1,056 ÷ 16 = ______", "56", "66", "76", "86", 1],
      ["1,248 ÷ 13 = ______", "86", "96", "106", "116", 1],
      ["1,092 ÷ 14 = ______", "58", "68", "78", "88", 2],
      ["864 ÷ 18 = ______", "38", "48", "58", "68", 1],
      ["1,260 ÷ 15 = ______", "74", "84", "94", "104", 1],
      ["1,350 ÷ 15 = ______", "70", "80", "90", "100", 2],
      ["1,152 ÷ 18 = ______", "54", "64", "74", "84", 1],
      ["1,404 ÷ 18 = ______", "58", "68", "78", "88", 2],
      ["1,296 ÷ 16 = ______", "61", "71", "81", "91", 2],
      ["1,560 ÷ 12 = ______", "120", "130", "140", "150", 1],
      ["1,188 ÷ 12 = ______", "89", "99", "109", "119", 1],
      ["1,008 ÷ 12 = ______", "74", "84", "94", "104", 1],
      ["1,872 ÷ 18 = ______", "94", "104", "114", "124", 1],
      ["1,540 ÷ 20 = ______", "57", "67", "77", "87", 2],
      ["1,344 ÷ 16 = ______", "74", "84", "94", "104", 1],
      ["1,620 ÷ 18 = ______", "70", "80", "90", "100", 2],
      ["1,425 ÷ 15 = ______", "75", "85", "95", "105", 2],
      ["1,776 ÷ 12 = ______", "128", "138", "148", "158", 2],
      ["1,680 ÷ 20 = ______", "64", "74", "84", "94", 2],
    ],
    "seed-c7-l0-div-double": [
      ["1,728 ÷ 24 = ______", "62", "72", "82", "92", 1],
      ["2,160 ÷ 30 = ______", "62", "72", "82", "92", 1],
      ["1,944 ÷ 27 = ______", "62", "72", "82", "92", 1],
      ["2,304 ÷ 32 = ______", "62", "72", "82", "92", 1],
      ["1,680 ÷ 24 = ______", "60", "70", "80", "90", 1],
      ["2,016 ÷ 28 = ______", "62", "72", "82", "92", 1],
      ["1,872 ÷ 26 = ______", "62", "72", "82", "92", 1],
      ["2,340 ÷ 36 = ______", "55", "65", "75", "85", 1],
      ["2,592 ÷ 36 = ______", "62", "72", "82", "92", 1],
      ["1,536 ÷ 24 = ______", "54", "64", "74", "84", 1],
      ["2,160 ÷ 27 = ______", "60", "70", "80", "90", 2],
      ["1,848 ÷ 28 = ______", "56", "66", "76", "86", 1],
      ["2,232 ÷ 31 = ______", "62", "72", "82", "92", 1],
      ["2,520 ÷ 35 = ______", "62", "72", "82", "92", 1],
      ["1,764 ÷ 21 = ______", "64", "74", "84", "94", 2],
      ["2,016 ÷ 24 = ______", "64", "74", "84", "94", 2],
      ["2,304 ÷ 36 = ______", "54", "64", "74", "84", 1],
      ["1,950 ÷ 30 = ______", "55", "65", "75", "85", 1],
      ["2,736 ÷ 38 = ______", "62", "72", "82", "92", 1],
      ["2,592 ÷ 32 = ______", "71", "81", "91", "101", 1],
    ],
    "seed-c7-l0-bodmas": [
      ["(800 − 16) × 2 = ______", "1,468", "1,568", "1,668", "1,768", 1],
      ["900 ÷ (3 + 6) = ______", "90", "100", "110", "120", 1],
      ["(700 − 200) ÷ 5 = ______", "80", "90", "100", "110", 2],
      ["100 + (18 × 5) − 40 = ______", "140", "150", "160", "170", 1],
      ["(480 ÷ 6) + (20 × 4) = ______", "140", "150", "160", "170", 2],
      ["250 + (90 ÷ 3) − 40 = ______", "220", "230", "240", "250", 2],
      ["(600 − 15) × 2 = ______", "1,070", "1,170", "1,270", "1,370", 1],
      ["50 + (8 × 9) − 20 = ______", "92", "102", "112", "122", 1],
      ["720 ÷ (8 + 1) = ______", "70", "80", "90", "100", 1],
      ["(900 − 24) ÷ 4 = ______", "199", "209", "219", "229", 2],
      ["150 + (12 × 6) − 30 = ______", "182", "192", "202", "212", 1],
      ["640 ÷ (8 + 8) = ______", "30", "40", "50", "60", 1],
      ["(300 − 180) + 50 = ______", "160", "170", "180", "190", 1],
      ["100 + (200 ÷ 4) − 25 = ______", "115", "125", "135", "145", 1],
      ["(420 ÷ 7) + (15 × 4) = ______", "100", "110", "120", "130", 2],
      ["700 − (50 × 8 ÷ 10) = ______", "650", "660", "670", "680", 1],
      ["90 + (6 × 8) − 30 = ______", "98", "108", "118", "128", 1],
      ["(560 ÷ 7) + (12 × 5) = ______", "130", "140", "150", "160", 1],
      ["450 − (15 × 12) = ______", "260", "270", "280", "290", 1],
      ["80 + (120 ÷ 6 × 2) = ______", "110", "120", "130", "140", 1],
    ],
    "seed-l1-simplify": [
      ["Simplify: 54/72 = ______", "2/3", "3/4", "4/5", "5/6", 0],
      ["Simplify: 63/84 = ______", "2/3", "3/4", "4/5", "5/6", 1],
      ["Simplify: 56/70 = ______", "2/3", "3/4", "4/5", "5/6", 2],
      ["Simplify: 60/90 = ______", "1/2", "2/3", "3/4", "4/5", 1],
      ["Simplify: 91/104 = ______", "5/6", "6/7", "7/8", "8/9", 2],
    ],
    "seed-l1-compare": [
      ["Compare: 7/9 ___ 5/6", ">", "<", "=", "Cannot say", 1],
      ["Compare: 11/12 ___ 7/8", ">", "<", "=", "Cannot say", 0],
      ["Compare: 9/10 ___ 5/6", ">", "<", "=", "Cannot say", 0],
      ["Compare: 9/16 ___ 5/9", ">", "<", "=", "Cannot say", 0],
      ["Compare: 15/18 ___ 4/5", ">", "<", "=", "Cannot say", 0],
    ],
    "seed-l1-add": [
      ["5/12 + 7/18 = ______", "29/36", "31/36", "33/36", "35/36", 0],
      ["7/15 + 2/5 = ______", "11/15", "12/15", "13/15", "14/15", 2],
      ["5/6 + 7/12 = ______", "15/12", "16/12", "17/12", "18/12", 2],
      ["11/20 + 7/15 = ______", "59/60", "61/60", "63/60", "65/60", 1],
      ["13/16 + 3/8 = ______", "17/16", "18/16", "19/16", "20/16", 2],
    ],
    "seed-l1-sub": [
      ["7/8 − 1/4 = ______", "3/8", "4/8", "5/8", "6/8", 2],
      ["5/6 − 1/3 = ______", "1/6", "2/6", "3/6", "4/6", 2],
      ["13/16 − 1/8 = ______", "9/16", "10/16", "11/16", "12/16", 2],
      ["17/20 − 3/10 = ______", "9/20", "10/20", "11/20", "12/20", 2],
      ["13/15 − 1/3 = ______", "6/15", "7/15", "8/15", "9/15", 2],
    ],
    "seed-l1-recip": [
      ["Write the reciprocal of 7/9 = ______", "9/7", "7/9", "1/7", "1/9", 0],
      ["Write the reciprocal of 11/13 = ______", "11/13", "13/11", "1/11", "1/13", 1],
      ["Write the reciprocal of 8/15 = ______", "15/8", "8/15", "1/8", "1/15", 0],
      ["Write the reciprocal of 12/7 = ______", "7/12", "12/7", "1/12", "1/7", 0],
      ["Write the reciprocal of 21/5 = ______", "5/21", "21/5", "1/21", "1/5", 0],
    ],
    "seed-l1-order": [
      ["Arrange in ascending order: 3/4, 2/3, 5/6", "2/3, 3/4, 5/6", "3/4, 2/3, 5/6", "5/6, 3/4, 2/3", "2/3, 5/6, 3/4", 0],
      ["Arrange in descending order: 5/8, 3/4, 2/3", "2/3, 5/8, 3/4", "5/8, 2/3, 3/4", "3/4, 2/3, 5/8", "3/4, 5/8, 2/3", 2],
      ["Arrange in descending order: 11/12, 5/6, 3/4", "11/12, 5/6, 3/4", "3/4, 5/6, 11/12", "5/6, 3/4, 11/12", "3/4, 11/12, 5/6", 0],
      ["Arrange in ascending order: 9/16, 2/3, 5/8", "9/16, 5/8, 2/3", "5/8, 9/16, 2/3", "2/3, 5/8, 9/16", "9/16, 2/3, 5/8", 0],
      ["Arrange in descending order: 4/11, 3/5, 7/8", "4/11, 3/5, 7/8", "3/5, 4/11, 7/8", "7/8, 3/5, 4/11", "4/11, 7/8, 3/5", 2],
    ],
    "seed-l1-between": [
      ["Write one fraction between 1/3 and 2/3 = ______", "1/4", "1/2", "3/4", "5/6", 1],
      ["Write one fraction between 2/5 and 4/5 = ______", "1/2", "2/3", "5/6", "1", 1],
      ["Write one fraction between 1/6 and 1/2 = ______", "1/3", "2/3", "3/4", "5/6", 0],
      ["Write one fraction between 5/8 and 7/8 = ______", "3/4", "6/8", "7/10", "8/8", 1],
      ["Write one fraction between 3/4 and 1 = ______", "4/5", "5/6", "7/8", "9/10", 2],
    ],
    "seed-l1-tf": [
      ["True or False: 3/4 > 2/3", "True", "False", "Equal", "Cannot say", 0],
      ["True or False: 7/10 > 4/5", "True", "False", "Equal", "Cannot say", 1],
      ["True or False: 9/12 = 3/4", "True", "False", "Cannot say", "Equal only sometimes", 0],
      ["True or False: 1/4 > 1/3", "True", "False", "Equal", "Cannot say", 1],
      ["True or False: 7/9 < 8/9", "True", "False", "Equal", "Cannot say", 0],
    ],
    "seed-l2-add": [
      ["0.4 + 0.275 = ______", "0.575", "0.675", "0.775", "0.875", 1],
      ["0.8 + 0.125 = ______", "0.825", "0.925", "1.025", "1.125", 1],
      ["1.2 + 0.65 = ______", "1.75", "1.85", "1.95", "2.05", 1],
      ["1.05 + 0.95 = ______", "1.90", "2.00", "2.10", "2.20", 1],
      ["1.08 + 0.92 = ______", "1.80", "1.90", "2.00", "2.10", 2],
    ],
    "seed-l2-sub": [
      ["1.35 − 0.48 = ______", "0.77", "0.87", "0.97", "1.07", 1],
      ["2.40 − 0.75 = ______", "1.55", "1.65", "1.75", "1.85", 1],
      ["3.25 − 1.48 = ______", "1.67", "1.77", "1.87", "1.97", 1],
      ["5.00 − 2.85 = ______", "2.05", "2.15", "2.25", "2.35", 1],
      ["6.25 − 4.75 = ______", "1.40", "1.50", "1.60", "1.70", 1],
    ],
    "seed-l2-f2d": [
      ["Convert 1/2 into decimal = ______", "0.25", "0.50", "0.75", "1.00", 1],
      ["Convert 3/4 into decimal = ______", "0.25", "0.50", "0.75", "1.25", 2],
      ["Convert 1/8 into decimal = ______", "0.125", "0.250", "0.375", "0.500", 0],
      ["Convert 11/20 into decimal = ______", "0.45", "0.55", "0.65", "0.75", 1],
      ["Convert 19/20 into decimal = ______", "0.75", "0.85", "0.95", "1.05", 2],
    ],
    "seed-l2-d2f": [
      ["Convert 0.25 into fraction (simplest form) = ______", "1/2", "1/3", "1/4", "1/5", 2],
      ["Convert 0.75 into fraction (simplest form) = ______", "1/2", "2/3", "3/4", "4/5", 2],
      ["Convert 0.125 into fraction (simplest form) = ______", "1/4", "1/8", "1/16", "1/32", 1],
      ["Convert 0.65 into fraction (simplest form) = ______", "11/20", "12/20", "13/20", "14/20", 2],
      ["Convert 0.16 into fraction (simplest form) = ______", "1/25", "2/25", "3/25", "4/25", 3],
    ],
    "seed-l2-compare": [
      ["Compare: 0.5 ___ 1/2", ">", "<", "=", "Cannot say", 2],
      ["Compare: 0.6 ___ 2/3", ">", "<", "=", "Cannot say", 1],
      ["Compare: 0.9 ___ 7/8", ">", "<", "=", "Cannot say", 0],
      ["Compare: 0.875 ___ 7/8", ">", "<", "=", "Cannot say", 2],
      ["Compare: 0.84 ___ 5/6", ">", "<", "=", "Cannot say", 0],
    ],
    "seed-l2-mul": [
      ["2.45 × 0.6 = ______", "1.27", "1.47", "1.67", "1.87", 1],
      ["3.84 × 0.25 = ______", "0.86", "0.96", "1.06", "1.16", 1],
      ["8.75 × 0.2 = ______", "1.55", "1.65", "1.75", "1.85", 2],
      ["5.35 × 0.6 = ______", "3.01", "3.11", "3.21", "3.31", 2],
      ["8.32 × 0.5 = ______", "4.06", "4.16", "4.26", "4.36", 1],
    ],
    "seed-l2-div": [
      ["3.6 ÷ 0.3 = ______", "10", "11", "12", "13", 2],
      ["4.84 ÷ 0.4 = ______", "10.1", "11.1", "12.1", "13.1", 2],
      ["8.75 ÷ 0.7 = ______", "11.5", "12.5", "13.5", "14.5", 1],
      ["5.84 ÷ 0.7 = ______", "7.34", "8.34", "9.34", "10.34", 1],
      ["6.63 ÷ 0.3 = ______", "20.1", "21.1", "22.1", "23.1", 2],
    ],
    "seed-l2-between": [
      ["Write the decimal between 0.4 and 0.5 = ______", "0.35", "0.45", "0.55", "0.65", 1],
      ["Write the decimal between 1.2 and 1.3 = ______", "1.15", "1.25", "1.35", "1.45", 1],
      ["Write the decimal between 2.75 and 2.85 = ______", "2.70", "2.80", "2.90", "3.00", 1],
      ["Write the decimal between 0.62 and 0.72 = ______", "0.67", "0.77", "0.57", "0.82", 0],
      ["Write the decimal between 1.82 and 1.92 = ______", "1.77", "1.87", "1.97", "2.07", 1],
    ],
  };

  const mergedBank: Record<string, Q[]> = { ...questionBank, ...questionBankExtra };
  for (const t of allTopicDefs) {
    const rows = mergedBank[t.id] ?? [];
    for (const [stem, a, b, c, d, correct] of rows) {
      const contentHash = questionContentHash(t.id, stem, correct);
      const exists = await prisma.question.findUnique({ where: { contentHash } });
      if (exists) continue;
      await prisma.question.create({
        data: {
          subjectId: subject.id,
          levelId: t.levelId,
          topicId: t.id,
          stem,
          optionA: a,
          optionB: b,
          optionC: c,
          optionD: d,
          correctOption: correct,
          difficulty: "MEDIUM",
          contentHash,
          createdById: adminUser.id,
        },
      });
    }
  }

  console.log("Seed OK:", {
    admin: "admin@school.local / password123",
    teacher: "teacher@school.local / password123",
    students: "STU001 and STU002 / password123",
    classMap:
      "Class 6 (A) -> Basic Mathematics (Levels 0, 1, 2) and Class 7 (A) -> Basic Mathematics (Level 0) loaded",
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
