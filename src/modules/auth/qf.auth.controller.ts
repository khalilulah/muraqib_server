import { Response } from "express";
import { AuthRequest } from "../../types";
import * as qfAuthService from "./qf.auth.service";
import { sendSuccess, sendError } from "../../utils/response";

// GET /api/auth/qf — returns the QF login URL for the mobile app to open
export async function redirectToQF(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const url = qfAuthService.getAuthorizationUrl();
    sendSuccess(res, { url }, "Redirect to Quran Foundation");
  } catch (error) {
    sendError(res, "Failed to generate authorization URL", 500);
  }
}

// GET /api/auth/qf/callback — QF redirects here after user logs in
export async function handleCallback(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const code = req.query["code"] as string;

    if (!code) {
      sendError(res, "Authorization code missing", 400);
      return;
    }

    const result = await qfAuthService.handleCallback(code, req.user!.id);
    sendSuccess(res, result, "Quran Foundation account connected");
  } catch (error: any) {
    if (error.message === "QF_TOKEN_EXCHANGE_FAILED") {
      sendError(res, "Failed to connect Quran Foundation account", 400);
      return;
    }
    sendError(res, "Something went wrong", 500);
  }
}
