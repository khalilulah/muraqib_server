import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./modules/auth/auth.routes";
import userRoutes from "./modules/users/user.routes";
import partnerRoutes from "./modules/partners/partner.routes";
import recitationRoutes from "./modules/recitation/recitation.routes";
const app = express();

// Security
app.use(helmet());
app.use(cors());

// Logging
app.use(morgan("dev"));

// Parse JSON bodies
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/partners", partnerRoutes);
app.use("/api/recitation", recitationRoutes);
export default app;
