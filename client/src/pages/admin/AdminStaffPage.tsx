import { useState } from "react";
import { StaffOfficePanel } from "../../components/admin/staff/StaffOfficePanel";
import { StaffTeachersPanel } from "../../components/admin/staff/StaffTeachersPanel";

type StaffTab = "teachers" | "office";

export function AdminStaffPage() {
  const [tab, setTab] = useState<StaffTab>("teachers");

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Staff</h1>
        <p className="text-slate-600 mt-1 text-sm md:text-base">
          Manage teacher and office accounts.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
        {(
          [
            ["teachers", "Teachers"],
            ["office", "Office"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 min-w-[100px] rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
              tab === id
                ? "bg-white text-brand-900 shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "teachers" ? <StaffTeachersPanel heading={false} /> : <StaffOfficePanel />}
    </div>
  );
}
