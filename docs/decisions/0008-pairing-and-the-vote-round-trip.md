# 0008 — Pairing, and why the vote returns the next pair

- **Status:** Accepted
- **Date:** 2026-08-23
- **Context:** Prompt 5

## Context

The voting screen is described in the prompt pack as "the most important surface in the
app", with a target of a decision every eight to twelve seconds. Two design questions had
to be answered before any of it worked.

## Decision 1 — pairing is a pure function, fed by the data layer

`lib/domain/pairing.ts` knows nothing about the database and nothing about who owns an
entry. It receives candidates — an id, a rating, a deviation, a view count — and returns
the best pair. The data-access layer does the excluding (own entry, division-mates, pairs
already seen) before anything reaches it.

That split does two things. It makes the interesting half testable without a database: 19
tests cover information gain, view levelling, the cap, and the fallbacks. And it means the
pairing **could not leak an identity if it tried**, because it is never told one.

The score is `informationGain + 1.4 × viewDeficit`:

- **Information gain** rewards close ratings and high uncertainty. A comparison between two
  entries we already believe are 400 points apart teaches us nothing — we knew who would
  win. Closeness is weighted above uncertainty (0.65 / 0.35), because an uncertain but
  hopelessly lopsided pair is still a wasted vote.
- **View deficit** is driven by the LESS-seen of the two, so pairing a starved entry with a
  popular one still scores well. That is how a new entry gets its first views at all.

The 1.4 multiplier is deliberate: **view levelling has to be able to beat a marginally
better information score**, or "guaranteed attention" is just a sentence in a document.
There is a test asserting exactly that.

Two fallbacks, both chosen to favour the judge:

- When everything is at the view cap, serve past it anyway. The cap spreads attention; it
  does not ration it, and a judge who wants to keep going is worth more than a hypothesis.
- When every uncapped pair has been seen, widen to the full set before giving up.

**On "direct rivals".** The pack lists this separately from division-mates. In this schema
a division IS the rivalry unit — the set of people you are ranked against — so the division
exclusion covers it. If rivalries become a first-class concept in Prompt 17, this needs
revisiting rather than assuming it is still covered.

## Decision 2 — the vote returns the next pair

The obvious design prefetches the next pair with a separate server action while the judge
is still watching the current one. That is what was built first, and it was wrong:
**Next serialises server actions from a client**, so a prefetch in flight delays the vote
queued behind it. The screen appeared to hang, and it got worse the faster somebody voted —
precisely backwards for a surface built around a decision every ten seconds.

`submitVote` now records the decision, reveals, and draws the next pair in one round trip,
with the reveal and the draw running in parallel. One request per decision, and the next
pair is ready exactly when the reveal is dismissed.

The three data-layer functions stay separate and `revealComparison` still refuses without a
recorded decision. This changes how many times the network is crossed, not the rule.

## Consequences

**Good**

- One request per vote, around 1.5 seconds on Neon's HTTP driver.
- Pairing is pure, so its behaviour over a session — that views actually spread — is a unit
  test rather than something you hope is true in production.
- The exclusions are all in one query, and `user_id` never reaches a select list on the
  blind path.

**Costs — stated plainly**

- Pairing is O(n²) over a brief's candidates. A few hundred pairs costs nothing; a brief
  with thousands of entries wants a rating-bucketed shortlist instead of an exhaustive scan.
- A vote is still around eight sequential queries to Neon. Parallelising the reveal and the
  draw took a chunk out of it, but the recording path itself is serial and the HTTP driver
  charges a round trip each time.
- `nextBlindPair` writes a row every time it is called. An abandoned session leaves
  comparisons that were shown and never decided. They are harmless — and genuinely useful
  as a view count — but they are not free.

**Revisit if**

- A brief carries enough entries that the O(n²) scan shows up.
- Vote latency stops being acceptable, in which case the recording path wants the pooled
  WebSocket driver and a transaction (which Prompt 14 needs anyway).

## Four bugs worth recording

All four were found by running the thing, not by reading it.

1. **`VideoTile` wrapped in a "choose" button.** `VideoTile` has its own control inside it,
   so the markup nested a button in a button — invalid HTML, which React reported as a
   hydration mismatch and recovered from by regenerating the tree, wiping the vote in
   progress. It was also a real accessibility fault. The roles are now split the way the
   design intended anyway: tapping a clip unmutes it, and choosing is the explicit button.

2. **`decisionMs` was unbounded.** Before the timing effect runs, `Date.now() - 0` is about
   1.7e12 — past the range of a Postgres `integer`, so the write 500s. Now clamped to ten
   minutes at the data layer, because anything longer is an abandoned tab rather than
   deliberation, and the client sends 0 rather than a fabricated number.

3. **The view count was a correlated subquery per candidate**, scanning the comparisons
   table once for every entry on the brief. Correct, and slow enough to matter. One indexed
   read of the brief's comparisons now answers both view counts and seen-pairs, tallied in
   TypeScript.

4. **The 10-pair Playwright run kept "hanging".** It was not hanging: ten real votes at
   about three seconds each simply outlast Playwright's 30-second default test timeout. The
   error message said so from the first run and I read past it. Worth remembering that a
   timeout message means the timeout, not the assertion inside it.
