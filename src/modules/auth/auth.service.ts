import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../../config/db";
import { env } from "../../config/env";

// ── Register ──────────────────────────────────────────────
export async function register(data: {
  email: string;
  username: string;
  password: string;
  gender: "male" | "female";
}) {
  // 1. Check if email or username already exists
  const existing = await pool.query(
    `SELECT id FROM users WHERE email = $1 OR username = $2`,
    [data.email, data.username],
  );
  if (existing.rows.length > 0) {
    throw new Error("EMAIL_OR_USERNAME_TAKEN");
  }

  // 2. Hash the password — never store plain text
  const passwordHash = await bcrypt.hash(data.password, 12);

  // 3. Insert the new user and return their id + email
  const result = await pool.query(
    `INSERT INTO users (email, username, password_hash, gender)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, username, gender, created_at`,
    [data.email, data.username, passwordHash, data.gender],
  );

  return result.rows[0];
}

// ── Login ─────────────────────────────────────────────────
export async function login(data: { email: string; password: string }) {
  // 1. Find user by email
  const result = await pool.query(
    `SELECT id, email, username, password_hash, gender, qf_connected
   FROM users WHERE email = $1`,
    [data.email],
  );
  const user = result.rows[0];

  // 2. If no user found, fail with a vague message (security best practice)
  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  // 3. Compare submitted password against stored hash
  const isValid = await bcrypt.compare(data.password, user.password_hash);
  if (!isValid) {
    throw new Error("INVALID_CREDENTIALS");
  }

  // 4. Generate access token — short lived (15 mins)
  const accessToken = jwt.sign(
    { id: user.id, email: user.email },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn as any },
  );

  // 5. Generate refresh token — long lived (7 days)
  const refreshToken = jwt.sign(
    { id: user.id, email: user.email },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn as any },
  );

  // 6. Store refresh token in DB so we can invalidate it later
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
    [user.id, refreshToken],
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      gender: user.gender,
      qfConnected: user.qf_connected,
    },
    accessToken,
    refreshToken,
  };
}

export async function refreshAccessToken(refreshToken: string) {
  // 1. Verify the refresh token is valid and not tampered
  let payload: any;
  try {
    payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
  } catch {
    throw new Error("INVALID_REFRESH_TOKEN");
  }

  // 2. Check it exists in DB (not revoked/logged out)
  const result = await pool.query(
    `SELECT id FROM refresh_tokens 
     WHERE token = $1 AND expires_at > NOW()`,
    [refreshToken],
  );
  if (!result.rows[0]) {
    throw new Error("INVALID_REFRESH_TOKEN");
  }

  // 3. Issue a new access token
  const accessToken = jwt.sign(
    { id: payload.id, email: payload.email },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn as any },
  );

  return { accessToken };
}
