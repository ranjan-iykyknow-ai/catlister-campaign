"""Thin HTTP routes for campaign, contact, template, and send operations."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Response, UploadFile, status

from app.v1.campaigns.model import (
    CampaignCreate,
    CampaignPatch,
    CampaignView,
    Collection,
    ContactCreate,
    ContactPatch,
    ContactView,
    ImportView,
    PreviewRequest,
    PreviewView,
    RunView,
    SendAccepted,
    TemplateCreate,
    TemplatePatch,
    TemplateView,
)
from app.v1.campaigns.service import campaign_service

router = APIRouter()
templates_router = APIRouter()


@router.get("", response_model=Collection[CampaignView])
def list_campaigns():
    return campaign_service.campaigns()


@router.post("", response_model=CampaignView, status_code=status.HTTP_201_CREATED)
def create_campaign(payload: CampaignCreate):
    return campaign_service.save_campaign(payload)


@router.get("/{campaign_id}", response_model=CampaignView)
def get_campaign(campaign_id: str):
    return campaign_service.campaign(campaign_id)


@router.patch("/{campaign_id}", response_model=CampaignView)
def update_campaign(campaign_id: str, payload: CampaignPatch):
    return campaign_service.save_campaign(payload, campaign_id)


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(campaign_id: str):
    campaign_service.delete_campaign(campaign_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{campaign_id}/contacts", response_model=Collection[ContactView])
def list_contacts(campaign_id: str):
    return campaign_service.contacts(campaign_id)


@router.post("/{campaign_id}/contacts", response_model=ContactView, status_code=status.HTTP_201_CREATED)
def create_contact(campaign_id: str, payload: ContactCreate):
    return campaign_service.save_contact(campaign_id, payload)


@router.patch("/{campaign_id}/contacts/{contact_id}", response_model=ContactView)
def update_contact(campaign_id: str, contact_id: str, payload: ContactPatch):
    return campaign_service.save_contact(campaign_id, payload, contact_id)


@router.delete("/{campaign_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(campaign_id: str, contact_id: str):
    campaign_service.delete_contact(campaign_id, contact_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{campaign_id}/contacts/import", response_model=ImportView, status_code=status.HTTP_201_CREATED)
async def import_contacts(campaign_id: str, file: Annotated[UploadFile, File()]):
    return campaign_service.import_contacts(campaign_id, await file.read())


@router.post("/{campaign_id}/preview", response_model=PreviewView)
def preview_message(campaign_id: str, payload: PreviewRequest):
    return campaign_service.preview(campaign_id, payload.contact_id)


@router.post("/{campaign_id}/send", response_model=SendAccepted, status_code=status.HTTP_202_ACCEPTED)
def send_campaign(campaign_id: str, background_tasks: BackgroundTasks):
    accepted = campaign_service.create_run(campaign_id)
    background_tasks.add_task(campaign_service.dispatch, accepted["run_id"])
    return accepted


@router.get("/{campaign_id}/runs", response_model=Collection[RunView])
def list_runs(campaign_id: str):
    return campaign_service.runs(campaign_id)


@router.get("/{campaign_id}/runs/{run_id}", response_model=RunView)
def get_run(campaign_id: str, run_id: str):
    return campaign_service.runs(campaign_id, run_id)


@templates_router.get("", response_model=Collection[TemplateView])
def list_templates():
    return campaign_service.templates()


@templates_router.post("", response_model=TemplateView, status_code=status.HTTP_201_CREATED)
def create_template(payload: TemplateCreate):
    return campaign_service.save_template(payload)


@templates_router.get("/{template_id}", response_model=TemplateView)
def get_template(template_id: str):
    return campaign_service.templates(template_id)


@templates_router.patch("/{template_id}", response_model=TemplateView)
def update_template(template_id: str, payload: TemplatePatch):
    return campaign_service.save_template(payload, template_id)


@templates_router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: str):
    campaign_service.delete_template(template_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
