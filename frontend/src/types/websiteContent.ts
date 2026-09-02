export type ContentTargetType = "family" | "product";
export type WebsiteContentStatus = "DRAFT" | "REVIEW" | "APPROVED" | "PUBLISHED";
export type WebsiteContentSourceLayer = "SOURCE_TECHNICAL" | "DERIVED_COMMERCIAL";

export type EditorialUser = { id: string; name: string; email: string };
export type WebsiteContentSource = {
  id: string;
  layer: WebsiteContentSourceLayer;
  sourceFile: string | null;
  data: unknown;
  reviewRequired: boolean;
  confidence: "LOW" | "MEDIUM" | "HIGH" | null;
  createdAt: string;
};
export type WebsiteContentEntry = { id: string; section: "BENEFIT" | "APPLICATION" | "USAGE" | "DILUTION" | "PRECAUTION" | "PICTOGRAM" | "SEO_KEYWORD"; value: string; position: number };
export type WebsiteContentFaq = { id?: string; question: string; answer: string; position?: number };
export type WebsiteContentRevision = {
  id: string; version: number; status: WebsiteContentStatus;
  title: string | null; shortDescription: string | null; longDescription: string | null;
  seoTitle: string | null; seoDescription: string | null; technicalSheetUrl: string | null; sdsUrl: string | null;
  entries: WebsiteContentEntry[]; faq: WebsiteContentFaq[];
  createdBy: EditorialUser; reviewedBy: EditorialUser | null; approvedBy: EditorialUser | null; publishedBy: EditorialUser | null;
  conflictsConfirmedBy: EditorialUser | null; conflictsConfirmationNote: string | null;
  reviewedAt: string | null; approvedAt: string | null; publishedAt: string | null; createdAt: string; updatedAt: string;
};
export type WebsiteContent = {
  id: string; familyId: string | null; productId: string | null; publishedRevisionId: string | null;
  family: { id: string; name: string; slug: string } | null;
  product: { id: string; name: string; slug: string; code: string } | null;
  sources: WebsiteContentSource[]; revisions: WebsiteContentRevision[]; publishedRevision: WebsiteContentRevision | null;
  createdAt: string; updatedAt: string;
};
export type RevisionPayload = {
  title: string; shortDescription: string; longDescription: string;
  benefits: string[]; applications: string[]; usage: string[]; dilution: string[]; precautions: string[];
  pictograms: string[]; faq: Array<{ question: string; answer: string }>;
  seoTitle: string; seoDescription: string; seoKeywords: string[]; technicalSheetUrl: string | null; sdsUrl: string | null;
};
