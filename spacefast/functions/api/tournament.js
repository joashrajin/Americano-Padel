// POST /api/tournament — create a new tournament
// GET /api/tournament?id=abc123 — load a tournament

import {
  MAX_PAYLOAD,
  generateId,
  generateToken,
  json,
  jsonError,
  validateCourts,
  validatePointsPerMatch,
  validateRounds,
  validateScores,
  loadTournament,
  idInUse,
  insertTournament,
} from '../_shared.js';

export async function GET(request, { env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id || !/^[a-z0-9]{4,10}$/.test(id)) {
    return jsonError('Invalid id', 400);
  }

  const data = await loadTournament(env.DB, id);
  if (!data) {
    return jsonError('Tournament not found or expired', 404);
  }

  // Strip the edit token and shared admin code before sending to client
  const { editToken, adminCode, ...publicData } = data;
  return json(publicData);
}

export async function POST(request, { env }) {
  let body;
  try {
    body = await request.json();
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
    if (!(await idInUse(env.DB, id))) break;
    if (attempt === 4) return jsonError('Could not generate unique ID, please retry', 500);
  }

  const editToken = generateToken();
  // Short, shareable code that grants score-editing rights to co-organizers
  // (8 chars from a 31-char alphabet ≈ 40 bits — not feasibly guessable online)
  const adminCode = generateId(8);
  const createdAt = new Date().toISOString();

  const data = { editToken, adminCode, players, courts, pointsPerMatch, rounds, scores, createdAt, format: fmt, targetRounds: mexRounds };

  await insertTournament(env.DB, id, data);

  return json({ id, editToken, adminCode }, 201);
}
