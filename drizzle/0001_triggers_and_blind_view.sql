-- Custom migration. The three guarantees that cannot be expressed as column constraints.
--
-- Everything here is deliberately in the DATABASE rather than in application code. The
-- test for whether a rule belongs here is simple: if the rule would still need to hold
-- when the write comes from a seed script, an Inngest job, Drizzle Studio, psql, or a
-- future admin tool, then application code is the wrong place for it — those callers
-- never go through our data-access layer.

--------------------------------------------------------------------------------
-- 1. A set piece cannot publish without a licence that covers the whole drop.
--------------------------------------------------------------------------------
-- The commercial rule this encodes: we are asking hundreds of people to perform to a
-- specific track and then hosting the results publicly. If the licence lapses mid-drop we
-- are distributing unlicensed performances by minors, and "the application layer checks
-- it" is not a defence anybody would want to make.
--
-- The window must cover opens_at .. judging_ends_at — the whole lifecycle, not just the
-- submission period. Entries stay publicly viewable while judging runs.

CREATE OR REPLACE FUNCTION set_pieces_require_valid_license()
RETURNS TRIGGER AS $$
DECLARE
  licence RECORD;
BEGIN
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;

  IF NEW.track_id IS NULL THEN
    RAISE EXCEPTION
      'set piece % cannot be published: no track_id, so there is no licence to check',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT t.license_starts_at, t.license_expires_at
    INTO licence
    FROM tracks t
   WHERE t.id = NEW.track_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set piece % cannot be published: track % does not exist',
      NEW.id, NEW.track_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF licence.license_starts_at > NEW.opens_at
     OR licence.license_expires_at < NEW.judging_ends_at THEN
    RAISE EXCEPTION
      'set piece % cannot be published: licence covers % to %, drop runs % to %',
      NEW.id,
      licence.license_starts_at, licence.license_expires_at,
      NEW.opens_at, NEW.judging_ends_at
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_pieces_require_valid_license_trigger
  BEFORE INSERT OR UPDATE ON set_pieces
  FOR EACH ROW
  EXECUTE FUNCTION set_pieces_require_valid_license();

--------------------------------------------------------------------------------
-- 2. A voter is never shown their own entry.
--------------------------------------------------------------------------------
-- Cannot be a CHECK constraint: deciding it requires reading set_piece_entries.user_id,
-- and a CHECK may only look at the row in front of it.
--
-- That both entries belong to the SAME set piece is NOT enforced here — it is already
-- guaranteed declaratively by the composite foreign keys
-- comparisons_entry_{a,b}_same_set_piece_fk, which point at the composite unique
-- set_piece_entries (id, set_piece_id). A foreign key is cheaper and harder to bypass
-- than a trigger, so it does the work wherever it can.

CREATE OR REPLACE FUNCTION comparisons_no_self_vote()
RETURNS TRIGGER AS $$
DECLARE
  offending UUID;
BEGIN
  SELECT e.id
    INTO offending
    FROM set_piece_entries e
   WHERE e.id IN (NEW.entry_a, NEW.entry_b)
     AND e.user_id = NEW.voter_id
   LIMIT 1;

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'voter % cannot be shown their own entry %', NEW.voter_id, offending
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comparisons_no_self_vote_trigger
  BEFORE INSERT OR UPDATE ON comparisons
  FOR EACH ROW
  EXECUTE FUNCTION comparisons_no_self_vote();

--------------------------------------------------------------------------------
-- 3. The blind view — Core rule 3 as a database object.
--------------------------------------------------------------------------------
-- The voting surface reads from here and never from set_piece_entries. There is no
-- user_id column in this view: not hidden, not filtered out, absent. A blind query
-- therefore cannot leak a competitor's identity by selecting one column too many, which
-- is the failure mode a convention would eventually lose to.
--
-- It also carries only eligible entries, so an entry still processing, withdrawn, or
-- rejected cannot be put in front of a voter.

CREATE VIEW set_piece_entry_blind AS
SELECT
  e.id,
  e.set_piece_id,
  e.video_source,
  e.mux_playback_id,
  e.fixture_path,
  e.duration_ms,
  e.created_at
FROM set_piece_entries e
WHERE e.status = 'eligible';

COMMENT ON VIEW set_piece_entry_blind IS
  'Core rule 3: blind before, revealed after. Has no user_id by design — do not add one. '
  'Identity is reachable only through revealComparison(), against a recorded vote.';
