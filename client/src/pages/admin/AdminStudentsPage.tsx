import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { AdminStudentTabs, type AdminStudentTabId } from "../../components/admin/students/AdminStudentTabs";
import { AutoGenerateForm } from "../../components/admin/students/AutoGenerateForm";
import { EditablePreviewStaging } from "../../components/admin/students/EditablePreviewStaging";
import { ExcelUpload } from "../../components/admin/students/ExcelUpload";
import { openPrintWindow } from "../../components/admin/students/PrintCards";
import { StudentTable } from "../../components/admin/students/StudentTable";
import type { StudentListRow, StudentPreviewRow } from "../../components/admin/students/types";

type SchoolClassMeta = {
  id: string;
  name: string;
  grade: string | null;
  sections: { id: string; name: string }[];
};

type Toast = { type: "ok" | "err"; message: string };

export function AdminStudentsPage() {
  const [tab, setTab] = useState<AdminStudentTabId>("generate");
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [generatePreview, setGeneratePreview] = useState<StudentPreviewRow[]>([]);
  const [uploadPreview, setUploadPreview] = useState<StudentPreviewRow[]>([]);

  const [allStudents, setAllStudents] = useState<StudentListRow[]>([]);
  const [classMeta, setClassMeta] = useState<SchoolClassMeta[]>([]);
  const [filterClassId, setFilterClassId] = useState("");
  const [filterSectionId, setFilterSectionId] = useState("");
  const [passwordHints, setPasswordHints] = useState<Record<string, string>>({});

  const [confirm, setConfirm] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const loadStudents = useCallback(async () => {
    const q = new URLSearchParams();
    if (filterClassId) q.set("classId", filterClassId);
    if (filterSectionId) q.set("sectionId", filterSectionId);
    const path = `/api/v1/admin/students${q.toString() ? `?${q}` : ""}`;
    const r = await api<{ students: StudentListRow[] }>(path);
    if (!r.ok) {
      showToast({ type: "err", message: r.error ?? "Failed to load students" });
      return;
    }
    setAllStudents(r.data?.students ?? []);
  }, [filterClassId, filterSectionId, showToast]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    void (async () => {
      const r = await api<SchoolClassMeta[]>("/api/v1/admin/classes");
      if (r.ok && r.data) setClassMeta(r.data);
    })();
  }, []);

  const filterClassOptions = useMemo(
    () =>
      classMeta.map((c) => ({
        id: c.id,
        label: c.grade ? `${c.name} (grade ${c.grade})` : c.name,
      })),
    [classMeta]
  );

  const filterSectionOptions = useMemo(() => {
    if (filterClassId) {
      const c = classMeta.find((x) => x.id === filterClassId);
      return (c?.sections ?? []).map((s) => ({ id: s.id, label: s.name }));
    }
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [];
    for (const c of classMeta) {
      for (const s of c.sections) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        out.push({ id: s.id, label: `${c.name} — ${s.name}` });
      }
    }
    return out;
  }, [classMeta, filterClassId]);

  useEffect(() => {
    if (filterSectionId && !filterSectionOptions.find((o) => o.id === filterSectionId)) {
      setFilterSectionId("");
    }
  }, [filterClassId, filterSectionId, filterSectionOptions]);

  async function saveRows(rows: StudentPreviewRow[]) {
    if (!rows.length) return;
    const trimmed = rows.map((r) => ({ ...r, fullName: r.fullName.trim() }));
    const missing = trimmed.filter((r) => !r.fullName);
    if (missing.length) {
      showToast({
        type: "err",
        message: `Fill in every student name before saving (${missing.length} empty).`,
      });
      return;
    }
    setConfirm({
      message: `Save ${trimmed.length} student account(s) to the database? Duplicates will be skipped.`,
      onConfirm: async () => {
        setConfirm(null);
        setBusy(true);
        const r = await api<{ created: number; skipped: number; errors: string[] }>("/api/v1/admin/save-students", {
          method: "POST",
          json: { students: trimmed },
        });
        setBusy(false);
        if (!r.ok) {
          showToast({ type: "err", message: r.error ?? "Save failed" });
          return;
        }
        const created = r.data?.created ?? 0;
        const skipped = r.data?.skipped ?? 0;
        const detail = r.data?.errors?.length ? ` ${r.data.errors.slice(0, 3).join(" · ")}` : "";
        showToast({
          type: created === 0 && skipped > 0 ? "err" : "ok",
          message: `Saved: ${created} created, ${skipped} skipped.${detail}`,
        });
        setGeneratePreview([]);
        setUploadPreview([]);
        await loadStudents();
      },
    });
  }

  function printFilteredClass() {
    openPrintWindow(
      allStudents.map((r) => ({
        name: r.fullName,
        class: r.classLabel,
        section: r.sectionName,
        username: r.username,
        password: passwordHints[r.id],
      })),
      filterClassId || filterSectionId ? "Class login cards" : "All students — login cards"
    );
  }

  async function resetPassword(studentId: string) {
    if (!window.confirm("Issue a new 4-digit password for this student?")) return;
    setBusyId(studentId);
    const r = await api<{ password: string }>(`/api/v1/admin/students/${studentId}/reset-password`, {
      method: "PATCH",
    });
    setBusyId(null);
    if (!r.ok) {
      showToast({ type: "err", message: r.error ?? "Reset failed" });
      return;
    }
    const pwd = r.data?.password;
    if (pwd) {
      setPasswordHints((prev) => ({ ...prev, [studentId]: pwd }));
      showToast({ type: "ok", message: `New password: ${pwd} (shown once — print now if needed)` });
    }
  }

  async function deleteStudent(studentId: string) {
    if (!window.confirm("Delete this student account permanently?")) return;
    setBusyId(studentId);
    const r = await api(`/api/v1/admin/students/${studentId}`, { method: "DELETE" });
    setBusyId(null);
    if (!r.ok) {
      showToast({ type: "err", message: r.error ?? "Delete failed" });
      return;
    }
    showToast({ type: "ok", message: "Student deleted." });
    setPasswordHints((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    await loadStudents();
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Student account management</h1>
        <p className="text-slate-600 mt-1 text-sm md:text-base">
          Generate or import accounts, edit names in the preview if needed, then save. Print and CSV use the latest
          names.
        </p>
      </div>

      <AdminStudentTabs active={tab} onChange={setTab} />

      {tab === "generate" && (
        <div className="space-y-4">
          <AutoGenerateForm
            busy={busy}
            onGenerated={(rows) => {
              setGeneratePreview(rows);
              showToast({ type: "ok", message: `Generated ${rows.length} account(s). Review and save.` });
            }}
          />
          <EditablePreviewStaging
            rows={generatePreview}
            onRowsChange={setGeneratePreview}
            busy={busy}
            onSave={(rows) => void saveRows(rows)}
            csvFilename={`students-generated-${Date.now()}`}
            printTitle="New student accounts"
          />
        </div>
      )}

      {tab === "upload" && (
        <div className="space-y-4">
          <ExcelUpload
            busy={busy}
            onPreview={(rows) => {
              setUploadPreview(rows);
              showToast({ type: "ok", message: `Parsed ${rows.length} row(s). Review and save.` });
            }}
          />
          <EditablePreviewStaging
            rows={uploadPreview}
            onRowsChange={setUploadPreview}
            busy={busy}
            onSave={(rows) => void saveRows(rows)}
            csvFilename={`students-upload-${Date.now()}`}
            printTitle="Imported student accounts"
          />
        </div>
      )}

      {tab === "list" && (
        <StudentTable
          rows={allStudents}
          passwordHints={passwordHints}
          filterClassId={filterClassId}
          filterSectionId={filterSectionId}
          onFilterClass={(id) => {
            setFilterClassId(id);
            setFilterSectionId("");
          }}
          onFilterSection={setFilterSectionId}
          classOptions={filterClassOptions}
          sectionOptions={filterSectionOptions}
          busyId={busyId}
          onResetPassword={(id) => void resetPassword(id)}
          onDelete={(id) => void deleteStudent(id)}
          onPrintClass={() => printFilteredClass()}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg ${
            toast.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <p className="text-slate-800">{confirm.message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium min-h-[44px]"
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white min-h-[44px]"
                onClick={() => confirm.onConfirm()}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
