import { useEffect, useState } from "react";
import { mediaUrl } from "../../api";
import {
  certificateMediaUrl,
  fetchSchoolBranding,
  removeSchoolLogo,
  type SchoolBranding,
  updateSchoolBrandingName,
  uploadSchoolLogo,
} from "../../schoolBranding";

export function AdminSchoolBrandingPage() {
  const [branding, setBranding] = useState<SchoolBranding | null>(null);
  const [schoolName, setSchoolName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const data = await fetchSchoolBranding();
      setBranding(data);
      setSchoolName(data.schoolName);
      setLoading(false);
    })();
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = schoolName.trim();
    if (!trimmed) {
      setError("School name cannot be empty.");
      return;
    }
    setSavingName(true);
    setError(null);
    setMessage(null);
    const r = await updateSchoolBrandingName(trimmed);
    setSavingName(false);
    if (!r.ok || !r.data) {
      setError(r.error ?? "Could not save school name");
      return;
    }
    setBranding(r.data);
    setSchoolName(r.data.schoolName);
    setMessage("School name saved. It will appear on attendance certificates.");
  }

  async function onLogoSelected(file: File | undefined) {
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    setMessage(null);
    const r = await uploadSchoolLogo(file);
    setUploadingLogo(false);
    if (!r.ok || !r.data) {
      setError(r.error ?? "Logo upload failed");
      return;
    }
    setBranding(r.data);
    setMessage("School logo uploaded.");
  }

  async function onRemoveLogo() {
    if (!window.confirm("Remove the school logo from certificates?")) return;
    setUploadingLogo(true);
    setError(null);
    setMessage(null);
    const r = await removeSchoolLogo();
    setUploadingLogo(false);
    if (!r.ok || !r.data) {
      setError(r.error ?? "Could not remove logo");
      return;
    }
    setBranding(r.data);
    setMessage("School logo removed.");
  }

  const previewLogo = certificateMediaUrl(branding?.logoUrl);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">School branding</h1>
        <p className="text-slate-600 mt-1 text-sm md:text-base">
          Set the school name and logo used on attendance certificates (and anywhere else branding is shown).
        </p>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loading ? (
        <>
          <form onSubmit={(e) => void saveName(e)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <h2 className="font-semibold text-slate-900">School name</h2>
            <label className="block text-sm text-slate-700">
              Name on certificates
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                disabled={savingName}
                placeholder="e.g. Green Valley Public School"
              />
            </label>
            <button
              type="submit"
              disabled={savingName || !schoolName.trim()}
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {savingName ? "Saving…" : "Save name"}
            </button>
          </form>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <h2 className="font-semibold text-slate-900">School logo</h2>
            <p className="text-sm text-slate-600">PNG, JPEG, GIF, or WebP. Max 2 MB. Square logos work best.</p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 overflow-hidden">
                {branding?.logoUrl ? (
                  <img
                    src={mediaUrl(branding.logoUrl)}
                    alt="School logo"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-400 text-center px-2">No logo</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-indigo-600 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100">
                  {uploadingLogo ? "Uploading…" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="sr-only"
                    disabled={uploadingLogo}
                    onChange={(e) => void onLogoSelected(e.target.files?.[0])}
                  />
                </label>
                {branding?.logoUrl ? (
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => void onRemoveLogo()}
                  >
                    Remove logo
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-indigo-50 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Certificate preview</h2>
            <p className="mt-1 text-xs text-slate-500">How the header will look on attendance certificates.</p>
            <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-amber-300/60 bg-white/80 px-6 py-5">
              {previewLogo ? (
                <img src={previewLogo} alt="" className="h-14 w-14 object-contain" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-amber-200 to-amber-400 flex items-center justify-center text-2xl">
                  🏆
                </div>
              )}
              <p className="text-sm font-bold uppercase tracking-widest text-indigo-800">
                {schoolName.trim() || "Your School"}
              </p>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 bg-violet-100 px-4 py-1 rounded-full">
                Certificate of Attendance
              </p>
            </div>
          </section>
        </>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
