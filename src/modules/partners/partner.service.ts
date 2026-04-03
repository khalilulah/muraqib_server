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
    `SELECT u.id, u.username, u.email, u.gender
     FROM partnerships p
     JOIN users u ON (
       CASE WHEN p.requester_id = $1 THEN p.receiver_id ELSE p.requester_id END = u.id
     )
     WHERE (p.requester_id = $1 OR p.receiver_id = $1)
     AND p.status = 'accepted'
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] ?? null;
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
