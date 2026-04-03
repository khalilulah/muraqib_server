import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthRequest } from "../types";

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  // 1. Grab the Authorization header — expected format: "Bearer <token>"
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "No token provided" });
    return;
  }

  // 2. Extract the token part after "Bearer "
  const token = authHeader.split(" ")[1];

  try {
    // 3. Verify the token — throws if expired or tampered
    const decoded = jwt.verify(token, env.jwt.accessSecret) as {
      id: string;
      email: string;
    };

    // 4. Attach user info to the request for downstream use
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch {
    res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
}
