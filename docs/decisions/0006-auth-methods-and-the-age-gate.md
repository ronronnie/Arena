# 0006 — Sign-in methods, and where the age gate lives

- **Status:** Accepted
- **Date:** 2026-08-22
- **Context:** Prompt 3

## Context

Prompt 3 asks for three things this repository could not deliver literally:

1. **"Supabase Auth: email magic link + Google."** We are on Neon Auth (ADR 0002), and the
   hosted instance decides which Better Auth plugins are enabled — we do not.
2. **"Phone verification as a separate optional step that increases vote weight."** The
   phone-number plugin is not enabled either.
3. **"Middleware for protected routes."** Next 16 deprecated the `middleware` file
   convention and renamed it to `proxy`.

Rather than guess, the live instance was probed before any code was written:

| Endpoint                                | Result                                       |
| --------------------------------------- | -------------------------------------------- |
| `POST /sign-in/magic-link`              | **404** — plugin not enabled                 |
| `POST /sign-in/social`                  | 400 `PROVIDER_REQUIRED` — plugin **enabled** |
| `POST /sign-in/social` (google)         | **200**, returns a real redirect URL         |
| `POST /sign-in/social` (github)         | 400 `PROVIDER_NOT_SUPPORTED`                 |
| `POST /email-otp/send-verification-otp` | 400 validation error — plugin **enabled**    |
| `POST /phone-number/send-otp`           | **404** — plugin not enabled                 |

## Decision

**Email OTP replaces the magic link. Google is as specified. Phone verification is modelled
but not shipped.**

### Email OTP instead of a magic link

Same promise — no password to invent, none to leak — delivered as a six-digit code rather
than a link. On a phone a code is arguably the better half of the trade: `autocomplete="one-time-code"`
lets the keyboard offer it straight from the notification, whereas a magic link opens
whichever browser owns the mail app and frequently loses the session it was meant to
create.

If the magic-link plugin is enabled later, adding it is a second button in
`sign-in-form.tsx`. Nothing else changes.

### Phone verification: the domain rule ships, the SMS does not

`lib/domain/voteWeight.ts` implements the rule (`PHONE_VERIFIED_VOTE_WEIGHT`, a
hypothesis), `profiles.phone_verified` stores the outcome, and `setPhoneVerified` is in the
data-access layer with its own refusal test. What does not exist is the step that actually
sends an SMS, because there is no provider to send it through.

Note what `setPhoneVerified` does **not** take: a phone number. Arena has no reason to
store one — the number belongs to the verification provider, and what we keep is the single
boolean. A stored phone number for a fifteen-year-old is a contact detail in a database,
and Core rule 7 is largely about not having those.

### `proxy.ts`, and what it deliberately does not do

The file is `proxy.ts` because that is what Next 16 calls it. It answers exactly one
question — is there a session cookie — and redirects to sign-in if not.

It does **not** decide whether onboarding is finished. That needs a profile read, and
Next's own documentation says proxy code runs separately from render code and may be
deployed to the CDN, so a database call there is both wrong and paid on every request. The
onboarding redirect lives in the pages, where the session and profile are already loaded
and cached by `lib/auth/session.ts`.

The cookie check is routing, not authentication. A forged cookie gets past it and is then
rejected by `currentActor()`, which verifies properly.

## The age gate

**`lib/policy/minorPolicy.ts` is the only module that may answer an age question.** The
prompt pack is blunt about this and it is right to be: an age check copied into a profile
page, a leaderboard query and a notification job is three places to drift, and the failure
mode is a thirteen-year-old's city on a public page.

Three decisions inside it are worth recording.

**Unknown is not blocked.** Between signing up and finishing onboarding, every user has no
date of birth. That is `unknown`: protected exactly as a minor, but still allowed an
account, because they have simply not answered yet. A test asserts
`policyForBand('unknown')` equals `policyForBand('minor')` — if those ever diverge, an
account mid-onboarding gets a surface it should not have.

**Everything is computed in UTC, which rounds ages DOWN.** A date of birth is a calendar
date, and "how old are you today" changes at a midnight that is not the same instant
everywhere. A user in Chennai is still 12 to us for the first five and a half hours of
their thirteenth birthday. That is the direction to be wrong in: rounding down delays a
birthday by less than a day, rounding up admits a twelve-year-old silently. Pinned by
tests so it cannot be "fixed" by accident.

**A future date of birth is `invalid`, not `blocked`.** They are different states and they
produce different messages — "check that date" rather than "you are too young", because
they are not.

**A blocked signup writes nothing.** `startOnboarding` runs the gate before the insert, so
a refused signup leaves no profile row and no stored date of birth for a child we have just
told we cannot serve.

## Consequences

**Good**

- Every age question in the codebase has one answer and one place to change it.
- The signup gate is enforced in the data-access layer, so it holds for any caller — the
  form, a future admin tool, a seed.
- `isMinor` on the actor is now real, resolved from the stored date of birth. All three of
  its failure paths (no profile, no date of birth, a thrown lookup) still answer `true`.

**Costs**

- Resolving `isMinor` costs a profile read per request that needs an actor.
  `lib/auth/session.ts` wraps the path in React's `cache`, so it is once per render — but
  it is a read that did not exist before.
- Two sign-in methods depend on plugins we do not control. If Neon disables email OTP,
  Google is the only way in until a password path is added back.
- Phone verification is half-built: the rule and the column exist, the flow does not.

**Revisit if**

- The magic-link or phone plugin is enabled on the instance.
- Legal advice for the launch market raises the age floor. `MIN_SIGNUP_AGE` is in
  `hypotheses.ts` for exactly that, and a test asserts it may only move up.
