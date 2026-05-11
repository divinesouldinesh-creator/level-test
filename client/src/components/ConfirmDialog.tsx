import { useEffect, useRef, useState } from "react";

export type ConfirmRequest = {
  /** Modal title (e.g. "Delete subject"). */
  title: string;
  /** Body text shown above the action buttons. JSX or string. */
  message: React.ReactNode;
  /**
   * If provided, the user must type this exact string before the confirm
   * button enables. Use for high-stakes deletes (subject / level / chapter).
   * Comparison is case-sensitive but trims whitespace on both sides.
   */
  requireTypedText?: string;
  /** Confirm button label. Defaults to "Delete". */
  confirmLabel?: string;
  /** Tone of the confirm button. Defaults to "danger". */
  tone?: "danger" | "primary";
  /** Called when user clicks confirm. */
  onConfirm: () => void | Promise<void>;
};

/**
 * Mounted once near the root and driven by a request state. Replaces
 * `window.confirm` so the dialog cannot be silently suppressed by browsers
 * or extensions, and so high-stakes deletes can require typed input.
 */
export function ConfirmDialog({
  request,
  onCancel,
}: {
  request: ConfirmRequest | null;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // Reset typed state every time a new request arrives.
  useEffect(() => {
    setTyped("");
    setBusy(false);
    if (!request) return;
    const id = window.setTimeout(() => {
      if (request.requireTypedText) inputRef.current?.focus();
      else cancelRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [request]);

  // Esc to cancel.
  useEffect(() => {
    if (!request) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, onCancel, busy]);

  if (!request) return null;

  const requiredText = request.requireTypedText;
  const needsType = !!requiredText;
  const typedOk = !needsType || typed.trim() === requiredText!.trim();

  async function doConfirm() {
    if (!typedOk || busy || !request) return;
    setBusy(true);
    try {
      await request.onConfirm();
    } finally {
      setBusy(false);
    }
  }

  const confirmLabel = request.confirmLabel ?? "Delete";
  const tone = request.tone ?? "danger";
  const confirmCls =
    tone === "danger"
      ? "rounded-lg bg-rose-600 text-white px-4 py-2 text-sm font-semibold hover:bg-rose-700 disabled:opacity-50"
      : "rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900">
          {request.title}
        </h3>
        <div className="mt-2 text-sm text-slate-700 whitespace-pre-line">{request.message}</div>

        {needsType && requiredText && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-600">
              Type{" "}
              <span className="font-semibold text-slate-900 break-all">{requiredText}</span>{" "}
              to confirm
            </label>
            <input
              ref={inputRef}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void doConfirm();
                }
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={confirmCls}
            onClick={() => void doConfirm()}
            disabled={!typedOk || busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook that returns a `[request, setRequest, ConfirmDialogElement]` triple.
 * Drop the element anywhere in the page render output, then call
 * `setRequest({...})` to ask for confirmation. Pass `null` to dismiss.
 */
export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const element = (
    <ConfirmDialog request={request} onCancel={() => setRequest(null)} />
  );
  return { request, setRequest, dismiss: () => setRequest(null), element };
}
