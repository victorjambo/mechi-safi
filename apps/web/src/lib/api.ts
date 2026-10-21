const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...options, credentials: 'include', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}
export const post = <T>(path: string, body?: unknown, headers?: HeadersInit) => api<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined, headers });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
