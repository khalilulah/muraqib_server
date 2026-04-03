import { Response } from "express";
import { AuthRequest } from "../../types";
import * as userService from "./user.service";
import { sendSuccess, sendError } from "../../utils/response";

// GET /api/users/me — returns the logged-in user's profile
export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = await userService.getUserById(req.user!.id);

    if (!user) {
      sendError(res, "User not found", 404);
      return;
    }

    sendSuccess(res, user, "Profile fetched");
  } catch (error) {
    console.error("getMe error:", error);
    sendError(res, "Something went wrong", 500);
  }
}

// PATCH /api/users/fcm-token — mobile app calls this on startup
export async function updateFcmToken(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { fcmToken } = req.body;

    if (!fcmToken) {
      sendError(res, "fcmToken is required", 400);
      return;
    }

    await userService.updateFcmToken(req.user!.id, fcmToken);
    sendSuccess(res, null, "FCM token updated");
  } catch (error) {
    console.error("updateFcmToken error:", error);
    sendError(res, "Something went wrong", 500);
  }
}
