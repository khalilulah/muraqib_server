import { pool } from "../config/db";
import { env } from "../config/env";

const QF_API_BASE = "https://prelive-oauth2.quran.foundation";

// ── Get user's QF access token from DB ────────────────────
async function getQFToken(userId: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT qf_access_token, qf_token_expires_at, qf_connected
     FROM users WHERE id = $1`,
    [userId],
  );
  const user = result.rows[0];

  if (!user || !user.qf_connected || !user.qf_access_token) return null;

  // Check if token is expired
  if (
    user.qf_token_expires_at &&
    new Date(user.qf_token_expires_at) < new Date()
  ) {
    return null; // We'll handle refresh later
  }

  return user.qf_access_token;
}

// ── Make an authenticated request to QF User API ──────────
export async function qfRequest(
  userId: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Promise<any> {
  const token = await getQFToken(userId);
  if (!token) return null;

  const response = await fetch(`${QF_API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-auth-token": token,
      "x-client-id": env.qf.clientId,
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    console.error(`QF API error: ${response.status} on ${path}`);
    return null;
  }

  return response.json();
}

// ── Log an activity day on QF ─────────────────────────────
// Called after every successful recitation
export async function logQFActivityDay(
  userId: string,
  verses: { surahNumber: number; ayahNumber: number }[],
  recordingDurationSeconds: number,
  userTimezone: string = "UTC",
) {
  if (verses.length === 0) return;

  // Build ranges string e.g. "1:1-1:7,2:1-2:4"
  // Group consecutive ayahs into ranges per surah
  const ranges: string[] = [];
  let rangeStart = verses[0]!;
  let rangeEnd = verses[0]!;

  for (let i = 1; i < verses.length; i++) {
    const current = verses[i]!;
    const prev = verses[i - 1]!;

    const consecutive =
      (current.surahNumber === prev.surahNumber &&
        current.ayahNumber === prev.ayahNumber + 1) ||
      (current.surahNumber === prev.surahNumber + 1 &&
        current.ayahNumber === 1);

    if (consecutive) {
      rangeEnd = current;
    } else {
      ranges.push(
        `${rangeStart.surahNumber}:${rangeStart.ayahNumber}-${rangeEnd.surahNumber}:${rangeEnd.ayahNumber}`,
      );
      rangeStart = current;
      rangeEnd = current;
    }
  }

  // Push the last range
  ranges.push(
    `${rangeStart.surahNumber}:${rangeStart.ayahNumber}-${rangeEnd.surahNumber}:${rangeEnd.ayahNumber}`,
  );

  await qfRequest(
    userId,
    "POST",
    "/activity-days",
    {
      type: "QURAN",
      seconds: Math.max(recordingDurationSeconds, 1),
      ranges,
      mushafId: 4, // UthmaniHafs
      date: new Date().toISOString().split("T")[0],
    },
    { "x-timezone": userTimezone },
  );
}

// ── Get user's streak from QF ─────────────────────────────
export async function getQFStreak(userId: string) {
  return qfRequest(userId, "GET", "/streaks?type=QURAN&status=ACTIVE&first=1");
}
