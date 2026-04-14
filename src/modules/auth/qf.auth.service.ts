import crypto from "crypto";
import { pool } from "../../config/db";
import { env } from "../../config/env";

const QF_AUTH_URL = `${env.qf.baseUrl}/oauth2/auth`;
const QF_TOKEN_URL = `${env.qf.baseUrl}/oauth2/token`;

// ── PKCE Helpers ──────────────────────────────────────────
function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generatePkcePair() {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const hash = crypto.createHash("sha256").update(codeVerifier).digest();
  const codeChallenge = base64url(hash);
  return { codeVerifier, codeChallenge };
}

// ── Step 1: Generate QF login URL ─────────────────────────
export async function getAuthorizationUrl(userId: string): Promise<string> {
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = crypto.randomBytes(16).toString("hex");

  // Store in DB instead of in-memory Map — works across serverless instances
  await pool.query(
    `INSERT INTO oauth_states (state, user_id, code_verifier)
     VALUES ($1, $2, $3)`,
    [state, userId, codeVerifier],
  );

  const params = new URLSearchParams({
    client_id: env.qf.clientId,
    redirect_uri: env.qf.redirectUri,
    response_type: "code",
    scope: "openid offline_access activity_day streak",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${QF_AUTH_URL}?${params.toString()}`;
}

// ── Step 2: Exchange code for tokens ──────────────────────
export async function handleCallback(code: string, state: string) {
  // Look up state from DB
  const stateResult = await pool.query(
    `DELETE FROM oauth_states
     WHERE state = $1 AND expires_at > NOW()
     RETURNING user_id, code_verifier`,
    [state],
  );

  // DELETE ... RETURNING gives us the row and removes it atomically
  // If nothing returned: state expired or never existed
  if (stateResult.rows.length === 0) {
    throw new Error("INVALID_STATE");
  }

  const { user_id: userId, code_verifier: codeVerifier } = stateResult.rows[0];

  // Exchange code for tokens
  const credentials = Buffer.from(
    `${env.qf.clientId}:${env.qf.clientSecret}`,
  ).toString("base64");

  const response = await fetch(QF_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.qf.redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    error?: string;
  };

  if (!response.ok) {
    console.error("[QF OAuth] Token exchange failed:", data);
    throw new Error("QF_TOKEN_EXCHANGE_FAILED");
  }

  // Save tokens to DB
  await pool.query(
    `UPDATE users
     SET qf_access_token = $1,
         qf_refresh_token = $2,
         qf_token_expires_at = NOW() + ($3 || ' seconds')::INTERVAL,
         qf_connected = true
     WHERE id = $4`,
    [data.access_token, data.refresh_token, data.expires_in, userId],
  );

  return { connected: true, userId };
}
