// Zentraler API-Client. Spricht same-origin gegen /api, das per next.config
// (rewrites) an das Django-Backend weitergereicht wird.

import type { components } from "@/lib/api-types";

export const API_BASE = "/api";

type RequestOptions = {
  token?: string | null;
};

let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function apiRequest<T>(
  path: string,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<T> {
  // Für Eltern- und Kinder-Login darf kein bereits aktiver Token mitgesendet
  // werden. Sonst hängt ein Kinder-Login ungewollt am Eltern-Dashboard.
  const token = Object.hasOwn(options, "token") ? options.token : accessToken;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    credentials: "include",
  });
  if (!res.ok) {
    if (res.status === 401 && token && token === accessToken) {
      unauthorizedHandler?.();
    }
    throw new ApiError(res.status, `${init.method ?? "GET"} ${path} → ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return apiRequest<T>(path, {}, options);
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  return apiRequest<T>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body ?? {}),
    },
    options,
  );
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
}

export function apiDelete(path: string): Promise<void> {
  return apiRequest<void>(path, { method: "DELETE" });
}

export type Health = components["schemas"]["HealthOut"];
export type Member = components["schemas"]["MemberOut"];
export type ManagedMember = components["schemas"]["ManagedMemberOut"];
export type Instance = components["schemas"]["InstanceOut"];
export type ChoreStatus = Instance["status"];
export type Me = components["schemas"]["MeOut"];
export type TokenPair = components["schemas"]["TokenPairOut"];
export type AccessToken = components["schemas"]["AccessTokenOut"];
export type Chore = components["schemas"]["ChoreOut"];
export type ChoreInput = components["schemas"]["ChoreIn"];
export type Stats = components["schemas"]["StatsOut"];
export type PublicDashboard = components["schemas"]["PublicDashboardOut"];
export type MemberWeeklyStats = components["schemas"]["MemberWeeklyStatsOut"];

export const getMembers = () => apiGet<Member[]>("/chores/members");

export const getTodayInstances = () => apiGet<Instance[]>("/chores/instances");

export const getInstances = (dateFrom: string, dateTo: string) =>
  apiGet<Instance[]>(`/chores/instances?date_from=${dateFrom}&date_to=${dateTo}`);

export const getStats = () => apiGet<Stats>("/chores/stats");

export const completeInstance = (id: number, memberId: number, share = false) =>
  apiPost<Instance>(`/chores/instances/${id}/complete`, { member_id: memberId, share });

export const reopenInstance = (id: number) =>
  apiPost<Instance>(`/chores/instances/${id}/reopen`);

export const uncompleteInstance = (id: number) =>
  apiPost<Instance>(`/chores/instances/${id}/uncomplete`);

export const loginParent = (email: string, password: string) =>
  apiPost<TokenPair>("/auth/login", { email, password }, { token: null });

export const refreshAccessToken = (refresh: string) =>
  apiPost<AccessToken>("/auth/refresh", { refresh });

export const getCurrentMember = (token?: string | null) =>
  apiGet<Me>("/auth/me", { token });

export const getDeviceMembers = (deviceToken: string) =>
  apiGet<Member[]>("/auth/household/members", { token: deviceToken });

export const loginChildWithPin = (
  memberId: number,
  pin: string,
) => apiPost<AccessToken>("/auth/child-login", { member_id: memberId, pin }, { token: null });

export const loginWithPin = (pin: string) =>
  apiPost<AccessToken>("/auth/pin-login", { pin }, { token: null });

export const getPublicDashboard = () => apiGet<PublicDashboard>("/public/dashboard");

export const getChores = () => apiGet<Chore[]>("/chores");

export const createChore = (payload: ChoreInput) =>
  apiPost<Chore>("/chores", payload);

export const updateChore = (id: number, payload: ChoreInput) =>
  apiPut<Chore>(`/chores/${id}`, payload);

export const deleteChore = (id: number) => apiDelete(`/chores/${id}`);

export const uploadChoreImage = (id: number, image: File) =>
  apiRequest<Chore>(
    `/chores/${id}/image`,
    { method: "POST", body: (() => { const data = new FormData(); data.append("image", image); return data; })() },
  );

export const getManagedMembers = () =>
  apiGet<ManagedMember[]>("/auth/household/manage-members");

export const createParentMember = (payload: {
  display_name: string;
  email: string;
  pin: string;
  color?: string;
  emoji?: string;
}) => apiPost<ManagedMember>("/auth/household/manage-members/parents", payload);

export const createChildMember = (payload: {
  display_name: string;
  pin: string;
  color?: string;
  emoji?: string;
}) => apiPost<ManagedMember>("/auth/household/manage-members/children", payload);

export const updateChildMember = (
  id: number,
  payload: { display_name: string; pin?: string; color?: string; emoji?: string; completion_jingle?: string; undo_jingle?: string },
) => apiPut<ManagedMember>(`/auth/household/manage-members/children/${id}`, payload);

export const updateOwnChildPin = (pin: string) =>
  apiPut<Member>("/auth/me/pin", { pin });

export const updateParentMember = (
  id: number,
  payload: { display_name: string; email: string; pin?: string; color?: string; emoji?: string },
) => apiPut<ManagedMember>(`/auth/household/manage-members/parents/${id}`, payload);
