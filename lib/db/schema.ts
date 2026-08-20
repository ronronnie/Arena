/**
 * Drizzle schema.
 *
 * PLACEHOLDER — the domain model lands in Prompt 1 (competitors, entries, lanes,
 * seasons, categories, divisions, comparisons, ratings, briefs, drops).
 *
 * Two things that must hold when it does:
 *   - Core rule 1: Set Piece and Signature are separate lanes. Rating state and
 *     following state must not share a table or a column. Keep them structurally
 *     incapable of contaminating each other, not merely conventionally separate.
 *   - Core rule 3: nothing that joins an entry to an identity may be reachable by a
 *     voter before their vote is recorded. Model the reveal as a state change, not as
 *     a rendering decision.
 *
 * Neon Auth (Stack) syncs users into the `neon_auth.users_sync` table automatically.
 * Prompt 1 declares that table here as a read-only reference and hangs the Arena
 * profile off it rather than duplicating identity.
 */

export {};
