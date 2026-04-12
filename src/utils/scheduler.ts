import cron from "node-cron";
import { pool } from "../config/db";
import { sendPushNotification } from "./notifications";

export function startScheduler() {
  // Run every minute — check if any users have recitation time now
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    try {
      // Find all users whose scheduled time matches now
      // and haven't completed today's recitation
      const result = await pool.query(
        `SELECT DISTINCT u.id, u.fcm_token, u.username,
                rg.daily_ayah_count, rg.current_surah
         FROM users u
         JOIN recitation_goals rg ON rg.user_id = u.id
           AND rg.is_active = true
           AND rg.scheduled_time = $1
         WHERE u.fcm_token IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM recitation_sessions rs
           WHERE rs.user_id = u.id
           AND (rs.verification_status = 'ai_verified'
             OR rs.verification_status = 'partner_verified')
           AND DATE(rs.verified_at) = CURRENT_DATE
         )`,
        [currentTime],
      );

      for (const user of result.rows) {
        await sendPushNotification(
          user.fcm_token,
          "Time to Recite 🕌",
          `Your daily ${user.daily_ayah_count} ayahs are waiting. Recite to keep your streak alive.`,
          { type: "RECITATION_REMINDER" },
        );
        console.log(`✅ Reminder sent to ${user.username}`);
      }
    } catch (error) {
      console.error("Scheduler error:", error);
    }
  });

  console.log("✅ Recitation reminder scheduler started");
}
