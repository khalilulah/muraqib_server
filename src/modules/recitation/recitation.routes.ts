import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { AuthRequest } from "../../types";
import { Response } from "express";
import * as recitationController from "./recitation.controller";
import { sendSuccess, sendCreated, sendError } from "../../utils/response";

const router = Router();

router.use(authMiddleware);

router.post("/goals", recitationController.createGoal);
router.get("/goals/active", recitationController.getActiveGoal);
router.post("/sessions/start", recitationController.startSession);
router.post("/test-qf-activity", async (req: AuthRequest, res: Response) => {
  try {
    const { logQFActivityDay } = await import("../../utils/qf.api");
    await logQFActivityDay(
      req.user!.id,
      [
        { surahNumber: 1, ayahNumber: 1 },
        { surahNumber: 1, ayahNumber: 7 },
      ],
      60,
    );
    sendSuccess(res, null, "Activity logged");
  } catch (error: any) {
    sendError(res, error.message, 500);
  }
});
router.post("/sessions/submit", recitationController.submitRecitation);
router.get("/sessions/pending-reviews", recitationController.getPendingReviews);
router.get("/activity-calendar", recitationController.getActivityCalendar);
router.get("/streak", recitationController.getStreak);
router.get("/history", recitationController.getRecitationHistory);
router.patch("/sessions/:id/review", recitationController.reviewRecitation);
router.get("/sessions/:id", recitationController.getSession);

export default router;
