/**
 * Pairing.
 *
 * The quietest high-stakes function in the product: nobody sees it, and it decides whether
 * the ratings mean anything and whether the "guaranteed attention" promise is real.
 */

import { describe, expect, it } from 'vitest';
import { MAX_VIEWS_PER_ENTRY } from '@/lib/config/hypotheses';
import {
  informationGain,
  pairKey,
  presentInRandomOrder,
  scorePair,
  selectPair,
  viewCap,
  viewDeficit,
  type PairCandidate,
} from '@/lib/domain/pairing';

const entry = (id: string, overrides: Partial<PairCandidate> = {}): PairCandidate => ({
  entryId: id,
  rating: 1500,
  ratingDeviation: 80,
  views: 0,
  ...overrides,
});

const none = new Set<string>();

describe('information gain', () => {
  it('is highest for two entries we cannot separate', () => {
    const close = informationGain(entry('a'), entry('b'));
    const far = informationGain(entry('a', { rating: 1200 }), entry('b', { rating: 1800 }));

    // We already know who wins the second one. Asking costs a vote and teaches nothing.
    expect(close).toBeGreaterThan(far);
  });

  it('rises with uncertainty', () => {
    const settled = informationGain(
      entry('a', { ratingDeviation: 40 }),
      entry('b', { ratingDeviation: 40 }),
    );
    const provisional = informationGain(
      entry('a', { ratingDeviation: 300 }),
      entry('b', { ratingDeviation: 300 }),
    );

    expect(provisional).toBeGreaterThan(settled);
  });

  it('weighs closeness above uncertainty', () => {
    // An uncertain but hopeless pair is still a wasted vote; a close pair between two
    // settled ratings is a genuine tie-break.
    const closeAndSettled = informationGain(
      entry('a', { rating: 1500, ratingDeviation: 40 }),
      entry('b', { rating: 1505, ratingDeviation: 40 }),
    );
    const farAndUncertain = informationGain(
      entry('a', { rating: 1100, ratingDeviation: 340 }),
      entry('b', { rating: 1900, ratingDeviation: 340 }),
    );

    expect(closeAndSettled).toBeGreaterThan(farAndUncertain);
  });

  it('stays within 0 and 1', () => {
    const extremes = [
      informationGain(entry('a'), entry('b')),
      informationGain(entry('a', { rating: 0, ratingDeviation: 0 }), entry('b', { rating: 4000 })),
      informationGain(entry('a', { ratingDeviation: 999 }), entry('b', { ratingDeviation: 999 })),
    ];

    for (const value of extremes) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('view levelling — the guaranteed attention promise', () => {
  it('is driven by the less-seen entry, so a new entry gets its first views', () => {
    // Pairing a starved entry with a popular one must still score well, or nothing new
    // ever gets shown.
    const mixed = viewDeficit(entry('a', { views: 0 }), entry('b', { views: 100 }), 200);
    const bothSeen = viewDeficit(entry('a', { views: 100 }), entry('b', { views: 100 }), 200);

    expect(mixed).toBeGreaterThan(bothSeen);
  });

  it('is 1 for an unseen pair and 0 at the cap', () => {
    expect(viewDeficit(entry('a'), entry('b'), 200)).toBe(1);
    expect(viewDeficit(entry('a', { views: 200 }), entry('b', { views: 200 }), 200)).toBe(0);
  });

  it('beats a marginally better information score', () => {
    /*
     * The whole point. An unseen entry with a slightly worse rating match must win against
     * a perfectly matched pair that has already been served a hundred times, or
     * "everybody gets seen" is just a sentence in a document.
     */
    const starved = scorePair(
      entry('new1', { views: 0, rating: 1520 }),
      entry('new2', { views: 0, rating: 1460 }),
      200,
    );
    const popular = scorePair(
      entry('old1', { views: 150, rating: 1500 }),
      entry('old2', { views: 150, rating: 1500 }),
      200,
    );

    expect(starved).toBeGreaterThan(popular);
  });

  it('uses the hypothesis rather than a hardcoded cap', () => {
    expect(viewCap()).toBe(MAX_VIEWS_PER_ENTRY);
  });
});

describe('selecting a pair', () => {
  it('picks the closest-rated pair when views are equal', () => {
    const chosen = selectPair({
      candidates: [
        entry('a', { rating: 1500 }),
        entry('b', { rating: 1505 }),
        entry('c', { rating: 1900 }),
      ],
      seenPairs: none,
    });

    expect(new Set([chosen?.a.entryId, chosen?.b.entryId])).toEqual(new Set(['a', 'b']));
  });

  it('never repeats a pair for the same voter', () => {
    const seen = new Set([pairKey('a', 'b')]);
    const chosen = selectPair({
      candidates: [entry('a'), entry('b'), entry('c')],
      seenPairs: seen,
    });

    expect(pairKey(chosen!.a.entryId, chosen!.b.entryId)).not.toBe(pairKey('a', 'b'));
  });

  it('treats a pair as seen whichever way round it was shown', () => {
    // The same two clips with the sides swapped is the same question.
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
  });

  it('returns null when every pair has been seen', () => {
    // A finished session, not an error. Core rule 8 treats running out as the design
    // working rather than a problem to solve with more content.
    const seen = new Set([pairKey('a', 'b')]);
    expect(selectPair({ candidates: [entry('a'), entry('b')], seenPairs: seen })).toBeNull();
  });

  it('returns null with fewer than two candidates', () => {
    expect(selectPair({ candidates: [entry('a')], seenPairs: none })).toBeNull();
    expect(selectPair({ candidates: [], seenPairs: none })).toBeNull();
  });

  it('skips entries at the view cap', () => {
    const chosen = selectPair({
      candidates: [
        entry('capped1', { views: 10, rating: 1500 }),
        entry('capped2', { views: 10, rating: 1501 }),
        entry('fresh1', { views: 0, rating: 1200 }),
        entry('fresh2', { views: 0, rating: 1800 }),
      ],
      seenPairs: none,
      cap: 10,
    });

    expect(new Set([chosen?.a.entryId, chosen?.b.entryId])).toEqual(new Set(['fresh1', 'fresh2']));
  });

  it('falls back past the cap rather than showing a judge nothing', () => {
    /*
     * The cap spreads attention; it does not ration it. A judge who wants to keep going is
     * worth more than a levelling rule that is, after all, a hypothesis.
     */
    const chosen = selectPair({
      candidates: [entry('a', { views: 99 }), entry('b', { views: 99 })],
      seenPairs: none,
      cap: 10,
    });

    expect(chosen).not.toBeNull();
  });

  it('falls back when every uncapped pair has already been seen', () => {
    const chosen = selectPair({
      candidates: [entry('a', { views: 0 }), entry('b', { views: 0 }), entry('c', { views: 50 })],
      seenPairs: new Set([pairKey('a', 'b')]),
      cap: 10,
    });

    expect(chosen).not.toBeNull();
    expect(pairKey(chosen!.a.entryId, chosen!.b.entryId)).not.toBe(pairKey('a', 'b'));
  });

  it('spreads views across a roster over a run of votes', () => {
    // The behaviour that matters over a session, rather than for one pick.
    const roster = Array.from({ length: 10 }, (_, i) =>
      entry(`e${i}`, { rating: 1500 + i * 3, views: 0 }),
    );
    const seen = new Set<string>();

    for (let vote = 0; vote < 20; vote += 1) {
      const chosen = selectPair({ candidates: roster, seenPairs: seen, cap: 100 });
      if (chosen === null) break;

      seen.add(pairKey(chosen.a.entryId, chosen.b.entryId));
      for (const picked of [chosen.a, chosen.b]) {
        const target = roster.find((candidate) => candidate.entryId === picked.entryId);
        if (target !== undefined) target.views += 1;
      }
    }

    const views = roster.map((candidate) => candidate.views);
    // Nobody starved, and nobody hogged: at 20 votes over 10 entries the ideal is 4 each.
    expect(Math.min(...views)).toBeGreaterThan(0);
    expect(Math.max(...views) - Math.min(...views)).toBeLessThanOrEqual(2);
  });
});

describe('presentation order', () => {
  it('puts either entry on either side', () => {
    // Selection is deterministic, which is right for CHOOSING and wrong for SHOWING. If
    // the higher-rated entry were always on the left, a judge would learn the tell within
    // a session and the vote would stop being blind.
    expect(presentInRandomOrder('a', 'b', () => 0.1)).toEqual(['a', 'b']);
    expect(presentInRandomOrder('a', 'b', () => 0.9)).toEqual(['b', 'a']);
  });

  it('is roughly even over many draws', () => {
    let firstStaysFirst = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (presentInRandomOrder('a', 'b')[0] === 'a') firstStaysFirst += 1;
    }
    expect(firstStaysFirst).toBeGreaterThan(400);
    expect(firstStaysFirst).toBeLessThan(600);
  });
});
