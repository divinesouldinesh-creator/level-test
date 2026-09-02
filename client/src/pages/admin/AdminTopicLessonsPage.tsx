import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";

type TopicLessonRow = {
  id: string;
  name: string;
  questionCount: number;
  lesson: { title: string; body: string; updatedAt: string } | null;
  usedIn: { levelId: string; levelName: string; subjectName: string }[];
};

type LessonDetail = {
  topicId: string;
  topicName: string;
  lesson: { title: string; body: string; updatedAt: string } | null;
};

export function AdminTopicLessonsPage() {
  const [topics, setTopics] = useState<TopicLessonRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "missing" | "has">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadTopics = useCallback(async () => {
    const r = await api<TopicLessonRow[]>("/api/v1/admin/topic-lessons");
    if (!r.ok) {
      setErr(r.error ?? "Failed to load topics");
      return;
    }
    setTopics(r.data ?? []);
    setErr(null);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadTopics();
      setLoading(false);
    })();
  }, [loadTopics]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return topics.filter((t) => {
      if (filter === "missing" && t.lesson) return false;
      if (filter === "has" && !t.lesson) return false;
      if (!q) return true;
      const hay = [
        t.name,
        ...t.usedIn.map((u) => `${u.subjectName} ${u.levelName}`),
        t.lesson?.title ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [topics, search, filter]);

  const selected = topics.find((t) => t.id === selectedId) ?? null;

  async function selectTopic(topicId: string) {
    setSelectedId(topicId);
    setMessage(null);
    setErr(null);
    const r = await api<LessonDetail>(`/api/v1/admin/topics/${topicId}/lesson`);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Failed to load lesson");
      return;
    }
    const lesson = r.data.lesson;
    setTitle(lesson?.title ?? `Learn: ${r.data.topicName}`);
    setBody(
      lesson?.body ??
        `Key points for ${r.data.topicName}:\n\n` +
          `1. Write the main idea or formula here.\n` +
          `2. Add one worked example.\n` +
          `3. List common mistakes to avoid.`
    );
  }

  async function saveLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      setErr("Title and lesson text are required.");
      return;
    }
    setSaving(true);
    setErr(null);
    setMessage(null);
    const r = await api<LessonDetail>(`/api/v1/admin/topics/${selectedId}/lesson`, {
      method: "PUT",
      json: { title: trimmedTitle, body: trimmedBody },
    });
    setSaving(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not save lesson");
      return;
    }
    setMessage("Lesson saved. Students will see this in the topic mastery Learn step.");
    await loadTopics();
  }

  async function removeLesson() {
    if (!selectedId || !selected?.lesson) return;
    if (!window.confirm(`Remove custom lesson for "${selected.name}"? Students will see default tips.`)) {
      return;
    }
    setSaving(true);
    setErr(null);
    setMessage(null);
    const r = await api(`/api/v1/admin/topics/${selectedId}/lesson`, { method: "DELETE" });
    setSaving(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not remove lesson");
      return;
    }
    setMessage("Custom lesson removed.");
    await loadTopics();
    await selectTopic(selectedId);
  }

  const missingCount = topics.filter((t) => !t.lesson).length;

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Topic lessons</h1>
      <p className="mt-1 text-slate-600">
        Write short study notes for skill topics. Students see these in the mastery path Learn step before
        practice.
      </p>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search topic, subject, level…"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">All topics ({topics.length})</option>
          <option value="missing">Missing lesson ({missingCount})</option>
          <option value="has">Has lesson ({topics.length - missingCount})</option>
        </select>
      </div>

      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              Topics ({filtered.length})
            </h2>
            <ul className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <li className="px-4 py-6 text-sm text-slate-500">No topics match your filter.</li>
              ) : (
                filtered.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => void selectTopic(t.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${
                        selectedId === t.id ? "bg-brand-50" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-slate-900">{t.name}</span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                            t.lesson
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {t.lesson ? "Lesson" : "Default"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {t.questionCount} questions
                        {t.usedIn.length > 0
                          ? ` · ${t.usedIn
                              .slice(0, 2)
                              .map((u) => `${u.subjectName} / ${u.levelName}`)
                              .join(", ")}${t.usedIn.length > 2 ? "…" : ""}`
                          : ""}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {!selected ? (
              <p className="text-sm text-slate-600">Select a topic on the left to edit its lesson.</p>
            ) : (
              <form onSubmit={(e) => void saveLesson(e)} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
                  {selected.usedIn.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Used in:{" "}
                      {selected.usedIn.map((u) => `${u.subjectName} · ${u.levelName}`).join(" · ")}
                    </p>
                  )}
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Lesson title</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="e.g. Fractions — basics"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Lesson content</span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Plain text. Use short bullets, formulas, and one example. Shown before practice.
                  </p>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={14}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono leading-relaxed"
                  />
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save lesson"}
                  </button>
                  {selected.lesson && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void removeLesson()}
                      className="rounded-lg border border-rose-300 bg-white px-5 py-2.5 text-sm font-medium text-rose-700"
                    >
                      Remove custom lesson
                    </button>
                  )}
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
