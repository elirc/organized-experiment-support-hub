"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import type { BootstrapPayload, SessionPayload, TicketDetail } from "@/types/support";

const parseResponse = async <T>(response: Response): Promise<T> => {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? "Request failed.");
  }

  return data as T;
};

const buildBootstrapUrl = (search: string) => {
  const url = new URL("/api/bootstrap", window.location.origin);

  if (search.trim()) {
    url.searchParams.set("search", search.trim());
  }

  return url.toString();
};

export const useBootstrapData = (search: string) =>
  useQuery({
    queryKey: ["bootstrap", search],
    queryFn: () => fetch(buildBootstrapUrl(search)).then(parseResponse<BootstrapPayload>),
  });

export const useTicketDetail = (ticketId: string | null) =>
  useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => fetch(`/api/tickets/${ticketId}`).then(parseResponse<TicketDetail>),
    enabled: Boolean(ticketId),
  });

export const useSessionPayload = () =>
  useQuery({
    queryKey: ["session"],
    queryFn: () => fetch("/api/session").then(parseResponse<SessionPayload | { session: null; availableUsers: [] }>),
  });

export const useInvalidateSupportHub = () => {
  const queryClient = useQueryClient();

  return async (ticketId?: string | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      queryClient.invalidateQueries({ queryKey: ["session"] }),
      ticketId
        ? queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] })
        : Promise.resolve(),
    ]);
  };
};

export const useApiMutation = <TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
  options?: UseMutationOptions<TResult, Error, TVariables>,
) => useMutation<TResult, Error, TVariables>({ mutationFn, ...options });

export const patchSession = async (userId: string) =>
  fetch("/api/session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  }).then(parseResponse<SessionPayload>);

export const updateTicket = async (ticketId: string, payload: object) =>
  fetch(`/api/tickets/${ticketId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(parseResponse<TicketDetail>);

export const addReply = async (ticketId: string, body: string) =>
  fetch(`/api/tickets/${ticketId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  }).then(parseResponse<TicketDetail>);

export const addInternalNote = async (ticketId: string, body: string) =>
  fetch(`/api/tickets/${ticketId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  }).then(parseResponse<TicketDetail>);

export const changeStatus = async (ticketId: string, payload: { status: string; reason?: string }) =>
  fetch(`/api/tickets/${ticketId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(parseResponse<TicketDetail>);

export const reassign = async (
  ticketId: string,
  payload: { assigneeId: string | null; queueId?: string; reason?: string },
) =>
  fetch(`/api/tickets/${ticketId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(parseResponse<TicketDetail>);

export const escalate = async (
  ticketId: string,
  payload: { trigger: string; reason: string; ownerId?: string | null; note?: string | null },
) =>
  fetch(`/api/tickets/${ticketId}/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(parseResponse<TicketDetail>);
