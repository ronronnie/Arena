import Link from 'next/link';
import { ResultReveal } from '@/components/motion/result-reveal';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SectionLabel,
} from '@/components/ui/card';
import { CountdownBar } from '@/components/ui/countdown-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { LeagueBadge } from '@/components/ui/league-badge';
import { ProgressRing } from '@/components/ui/progress-ring';
import { SetPieceCard } from '@/components/ui/set-piece-card';
import { StatDelta } from '@/components/ui/stat-delta';
import { Toaster } from '@/components/ui/toast';
import { UNLOCK_THRESHOLD } from '@/lib/config/hypotheses';
import { categoryAccents, type Tier } from '@/lib/design/tokens';
import { cn } from '@/lib/ui/cn';
import {
  ExplainableRating,
  RevealDemo,
  SheetDemo,
  TabsDemo,
  TickerDemo,
  ToastDemo,
  VideoTileStates,
} from './interactive';

/**
 * The design system gallery — every component, in every state.
 *
 * Driven entirely by URL parameters rather than client state, so a screenshot test can
 * address any combination directly: `?theme=dark&scale=200&category=metal-vocals`. Click
 * targets that only exist in React state cannot be visually regression tested without a
 * script that reproduces the clicks, and that script is the thing that rots.
 *
 * The three axes are the three ways this design language is claimed to work:
 *   - **theme** — light is the default; dark is opt-in and must not be an afterthought.
 *   - **scale** — 100 / 150 / 200% dynamic type, driven by one custom property.
 *   - **category** — the accent ramp swap that makes a bharatanatyam competitor and a
 *     metal vocalist feel like they are in different rooms.
 */

type Params = { theme?: string; scale?: string; category?: string };

const SCALES = ['100', '150', '200'] as const;
const THEMES = ['light', 'dark'] as const;
const CATEGORIES = Object.keys(categoryAccents);
const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'elite'];

export default async function DesignSystemPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const theme = THEMES.includes(params.theme as (typeof THEMES)[number]) ? params.theme : 'light';
  const scale = SCALES.includes(params.scale as (typeof SCALES)[number]) ? params.scale : '100';
  const category = CATEGORIES.includes(params.category ?? '') ? params.category : 'default';

  const href = (next: Params): string => {
    const merged = { theme, scale, category, ...next };
    return `/design-system?theme=${merged.theme}&scale=${merged.scale}&category=${merged.category}`;
  };

  return (
    <div
      className={cn('bg-surface text-text min-h-dvh', theme === 'dark' && 'dark')}
      data-category={category}
      // Scopes the accessibility tests to the gallery, so Next's dev overlay controls are
      // not measured as if they were ours.
      data-gallery=""
      /*
       * `data-arena-type-scope` makes this subtree re-derive the whole type scale from the
       * `--arena-font-root` below it. Without the attribute the override is inert: the
       * `--arena-text-*` steps would already have been computed against the root's value
       * and merely inherited, so all three scales rendered identically — which the
       * screenshot heights caught.
       */
      data-arena-type-scope=""
      style={{ ['--arena-font-root' as string]: `${Number(scale) / 100}rem` }}
    >
      <Toaster />

      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-5 py-10">
        <header className="flex flex-col gap-4">
          <SectionLabel>Arena design system</SectionLabel>
          <h1 className="font-display text-3xl leading-tight font-bold tracking-tight">
            Broadcast, not feed
          </h1>
          <p className="text-text-muted max-w-prose text-base leading-normal">
            F1 timing graphics, Olympic scoreboards, Chess.com, Apple Fitness rings. Near-monochrome
            chrome so the video carries the colour, numbers treated as typographic events, and
            whitespace as the thing that signals a ranking means something.
          </p>

          <Switcher
            label="Theme"
            options={THEMES}
            current={theme}
            build={(v) => href({ theme: v })}
          />
          <Switcher
            label="Type scale"
            options={SCALES}
            current={scale}
            format={(v) => `${v}%`}
            build={(v) => href({ scale: v })}
          />
          <Switcher
            label="Category accent"
            options={CATEGORIES}
            current={category}
            build={(v) => href({ category: v })}
          />
        </header>

        <Section title="Button" note="Every size clears the 48px touch floor.">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Enter this brief</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Withdraw entry</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="More options">
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </Button>
            <Button disabled>Disabled</Button>
          </div>
          <Button variant="primary" block>
            Full width, for the thumb zone
          </Button>
        </Section>

        <Section title="Card">
          <Card>
            <CardHeader>
              <CardTitle>Judging closes Sunday</CardTitle>
              <CardDescription>
                Every competitor performed the same brief, so comparisons are like for like.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Card content sits here.</p>
            </CardContent>
          </Card>
        </Section>

        <Section
          title="Video tile"
          note="No identity prop exists on this component — Core rule 3 is enforced by the type."
        >
          <VideoTileStates />
        </Section>

        <Section title="Rating badge" note="Tapping any number opens its explanation.">
          <ExplainableRating />
        </Section>

        <Section title="League badge" note="Each tier has a distinct shape, not only a colour.">
          <div className="flex flex-wrap items-center gap-3">
            {TIERS.map((tier) => (
              <LeagueBadge key={tier} tier={tier} divisionName="Division 2" />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {TIERS.map((tier) => (
              <LeagueBadge key={tier} tier={tier} size="sm" />
            ))}
          </div>
        </Section>

        <Section title="Stat delta" note="Sign, arrow and word. Colour is never the only signal.">
          <div className="flex flex-wrap items-center gap-5">
            <StatDelta value={24} unit="rating" />
            <StatDelta value={-8} unit="rating" />
            <StatDelta value={0} unit="rating" />
            <StatDelta value={-8} unit="rating" compact />
          </div>
        </Section>

        <Section title="Countdown bar" note="Words first, bar second. No manufactured urgency.">
          <CountdownBar elapsed={0.35} closesLabel="Closes Sunday" remainingLabel="4 days left" />
          <CountdownBar
            elapsed={0.92}
            closesLabel="Closes today"
            remainingLabel="6 hours left"
            urgent
          />
        </Section>

        <Section title="Set piece card">
          <SetPieceCard
            weekNo={3}
            title="Abhinaya: one line, three moods"
            briefText="Take a single line of the provided padam and perform it three times, each with a different bhava."
            status="Open"
            countdown={{
              elapsed: 0.35,
              closesLabel: 'Closes Sunday',
              remainingLabel: '4 days left',
            }}
            action={<Button variant="primary">Enter this brief</Button>}
          />
          <SetPieceCard
            weekNo={2}
            title="Adavu chain: tatta to natta"
            briefText="Chain four tatta adavus into four natta adavus without pausing."
            status="Judging"
          />
          <SetPieceCard
            weekNo={1}
            title="Alarippu, eight counts"
            briefText="Perform the opening alarippu at a steady eight-count."
            status="Closed"
          />
        </Section>

        <Section title="Progress ring" note="Core rule 4: competing is earned, never offered.">
          <div className="flex flex-wrap items-center gap-6">
            <ProgressRing
              value={0}
              max={UNLOCK_THRESHOLD}
              label="comparisons judged"
              caption="judged"
            />
            <ProgressRing
              value={11}
              max={UNLOCK_THRESHOLD}
              label="comparisons judged"
              caption="judged"
            />
            <ProgressRing
              value={UNLOCK_THRESHOLD}
              max={UNLOCK_THRESHOLD}
              label="comparisons judged"
              caption="unlocked"
            />
          </div>
        </Section>

        <Section title="Sheet">
          <SheetDemo />
        </Section>

        <Section title="Tabs" note="The lane switch. Core rule 1 made visible.">
          <TabsDemo />
        </Section>

        <Section title="Toast" note="Confirms what you did. Never used to pull you back in.">
          <ToastDemo />
        </Section>

        <Section title="Empty state" note="Empty is usually a good state here.">
          <EmptyState
            title="You have judged everything on this brief"
            description="New pairs arrive when more competitors enter. That is the whole session — nothing else is waiting for you."
            action={<Button variant="secondary">Back to the drop</Button>}
          />
        </Section>

        <Section
          title="Reveal card"
          note="Signature moment: 380ms spring flip. Reduced motion swaps the face directly."
        >
          <RevealDemo />
        </Section>

        <Section
          title="Rating ticker"
          note="A real odometer — each digit rolls, units first, and settles."
        >
          <TickerDemo />
        </Section>

        <Section
          title="Result reveal"
          note="Position, then change, then badge. Ceremony, once a season."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <ResultReveal
              position={3}
              divisionSize={30}
              ratingDelta={48}
              tier="silver"
              divisionName="Division 2"
              outcome="promoted"
            />
            <ResultReveal
              position={26}
              divisionSize={30}
              ratingDelta={-31}
              tier="bronze"
              divisionName="Division 5"
              outcome="relegated"
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionLabel>{title}</SectionLabel>
        {note !== undefined && <p className="text-text-subtle text-sm">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Switcher({
  label,
  options,
  current,
  build,
  format,
}: {
  label: string;
  options: readonly string[];
  current: string | undefined;
  build: (value: string) => string;
  format?: (value: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* No fixed width: at 200% type a `w-28` label overflows its own box. */}
      <span className="arena-label basis-full">{label}</span>
      {options.map((option) => (
        <Link
          key={option}
          href={build(option)}
          className={cn(
            'inline-flex min-h-[var(--arena-touch-target)] items-center rounded-md border px-3 text-sm',
            option === current
              ? 'border-accent-base bg-accent-soft text-accent-text font-semibold'
              : 'border-line text-text-muted hover:bg-surface-sunken',
          )}
        >
          {format === undefined ? option : format(option)}
        </Link>
      ))}
    </div>
  );
}
