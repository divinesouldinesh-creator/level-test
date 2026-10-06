import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";

type SupportArea = "SPEAKING" | "MATHS" | "ATTENDANCE";
type SupportView = "needs_support" | "no_action" | "recheck_due" | "improved";
type ActionKind =
  | "SPOKE_TO_TEACHER"
  | "CALLED_PARENT"
  | "PARENT_MEETING"
  | "EXTRA_PRACTICE"
  | "ATTENDANCE_WARNING"
  | "RECHECK_SCHEDULED";
type Outcome = "OPEN" | "IMPROVED" | "STILL_NEEDS_SUPPORT";
type RowStatus = "no_action" | "action_recorded" | "recheck_due" | "still_needs_support" | "improved";

type Settings = {
  speakingMaxLevelOrder: number;
  mathsBelowPct: number;
  attendanceBelowPct: number;
  recheckDays: number;
};

type LatestAction = {
  id: string;
  actionKind: ActionKind;
  note: string | null;
  snapshotLabel: string;
  recheckOn: string;
  outcome: Outcome;
  outcomeNote: string | null;
  outcomeLabel: string | null;
  createdAt: string;
  recordedByName: string | null;
};

type SupportRow = {
  studentId: string;
  fullName: string;
  studentLoginId: string | null;
  className: string;
  sectionName: string;
  area: SupportArea;
  weak: boolean;
  status: RowStatus;
  metricLabel: string;
  latestAction: LatestAction | null;
};

type Board = {
  today: string;
  attendanceFrom: string;
  attendanceTo: string;
  settings: Settings;
  warnings: string[];
  counts: { needsSupport: number; noAction: number; recheckDue: number; improved: number };
  rows: SupportRow[];
};

type HistoryItem = LatestAction;

type ClassRow = { id: string; name: string; sections: { id: string; name: string }[] };

const ACTION_OPTIONS: { value: ActionKind; label: string }[] = [
  { value: "SPOKE_TO_TEACHER", label: "Spoke to the class teacher" },
  { value: "CALLED_PARENT", label: "Called the parent" },
  { value: "PARENT_MEETING", label: "Parent meeting" },
  { value: "EXTRA_PRACTICE", label: "Extra practice assigned" },
  { value: "ATTENDANCE_WARNING", label: "Attendance warning" },
  { value: "RECHECK_SCHEDULED", label: "Recheck scheduled" },
];

const AREA_LABEL: Record<SupportArea, string> = {
  SPEAKING: "Speaking",
  MATHS: "Maths",
  ATTENDANCE: "Attendance",
};

const STATUS_LABEL: Record<RowStatus, string> = {
  no_action: "No action yet",
  action_recorded: "Action recorded",
  recheck_due: "Recheck due",
  still_needs_support: "Still needs support",
  improved: "Improved",
};

const VIEWS: { id: SupportView; label: string; countKey: keyof Board["counts"] }[] = [
  { id: "needs_support", label: "Needs support", countKey: "needsSupport" },
  { id: "no_action", label: "No action yet", countKey: "noAction" },
  { id: "recheck_due", label: "Recheck due", countKey: "recheckDue" },
  { id: "improved", label: "Improved", countKey: "improved" },
];

function actionLabel(kind: ActionKind): string {
  return ACTION_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

function formatIso(iso: string): string {
  const day = iso.slice(0, 10);
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function statusClass(status: RowStatus): string {
  if (status === "no_action" || status === "recheck_due") return "bg-amber-100 text-amber-900";
  if (status === "improved") return "bg-emerald-100 text-emerald-900";
  if (status === "still_needs_support") return "bg-rose-100 text-rose-900";
  return "bg-slate-100 text-slate-800";
}

export function AdminPrincipalActionsPage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [area, setArea] = useState<"" | SupportArea>("");
  const [view, setView] = useState<SupportView>("needs_support");
  const [query, setQuery] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const selectedClass = classes.find((c) => c.id === classId);
  const sections = selectedClass?.sections ?? [];

  useEffect(() => {
    void (async () => {
      const r = await api<ClassRow[]>("/api/v1/admin/classes");
      if (r.ok && r.data) setClasses(r.data);
    })();
  }, []);

  useEffect(() => {
    setSectionId("");
  }, [classId]);

  async function loadBoard() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ view });
    if (classId) params.set("classId", classId);
    if (sectionId) params.set("sectionId", sectionId);
    if (area) params.set("area", area);
    const r = await api<Board>(`/api/v1/admin/principal-actions?${params}`);
    setLoading(false);
    if (!r.ok || !r.data) {
      setError(r.error ?? "Could not load the support list");
      return;
    }
    setBoard(r.data);
  }

  useEffect(() => {
    void loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, sectionId, area, view]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!board) return [];
    if (!q) return board.rows;
    return board.rows.filter((row) => {
      const blob = `${row.fullName} ${row.studentLoginId ?? ""} ${row.className} ${row.sectionName}`.toLowerCase();
      return blob.includes(q);
    });
  }, [board, query]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Principal actions</h1>
        <p className="mt-1 text-slate-600">
          Students behind on the latest speaking level, the latest maths class mark, or this month’s attendance, and the record of what was done.
        </p>
        {board ? (
          <p className="mt-1 text-sm text-slate-500">
            Attendance is this month ({formatIso(board.attendanceFrom)} to {formatIso(board.attendanceTo)}), after at least 5 marked days.
          </p>
        ) : null}
      </div>

      {board?.warnings.map((warning) => (
        <p key={warning} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warning}
        </p>
      ))}

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((item) => {
          const selected = view === item.id;
          const count = board?.counts[item.countKey] ?? 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`rounded-full px-3 py-2 text-sm font-medium min-h-[40px] ${
                selected ? "bg-indigo-600 text-white" : "bg-white text-slate-700 border border-slate-300"
              }`}
            >
              {item.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm text-slate-700">
          Class
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-slate-700">
          Section
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            disabled={!classId}
          >
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-slate-700">
          Area
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={area}
            onChange={(e) => setArea(e.target.value as "" | SupportArea)}
          >
            <option value="">All areas</option>
            <option value="SPEAKING">Speaking</option>
            <option value="MATHS">Maths</option>
            <option value="ATTENDANCE">Attendance</option>
          </select>
        </label>
        <label className="block text-sm text-slate-700">
          Search
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or student ID"
          />
        </label>
      </div>

      {error ? <p className="text-red-600">{error}</p> : null}
      {loading ? <p className="text-slate-600">Loading…</p> : null}

      {!loading && visibleRows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600">
          No students in this list. They are above the cut-off, or this result has not been recorded yet.
        </p>
      ) : null}

      <ul className="space-y-3">
        {visibleRows.map((row) => {
          const key = `${row.studentId}:${row.area}`;
          const open = openKey === key;
          return (
            <li key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{row.fullName}</p>
                  <p className="text-sm text-slate-600">
                    {row.className} · {row.sectionName}
                    {row.studentLoginId ? ` · ${row.studentLoginId}` : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(row.status)}`}>
                  {STATUS_LABEL[row.status]}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-800">
                <span className="font-medium">{AREA_LABEL[row.area]}.</span> {row.metricLabel}
              </p>
              {row.latestAction ? (
                <p className="mt-1 text-sm text-slate-600">
                  Last step: {actionLabel(row.latestAction.actionKind)} on {formatIso(row.latestAction.createdAt)}
                  {row.latestAction.recordedByName ? ` · ${row.latestAction.recordedByName}` : ""}
                </p>
              ) : null}
              <button
                type="button"
                className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white min-h-[40px]"
                onClick={() => setOpenKey(open ? null : key)}
              >
                {open ? "Close" : row.latestAction?.outcome === "OPEN" ? "Review action" : row.weak ? "Record action" : "View record"}
              </button>
              {open && board ? (
                <ActionPanel
                  row={row}
                  today={board.today}
                  recheckDays={board.settings.recheckDays}
                  onSaved={() => {
                    void loadBoard();
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {board ? <CutOffs settings={board.settings} onSaved={() => void loadBoard()} /> : null}
    </div>
  );
}

function ActionPanel({
  row,
  today,
  recheckDays,
  onSaved,
}: {
  row: SupportRow;
  today: string;
  recheckDays: number;
  onSaved: () => void;
}) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [actionKind, setActionKind] = useState<ActionKind>("CALLED_PARENT");
  const [note, setNote] = useState("");
  const [recheckOn, setRecheckOn] = useState(() => addDays(today, recheckDays));
  const [outcomeNote, setOutcomeNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<HistoryItem[]>(
        `/api/v1/admin/principal-actions/history?studentId=${encodeURIComponent(row.studentId)}&area=${row.area}`
      );
      if (r.ok && r.data) setHistory(r.data);
    })();
  }, [row.studentId, row.area, row.latestAction?.id, row.latestAction?.outcome]);

  const openAction = row.latestAction?.outcome === "OPEN" ? row.latestAction : null;

  async function record(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api("/api/v1/admin/principal-actions", {
      method: "POST",
      json: { studentId: row.studentId, area: row.area, actionKind, note, recheckOn },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save the action");
      return;
    }
    setNote("");
    onSaved();
  }

  async function closeAction(outcome: "IMPROVED" | "STILL_NEEDS_SUPPORT") {
    if (!openAction) return;
    setBusy(true);
    setError(null);
    const r = await api(`/api/v1/admin/principal-actions/${openAction.id}/outcome`, {
      method: "POST",
      json: { outcome, note: outcomeNote },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save the outcome");
      return;
    }
    setOutcomeNote("");
    onSaved();
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4 space-y-4">
      {openAction ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">
            Recorded when it was: {openAction.snapshotLabel}. Recheck {formatIso(openAction.recheckOn)}.
          </p>
          <p className="text-sm text-slate-700">Now: {row.metricLabel}</p>
          {openAction.note ? <p className="text-sm text-slate-600">Note: {openAction.note}</p> : null}
          <label className="block text-sm text-slate-700">
            Outcome note
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={outcomeNote}
              onChange={(e) => setOutcomeNote(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void closeAction("IMPROVED")}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white min-h-[40px] disabled:opacity-60"
            >
              Mark improved
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void closeAction("STILL_NEEDS_SUPPORT")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 min-h-[40px] disabled:opacity-60"
            >
              Still needs support
            </button>
          </div>
        </div>
      ) : row.weak ? (
        <form onSubmit={record} className="space-y-3">
          <label className="block text-sm text-slate-700">
            Action
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              value={actionKind}
              onChange={(e) => setActionKind(e.target.value as ActionKind)}
              disabled={busy}
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-700">
            Note
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block text-sm text-slate-700">
            Recheck on
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={recheckOn}
              min={today}
              onChange={(e) => setRecheckOn(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white min-h-[40px] disabled:opacity-60"
          >
            Save action
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-700">This area is now above the cut-off.</p>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {history.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Record</h2>
          <ul className="mt-2 space-y-2">
            {history.map((item) => (
              <li key={item.id} className="text-sm text-slate-700">
                <span className="font-medium">{formatIso(item.createdAt)}</span> · {actionLabel(item.actionKind)}
                {item.recordedByName ? ` · ${item.recordedByName}` : ""}
                <span className="block text-slate-500">{item.snapshotLabel}</span>
                {item.outcome !== "OPEN" ? (
                  <span className="block text-slate-500">
                    {item.outcome === "IMPROVED" ? "Marked improved" : "Still needs support"}
                    {item.outcomeLabel ? `: ${item.outcomeLabel}` : ""}
                    {item.outcomeNote ? ` · ${item.outcomeNote}` : ""}
                  </span>
                ) : (
                  <span className="block text-slate-500">Open · recheck {formatIso(item.recheckOn)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CutOffs({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const r = await api<Settings>("/api/v1/admin/principal-actions/settings", {
      method: "PUT",
      json: draft,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save cut-offs");
      return;
    }
    setMessage("Cut-offs saved.");
    onSaved();
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer font-medium text-slate-900">Cut-offs</summary>
      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-slate-700">
          Flag speaking at or below level
          <input
            type="number"
            min={0}
            max={20}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={draft.speakingMaxLevelOrder}
            onChange={(e) => setDraft({ ...draft, speakingMaxLevelOrder: Number(e.target.value) })}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Flag maths below %
          <input
            type="number"
            min={1}
            max={100}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={draft.mathsBelowPct}
            onChange={(e) => setDraft({ ...draft, mathsBelowPct: Number(e.target.value) })}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Flag attendance below %
          <input
            type="number"
            min={1}
            max={100}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={draft.attendanceBelowPct}
            onChange={(e) => setDraft({ ...draft, attendanceBelowPct: Number(e.target.value) })}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Default recheck after days
          <input
            type="number"
            min={1}
            max={90}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={draft.recheckDays}
            onChange={(e) => setDraft({ ...draft, recheckDays: Number(e.target.value) })}
          />
        </label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white min-h-[40px] disabled:opacity-60"
          >
            Save cut-offs
          </button>
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </form>
    </details>
  );
}
