import Image from 'next/image';

export default function ApplicantVerificationNotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-5 px-6 py-12">
      <Image
        src="/logo.png"
        width={160}
        height={80}
        alt="Saylani"
        className="h-14 w-auto object-contain"
      />
      <section className="border-border bg-surface shadow-card grid gap-3 rounded-xl border p-6">
        <h1 className="text-fg text-xl font-semibold">Unable to verify this registration record</h1>
        <p className="text-fg-muted text-sm">Please contact the issuing Saylani branch.</p>
      </section>
    </main>
  );
}
