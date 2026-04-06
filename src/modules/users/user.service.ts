import { pool } from "../../config/db";

// Get a single user by their ID — used by the /me endpoint
export const getUserById = async (id: string) => {
  const result = await pool.query(
    `SELECT id, email, username, gender, fcm_token, qf_connected,
            qf_token_expires_at, created_at, updated_at
     FROM users WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
};

// Update FCM token — called when the mobile app registers for push notifications
export async function updateFcmToken(userId: string, fcmToken: string) {
  await pool.query(
    `UPDATE users SET fcm_token = $1, updated_at = NOW() WHERE id = $2`,
    [fcmToken, userId],
  );
}
