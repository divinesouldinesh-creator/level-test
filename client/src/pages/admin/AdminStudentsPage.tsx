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
type ResetDialog = { studentId: string; studentName: string; password: string };

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
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [resetDialog, setResetDialog] = useState<ResetDialog | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);

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

  useEffect(() => {
    const visibleIds = new Set(allStudents.map((s) => s.id));
    setSelectedStudentIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [allStudents]);

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

  function resetPassword(studentId: string) {
    const student = allStudents.find((s) => s.id === studentId);
    setShowResetPassword(false);
    setResetDialog({
      studentId,
      studentName: student?.fullName ?? "this student",
      password: "",
    });
  }

  async function submitResetPassword() {
    if (!resetDialog) return;
    const password = resetDialog.password.trim();
    if (password.length < 4) {
      showToast({ type: "err", message: "Password must be at least 4 characters." });
      return;
    }
    const studentId = resetDialog.studentId;
    setBusyId(studentId);
    const r = await api<{ password: string }>(`/api/v1/admin/students/${studentId}/reset-password`, {
      method: "PATCH",
      json: { password },
    });
    setBusyId(null);
    if (!r.ok) {
      showToast({ type: "err", message: r.error ?? "Reset failed" });
      return;
    }
    const pwd = r.data?.password;
    if (pwd) {
      setPasswordHints((prev) => ({ ...prev, [studentId]: pwd }));
      showToast({ type: "ok", message: `Password updated: ${pwd} (shown once — print now if needed)` });
    }
    setShowResetPassword(false);
    setResetDialog(null);
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

  function toggleStudentSelection(studentId: string, checked: boolean) {
    setSelectedStudentIds((prev) => {
      if (checked) {
        if (prev.includes(studentId)) return prev;
        return [...prev, studentId];
      }
      return prev.filter((id) => id !== studentId);
    });
  }

  function toggleAllVisibleSelection(checked: boolean) {
    const visibleIds = allStudents.map((s) => s.id);
    setSelectedStudentIds((prev) => {
      if (checked) {
        return [...new Set([...prev, ...visibleIds])];
      }
      const visibleSet = new Set(visibleIds);
      return prev.filter((id) => !visibleSet.has(id));
    });
  }

  function deleteSelectedStudents() {
    if (selectedStudentIds.length === 0) return;
    setConfirm({
      message: `Delete ${selectedStudentIds.length} selected student account(s) permanently? This cannot be undone.`,
      onConfirm: async () => {
        setConfirm(null);
        setBusy(true);
        const ids = [...selectedStudentIds];
        const r = await api<{ requested: number; deleted: number; notFoundIds: string[] }>("/api/v1/admin/students", {
          method: "DELETE",
          json: { studentIds: ids },
        });
        setBusy(false);
        if (!r.ok) {
          showToast({ type: "err", message: r.error ?? "Bulk delete failed" });
          return;
        }
        const deleted = r.data?.deleted ?? 0;
        const missing = r.data?.notFoundIds?.length ?? 0;
        showToast({
          type: "ok",
          message: `Deleted ${deleted} student(s).${missing ? ` ${missing} already missing.` : ""}`,
        });
        setSelectedStudentIds([]);
        setPasswordHints((prev) => {
          const next = { ...prev };
          for (const id of ids) delete next[id];
          return next;
        });
        await loadStudents();
      },
    });
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
          bulkBusy={busy}
          selectedIds={selectedStudentIds}
          onToggleRow={toggleStudentSelection}
          onToggleAllVisible={toggleAllVisibleSelection}
          onDeleteSelected={deleteSelectedStudents}
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

      {resetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Set password</h3>
            <p className="mt-2 text-sm text-slate-700">
              Set a new password for <span className="font-medium">{resetDialog.studentName}</span>.
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              New password
              <input
                type={showResetPassword ? "text" : "password"}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 min-h-[44px]"
                value={resetDialog.password}
                onChange={(e) =>
                  setResetDialog((prev) => (prev ? { ...prev, password: e.target.value } : prev))
                }
                placeholder="Enter at least 4 characters"
                autoFocus
              />
            </label>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              onClick={() => setShowResetPassword((v) => !v)}
            >
              {showResetPassword ? "Hide password" : "Show password"}
            </button>
            <p className="mt-2 text-xs text-slate-500">Minimum 4 characters.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium min-h-[44px]"
                onClick={() => {
                  setShowResetPassword(false);
                  setResetDialog(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === resetDialog.studentId || resetDialog.password.trim().length < 4}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white min-h-[44px] disabled:opacity-50"
                onClick={() => void submitResetPassword()}
              >
                Save password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
