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

const OPTION_LABELS = ["A", "B", "C", "D"];
const tutorHits = new Map<string, number[]>();
const TUTOR_WINDOW_MS = 60 * 60 * 1000;
const TUTOR_MAX_PER_WINDOW = 30;

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

function levelLine(brief: MissedQuestionBrief): string {
  const grade = brief.grade?.trim() || brief.className;
  const level =
    brief.levelName != null
      ? `${brief.levelName}${brief.levelOrder != null ? ` (order ${brief.levelOrder})` : ""}`
      : "chapter test, no separate level";
  return `Student class: ${grade}. Subject: ${brief.subjectName}. Level: ${level}. Topic: ${brief.topicName}. Difficulty: ${brief.difficulty}.`;
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
        "Match their class and subject level. Use short, clear sentences for younger classes. For higher classes, name the rule and why the wrong choice fails.",
        "Teach the idea first, then their mistake, then why the given correct answer is right.",
        "The correct answer in the user message is fixed. Do not change it or invent another one.",
        "Stay on this question and its topic. Do not write a full chapter.",
        "If you cannot see a diagram, say so and teach from the written question.",
        'Reply with JSON only: {"idea":"...","whyMissed":"...","whyCorrect":"..."}',
        "Each field is 2-4 sentences. No markdown.",
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

export async function explainMissedQuestion(brief: MissedQuestionBrief): Promise<QuestionHelp> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new TutorConfigError("AI help is not set up yet. Add OPENAI_API_KEY on the server.");
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: buildTutorMessages(brief),
      }),
    });
  } catch {
    throw new TutorUpstreamError("Could not reach the tutor. Try again in a moment.");
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(content));
  } catch {
    throw new TutorUpstreamError("The tutor returned an explanation we could not read.");
  }

  const result = explanationSchema.safeParse(parsed);
  if (!result.success) {
    throw new TutorUpstreamError("The tutor returned an explanation we could not read.");
  }
  return result.data;
}
