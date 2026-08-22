/**
 * Database seed.
 *
 * This matters more than a seed usually does. Prompts 5-7 build the blind voting surface
 * — the most important screen in the product — before the upload pipeline exists in
 * Prompt 8. Everything those screens render comes from here. A seed that produces empty
 * pairs makes that work impossible, so the target is not "some rows" but "a drop you can
 * actually judge, end to end, from a fresh checkout".
 *
 * Two deliberate choices worth knowing about:
 *
 * 1. **It does not go through the data-access layer.** Everywhere else, `system()` actors
 *    call `/lib/db/queries` — but the DAL runs on Neon's HTTP driver, which does one
 *    round trip per statement and has no interactive transactions (ADR 0002). Seeding
 *    ~1,100 rows that way is thousands of round trips with no way to roll back a partial
 *    failure. This script therefore opens its own pooled `pg` connection and does the
 *    whole seed in ONE transaction. It is the only file outside `/lib/db` that talks to
 *    Postgres directly, and it stays that way.
 *
 * 2. **It writes fake rows into `neon_auth.user`.** That schema belongs to Neon Auth and
 *    we never touch it from application code. A seed is the exception, because profiles
 *    are keyed to identities and there is no other way to have 60 competitors without 60
 *    identities. Every seeded identity is marked with `@seed.arena.invalid` (a reserved
 *    TLD — it can never be a real address) and cleaned up by email match, so a real
 *    account created through sign-up is never touched.
 */

import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { DIVISION_SIZE, UNLOCK_THRESHOLD } from '../lib/config/hypotheses';
import { authUsers } from '../lib/db/auth-schema';
import * as schema from '../lib/db/schema';

config({ path: ['.env.local', '.env'], quiet: true });

/* ---------------------------------------------------------------------------------
 * Shape of the seeded world. Tuned so every surface has something to show.
 * ------------------------------------------------------------------------------- */

const COMPETITOR_COUNT = 60;
const SET_PIECE_COUNT = 3;
const ENTRIES_PER_SET_PIECE = 40; // 3 x 40 = 120 eligible entries
const COMPARISON_COUNT = 800;
const SIGNATURE_ENTRY_COUNT = 12;
const FIXTURE_CLIPS = 8;

const SEED_EMAIL_DOMAIN = 'seed.arena.invalid';

/**
 * Deterministic PRNG (mulberry32). `Math.random()` would give a different database every
 * run, which turns "the voting screen looks wrong" into a question nobody can answer
 * twice. Same seed, same fixtures, every time.
 */
function makeRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = makeRandom(0xa2e14);
const randInt = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => {
  const item = items[randInt(0, items.length - 1)];
  if (item === undefined) throw new Error('pick() from an empty list');
  return item;
};

/** Box-Muller. Ratings clustered around 1500 look like a population; uniform ones do not. */
function normal(mean: number, stdDev: number): number {
  const u = Math.max(rand(), Number.EPSILON);
  const v = Math.max(rand(), Number.EPSILON);
  return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const FIRST_NAMES = [
  'Aarav',
  'Meera',
  'Ishaan',
  'Priya',
  'Kabir',
  'Ananya',
  'Rohan',
  'Diya',
  'Vihaan',
  'Sana',
  'Arjun',
  'Nisha',
  'Dev',
  'Tara',
  'Yash',
  'Kiara',
  'Aditya',
  'Riya',
  'Neel',
  'Zoya',
];
const LAST_NAMES = [
  'Sharma',
  'Iyer',
  'Khan',
  'Reddy',
  'Bose',
  'Nair',
  'Gupta',
  'Menon',
  'Singh',
  'Das',
  'Rao',
  'Joshi',
  'Patel',
  'Kaur',
  'Mehta',
];

const hoursFromNow = (hours: number): Date => new Date(Date.now() + hours * 3600 * 1000);
const daysFromNow = (days: number): Date => hoursFromNow(days * 24);

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production. This script truncates tables.');
  }

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Missing DATABASE_URL_UNPOOLED (or DATABASE_URL). See .env.example.');
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  const db = drizzle(client, { schema, casing: 'snake_case' });

  try {
    await db.transaction(async (tx) => {
      /* ---------------------------------------------------------------------------
       * Reset. Everything in `public` is ours; `neon_auth` is not, so only rows this
       * script created are removed from it.
       * ------------------------------------------------------------------------- */
      await tx.execute(sql`
        TRUNCATE TABLE
          appeals, moderation_actions, reports, follows, season_results,
          judge_calibration, judge_scores, division_members, divisions,
          rating_history, ratings, comparisons, eligibility_checks,
          signature_entries, set_piece_entries, set_pieces, tracks,
          seasons, categories, profiles
        RESTART IDENTITY CASCADE
      `);
      await tx.execute(
        sql`DELETE FROM neon_auth."user" WHERE email LIKE ${'%@' + SEED_EMAIL_DOMAIN}`,
      );

      /* ---------------------------------------------------------------------------
       * Categories. Two disciplines — competitors are only ever compared within one.
       * ------------------------------------------------------------------------- */
      const [bharatanatyam, metalVocals] = await tx
        .insert(schema.categories)
        .values([
          { slug: 'bharatanatyam', name: 'Bharatanatyam' },
          { slug: 'metal-vocals', name: 'Metal Vocals' },
        ])
        .returning({ id: schema.categories.id, slug: schema.categories.slug });

      if (bharatanatyam === undefined || metalVocals === undefined) {
        throw new Error('Failed to seed categories');
      }

      /*
       * Sub-styles. Onboarding asks for a discipline and then a style within it, so the
       * seed needs a real tree rather than two orphan roots — otherwise step 3 of
       * onboarding has nothing to show and is untestable.
       */
      await tx.insert(schema.categories).values([
        { slug: 'bharatanatyam-nritta', name: 'Nritta (pure dance)', parentId: bharatanatyam.id },
        {
          slug: 'bharatanatyam-abhinaya',
          name: 'Abhinaya (expression)',
          parentId: bharatanatyam.id,
        },
        { slug: 'bharatanatyam-varnam', name: 'Varnam', parentId: bharatanatyam.id },
        { slug: 'metal-vocals-clean', name: 'Clean vocals', parentId: metalVocals.id },
        { slug: 'metal-vocals-fry', name: 'Fry scream', parentId: metalVocals.id },
        { slug: 'metal-vocals-gutturals', name: 'Gutturals', parentId: metalVocals.id },
      ]);

      /* ---------------------------------------------------------------------------
       * Seasons. Exactly one open season — the drop everything else hangs off.
       * ------------------------------------------------------------------------- */
      const [openSeason, upcomingSeason] = await tx
        .insert(schema.seasons)
        .values([
          {
            categoryId: bharatanatyam.id,
            number: 1,
            startsAt: daysFromNow(-21),
            endsAt: daysFromNow(21),
            status: 'open',
          },
          {
            categoryId: metalVocals.id,
            number: 1,
            startsAt: daysFromNow(7),
            endsAt: daysFromNow(49),
            status: 'upcoming',
          },
        ])
        .returning({ id: schema.seasons.id });

      if (openSeason === undefined || upcomingSeason === undefined) {
        throw new Error('Failed to seed seasons');
      }

      /* ---------------------------------------------------------------------------
       * Tracks. Licence windows deliberately wide enough to cover the whole drop —
       * the publish trigger rejects anything narrower, which is the point of it.
       * ------------------------------------------------------------------------- */
      const trackRows = await tx
        .insert(schema.tracks)
        .values(
          Array.from({ length: SET_PIECE_COUNT }, (_, i) => ({
            title: `Seed Track ${i + 1}`,
            artist: `Fixture Ensemble ${i + 1}`,
            licensor: 'Arena Seed Licensing (fictional)',
            licenseType: 'direct' as const,
            licenseStartsAt: daysFromNow(-90),
            licenseExpiresAt: daysFromNow(365),
            territory: ['WORLD'],
            usageTerms: 'Seed data only. Not a real licence and not real music.',
            fingerprintRef: `seed-fingerprint-${i + 1}`,
            contractRef: `SEED-CONTRACT-${i + 1}`,
          })),
        )
        .returning({ id: schema.tracks.id });

      /* ---------------------------------------------------------------------------
       * Set pieces. Weeks 1 and 2 are done, week 3 is live — so the seeded app shows
       * both a drop in progress and drops with settled results.
       * ------------------------------------------------------------------------- */
      const setPieceSpecs = [
        {
          weekNo: 1,
          title: 'Alarippu, eight counts',
          briefText:
            'Perform the opening alarippu at a steady eight-count. One unbroken take, full body in frame, no cuts.',
          opensAt: daysFromNow(-21),
          submitBy: daysFromNow(-15),
          judgingEndsAt: daysFromNow(-12),
        },
        {
          weekNo: 2,
          title: 'Adavu chain: tatta to natta',
          briefText:
            'Chain four tatta adavus into four natta adavus without pausing. Feet must stay visible throughout.',
          opensAt: daysFromNow(-14),
          submitBy: daysFromNow(-8),
          judgingEndsAt: daysFromNow(-5),
        },
        {
          weekNo: 3,
          title: 'Abhinaya: one line, three moods',
          briefText:
            'Take a single line of the provided padam and perform it three times, each with a different bhava.',
          opensAt: daysFromNow(-4),
          submitBy: daysFromNow(2),
          judgingEndsAt: daysFromNow(5),
        },
      ];

      const setPieceRows = await tx
        .insert(schema.setPieces)
        .values(
          setPieceSpecs.map((spec, i) => ({
            seasonId: openSeason.id,
            categoryId: bharatanatyam.id,
            weekNo: spec.weekNo,
            title: spec.title,
            briefText: spec.briefText,
            requirements: {
              durationS: 45,
              framing: 'full-body',
              takes: 1,
              wardrobe: 'practice-wear',
            },
            trackId: trackRows[i]?.id ?? null,
            creatorCredit: 'Seeded brief — not authored by a real choreographer',
            opensAt: spec.opensAt,
            submitBy: spec.submitBy,
            judgingEndsAt: spec.judgingEndsAt,
            // Passes the licence trigger only because the tracks above cover the window.
            status: 'published' as const,
          })),
        )
        .returning({ id: schema.setPieces.id });

      /* ---------------------------------------------------------------------------
       * Identities and profiles.
       * ------------------------------------------------------------------------- */
      const competitorIds = Array.from({ length: COMPETITOR_COUNT }, () => randomUUID());
      const now = new Date();

      await tx.insert(authUsers).values(
        competitorIds.map((id, i) => ({
          id,
          name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
          email: `competitor-${i + 1}@${SEED_EMAIL_DOMAIN}`,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })),
      );

      await tx.insert(schema.profiles).values(
        competitorIds.map((id, i) => {
          // A spread of ages, all adults: seeding minors' data, even fake, sets a habit
          // we do not want. Core rule 7 is about how we treat this data by default.
          const birthYear = now.getUTCFullYear() - randInt(19, 41);
          return {
            userId: id,
            displayName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
            handle: `competitor_${i + 1}`,
            dob: `${birthYear}-0${randInt(1, 9)}-1${randInt(0, 9)}`,
            country: 'IN',
            city: pick(['Chennai', 'Bengaluru', 'Mumbai', 'Kochi', 'Pune']),
            isJudge: true,
            phoneVerified: rand() > 0.4,
            // Everyone here has judged past the threshold — that is WHY they may enter.
            comparisonsCompleted: randInt(UNLOCK_THRESHOLD, UNLOCK_THRESHOLD * 4),
            competeUnlockedAt: daysFromNow(-randInt(22, 60)),
          };
        }),
      );

      /* ---------------------------------------------------------------------------
       * Entries. One per competitor per brief (a unique constraint enforces it), so
       * entrants are drawn from a shuffled roster rather than picked at random.
       * ------------------------------------------------------------------------- */
      const entryValues: Array<typeof schema.setPieceEntries.$inferInsert> = [];

      for (const setPiece of setPieceRows) {
        const roster = [...competitorIds];
        // Fisher-Yates, on the deterministic PRNG.
        for (let i = roster.length - 1; i > 0; i -= 1) {
          const j = randInt(0, i);
          const a = roster[i];
          const b = roster[j];
          if (a !== undefined && b !== undefined) {
            roster[i] = b;
            roster[j] = a;
          }
        }

        for (const userId of roster.slice(0, ENTRIES_PER_SET_PIECE)) {
          entryValues.push({
            userId,
            setPieceId: setPiece.id,
            seasonId: openSeason.id,
            categoryId: bharatanatyam.id,
            videoSource: 'fixture',
            fixturePath: `/fixtures/clip-${String(randInt(1, FIXTURE_CLIPS)).padStart(2, '0')}.mp4`,
            durationMs: randInt(38_000, 52_000),
            status: 'eligible',
          });
        }
      }

      const entryRows = await tx.insert(schema.setPieceEntries).values(entryValues).returning({
        id: schema.setPieceEntries.id,
        userId: schema.setPieceEntries.userId,
        setPieceId: schema.setPieceEntries.setPieceId,
      });

      // Every eligible entry got there by passing its checks. Say so in the data.
      await tx.insert(schema.eligibilityChecks).values(
        entryRows.flatMap((entry) =>
          (['duration', 'framing', 'takes'] as const).map((checkType) => ({
            entryId: entry.id,
            checkType,
            status: 'pass' as const,
            score: 1,
            detail: { seeded: true },
          })),
        ),
      );

      /* ---------------------------------------------------------------------------
       * Comparisons — the atomic unit of the rating system, and the reason this seed
       * exists. A voter is never paired against their own entry (a trigger enforces
       * it), and both entries always share a brief (a composite foreign key does).
       * ------------------------------------------------------------------------- */
      const entriesBySetPiece = new Map<string, typeof entryRows>();
      for (const entry of entryRows) {
        const list = entriesBySetPiece.get(entry.setPieceId) ?? [];
        list.push(entry);
        entriesBySetPiece.set(entry.setPieceId, list);
      }

      const comparisonValues: Array<typeof schema.comparisons.$inferInsert> = [];
      let attempts = 0;

      while (comparisonValues.length < COMPARISON_COUNT && attempts < COMPARISON_COUNT * 20) {
        attempts += 1;

        const setPiece = pick(setPieceRows);
        const pool = entriesBySetPiece.get(setPiece.id) ?? [];
        if (pool.length < 2) continue;

        const voterId = pick(competitorIds);
        const eligible = pool.filter((entry) => entry.userId !== voterId);
        if (eligible.length < 2) continue;

        const a = pick(eligible);
        const b = pick(eligible);
        if (a.id === b.id) continue;

        // ~8% left undecided, so the voting screen has in-flight pairs to render too.
        const decided = rand() > 0.08;
        const shownAt = daysFromNow(-randInt(1, 18));

        comparisonValues.push({
          setPieceId: setPiece.id,
          voterId,
          entryA: a.id,
          entryB: b.id,
          winnerEntryId: decided ? (rand() > 0.5 ? a.id : b.id) : null,
          shownAt,
          decidedAt: decided ? new Date(shownAt.getTime() + randInt(4, 40) * 1000) : null,
          voterWeight: Number(normal(1, 0.15).toFixed(3)),
          isCounted: true,
        });
      }

      // Chunked: a single 800-row insert exceeds what one statement handles comfortably.
      for (let i = 0; i < comparisonValues.length; i += 200) {
        await tx.insert(schema.comparisons).values(comparisonValues.slice(i, i + 200));
      }

      /* ---------------------------------------------------------------------------
       * Ratings. Derived here from nothing in particular — Prompt 10 computes these
       * from the comparisons above. Seeded so leaderboards and divisions have shape.
       * ------------------------------------------------------------------------- */
      const seededRatings = competitorIds.map((userId) => {
        const rating = Math.round(normal(1500, 180));
        return {
          userId,
          categoryId: bharatanatyam.id,
          rating,
          ratingDeviation: Math.round(normal(90, 35) + 40),
          volatility: 0.06,
        };
      });

      await tx.insert(schema.ratings).values(seededRatings);

      await tx.insert(schema.ratingHistory).values(
        seededRatings.map((entry) => ({
          userId: entry.userId,
          categoryId: entry.categoryId,
          seasonId: openSeason.id,
          rating: entry.rating,
          ratingDeviation: entry.ratingDeviation,
          volatility: entry.volatility,
          comparisonsInPeriod: randInt(6, 40),
          periodStartedAt: daysFromNow(-14),
          periodEndedAt: daysFromNow(-7),
        })),
      );

      /* ---------------------------------------------------------------------------
       * Divisions. Core rule 5: most people should be able to win where they stand.
       * ------------------------------------------------------------------------- */
      const ranked = [...seededRatings].sort((a, b) => b.rating - a.rating);
      const divisionCount = Math.ceil(ranked.length / DIVISION_SIZE);
      const tiers = ['gold', 'silver', 'bronze'] as const;

      const divisionRows = await tx
        .insert(schema.divisions)
        .values(
          Array.from({ length: divisionCount }, (_, i) => ({
            seasonId: openSeason.id,
            tier: tiers[Math.min(i, tiers.length - 1)] ?? 'bronze',
            name: `Season 1 · Division ${i + 1}`,
          })),
        )
        .returning({ id: schema.divisions.id });

      await tx.insert(schema.divisionMembers).values(
        ranked.map((entry, index) => {
          const divisionIndex = Math.floor(index / DIVISION_SIZE);
          const division = divisionRows[Math.min(divisionIndex, divisionRows.length - 1)];
          if (division === undefined) throw new Error('No division for competitor');
          return {
            divisionId: division.id,
            userId: entry.userId,
            points: randInt(0, 240),
            position: (index % DIVISION_SIZE) + 1,
          };
        }),
      );

      /* ---------------------------------------------------------------------------
       * The unranked lane, and the social graph that must never touch a rating.
       * ------------------------------------------------------------------------- */
      await tx.insert(schema.signatureEntries).values(
        Array.from({ length: SIGNATURE_ENTRY_COUNT }, (_, i) => ({
          userId: pick(competitorIds),
          categoryId: bharatanatyam.id,
          title: `Signature piece ${i + 1}`,
          caption: 'Freeform. Affects following only — never rating.',
          videoSource: 'fixture' as const,
          fixturePath: `/fixtures/clip-${String(randInt(1, FIXTURE_CLIPS)).padStart(2, '0')}.mp4`,
          durationMs: randInt(20_000, 60_000),
          status: 'eligible' as const,
        })),
      );

      const followPairs = new Set<string>();
      const followValues: Array<{ followerId: string; followeeId: string }> = [];
      while (followValues.length < 200) {
        const followerId = pick(competitorIds);
        const followeeId = pick(competitorIds);
        const key = `${followerId}:${followeeId}`;
        if (followerId === followeeId || followPairs.has(key)) continue;
        followPairs.add(key);
        followValues.push({ followerId, followeeId });
      }
      await tx.insert(schema.follows).values(followValues);

      console.log(
        [
          'Seeded:',
          `  categories        2 (+ 6 sub-styles)`,
          `  seasons           2 (1 open)`,
          `  tracks            ${trackRows.length}`,
          `  set pieces        ${setPieceRows.length} (all published)`,
          `  competitors       ${competitorIds.length}`,
          `  set piece entries ${entryRows.length} (all eligible)`,
          `  comparisons       ${comparisonValues.length}`,
          `  signature entries ${SIGNATURE_ENTRY_COUNT}`,
          `  follows           ${followValues.length}`,
        ].join('\n'),
      );
    });
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
