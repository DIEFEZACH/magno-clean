import { Prisma, WebsiteContentSection, WebsiteContentStatus } from "@prisma/client";
import { AppError } from "../errors/AppError";
import { prisma } from "../lib/prisma";
import {
  sectionByField,
  type CreateWebsiteContentMediaInput,
  type PublishWebsiteContentInput,
  type UpdateWebsiteContentMediaInput,
  type WebsiteContentRevisionInput,
} from "../schemas/websiteContent";
import { inspectWebsiteContentMedia, publicWebsiteContentMediaUrl } from "./websiteContentMediaStorage";

type ContentTarget = { type: "family" | "product"; id: string };
type DbClient = typeof prisma | Prisma.TransactionClient;

const revisionInclude = {
  entries: { orderBy: [{ section: "asc" as const }, { position: "asc" as const }] },
  faq: { orderBy: { position: "asc" as const } },
  createdBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  publishedBy: { select: { id: true, name: true, email: true } },
  conflictsConfirmedBy: { select: { id: true, name: true, email: true } },
  media: { orderBy: [{ role: "asc" as const }, { position: "asc" as const }] },
} satisfies Prisma.WebsiteContentRevisionInclude;

const contentInclude = {
  family: { select: { id: true, name: true, slug: true } },
  product: { select: { id: true, name: true, slug: true, code: true } },
  sources: {
    orderBy: { createdAt: "desc" as const },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  },
  revisions: { orderBy: { version: "desc" as const }, include: revisionInclude },
  publishedRevision: { include: revisionInclude },
} satisfies Prisma.WebsiteContentInclude;

function cleanText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const cleaned = value?.trim() || null;
  return cleaned;
}

function scalarRevisionData(input: WebsiteContentRevisionInput) {
  return {
    ...(input.title !== undefined ? { title: cleanText(input.title) } : {}),
    ...(input.shortDescription !== undefined ? { shortDescription: cleanText(input.shortDescription) } : {}),
    ...(input.longDescription !== undefined ? { longDescription: cleanText(input.longDescription) } : {}),
    ...(input.seoTitle !== undefined ? { seoTitle: cleanText(input.seoTitle) } : {}),
    ...(input.seoDescription !== undefined ? { seoDescription: cleanText(input.seoDescription) } : {}),
    ...(input.technicalSheetUrl !== undefined ? { technicalSheetUrl: cleanText(input.technicalSheetUrl) } : {}),
    ...(input.sdsUrl !== undefined ? { sdsUrl: cleanText(input.sdsUrl) } : {}),
  };
}

function entryCreateData(input: WebsiteContentRevisionInput) {
  return Object.entries(sectionByField).flatMap(([field, section]) => {
    const values = input[field as keyof typeof sectionByField];
    return Array.isArray(values)
      ? values.map((value, position) => ({ section, value: value.trim(), position }))
      : [];
  });
}

function faqCreateData(input: WebsiteContentRevisionInput) {
  return (input.faq || []).map((item, position) => ({
    question: item.question.trim(),
    answer: item.answer.trim(),
    position,
  }));
}

async function assertTargetExists(db: DbClient, target: ContentTarget) {
  const exists = target.type === "family"
    ? await db.productFamily.findUnique({ where: { id: target.id }, select: { id: true } })
    : await db.product.findUnique({ where: { id: target.id }, select: { id: true } });
  if (!exists) throw new AppError(404, target.type === "family" ? "Familia no encontrada" : "Producto no encontrado");
}

async function contentForTarget(db: DbClient, target: ContentTarget) {
  return db.websiteContent.findUnique({
    where: target.type === "family" ? { familyId: target.id } : { productId: target.id },
    include: contentInclude,
  });
}

async function nextVersion(db: DbClient, contentId: string) {
  const aggregate = await db.websiteContentRevision.aggregate({
    where: { contentId },
    _max: { version: true },
  });
  return (aggregate._max.version || 0) + 1;
}

async function createRevision(
  db: DbClient,
  contentId: string,
  actorId: string,
  input: WebsiteContentRevisionInput,
) {
  return db.websiteContentRevision.create({
    data: {
      contentId,
      version: await nextVersion(db, contentId),
      status: WebsiteContentStatus.DRAFT,
      createdById: actorId,
      ...scalarRevisionData(input),
      entries: { create: entryCreateData(input) },
      faq: { create: faqCreateData(input) },
    },
    include: revisionInclude,
  });
}

function inputFromRevision(revision: any): WebsiteContentRevisionInput {
  const values = (section: WebsiteContentSection) => revision.entries
    .filter((entry: any) => entry.section === section)
    .sort((a: any, b: any) => a.position - b.position)
    .map((entry: any) => entry.value);
  return {
    title: revision.title,
    shortDescription: revision.shortDescription,
    longDescription: revision.longDescription,
    seoTitle: revision.seoTitle,
    seoDescription: revision.seoDescription,
    technicalSheetUrl: revision.technicalSheetUrl,
    sdsUrl: revision.sdsUrl,
    benefits: values(WebsiteContentSection.BENEFIT),
    applications: values(WebsiteContentSection.APPLICATION),
    usage: values(WebsiteContentSection.USAGE),
    dilution: values(WebsiteContentSection.DILUTION),
    precautions: values(WebsiteContentSection.PRECAUTION),
    pictograms: values(WebsiteContentSection.PICTOGRAM),
    seoKeywords: values(WebsiteContentSection.SEO_KEYWORD),
    faq: revision.faq
      .sort((a: any, b: any) => a.position - b.position)
      .map((item: any) => ({ question: item.question, answer: item.answer })),
  };
}

export async function getWebsiteContent(target: ContentTarget, client: any = prisma) {
  await assertTargetExists(client, target);
  return contentForTarget(client, target);
}

export async function createWebsiteContentDraft(
  target: ContentTarget,
  actorId: string,
  input: WebsiteContentRevisionInput & { clonePublished?: boolean },
  client: any = prisma,
) {
  return client.$transaction(async (tx: any) => {
    await assertTargetExists(tx, target);
    let content = await contentForTarget(tx, target);
    if (!content) {
      content = await tx.websiteContent.create({
        data: target.type === "family" ? { familyId: target.id } : { productId: target.id },
        include: contentInclude,
      });
    }

    let draftInput: WebsiteContentRevisionInput = input;
    if (input.clonePublished) {
      if (!content.publishedRevision) throw new AppError(409, "No existe una revisión publicada para clonar");
      draftInput = inputFromRevision(content.publishedRevision);
    }

    return createRevision(tx, content.id, actorId, draftInput);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function clonePublishedRevision(revisionId: string, actorId: string, client: any = prisma) {
  return client.$transaction(async (tx: any) => {
    const revision = await tx.websiteContentRevision.findUnique({
      where: { id: revisionId },
      include: { entries: true, faq: true, media: true },
    });
    if (!revision) throw new AppError(404, "Revisión no encontrada");
    if (revision.status !== WebsiteContentStatus.PUBLISHED) throw new AppError(409, "Sólo puede clonarse una revisión publicada");
    const draft = await createRevision(tx, revision.contentId, actorId, inputFromRevision(revision));
    if ((revision.media || []).length) {
      await tx.websiteContentMedia.createMany({
        data: revision.media.map((media: any) => ({
          revisionId: draft.id,
          role: media.role,
          bucket: media.bucket,
          storagePath: media.storagePath,
          alt: media.alt,
          position: media.position,
          width: media.width,
          height: media.height,
          byteSize: media.byteSize,
          sha256: media.sha256,
          mimeType: media.mimeType,
          reviewRequired: media.reviewRequired,
          editorialWarning: media.editorialWarning,
        })),
      });
    }
    return tx.websiteContentRevision.findUniqueOrThrow({ where: { id: draft.id }, include: revisionInclude });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateWebsiteContentDraft(revisionId: string, input: WebsiteContentRevisionInput, client: any = prisma) {
  return client.$transaction(async (tx: any) => {
    const revision = await tx.websiteContentRevision.findUnique({ where: { id: revisionId }, select: { id: true, status: true } });
    if (!revision) throw new AppError(404, "Revisión no encontrada");
    if (revision.status !== WebsiteContentStatus.DRAFT) throw new AppError(409, "Sólo las revisiones DRAFT pueden editarse");

    await tx.websiteContentRevision.update({ where: { id: revisionId }, data: scalarRevisionData(input) });
    for (const [field, section] of Object.entries(sectionByField)) {
      const values = input[field as keyof typeof sectionByField];
      if (!Array.isArray(values)) continue;
      await tx.websiteContentEntry.deleteMany({ where: { revisionId, section } });
      if (values.length) {
        await tx.websiteContentEntry.createMany({ data: values.map((value, position) => ({ revisionId, section, value: value.trim(), position })) });
      }
    }
    if (input.faq !== undefined) {
      await tx.websiteContentFaq.deleteMany({ where: { revisionId } });
      if (input.faq.length) {
        await tx.websiteContentFaq.createMany({ data: faqCreateData(input).map((item) => ({ revisionId, ...item })) });
      }
    }
    return tx.websiteContentRevision.findUniqueOrThrow({ where: { id: revisionId }, include: revisionInclude });
  });
}

async function transitionRevision(
  revisionId: string,
  expected: WebsiteContentStatus,
  next: WebsiteContentStatus,
  actorId: string,
  client: any,
) {
  const now = new Date();
  const audit = next === WebsiteContentStatus.REVIEW
    ? { reviewedById: actorId, reviewedAt: now }
    : { approvedById: actorId, approvedAt: now };
  const result = await client.websiteContentRevision.updateMany({
    where: { id: revisionId, status: expected },
    data: { status: next, ...audit },
  });
  if (result.count !== 1) {
    const revision = await client.websiteContentRevision.findUnique({ where: { id: revisionId }, select: { status: true } });
    if (!revision) throw new AppError(404, "Revisión no encontrada");
    throw new AppError(409, `Transición no permitida: ${revision.status} → ${next}`);
  }
  return client.websiteContentRevision.findUniqueOrThrow({ where: { id: revisionId }, include: revisionInclude });
}

export function submitWebsiteContentForReview(revisionId: string, actorId: string, client: any = prisma) {
  return transitionRevision(revisionId, WebsiteContentStatus.DRAFT, WebsiteContentStatus.REVIEW, actorId, client);
}

export function approveWebsiteContent(revisionId: string, actorId: string, client: any = prisma) {
  return transitionRevision(revisionId, WebsiteContentStatus.REVIEW, WebsiteContentStatus.APPROVED, actorId, client);
}

function validHttpUrl(value: string | null) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateRevisionForPublication(revision: any, input: PublishWebsiteContentInput) {
  const errors: string[] = [];
  if (!revision.title?.trim()) errors.push("title es obligatorio");
  if (!revision.shortDescription?.trim() && !revision.longDescription?.trim()) {
    errors.push("Se requiere shortDescription o longDescription");
  }
  if (!validHttpUrl(revision.technicalSheetUrl) || !validHttpUrl(revision.sdsUrl)) errors.push("URL documental inválida");
  if (revision.faq.some((item: any) => !item.question?.trim() || !item.answer?.trim())) errors.push("FAQ incompleta");
  const invalidPictograms = revision.entries
    .filter((entry: any) => entry.section === WebsiteContentSection.PICTOGRAM)
    .map((entry: any) => entry.value)
    .filter((value: string) => !/^GHS0[1-9]$/.test(value));
  if (invalidPictograms.length) errors.push(`Pictograma inválido: ${invalidPictograms.join(", ")}`);

  const media = revision.media || [];
  if (media.some((item: any) => !item.alt?.trim())) errors.push("Todos los medios requieren texto alternativo");
  const hasConflicts = revision.content.sources.some((source: any) => source.reviewRequired)
    || media.some((item: any) => item.reviewRequired);
  if (hasConflicts && !input.confirmConflicts) errors.push("Existen fuentes conflictivas pendientes de confirmación");
  if (hasConflicts && input.confirmConflicts && !input.confirmationNote?.trim()) errors.push("La nota de confirmación es obligatoria");

  const hasAnyContent = Boolean(
    revision.title?.trim() || revision.shortDescription?.trim() || revision.longDescription?.trim()
    || revision.seoTitle?.trim() || revision.seoDescription?.trim()
    || revision.technicalSheetUrl || revision.sdsUrl || revision.entries.length || revision.faq.length,
  );
  if (!hasAnyContent) errors.push("La revisión está completamente vacía");
  if (errors.length) throw new AppError(400, "La revisión no cumple los requisitos de publicación", errors);
  return { hasConflicts };
}

export async function publishWebsiteContent(
  revisionId: string,
  actorId: string,
  input: PublishWebsiteContentInput,
  client: any = prisma,
) {
  return client.$transaction(async (tx: any) => {
    const revision = await tx.websiteContentRevision.findUnique({
      where: { id: revisionId },
      include: {
        entries: true,
        faq: true,
        media: true,
        content: { include: { sources: true } },
      },
    });
    if (!revision) throw new AppError(404, "Revisión no encontrada");
    if (revision.status !== WebsiteContentStatus.APPROVED) {
      throw new AppError(409, `Transición no permitida: ${revision.status} → PUBLISHED`);
    }
    const { hasConflicts } = validateRevisionForPublication(revision, input);
    const now = new Date();
    const updated = await tx.websiteContentRevision.updateMany({
      where: { id: revisionId, status: WebsiteContentStatus.APPROVED },
      data: {
        status: WebsiteContentStatus.PUBLISHED,
        publishedById: actorId,
        publishedAt: now,
        ...(hasConflicts ? {
          conflictsConfirmedById: actorId,
          conflictsConfirmedAt: now,
          conflictsConfirmationNote: input.confirmationNote!.trim(),
        } : {}),
      },
    });
    if (updated.count !== 1) throw new AppError(409, "La revisión cambió durante la publicación");
    await tx.websiteContent.update({
      where: { id: revision.contentId },
      data: { publishedRevisionId: revisionId },
    });
    return tx.websiteContentRevision.findUniqueOrThrow({ where: { id: revisionId }, include: revisionInclude });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getWebsiteContentHistory(contentId: string, client: any = prisma) {
  const content = await client.websiteContent.findUnique({ where: { id: contentId }, include: contentInclude });
  if (!content) throw new AppError(404, "Contenido editorial no encontrado");
  return content;
}

export async function resolvePublishedWebsiteContent(contentId: string, client: any = prisma) {
  const content = await client.websiteContent.findUnique({
    where: { id: contentId },
    select: { publishedRevisionId: true, publishedRevision: { include: revisionInclude } },
  });
  if (!content) throw new AppError(404, "Contenido editorial no encontrado");
  return content.publishedRevision;
}

async function assertDraftRevision(db: any, revisionId: string, lock = false) {
  const revision = lock && typeof db.$queryRaw === "function"
    ? (await db.$queryRaw(Prisma.sql`
        SELECT "id", "status"
        FROM "WebsiteContentRevision"
        WHERE "id" = ${revisionId}
        FOR UPDATE
      `))[0]
    : await db.websiteContentRevision.findUnique({ where: { id: revisionId }, select: { id: true, status: true } });
  if (!revision) throw new AppError(404, "Revisión no encontrada");
  if (revision.status !== WebsiteContentStatus.DRAFT) throw new AppError(409, "Los medios sólo pueden modificarse en una revisión DRAFT");
}

async function mediaTransaction<T>(client: any, operation: (tx: any) => Promise<T>) {
  if (typeof client.$transaction !== "function") return operation(client);
  return client.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function handleMediaConstraint(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError(409, "Ya existe un medio con ese role/orden o esa ruta en la revisión");
  }
  throw error;
}

export async function addWebsiteContentMedia(
  revisionId: string,
  input: CreateWebsiteContentMediaInput,
  client: any = prisma,
  inspect = inspectWebsiteContentMedia,
) {
  await assertDraftRevision(client, revisionId);
  const verified = await inspect(input.bucket, input.storagePath, input.sha256);
  try {
    return await mediaTransaction(client, async (tx) => {
      await assertDraftRevision(tx, revisionId, true);
      return tx.websiteContentMedia.create({
        data: {
          revisionId,
          role: input.role,
          bucket: input.bucket,
          storagePath: input.storagePath,
          alt: input.alt,
          position: input.position,
          ...verified,
        },
      });
    });
  } catch (error) {
    handleMediaConstraint(error);
  }
}

export async function updateWebsiteContentMedia(
  revisionId: string,
  mediaId: string,
  input: UpdateWebsiteContentMediaInput,
  client: any = prisma,
) {
  try {
    return await mediaTransaction(client, async (tx) => {
      await assertDraftRevision(tx, revisionId, true);
      const media = await tx.websiteContentMedia.findFirst({ where: { id: mediaId, revisionId }, select: { id: true } });
      if (!media) throw new AppError(404, "Medio editorial no encontrado");
      return tx.websiteContentMedia.update({ where: { id: mediaId }, data: input });
    });
  } catch (error) {
    handleMediaConstraint(error);
  }
}

export async function removeWebsiteContentMedia(revisionId: string, mediaId: string, client: any = prisma) {
  return mediaTransaction(client, async (tx) => {
    await assertDraftRevision(tx, revisionId, true);
    const result = await tx.websiteContentMedia.deleteMany({ where: { id: mediaId, revisionId } });
    if (result.count !== 1) throw new AppError(404, "Medio editorial no encontrado");
  });
}

export function serializeWebsiteContentMedia(media: any) {
  return { ...media, publicUrl: publicWebsiteContentMediaUrl(media.bucket, media.storagePath) };
}

export function serializeWebsiteContentRevision(revision: any) {
  if (!revision) return revision;
  return { ...revision, media: (revision.media || []).map(serializeWebsiteContentMedia) };
}

export function serializeWebsiteContent(content: any) {
  if (!content) return content;
  return {
    ...content,
    revisions: (content.revisions || []).map(serializeWebsiteContentRevision),
    publishedRevision: serializeWebsiteContentRevision(content.publishedRevision),
  };
}
