"""Short ORM transactions, immutable send snapshots, and in-process dispatch."""

import asyncio
import csv
import io
import logging
import time
from collections import Counter
from datetime import UTC, datetime
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import select

from app.db import session_scope
from app.email_provider import ResendSender, UnknownSubmission, provider_name, provider_settings
from app.entities import Campaign, Contact, Outcome, Run, Template
from app.errors import AppError
from app.v1.campaigns.model import ContactCreate, TemplateCreate
from app.v1.campaigns.sender import CampaignSendError, FakeCampaignSender

ACTIVE = {"pending", "running"}
OUTCOME_STATUSES = ("pending", "sending", "sent", "skipped", "failed", "unknown", "not_attempted")
logger = logging.getLogger(__name__)


def now():
    return datetime.now(UTC).isoformat()


def record(row):
    return {column.key: getattr(row, column.key) for column in row.__table__.columns}


def require(session, model, identifier):
    row = session.get(model, identifier)
    if row is None:
        raise AppError(404, "not_found", f"{model.__name__} not found.")
    return row


def contacts_for(session, campaign_id):
    return list(session.scalars(select(Contact).where(Contact.campaign_id == campaign_id)
                                .order_by(Contact.created_at, Contact.id)))


def active_run(session, campaign_id=None):
    query = select(Run).where(Run.active_slot == 1)
    if campaign_id:
        query = query.where(Run.campaign_id == campaign_id)
    return session.scalar(query)


def editable(session, campaign_id):
    if active_run(session, campaign_id):
        raise AppError(409, "campaign_sending", "Wait for this campaign's active send to finish.")


def contact_record(contact):
    data = record(contact)
    data.pop("email_key")
    return data


def template_record(session, template):
    data = record(template)
    data["campaign_count"] = len(list(session.scalars(select(Campaign.id).where(Campaign.template_id == template.id))))
    return data


def run_record(session, run):
    outcomes = list(session.scalars(select(Outcome).where(Outcome.run_id == run.id).order_by(Outcome.position)))
    data = record(run)
    data.pop("active_slot")
    counts = Counter(outcome.status for outcome in outcomes)
    return {**data, "total": len(outcomes), "counts": {key: counts[key] for key in OUTCOME_STATUSES},
            "outcomes": [record(row) for row in outcomes]}


def campaign_record(session, campaign):
    contacts = contacts_for(session, campaign.id)
    template = session.get(Template, campaign.template_id) if campaign.template_id else None
    latest = session.scalar(select(Run).where(Run.campaign_id == campaign.id).order_by(Run.created_at.desc()).limit(1))
    return {**record(campaign), "contacts": [contact_record(row) for row in contacts],
            "contact_count": len(contacts), "eligible_count": sum(not row.opted_out for row in contacts),
            "template_name": template.name if template else None,
            "template": template_record(session, template) if template else None,
            "latest_run": run_record(session, latest) if latest else None,
            "provider": provider_name(), "active_run": active_run(session, campaign.id) is not None}


def validate_model(model, data):
    try:
        return model.model_validate(data)
    except ValidationError as error:
        details = [{"field": ".".join(map(str, item["loc"])), "message": item["msg"]} for item in error.errors()]
        raise AppError(422, "validation", "Check the supplied fields.", details) from None


class CampaignService:
    def __init__(self, sender: FakeCampaignSender, *, clock=time.monotonic, sleep=asyncio.sleep):
        self.sender = sender
        self.resend = ResendSender()
        self.clock = clock
        self.sleep = sleep
        self.next_send_at = 0.0

    def campaigns(self):
        with session_scope() as session:
            rows = session.scalars(select(Campaign).order_by(Campaign.created_at.desc(), Campaign.id))
            items = [campaign_record(session, row) for row in rows]
            return {"items": items, "total": len(items)}

    def campaign(self, campaign_id):
        with session_scope() as session:
            return campaign_record(session, require(session, Campaign, campaign_id))

    def save_campaign(self, data, campaign_id=None):
        values = data.model_dump(exclude_unset=True)
        with session_scope(write=True) as session:
            if values.get("template_id"):
                require(session, Template, values["template_id"])
            if campaign_id:
                row = require(session, Campaign, campaign_id)
                editable(session, campaign_id)
                for key, value in values.items():
                    setattr(row, key, value)
                row.updated_at = now()
            else:
                row = Campaign(id=str(uuid4()), created_at=now(), updated_at=now(), **values)
                session.add(row)
            session.flush()
            return campaign_record(session, row)

    def delete_campaign(self, campaign_id):
        with session_scope(write=True) as session:
            row = require(session, Campaign, campaign_id)
            editable(session, campaign_id)
            session.delete(row)

    def contacts(self, campaign_id, contact_id=None):
        with session_scope() as session:
            require(session, Campaign, campaign_id)
            if contact_id:
                return contact_record(self._contact(session, campaign_id, contact_id))
            items = [contact_record(row) for row in contacts_for(session, campaign_id)]
            return {"items": items, "total": len(items)}

    @staticmethod
    def _contact(session, campaign_id, contact_id):
        row = require(session, Contact, contact_id)
        if row.campaign_id != campaign_id:
            raise AppError(404, "not_found", "Contact not found in this campaign.")
        return row

    def save_contact(self, campaign_id, data, contact_id=None):
        with session_scope(write=True) as session:
            campaign = require(session, Campaign, campaign_id)
            values = data.model_dump(exclude_unset=True)
            # An opt-out remains possible before a recipient's turn even while sending.
            if not (contact_id and values == {"opted_out": True}):
                editable(session, campaign_id)
            if contact_id:
                row = self._contact(session, campaign_id, contact_id)
                merged = {key: getattr(row, key) for key in ("first_name", "email", "opted_out")}
                values = validate_model(ContactCreate, {**merged, **values}).model_dump()
            else:
                if len(contacts_for(session, campaign_id)) >= 10:
                    raise AppError(409, "contact_limit", "Each campaign can contain at most 10 contacts.")
                values = validate_model(ContactCreate, values).model_dump()
                row = Contact(id=str(uuid4()), campaign_id=campaign_id, created_at=now(), updated_at=now())
            self._unique_email(session, campaign_id, values["email"], contact_id)
            for key, value in values.items():
                setattr(row, key, value)
            row.email_key = row.email.lower()
            row.updated_at = campaign.updated_at = now()
            session.add(row)
            session.flush()
            return contact_record(row)

    @staticmethod
    def _unique_email(session, campaign_id, email, exclude_id=None):
        duplicate = session.scalar(select(Contact).where(Contact.campaign_id == campaign_id,
                                                        Contact.email_key == email.lower(), Contact.id != exclude_id))
        if duplicate:
            raise AppError(409, "duplicate_email", "That email already exists in this campaign.")

    def delete_contact(self, campaign_id, contact_id):
        with session_scope(write=True) as session:
            campaign = require(session, Campaign, campaign_id)
            editable(session, campaign_id)
            session.delete(self._contact(session, campaign_id, contact_id))
            campaign.updated_at = now()

    def import_contacts(self, campaign_id, content: bytes):
        if len(content) > 65536:
            raise AppError(413, "file_too_large", "CSV files must be at most 64 KiB.")
        try:
            reader = csv.reader(io.StringIO(content.decode("utf-8-sig"), newline=""), strict=True)
            headers = next(reader, [])
            if sorted(headers) != ["email", "first_name"]:
                raise AppError(422, "csv_headers", "CSV needs exactly these headers: first_name,email.")
            incoming, seen = [], set()
            for number, values in enumerate(reader, start=2):
                if not values or all(not value.strip() for value in values):
                    continue
                if len(incoming) >= 10:
                    raise AppError(409, "contact_limit", "A CSV may contain at most 10 contacts.")
                if len(values) != 2:
                    raise AppError(422, "csv_row", f"Record {number} must have two fields.")
                try:
                    contact = ContactCreate.model_validate(dict(zip(headers, values, strict=True)))
                except ValidationError as error:
                    details = [{"record": number, "field": str(item["loc"][0]), "message": item["msg"]}
                               for item in error.errors()]
                    raise AppError(422, "csv_row", f"Invalid contact at record {number}.", details) from None
                if contact.email.lower() in seen:
                    raise AppError(409, "duplicate_email", f"Duplicate email at record {number}.")
                seen.add(contact.email.lower())
                incoming.append(contact)
        except (UnicodeError, csv.Error):
            raise AppError(400, "malformed_csv", "Upload a valid UTF-8 CSV file.") from None
        if not incoming:
            raise AppError(422, "empty_csv", "CSV contains no contacts.")
        with session_scope(write=True) as session:
            campaign = require(session, Campaign, campaign_id)
            editable(session, campaign_id)
            existing = contacts_for(session, campaign_id)
            if len(existing) + len(incoming) > 10:
                raise AppError(409, "contact_limit", "Import would exceed the 10-contact limit.",
                               {"limit": 10, "existing": len(existing), "incoming": len(incoming)})
            rows = []
            for contact in incoming:
                self._unique_email(session, campaign_id, contact.email)
                row = Contact(id=str(uuid4()), campaign_id=campaign_id, **contact.model_dump(),
                              email_key=contact.email.lower(), created_at=now(), updated_at=now())
                session.add(row)
                rows.append(row)
            campaign.updated_at = now()
            session.flush()
            return {"imported": len(rows), "contacts": [contact_record(row) for row in rows]}

    def templates(self, template_id=None):
        with session_scope() as session:
            if template_id:
                return template_record(session, require(session, Template, template_id))
            items = [template_record(session, row) for row in
                     session.scalars(select(Template).order_by(Template.created_at.desc(), Template.id))]
            return {"items": items, "total": len(items)}

    def save_template(self, data, template_id=None):
        with session_scope(write=True) as session:
            values = data.model_dump(exclude_unset=True)
            if template_id:
                row = require(session, Template, template_id)
                for campaign_id in session.scalars(select(Campaign.id).where(Campaign.template_id == template_id)):
                    editable(session, campaign_id)
                merged = {key: getattr(row, key) for key in ("name", "subject", "body")}
                values = validate_model(TemplateCreate, {**merged, **values}).model_dump()
                for key, value in values.items():
                    setattr(row, key, value)
                row.updated_at = now()
            else:
                row = Template(id=str(uuid4()), created_at=now(), updated_at=now(), **values)
                session.add(row)
            session.flush()
            return template_record(session, row)

    def delete_template(self, template_id):
        with session_scope(write=True) as session:
            row = require(session, Template, template_id)
            if session.scalar(select(Campaign.id).where(Campaign.template_id == template_id)):
                raise AppError(409, "template_in_use", "Detach this template from its campaigns before deleting it.")
            session.delete(row)

    def preview(self, campaign_id, contact_id):
        with session_scope() as session:
            campaign = require(session, Campaign, campaign_id)
            contact = self._contact(session, campaign_id, contact_id)
            if not campaign.template_id:
                raise AppError(422, "missing_template", "Select a template first.")
            template = require(session, Template, campaign.template_id)
            return {"subject": template.subject.replace("{first_name}", contact.first_name),
                    "message": template.body.replace("{first_name}", contact.first_name),
                    "eligible": not contact.opted_out}

    def create_run(self, campaign_id):
        settings = provider_settings()
        with session_scope(write=True) as session:
            campaign = require(session, Campaign, campaign_id)
            if active_run(session):
                raise AppError(409, "send_in_progress", "Another send is already running. Please wait.")
            contacts = contacts_for(session, campaign_id)
            if not contacts or not campaign.template_id:
                raise AppError(422, "not_ready", "Add contacts and select a template before sending.")
            template = require(session, Template, campaign.template_id)
            run = Run(
                id=str(uuid4()), campaign_id=campaign_id, status="pending", provider=settings.provider,
                from_address=settings.from_address, subject_snapshot=template.subject,
                body_snapshot=template.body, created_at=now(), active_slot=1,
            )
            session.add(run)
            session.flush()
            for position, contact in enumerate(contacts):
                session.add(Outcome(id=str(uuid4()), run_id=run.id, contact_id=contact.id, position=position,
                                    first_name=contact.first_name, email=contact.email,
                                    subject=template.subject.replace("{first_name}", contact.first_name),
                                    message=template.body.replace("{first_name}", contact.first_name),
                                    status="skipped" if contact.opted_out else "pending",
                                    error_code="opted_out" if contact.opted_out else None,
                                    completed_at=now() if contact.opted_out else None))
            return {"run_id": run.id, "campaign_id": campaign_id, "status": "pending", "provider": settings.provider,
                    "status_url": f"/v1/campaigns/{campaign_id}/runs/{run.id}"}

    def runs(self, campaign_id, run_id=None):
        with session_scope() as session:
            require(session, Campaign, campaign_id)
            if run_id:
                run = require(session, Run, run_id)
                if run.campaign_id != campaign_id:
                    raise AppError(404, "not_found", "Run not found in this campaign.")
                return run_record(session, run)
            items = [run_record(session, row) for row in session.scalars(
                select(Run).where(Run.campaign_id == campaign_id).order_by(Run.created_at.desc()))]
            return {"items": items, "total": len(items)}

    def _start(self, run_id):
        with session_scope(write=True) as session:
            run = require(session, Run, run_id)
            if run.status != "pending":
                return None
            run.status, run.started_at = "running", now()
            session.flush()
            return run_record(session, run)

    def _claim_outcome(self, outcome_id):
        with session_scope(write=True) as session:
            row = require(session, Outcome, outcome_id)
            if row.status != "pending":
                return False
            contact = session.get(Contact, row.contact_id)
            if not contact or contact.opted_out:
                row.status, row.error_code, row.completed_at = "skipped", "opted_out", now()
                return False
            row.status, row.attempted_at = "sending", now()
            return True

    def _result(self, outcome_id, status, message_id=None, error=None):
        with session_scope(write=True) as session:
            row = require(session, Outcome, outcome_id)
            row.status, row.provider_message_id, row.completed_at = status, message_id, now()
            if error:
                row.error_code, row.error_message = status, error

    def _finish(self, run_id, interrupted=False):
        with session_scope(write=True) as session:
            run = require(session, Run, run_id)
            rows = list(session.scalars(select(Outcome).where(Outcome.run_id == run_id)))
            for row in rows:
                if row.status in {"sending", "pending"}:
                    row.status = "unknown" if row.status == "sending" else "not_attempted"
                    row.error_code, row.completed_at = "run_interrupted", now()
            statuses = {row.status for row in rows}
            if interrupted:
                run.status, run.error_code = "interrupted", "run_interrupted"
            elif statuses <= {"sent", "skipped"}:
                run.status = "completed"
            elif "sent" in statuses or "unknown" in statuses:
                run.status = "completed_with_errors"
            else:
                run.status = "failed"
            run.active_slot, run.completed_at = None, now()

    def reconcile_interrupted(self):
        with session_scope() as session:
            ids = list(session.scalars(select(Run.id).where(Run.active_slot == 1)))
        for run_id in ids:
            self._finish(run_id, interrupted=True)

    async def dispatch(self, run_id):
        try:
            run = await asyncio.to_thread(self._start, run_id)
            if not run:
                return
            settings = provider_settings()
            rate = settings.rate
            for outcome in run["outcomes"]:
                if outcome["status"] != "pending":
                    continue
                await self.sleep(max(0, self.next_send_at - self.clock()))
                if not await asyncio.to_thread(self._claim_outcome, outcome["id"]):
                    continue
                self.next_send_at = self.clock() + 1 / rate
                try:
                    if run["provider"] == "fake":
                        message_id = await self.sender.send(contact_id=outcome["contact_id"],
                                                            email=outcome["email"], message=outcome["message"])
                    else:
                        message_id = await self.resend.send(
                            outcome_id=outcome["id"],
                            email=outcome["email"],
                            subject=outcome["subject"],
                            message=outcome["message"],
                            settings=settings,
                        )
                    await asyncio.to_thread(self._result, outcome["id"], "sent", message_id)
                except CampaignSendError as error:
                    await asyncio.to_thread(self._result, outcome["id"], "failed", error=str(error))
                except UnknownSubmission as error:
                    await asyncio.to_thread(self._result, outcome["id"], "unknown", error=str(error))
            await asyncio.to_thread(self._finish, run_id)
        except Exception:
            logger.exception("Dispatch interrupted for run %s; no automatic replay", run_id)
            try:
                await asyncio.to_thread(self._finish, run_id, interrupted=True)
            except Exception:
                logger.exception("Could not reconcile run %s; startup reconciliation is required", run_id)


campaign_service = CampaignService(FakeCampaignSender())
