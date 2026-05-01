import { Request, Response } from "express";
import * as authService from "./auth.service";
import { sendSuccess, sendCreated, sendError } from "../../utils/response";

// ── Register ──────────────────────────────────────────────
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, username, password, gender } = req.body;

    // Basic check — proper validation comes in the next step
    if (!email || !username || !password || !gender) {
      sendError(res, "All fields are required", 400);
      return;
    }

    const user = await authService.register({
      email,
      username,
      password,
      gender,
    });
    sendCreated(res, user, "Account created successfully");
  } catch (error: any) {
    if (error.message === "EMAIL_OR_USERNAME_TAKEN") {
      sendError(res, "Email or username already taken", 409);
      return;
    }
    console.error("Register error:", error);
    sendError(res, "Something went wrong", 500);
  }
}

// ── Login ─────────────────────────────────────────────────
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      sendError(res, "Email and password are required", 400);
      return;
    }

    const result = await authService.login({ email, password });
    sendSuccess(res, result, "Login successful");
  } catch (error: any) {
    if (error.message === "INVALID_CREDENTIALS") {
      sendError(res, "Invalid email or password", 401);
      return;
    }
    console.error("Login error:", error);
    sendError(res, "Something went wrong", 500);
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      sendError(res, "Refresh token required", 400);
      return;
    }
    const result = await authService.refreshAccessToken(refreshToken);
    sendSuccess(res, result, "Token refreshed");
  } catch (error: any) {
    sendError(res, "Invalid or expired session, please log in again", 401);
  }
}
