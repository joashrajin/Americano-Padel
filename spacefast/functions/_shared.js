// Shared by the tournament API routes. The leading underscore keeps the
// Spacefast file router from exposing this module as a route.

export const TTL_MS = 7 * 24 * 60 * 60 * 1000; // tournaments expire 7 days after their last write
export const MAX_PAYLOAD = 102400; // ~100KB

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous chars

export function generateId(length) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => ALPHABET[b % ALPHABET.length]).join('');
}

export function generateToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const bufA = enc.encode(a.padEnd(64));
  const bufB = enc.encode(b.padEnd(64));
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return a.length === b.length && result === 0;
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonError(msg, status) {
  return json({ error: msg }, status);
}

// Reads a JSON object body, refusing anything over MAX_PAYLOAD bytes before it
// is parsed. Content-Length is checked first, and the stream is capped as well
// in case the header is missing or wrong. Returns { body } or { error }.
export async function readJsonBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_PAYLOAD) {
    return { error: jsonError('Payload too large', 413) };
  }
  const chunks = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PAYLOAD) {
        await reader.cancel();
        return { error: jsonError('Payload too large', 413) };
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { error: jsonError('Invalid JSON', 400) };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: jsonError('Invalid JSON', 400) };
  }
  return { body };
}

// Player names are used as keys in per-player tallies, so prototype names such
// as __proto__ or constructor are refused along with markup characters.
// public/index.html applies the same rule before a tournament is created.
export function isValidPlayerName(p) {
  return typeof p === 'string' && p.length > 0 && p.length <= 30 &&
    !/[<>"'`\x00-\x1f]/.test(p) &&
    !Object.prototype.hasOwnProperty.call(Object.prototype, p);
}

export function validateCourts(courts) {
  return Number.isInteger(courts) && courts >= 1 && courts <= 4;
}

export function validatePointsPerMatch(pts) {
  return Number.isInteger(pts) && pts >= 8 && pts <= 64;
}

export function validateScores(scores) {
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

// Every name in a round must be one of the tournament's players, and nobody can
// appear twice in the same round (on both teams, or playing and resting).
export function validateRounds(rounds, players) {
  if (!Array.isArray(rounds) || rounds.length > 30) return false;
  const roster = new Set(players);
  return rounds.every(r => {
    if (!r || typeof r !== 'object' || !Array.isArray(r.matches) || !Array.isArray(r.rest) ||
        r.matches.length > 4) return false;
    const teamsOk = r.matches.every(m =>
      m && Array.isArray(m.team1) && Array.isArray(m.team2) &&
      m.team1.length === 2 && m.team2.length === 2
    );
    if (!teamsOk) return false;
    const names = r.matches.flatMap(m => [...m.team1, ...m.team2]).concat(r.rest);
    return names.every(p => typeof p === 'string' && roster.has(p)) &&
      new Set(names).size === names.length;
  });
}

// One score entry per match in every round. Viewers compute standings by
// reading rounds[i].matches[j] for each scores[i][j], so a mismatch breaks the page.
export function scoresMatchRounds(scores, rounds) {
  return scores.length === rounds.length &&
    scores.every((rs, i) => rs.length === rounds[i].matches.length);
}

// --- Storage: one row per tournament in the Space's database (env.DB) ---
// env.DB is MySQL behind a D1-style API. Workers declare no schema, so the table
// is created on first use. payload is MEDIUMTEXT because a tournament can reach
// MAX_PAYLOAD, past MySQL's 64KB TEXT limit. Reads skip expired rows, so expiry
// behaves like the old KV TTL even before the cleanup cron deletes them.

let schemaReady;

function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.prepare(
      'CREATE TABLE IF NOT EXISTS tournaments (' +
        'id VARCHAR(16) NOT NULL PRIMARY KEY, ' +
        'payload MEDIUMTEXT NOT NULL, ' +
        'expires_at BIGINT NOT NULL)'
    ).run().catch(err => {
      schemaReady = undefined;
      throw err;
    });
  }
  return schemaReady;
}

export async function loadTournament(db, id) {
  await ensureSchema(db);
  const { results } = await db
    .prepare('SELECT payload FROM tournaments WHERE id = ? AND expires_at > ?')
    .bind(id, Date.now())
    .all();
  return results.length ? JSON.parse(results[0].payload) : null;
}

export async function idInUse(db, id) {
  await ensureSchema(db);
  const { results } = await db.prepare('SELECT id FROM tournaments WHERE id = ?').bind(id).all();
  return results.length > 0;
}

export async function insertTournament(db, id, data) {
  await ensureSchema(db);
  await db
    .prepare('INSERT INTO tournaments (id, payload, expires_at) VALUES (?, ?, ?)')
    .bind(id, JSON.stringify(data), Date.now() + TTL_MS)
    .run();
}

export async function saveTournament(db, id, data) {
  await ensureSchema(db);
  await db
    .prepare('UPDATE tournaments SET payload = ?, expires_at = ? WHERE id = ?')
    .bind(JSON.stringify(data), Date.now() + TTL_MS, id)
    .run();
}

export async function deleteExpired(db) {
  await ensureSchema(db);
  await db.prepare('DELETE FROM tournaments WHERE expires_at <= ?').bind(Date.now()).run();
}
