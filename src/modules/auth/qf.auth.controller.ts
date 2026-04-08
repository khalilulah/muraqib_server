import { Request, Response } from "express";
import { AuthRequest } from "../../types";
import * as qfAuthService from "./qf.auth.service";
import { sendSuccess, sendError } from "../../utils/response";

// GET /api/auth/qf
// Protected — user must be logged in with their own JWT
// Returns the QF login URL for the mobile app to open in a browser
export async function redirectToQF(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    // Now we correctly pass the userId so the state store knows who this is
    const url = qfAuthService.getAuthorizationUrl(req.user!.id);
    sendSuccess(res, { url }, "Redirect to Quran Foundation");
  } catch (error) {
    sendError(res, "Failed to generate authorization URL", 500);
  }
}

// GET /api/auth/qf/callback
// PUBLIC — no authenticate middleware on this route
// QF redirects here after user logs in. We get ?code=...&state=...
export async function handleCallback(
  req: Request, // plain Request, not AuthRequest — this route is public
  res: Response,
): Promise<void> {
  try {
    // ADD THIS — temporarily log what QF actually sent back
    console.log("[QF Callback] Full URL:", req.url);
    console.log("[QF Callback] Query params:", req.query);

    // Check if QF returned an error first
    const error = req.query["error"] as string | undefined;
    const errorDescription = req.query["error_description"] as
      | string
      | undefined;

    if (error) {
      console.error(
        "[QF Callback] QF returned error:",
        error,
        errorDescription,
      );
      sendError(res, `QF OAuth error: ${error} — ${errorDescription}`, 400);
      return;
    }

    const code = req.query["code"] as string | undefined;
    const state = req.query["state"] as string | undefined;

    if (!code || !state) {
      sendError(res, "Missing code or state", 400);
      return;
    }

    const result = await qfAuthService.handleCallback(code, state);
    res.redirect("muraqib://callback");
    return;
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "INVALID_STATE") {
        sendError(res, "Invalid or expired session. Please try again.", 400);
        return;
      }
      if (error.message === "QF_TOKEN_EXCHANGE_FAILED") {
        sendError(res, "Failed to connect Quran Foundation account", 400);
        return;
      }
    }
    sendError(res, "Something went wrong", 500);
  }
}
