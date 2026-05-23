import { redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { getPublishedResponses } from "@/lib/objections/library";
import { getServerLocale } from "@/lib/locale-server";
import { ObjectionsClient } from "./objections-client";

export const metadata = { title: "Objection Library" };

export default async function ObjectionsPage() {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  const userDb = scopedDb(account.id);
  const [masterResponses, personalResponses, favouriteIds] = await Promise.all([
    getPublishedResponses(getServerLocale()),
    userDb.objections.listPersonal(),
    userDb.objections.listFavouriteIds(),
  ]);
  return <ObjectionsClient masterResponses={masterResponses} personalResponses={personalResponses} favouriteIds={favouriteIds} />;
}
