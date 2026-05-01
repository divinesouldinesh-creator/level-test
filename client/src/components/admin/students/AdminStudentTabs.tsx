const tabs = [
  { id: "generate" as const, label: "Auto generate" },
  { id: "upload" as const, label: "Upload Excel / CSV" },
  { id: "list" as const, label: "Student list & print" },
];

export type AdminStudentTabId = (typeof tabs)[number]["id"];

export function AdminStudentTabs({
  active,
  onChange,
}: {
  active: AdminStudentTabId;
  onChange: (id: AdminStudentTabId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`flex-1 min-w-[140px] rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
            active === t.id
              ? "bg-white text-brand-900 shadow-sm border border-slate-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
