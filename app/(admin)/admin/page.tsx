/**
 * /admin — redirect to /admin/accounts
 */
import { redirect } from "next/navigation";
export default function AdminIndexPage() {
  redirect("/admin/accounts");
}
