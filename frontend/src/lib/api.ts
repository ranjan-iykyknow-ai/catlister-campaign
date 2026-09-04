import type {
  Campaign,
  CampaignInput,
  CampaignRun,
  Collection,
  Contact,
  ContactInput,
  MessageTemplate,
  SendCampaignResponse,
  TemplateInput,
  AuthSession,
} from "@/types/api";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const nested = typeof body === "object" && body !== null && "error" in body ? body.error : body;
    const message =
      typeof nested === "object" && nested !== null && "message" in nested
        ? String(nested.message)
        : typeof body === "object" && body !== null && "detail" in body
          ? String(body.detail)
          : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, body);
  }
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const listCampaigns = () => request<Collection<Campaign>>("/v1/campaigns");
export const getCampaign = (id: string) => request<Campaign>(`/v1/campaigns/${id}`);
export const createCampaign = (input: CampaignInput) =>
  request<Campaign>("/v1/campaigns", json("POST", input));
export const updateCampaign = (id: string, input: Partial<CampaignInput>) =>
  request<Campaign>(`/v1/campaigns/${id}`, json("PATCH", input));
export const deleteCampaign = (id: string) => request<void>(`/v1/campaigns/${id}`, json("DELETE"));

export const createContact = (campaignId: string, input: ContactInput) =>
  request<Contact>(`/v1/campaigns/${campaignId}/contacts`, json("POST", input));
export const updateContact = (campaignId: string, id: string, input: Partial<ContactInput>) =>
  request<Contact>(`/v1/campaigns/${campaignId}/contacts/${id}`, json("PATCH", input));
export const deleteContact = (campaignId: string, id: string) =>
  request<void>(`/v1/campaigns/${campaignId}/contacts/${id}`, json("DELETE"));
export const importContacts = (campaignId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<{ imported: number; contacts: Contact[] }>(`/v1/campaigns/${campaignId}/contacts/import`, {
    method: "POST",
    body: form,
  });
};

export const listTemplates = () => request<Collection<MessageTemplate>>("/v1/templates");
export const createTemplate = (input: TemplateInput) =>
  request<MessageTemplate>("/v1/templates", json("POST", input));
export const updateTemplate = (id: string, input: Partial<TemplateInput>) =>
  request<MessageTemplate>(`/v1/templates/${id}`, json("PATCH", input));
export const deleteTemplate = (id: string) => request<void>(`/v1/templates/${id}`, json("DELETE"));

export const sendCampaign = (campaignId: string) =>
  request<SendCampaignResponse>(`/v1/campaigns/${campaignId}/send`, json("POST"));
export const getRun = (campaignId: string, runId: string) =>
  request<CampaignRun>(`/v1/campaigns/${campaignId}/runs/${runId}`);
export const getSession = () => request<AuthSession>("/v1/auth/session");
export const login = (password: string) => request<AuthSession>("/v1/auth/session", json("POST", { password }));
export const logout = () => request<AuthSession>("/v1/auth/session", json("DELETE"));
