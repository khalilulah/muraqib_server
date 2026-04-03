import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import * as userController from "./user.controller";

const router = Router();

// All routes below require a valid access token
router.use(authMiddleware);

router.get("/me", userController.getMe);
router.patch("/fcm-token", userController.updateFcmToken);

export default router;
