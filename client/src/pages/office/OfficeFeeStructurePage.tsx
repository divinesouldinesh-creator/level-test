import { FeeStructurePanel } from "../../components/fees/FeeStructurePanel";

export function OfficeFeeStructurePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Fee structure</h1>
      <p className="text-slate-600 mt-1">Class rates for this academic year. These are the school amounts before any family discount.</p>
      <div className="mt-4">
        <FeeStructurePanel />
      </div>
    </div>
  );
}
