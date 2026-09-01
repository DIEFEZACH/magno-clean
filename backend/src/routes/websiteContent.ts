import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import {
  createWebsiteContentDraftSchema,
  emptyTransitionSchema,
  publishWebsiteContentSchema,
  updateWebsiteContentDraftSchema,
} from "../schemas/websiteContent";
import {
  approveWebsiteContent,
  clonePublishedRevision,
  createWebsiteContentDraft,
  getWebsiteContent,
  getWebsiteContentHistory,
  publishWebsiteContent,
  resolvePublishedWebsiteContent,
  submitWebsiteContentForReview,
  updateWebsiteContentDraft,
} from "../services/websiteContent";

export const websiteContentRouter = Router();
websiteContentRouter.use(authenticate, authorize(Role.ADMIN));
websiteContentRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

websiteContentRouter.get("/families/:familyId", asyncHandler(async (req, res) => {
  const content = await getWebsiteContent({ type: "family", id: String(req.params.familyId) });
  res.json({ content });
}));

websiteContentRouter.get("/products/:productId", asyncHandler(async (req, res) => {
  const content = await getWebsiteContent({ type: "product", id: String(req.params.productId) });
  res.json({ content });
}));

websiteContentRouter.post("/families/:familyId/drafts", validateBody(createWebsiteContentDraftSchema), asyncHandler(async (req, res) => {
  const revision = await createWebsiteContentDraft(
    { type: "family", id: String(req.params.familyId) },
    req.user!.id,
    req.body,
  );
  res.status(201).json({ revision });
}));

websiteContentRouter.post("/products/:productId/drafts", validateBody(createWebsiteContentDraftSchema), asyncHandler(async (req, res) => {
  const revision = await createWebsiteContentDraft(
    { type: "product", id: String(req.params.productId) },
    req.user!.id,
    req.body,
  );
  res.status(201).json({ revision });
}));

websiteContentRouter.put("/revisions/:revisionId", validateBody(updateWebsiteContentDraftSchema), asyncHandler(async (req, res) => {
  const revision = await updateWebsiteContentDraft(String(req.params.revisionId), req.body);
  res.json({ revision });
}));

websiteContentRouter.post("/revisions/:revisionId/clone-draft", validateBody(emptyTransitionSchema), asyncHandler(async (req, res) => {
  const revision = await clonePublishedRevision(String(req.params.revisionId), req.user!.id);
  res.status(201).json({ revision });
}));

websiteContentRouter.post("/revisions/:revisionId/submit-review", validateBody(emptyTransitionSchema), asyncHandler(async (req, res) => {
  const revision = await submitWebsiteContentForReview(String(req.params.revisionId), req.user!.id);
  res.json({ revision });
}));

websiteContentRouter.post("/revisions/:revisionId/approve", validateBody(emptyTransitionSchema), asyncHandler(async (req, res) => {
  const revision = await approveWebsiteContent(String(req.params.revisionId), req.user!.id);
  res.json({ revision });
}));

websiteContentRouter.post("/revisions/:revisionId/publish", validateBody(publishWebsiteContentSchema), asyncHandler(async (req, res) => {
  const revision = await publishWebsiteContent(String(req.params.revisionId), req.user!.id, req.body);
  res.json({ revision });
}));

websiteContentRouter.get("/contents/:contentId/history", asyncHandler(async (req, res) => {
  const content = await getWebsiteContentHistory(String(req.params.contentId));
  res.json({ content });
}));

websiteContentRouter.get("/contents/:contentId/published", asyncHandler(async (req, res) => {
  const revision = await resolvePublishedWebsiteContent(String(req.params.contentId));
  res.json({ revision });
}));
