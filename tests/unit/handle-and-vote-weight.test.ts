import { describe, expect, it } from 'vitest';
import { PHONE_VERIFIED_VOTE_WEIGHT } from '@/lib/config/hypotheses';
import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  isValidHandle,
  normaliseHandle,
  validateHandle,
} from '@/lib/domain/handle';
import { MAX_VOTE_WEIGHT, explainVoteWeight, voteWeight } from '@/lib/domain/voteWeight';

describe('handles', () => {
  it('accepts the ordinary shapes', () => {
    for (const handle of ['meera', 'meera_iyer', 'competitor_12', 'a1b2', 'x_9']) {
      expect(validateHandle(handle), handle).toEqual([]);
    }
  });

  it('folds case, so one handle cannot impersonate another', () => {
    // Without this, `Meera` and `meera` are two rows and one is pretending to be the other.
    expect(normaliseHandle('  MeErA  ')).toBe('meera');
    expect(isValidHandle('MEERA')).toBe(true);
  });

  it('normalises unicode, closing the same hole for composed characters', () => {
    expect(normaliseHandle('ﬁre')).toBe('fire');
  });

  it('enforces the length bounds', () => {
    expect(validateHandle('a'.repeat(HANDLE_MIN_LENGTH - 1))).toContain('too-short');
    expect(validateHandle('a'.repeat(HANDLE_MAX_LENGTH + 1))).toContain('too-long');
    expect(validateHandle('a'.repeat(HANDLE_MAX_LENGTH))).toEqual([]);
  });

  it('rejects characters that do not belong in a public identifier', () => {
    for (const handle of ['meera iyer', 'meera-iyer', 'meera.iyer', 'meera@home', 'méera']) {
      expect(validateHandle(handle), handle).toContain('invalid-characters');
    }
  });

  it('rejects leading, trailing and doubled underscores', () => {
    expect(validateHandle('_meera')).toContain('edge-underscore');
    expect(validateHandle('meera_')).toContain('edge-underscore');
    expect(validateHandle('meera__iyer')).toContain('double-underscore');
  });

  it('gives the specific underscore problem rather than a vague one', () => {
    // "Use lowercase letters, numbers and underscores only" is unhelpful when the user
    // already did that and the real issue is where the underscore is.
    expect(validateHandle('_meera')).not.toContain('invalid-characters');
    expect(validateHandle('meera__iyer')).not.toContain('invalid-characters');
  });

  it('keeps names that would let someone pose as Arena itself', () => {
    for (const handle of ['arena', 'admin', 'moderator', 'official', 'support']) {
      expect(validateHandle(handle), handle).toContain('reserved');
    }
  });

  it('does not reserve a name that merely contains a reserved word', () => {
    expect(validateHandle('arena_fan')).toEqual([]);
    expect(validateHandle('modest')).toEqual([]);
  });
});

describe('vote weight', () => {
  it('starts at one', () => {
    expect(voteWeight({ phoneVerified: false })).toBe(1);
  });

  it('raises a phone-verified judge by the hypothesis, not a hardcoded number', () => {
    expect(voteWeight({ phoneVerified: true })).toBe(PHONE_VERIFIED_VOTE_WEIGHT);
  });

  it('multiplies verification by calibration', () => {
    expect(voteWeight({ phoneVerified: true, calibrationWeight: 1.2 })).toBeCloseTo(
      PHONE_VERIFIED_VOTE_WEIGHT * 1.2,
      4,
    );
  });

  it('treats an uncalibrated judge as counting normally, not as counting for nothing', () => {
    // Everyone starts uncalibrated. A new judge's first session has to be worth something.
    expect(voteWeight({ phoneVerified: false })).toBe(1);
  });

  it('caps the weight, so one judge can never decide a drop alone', () => {
    expect(voteWeight({ phoneVerified: true, calibrationWeight: 99 })).toBe(MAX_VOTE_WEIGHT);
  });

  it('never goes negative', () => {
    expect(voteWeight({ phoneVerified: false, calibrationWeight: -5 })).toBe(0);
  });

  it('survives a non-finite calibration rather than producing NaN', () => {
    // A NaN weight silently poisons every rating it touches.
    expect(voteWeight({ phoneVerified: false, calibrationWeight: Number.NaN })).toBe(1);
  });
});

describe('explaining vote weight (Core rule 6)', () => {
  it('tells an unverified judge what verifying would do, and that it is optional', () => {
    const reasons = explainVoteWeight({ phoneVerified: false }).join(' ');
    expect(reasons).toContain(String(PHONE_VERIFIED_VOTE_WEIGHT));
    expect(reasons).toMatch(/optional/);
  });

  it('tells a verified judge why their vote counts more', () => {
    const reasons = explainVoteWeight({ phoneVerified: true }).join(' ');
    expect(reasons).toMatch(/several accounts/);
  });
});
