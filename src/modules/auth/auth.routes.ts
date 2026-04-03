import { Router } from "express";
import * as authController from "./auth.controller";
import * as qfAuthController from "./qf.auth.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);

// Quran Foundation OAuth2
router.get("/qf", authMiddleware, qfAuthController.redirectToQF);
router.get("/qf/callback", authMiddleware, qfAuthController.handleCallback);

export default router;
