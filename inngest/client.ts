import { Inngest, eventType, staticSchema } from 'inngest';

/**
 * The Inngest client, and the event vocabulary of the drop.
 *
 * Events are typed up front rather than accumulated ad hoc, because they are the seam
 * every later prompt hangs off: the rating engine (Prompt 10) waits for judging to close,
 * notifications (Prompt 18) wait for a brief to open, and season rollover (Prompt 11)
 * waits for results. Naming them now means those prompts subscribe rather than poll.
 *
 * Past tense throughout: an event records something that has already happened. A function
 * that emits `drop/entries.closed` before closing entries is lying to every subscriber.
 *
 * `staticSchema` gives full TypeScript types with no runtime validation and no validation
 * library — these events are emitted only by our own scheduled functions, from data we
 * just read out of our own database, so a parser at the boundary would be checking our
 * own arithmetic. If an event ever arrives from outside, give it a real schema.
 */
export const inngest = new Inngest({ id: 'arena' });

/** A brief became visible and started accepting entries. */
export const dropOpened = eventType('drop/opened', {
  schema: staticSchema<{ setPieceId: string; categoryId: string; weekNo: number }>(),
});

/** The submission deadline passed. Judging can begin. */
export const dropEntriesClosed = eventType('drop/entries.closed', {
  schema: staticSchema<{ setPieceId: string; categoryId: string; entryCount: number }>(),
});

/** The judging window ended. Prompt 10 recomputes ratings from here. */
export const dropJudgingClosed = eventType('drop/judging.closed', {
  schema: staticSchema<{ setPieceId: string; categoryId: string }>(),
});

/**
 * No brief is published for a category that is about to need one.
 *
 * A missed drop breaks the ritual, and the ritual is the product — so this is the one
 * event in the system that is meant to wake a person up.
 */
export const dropMissingWarning = eventType('drop/missing.warning', {
  schema: staticSchema<{
    categoryId: string;
    categoryName: string;
    expectedOpenAt: string;
    hoursRemaining: number;
  }>(),
});
