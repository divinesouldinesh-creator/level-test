import { useSearchParams } from "react-router-dom";
import { FeePaymentPanel } from "../../components/fees/FeePaymentPanel";

export function OfficeCollectPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [params] = useSearchParams();
  const openStudentId = params.get("student");

  return (
    <div>
      {embedded ? null : (
        <>
          <h1 className="text-2xl font-bold text-slate-900">Collect</h1>
          <p className="text-slate-600 mt-1">Search a child and record the amount received.</p>
        </>
      )}
      <div className={embedded ? undefined : "mt-4"}>
        <FeePaymentPanel openStudentId={openStudentId} />
      </div>
    </div>
  );
}
