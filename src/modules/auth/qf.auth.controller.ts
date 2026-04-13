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
    const url = await qfAuthService.getAuthorizationUrl(req.user!.id);
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
    if (error) {
      const errorDescription = req.query["error_description"] as string;
      sendError(res, `QF OAuth error: ${error} — ${errorDescription}`, 400);
      return;
    }

    const code = req.query["code"] as string | undefined;
    const state = req.query["state"] as string | undefined;

    if (!code || !state) {
      sendError(res, "Missing code or state", 400);
      return;
    }

    await qfAuthService.handleCallback(code, state);

    // Simple HTML page — browser closes, app polls for update
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #F9F5F0;">
          <div style="background: #1B4332; color: white; padding: 20px; border-radius: 12px; max-width: 300px; margin: auto;">
            <h2>Connected!</h2>
            <p>Your Quran Foundation account is now linked to Muraqib.</p>
            <p>You can close this window and return to the app.</p>
          </div>
        </body>
      </html>
    `);
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
