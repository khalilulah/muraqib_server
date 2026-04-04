import crypto from "crypto";
import { pool } from "../../config/db";
import { env } from "../../config/env";

const QF_AUTH_URL = `${env.qf.baseUrl}/oauth2/auth`;
const QF_TOKEN_URL = `${env.qf.baseUrl}/oauth2/token`;

// ─── PKCE Helpers ─────────────────────────────────────────────────────────────

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

// ─── Temporary in-memory store: state → { userId, codeVerifier } ─────────────
// This is fine for a single-instance server (hackathon/MVP)
// For multi-instance production you'd use Redis
const stateStore = new Map<string, { userId: string; codeVerifier: string }>();

// ── Step 1: Generate QF login URL ─────────────────────────────────────────────

export function getAuthorizationUrl(userId: string): string {
  const { codeVerifier, codeChallenge } = generatePkcePair();

  // state is a random string — NOT the userId directly
  const state = crypto.randomBytes(16).toString("hex");

  // Store it so we can look up the userId when QF calls our callback
  stateStore.set(state, { userId, codeVerifier });

  // Auto-clean after 10 minutes (user should complete login by then)
  setTimeout(() => stateStore.delete(state), 10 * 60 * 1000);

  const params = new URLSearchParams({
    client_id: env.qf.clientId,
    redirect_uri: env.qf.redirectUri,
    response_type: "code",
    scope: "openid offline_access activity:write",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${QF_AUTH_URL}?${params.toString()}`;
}

// ── Step 2: Exchange code for tokens ──────────────────────────────────────────

export async function handleCallback(code: string, state: string) {
  // Look up userId and codeVerifier from the state
  const stored = stateStore.get(state);
  if (!stored) {
    throw new Error("INVALID_STATE"); // expired or tampered
  }
  stateStore.delete(state); // one-time use

  const { userId, codeVerifier } = stored;

  // Confidential client: credentials go in Authorization header, NOT the body
  const credentials = Buffer.from(
    `${env.qf.clientId}:${env.qf.clientSecret}`,
  ).toString("base64");

  const response = await fetch(QF_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`, // ← correct for confidential client
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.qf.redirectUri,
      code_verifier: codeVerifier, // ← PKCE verifier
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
