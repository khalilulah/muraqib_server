import { Response } from "express";
import { AuthRequest } from "../../types";
import * as recitationService from "./recitation.service";
import { sendSuccess, sendCreated, sendError } from "../../utils/response";

// POST /api/recitation/goals — user sets their daily recitation goal
export async function createGoal(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const {
      goalType,
      scheduledTime,
      fixedSurahNumber,
      fixedSurahName,
      fixedFromAyah,
      fixedToAyah,
      dailyAyahCount,
      dailyJuzCount,
    } = req.body;

    if (!goalType || !scheduledTime) {
      sendError(res, "goalType and scheduledTime are required", 400);
      return;
    }

    const goal = await recitationService.createGoal(req.user!.id, {
      goalType,
      scheduledTime,
      fixedSurahNumber,
      fixedSurahName,
      fixedFromAyah,
      fixedToAyah,
      dailyAyahCount,
      dailyJuzCount,
    });

    sendCreated(res, goal, "Recitation goal created");
  } catch (error: any) {
    const errorMap: Record<string, [string, number]> = {
      FIXED_GOAL_MISSING_FIELDS: [
        "Please provide surah and ayah range for fixed goal",
        400,
      ],
      AYAH_COUNT_MISSING: ["Please provide dailyAyahCount", 400],
      JUZ_COUNT_MISSING: ["Please provide dailyJuzCount", 400],
    };
    const [message, status] = errorMap[error.message] ?? [
      "Something went wrong",
      500,
    ];
    sendError(res, message, status);
  }
}

// GET /api/recitation/goals/active — fetch user's current active goal
export async function getActiveGoal(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const goal = await recitationService.getActiveGoal(req.user!.id);
    sendSuccess(res, goal, goal ? "Active goal fetched" : "No active goal");
  } catch (error) {
    console.error("getActiveGoal error:", error);
    sendError(res, "Something went wrong", 500);
  }
}

// POST /api/recitation/sessions/start — user opens recitation screen
// Returns the verses (Arabic text + audio URLs) from Al-Quran Cloud
export async function startSession(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { goalId } = req.body;

    if (!goalId) {
      sendError(res, "goalId is required", 400);
      return;
    }

    const result = await recitationService.startSession(req.user!.id, goalId);
    sendSuccess(res, result, "Session started");
  } catch (error: any) {
    const errorMap: Record<string, [string, number]> = {
      GOAL_NOT_FOUND: ["Active goal not found", 404],
      VERSE_FETCH_FAILED: ["Failed to fetch verses, try again", 502],
    };

    const [message, status] = errorMap[error.message] ?? [
      "Something went wrong",
      500,
    ];
    sendError(res, message, status);
  }
}

// POST /api/recitation/sessions/submit
// Called after whisper.rn transcribes the user's audio on-device
export async function submitRecitation(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { sessionId, transcription, audioFileUrl, recordingDurationSeconds } =
      req.body;

    if (!sessionId || !transcription || !audioFileUrl) {
      sendError(
        res,
        "sessionId, transcription and audioFileUrl are required",
        400,
      );
      return;
    }

    const result = await recitationService.submitRecitation(
      req.user!.id,
      sessionId,
      transcription,
      audioFileUrl,
      recordingDurationSeconds,
    );

    sendSuccess(res, result, "Recitation submitted");
  } catch (error: any) {
    if (error.message === "SESSION_NOT_FOUND") {
      sendError(res, "Session not found", 404);
      return;
    }
    console.error("submitRecitation error:", error);
    sendError(res, "Something went wrong", 500);
  }
}

// PATCH /api/recitation/sessions/:id/review
export async function reviewRecitation(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const sessionId = req.params["id"] as string;
    const { action } = req.body;

    if (!action || !["approved", "rejected"].includes(action)) {
      sendError(res, "Action must be approved or rejected", 400);
      return;
    }

    const result = await recitationService.reviewRecitation(
      req.user!.id,
      sessionId,
      action,
    );
    sendSuccess(res, result, `Recitation ${action}`);
  } catch (error: any) {
    const errorMap: Record<string, [string, number]> = {
      SESSION_NOT_FOUND: ["Session not found", 404],
      NOT_YOUR_PARTNER: ["You are not this user's partner", 403],
      ALREADY_REVIEWED: ["This session has already been reviewed", 409],
    };
    const [message, status] = errorMap[error.message] ?? [
      "Something went wrong",
      500,
    ];
    sendError(res, message, status);
  }
}

// GET /api/recitation/streak
export async function getStreak(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const streak = await recitationService.getStreak(req.user!.id);
    sendSuccess(res, streak, "Streak fetched");
  } catch (error) {
    console.error("getStreak error:", error);
    sendError(res, "Something went wrong", 500);
  }
}

// GET /api/recitation/history
export async function getRecitationHistory(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const limit = parseInt(req.query["limit"] as string) || 10;
    const history = await recitationService.getRecitationHistory(
      req.user!.id,
      limit,
    );
    sendSuccess(res, history, "History fetched");
  } catch (error) {
    console.error("getRecitationHistory error:", error);
    sendError(res, "Something went wrong", 500);
  }
}

export async function getSession(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const sessionId = req.params["id"] as string;
    const session = await recitationService.getSession(sessionId);
    sendSuccess(res, session, "Session fetched");
  } catch (error: any) {
    if (error.message === "SESSION_NOT_FOUND") {
      sendError(res, "Session not found", 404);
      return;
    }
    sendError(res, "Something went wrong", 500);
  }
}

export async function getPendingReviews(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const reviews = await recitationService.getPendingReviews(req.user!.id);
    sendSuccess(res, reviews, "Pending reviews fetched");
  } catch (error) {
    sendError(res, "Something went wrong", 500);
  }
}
