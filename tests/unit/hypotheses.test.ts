import { describe, expect, it } from 'vitest';
import {
  DIVISION_SIZE,
  HYPOTHESES,
  MAX_VIEWS_PER_ENTRY,
  MIN_COMPETITORS_TO_SHOW_BOARD,
  MIN_SIGNUP_AGE,
  PHONE_VERIFIED_VOTE_WEIGHT,
  PROMOTE_COUNT,
  PROVISIONAL_RD_THRESHOLD,
  RELEGATE_COUNT,
  TARGET_ENTRY_TO_FAN_RATIO,
  UNLOCK_THRESHOLD,
} from '@/lib/config/hypotheses';

describe('hypotheses', () => {
  it('keeps a division solvent — churn cannot exceed the division', () => {
    expect(PROMOTE_COUNT + RELEGATE_COUNT).toBeLessThan(DIVISION_SIZE);
  });

  it('rewards winning more than it punishes losing', () => {
    // The asymmetry is the retention thesis, not an accident. See hypotheses.ts.
    expect(PROMOTE_COUNT).toBeGreaterThan(RELEGATE_COUNT);
  });

  it('never shows a board smaller than a division can fill', () => {
    expect(MIN_COMPETITORS_TO_SHOW_BOARD).toBeLessThanOrEqual(DIVISION_SIZE);
  });

  it('holds every value in a positive, sane range', () => {
    expect(UNLOCK_THRESHOLD).toBeGreaterThan(0);
    expect(MAX_VIEWS_PER_ENTRY).toBeGreaterThan(0);
    expect(PROVISIONAL_RD_THRESHOLD).toBeGreaterThan(0);
    expect(TARGET_ENTRY_TO_FAN_RATIO).toBeGreaterThan(0);
    expect(TARGET_ENTRY_TO_FAN_RATIO).toBeLessThanOrEqual(1);
  });

  it('exposes every constant through the HYPOTHESES map', () => {
    // Admin surfaces and Core rule 6 explanations read from this map.
    expect(Object.keys(HYPOTHESES).sort()).toEqual(
      [
        'DIVISION_SIZE',
        'MAX_VIEWS_PER_ENTRY',
        'MIN_COMPETITORS_TO_SHOW_BOARD',
        'MIN_SIGNUP_AGE',
        'PHONE_VERIFIED_VOTE_WEIGHT',
        'PROMOTE_COUNT',
        'PROVISIONAL_RD_THRESHOLD',
        'RELEGATE_COUNT',
        'TARGET_ENTRY_TO_FAN_RATIO',
        'UNLOCK_THRESHOLD',
      ].sort(),
    );
  });

  it('keeps the signup age floor at or above 13, and phone weight above 1', () => {
    // MIN_SIGNUP_AGE is the one entry here that is really a legal constraint rather than a
    // tuning guess. It lives in this file so nothing hardcodes 13 — but it may only ever
    // move UP, and a change downward should fail rather than ship.
    expect(MIN_SIGNUP_AGE).toBeGreaterThanOrEqual(13);

    // A verified vote that counted the same would make verification pointless; one that
    // counted enormously more would make an unverified judge's session feel worthless.
    expect(PHONE_VERIFIED_VOTE_WEIGHT).toBeGreaterThan(1);
    expect(PHONE_VERIFIED_VOTE_WEIGHT).toBeLessThanOrEqual(2);
  });
});
