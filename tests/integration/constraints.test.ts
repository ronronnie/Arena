// @vitest-environment node

/**
 * Integration tests for the guarantees that live in Postgres rather than in TypeScript.
 *
 * The prompt pack asks for the licensing rule to be "enforced with a trigger, not
 * application code" and for a test that proves it fails. A unit test with a mocked client
 * cannot prove that: the trigger either exists in the database or it does not, and only a
 * real database can say which.
 *
 * Every test runs inside a transaction that is ALWAYS rolled back, so this suite leaves
 * nothing behind — it can be pointed at the same development database as the seed without
 * disturbing it.
 *
 * Skipped, not failed, when there is no DATABASE_URL. `npm run check` has to pass on a
 * fresh clone with no credentials; a suite that fails there teaches people to ignore it.
 */

import { config } from 'dotenv';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

config({ path: ['.env.local', '.env'], quiet: true });

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const describeIfDb = connectionString ? describe : describe.skip;

describeIfDb('database-enforced rules', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  /** Run `body` inside a transaction and always roll back. */
  async function inRollback<T>(body: (c: Client) => Promise<T>): Promise<T> {
    await client.query('BEGIN');
    try {
      return await body(client);
    } finally {
      await client.query('ROLLBACK');
    }
  }

  /** The minimum world a set piece needs: a category, a season, and a track. */
  async function scaffold(
    c: Client,
    licence: { startsAt: string; expiresAt: string },
  ): Promise<{ categoryId: string; seasonId: string; trackId: string }> {
    const category = await c.query<{ id: string }>(
      `INSERT INTO categories (slug, name) VALUES ($1, $1) RETURNING id`,
      [`test-${Math.random().toString(36).slice(2, 10)}`],
    );
    const categoryId = category.rows[0]!.id;

    const season = await c.query<{ id: string }>(
      `INSERT INTO seasons (category_id, number, starts_at, ends_at, status)
       VALUES ($1, 1, now() - interval '30 days', now() + interval '30 days', 'open')
       RETURNING id`,
      [categoryId],
    );

    const track = await c.query<{ id: string }>(
      `INSERT INTO tracks
         (title, artist, licensor, license_type, license_starts_at, license_expires_at,
          territory, usage_terms)
       VALUES ('T', 'A', 'L', 'direct', $1, $2, ARRAY['WORLD'], 'test')
       RETURNING id`,
      [licence.startsAt, licence.expiresAt],
    );

    return { categoryId, seasonId: season.rows[0]!.id, trackId: track.rows[0]!.id };
  }

  const insertSetPiece = (
    c: Client,
    input: {
      seasonId: string;
      categoryId: string;
      trackId: string | null;
      status: string;
      weekNo?: number;
    },
  ): Promise<unknown> =>
    c.query(
      `INSERT INTO set_pieces
         (season_id, category_id, week_no, title, brief_text, track_id,
          opens_at, submit_by, judging_ends_at, status)
       VALUES ($1, $2, $3, 'Brief', 'Do the thing', $4,
               now() - interval '5 days', now() + interval '1 day',
               now() + interval '4 days', $5)`,
      [input.seasonId, input.categoryId, input.weekNo ?? 1, input.trackId, input.status],
    );

  /* -------------------------------------------------------------------------------
   * The licensing gate
   * ----------------------------------------------------------------------------- */

  describe('a set piece cannot publish without a licence covering the whole drop', () => {
    it('rejects publishing with no track at all', async () => {
      await inRollback(async (c) => {
        const { categoryId, seasonId } = await scaffold(c, {
          startsAt: new Date(Date.now() - 365 * 86400_000).toISOString(),
          expiresAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
        });

        await expect(
          insertSetPiece(c, { seasonId, categoryId, trackId: null, status: 'published' }),
        ).rejects.toThrow(/no track_id/);
      });
    });

    it('rejects publishing when the licence expires before judging ends', async () => {
      await inRollback(async (c) => {
        // Licence lapses tomorrow; judging runs for four more days.
        const { categoryId, seasonId, trackId } = await scaffold(c, {
          startsAt: new Date(Date.now() - 30 * 86400_000).toISOString(),
          expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        });

        await expect(
          insertSetPiece(c, { seasonId, categoryId, trackId, status: 'published' }),
        ).rejects.toThrow(/licence covers/);
      });
    });

    it('rejects publishing when the licence starts after the drop opens', async () => {
      await inRollback(async (c) => {
        const { categoryId, seasonId, trackId } = await scaffold(c, {
          startsAt: new Date(Date.now() - 86400_000).toISOString(),
          expiresAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
        });

        await expect(
          insertSetPiece(c, { seasonId, categoryId, trackId, status: 'published' }),
        ).rejects.toThrow(/licence covers/);
      });
    });

    it('allows a DRAFT with a lapsed licence — only publishing is gated', async () => {
      await inRollback(async (c) => {
        const { categoryId, seasonId, trackId } = await scaffold(c, {
          startsAt: new Date(Date.now() - 30 * 86400_000).toISOString(),
          expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        });

        await expect(
          insertSetPiece(c, { seasonId, categoryId, trackId, status: 'draft' }),
        ).resolves.toBeDefined();
      });
    });

    it('allows publishing when the licence covers the whole drop', async () => {
      await inRollback(async (c) => {
        const { categoryId, seasonId, trackId } = await scaffold(c, {
          startsAt: new Date(Date.now() - 30 * 86400_000).toISOString(),
          expiresAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
        });

        await expect(
          insertSetPiece(c, { seasonId, categoryId, trackId, status: 'published' }),
        ).resolves.toBeDefined();
      });
    });

    it('rejects a later UPDATE to published, not just an INSERT', async () => {
      await inRollback(async (c) => {
        const { categoryId, seasonId, trackId } = await scaffold(c, {
          startsAt: new Date(Date.now() - 30 * 86400_000).toISOString(),
          expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        });

        await insertSetPiece(c, { seasonId, categoryId, trackId, status: 'draft' });

        await expect(
          c.query(`UPDATE set_pieces SET status = 'published' WHERE season_id = $1`, [seasonId]),
        ).rejects.toThrow(/licence covers/);
      });
    });
  });

  /* -------------------------------------------------------------------------------
   * Comparison integrity
   * ----------------------------------------------------------------------------- */

  describe('comparisons', () => {
    /** A published brief with two entries by two different competitors. */
    async function worldWithEntries(c: Client) {
      const { categoryId, seasonId, trackId } = await scaffold(c, {
        startsAt: new Date(Date.now() - 30 * 86400_000).toISOString(),
        expiresAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
      });

      const setPieces = await c.query<{ id: string }>(
        `INSERT INTO set_pieces
           (season_id, category_id, week_no, title, brief_text, track_id,
            opens_at, submit_by, judging_ends_at, status)
         SELECT $1, $2, w, 'Brief ' || w, 'Do it', $3,
                now() - interval '5 days', now() + interval '1 day',
                now() + interval '4 days', 'published'
         FROM generate_series(1, 2) AS w
         RETURNING id`,
        [seasonId, categoryId, trackId],
      );

      const users: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const user = await c.query<{ id: string }>(
          `INSERT INTO neon_auth."user" (name, email, "emailVerified", "updatedAt")
           VALUES ('Test', $1, true, now()) RETURNING id`,
          [`itest-${Math.random().toString(36).slice(2, 12)}@seed.arena.invalid`],
        );
        const userId = user.rows[0]!.id;
        await c.query(
          `INSERT INTO profiles (user_id, display_name, handle) VALUES ($1, 'Test', $2)`,
          [userId, `itest_${Math.random().toString(36).slice(2, 12)}`],
        );
        users.push(userId);
      }

      const entryFor = async (userId: string, setPieceId: string): Promise<string> => {
        const row = await c.query<{ id: string }>(
          `INSERT INTO set_piece_entries
             (user_id, set_piece_id, season_id, category_id, video_source, fixture_path, status)
           VALUES ($1, $2, $3, $4, 'fixture', '/fixtures/clip-01.mp4', 'eligible')
           RETURNING id`,
          [userId, setPieceId, seasonId, categoryId],
        );
        return row.rows[0]!.id;
      };

      const briefOne = setPieces.rows[0]!.id;
      const briefTwo = setPieces.rows[1]!.id;

      return {
        briefOne,
        briefTwo,
        voter: users[2]!,
        entryOneA: await entryFor(users[0]!, briefOne),
        entryOneB: await entryFor(users[1]!, briefOne),
        entryTwoA: await entryFor(users[0]!, briefTwo),
        competitorA: users[0]!,
      };
    }

    it('refuses a pair drawn from two different briefs', async () => {
      await inRollback(async (c) => {
        const w = await worldWithEntries(c);

        // entryTwoA is on briefTwo; the comparison claims briefOne. The composite foreign
        // key has nothing to match, so this cannot be inserted at all.
        await expect(
          c.query(
            `INSERT INTO comparisons (set_piece_id, voter_id, entry_a, entry_b)
             VALUES ($1, $2, $3, $4)`,
            [w.briefOne, w.voter, w.entryOneA, w.entryTwoA],
          ),
        ).rejects.toThrow(/violates foreign key constraint/);
      });
    });

    it('refuses showing a voter their own entry', async () => {
      await inRollback(async (c) => {
        const w = await worldWithEntries(c);

        await expect(
          c.query(
            `INSERT INTO comparisons (set_piece_id, voter_id, entry_a, entry_b)
             VALUES ($1, $2, $3, $4)`,
            [w.briefOne, w.competitorA, w.entryOneA, w.entryOneB],
          ),
        ).rejects.toThrow(/cannot be shown their own entry/);
      });
    });

    it('refuses the same entry on both sides', async () => {
      await inRollback(async (c) => {
        const w = await worldWithEntries(c);

        await expect(
          c.query(
            `INSERT INTO comparisons (set_piece_id, voter_id, entry_a, entry_b)
             VALUES ($1, $2, $3, $3)`,
            [w.briefOne, w.voter, w.entryOneA],
          ),
        ).rejects.toThrow(/comparisons_distinct_entries/);
      });
    });

    it('refuses a winner that was not one of the two entries', async () => {
      await inRollback(async (c) => {
        const w = await worldWithEntries(c);

        await expect(
          c.query(
            `INSERT INTO comparisons
               (set_piece_id, voter_id, entry_a, entry_b, winner_entry_id, decided_at)
             VALUES ($1, $2, $3, $4, $5, now())`,
            [w.briefOne, w.voter, w.entryOneA, w.entryOneB, w.entryTwoA],
          ),
        ).rejects.toThrow(/comparisons_winner_is_a_contender/);
      });
    });

    it('accepts a legitimate pair', async () => {
      await inRollback(async (c) => {
        const w = await worldWithEntries(c);

        await expect(
          c.query(
            `INSERT INTO comparisons (set_piece_id, voter_id, entry_a, entry_b)
             VALUES ($1, $2, $3, $4)`,
            [w.briefOne, w.voter, w.entryOneA, w.entryOneB],
          ),
        ).resolves.toBeDefined();
      });
    });
  });

  /* -------------------------------------------------------------------------------
   * Core rule 3 — the blind view
   * ----------------------------------------------------------------------------- */

  describe('the blind view', () => {
    it('has no identity column, so a blind query cannot leak one', async () => {
      const columns = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'set_piece_entry_blind'`,
      );
      const names = columns.rows.map((row) => row.column_name);

      expect(names.length).toBeGreaterThan(0);
      expect(names).not.toContain('user_id');
      // Nothing that identifies a person by another name, either.
      expect(names.filter((n) => /user|handle|display|profile|email/i.test(n))).toEqual([]);
    });

    it('shows only eligible entries', async () => {
      const leaked = await client.query<{ count: string }>(
        `SELECT count(*) AS count
           FROM set_piece_entry_blind b
           JOIN set_piece_entries e ON e.id = b.id
          WHERE e.status <> 'eligible'`,
      );

      expect(Number(leaked.rows[0]?.count ?? 0)).toBe(0);
    });
  });

  /* -------------------------------------------------------------------------------
   * Core rule 1 — the lanes cannot touch
   * ----------------------------------------------------------------------------- */

  describe('the two lanes are structurally separate', () => {
    it('gives comparisons no column that could reference a signature entry', async () => {
      const fks = await client.query<{ referenced: string }>(
        `SELECT ccu.table_name AS referenced
           FROM information_schema.table_constraints tc
           JOIN information_schema.constraint_column_usage ccu
             ON ccu.constraint_name = tc.constraint_name
          WHERE tc.table_name = 'comparisons' AND tc.constraint_type = 'FOREIGN KEY'`,
      );
      const referenced = new Set(fks.rows.map((row) => row.referenced));

      expect(referenced).toContain('set_piece_entries');
      expect(referenced).not.toContain('signature_entries');
    });

    it('gives signature entries no route to a season or a rating', async () => {
      const columns = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'signature_entries'`,
      );
      const names = columns.rows.map((row) => row.column_name);

      expect(names).not.toContain('season_id');
      expect(names).not.toContain('rating');
      expect(names).not.toContain('set_piece_id');
    });
  });
});
