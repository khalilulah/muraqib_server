import { pool } from "../../config/db";

// ── Send a partner request ────────────────────────────────
export async function sendPartnerRequest(
  requesterId: string,
  receiverUsername: string,
) {
  // 1. Find the receiver by username
  const receiverResult = await pool.query(
    `SELECT id, gender FROM users WHERE username = $1`,
    [receiverUsername],
  );
  const receiver = receiverResult.rows[0];
  if (!receiver) throw new Error("USER_NOT_FOUND");

  // 2. Fetch requester's gender
  const requesterResult = await pool.query(
    `SELECT gender FROM users WHERE id = $1`,
    [requesterId],
  );
  const requester = requesterResult.rows[0];

  // 3. Same gender rule — partners must be the same gender
  if (requester.gender !== receiver.gender) throw new Error("GENDER_MISMATCH");

  // 4. Can't send a request to yourself
  if (receiver.id === requesterId) throw new Error("CANNOT_PARTNER_YOURSELF");

  // 5. Check if a request already exists between these two users
  const existing = await pool.query(
    `SELECT id FROM partnerships
     WHERE (requester_id = $1 AND receiver_id = $2)
     OR (requester_id = $2 AND receiver_id = $1)`,
    [requesterId, receiver.id],
  );
  if (existing.rows.length > 0) throw new Error("REQUEST_ALREADY_EXISTS");

  // 6. Create the partnership request
  const result = await pool.query(
    `INSERT INTO partnerships (requester_id, receiver_id, status)
     VALUES ($1, $2, 'pending')
     RETURNING *`,
    [requesterId, receiver.id],
  );

  return result.rows[0];
}

// ── Respond to a partner request ─────────────────────────
export async function respondToRequest(
  userId: string,
  partnershipId: string,
  action: "accepted" | "rejected",
) {
  // 1. Find the partnership and confirm this user is the receiver
  const result = await pool.query(
    `SELECT * FROM partnerships WHERE id = $1 AND receiver_id = $2`,
    [partnershipId, userId],
  );
  const partnership = result.rows[0];
  if (!partnership) throw new Error("PARTNERSHIP_NOT_FOUND");
  if (partnership.status !== "pending") throw new Error("ALREADY_RESPONDED");

  // 2. Update the status
  const updated = await pool.query(
    `UPDATE partnerships
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [action, partnershipId],
  );

  return updated.rows[0];
}

// ── Get my current active partner ────────────────────────
export async function getMyPartner(userId: string) {
  const result = await pool.query(
    `SELECT
       u.id,
       u.username,
       u.email,
       u.gender,
       g.surah_number   AS goal_surah_number,
       g.surah_name     AS goal_surah_name,
       g.from_ayah      AS goal_from_ayah,
       g.to_ayah        AS goal_to_ayah,
       g.scheduled_time AS goal_scheduled_time,
       g.goal_type      AS goal_type
     FROM partnerships p
     JOIN users u ON u.id = (
       CASE
         WHEN p.requester_id = $1 THEN p.receiver_id
         ELSE p.requester_id
       END
     )
     LEFT JOIN recitation_goals g
       ON g.user_id = u.id AND g.is_active = true
     WHERE (p.requester_id = $1 OR p.receiver_id = $1)
       AND p.status = 'accepted'
     LIMIT 1`,
    [userId],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    gender: row.gender,
    goal: row.goal_surah_name
      ? {
          surahNumber: row.goal_surah_number,
          surahName: row.goal_surah_name,
          fromAyah: row.goal_from_ayah,
          toAyah: row.goal_to_ayah,
          scheduledTime: row.goal_scheduled_time,
          goalType: row.goal_type,
        }
      : null,
  };
}

// ── Get incoming pending requests ─────────────────────────
export async function getIncomingRequests(userId: string) {
  const result = await pool.query(
    `SELECT p.id, p.status, p.created_at,
            u.username AS requester_username, u.gender AS requester_gender
     FROM partnerships p
     JOIN users u ON u.id = p.requester_id
     WHERE p.receiver_id = $1 AND p.status = 'pending'`,
    [userId],
  );

  return result.rows;
}

// ── Cancel active partnership ─────────────────────────────
export async function cancelPartnership(userId: string) {
  const result = await pool.query(
    `UPDATE partnerships
     SET status = 'cancelled', updated_at = NOW()
     WHERE (requester_id = $1 OR receiver_id = $1)
     AND status = 'accepted'
     RETURNING *`,
    [userId],
  );

  if (result.rows.length === 0) throw new Error("NO_ACTIVE_PARTNER");
  return result.rows[0];
}
