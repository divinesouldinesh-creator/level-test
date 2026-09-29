import { useSearchParams } from "react-router-dom";
import { FeeCollectionsPanel } from "../../components/fees/FeeCollectionsPanel";
import { OfficeAccountPage } from "./OfficeAccountPage";
import { OfficeCollectPage } from "./OfficeCollectPage";
import { OfficeFeeStructurePage } from "./OfficeFeeStructurePage";

const tabs = [
  ["collect", "Collect"],
  ["account", "Account"],
  ["structure", "Fee structure"],
  ["totals", "Totals"],
] as const;

type FeeTab = (typeof tabs)[number][0];

const tabCopy: Record<FeeTab, string> = {
  collect: "Search a child and record the amount received.",
  account: "Search a child and add a sibling if there is one. Transport and the monthly fee are on Collect.",
  structure: "Class rates for this academic year. These are the school amounts before any family discount.",
  totals: "Fees collected between two dates.",
};

function feeTab(value: string | null): FeeTab {
  return tabs.some(([id]) => id === value) ? (value as FeeTab) : "collect";
}

export function OfficeFeesPage() {
  const [params, setParams] = useSearchParams();
  const tab = feeTab(params.get("tab"));
  const openStudentId = params.get("student");

  function selectTab(next: FeeTab) {
    const query = new URLSearchParams();
    query.set("tab", next);
    if ((next === "account" || next === "collect") && openStudentId) {
      query.set("student", openStudentId);
    }
    setParams(query, { replace: true });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Fees</h1>
      <p className="text-slate-600 mt-1">{tabCopy[tab]}</p>

      <div className="mt-4 flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => selectTab(id)}
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

      <div className="mt-4">
        {tab === "collect" ? <OfficeCollectPage embedded /> : null}
        {tab === "account" ? <OfficeAccountPage embedded /> : null}
        {tab === "structure" ? <OfficeFeeStructurePage embedded /> : null}
        {tab === "totals" ? <FeeCollectionsPanel /> : null}
      </div>
    </div>
  );
}
