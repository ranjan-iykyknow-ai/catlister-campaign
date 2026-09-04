import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/button";
import { StatusPill } from "@/components/status-pill";
import {
  useCampaign,
  useCampaignActions,
  useCampaigns,
  useTemplateActions,
  useTemplates,
} from "@/lib/data/use-campaign";
import type { Contact, DeliveryOutcome, MessageTemplate, OutcomeStatus } from "@/types/api";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function InlineError({ error }: { error: unknown }) {
  return error ? <p className="inline-error" role="alert">{errorMessage(error)}</p> : null;
}

export function CampaignWorkspace() {
  const [view, setView] = useState<"campaigns" | "templates">("campaigns");
  const [campaignId, setCampaignId] = useState<string | null>(null);

  if (view === "templates") {
    return <TemplatesPage onBack={() => setView("campaigns")} />;
  }
  if (campaignId) {
    return (
      <CampaignDetailPage
        campaignId={campaignId}
        onBack={() => setCampaignId(null)}
        onTemplates={() => setView("templates")}
      />
    );
  }
  return <CampaignDashboard onOpen={setCampaignId} onTemplates={() => setView("templates")} />;
}

function BrandHeader({ onTemplates }: { onTemplates?: () => void }) {
  return (
    <nav className="brand-bar" aria-label="Primary navigation">
      <button className="brand" type="button">Catlister <span>Campaigns</span></button>
      {onTemplates ? <button className="nav-link" onClick={onTemplates} type="button">Message templates</button> : null}
    </nav>
  );
}

function CampaignDashboard({ onOpen, onTemplates }: { onOpen: (id: string) => void; onTemplates: () => void }) {
  const campaigns = useCampaigns();
  const { createCampaign } = useCampaignActions();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const created = await createCampaign.mutateAsync({ name, description: description || null });
    setName("");
    setDescription("");
    onOpen(created.id);
  }

  return (
    <main className="app-shell">
      <BrandHeader onTemplates={onTemplates} />
      <header className="hero-row">
        <div>
          <p className="eyebrow">Campaign workspace</p>
          <h1>Reach the right people,<br />personally.</h1>
          <p className="page-subtitle">Create a focused list, shape your message, and follow every delivery.</p>
        </div>
        <Button onClick={() => setShowCreate((value) => !value)} type="button">
          {showCreate ? "Close" : "+ New campaign"}
        </Button>
      </header>

      {showCreate ? (
        <form className="panel form-panel" onSubmit={submit}>
          <div className="panel-heading"><h2>Create campaign</h2></div>
          <div className="form-grid">
            <label>Campaign name<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Description<textarea maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            <InlineError error={createCampaign.error} />
            <Button loading={createCampaign.isPending} loadingLabel="Creating…" type="submit">Create campaign</Button>
          </div>
        </form>
      ) : null}

      <section className="section-block" aria-labelledby="campaigns-heading">
        <div className="section-title"><div><p className="eyebrow">Your work</p><h2 id="campaigns-heading">Campaigns</h2></div><span>{campaigns.data?.total ?? 0} total</span></div>
        {campaigns.isLoading ? <p className="empty-state">Loading campaigns…</p> : null}
        <InlineError error={campaigns.error} />
        <div className="campaign-grid">
          {campaigns.data?.items.map((campaign) => (
            <button className="campaign-card" key={campaign.id} onClick={() => onOpen(campaign.id)} type="button">
              <div className="card-top"><StatusPill tone={campaign.active_run ? "warning" : "neutral"}>{campaign.active_run ? "Sending" : "Draft"}</StatusPill><span>→</span></div>
              <h3>{campaign.name}</h3>
              <p>{campaign.description || "No description yet."}</p>
              <div className="card-meta"><span>{campaign.contact_count}/10 contacts</span><span>{campaign.template_name || "No template"}</span></div>
            </button>
          ))}
        </div>
        {campaigns.data?.total === 0 ? <p className="empty-state">No campaigns yet. Create the first one above.</p> : null}
      </section>
    </main>
  );
}

function CampaignDetailPage({ campaignId, onBack, onTemplates }: { campaignId: string; onBack: () => void; onTemplates: () => void }) {
  const campaignQuery = useCampaign(campaignId);
  const templates = useTemplates();
  const actions = useCampaignActions();
  const campaign = campaignQuery.data;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setDescription(campaign.description ?? "");
    }
  }, [campaign?.id]);

  if (campaignQuery.isLoading || !campaign) {
    return <main className="app-shell"><BrandHeader /><p className="empty-state">Loading campaign…</p><InlineError error={campaignQuery.error} /></main>;
  }

  async function addContact(event: FormEvent) {
    event.preventDefault();
    await actions.createContact.mutateAsync({ campaignId, input: { first_name: firstName, email } });
    setFirstName("");
    setEmail("");
  }

  async function uploadCsv(event: FormEvent) {
    event.preventDefault();
    if (!csvFile) return;
    await actions.importContacts.mutateAsync({ campaignId, file: csvFile });
    setCsvFile(null);
  }

  async function removeCampaign() {
    if (!window.confirm("Delete this campaign, all contacts, and its run history?")) return;
    await actions.deleteCampaign.mutateAsync(campaignId);
    onBack();
  }

  const sample = campaign.contacts.find((contact) => !contact.opted_out) ?? campaign.contacts[0];
  const render = (value: string) => value.replaceAll("{first_name}", sample?.first_name ?? "there");

  return (
    <main className="app-shell">
      <BrandHeader onTemplates={onTemplates} />
      <button className="back-link" onClick={onBack} type="button">← All campaigns</button>
      <header className="page-header">
        <div><p className="eyebrow">Campaign</p><h1>{campaign.name}</h1><p className="page-subtitle">{campaign.description || "Add a description to give this campaign context."}</p></div>
        <Button
          className="send-button"
          disabled={!campaign.template || campaign.eligible_count === 0 || campaign.active_run}
          loading={actions.sendCampaign.isPending || campaign.active_run}
          loadingLabel="Sending…"
          onClick={() => {
            const target = campaign.provider === "resend" ? "real email through Resend" : "simulated email";
            if (window.confirm(`Send ${target} to ${campaign.eligible_count} eligible contact(s)?`)) actions.sendCampaign.mutate(campaignId);
          }}
          type="button"
        >Send campaign</Button>
      </header>

      {campaign.provider === "resend" ? (
        <div className="provider-banner"><strong>Live Resend mode</strong><span>The shared onboarding sender can reach only your Resend account email until you verify a domain.</span></div>
      ) : (
        <div className="provider-banner"><strong>Safe preview mode</strong><span>Messages are simulated; no real email leaves the app.</span></div>
      )}
      <InlineError error={actions.sendCampaign.error} />

      <div className="detail-grid">
        <section className="panel" aria-labelledby="setup-heading">
          <div className="panel-heading"><h2 id="setup-heading">Campaign setup</h2></div>
          <form className="form-grid" onSubmit={async (event) => { event.preventDefault(); await actions.updateCampaign.mutateAsync({ id: campaignId, input: { name, description: description || null } }); }}>
            <label>Name<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Description<textarea maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            <label>Message template
              <select value={campaign.template_id ?? ""} onChange={(e) => actions.updateCampaign.mutate({ id: campaignId, input: { template_id: e.target.value || null } })}>
                <option value="">Select a template</option>
                {templates.data?.items.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            <InlineError error={actions.updateCampaign.error} />
            <div className="form-actions"><Button loading={actions.updateCampaign.isPending} loadingLabel="Saving…" type="submit">Save changes</Button><button className="text-button danger-text" onClick={removeCampaign} type="button">Delete campaign</button></div>
          </form>
        </section>

        <section className="panel message-panel" aria-labelledby="message-heading">
          <div className="panel-heading"><h2 id="message-heading">Personalized preview</h2><span className="contact-count">{sample ? `For ${sample.first_name}` : "Example"}</span></div>
          {campaign.template ? <div className="message-preview"><strong>{render(campaign.template.subject)}</strong><p>{render(campaign.template.body)}</p></div> : <div className="empty-state compact">Choose a template to preview the message.</div>}
        </section>
      </div>

      <section className="panel" aria-labelledby="contacts-heading">
        <div className="panel-heading"><div><h2 id="contacts-heading">Contacts</h2><small>{campaign.eligible_count} eligible · {campaign.contact_count}/10 total</small></div></div>
        <div className="contact-tools">
          <form className="inline-form" onSubmit={addContact}>
            <label>First name<input required value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
            <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <Button disabled={campaign.contact_count >= 10} loading={actions.createContact.isPending} loadingLabel="Adding…" type="submit">Add contact</Button>
          </form>
          <span className="or-divider">or</span>
          <form className="csv-form" onSubmit={uploadCsv}>
            <label className="file-control"><span>{csvFile?.name ?? "Choose CSV"}</span><input accept=".csv,text/csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} type="file" /></label>
            <Button disabled={!csvFile || campaign.contact_count >= 10} loading={actions.importContacts.isPending} loadingLabel="Importing…" type="submit">Upload</Button>
          </form>
        </div>
        <InlineError error={actions.createContact.error || actions.importContacts.error || actions.deleteContact.error || actions.updateContact.error} />
        <div className="contact-list">
          {campaign.contacts.map((contact) => (
            <ContactEditor
              contact={contact}
              key={contact.id}
              onDelete={async () => {
                if (window.confirm(`Remove ${contact.first_name} from this campaign?`)) await actions.deleteContact.mutateAsync({ campaignId, id: contact.id });
              }}
              onSave={(input) => actions.updateContact.mutateAsync({ campaignId, id: contact.id, input })}
            />
          ))}
          {campaign.contacts.length === 0 ? <p className="empty-state compact">Add a contact manually or upload a CSV with first_name,email headers.</p> : null}
        </div>
      </section>

      {campaign.latest_run ? <ResultsPanel outcomes={campaign.latest_run.outcomes} status={campaign.latest_run.status} /> : null}
    </main>
  );
}

function ContactEditor({ contact, onSave, onDelete }: { contact: Contact; onSave: (input: { first_name: string; email: string; opted_out: boolean }) => Promise<unknown>; onDelete: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(contact.first_name);
  const [email, setEmail] = useState(contact.email);
  const [optedOut, setOptedOut] = useState(contact.opted_out);
  return (
    <article className="contact-row">
      <div className="avatar" aria-hidden="true">{contact.first_name.slice(0, 1).toUpperCase()}</div>
      {editing ? (
        <form className="row-editor" onSubmit={async (event) => { event.preventDefault(); await onSave({ first_name: firstName, email, opted_out: optedOut }); setEditing(false); }}>
          <input aria-label="First name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <input aria-label="Email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="check-label"><input checked={optedOut} onChange={(e) => setOptedOut(e.target.checked)} type="checkbox" />Opted out</label>
          <Button type="submit">Save</Button><button className="text-button" onClick={() => setEditing(false)} type="button">Cancel</button>
        </form>
      ) : (
        <>
          <div className="contact-identity"><strong>{contact.first_name}</strong><span>{contact.email}</span></div>
          <StatusPill tone={contact.opted_out ? "warning" : "neutral"}>{contact.opted_out ? "Opted out" : "Ready"}</StatusPill>
          <button className="icon-button" aria-label={`Edit ${contact.first_name}`} onClick={() => setEditing(true)} type="button">Edit</button>
          <button className="icon-button danger-text" aria-label={`Delete ${contact.first_name}`} onClick={onDelete} type="button">Delete</button>
        </>
      )}
    </article>
  );
}

const statusTone: Record<OutcomeStatus, "neutral" | "success" | "warning" | "danger"> = {
  pending: "neutral", sending: "warning", sent: "success", skipped: "warning", failed: "danger",
  unknown: "danger", not_attempted: "neutral",
};

function ResultsPanel({ outcomes, status }: { outcomes: DeliveryOutcome[]; status: string }) {
  return (
    <section className="panel results-panel" aria-labelledby="results-heading">
      <div className="panel-heading"><h2 id="results-heading">Latest delivery</h2><StatusPill tone={status === "completed" ? "success" : status === "running" || status === "pending" ? "warning" : "danger"}>{status.replaceAll("_", " ")}</StatusPill></div>
      <div className="result-summary">
        {(["sent", "skipped", "failed", "unknown"] as OutcomeStatus[]).map((key) => <div key={key}><strong>{outcomes.filter((item) => item.status === key).length}</strong><span>{key.replaceAll("_", " ")}</span></div>)}
      </div>
      <div className="contact-list">
        {outcomes.map((outcome) => <article className="contact-row" key={outcome.id}><div className="contact-identity"><strong>{outcome.first_name}</strong><span>{outcome.email}{outcome.error_message ? ` · ${outcome.error_message}` : ""}</span></div><StatusPill tone={statusTone[outcome.status]}>{outcome.status === "sent" && outcome.provider_message_id ? "Accepted" : outcome.status.replaceAll("_", " ")}</StatusPill></article>)}
      </div>
    </section>
  );
}

function TemplatesPage({ onBack }: { onBack: () => void }) {
  const templates = useTemplates();
  const actions = useTemplateActions();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Hi {first_name},\n\n");
  async function submit(event: FormEvent) {
    event.preventDefault();
    await actions.createTemplate.mutateAsync({ name, subject, body });
    setName(""); setSubject(""); setBody("Hi {first_name},\n\n");
  }
  return (
    <main className="app-shell">
      <BrandHeader />
      <button className="back-link" onClick={onBack} type="button">← Campaigns</button>
      <header className="page-header"><div><p className="eyebrow">Reusable copy</p><h1>Message templates</h1><p className="page-subtitle">Use {"{first_name}"} anywhere in the subject or message.</p></div></header>
      <div className="template-layout">
        <form className="panel form-panel sticky-panel" onSubmit={submit}>
          <div className="panel-heading"><h2>New template</h2></div>
          <div className="form-grid">
            <label>Name<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Subject<input required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
            <label>Message<textarea className="message-input" required maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
            <InlineError error={actions.createTemplate.error} />
            <Button loading={actions.createTemplate.isPending} loadingLabel="Creating…" type="submit">Create template</Button>
          </div>
        </form>
        <section className="template-list">
          {templates.data?.items.map((template) => (
            <TemplateEditor
              key={template.id}
              template={template}
              onDelete={async () => { if (window.confirm(`Delete “${template.name}”?`)) await actions.deleteTemplate.mutateAsync(template.id); }}
              onSave={(input) => actions.updateTemplate.mutateAsync({ id: template.id, input })}
            />
          ))}
          <InlineError error={templates.error || actions.updateTemplate.error || actions.deleteTemplate.error} />
        </section>
      </div>
    </main>
  );
}

function TemplateEditor({ template, onSave, onDelete }: { template: MessageTemplate; onSave: (input: { name: string; subject: string; body: string }) => Promise<unknown>; onDelete: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  return (
    <article className="panel template-card">
      {editing ? <form className="form-grid" onSubmit={async (event) => { event.preventDefault(); await onSave({ name, subject, body }); setEditing(false); }}><label>Name<input required value={name} onChange={(e) => setName(e.target.value)} /></label><label>Subject<input required value={subject} onChange={(e) => setSubject(e.target.value)} /></label><label>Message<textarea className="message-input" required value={body} onChange={(e) => setBody(e.target.value)} /></label><div className="form-actions"><Button type="submit">Save</Button><button className="text-button" onClick={() => setEditing(false)} type="button">Cancel</button></div></form> : <><div className="panel-heading"><div><h2>{template.name}</h2><small>{template.campaign_count} campaign(s)</small></div><div className="form-actions"><button className="text-button" onClick={() => setEditing(true)} type="button">Edit</button><button className="text-button danger-text" disabled={template.campaign_count > 0} onClick={onDelete} type="button">Delete</button></div></div><div className="message-preview"><strong>{template.subject}</strong><p>{template.body}</p></div></>}
    </article>
  );
}
