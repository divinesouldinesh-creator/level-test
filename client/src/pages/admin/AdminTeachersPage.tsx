import { StaffTeachersPanel } from "../../components/admin/staff/StaffTeachersPanel";

/** Office portal teachers page (teachers only). */
export function AdminTeachersPage() {
  return (
    <div className="max-w-5xl">
      <StaffTeachersPanel heading />
    </div>
  );
}
