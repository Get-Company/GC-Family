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

// Anfang der später generierten Typen. Wird in Phase 2 durch aus dem
// OpenAPI-Schema generierte Typen ersetzt.
export type Health = {
  status: string;
  service: string;
};
