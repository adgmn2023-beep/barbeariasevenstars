import { Catalog } from "@/components/admin/catalog";
import { requireAdminPage } from "@/lib/admin";
export default async function Page() {
  await requireAdminPage();
  return <Catalog />;
}
