import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StrictBool, field_validator, model_validator

Name = Annotated[str, Field(min_length=1, max_length=100)]
Subject = Annotated[str, Field(min_length=1, max_length=200)]
Body = Annotated[str, Field(min_length=1, max_length=10000)]
Identifier = Annotated[str, Field(min_length=1, max_length=100)]


def validate_template(value: str) -> str:
    remainder = value.replace("{first_name}", "")
    if any(char in remainder for char in "{}"):
        raise ValueError("Only the {first_name} placeholder is supported; other braces are not allowed.")
    return value


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, from_attributes=True)

    @field_validator("*", mode="before")
    @classmethod
    def reject_controls(cls, value):
        if isinstance(value, str) and re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", value):
            raise ValueError("Control characters are not allowed.")
        return value


class CampaignCreate(Contract):
    name: Name
    description: Annotated[str, Field(max_length=500)] | None = None
    template_id: Identifier | None = None


class PatchContract(Contract):
    @model_validator(mode="after")
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")
        for field in self.model_fields_set - {"description", "template_id"}:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null.")
        return self


class CampaignPatch(PatchContract):
    name: Name | None = None
    description: Annotated[str, Field(max_length=500)] | None = None
    template_id: Identifier | None = None


class ContactCreate(Contract):
    first_name: Name
    email: EmailStr
    opted_out: StrictBool = False

    @field_validator("email")
    @classmethod
    def ascii_email(cls, value: str):
        if not value.isascii() or len(value) > 254:
            raise ValueError("Use an ASCII email address up to 254 characters.")
        return value

    @field_validator("first_name")
    @classmethod
    def single_line(cls, value: str):
        if "\n" in value or "\r" in value:
            raise ValueError("First name must be a single line.")
        return value


class ContactPatch(PatchContract):
    first_name: Name | None = None
    email: EmailStr | None = None
    opted_out: StrictBool | None = None


class TemplateCreate(Contract):
    name: Name
    subject: Subject
    body: Body

    @field_validator("subject", "body")
    @classmethod
    def placeholders(cls, value: str):
        return validate_template(value)

    @field_validator("subject")
    @classmethod
    def single_line(cls, value: str):
        if "\n" in value or "\r" in value:
            raise ValueError("Subject must be a single line.")
        return value


class TemplatePatch(PatchContract):
    name: Name | None = None
    subject: Subject | None = None
    body: Body | None = None


class PreviewRequest(Contract):
    contact_id: Identifier


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: Annotated[str, Field(min_length=1, max_length=512)]


class ContactView(ContactCreate):
    id: str
    campaign_id: str
    created_at: str
    updated_at: str


class TemplateView(TemplateCreate):
    id: str
    created_at: str
    updated_at: str
    campaign_count: int = 0


OutcomeStatus = Literal["pending", "sending", "sent", "skipped", "failed", "unknown", "not_attempted"]
RunStatus = Literal["pending", "running", "completed", "completed_with_errors", "failed", "interrupted"]


class OutcomeView(Contract):
    id: str
    run_id: str
    contact_id: str | None
    position: int
    first_name: str
    email: str
    subject: str
    message: str
    status: OutcomeStatus
    provider_message_id: str | None
    error_code: str | None
    error_message: str | None
    attempted_at: str | None
    completed_at: str | None


class RunView(Contract):
    id: str
    campaign_id: str
    status: RunStatus
    provider: Literal["fake", "resend"]
    from_address: str | None
    subject_snapshot: str
    body_snapshot: str
    created_at: str
    started_at: str | None
    completed_at: str | None
    error_code: str | None
    total: int
    counts: dict[str, int]
    outcomes: list[OutcomeView]


class CampaignView(CampaignCreate):
    id: str
    created_at: str
    updated_at: str
    contact_count: int
    eligible_count: int
    template_name: str | None
    template: TemplateView | None
    contacts: list[ContactView]
    latest_run: RunView | None
    provider: Literal["fake", "resend"]
    active_run: bool


class Collection[T](Contract):
    items: list[T]
    total: int


class SendAccepted(Contract):
    run_id: str
    campaign_id: str
    status: RunStatus
    provider: Literal["fake", "resend"]
    status_url: str


class PreviewView(Contract):
    subject: str
    message: str
    eligible: bool


class ImportView(Contract):
    imported: int
    contacts: list[ContactView]
