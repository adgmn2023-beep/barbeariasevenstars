import { Dashboard } from "@/components/admin/reports";
import { requireAdminPage } from "@/lib/admin";
export default async function Page() {
  await requireAdminPage();
  return <Dashboard />;
}
