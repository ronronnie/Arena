'use client';

import { useState } from 'react';
import { RevealCard } from '@/components/motion/reveal-card';
import { RatingTicker } from '@/components/motion/rating-ticker';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { RatingBadge } from '@/components/ui/rating-badge';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { VideoTile } from '@/components/ui/video-tile';

/**
 * The interactive half of the design system gallery.
 *
 * Split out as a client component so the page itself can stay a server component driven
 * by URL parameters — which is what makes the Playwright visual regression deterministic
 * rather than dependent on clicking through client state.
 */

/** Core rule 6 in its most common form: a number, and the sheet that explains it. */
export function ExplainableRating() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <RatingBadge
          rating={1512}
          ratingDeviation={42}
          isProvisional={false}
          onExplain={() => setOpen(true)}
        />
        <RatingBadge
          rating={1500}
          ratingDeviation={180}
          isProvisional
          onExplain={() => setOpen(true)}
        />
        <RatingBadge
          rating={1683}
          ratingDeviation={38}
          isProvisional={false}
          size="lg"
          onExplain={() => setOpen(true)}
        />
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Where this number comes from</SheetTitle>
            <SheetDescription>
              Your rating moves only when judges compare your set piece against another
              competitor&rsquo;s, on the same brief, without knowing who either of you are. Views,
              likes and followers are not part of it and never will be.
            </SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="primary" block>
                Close
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Signature moment #1, with a control so the flip can be seen in both directions. */
export function RevealDemo() {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col items-start gap-3">
      <RevealCard
        revealed={revealed}
        className="w-40"
        front={
          <Card className="items-center gap-2 p-4 text-center">
            <span className="arena-label">Entry A</span>
            <p className="text-text-muted text-sm">Identity hidden until you vote</p>
          </Card>
        }
        back={
          <Card className="border-accent-base items-center gap-2 p-4 text-center">
            <span className="arena-label">Entry A</span>
            <CardTitle className="text-base">Meera Iyer</CardTitle>
            <CardDescription>@competitor_12</CardDescription>
          </Card>
        }
      />
      <Button size="sm" onClick={() => setRevealed((value) => !value)}>
        {revealed ? 'Hide identity' : 'Reveal identity'}
      </Button>
    </div>
  );
}

/** Signature moment #3. Replayable, because a settle you only see once cannot be judged. */
export function TickerDemo() {
  const [round, setRound] = useState(0);
  const [open, setOpen] = useState(false);
  const pairs = [
    { from: 1497, to: 1512 },
    { from: 1512, to: 1488 },
    { from: 1488, to: 1488 },
  ] as const;
  const pair = pairs[round % pairs.length] ?? pairs[0];

  return (
    <>
      <div className="flex flex-col items-start gap-3">
        <RatingTicker key={round} from={pair.from} to={pair.to} onExplain={() => setOpen(true)} />
        <Button size="sm" onClick={() => setRound((value) => value + 1)}>
          Play the next change
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Why your rating moved</SheetTitle>
            <SheetDescription>
              Fourteen judges compared your week 3 entry against eleven others. You were chosen in
              nine of those comparisons. Judges whose choices track the panel closely count for
              more, which is why the change is not simply nine minus five.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function SheetDemo() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open a sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Bottom-anchored by default</SheetTitle>
          <SheetDescription>
            Arena is one-handed and thumb-zone. A sheet rising from the bottom edge puts its
            controls where a thumb already is.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="primary" block>
              Close
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** The lane switch — the first place Tabs appear in the product. */
export function TabsDemo() {
  return (
    <Tabs defaultValue="set-piece">
      <TabsList>
        <TabsTrigger value="set-piece">Set piece</TabsTrigger>
        <TabsTrigger value="signature">Signature</TabsTrigger>
      </TabsList>
      <TabsContent value="set-piece">
        <p className="text-text-muted text-sm">
          The ranked lane. Everyone performs the same brief and it is the only thing that moves a
          rating.
        </p>
      </TabsContent>
      <TabsContent value="signature">
        <p className="text-text-muted text-sm">
          The unranked lane. Freeform work that affects following only.
        </p>
      </TabsContent>
    </Tabs>
  );
}

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => toast.success('Vote recorded')}>
        Confirmation
      </Button>
      <Button
        size="sm"
        onClick={() => toast.error('That entry is no longer accepting comparisons')}
      >
        Problem
      </Button>
      <Button
        size="sm"
        onClick={() => toast('Week 3 closes on Sunday', { description: '4 days left to enter' })}
      >
        With detail
      </Button>
    </div>
  );
}

export function VideoTileStates() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <VideoTile src="/fixtures/clip-01.mp4" marker="A" label="First performance in this pair" />
      <VideoTile src="/fixtures/clip-05.mp4" marker="B" label="Second performance in this pair" />
      <VideoTile
        src="/fixtures/clip-03.mp4"
        marker="B"
        label="The option that was not chosen"
        dimmed
      />
    </div>
  );
}
