import { useState } from "react";
import { FeeCollectPanel } from "../../components/fees/FeeCollectPanel";
import { FeeSchoolPanel } from "../../components/fees/FeeSchoolPanel";
import { FeeStructurePanel } from "../../components/fees/FeeStructurePanel";

type FeesTab = "collect" | "structure" | "school";

export function OfficeFeesPage() {
  const [tab, setTab] = useState<FeesTab>("collect");
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Fees</h1>
      <p className="text-slate-600 mt-1">
        Office only. Each student has an account. Siblings share one family total — pay on either child, both update.
        School reports count the family once.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
        {(
          [
            ["collect", "Collect / account"],
            ["structure", "Fee structure"],
            ["school", "School totals"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 min-w-[120px] rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
              tab === id
                ? "bg-white text-brand-900 shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "collect" ? <FeeCollectPanel openStudentId={openStudentId} /> : null}
        {tab === "structure" ? <FeeStructurePanel /> : null}
        {tab === "school" ? (
          <FeeSchoolPanel
            onOpenStudent={(studentId) => {
              setOpenStudentId(studentId);
              setTab("collect");
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
