import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import * as partnerController from "./partner.controller";

const router = Router();

router.use(authMiddleware);

router.post("/request", partnerController.sendRequest);
router.patch("/request/:id", partnerController.respondToRequest);
router.get("/requests", partnerController.getIncomingRequests);
router.get("/me", partnerController.getMyPartner);
router.delete("/cancel", partnerController.cancelPartnership);

export default router;
