import { pool } from "../../config/db";
import { env } from "../../config/env";

const QF_AUTH_URL = `${env.qf.baseUrl}/oauth2/auth`;
const QF_TOKEN_URL = `${env.qf.baseUrl}/oauth2/token`;

// ── Step 1: Generate the Quran Foundation login URL ───────
// Mobile app opens this URL in a browser
export function getAuthorizationUrl() {
  const params = new URLSearchParams({
    client_id: env.qf.clientId,
    redirect_uri: env.qf.redirectUri,
    response_type: "code",
    scope: "openid profile streaks bookmarks",
  });

  return `${QF_AUTH_URL}?${params.toString()}`;
}

// ── Step 2: Exchange the code for tokens ──────────────────
// Called automatically when QF redirects to our callback URL
export async function handleCallback(code: string, userId: string) {
  // 1. Exchange authorization code for access + refresh tokens
  const response = await fetch(QF_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.qf.redirectUri,
      client_id: env.qf.clientId,
      client_secret: env.qf.clientSecret,
    }),
  });

  const data = (await response.json()) as any;
  if (!response.ok) throw new Error("QF_TOKEN_EXCHANGE_FAILED");

  // 2. Store tokens in our DB against the user
  await pool.query(
    `UPDATE users
     SET qf_access_token = $1,
         qf_refresh_token = $2,
         qf_token_expires_at = NOW() + ($3 || ' seconds')::INTERVAL,
         qf_connected = true
     WHERE id = $4`,
    [data.access_token, data.refresh_token, data.expires_in, userId],
  );

  return { connected: true };
}
