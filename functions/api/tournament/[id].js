// PUT /api/tournament/:id — update tournament scores

const TTL = 604800; // 7 days
const MAX_PAYLOAD = 102400; // ~100KB

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const bufA = enc.encode(a.padEnd(64));
  const bufB = enc.encode(b.padEnd(64));
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return a.length === b.length && result === 0;
}

function generateAdminCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous chars
  const arr = new Uint8Array(8); // ~40 bits — not feasibly guessable online
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validateScores(scores) {
  if (!Array.isArray(scores)) return false;
  return scores.every(round =>
    Array.isArray(round) && round.every(s =>
      s && typeof s === 'object' &&
      Object.keys(s).length <= 2 &&
      ('team1' in s) && ('team2' in s) &&
      (s.team1 === '' || (typeof s.team1 === 'number' && s.team1 >= 0 && s.team1 <= 100)) &&
      (s.team2 === '' || (typeof s.team2 === 'number' && s.team2 >= 0 && s.team2 <= 100))
    )
  );
}

function validateRounds(rounds) {
  if (!Array.isArray(rounds) || rounds.length > 30) return false;
  return rounds.every(r =>
    r && typeof r === 'object' &&
    Array.isArray(r.matches) && Array.isArray(r.rest) &&
    r.matches.length <= 4 &&
    r.matches.every(m =>
      m && Array.isArray(m.team1) && Array.isArray(m.team2) &&
      m.team1.length === 2 && m.team2.length === 2 &&
      m.team1.every(p => typeof p === 'string' && p.length <= 30) &&
      m.team2.every(p => typeof p === 'string' && p.length <= 30)
    ) &&
    r.rest.every(p => typeof p === 'string' && p.length <= 30)
  );
}

export async function onRequestPut(context) {
  const id = context.params.id;

  // Validate tournament ID format
  if (!id || !/^[a-z0-9]{4,10}$/.test(id)) {
    return jsonError('Invalid tournament ID', 400);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  // Payload size check
  const payloadSize = JSON.stringify(body).length;
  if (payloadSize > MAX_PAYLOAD) {
    return jsonError('Payload too large', 413);
  }

  const { editToken, scores, rounds, rotateAdminCode, verifyOnly } = body;
  if (!editToken || typeof editToken !== 'string') {
    return jsonError('Missing credential', 403);
  }

  const data = await context.env.TOURNAMENTS.get(`tournament:${id}`, 'json');
  if (!data) {
    return jsonError('Tournament not found or expired', 404);
  }

  // Authorize: the credential must match the creator's editToken or the shared admin code
  const isCreator = !!(data.editToken && timingSafeEqual(data.editToken, editToken));
  const isAdmin = isCreator || !!(data.adminCode && timingSafeEqual(data.adminCode, editToken));
  if (!isAdmin) {
    return jsonError('Unauthorized', 403);
  }

  // verifyOnly: used by "join as admin" to validate a code without modifying data
  if (verifyOnly) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Rotate the shared admin code (creator only) — revokes anyone using the old code
  let newAdminCode;
  if (rotateAdminCode) {
    if (!isCreator) {
      return jsonError('Only the tournament creator can reset the admin code', 403);
    }
    data.adminCode = generateAdminCode();
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
    if (!validateRounds(rounds)) {
      return jsonError('Invalid rounds structure', 400);
    }
    data.rounds = rounds;
  }

  await context.env.TOURNAMENTS.put(`tournament:${id}`, JSON.stringify(data), {
    expirationTtl: TTL, // refresh TTL on every update
  });

  return new Response(JSON.stringify(newAdminCode ? { ok: true, adminCode: newAdminCode } : { ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
