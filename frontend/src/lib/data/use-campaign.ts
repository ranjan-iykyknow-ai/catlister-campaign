import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "@/lib/api";
import type { CampaignInput, ContactInput, TemplateInput } from "@/types/api";

export const campaignKeys = {
  all: ["campaigns"] as const,
  detail: (id: string) => ["campaigns", id] as const,
};

export function useCampaigns() {
  return useQuery({ queryKey: campaignKeys.all, queryFn: api.listCampaigns });
}

export function useCampaign(campaignId: string | null) {
  return useQuery({
    queryKey: campaignKeys.detail(campaignId ?? "none"),
    queryFn: () => api.getCampaign(campaignId!),
    enabled: Boolean(campaignId),
    refetchInterval: (query) => (query.state.data?.active_run ? 1000 : false),
  });
}

export function useTemplates() {
  return useQuery({ queryKey: ["templates"], queryFn: api.listTemplates });
}

export function useCampaignActions() {
  const client = useQueryClient();
  const refreshCampaign = async (campaignId: string) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: campaignKeys.all }),
      client.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) }),
    ]);
  };

  return {
    createCampaign: useMutation({
      mutationFn: (input: CampaignInput) => api.createCampaign(input),
      onSuccess: () => client.invalidateQueries({ queryKey: campaignKeys.all }),
    }),
    updateCampaign: useMutation({
      mutationFn: ({ id, input }: { id: string; input: Partial<CampaignInput> }) => api.updateCampaign(id, input),
      onSuccess: (campaign) => refreshCampaign(campaign.id),
    }),
    deleteCampaign: useMutation({
      mutationFn: api.deleteCampaign,
      onSuccess: () => client.invalidateQueries({ queryKey: campaignKeys.all }),
    }),
    createContact: useMutation({
      mutationFn: ({ campaignId, input }: { campaignId: string; input: ContactInput }) =>
        api.createContact(campaignId, input),
      onSuccess: (contact) => refreshCampaign(contact.campaign_id),
    }),
    updateContact: useMutation({
      mutationFn: ({ campaignId, id, input }: { campaignId: string; id: string; input: Partial<ContactInput> }) =>
        api.updateContact(campaignId, id, input),
      onSuccess: (contact) => refreshCampaign(contact.campaign_id),
    }),
    deleteContact: useMutation({
      mutationFn: ({ campaignId, id }: { campaignId: string; id: string }) => api.deleteContact(campaignId, id),
      onSuccess: (_data, variables) => refreshCampaign(variables.campaignId),
    }),
    importContacts: useMutation({
      mutationFn: ({ campaignId, file }: { campaignId: string; file: File }) => api.importContacts(campaignId, file),
      onSuccess: (_data, variables) => refreshCampaign(variables.campaignId),
    }),
    sendCampaign: useMutation({
      mutationFn: api.sendCampaign,
      onSuccess: (accepted) => refreshCampaign(accepted.campaign_id),
    }),
  };
}

export function useTemplateActions() {
  const client = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["templates"] }),
      client.invalidateQueries({ queryKey: campaignKeys.all }),
      client.invalidateQueries({ queryKey: ["campaigns"], exact: false }),
    ]);
  };
  return {
    createTemplate: useMutation({
      mutationFn: (input: TemplateInput) => api.createTemplate(input),
      onSuccess: refresh,
    }),
    updateTemplate: useMutation({
      mutationFn: ({ id, input }: { id: string; input: Partial<TemplateInput> }) => api.updateTemplate(id, input),
      onSuccess: refresh,
    }),
    deleteTemplate: useMutation({ mutationFn: api.deleteTemplate, onSuccess: refresh }),
  };
}
