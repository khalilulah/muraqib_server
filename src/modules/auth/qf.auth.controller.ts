import { Request, Response } from "express";
import { AuthRequest } from "../../types";
import * as qfAuthService from "./qf.auth.service";
import { sendSuccess, sendError } from "../../utils/response";

// ─── GET /api/auth/qf ──────────────────────────────────────────────
// Returns the QF login URL
export async function redirectToQF(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const redirectTo = req.query.redirect_to as string;
    if (!redirectTo) {
      sendError(res, "Missing redirect_to", 400);
      return;
    }

    const url = qfAuthService.getAuthorizationUrl(req.user!.id, redirectTo);
    sendSuccess(res, { url }, "Redirect to Quran Foundation");
  } catch (error) {
    sendError(res, "Failed to generate authorization URL", 500);
  }
}

// ─── GET /api/auth/qf/callback ─────────────────────────────────────
// PUBLIC — QF redirects here after login
export async function handleCallback(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    console.log("[QF Callback] Full URL:", req.url);
    console.log("[QF Callback] Query params:", req.query);

    const error = req.query["error"] as string | undefined;
    const errorDescription = req.query["error_description"] as
      | string
      | undefined;
    if (error) {
      console.error("[QF Callback] Error:", error, errorDescription);
      sendError(res, `QF OAuth error: ${error} — ${errorDescription}`, 400);
      return;
    }

    const code = req.query["code"] as string | undefined;
    const state = req.query["state"] as string | undefined;

    if (!code || !state) {
      sendError(res, "Missing code or state", 400);
      return;
    }

    console.log("[QF Callback] Received code:", code);
    console.log("[QF Callback] Received state:", state);

    // ✅ Exchange code for tokens and get stored redirect
    const stored = qfAuthService.stateStore.get(state);
    console.log(
      "[QF Callback] Looking up state in stateStore:",
      state,
      "Found:",
      stored,
    );
    if (!stored) {
      console.error("[QF Callback] INVALID_STATE - state not found or expired");
      sendError(res, "Invalid or expired state", 400);
      return;
    }
    const redirectTo = `${stored.redirectTo}?code=${encodeURIComponent(code as string)}&state=${encodeURIComponent(state as string)}`;
    console.log("[QF Callback] Redirecting to:", redirectTo);

    // Exchange code & save tokens
    await qfAuthService.handleCallback(code, state);
    console.log("[QF Callback] Redirecting to:", redirectTo);

    // Redirect to the app
    res.redirect(redirectTo);
    console.log("────── [QF Callback] END ──────");
  } catch (error: unknown) {
    console.error("[QF Callback] ERROR CAUGHT:", error);
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
