function normalizeApiBaseUrl(rawUrl: string): string {
  return rawUrl.endsWith("/api/v1") ? rawUrl : `${rawUrl.replace(/\/$/, "")}/api/v1`;
}

function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return normalizeApiBaseUrl(process.env.BACKEND_URL || "http://localhost:8000");
  }

  return normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1");
}

export async function apiFetch(
  path: string,
  accessToken?: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${getApiBaseUrl()}${normalizedPath}`, {
    ...init,
    headers,
  });
}
