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

export function validateRounds(rounds) {
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
