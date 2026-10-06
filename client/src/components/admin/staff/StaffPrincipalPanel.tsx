import { useCallback, useEffect, useState } from "react";
import { api } from "../../../api";
import { useConfirmDialog } from "../../ConfirmDialog";
import { ViewPasswordDialog } from "../ViewPasswordDialog";

type PrincipalRow = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  password: string;
};

type ResetDialog = { principalId: string; fullName: string; password: string };
type Toast = { type: "ok" | "err"; message: string };

/** Principal account create/list/reset/delete — Admin Staff tab only. */
export function StaffPrincipalPanel() {
  const [rows, setRows] = useState<PrincipalRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const confirmDialog = useConfirmDialog();
  const [toast, setToast] = useState<Toast | null>(null);
  const [resetDialog, setResetDialog] = useState<ResetDialog | null>(null);
  const [viewUser, setViewUser] = useState<PrincipalRow | null>(null);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const load = useCallback(async () => {
    const r = await api<{ principalUsers: PrincipalRow[] }>("/api/v1/admin/principal-users");
    if (!r.ok) {
      showToast({ type: "err", message: r.error ?? "Failed to load principal users" });
      return;
    }
    setRows(r.data?.principalUsers ?? []);
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || password.trim().length < 6) return;
    setBusy(true);
    const r = await api("/api/v1/admin/principal-users", {
      method: "POST",
      json: {
        fullName: name.trim(),
        email: email.trim(),
        password: password.trim(),
      },
    });
    setBusy(false);
    if (!r.ok) {
      showToast({ type: "err", message: r.error ?? "Could not create principal user" });
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    showToast({ type: "ok", message: "Principal account created." });
    await load();
  }

  function deleteUser(row: PrincipalRow) {
    confirmDialog.setRequest({
      title: "Delete principal account",
      message: `This will permanently delete the principal account for "${row.fullName}" (${row.email}). This cannot be undone.`,
      confirmLabel: "Delete principal user",
      onConfirm: () => doDelete(row),
    });
  }

  async function doDelete(row: PrincipalRow) {
    setBusyId(row.id);
    const r = await api(`/api/v1/admin/principal-users/${row.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!r.ok) {
      showToast({ type: "err", message: r.error ?? "Delete failed" });
      return;
    }
    showToast({ type: "ok", message: "Principal user deleted." });
    await load();
  }

  async function submitResetPassword() {
    if (!resetDialog) return;
    const nextPassword = resetDialog.password.trim();
    if (nextPassword.length < 4) {
      showToast({ type: "err", message: "Password must be at least 4 characters." });
      return;
    }
    setBusyId(resetDialog.principalId);
    const r = await api<{ password: string }>(
      `/api/v1/admin/principal-users/${resetDialog.principalId}/reset-password`,
      {
        method: "PATCH",
        json: { password: nextPassword },
      }
    );
    setBusyId(null);
    if (!r.ok) {
      showToast({ type: "err", message: r.error ?? "Reset failed" });
      return;
    }
    showToast({
      type: "ok",
      message: `Password updated: ${r.data?.password ?? nextPassword}`,
    });
    setResetDialog(null);
    await load();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createUser} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Add principal</h2>
        <p className="mt-1 text-sm text-slate-600">
          The principal signs in with this email and sees only the support list.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <input
            type="email"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          <input
            type="password"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Password (min 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !name.trim() || !email.trim() || password.trim().length < 6}
          className="mt-3 rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Add principal
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Password</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="p-3">{row.fullName}</td>
                <td className="p-3">{row.email}</td>
                <td className="p-3 font-mono text-xs">{row.password || "—"}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      onClick={() => setViewUser(row)}
                    >
                      View password
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      disabled={busyId === row.id}
                      onClick={() =>
                        setResetDialog({
                          principalId: row.id,
                          fullName: row.fullName,
                          password: "",
                        })
                      }
                    >
                      Reset password
                    </button>
                    <button
                      type="button"
                      className="rounded border border-rose-300 text-rose-700 px-2 py-1 text-xs"
                      disabled={busyId === row.id}
                      onClick={() => deleteUser(row)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="p-3 text-slate-500" colSpan={4}>
                  No principal account yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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

      {resetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Set password</h3>
            <p className="mt-2 text-sm text-slate-700">
              Set a new password for <span className="font-medium">{resetDialog.fullName}</span>.
            </p>
            <input
              type="password"
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 min-h-[44px]"
              value={resetDialog.password}
              onChange={(e) =>
                setResetDialog((prev) => (prev ? { ...prev, password: e.target.value } : prev))
              }
              placeholder="Enter at least 4 characters"
              autoFocus
            />
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium min-h-[44px]"
                onClick={() => setResetDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === resetDialog.principalId || resetDialog.password.trim().length < 4}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white min-h-[44px] disabled:opacity-50"
                onClick={() => void submitResetPassword()}
              >
                Save password
              </button>
            </div>
          </div>
        </div>
      )}
      {viewUser ? (
        <ViewPasswordDialog
          name={viewUser.fullName}
          loginLabel="email"
          login={viewUser.email}
          password={viewUser.password}
          onClose={() => setViewUser(null)}
        />
      ) : null}
      {confirmDialog.element}
    </div>
  );
}
