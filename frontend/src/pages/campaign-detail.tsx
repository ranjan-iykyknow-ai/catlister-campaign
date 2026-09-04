import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/button";
import { StatusPill } from "@/components/status-pill";
import {
  useCampaign,
  useCampaignActions,
  useCampaigns,
  useRuns,
  useTemplateActions,
  useTemplates,
} from "@/lib/data/use-campaign";
import type { CampaignRun, Contact, MessageTemplate, OutcomeStatus } from "@/types/api";

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
  const templateActions = useTemplateActions();
  const campaign = campaignQuery.data;
  const runs = useRuns(campaignId, campaign?.active_run ?? false);
  const [showCampaignEdit, setShowCampaignEdit] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setDescription(campaign.description ?? "");
    }
  }, [campaign?.id]);

  useEffect(() => {
    if (campaign?.template) {
      setTemplateName(campaign.template.name);
      setTemplateSubject(campaign.template.subject);
      setTemplateBody(campaign.template.body);
    } else {
      setTemplateName("");
      setTemplateSubject("");
      setTemplateBody("");
    }
  }, [campaign?.template?.id, campaign?.template?.updated_at]);

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
        <div className="header-actions">
          <button className="secondary-button" onClick={() => setShowCampaignEdit(true)} type="button">Edit campaign</button>
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
        </div>
      </header>

      {showCampaignEdit ? (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowCampaignEdit(false); }}>
          <section aria-labelledby="edit-campaign-heading" aria-modal="true" className="modal-card" role="dialog">
            <div className="panel-heading"><h2 id="edit-campaign-heading">Edit campaign details</h2><button aria-label="Close campaign editor" className="icon-button" onClick={() => setShowCampaignEdit(false)} type="button">Close</button></div>
            <form className="form-grid" onSubmit={async (event) => { event.preventDefault(); await actions.updateCampaign.mutateAsync({ id: campaignId, input: { name, description: description || null } }); setShowCampaignEdit(false); }}>
              <label>Name<input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label>Description<textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
              <InlineError error={actions.updateCampaign.error} />
              <div className="form-actions"><Button loading={actions.updateCampaign.isPending} loadingLabel="Saving…" type="submit">Save campaign</Button><button className="text-button danger-text" onClick={removeCampaign} type="button">Delete campaign</button></div>
            </form>
          </section>
        </div>
      ) : null}

      {campaign.provider === "resend" ? (
        <div className="provider-banner"><strong>Live Resend mode</strong><span>Emails use the configured Resend sender. Review every eligible contact before sending.</span></div>
      ) : (
        <div className="provider-banner"><strong>Safe preview mode</strong><span>Messages are simulated; no real email leaves the app.</span></div>
      )}
      <InlineError error={actions.sendCampaign.error} />

      <div className="detail-grid">
        <section className="panel template-workbench" aria-labelledby="template-editor-heading">
          <div className="panel-heading"><div><h2 id="template-editor-heading">Message template</h2><small>Edit the selected template without leaving the campaign.</small></div><button className="text-button" onClick={onTemplates} type="button">Manage all</button></div>
          <div className="template-picker">
            <label>Selected template
              <select value={campaign.template_id ?? ""} onChange={(event) => actions.updateCampaign.mutate({ id: campaignId, input: { template_id: event.target.value || null } })}>
                <option value="">Select a template</option>
                {templates.data?.items.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
          </div>
          {campaign.template ? (
            <form className="form-grid template-editor-form" onSubmit={async (event) => { event.preventDefault(); await templateActions.updateTemplate.mutateAsync({ id: campaign.template!.id, input: { name: templateName, subject: templateSubject, body: templateBody } }); }}>
              <label>Template name<input required maxLength={100} value={templateName} onChange={(event) => setTemplateName(event.target.value)} /></label>
              <label>Subject<input required maxLength={200} value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)} /></label>
              <label>Message<textarea className="message-input" required maxLength={10000} value={templateBody} onChange={(event) => setTemplateBody(event.target.value)} /></label>
              <p className="field-hint">Use {"{first_name}"} to personalize the subject or message.</p>
              <InlineError error={templateActions.updateTemplate.error || actions.updateCampaign.error} />
              <Button loading={templateActions.updateTemplate.isPending} loadingLabel="Saving template…" type="submit">Save template</Button>
            </form>
          ) : <div className="empty-state compact">Choose an existing template or manage templates to create a new one.</div>}
        </section>

        <section className="panel message-panel" aria-labelledby="message-heading">
          <div className="panel-heading"><h2 id="message-heading">Personalized preview</h2><span className="contact-count">{sample ? `For ${sample.first_name}` : "Example"}</span></div>
          {campaign.template ? <div className="message-preview"><strong>{render(templateSubject)}</strong><p>{render(templateBody)}</p></div> : <div className="empty-state compact">Choose a template to preview the message.</div>}
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

      <DeliveryHistory error={runs.error} loading={runs.isLoading} runs={runs.data?.items ?? []} />
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

function runTone(status: CampaignRun["status"]): "neutral" | "success" | "warning" | "danger" {
  if (status === "completed") return "success";
  if (status === "pending" || status === "running") return "warning";
  return "danger";
}

function formatDateTime(value: string | null) {
  if (!value) return "In progress";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function DeliveryHistory({ runs, loading, error }: { runs: CampaignRun[]; loading: boolean; error: unknown }) {
  return (
    <section className="panel delivery-history" aria-labelledby="delivery-history-heading">
      <div className="panel-heading">
        <div><h2 id="delivery-history-heading">Email operations</h2><small>Latest run first · expand a run to inspect every recipient</small></div>
        <span className="contact-count">{runs.length} run{runs.length === 1 ? "" : "s"}</span>
      </div>
      <InlineError error={error} />
      {loading ? <p className="empty-state compact">Loading delivery history…</p> : null}
      <div className="run-list">
        {runs.map((run, index) => <RunDisclosure key={run.id} latest={index === 0} run={run} />)}
      </div>
      {!loading && runs.length === 0 ? <p className="empty-state compact">No email operations yet.</p> : null}
    </section>
  );
}

function RunDisclosure({ run, latest }: { run: CampaignRun; latest: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const failed = run.counts.failed + run.counts.unknown + run.counts.not_attempted;
  return (
    <article className={`run-card${latest ? " run-card--latest" : ""}`}>
      <button aria-expanded={expanded} className="run-toggle" onClick={() => setExpanded((value) => !value)} type="button">
        <div className="run-identity">
          <strong>{latest ? "Latest delivery" : "Previous delivery"}</strong>
          <span>{formatDateTime(run.completed_at ?? run.started_at ?? run.created_at)}</span>
        </div>
        <div className="run-stats" aria-label="Delivery summary">
          <span><strong>{run.counts.sent}</strong> sent</span>
          <span><strong>{run.counts.skipped}</strong> skipped</span>
          <span><strong>{failed}</strong> failed</span>
        </div>
        <StatusPill tone={runTone(run.status)}>{run.status.replaceAll("_", " ")}</StatusPill>
        <span className="disclosure-icon" aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? (
        <div className="outcome-table-wrap">
          <table className="outcome-table">
            <thead><tr><th>Contact</th><th>Email</th><th>Result</th><th>Completed</th><th>Details</th></tr></thead>
            <tbody>
              {run.outcomes.map((outcome) => (
                <tr key={outcome.id}>
                  <td>{outcome.first_name}</td>
                  <td>{outcome.email}</td>
                  <td><StatusPill tone={statusTone[outcome.status]}>{outcome.status === "sent" ? "Accepted" : outcome.status.replaceAll("_", " ")}</StatusPill></td>
                  <td>{formatDateTime(outcome.completed_at)}</td>
                  <td>{outcome.error_message || outcome.error_code?.replaceAll("_", " ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
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
