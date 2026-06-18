// POST /api/tournament — create a new tournament
// GET /api/tournament?id=abc123 — load a tournament

const TTL = 604800; // 7 days in seconds
const MAX_PAYLOAD = 102400; // ~100KB

function generateId(length) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous chars
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

function generateToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validateCourts(courts) {
  return Number.isInteger(courts) && courts >= 1 && courts <= 4;
}

function validatePointsPerMatch(pts) {
  return Number.isInteger(pts) && pts >= 8 && pts <= 64;
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

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id || !/^[a-z0-9]{4,10}$/.test(id)) {
    return jsonError('Invalid id', 400);
  }

  const data = await context.env.TOURNAMENTS.get(`tournament:${id}`, 'json');
  if (!data) {
    return jsonError('Tournament not found or expired', 404);
  }

  // Strip the edit token and shared admin code before sending to client
  const { editToken, adminCode, ...publicData } = data;
  return new Response(JSON.stringify(publicData), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const { players, courts, pointsPerMatch, rounds, scores, format, targetRounds } = body;

  // Validate required fields exist
  if (!Array.isArray(players) || !Array.isArray(rounds) || !Array.isArray(scores)) {
    return jsonError('Missing required fields', 400);
  }

  // Validate format: default to americano when omitted, but reject unknown values
  // (mexicano plays round-by-round to a target)
  let fmt = 'americano';
  if (format !== undefined) {
    if (format !== 'americano' && format !== 'mexicano') {
      return jsonError('Invalid format', 400);
    }
    fmt = format;
  }
  let mexRounds = null;
  if (fmt === 'mexicano') {
    if (!Number.isInteger(targetRounds) || targetRounds < 2 || targetRounds > 30) {
      return jsonError('Rounds must be 2-30', 400);
    }
    mexRounds = targetRounds;
  }

  // Validate players
  if (players.length > 20 || players.length < 4) {
    return jsonError('Players must be 4-20', 400);
  }
  if (players.some(p => typeof p !== 'string' || p.length > 30 || p.length === 0 || /[<>"'`\x00-\x1f]/.test(p))) {
    return jsonError('Invalid player name', 400);
  }

  // Validate courts and points
  if (!validateCourts(courts)) {
    return jsonError('Courts must be 1-4', 400);
  }
  if (!validatePointsPerMatch(pointsPerMatch)) {
    return jsonError('Points per match must be 8-64', 400);
  }

  // Validate rounds and scores structure
  if (!validateRounds(rounds)) {
    return jsonError('Invalid rounds structure', 400);
  }
  if (!validateScores(scores)) {
    return jsonError('Invalid scores structure', 400);
  }

  // Limit total payload size
  const payloadSize = JSON.stringify(body).length;
  if (payloadSize > MAX_PAYLOAD) {
    return jsonError('Payload too large', 413);
  }

  // Generate unique ID with collision check
  let id;
  for (let attempt = 0; attempt < 5; attempt++) {
    id = generateId(6);
    const existing = await context.env.TOURNAMENTS.get(`tournament:${id}`);
    if (!existing) break;
    if (attempt === 4) return jsonError('Could not generate unique ID, please retry', 500);
  }

  const editToken = generateToken();
  // Short, shareable code that grants score-editing rights to co-organizers
  // (8 chars from a 31-char alphabet ≈ 40 bits — not feasibly guessable online)
  const adminCode = generateId(8);
  const createdAt = new Date().toISOString();

  const data = { editToken, adminCode, players, courts, pointsPerMatch, rounds, scores, createdAt, format: fmt, targetRounds: mexRounds };

  await context.env.TOURNAMENTS.put(`tournament:${id}`, JSON.stringify(data), {
    expirationTtl: TTL,
  });

  return new Response(JSON.stringify({ id, editToken, adminCode }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
