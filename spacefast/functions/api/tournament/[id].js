// PUT /api/tournament/:id — update tournament scores

import {
  generateId,
  json,
  jsonError,
  readJsonBody,
  timingSafeEqual,
  validateRounds,
  validateScores,
  scoresMatchRounds,
  loadTournament,
  saveTournament,
} from '../../_shared.js';

export async function PUT(request, { params, env }) {
  const id = params.id;

  // Validate tournament ID format
  if (!id || !/^[a-z0-9]{4,10}$/.test(id)) {
    return jsonError('Invalid tournament ID', 400);
  }

  const { body, error } = await readJsonBody(request);
  if (error) return error;

  const { editToken, scores, rounds, rotateAdminCode, verifyOnly } = body;
  if (!editToken || typeof editToken !== 'string') {
    return jsonError('Missing credential', 403);
  }

  const data = await loadTournament(env.DB, id);
  if (!data) {
    return jsonError('Tournament not found or expired', 404);
  }

  // Authorize: the credential must match the creator's editToken or the shared admin code
  const isCreator = !!(data.editToken && timingSafeEqual(data.editToken, editToken));
  const isAdmin = isCreator || !!(data.adminCode && timingSafeEqual(data.adminCode, editToken));
  if (!isAdmin) {
    return jsonError('Unauthorized', 403);
  }

  // verifyOnly: validate a credential without modifying data. Used by "join as
  // admin" and by editors on page load to confirm access is still valid. The
  // creator (and only the creator) also gets the current admin code back, so a
  // second device stays in sync after a rotate. adminCode is null if none yet.
  if (verifyOnly) {
    return json({
      ok: true,
      isCreator,
      adminCode: isCreator ? (data.adminCode || null) : undefined,
    });
  }

  // Rotate the shared admin code (creator only) — revokes anyone using the old code
  let newAdminCode;
  if (rotateAdminCode) {
    if (!isCreator) {
      return jsonError('Only the tournament creator can reset the admin code', 403);
    }
    data.adminCode = generateId(8);
    newAdminCode = data.adminCode;
  }

  // Validate and update scores
  if (scores !== undefined) {
    if (!validateScores(scores)) {
      return jsonError('Invalid scores structure', 400);
    }
    data.scores = scores;
  }

  // Validate and update rounds (for bonus rounds)
  if (rounds !== undefined) {
    if (!validateRounds(rounds, data.players)) {
      return jsonError('Invalid rounds structure', 400);
    }
    data.rounds = rounds;
  }

  // Checked on the result, since either half may be sent alone
  if ((scores !== undefined || rounds !== undefined) && !scoresMatchRounds(data.scores, data.rounds)) {
    return jsonError("Scores don't match rounds", 400);
  }

  // Saving refreshes the 7-day expiry, like the old KV TTL
  await saveTournament(env.DB, id, data);

  return json(newAdminCode ? { ok: true, adminCode: newAdminCode } : { ok: true });
}
