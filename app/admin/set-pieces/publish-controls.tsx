'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { publishBrief, unpublishBrief, type AdminActionResult } from './actions';

/**
 * Publish and unpublish.
 *
 * When a brief cannot be published the button is disabled AND the reason is shown — a
 * disabled control with no explanation is the most frustrating thing an admin tool can
 * do, and the reason here is specific enough to act on ("the licence ends three days
 * before judging does") rather than a generic refusal.
 */
export function PublishControls({
  setPieceId,
  status,
  blockedBecause,
  hasOpened,
}: {
  setPieceId: string;
  status: string;
  blockedBecause: string | null;
  hasOpened: boolean;
}) {
  const [publishState, publish, publishing] = useActionState<AdminActionResult, FormData>(
    publishBrief,
    undefined,
  );
  const [unpublishState, unpublish, unpublishing] = useActionState<AdminActionResult, FormData>(
    unpublishBrief,
    undefined,
  );

  const problem =
    (publishState && 'problem' in publishState ? publishState.problem : null) ??
    (unpublishState && 'problem' in unpublishState ? unpublishState.problem : null);

  return (
    <div className="flex flex-col gap-2">
      {status === 'draft' || status === 'scheduled' ? (
        <form action={publish} className="flex flex-col gap-2">
          <input type="hidden" name="setPieceId" value={setPieceId} />
          <Button
            type="submit"
            variant="primary"
            disabled={publishing || blockedBecause !== null}
            size="sm"
          >
            {publishing ? 'Publishing' : 'Publish'}
          </Button>
        </form>
      ) : (
        <form action={unpublish} className="flex flex-col gap-2">
          <input type="hidden" name="setPieceId" value={setPieceId} />
          <Button type="submit" variant="outline" size="sm" disabled={unpublishing || hasOpened}>
            {unpublishing ? 'Working' : 'Back to draft'}
          </Button>
          {hasOpened && (
            <p className="text-text-subtle text-xs">
              {/* Withdrawing a brief people are already performing is breaking a promise,
                  not an editorial decision. That path is a moderation action — Prompt 15. */}
              Already open. A live brief can only be withdrawn through moderation.
            </p>
          )}
        </form>
      )}

      {blockedBecause !== null && (
        <p className="text-caution text-xs leading-normal">{blockedBecause}</p>
      )}

      {problem !== null && (
        <p role="alert" className="text-negative text-xs leading-normal">
          {problem}
        </p>
      )}
    </div>
  );
}
