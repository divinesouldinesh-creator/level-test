import { FeeStructurePanel } from "../../components/fees/FeeStructurePanel";

export function OfficeFeeStructurePage({ embedded = false }: { embedded?: boolean } = {}) {
  return (
    <div>
      {embedded ? null : (
        <>
          <h1 className="text-2xl font-bold text-slate-900">Fee structure</h1>
          <p className="text-slate-600 mt-1">Class rates for this academic year. These are the school amounts before any family discount.</p>
        </>
      )}
      <div className={embedded ? undefined : "mt-4"}>
        <FeeStructurePanel />
      </div>
    </div>
  );
}
