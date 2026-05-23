import { redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { NewFunnelPicker } from "./new-funnel-picker";

export default async function NewFunnelPage() {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">New Funnel</h1>
      <p className="text-sm text-muted-foreground">Choose a funnel type to create a draft, then edit and publish it.</p>
      <NewFunnelPicker />
    </div>
  );
}
