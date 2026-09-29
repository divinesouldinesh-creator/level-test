import { useNavigate } from "react-router-dom";
import { FeeSchoolPanel } from "../../components/fees/FeeSchoolPanel";

export function OfficeSchoolTotalsPage() {
  const navigate = useNavigate();
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">School totals</h1>
      <p className="text-slate-600 mt-1">Each family is counted once. Open a name to go to that account.</p>
      <div className="mt-4">
        <FeeSchoolPanel onOpenStudent={(studentId) => navigate(`/office/account?student=${encodeURIComponent(studentId)}`)} />
      </div>
    </div>
  );
}
