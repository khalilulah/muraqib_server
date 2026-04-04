import { pool } from "../config/db";
import { env } from "../config/env";

const QF_API_BASE = "https://api.quran.foundation/api/v4";

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
): Promise<any> {
  const token = await getQFToken(userId);

  // If user hasn't connected QF account, skip silently
  // Our own DB handles the fallback
  if (!token) return null;

  const response = await fetch(`${QF_API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-auth-token": token,
      "x-client-id": env.qf.clientId,
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
export async function logQFActivityDay(userId: string) {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  await qfRequest(userId, "POST", "/activity-days", {
    date: today,
    type: "QURAN",
  });
}

// ── Get user's streak from QF ─────────────────────────────
export async function getQFStreak(userId: string) {
  return qfRequest(userId, "GET", "/streaks?type=QURAN&status=ACTIVE&first=1");
}
