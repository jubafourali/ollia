const RAW_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL ??
    (process.env.EXPO_PUBLIC_DOMAIN
        ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
        : "http://localhost:8080");

const BASE_URL = RAW_BASE_URL.endsWith("/api")
    ? RAW_BASE_URL
    : `${RAW_BASE_URL}/api`;

let _getToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(fn: (() => Promise<string | null>) | null) {
  _getToken = fn;
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (_getToken) {
    try {
      const token = await _getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {}
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

export type ApiUser = {
  id: string;
  name: string;
  region?: string;
  travelMode?: boolean;
  travelDestination?: string;
  createdAt?: string;
  plan?: string;
  foundingMember: boolean;
  foundingExpiresAt: string | null;
};

export type ApiSubscriptionStatus = {
  plan: string;
  subscriptionId?: string;
};

export type ApiActivityResponse = {
  recorded: boolean;
  timestamp: string;
};

export type ApiCircleMember = {
  id: string;
  userId: string;
  name: string;
  region?: string;
  relation: string;
  lastCheckInAt?: string | null;
  lastSeen?: string;
  joinedAt?: string;
  travelMode?: boolean;
  travelDestination?: string;
};

export type ApiCircleDetail = {
  id: string;
  inviteCode: string;
  ownerId: string;
  plan?: string;
  createdAt?: string;
};

export type ApiCircleWithMembers = ApiCircleDetail & {
  members: ApiCircleMember[];
};

export type ApiSafetyEvent = {
  id: string;
  type: string;
  title: string;
  description?: string;
  region?: string;
  severity: string;
  source?: string;
  sourceUrl?: string;
  lat?: string;
  lon?: string;
  eventTime?: string;
};

export type ApiPattern = {
  hasPattern: boolean;
  peakHours?: number[];
  missedPeaks?: number[];
  totalSignals?: number;
  todaySignals?: number;
  insight?: string | null;
};

export type ApiSafetyPreferences = {
  inactivityThresholdHours: number;
  scheduledCheckInDeadline: string | null;
  urgentOvernightAlerts: boolean;
};

export const api = {
  upsertUser(payload: { id: string; name: string; region?: string; timezone?: string }): Promise<ApiUser> {
    return req("/users", { method: "POST", body: JSON.stringify(payload) });
  },

  getMe(): Promise<ApiUser> {
    return req(`/users`, {
      method: "GET"
    });
  },

  sendHeartbeat(userId: string, signalType = "heartbeat"): Promise<ApiActivityResponse> {
    return req("/activity", {
      method: "POST",
      body: JSON.stringify({ userId, signalType }),
    });
  },

  createCircle(ownerId: string): Promise<ApiCircleDetail> {
    return req("/circles", { method: "POST", body: JSON.stringify({ ownerId }) });
  },

  getCircle(circleId: string): Promise<ApiCircleWithMembers> {
    return req(`/circles/${circleId}`);
  },

  joinCircle(payload: {
    inviteCode: string;
    userId: string;
    relation?: string;
  }): Promise<ApiCircleWithMembers> {
    return req("/circles/join", { method: "POST", body: JSON.stringify(payload) });
  },

  upgradePlan(circleId: string, plan: "free" | "premium"): Promise<ApiCircleDetail> {
    return req(`/circles/${circleId}/plan`, {
      method: "PATCH",
      body: JSON.stringify({ plan }),
    });
  },

  setTravelMode(userId: string, travelMode: boolean, travelDestination?: string): Promise<ApiUser> {
    return req(`/users/${userId}/travel`, {
      method: "PATCH",
      body: JSON.stringify({ travelMode, travelDestination }),
    });
  },

  getSafetyEvents(): Promise<ApiSafetyEvent[]> {
    return req("/safety-events");
  },

  getPatterns(userId: string): Promise<ApiPattern> {
    return req(`/users/${userId}/patterns`);
  },

  removeMember(circleId: string, memberId: string): Promise<void> {
    return req(`/circles/${circleId}/members/${memberId}`, { method: "DELETE" });
  },

  deleteAccount(): Promise<void> {
    return req("/users/me", { method: "DELETE" });
  },

  createCheckout(plan: "monthly" | "annual"): Promise<{ url: string }> {
    return req("/subscriptions/checkout", {
      method: "POST",
      body: JSON.stringify({ plan }),
    });
  },

  getSubscriptionStatus(): Promise<ApiSubscriptionStatus> {
    return req("/subscriptions/status");
  },

  updateNotificationPrefs(prefs: { notifyActivity?: boolean; notifyInactivity?: boolean }): Promise<{ notifyActivity: boolean; notifyInactivity: boolean }> {
    return req("/users/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(prefs),
    });
  },

  getNotificationPrefs(): Promise<{ notifyActivity: boolean; notifyInactivity: boolean }> {
    return req("/users/me/preferences");
  },

  getEmergencyContact(): Promise<{ name: string | null; phone: string | null }> {
    return req("/users/me/emergency-contact");
  },

  updateEmergencyContact(contact: { name: string | null; phone: string | null }): Promise<{ name: string | null; phone: string | null }> {
    return req("/users/me/emergency-contact", {
      method: "PATCH",
      body: JSON.stringify(contact),
    });
  },

  getSafetyPreferences(): Promise<ApiSafetyPreferences> {
    return req("/users/me/safety-preferences");
  },

  updateSafetyPreferences(prefs: {
    inactivityThresholdHours?: number;
    scheduledCheckInDeadline?: string;
    urgentOvernightAlerts?: boolean;
  }): Promise<ApiSafetyPreferences> {
    return req("/users/me/safety-preferences", {
      method: "PATCH",
      body: JSON.stringify(prefs),
    });
  },

  cancelScheduledCheckIn(): Promise<ApiSafetyPreferences> {
    return req("/users/me/scheduled-checkin", { method: "DELETE" });
  },

  updatePreferredLanguage(preferredLanguage: string): Promise<void> {
    return req("/users/me/language", {
      method: "PATCH",
      body: JSON.stringify({ preferredLanguage }),
    });
  },

  getShortcutToken(): Promise<{ token: string }> {
    return req("/users/me/shortcut-token");
  },

  registerPushToken(token: string, platform = "expo"): Promise<{ success: boolean }> {
    return req("/push-tokens", {
      method: "POST",
      body: JSON.stringify({ token, platform }),
    });
  },

  deregisterPushToken(): Promise<{ success: boolean }> {
    return req("/push-tokens", { method: "DELETE" });
  },
};
