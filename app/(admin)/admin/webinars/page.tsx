import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";
import { formatDuration } from "@/app/webinar/_components/webinar-register-page";

export const metadata = { title: "Admin Webinars" };

export default async function AdminWebinarsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/dashboard");
  // ADMIN: cross-account query intentional
  const webinar = await adminDb.webinars.getActive();
  // ADMIN: cross-account query intentional
  const activations = await adminDb.webinars.listAccountActivations();
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Webinar</h1>
      {webinar ? (
        <div className="rounded-lg border p-5">
          <p className="font-medium">{webinar.title}</p>
          <p className="text-sm text-muted-foreground">Bunny.net Video ID: {webinar.bunnyVideoId}</p>
          <p className="text-sm text-muted-foreground">{formatDuration(webinar.durationSeconds)}</p>
          <p className="mt-3 text-sm">Distributor Activations: {activations.length}</p>
        </div>
      ) : <p className="rounded-lg border p-5 text-sm text-muted-foreground">No active webinar yet.</p>}
      <form action="/api/admin/webinars" method="POST" className="space-y-3 rounded-lg border p-5">
        <h2 className="font-semibold">Add New Webinar</h2>
        <p className="text-sm text-muted-foreground">Upload your video in the Bunny.net Stream dashboard, then copy the Video ID from Bunny and paste it here. Videos are not uploaded through Vercel.</p>
        <input name="title" placeholder="Title" className="w-full rounded-md border px-3 py-2 text-sm" />
        <textarea name="description" placeholder="Description" className="min-h-24 w-full rounded-md border px-3 py-2 text-sm" />
        <input name="bunnyVideoId" placeholder="Bunny.net Video ID" className="w-full rounded-md border px-3 py-2 text-sm" />
        <input name="durationSeconds" placeholder="Duration in seconds" className="w-full rounded-md border px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-sm">
          <input name="confirmCompliance" type="checkbox" value="true" />
          I confirm this webinar content complies with Herbalife Malaysia guidelines.
        </label>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Create Webinar</button>
      </form>
    </div>
  );
}
