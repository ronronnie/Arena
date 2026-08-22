import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { dropGuard } from '@/inngest/functions/drop-guard';
import { dropLifecycle } from '@/inngest/functions/drop-lifecycle';

/**
 * Where Inngest reaches the application.
 *
 * Both functions are crons, so nothing here fires on its own in a plain `npm run dev` —
 * they need the Inngest dev server (`npx inngest-cli@latest dev`) locally, or the Inngest
 * platform in production. That is deliberate: nothing in the product's correctness depends
 * on a job having run. Phase is derived from the clock, so the screens stay honest whether
 * or not anything is scheduling them.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [dropLifecycle, dropGuard],
});
