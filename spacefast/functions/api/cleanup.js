// GET /api/cleanup — deletes expired tournaments. Run daily by the cron in sf.jsonc.
// It needs no auth: reads already ignore expired rows, so deleting them changes
// nothing anyone can see, and running it more often is harmless.

import { deleteExpired, json } from '../_shared.js';

export async function GET(request, { env }) {
  await deleteExpired(env.DB);
  return json({ ok: true });
}
