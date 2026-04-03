import { Response } from "express";
import { AuthRequest } from "../../types";
import * as partnerService from "./partner.service";
import { sendSuccess, sendCreated, sendError } from "../../utils/response";

// POST /api/partners/request
export async function sendRequest(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { username } = req.body;

    if (!username) {
      sendError(res, "Username is required", 400);
      return;
    }

    const partnership = await partnerService.sendPartnerRequest(
      req.user!.id,
      username,
    );
    sendCreated(res, partnership, "Partner request sent");
  } catch (error: any) {
    const errorMap: Record<string, [string, number]> = {
      USER_NOT_FOUND: ["User not found", 404],
      GENDER_MISMATCH: ["Partners must be the same gender", 400],
      CANNOT_PARTNER_YOURSELF: ["You cannot partner with yourself", 400],
      REQUEST_ALREADY_EXISTS: ["A request already exists with this user", 409],
    };

    const [message, status] = errorMap[error.message] ?? [
      "Something went wrong",
      500,
    ];
    sendError(res, message, status);
  }
}

// PATCH /api/partners/request/:id
export async function respondToRequest(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const id = req.params["id"] as string;
    const { action } = req.body;

    if (!action || !["accepted", "rejected"].includes(action)) {
      sendError(res, "Action must be accepted or rejected", 400);
      return;
    }

    const partnership = await partnerService.respondToRequest(
      req.user!.id,
      id,
      action,
    );
    sendSuccess(res, partnership, `Request ${action}`);
  } catch (error: any) {
    const errorMap: Record<string, [string, number]> = {
      PARTNERSHIP_NOT_FOUND: ["Request not found", 404],
      ALREADY_RESPONDED: ["You have already responded to this request", 409],
    };

    const [message, status] = errorMap[error.message] ?? [
      "Something went wrong",
      500,
    ];
    sendError(res, message, status);
  }
}

// GET /api/partners/me
export async function getMyPartner(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const partner = await partnerService.getMyPartner(req.user!.id);
    sendSuccess(
      res,
      partner,
      partner ? "Partner fetched" : "No active partner",
    );
  } catch (error) {
    console.error("getMyPartner error:", error);
    sendError(res, "Something went wrong", 500);
  }
}

// GET /api/partners/requests
export async function getIncomingRequests(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const requests = await partnerService.getIncomingRequests(req.user!.id);
    sendSuccess(res, requests, "Incoming requests fetched");
  } catch (error) {
    console.error("getIncomingRequests error:", error);
    sendError(res, "Something went wrong", 500);
  }
}

// DELETE /api/partners/cancel
export async function cancelPartnership(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    await partnerService.cancelPartnership(req.user!.id);
    sendSuccess(res, null, "Partnership cancelled");
  } catch (error: any) {
    if (error.message === "NO_ACTIVE_PARTNER") {
      sendError(res, "You have no active partner", 404);
      return;
    }
    console.error("cancelPartnership error:", error);
    sendError(res, "Something went wrong", 500);
  }
}
