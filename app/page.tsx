import { HYPOTHESES } from '@/lib/config/hypotheses';

/**
 * Scaffold placeholder. Prompt 0 builds no features.
 *
 * It reads the hypotheses file on purpose: it proves the framework-free /lib layer is
 * wired to the app layer and that nothing else needs to hardcode these numbers.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 p-6">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Arena</h1>
        <p className="text-muted-foreground text-balance">
          Performers ranked against each other by blind pairwise voting on an identical weekly task,
          plus a weighted judge panel. Not a social network.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
          Working hypotheses
        </h2>
        <dl className="divide-border divide-y text-sm">
          {Object.entries(HYPOTHESES).map(([name, value]) => (
            <div key={name} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-muted-foreground font-mono text-xs">{name}</dt>
              <dd className="font-mono tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground text-xs">
          Guesses, not findings. See <code className="font-mono">lib/config/hypotheses.ts</code>.
        </p>
      </section>
    </main>
  );
}
