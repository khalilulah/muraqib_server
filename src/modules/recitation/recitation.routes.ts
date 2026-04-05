import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import * as recitationController from "./recitation.controller";

const router = Router();

router.use(authMiddleware);

router.post("/goals", recitationController.createGoal);
router.get("/goals/active", recitationController.getActiveGoal);
router.post("/sessions/start", recitationController.startSession);
router.post("/sessions/submit", recitationController.submitRecitation);
router.patch("/sessions/:id/review", recitationController.reviewRecitation);
router.get("/streak", recitationController.getStreak);
router.get("/history", recitationController.getRecitationHistory);
router.get("/sessions/:id", recitationController.getSession);
export default router;
