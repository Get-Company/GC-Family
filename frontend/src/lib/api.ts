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
  const token = options.token ?? accessToken;
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
export type Instance = components["schemas"]["InstanceOut"];
export type ChoreStatus = Instance["status"];
export type Me = components["schemas"]["MeOut"];
export type TokenPair = components["schemas"]["TokenPairOut"];
export type AccessToken = components["schemas"]["AccessTokenOut"];
export type Chore = components["schemas"]["ChoreOut"];
export type ChoreInput = components["schemas"]["ChoreIn"];
export type Stats = components["schemas"]["StatsOut"];

export const getMembers = () => apiGet<Member[]>("/chores/members");

export const getTodayInstances = () => apiGet<Instance[]>("/chores/instances");

export const getStats = () => apiGet<Stats>("/chores/stats");

export const completeInstance = (id: number, memberId: number | null) =>
  apiPost<Instance>(`/chores/instances/${id}/complete`, { member_id: memberId });

export const loginParent = (email: string, password: string) =>
  apiPost<TokenPair>("/auth/login", { email, password });

export const refreshAccessToken = (refresh: string) =>
  apiPost<AccessToken>("/auth/refresh", { refresh });

export const getCurrentMember = (token?: string | null) =>
  apiGet<Me>("/auth/me", { token });

export const getDeviceMembers = (deviceToken: string) =>
  apiGet<Member[]>("/auth/household/members", { token: deviceToken });

export const loginChildWithPin = (
  memberId: number,
  pin: string,
  deviceToken: string,
) => apiPost<AccessToken>("/auth/pin", { member_id: memberId, pin }, { token: deviceToken });

export const getChores = () => apiGet<Chore[]>("/chores");

export const createChore = (payload: ChoreInput) =>
  apiPost<Chore>("/chores", payload);

export const updateChore = (id: number, payload: ChoreInput) =>
  apiPut<Chore>(`/chores/${id}`, payload);

export const deleteChore = (id: number) => apiDelete(`/chores/${id}`);
