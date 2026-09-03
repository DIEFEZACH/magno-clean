import { apiFetch } from "./api";
import type { ContentTargetType, CreateWebsiteContentMediaPayload, RevisionPayload, WebsiteContent, WebsiteContentMedia, WebsiteContentRevision } from "../types/websiteContent";

export const targetPath = (type: ContentTargetType, id: string) => `/api/admin/website-content/${type === "family" ? "families" : "products"}/${id}`;
export async function fetchWebsiteContent(type: ContentTargetType, id: string): Promise<WebsiteContent | null> {
  const response = await apiFetch(targetPath(type, id));
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "No se pudo cargar el contenido editorial");
  return (await response.json()).content || null;
}
export async function createDraft(type: ContentTargetType, id: string, payload: Partial<RevisionPayload> & { clonePublished?: boolean }) {
  return editorialRequest(`${targetPath(type, id)}/drafts`, "POST", payload);
}
export async function updateDraft(id: string, payload: RevisionPayload) { return editorialRequest(`/api/admin/website-content/revisions/${id}`, "PUT", payload); }
export async function transitionRevision(id: string, transition: "submit-review" | "approve", payload: object = {}) { return editorialRequest(`/api/admin/website-content/revisions/${id}/${transition}`, "POST", payload); }
export async function publishRevision(id: string, payload: { confirmConflicts?: boolean; confirmationNote?: string }) { return editorialRequest(`/api/admin/website-content/revisions/${id}/publish`, "POST", payload); }
export async function clonePublished(id: string) { return editorialRequest(`/api/admin/website-content/revisions/${id}/clone-draft`, "POST", {}); }
export async function addRevisionMedia(revisionId: string, payload: CreateWebsiteContentMediaPayload) {
  return mediaRequest(`/api/admin/website-content/revisions/${revisionId}/media`, "POST", payload);
}
export async function updateRevisionMedia(revisionId: string, mediaId: string, payload: Pick<WebsiteContentMedia, "role" | "alt" | "position">) {
  return mediaRequest(`/api/admin/website-content/revisions/${revisionId}/media/${mediaId}`, "PUT", payload);
}
export async function removeRevisionMedia(revisionId: string, mediaId: string) {
  const response = await apiFetch(`/api/admin/website-content/revisions/${revisionId}/media/${mediaId}`, { method: "DELETE" });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "No se pudo quitar el medio editorial");
}
const validationMessages: Record<string, string> = {
  technicalSheetUrl: "Ficha técnica: introduce una URL válida o déjalo vacío.",
  sdsUrl: "Hoja de seguridad: introduce una URL válida o déjalo vacío.",
  faq: "Preguntas frecuentes: completa pregunta y respuesta.",
};

function validationMessage(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const response = data as { errors?: { fieldErrors?: Record<string, unknown> } };
  const fields = response.errors?.fieldErrors;
  if (!fields) return null;
  const invalidFields = Object.keys(fields).filter((field) => Array.isArray(fields[field]) && fields[field].length);
  if (!invalidFields.length) return null;
  return invalidFields.map((field) => validationMessages[field] || `${field}: revisa este campo.`).join(" ");
}

export function normalizeRevisionPayload(payload: RevisionPayload): RevisionPayload {
  return {
    ...payload,
    technicalSheetUrl: payload.technicalSheetUrl?.trim() || null,
    sdsUrl: payload.sdsUrl?.trim() || null,
  };
}

async function editorialRequest(path: string, method: string, payload: object): Promise<WebsiteContentRevision> {
  const normalizedPayload = "technicalSheetUrl" in payload || "sdsUrl" in payload
    ? normalizeRevisionPayload(payload as RevisionPayload)
    : payload;
  const response = await apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalizedPayload) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(validationMessage(data) || data?.message || "No se pudo completar la acción editorial");
  return data.revision;
}
async function mediaRequest(path: string, method: string, payload: object): Promise<WebsiteContentMedia> {
  const response = await apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "No se pudo completar la operación de medios");
  return data.media;
}
export const entries = (revision: WebsiteContentRevision | null, section: WebsiteContentRevision["entries"][number]["section"]) => revision?.entries.filter((entry) => entry.section === section).sort((a, b) => a.position - b.position).map((entry) => entry.value) || [];
export function payloadFromRevision(revision: WebsiteContentRevision | null): RevisionPayload {
  return { title: revision?.title || "", shortDescription: revision?.shortDescription || "", longDescription: revision?.longDescription || "", benefits: entries(revision, "BENEFIT"), applications: entries(revision, "APPLICATION"), usage: entries(revision, "USAGE"), dilution: entries(revision, "DILUTION"), precautions: entries(revision, "PRECAUTION"), pictograms: entries(revision, "PICTOGRAM"), faq: revision?.faq.map(({ question, answer }) => ({ question, answer })) || [], seoTitle: revision?.seoTitle || "", seoDescription: revision?.seoDescription || "", seoKeywords: entries(revision, "SEO_KEYWORD"), technicalSheetUrl: revision?.technicalSheetUrl || null, sdsUrl: revision?.sdsUrl || null };
}
