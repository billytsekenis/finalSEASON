import type { CommandAction, CommandResult, LightsResponse, UserData } from '../../shared/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-lumen': '1', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, navigator.onLine ? 'Ο διακομιστής δεν απαντά' : 'Δεν υπάρχει σύνδεση στο internet');
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('lumen:unauthorized'));
    throw new ApiError(res.status, body.error ?? `Σφάλμα ${res.status}`);
  }
  return body;
}

export const api = {
  session: () => request<{ authenticated: boolean }>('/api/auth'),
  login: (password: string) => request<{ authenticated: boolean }>('/api/auth', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('/api/auth', { method: 'DELETE' }),
  lights: () => request<LightsResponse>('/api/lights'),
  command: (actions: CommandAction[]) =>
    request<{ results: CommandResult[] }>('/api/command', { method: 'POST', body: JSON.stringify({ actions }) }),
  data: () => request<UserData>('/api/data'),
  saveData: (d: UserData) => request<UserData>('/api/data', { method: 'PUT', body: JSON.stringify(d) }),
  stStatus: () => request<{ connected: boolean; kind?: string; expiresAt?: number }>('/api/connect/smartthings'),
  stStart: () => request<{ authorizeUrl: string }>('/api/connect/smartthings?start=1'),
  stComplete: (input: string) =>
    request<{ connected: boolean; kind: string }>('/api/connect/smartthings', { method: 'POST', body: JSON.stringify({ input }) }),
  stDisconnect: () => request('/api/connect/smartthings', { method: 'DELETE' }),
  xmStatus: () => request<{ connected: boolean; region?: string; connectedAt?: number }>('/api/connect/xiaomi'),
  xmLogin: (username: string, password: string, region: string) =>
    request<{ status: 'connected' | 'verify' | 'captcha'; url?: string }>('/api/connect/xiaomi', {
      method: 'POST',
      body: JSON.stringify({ username, password, region }),
    }),
  xmDisconnect: () => request('/api/connect/xiaomi', { method: 'DELETE' }),
};
