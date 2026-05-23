import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";
import { redirect } from "next/navigation";

export const metadata = { title: "Admin Lead Magnets" };

export default async function AdminMagnetsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/dashboard");
  // ADMIN: cross-account query intentional
  const magnet = await adminDb.magnets.getActive();
  // ADMIN: cross-account query intentional
  const activations = await adminDb.magnets.listAccountActivations();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Lead Magnet</h1>
      {magnet ? (
        <div className="rounded-lg border p-5">
          <p className="font-medium">{magnet.title}</p>
          <p className="text-sm text-muted-foreground">Version v{magnet.version}</p>
          <p className="mt-2 text-sm">{magnet.description}</p>
          <p className="mt-4 text-sm">Distributor Activations: {activations.length}</p>
        </div>
      ) : (
        <p className="rounded-lg border p-5 text-sm text-muted-foreground">No active master PDF yet.</p>
      )}
      <form action="/api/admin/magnets" method="POST" encType="multipart/form-data" className="space-y-3 rounded-lg border p-5">
        <h2 className="font-semibold">Upload New Lead Magnet</h2>
        <input name="title" placeholder="Title" className="w-full rounded-md border px-3 py-2 text-sm" />
        <textarea name="description" placeholder="Description" className="min-h-24 w-full rounded-md border px-3 py-2 text-sm" />
        <input name="pdf" type="file" accept="application/pdf" className="text-sm" />
        <label className="flex items-center gap-2 text-sm">
          <input name="confirmCompliance" type="checkbox" value="true" />
          I confirm this PDF content complies with Herbalife Malaysia distributor guidelines.
        </label>
        <p className="text-xs text-muted-foreground">Recommended PDF size: under 10MB.</p>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Upload</button>
      </form>
    </div>
  );
}
