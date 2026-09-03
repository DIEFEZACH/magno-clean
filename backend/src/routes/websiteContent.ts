import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import {
  createWebsiteContentDraftSchema,
  createWebsiteContentMediaSchema,
  emptyTransitionSchema,
  publishWebsiteContentSchema,
  updateWebsiteContentMediaSchema,
  updateWebsiteContentDraftSchema,
} from "../schemas/websiteContent";
import {
  addWebsiteContentMedia,
  approveWebsiteContent,
  clonePublishedRevision,
  createWebsiteContentDraft,
  getWebsiteContent,
  getWebsiteContentHistory,
  publishWebsiteContent,
  removeWebsiteContentMedia,
  resolvePublishedWebsiteContent,
  serializeWebsiteContent,
  serializeWebsiteContentMedia,
  serializeWebsiteContentRevision,
  submitWebsiteContentForReview,
  updateWebsiteContentDraft,
  updateWebsiteContentMedia,
} from "../services/websiteContent";

export const websiteContentRouter = Router();
websiteContentRouter.use(authenticate, authorize(Role.ADMIN));
websiteContentRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

websiteContentRouter.get("/families/:familyId", asyncHandler(async (req, res) => {
  const content = await getWebsiteContent({ type: "family", id: String(req.params.familyId) });
  res.json({ content: serializeWebsiteContent(content) });
}));

websiteContentRouter.get("/products/:productId", asyncHandler(async (req, res) => {
  const content = await getWebsiteContent({ type: "product", id: String(req.params.productId) });
  res.json({ content: serializeWebsiteContent(content) });
}));

websiteContentRouter.post("/families/:familyId/drafts", validateBody(createWebsiteContentDraftSchema), asyncHandler(async (req, res) => {
  const revision = await createWebsiteContentDraft(
    { type: "family", id: String(req.params.familyId) },
    req.user!.id,
    req.body,
  );
  res.status(201).json({ revision: serializeWebsiteContentRevision(revision) });
}));

websiteContentRouter.post("/products/:productId/drafts", validateBody(createWebsiteContentDraftSchema), asyncHandler(async (req, res) => {
  const revision = await createWebsiteContentDraft(
    { type: "product", id: String(req.params.productId) },
    req.user!.id,
    req.body,
  );
  res.status(201).json({ revision: serializeWebsiteContentRevision(revision) });
}));

websiteContentRouter.put("/revisions/:revisionId", validateBody(updateWebsiteContentDraftSchema), asyncHandler(async (req, res) => {
  const revision = await updateWebsiteContentDraft(String(req.params.revisionId), req.body);
  res.json({ revision: serializeWebsiteContentRevision(revision) });
}));

websiteContentRouter.post("/revisions/:revisionId/clone-draft", validateBody(emptyTransitionSchema), asyncHandler(async (req, res) => {
  const revision = await clonePublishedRevision(String(req.params.revisionId), req.user!.id);
  res.status(201).json({ revision: serializeWebsiteContentRevision(revision) });
}));

websiteContentRouter.post("/revisions/:revisionId/submit-review", validateBody(emptyTransitionSchema), asyncHandler(async (req, res) => {
  const revision = await submitWebsiteContentForReview(String(req.params.revisionId), req.user!.id);
  res.json({ revision: serializeWebsiteContentRevision(revision) });
}));

websiteContentRouter.post("/revisions/:revisionId/approve", validateBody(emptyTransitionSchema), asyncHandler(async (req, res) => {
  const revision = await approveWebsiteContent(String(req.params.revisionId), req.user!.id);
  res.json({ revision: serializeWebsiteContentRevision(revision) });
}));

websiteContentRouter.post("/revisions/:revisionId/publish", validateBody(publishWebsiteContentSchema), asyncHandler(async (req, res) => {
  const revision = await publishWebsiteContent(String(req.params.revisionId), req.user!.id, req.body);
  res.json({ revision: serializeWebsiteContentRevision(revision) });
}));

websiteContentRouter.get("/contents/:contentId/history", asyncHandler(async (req, res) => {
  const content = await getWebsiteContentHistory(String(req.params.contentId));
  res.json({ content: serializeWebsiteContent(content) });
}));

websiteContentRouter.get("/contents/:contentId/published", asyncHandler(async (req, res) => {
  const revision = await resolvePublishedWebsiteContent(String(req.params.contentId));
  res.json({ revision: serializeWebsiteContentRevision(revision) });
}));

websiteContentRouter.post("/revisions/:revisionId/media", validateBody(createWebsiteContentMediaSchema), asyncHandler(async (req, res) => {
  const media = await addWebsiteContentMedia(String(req.params.revisionId), req.body);
  res.status(201).json({ media: serializeWebsiteContentMedia(media) });
}));

websiteContentRouter.put("/revisions/:revisionId/media/:mediaId", validateBody(updateWebsiteContentMediaSchema), asyncHandler(async (req, res) => {
  const media = await updateWebsiteContentMedia(String(req.params.revisionId), String(req.params.mediaId), req.body);
  res.json({ media: serializeWebsiteContentMedia(media) });
}));

websiteContentRouter.delete("/revisions/:revisionId/media/:mediaId", asyncHandler(async (req, res) => {
  await removeWebsiteContentMedia(String(req.params.revisionId), String(req.params.mediaId));
  res.status(204).send();
}));
