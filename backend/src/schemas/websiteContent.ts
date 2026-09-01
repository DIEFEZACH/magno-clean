import { WebsiteContentSection } from "@prisma/client";
import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const nullableUrl = z.string().trim().url().max(2048).nullable();
const listItem = z.string().trim().min(1).max(1000);

export const websiteContentFaqSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(3000),
}).strict();

export const websiteContentRevisionFieldsSchema = z.object({
  title: nullableText(200).optional(),
  shortDescription: nullableText(1000).optional(),
  longDescription: nullableText(20000).optional(),
  seoTitle: nullableText(200).optional(),
  seoDescription: nullableText(500).optional(),
  technicalSheetUrl: nullableUrl.optional(),
  sdsUrl: nullableUrl.optional(),
  benefits: z.array(listItem).max(50).optional(),
  applications: z.array(listItem).max(50).optional(),
  usage: z.array(listItem).max(50).optional(),
  dilution: z.array(listItem).max(50).optional(),
  precautions: z.array(listItem).max(50).optional(),
  pictograms: z.array(z.string().trim().min(1).max(20)).max(9).optional(),
  seoKeywords: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  faq: z.array(websiteContentFaqSchema).max(50).optional(),
}).strict();

export const createWebsiteContentDraftSchema = websiteContentRevisionFieldsSchema.extend({
  clonePublished: z.boolean().optional().default(false),
}).strict();

export const updateWebsiteContentDraftSchema = websiteContentRevisionFieldsSchema.refine(
  (value) => Object.keys(value).length > 0,
  "Actualización vacía",
);

export const publishWebsiteContentSchema = z.object({
  confirmConflicts: z.boolean().optional().default(false),
  confirmationNote: z.string().trim().min(5).max(1000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.confirmConflicts && !value.confirmationNote) {
    ctx.addIssue({ code: "custom", path: ["confirmationNote"], message: "La nota de confirmación es obligatoria" });
  }
});

export const emptyTransitionSchema = z.object({}).strict();

export type WebsiteContentRevisionInput = z.infer<typeof websiteContentRevisionFieldsSchema>;
export type PublishWebsiteContentInput = z.input<typeof publishWebsiteContentSchema>;

export const sectionByField = {
  benefits: WebsiteContentSection.BENEFIT,
  applications: WebsiteContentSection.APPLICATION,
  usage: WebsiteContentSection.USAGE,
  dilution: WebsiteContentSection.DILUTION,
  precautions: WebsiteContentSection.PRECAUTION,
  pictograms: WebsiteContentSection.PICTOGRAM,
  seoKeywords: WebsiteContentSection.SEO_KEYWORD,
} as const;
