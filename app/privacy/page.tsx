export const metadata = {
  title: "Privacy Notice | President Tools",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12 space-y-6 text-sm text-foreground">
      <h1 className="text-xl font-semibold">Privacy Notice</h1>
      <p className="text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

      <section className="space-y-2">
        <h2 className="font-semibold">1. Who We Are</h2>
        <p>
          This platform is operated by independent Herbalife Nutrition distributors in Malaysia.
          Each distributor is an independent data controller responsible for the personal data
          collected through their individual pages. Herbalife Nutrition Ltd is not responsible
          for the data practices of independent distributors.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">2. What Data We Collect</h2>
        <p>When you submit a form on a distributor&apos;s page, we may collect:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your name</li>
          <li>Your WhatsApp number</li>
          <li>Your email address (if you provide it)</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">3. How We Use Your Data</h2>
        <p>
          Your data is used solely to allow the distributor to follow up with you regarding
          your enquiry. We do not sell, share, or transfer your data to third parties,
          except as required by law.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">4. Data Storage</h2>
        <p>
          Your data is stored securely on servers hosted by Supabase (PostgreSQL), located
          in Singapore (AWS ap-southeast-1 region), and Cloudflare (global CDN for file
          storage). Both providers maintain appropriate technical and organisational
          security measures.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">5. Your Rights Under PDPA 2010</h2>
        <p>Under Malaysia&apos;s Personal Data Protection Act 2010, you have the right to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Access the personal data we hold about you</li>
          <li>Correct inaccurate personal data</li>
          <li>Withdraw your consent to the processing of your data</li>
          <li>Request deletion of your personal data</li>
        </ul>
        <p>
          To exercise any of these rights, contact the distributor whose page you submitted
          your data on, or write to us at the address below.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">6. Contact</h2>
        <p>
          For privacy-related enquiries, contact the distributor directly via WhatsApp, or
          email:{" "}
          <span className="text-foreground font-medium">
            {process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "the distributor directly"}
          </span>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">7. Changes to This Notice</h2>
        <p>
          We may update this privacy notice from time to time. Continued use of any
          distributor&apos;s page after changes constitutes acceptance of the updated notice.
        </p>
      </section>
    </main>
  );
}
