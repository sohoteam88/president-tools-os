import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">This page does not exist or is no longer available.</p>
      <Link href="/dashboard" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
        Back to Dashboard
      </Link>
    </main>
  );
}
