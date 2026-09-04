export type Provider = "fake" | "resend";
export type OutcomeStatus =
  | "pending"
  | "sending"
  | "sent"
  | "skipped"
  | "failed"
  | "unknown"
  | "not_attempted";
export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "interrupted";

export type Contact = {
  id: string;
  campaign_id: string;
  first_name: string;
  email: string;
  opted_out: boolean;
  created_at: string;
  updated_at: string;
};

export type MessageTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
  campaign_count: number;
};

export type DeliveryOutcome = {
  id: string;
  run_id: string;
  contact_id: string | null;
  position: number;
  first_name: string;
  email: string;
  subject: string;
  message: string;
  status: OutcomeStatus;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  attempted_at: string | null;
  completed_at: string | null;
};

export type CampaignRun = {
  id: string;
  campaign_id: string;
  status: RunStatus;
  provider: Provider;
  from_address: string | null;
  subject_snapshot: string;
  body_snapshot: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
  total: number;
  counts: Record<OutcomeStatus, number>;
  outcomes: DeliveryOutcome[];
};

export type Campaign = {
  id: string;
  name: string;
  description: string | null;
  template_id: string | null;
  created_at: string;
  updated_at: string;
  contact_count: number;
  eligible_count: number;
  template_name: string | null;
  template: MessageTemplate | null;
  contacts: Contact[];
  latest_run: CampaignRun | null;
  provider: Provider;
  active_run: boolean;
};

export type Collection<T> = { items: T[]; total: number };
export type CampaignInput = { name: string; description?: string | null; template_id?: string | null };
export type ContactInput = { first_name: string; email: string; opted_out?: boolean };
export type TemplateInput = { name: string; subject: string; body: string };
export type SendCampaignResponse = {
  run_id: string;
  campaign_id: string;
  status: RunStatus;
  provider: Provider;
  status_url: string;
};
