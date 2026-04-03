// Extends Express Request to carry the logged-in user after auth middleware runs
import { Request } from "express";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}
