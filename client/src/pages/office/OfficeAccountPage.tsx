import { useSearchParams } from "react-router-dom";
import { FeeAccountPanel } from "../../components/fees/FeeAccountPanel";

export function OfficeAccountPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [params] = useSearchParams();
  const openStudentId = params.get("student");

  return (
    <div>
      {embedded ? null : (
        <>
          <h1 className="text-2xl font-bold text-slate-900">Account</h1>
          <p className="text-slate-600 mt-1">Search a child and add a sibling if there is one. Transport and the monthly fee are on Collect.</p>
        </>
      )}
      <div className={embedded ? undefined : "mt-4"}>
        <FeeAccountPanel openStudentId={openStudentId} />
      </div>
    </div>
  );
}
