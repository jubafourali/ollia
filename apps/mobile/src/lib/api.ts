import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

async function getToken(): Promise<string | null> {
  // Clerk stores the session token; we retrieve it via the exported helper
  // In components, use useAuth().getToken() instead
  return null;
}

interface RequestOptions {
  method?: string;
  body?: any;
  token?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Response types
export interface HeartbeatResponse {
  status: string;
}

export interface StatusResponse {
  status: 'safe' | 'quiet' | 'checkin';
  lastSeenAt: string | null;
}

export interface FamilyMemberResponse {
  userId: string;
  name: string;
  status: 'safe' | 'quiet' | 'checkin';
  lastSeenAt: string | null;
}

export interface FamilyResponse {
  members: FamilyMemberResponse[];
}

export interface InviteResponse {
  token: string;
  deepLink: string;
}

export interface CreateUserResponse {
  id: string;
  name: string;
  email: string;
}

// API functions
export const api = {
  heartbeat: (token: string) =>
    request<HeartbeatResponse>('/api/heartbeat', { method: 'POST', token }),

  getStatus: (userId: string, token: string) =>
    request<StatusResponse>(`/api/status/${userId}`, { token }),

  getFamily: (token: string) =>
    request<FamilyResponse>('/api/family', { token }),

  createInvite: (token: string) =>
    request<InviteResponse>('/api/family/invite', { method: 'POST', token }),

  acceptInvite: (inviteToken: string, authToken: string) =>
    request<{ status: string }>(`/api/family/invite/${inviteToken}/accept`, {
      method: 'POST',
      token: authToken,
    }),

  syncUser: (data: { name: string; email: string; region?: string }, token: string) =>
    request<CreateUserResponse>('/api/users', { method: 'POST', body: data, token }),

  updateUser: (data: { name?: string; region?: string }, token: string) =>
    request<any>('/api/users/me', { method: 'PATCH', body: data, token }),

  savePushToken: (pushToken: string, token: string) =>
    request<{ status: string }>('/api/users/push-token', {
      method: 'POST',
      body: { token: pushToken, platform: 'expo' },
      token,
    }),

  deleteAccount: (token: string) =>
    request<void>('/api/users/me', { method: 'DELETE', token }),
};
