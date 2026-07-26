// Schmaler API-Client. Spricht same-origin gegen /api, das per next.config
// (rewrites) an das Django-Backend weitergereicht wird.

export const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    throw new ApiError(res.status, `POST ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

// Anfang der später generierten Typen. Wird in Phase 2 durch aus dem
// OpenAPI-Schema generierte Typen ersetzt.
export type Health = {
  status: string;
  service: string;
};

export type Member = {
  id: number;
  display_name: string;
  role: "PARENT" | "CHILD";
  color: string;
  emoji: string;
};

export type ChoreStatus = "OPEN" | "DONE" | "SKIPPED";

export type Instance = {
  id: number;
  title: string;
  icon: string;
  color: string;
  points: number;
  due_date: string;
  status: ChoreStatus;
  assigned_member_id: number | null;
  assigned_member_name: string | null;
};

export const getMembers = () => apiGet<Member[]>("/chores/members");

export const getTodayInstances = () => apiGet<Instance[]>("/chores/instances");

export const completeInstance = (id: number, memberId: number | null) =>
  apiPost<Instance>(`/chores/instances/${id}/complete`, { member_id: memberId });
