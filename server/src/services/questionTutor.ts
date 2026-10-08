import { z } from "zod";

const explanationSchema = z.object({
  idea: z.string().trim().min(1).max(900),
  whyMissed: z.string().trim().min(1).max(900),
  whyCorrect: z.string().trim().min(1).max(900),
});

export type QuestionHelp = z.infer<typeof explanationSchema>;

export class TutorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutorConfigError";
  }
}

export class TutorUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutorUpstreamError";
  }
}

export type MissedQuestionBrief = {
  grade: string | null;
  className: string;
  subjectName: string;
  levelName: string | null;
  levelOrder: number | null;
  topicName: string;
  difficulty: string;
  type: string;
  stem: string;
  hasDiagram: boolean;
  options: string[];
  studentAnswer: string;
  correctAnswer: string;
};

export type TutorFollowUp = { question: string; reply: string };

export type QuestionHelpThread = QuestionHelp & { followUps: TutorFollowUp[] };

const followUpReplySchema = z.object({
  reply: z.string().trim().min(1).max(1200),
});

const OPTION_LABELS = ["A", "B", "C", "D"];
const tutorHits = new Map<string, number[]>();
const TUTOR_WINDOW_MS = 60 * 60 * 1000;
const TUTOR_MAX_PER_WINDOW = 30;
export const TUTOR_MAX_FOLLOW_UPS = 4;

/** Counts a new tutor call. Cached repeats should not call this. */
export function takeTutorSlot(studentId: string): boolean {
  const now = Date.now();
  const recent = (tutorHits.get(studentId) ?? []).filter((at) => now - at < TUTOR_WINDOW_MS);
  if (recent.length >= TUTOR_MAX_PER_WINDOW) {
    tutorHits.set(studentId, recent);
    return false;
  }
  recent.push(now);
  tutorHits.set(studentId, recent);
  return true;
}

export function formatOptionAnswer(options: string[], index: number | null | undefined): string {
  if (index == null || index < 0 || index >= options.length) return "Left blank";
  const label = OPTION_LABELS[index] ?? String(index + 1);
  return `${label}. ${options[index]}`;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function studentClassLabel(brief: MissedQuestionBrief): string {
  return brief.grade?.trim() || brief.className;
}

function levelLine(brief: MissedQuestionBrief): string {
  const grade = studentClassLabel(brief);
  const level =
    brief.levelName != null
      ? `${brief.levelName}${brief.levelOrder != null ? ` (order ${brief.levelOrder})` : ""}`
      : "chapter test, no separate level";
  return `Teach a student in class ${grade}. Subject: ${brief.subjectName}. Level: ${level}. Topic: ${brief.topicName}. Difficulty: ${brief.difficulty}. Write every sentence so a ${grade} student can follow it.`;
}

function simpleLanguageRules(): string {
  return [
    "Speak as their class teacher, not as a textbook or an exam coach for older students.",
    "Use everyday words. If a school term is needed, say what it means in one short phrase.",
    "One idea per sentence. Prefer short sentences.",
    "Do not use jargon, advanced proofs, or extra topics they have not reached.",
    "Classes 1-5: very simple words, like talking to a child. Classes 6-8: clear school language. Classes 9-12: name the rule, but still keep words plain.",
  ].join(" ");
}

function tinyExampleRules(): string {
  return [
    "In the idea, add one tiny example of the same rule, with smaller or easier numbers than the real question.",
    "The example is at most two short sentences. It is not a second full problem.",
    "Do not change the correct answer of the real question. Do not invent a different answer for it.",
    "Skip the example if the question is already a one-step fact, or if a diagram is needed and you cannot see it.",
  ].join(" ");
}

export function buildTutorMessages(brief: MissedQuestionBrief): { role: "system" | "user"; content: string }[] {
  const options =
    brief.type === "NUMERIC" || brief.options.length === 0
      ? "This is a numeric question."
      : brief.options.map((opt, i) => `${OPTION_LABELS[i] ?? i + 1}. ${opt}`).join("\n");

  return [
    {
      role: "system",
      content: [
        "You teach one missed school question to the student who just got it wrong.",
        simpleLanguageRules(),
        tinyExampleRules(),
        "Teach the idea first (include the tiny example there), then their mistake, then why the given correct answer is right.",
        "The correct answer in the user message is fixed. Do not change it or invent another one.",
        "Stay on this question and its topic. Do not write a full chapter.",
        "If you cannot see a diagram, say so and teach from the written question.",
        'Reply with JSON only: {"idea":"...","whyMissed":"...","whyCorrect":"..."}',
        "idea may be 3-6 short sentences so the example fits. whyMissed and whyCorrect are 2-4 sentences. No markdown.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        levelLine(brief),
        `Question type: ${brief.type}.`,
        brief.hasDiagram ? "The question has a diagram the student can see. You cannot see the image." : "No diagram.",
        "",
        brief.stem,
        "",
        options,
        "",
        `Student's answer: ${brief.studentAnswer}`,
        `Correct answer: ${brief.correctAnswer}`,
      ].join("\n"),
    },
  ];
}

export function isTutorConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function parseHelpThread(value: unknown): QuestionHelpThread | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const base = explanationSchema.safeParse({
    idea: row.idea,
    whyMissed: row.whyMissed,
    whyCorrect: row.whyCorrect,
  });
  if (!base.success) return null;
  const followUps: TutorFollowUp[] = [];
  if (Array.isArray(row.followUps)) {
    for (const item of row.followUps) {
      if (!item || typeof item !== "object") continue;
      const q = (item as { question?: unknown }).question;
      const reply = (item as { reply?: unknown }).reply;
      if (typeof q === "string" && typeof reply === "string" && q.trim() && reply.trim()) {
        followUps.push({ question: q.trim(), reply: reply.trim() });
      }
    }
  }
  return { ...base.data, followUps };
}

export function buildFollowUpMessages(
  brief: MissedQuestionBrief,
  help: QuestionHelp,
  history: TutorFollowUp[],
  question: string
): { role: "system" | "user"; content: string }[] {
  const prior = history
    .map((turn, i) => `Follow-up ${i + 1}. Student: ${turn.question}\nTutor: ${turn.reply}`)
    .join("\n\n");
  return [
    {
      role: "system",
      content: [
        "You already explained one missed school question. The student has a further doubt.",
        simpleLanguageRules(),
        "If they still do not get the idea, add one tiny example of the same rule with smaller numbers. At most two short sentences. Do not turn it into a second full problem.",
        "Stay on this question and its topic. Do not write a full chapter.",
        "The correct answer in the user message is fixed. Do not change it or invent another one.",
        "If they ask about a different question or topic, say you can only help with this question.",
        "If you cannot see a diagram, say so and teach from the written question.",
        'Reply with JSON only: {"reply":"..."}',
        "The reply is 2-5 sentences. No markdown.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        buildTutorMessages(brief)[1].content,
        "",
        `First explanation — the idea: ${help.idea}`,
        `First explanation — their answer: ${help.whyMissed}`,
        `First explanation — why the right answer works: ${help.whyCorrect}`,
        prior,
        "",
        `New doubt: ${question}`,
      ]
        .filter((part) => part.length > 0)
        .join("\n"),
    },
  ];
}

async function groqJson(messages: { role: "system" | "user"; content: string }[], maxTokens: number): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new TutorConfigError("AI help is not set up yet. Add GROQ_API_KEY on the server.");
  }

  const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
  const body: Record<string, unknown> = {
    model,
    temperature: 0.4,
    max_completion_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages,
  };
  if (model.includes("gpt-oss")) {
    body.reasoning_effort = "low";
  }

  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TutorUpstreamError("Could not reach the tutor. Try again in a moment.");
  }

  if (response.status === 429) {
    throw new TutorUpstreamError("The tutor is busy. Try again in a little while.");
  }
  if (!response.ok) {
    throw new TutorUpstreamError("The tutor could not answer this question right now.");
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new TutorUpstreamError("The tutor returned an empty explanation.");
  }

  try {
    return JSON.parse(stripFences(content));
  } catch {
    throw new TutorUpstreamError("The tutor returned an explanation we could not read.");
  }
}

export async function explainMissedQuestion(brief: MissedQuestionBrief): Promise<QuestionHelp> {
  const parsed = await groqJson(buildTutorMessages(brief), 800);
  const result = explanationSchema.safeParse(parsed);
  if (!result.success) {
    throw new TutorUpstreamError("The tutor returned an explanation we could not read.");
  }
  return result.data;
}

export async function answerFollowUpDoubt(
  brief: MissedQuestionBrief,
  help: QuestionHelp,
  history: TutorFollowUp[],
  question: string
): Promise<string> {
  const parsed = await groqJson(buildFollowUpMessages(brief, help, history, question), 600);
  const result = followUpReplySchema.safeParse(parsed);
  if (!result.success) {
    throw new TutorUpstreamError("The tutor returned an explanation we could not read.");
  }
  return result.data.reply;
}
