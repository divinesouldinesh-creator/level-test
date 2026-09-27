import { useState } from "react";

export function ViewPasswordDialog({
  name,
  loginLabel,
  login,
  password,
  onClose,
}: {
  name: string;
  loginLabel: string;
  login: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const saved = password.trim();

  async function copyPassword() {
    if (!saved) return;
    try {
      await navigator.clipboard.writeText(saved);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Password</h3>
        <p className="mt-2 text-sm text-slate-700">
          Saved login for <span className="font-medium">{name}</span>
          {login ? (
            <>
              {" "}
              ({loginLabel}: <span className="font-mono text-xs">{login}</span>)
            </>
          ) : null}
          .
        </p>
        {saved ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-base break-all">
            {saved}
          </p>
        ) : (
          <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-3">
            No password is saved for this account yet. Use Reset password to set one. It will show here afterward.
            If they sign in before that, the password they use is saved automatically.
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          {saved ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium min-h-[44px]"
              onClick={() => void copyPassword()}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white min-h-[44px]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
