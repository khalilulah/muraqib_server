import { pool } from "../config/db";
import { env } from "../config/env";

// Pre-production user API base URL
const QF_API_BASE = "https://apis-prelive.quran.foundation/auth/v1";

async function getQFToken(userId: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT qf_access_token, qf_refresh_token, qf_token_expires_at, qf_connected
     FROM users WHERE id = $1`,
    [userId],
  );
  const user = result.rows[0];
  if (!user || !user.qf_connected || !user.qf_access_token) return null;

  const expiresAt = new Date(user.qf_token_expires_at);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    return user.qf_access_token;
  }

  // Token expired — refresh it
  if (!user.qf_refresh_token) return null;

  try {
    const credentials = Buffer.from(
      `${env.qf.clientId}:${env.qf.clientSecret}`,
    ).toString("base64");

    const response = await fetch(`${env.qf.baseUrl}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: user.qf_refresh_token,
      }).toString(),
    });

    const data = (await response.json()) as any;
    if (!response.ok) return null;

    await pool.query(
      `UPDATE users
       SET qf_access_token = $1,
           qf_refresh_token = $2,
           qf_token_expires_at = NOW() + ($3 || ' seconds')::INTERVAL
       WHERE id = $4`,
      [data.access_token, data.refresh_token, data.expires_in, userId],
    );

    return data.access_token;
  } catch {
    return null;
  }
}

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

// ── Log activity day after successful recitation ───────────
export async function logQFActivityDay(
  userId: string,
  verses: { surahNumber: number; ayahNumber: number }[],
  recordingDurationSeconds: number,
) {
  if (verses.length === 0) return;

  // Build ranges e.g. ["1:1-1:7", "2:2-2:5"]
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
  ranges.push(
    `${rangeStart.surahNumber}:${rangeStart.ayahNumber}-${rangeEnd.surahNumber}:${rangeEnd.ayahNumber}`,
  );

  const result = await qfRequest(
    userId,
    "POST",
    "/activity-days",
    {
      type: "QURAN",
      seconds: Math.max(recordingDurationSeconds, 1),
      ranges,
      mushafId: 4,
      date: new Date().toISOString().split("T")[0],
    },
    { "x-timezone": "UTC" },
  );

  if (result) {
    console.log("✅ QF activity day logged:", ranges.join(", "));
  }
}

// ── Get activity days for display ─────────────────────────
export async function getQFActivityDays(userId: string) {
  return qfRequest(userId, "GET", "/activity-days?type=QURAN&first=30");
}

// ── Get streak ─────────────────────────────────────────────
export async function getQFStreak(userId: string) {
  return qfRequest(userId, "GET", "/streaks?type=QURAN&status=ACTIVE&first=1");
}
