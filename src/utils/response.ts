import { Response } from "express";

export const sendSuccess = (
  res: Response,
  data: unknown,
  message = "Success",
  status = 200,
) => {
  return res.status(status).json({ success: true, message, data });
};

export const sendCreated = (
  res: Response,
  data: unknown,
  message = "Created",
) => {
  return sendSuccess(res, data, message, 201);
};

export const sendError = (res: Response, message: string, status = 500) => {
  return res.status(status).json({ success: false, message });
};
