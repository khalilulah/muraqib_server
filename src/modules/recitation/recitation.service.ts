import { pool } from "../../config/db";
import { sendPushNotification } from "../../utils/notifications";
import { logQFActivityDay, getQFStreak } from "../../utils/qf.api";
import { uploadAudio } from "../../utils/cloudinary";
// ── Create a recitation goal ──────────────────────────────
export async function createGoal(
  userId: string,
  data: {
    goalType: "fixed" | "juz" | "ayah_count" | "random" | "quran";
    scheduledTime: string;
    fixedSurahNumber?: number;
    fixedSurahName?: string;
    fixedFromAyah?: number;
    fixedToAyah?: number;
    dailyAyahCount?: number;
    dailyJuzCount?: number;
  },
) {
  const TOTAL_QURAN_AYAHS = 6236;
  const AYAHS_PER_JUZ = 600; // approximate average

  // Auto calculate daily ayah count based on goal type
  let resolvedDailyAyahCount = data.dailyAyahCount ?? null;

  if (data.goalType === "quran") {
    // Finish entire Quran in 30 days
    resolvedDailyAyahCount = Math.ceil(TOTAL_QURAN_AYAHS / 30);
  }

  if (data.goalType === "juz") {
    if (!data.dailyJuzCount) throw new Error("JUZ_COUNT_MISSING");
    // Finish N juz in 30 days
    resolvedDailyAyahCount = Math.ceil(
      (data.dailyJuzCount * AYAHS_PER_JUZ) / 30,
    );
  }

  if (data.goalType === "random") {
    if (!data.dailyAyahCount) throw new Error("AYAH_COUNT_MISSING");
    resolvedDailyAyahCount = data.dailyAyahCount;
  }

  if (data.goalType === "fixed") {
    if (
      !data.fixedSurahNumber ||
      !data.fixedSurahName ||
      !data.fixedFromAyah ||
      !data.fixedToAyah
    ) {
      throw new Error("FIXED_GOAL_MISSING_FIELDS");
    }
  }

  if (data.goalType === "ayah_count") {
    if (!data.dailyAyahCount) throw new Error("AYAH_COUNT_MISSING");
  }

  // Deactivate existing active goal
  await pool.query(
    `UPDATE recitation_goals SET is_active = false WHERE user_id = $1 AND is_active = true`,
    [userId],
  );

  const result = await pool.query(
    `INSERT INTO recitation_goals (
      user_id,
      goal_type,
      scheduled_time,
      daily_ayah_count,
      daily_juz_count,
      current_surah,
      current_ayah,
      valid_until
    ) VALUES ($1, $2, $3, $4, $5, 1, 1, DATE_TRUNC('month', NOW()) + INTERVAL '1 month - 1 day')
    RETURNING *`,
    [
      userId,
      data.goalType,
      data.scheduledTime,
      resolvedDailyAyahCount,
      data.dailyJuzCount ?? null,
    ],
  );

  return result.rows[0];
}

// ── Get active goal ───────────────────────────────────────
export async function getActiveGoal(userId: string) {
  const result = await pool.query(
    `SELECT * FROM recitation_goals WHERE user_id = $1 AND is_active = true LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

// ── Fetch verses from Al-Quran Cloud API ─────────────────
// Returns Arabic text + audio URL for each ayah
// Ayah counts for all 114 surahs — avoids extra API calls
const SURAH_AYAH_COUNTS: Record<number, number> = {
  1: 7,
  2: 286,
  3: 200,
  4: 176,
  5: 120,
  6: 165,
  7: 206,
  8: 75,
  9: 129,
  10: 109,
  11: 123,
  12: 111,
  13: 43,
  14: 52,
  15: 99,
  16: 128,
  17: 111,
  18: 110,
  19: 98,
  20: 135,
  21: 112,
  22: 78,
  23: 118,
  24: 64,
  25: 77,
  26: 227,
  27: 93,
  28: 88,
  29: 69,
  30: 60,
  31: 34,
  32: 30,
  33: 73,
  34: 54,
  35: 45,
  36: 83,
  37: 182,
  38: 88,
  39: 75,
  40: 85,
  41: 54,
  42: 53,
  43: 89,
  44: 59,
  45: 37,
  46: 35,
  47: 38,
  48: 29,
  49: 18,
  50: 45,
  51: 60,
  52: 49,
  53: 62,
  54: 55,
  55: 78,
  56: 96,
  57: 29,
  58: 22,
  59: 24,
  60: 13,
  61: 14,
  62: 11,
  63: 11,
  64: 18,
  65: 12,
  66: 12,
  67: 30,
  68: 52,
  69: 52,
  70: 44,
  71: 28,
  72: 28,
  73: 20,
  74: 56,
  75: 40,
  76: 31,
  77: 50,
  78: 40,
  79: 46,
  80: 42,
  81: 29,
  82: 19,
  83: 36,
  84: 25,
  85: 22,
  86: 17,
  87: 19,
  88: 26,
  89: 30,
  90: 20,
  91: 15,
  92: 21,
  93: 11,
  94: 8,
  95: 8,
  96: 19,
  97: 5,
  98: 8,
  99: 8,
  100: 11,
  101: 11,
  102: 8,
  103: 3,
  104: 9,
  105: 5,
  106: 4,
  107: 7,
  108: 3,
  109: 6,
  110: 3,
  111: 5,
  112: 4,
  113: 5,
  114: 6,
};

export async function fetchVerses(
  startSurah: number,
  startAyah: number,
  count: number,
): Promise<
  {
    uniqueKey: string;
    surahNumber: number;
    ayahNumber: number;
    text: string;
    audioUrl: string;
    surahName: string;
  }[]
> {
  const verses = [];
  let currentSurah = startSurah;
  let currentAyah = startAyah;
  let remaining = count;

  while (remaining > 0 && currentSurah <= 114) {
    const totalInSurah = SURAH_AYAH_COUNTS[currentSurah];
    if (!totalInSurah) throw new Error(`Invalid surah number: ${currentSurah}`);

    // If we start at ayah 1 of a non-Fatiha surah, ayah 1 is Bismillah
    // We skip it in the loop but need to account for it in the filter range
    const availableInSurah = totalInSurah - currentAyah + 1;
    const takeFromThisSurah = Math.min(remaining, availableInSurah);
    const response = await fetch(
      `https://api.alquran.cloud/v1/surah/${currentSurah}/ar.alafasy`,
    );
    const data = (await response.json()) as any;
    if (data.code !== 200) throw new Error("VERSE_FETCH_FAILED");

    // Include ayah 1 in filter so continue can handle it, +1 extra for the bismillah offset
    const surahAyahs = data.data.ayahs.filter(
      (a: any) =>
        a.numberInSurah >= currentAyah &&
        a.numberInSurah < currentAyah + takeFromThisSurah,
    );

    for (const ayah of surahAyahs) {
      if (remaining <= 0) break;

      verses.push({
        uniqueKey: `${currentSurah}:${ayah.numberInSurah}`,
        surahNumber: currentSurah,
        ayahNumber: ayah.numberInSurah,
        text: ayah.text, // send raw text, frontend handles stripping
        audioUrl: ayah.audio,
        surahName: data.data.englishName,
      });
      remaining--;
    }

    if (remaining > 0) {
      currentSurah++;
      currentAyah = 1;
    }
  }

  return verses;
}

// Update getSurahAyahCount to use the map — no API call needed
async function getSurahAyahCount(surahNumber: number): Promise<number> {
  const count = SURAH_AYAH_COUNTS[surahNumber];
  if (!count) throw new Error(`Invalid surah number: ${surahNumber}`);
  return count;
}

// ── Start a recitation session ────────────────────────────
// Called when user opens the recitation screen
// ── Juz boundary map ──────────────────────────────────────
// Each juz: [surahNumber, ayahNumber] where it starts
const JUZ_START: Record<number, [number, number]> = {
  1: [1, 1],
  2: [2, 142],
  3: [2, 253],
  4: [3, 93],
  5: [4, 24],
  6: [4, 148],
  7: [5, 82],
  8: [6, 111],
  9: [7, 88],
  10: [8, 41],
  11: [9, 93],
  12: [11, 6],
  13: [12, 53],
  14: [15, 1],
  15: [17, 1],
  16: [18, 75],
  17: [21, 1],
  18: [23, 1],
  19: [25, 21],
  20: [27, 56],
  21: [29, 46],
  22: [33, 31],
  23: [36, 28],
  24: [39, 32],
  25: [41, 47],
  26: [46, 1],
  27: [51, 31],
  28: [58, 1],
  29: [67, 1],
  30: [78, 1],
};

// ── Resolve what to recite today based on goal type ───────
async function resolveVerseRange(goal: any): Promise<{
  surahNumber: number;
  fromAyah: number;
  count: number;
}> {
  if (goal.goal_type === "fixed") {
    return {
      surahNumber: goal.current_surah,
      fromAyah: goal.current_ayah,
      count: goal.daily_ayah_count ?? 10,
    };
  }

  if (
    goal.goal_type === "ayah_count" ||
    goal.goal_type === "quran" ||
    goal.goal_type === "juz"
  ) {
    return {
      surahNumber: goal.current_surah,
      fromAyah: goal.current_ayah,
      count: goal.daily_ayah_count ?? 20,
    };
  }

  if (goal.goal_type === "random") {
    const randomSurah = Math.floor(Math.random() * 114) + 1;
    const totalAyahs = await getSurahAyahCount(randomSurah);
    const randomFromAyah = Math.floor(Math.random() * totalAyahs) + 1;
    return {
      surahNumber: randomSurah,
      fromAyah: randomFromAyah,
      count: goal.daily_ayah_count ?? 10,
    };
  }

  throw new Error("UNKNOWN_GOAL_TYPE");
}

// ── Update progress after successful recitation ───────────
export async function advanceProgress(userId: string, goalId: string) {
  const goalResult = await pool.query(
    `SELECT * FROM recitation_goals WHERE id = $1 AND user_id = $2`,
    [goalId, userId],
  );
  const goal = goalResult.rows[0];
  if (!goal || goal.goal_type === "fixed" || goal.goal_type === "random")
    return;

  const dailyCount = goal.daily_ayah_count ?? 20;
  let nextSurah = goal.current_surah;
  let nextAyah = goal.current_ayah;
  let remaining = dailyCount;

  // Walk through surahs until we've advanced by dailyCount ayahs
  while (remaining > 0 && nextSurah <= 114) {
    const totalAyahs = await getSurahAyahCount(nextSurah);
    const ayahsLeftInSurah = totalAyahs - nextAyah + 1;

    if (remaining <= ayahsLeftInSurah) {
      nextAyah = nextAyah + remaining;
      remaining = 0;
    } else {
      remaining -= ayahsLeftInSurah;
      nextSurah++;
      nextAyah = 1;
    }
  }

  // Wrap back to beginning after An-Nas
  if (nextSurah > 114) {
    nextSurah = 1;
    nextAyah = 1;
  }

  await pool.query(
    `UPDATE recitation_goals SET current_surah = $1, current_ayah = $2 WHERE id = $3`,
    [nextSurah, nextAyah, goalId],
  );
}

// ── Start a session ───────────────────────────────────────
export async function startSession(userId: string, goalId: string) {
  const goalResult = await pool.query(
    `SELECT * FROM recitation_goals WHERE id = $1 AND user_id = $2 AND is_active = true`,
    [goalId, userId],
  );
  const goal = goalResult.rows[0];
  if (!goal) throw new Error("GOAL_NOT_FOUND");

  // Check goal hasn't expired
  if (goal.valid_until && new Date(goal.valid_until) < new Date()) {
    throw new Error("GOAL_EXPIRED");
  }

  // Resolve what to recite today
  const { surahNumber, fromAyah, count } = await resolveVerseRange(goal);
  const verses = await fetchVerses(surahNumber, fromAyah, count);

  const sessionResult = await pool.query(
    `INSERT INTO recitation_sessions (user_id, goal_id)
   VALUES ($1, $2)
   RETURNING *`,
    [userId, goalId],
  );

  return {
    session: sessionResult.rows[0],
    verses,
    meta: {
      surahNumber,
      fromAyah,
      totalAyahs: verses.length,
    },
  };
}

// ── Normalize Arabic text ─────────────────────────────────
// Strips tashkeel (diacritics) so comparison is fair
// whisper.rn transcriptions won't have diacritics
function normalizeArabic(text: string): string {
  return text
    .replace(/[\u0610-\u061A\u064B-\u065F]/g, "") // remove tashkeel
    .replace(/[\u0622\u0623\u0625]/g, "\u0627") // normalize alef variants → ا
    .replace(/\u0629/g, "\u0647") // ta marbuta → ha
    .replace(/\u0649/g, "\u064A") // alef maqsura → ya
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

// ── Calculate similarity score ────────────────────────────
// Simple character-level similarity using Levenshtein distance
function calculateSimilarity(a: string, b: string): number {
  const s1 = normalizeArabic(a);
  const s2 = normalizeArabic(b);

  // Build the Levenshtein distance matrix
  const matrix: number[][] = [];
  for (let i = 0; i <= s1.length; i++) matrix[i] = [i];
  for (let j = 0; j <= s2.length; j++) matrix[0]![j] = j;

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j]! + 1, // deletion
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j - 1]! + 1, // substitution
        );
      }
    }
  }

  const distance = matrix[s1.length]![s2.length]!;
  const maxLen = Math.max(s1.length, s2.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

// ── Submit a recitation ───────────────────────────────────
// Called after whisper.rn transcribes the user's audio on-device
export async function submitRecitation(
  userId: string,
  sessionId: string,
  transcription: string,
  audioFileUrl: string,
  recordingDurationSeconds: number = 0,
) {
  // 1. Fetch the session and goal
  const sessionResult = await pool.query(
    `SELECT rs.*, rg.goal_type, rg.current_surah, rg.current_ayah, rg.daily_ayah_count
   FROM recitation_sessions rs
   JOIN recitation_goals rg ON rg.id = rs.goal_id
   WHERE rs.id = $1 AND rs.user_id = $2`,
    [sessionId, userId],
  );
  const session = sessionResult.rows[0];
  if (!session) throw new Error("SESSION_NOT_FOUND");

  // 2. Fetch the actual verse text to compare against
  const dailyCount = session.daily_ayah_count ?? 20;
  const verses = await fetchVerses(
    session.current_surah,
    session.current_ayah,
    session.daily_ayah_count ?? 20,
  );
  const quranText = verses.map((v: { text: string }) => v.text).join(" ");

  // 3. Calculate similarity score
  const score = calculateSimilarity(transcription, quranText);
  const THRESHOLD = 0.75; // 75% match = auto approved

  // 4. Check if user has an active partner
  const partnerResult = await pool.query(
    `SELECT receiver_id, requester_id FROM partnerships
     WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'
     LIMIT 1`,
    [userId],
  );
  const hasPartner = partnerResult.rows.length > 0;

  // 5. Decide verification status
  let verificationStatus: string;

  if (score >= THRESHOLD) {
    verificationStatus = "ai_verified";
  } else if (hasPartner) {
    verificationStatus = "pending"; // goes to partner for review
  } else {
    verificationStatus = "rejected"; // no partner, score too low
  }

  // 6. Update session in DB
  // Upload audio to Cloudinary — store URL instead of base64
  let audioUrl = audioFileUrl;
  if (audioFileUrl.startsWith("data:")) {
    const base64Data = audioFileUrl.split(",")[1]!;
    audioUrl = await uploadAudio(base64Data);
  }

  const updated = await pool.query(
    `UPDATE recitation_sessions
   SET transcription = $1,
       audio_file_url = $2,
       similarity_score = $3,
       verification_status = $4,
       verified_by = $5,
       verified_at = $6
   WHERE id = $7
   RETURNING *`,
    [
      transcription,
      audioUrl, // 👈 now a real URL, not base64
      score,
      verificationStatus,
      verificationStatus === "ai_verified" ? "ai" : null,
      verificationStatus === "ai_verified" ? new Date() : null,
      sessionId,
    ],
  );

  // 7. If auto approved → update streak immediately

  // Pass verses and recording duration to updateStreak
  if (verificationStatus === "ai_verified") {
    const verseList = verses.map((v: any) => ({
      surahNumber: v.surahNumber,
      ayahNumber: v.ayahNumber,
    }));
    await updateStreak(userId, verseList, recordingDurationSeconds ?? 0);
    await advanceProgress(userId, session.goal_id);
  }

  return {
    session: updated.rows[0],
    score: Math.round(score * 100), // return as percentage
    verificationStatus,
    needsPartnerReview: verificationStatus === "pending",
  };
}

// ── Update streak ─────────────────────────────────────────
export async function updateStreak(
  userId: string,
  verses: { surahNumber: number; ayahNumber: number }[] = [],
  recordingDurationSeconds: number = 0,
) {
  const todayResult = await pool.query(
    `SELECT id FROM recitation_sessions
     WHERE user_id = $1
     AND (verification_status = 'ai_verified' OR verification_status = 'partner_verified')
     AND DATE(verified_at) = CURRENT_DATE`,
    [userId],
  );

  if (todayResult.rows.length > 1) return;

  const yesterdayResult = await pool.query(
    `SELECT last_completed_at FROM streaks WHERE user_id = $1`,
    [userId],
  );
  const streak = yesterdayResult.rows[0];

  const isConsecutive =
    Boolean(streak) &&
    Boolean(streak?.last_completed_at) &&
    new Date().getTime() - new Date(streak.last_completed_at).getTime() <
      48 * 60 * 60 * 1000;

  await pool.query(
    `INSERT INTO streaks (user_id, current_streak, longest_streak, last_completed_at)
     VALUES ($1, 1, 1, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       current_streak = CASE
         WHEN $2 THEN streaks.current_streak + 1
         ELSE 1
       END,
       longest_streak = GREATEST(streaks.longest_streak,
         CASE WHEN $2 THEN streaks.current_streak + 1 ELSE 1 END
       ),
       last_completed_at = NOW()`,
    [userId, isConsecutive],
  );

  // Log to QF activity days
  await logQFActivityDay(userId, verses, recordingDurationSeconds);
}

// ── Partner reviews a recitation ──────────────────────────
export async function reviewRecitation(
  reviewerId: string,
  sessionId: string,
  action: "approved" | "rejected",
) {
  // 1. Fetch the session
  const sessionResult = await pool.query(
    `SELECT rs.*, u.fcm_token AS user_fcm_token
     FROM recitation_sessions rs
     JOIN users u ON u.id = rs.user_id
     WHERE rs.id = $1`,
    [sessionId],
  );
  const session = sessionResult.rows[0];
  if (!session) throw new Error("SESSION_NOT_FOUND");

  // 2. Confirm reviewer is actually the user's partner
  const partnerCheck = await pool.query(
    `SELECT id FROM partnerships
     WHERE (requester_id = $1 OR receiver_id = $1)
     AND (requester_id = $2 OR receiver_id = $2)
     AND status = 'accepted'`,
    [reviewerId, session.user_id],
  );
  if (partnerCheck.rows.length === 0) throw new Error("NOT_YOUR_PARTNER");

  // 3. Can only review sessions that are pending
  if (session.verification_status !== "pending")
    throw new Error("ALREADY_REVIEWED");

  // 4. Update the session
  const newStatus = action === "approved" ? "partner_verified" : "rejected";
  await pool.query(
    `UPDATE recitation_sessions
     SET verification_status = $1,
         verified_by = 'partner',
         verified_at = NOW()
     WHERE id = $2`,
    [newStatus, sessionId],
  );

  // 5. If approved → update reciter's streak and advance progress
  if (action === "approved") {
    await updateStreak(session.user_id, [], 30); // approximate duration
    await advanceProgress(session.user_id, session.goal_id);
  }

  // 6. Notify the reciter of the decision
  if (session.user_fcm_token) {
    const title =
      action === "approved"
        ? "Recitation Approved ✅"
        : "Recitation Rejected ❌";
    const body =
      action === "approved"
        ? "Your partner approved your recitation. Keep it up!"
        : "Your partner rejected your recitation. Try again!";

    await sendPushNotification(session.user_fcm_token, title, body, {
      type: "REVIEW_RESULT",
      sessionId,
      result: action,
    });
  }

  return { sessionId, result: action };
}

// ── Get user's current streak ─────────────────────────────
export async function getStreak(userId: string) {
  const result = await pool.query(
    `SELECT
      s.current_streak,
      s.longest_streak,
      s.last_completed_at,
      EXISTS (
        SELECT 1 FROM recitation_sessions rs
        WHERE rs.user_id = $1
        AND (rs.verification_status = 'ai_verified' OR rs.verification_status = 'partner_verified')
        AND DATE(rs.verified_at) = CURRENT_DATE
      ) AS completed_today
     FROM streaks s
     WHERE s.user_id = $1`,
    [userId],
  );

  const localStreak =
    result.rows.length === 0
      ? {
          currentStreak: 0,
          longestStreak: 0,
          lastCompletedAt: null,
          completedToday: false,
        }
      : {
          currentStreak: result.rows[0].current_streak,
          longestStreak: result.rows[0].longest_streak,
          lastCompletedAt: result.rows[0].last_completed_at,
          completedToday: result.rows[0].completed_today,
        };

  // QF streak — fail silently, never crash the endpoint
  let qfCurrentStreak = null;
  try {
    const qfStreak = await getQFStreak(userId);
    qfCurrentStreak = qfStreak?.data?.[0] ?? null;
  } catch {
    // QF API unavailable — just skip it
  }

  return {
    ...localStreak,
    quranFoundation: qfCurrentStreak
      ? {
          days: qfCurrentStreak.days,
          startDate: qfCurrentStreak.startDate,
          status: qfCurrentStreak.status,
        }
      : null,
  };
}

// ── Get user's recitation history ─────────────────────────
export async function getRecitationHistory(userId: string, limit = 10) {
  const result = await pool.query(
    `SELECT
      rs.id,
      rs.verification_status,
      rs.similarity_score,
      rs.verified_by,
      rs.verified_at,
      rs.created_at,
      rg.goal_type,
      rg.scheduled_time
     FROM recitation_sessions rs
     JOIN recitation_goals rg ON rg.id = rs.goal_id
     WHERE rs.user_id = $1
     ORDER BY rs.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );

  return result.rows;
}

export async function getSession(sessionId: string) {
  const result = await pool.query(
    `SELECT * FROM recitation_sessions WHERE id = $1`,
    [sessionId],
  );
  if (result.rows.length === 0) throw new Error("SESSION_NOT_FOUND");
  return result.rows[0];
}

export async function getPendingReviews(userId: string) {
  const result = await pool.query(
    `SELECT
      rs.id,
      rs.created_at,
      u.username AS partner_username
     FROM recitation_sessions rs
     JOIN users u ON u.id = rs.user_id
     WHERE rs.verification_status = 'pending'
     AND rs.user_id != $1
     AND EXISTS (
       SELECT 1 FROM partnerships p
       WHERE p.status = 'accepted'
       AND (
         (p.requester_id = $1 AND p.receiver_id = rs.user_id)
         OR
         (p.receiver_id = $1 AND p.requester_id = rs.user_id)
       )
     )
     ORDER BY rs.created_at DESC`,
    [userId],
  );
  return result.rows;
}
