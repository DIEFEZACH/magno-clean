import assert from "node:assert/strict";
import test from "node:test";
import { Role, WebsiteContentSection, WebsiteContentStatus } from "@prisma/client";
import { AppError } from "../errors/AppError";
import { authenticate, authorize } from "../middleware/auth";
import { updateWebsiteContentDraftSchema } from "../schemas/websiteContent";
import {
  approveWebsiteContent,
  clonePublishedRevision,
  createWebsiteContentDraft,
  publishWebsiteContent,
  resolvePublishedWebsiteContent,
  submitWebsiteContentForReview,
  updateWebsiteContentDraft,
  validateRevisionForPublication,
} from "./websiteContent";

function fakeEditorialDb(options: { reviewRequired?: boolean } = {}) {
  const state: any = {
    families: [{ id: "family-1", name: "Familia", slug: "familia" }],
    products: [{ id: "product-1", name: "Producto", slug: "producto", code: "SKU-1" }],
    contents: [], revisions: [], entries: [], faq: [],
    sources: options.reviewRequired ? [{ id: "source-1", contentId: "content-1", reviewRequired: true }] : [],
    sequence: 0,
  };
  const id = (prefix: string) => `${prefix}-${++state.sequence}`;
  const revision = (row: any) => row && ({
    ...row,
    entries: state.entries.filter((item: any) => item.revisionId === row.id),
    faq: state.faq.filter((item: any) => item.revisionId === row.id),
    content: {
      ...state.contents.find((item: any) => item.id === row.contentId),
      sources: state.sources.filter((item: any) => item.contentId === row.contentId),
    },
  });
  const content = (row: any) => row && ({
    ...row,
    family: state.families.find((item: any) => item.id === row.familyId) || null,
    product: state.products.find((item: any) => item.id === row.productId) || null,
    sources: state.sources.filter((item: any) => item.contentId === row.id),
    revisions: state.revisions.filter((item: any) => item.contentId === row.id).map(revision),
    publishedRevision: revision(state.revisions.find((item: any) => item.id === row.publishedRevisionId)) || null,
  });
  const db: any = {
    $transaction: async (callback: (tx: any) => unknown) => callback(db),
    productFamily: { findUnique: async ({ where }: any) => state.families.find((item: any) => item.id === where.id) || null },
    product: { findUnique: async ({ where }: any) => state.products.find((item: any) => item.id === where.id) || null },
    websiteContent: {
      findUnique: async ({ where }: any) => content(state.contents.find((item: any) =>
        (where.id && item.id === where.id) || (where.familyId && item.familyId === where.familyId) || (where.productId && item.productId === where.productId))),
      create: async ({ data }: any) => {
        const row = { id: state.contents.length ? id("content") : "content-1", publishedRevisionId: null, ...data };
        state.contents.push(row); return content(row);
      },
      update: async ({ where, data }: any) => {
        const row = state.contents.find((item: any) => item.id === where.id); Object.assign(row, data); return content(row);
      },
    },
    websiteContentRevision: {
      aggregate: async ({ where }: any) => ({ _max: { version: Math.max(0, ...state.revisions.filter((item: any) => item.contentId === where.contentId).map((item: any) => item.version)) } }),
      create: async ({ data }: any) => {
        const row = { id: id("revision"), title: null, shortDescription: null, longDescription: null, seoTitle: null, seoDescription: null, technicalSheetUrl: null, sdsUrl: null, reviewedById: null, approvedById: null, publishedById: null, conflictsConfirmedById: null, conflictsConfirmedAt: null, conflictsConfirmationNote: null, ...data };
        delete row.entries; delete row.faq; state.revisions.push(row);
        for (const item of data.entries?.create || []) state.entries.push({ id: id("entry"), revisionId: row.id, ...item });
        for (const item of data.faq?.create || []) state.faq.push({ id: id("faq"), revisionId: row.id, ...item });
        return revision(row);
      },
      findUnique: async ({ where }: any) => revision(state.revisions.find((item: any) => item.id === where.id)),
      findUniqueOrThrow: async ({ where }: any) => {
        const row = revision(state.revisions.find((item: any) => item.id === where.id)); if (!row) throw new Error("not found"); return row;
      },
      update: async ({ where, data }: any) => {
        const row = state.revisions.find((item: any) => item.id === where.id); Object.assign(row, data); return revision(row);
      },
      updateMany: async ({ where, data }: any) => {
        const row = state.revisions.find((item: any) => item.id === where.id && item.status === where.status);
        if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 };
      },
    },
    websiteContentEntry: {
      deleteMany: async ({ where }: any) => { state.entries = state.entries.filter((item: any) => !(item.revisionId === where.revisionId && item.section === where.section)); },
      createMany: async ({ data }: any) => { for (const item of data) state.entries.push({ id: id("entry"), ...item }); },
    },
    websiteContentFaq: {
      deleteMany: async ({ where }: any) => { state.faq = state.faq.filter((item: any) => item.revisionId !== where.revisionId); },
      createMany: async ({ data }: any) => { for (const item of data) state.faq.push({ id: id("faq"), ...item }); },
    },
  };
  return { db, state };
}

const validDraft = { title: "Producto aprobado", shortDescription: "Descripción breve", pictograms: ["GHS05"], faq: [{ question: "¿Cómo usar?", answer: "Según la ficha." }] };

async function approvedFixture(options: { reviewRequired?: boolean } = {}) {
  const fixture = fakeEditorialDb(options);
  const draft = await createWebsiteContentDraft({ type: "family", id: "family-1" }, "creator", validDraft, fixture.db);
  await submitWebsiteContentForReview(draft.id, "reviewer", fixture.db);
  await approveWebsiteContent(draft.id, "approver", fixture.db);
  return { ...fixture, revisionId: draft.id };
}

test("crea WebsiteContent y primera revisión DRAFT con auditoría", async () => {
  const { db, state } = fakeEditorialDb();
  const draft = await createWebsiteContentDraft({ type: "family", id: "family-1" }, "admin-1", validDraft, db);
  assert.equal(draft.status, WebsiteContentStatus.DRAFT);
  assert.equal(draft.createdById, "admin-1");
  assert.equal(state.contents.length, 1);
});

test("edita exclusivamente una revisión DRAFT", async () => {
  const { db } = fakeEditorialDb();
  const draft = await createWebsiteContentDraft({ type: "product", id: "product-1" }, "admin", validDraft, db);
  const edited = await updateWebsiteContentDraft(draft.id, { title: "Título editado", benefits: ["Beneficio"] }, db);
  assert.equal(edited.title, "Título editado");
  assert.ok(edited.entries.some((entry: any) => entry.section === WebsiteContentSection.BENEFIT && entry.value === "Beneficio"));
});

test("DRAFT → REVIEW registra reviewedById y reviewedAt", async () => {
  const { db } = fakeEditorialDb();
  const draft = await createWebsiteContentDraft({ type: "family", id: "family-1" }, "creator", validDraft, db);
  const review = await submitWebsiteContentForReview(draft.id, "reviewer", db);
  assert.equal(review.status, WebsiteContentStatus.REVIEW); assert.equal(review.reviewedById, "reviewer"); assert.ok(review.reviewedAt);
});

test("REVIEW → APPROVED registra approvedById y approvedAt", async () => {
  const { db } = fakeEditorialDb();
  const draft = await createWebsiteContentDraft({ type: "family", id: "family-1" }, "creator", validDraft, db);
  await submitWebsiteContentForReview(draft.id, "reviewer", db);
  const approved = await approveWebsiteContent(draft.id, "approver", db);
  assert.equal(approved.status, WebsiteContentStatus.APPROVED); assert.equal(approved.approvedById, "approver"); assert.ok(approved.approvedAt);
});

test("APPROVED → PUBLISHED registra auditoría y publishedRevisionId", async () => {
  const { db, state, revisionId } = await approvedFixture();
  const published = await publishWebsiteContent(revisionId, "publisher", {}, db);
  assert.equal(published.status, WebsiteContentStatus.PUBLISHED); assert.equal(published.publishedById, "publisher"); assert.ok(published.publishedAt);
  assert.equal(state.contents[0].publishedRevisionId, revisionId);
  assert.equal((await resolvePublishedWebsiteContent(state.contents[0].id, db)).id, revisionId);
});

test("rechaza saltos de estado", async () => {
  const { db } = fakeEditorialDb();
  const draft = await createWebsiteContentDraft({ type: "family", id: "family-1" }, "creator", validDraft, db);
  await assert.rejects(approveWebsiteContent(draft.id, "admin", db), (error: any) => error instanceof AppError && error.statusCode === 409);
});

test("rechaza edición de PUBLISHED", async () => {
  const { db, revisionId } = await approvedFixture();
  await publishWebsiteContent(revisionId, "publisher", {}, db);
  await assert.rejects(updateWebsiteContentDraft(revisionId, { title: "No" }, db), /DRAFT/);
});

test("clona PUBLISHED como nueva DRAFT sin modificar la publicada", async () => {
  const { db, revisionId } = await approvedFixture();
  await publishWebsiteContent(revisionId, "publisher", {}, db);
  const clone = await clonePublishedRevision(revisionId, "editor", db);
  assert.equal(clone.status, WebsiteContentStatus.DRAFT); assert.equal(clone.version, 2); assert.equal(clone.title, validDraft.title);
});

function publicationRevision(overrides: any = {}) {
  return { title: "Título", shortDescription: "Descripción", longDescription: null, technicalSheetUrl: null, sdsUrl: null, entries: [], faq: [], content: { sources: [] }, ...overrides };
}

test("publicación rechaza title faltante", () => assert.throws(() => validateRevisionForPublication(publicationRevision({ title: null }), {}), /requisitos/));
test("publicación rechaza ambas descripciones faltantes", () => assert.throws(() => validateRevisionForPublication(publicationRevision({ shortDescription: null, longDescription: null }), {}), /requisitos/));
test("publicación rechaza pictograma fuera de GHS01–GHS09", () => assert.throws(() => validateRevisionForPublication(publicationRevision({ entries: [{ section: WebsiteContentSection.PICTOGRAM, value: "GHS10" }] }), {}), /requisitos/));
test("publicación rechaza FAQ incompleta", () => assert.throws(() => validateRevisionForPublication(publicationRevision({ faq: [{ question: "", answer: "Respuesta" }] }), {}), /requisitos/));
test("publicación rechaza URL inválida", () => assert.throws(() => validateRevisionForPublication(publicationRevision({ technicalSheetUrl: "javascript:alert(1)" }), {}), /requisitos/));
test("publicación rechaza medios sin alt", () => assert.throws(() => validateRevisionForPublication(publicationRevision({ media: [{ alt: "", reviewRequired: false }] }), {}), /requisitos/));
test("publicación trata un medio marcado como conflicto editorial", () => assert.throws(() => validateRevisionForPublication(publicationRevision({ media: [{ alt: "Texto", reviewRequired: true }] }), {}), /requisitos/));
test("publicación rechaza conflicto sin confirmación", () => assert.throws(() => validateRevisionForPublication(publicationRevision({ content: { sources: [{ reviewRequired: true }] } }), {}), /requisitos/));
test("publicación rechaza revisión completamente vacía", () => assert.throws(() => validateRevisionForPublication(publicationRevision({ title: null, shortDescription: null, longDescription: null }), {}), /requisitos/));

test("conflicto confirmado exige y registra nota, usuario y fecha", async () => {
  const { db, revisionId } = await approvedFixture({ reviewRequired: true });
  await assert.rejects(publishWebsiteContent(revisionId, "publisher", { confirmConflicts: true }, db), /requisitos/);
  const published = await publishWebsiteContent(revisionId, "publisher", { confirmConflicts: true, confirmationNote: "Revisado contra documento fuente" }, db);
  assert.equal(published.conflictsConfirmedById, "publisher"); assert.ok(published.conflictsConfirmedAt); assert.equal(published.conflictsConfirmationNote, "Revisado contra documento fuente");
});

test("payload de edición no acepta status arbitrario", () => {
  assert.equal(updateWebsiteContentDraftSchema.safeParse({ title: "Válido", status: "PUBLISHED" }).success, false);
});

test("sin JWT produce 401 y CUSTOMER produce 403", () => {
  let unauthenticated: unknown;
  authenticate({ headers: {} } as never, {} as never, (error) => { unauthenticated = error; });
  assert.equal((unauthenticated as AppError).statusCode, 401);
  let forbidden: unknown;
  authorize(Role.ADMIN)({ user: { id: "u1", email: "customer@example.com", role: Role.CUSTOMER } } as never, {} as never, (error) => { forbidden = error; });
  assert.equal((forbidden as AppError).statusCode, 403);
});

test("ADMIN supera autorización", () => {
  let error: unknown; let allowed = false;
  authorize(Role.ADMIN)({ user: { id: "admin", email: "admin@example.com", role: Role.ADMIN } } as never, {} as never, (value) => { error = value; allowed = !value; });
  assert.equal(error, undefined); assert.equal(allowed, true);
});
