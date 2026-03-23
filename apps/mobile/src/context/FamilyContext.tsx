import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/clerk-expo";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { api, ApiCircleMember, ApiSafetyEvent, ApiPattern, setAuthTokenGetter } from "@/utils/api";

export type ActivityStatus = "active" | "recent" | "away" | "inactive";

export type FamilyMember = {
  id: string;
  userId: string;
  name: string;
  relation: string;
  avatar: string;
  status: ActivityStatus;
  lastSeen: Date;
  region: string;
  isMe?: boolean;
  pending?: boolean;
  travelMode?: boolean;
  travelDestination?: string;
};

export type CheckInRequest = {
  id: string;
  memberId: string;
  memberName: string;
  timestamp: Date;
  responded: boolean;
  response?: "fine" | "help";
};

export type MyProfile = {
  name: string;
  region: string;
};

type FamilyContextType = {
  members: FamilyMember[];
  checkInRequests: CheckInRequest[];
  myStatus: ActivityStatus;
  myLastSeen: Date;
  myProfile: MyProfile | null;
  circleId: string;
  inviteCode: string;
  deviceId: string;
  isRegistered: boolean;
  plan: string;
  travelMode: boolean;
  travelDestination: string;
  safetyEvents: ApiSafetyEvent[];
  patterns: ApiPattern | null;
  alertPrefs: AlertPrefs;
  addMember: (member: Omit<FamilyMember, "id" | "status" | "lastSeen">) => void;
  removeMember: (id: string) => Promise<void>;
  clearAllState: () => Promise<void>;
  respondToCheckIn: (requestId: string, response: "fine" | "help") => void;
  sendHeartbeat: () => void;
  setMyProfile: (profile: MyProfile) => Promise<void>;
  pendingCheckIn: CheckInRequest | null;
  refreshCircle: () => Promise<void>;
  reloadCircleFromStorage: () => Promise<void>;
  setTravelMode: (on: boolean, destination?: string) => Promise<void>;
  upgradePlan: () => Promise<void>;
  refreshSafetyEvents: () => Promise<void>;
  setAlertPref: (source: keyof AlertPrefs, enabled: boolean) => Promise<void>;
};

const FamilyContext = createContext<FamilyContextType | null>(null);

const CHECKINS_KEY = "@ollia_checkins";
const PROFILE_KEY = "@ollia_my_profile";
const CIRCLE_KEY = "@ollia_circle_v2";
const INVITE_CODE_KEY = "@ollia_invite_code_v2";
const PLAN_KEY = "@ollia_plan";
const TRAVEL_KEY = "@ollia_travel";
const ALERT_PREFS_KEY = "@ollia_alert_prefs";
const PENDING_INVITE_KEY = "@ollia_pending_invite";

/** All @ollia_* storage keys — cleared on sign out to prevent cross-user data leaks */
const ALL_STORAGE_KEYS = [
  CHECKINS_KEY,
  PROFILE_KEY,
  CIRCLE_KEY,
  INVITE_CODE_KEY,
  PLAN_KEY,
  TRAVEL_KEY,
  ALERT_PREFS_KEY,
  PENDING_INVITE_KEY,
];

export type AlertPrefs = {
  usgs: boolean;
  noaa: boolean;
  gdacs: boolean;
};

const HEARTBEAT_INTERVAL_MS = 30_000;
const CIRCLE_REFRESH_MS = 30_000;
const SAFETY_REFRESH_MS = 15 * 60 * 1000;

function generateId(len = 20): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function getStatusFromLastSeen(lastSeen: Date | null): ActivityStatus {
  if (!lastSeen) return "inactive";
  const diffMs = Date.now() - lastSeen.getTime();
  const diffMins = diffMs / (1000 * 60);
  if (diffMins < 30) return "active";
  if (diffMins < 60 * 3) return "recent";
  if (diffMins < 60 * 12) return "away";
  return "inactive";
}

function apiMemberToLocal(m: ApiCircleMember, meId: string): FamilyMember {
  return {
    id: m.id,
    userId: m.userId,
    name: m.name,
    relation: m.relation,
    avatar: m.name[0]?.toUpperCase() ?? "?",
    status: (m.status as ActivityStatus) ?? "inactive",
    lastSeen: m.lastSeen ? new Date(m.lastSeen) : new Date(0),
    region: m.region ?? "",
    isMe: m.userId === meId,
    pending: false,
    travelMode: m.travelMode ?? false,
    travelDestination: m.travelDestination,
  };
}

export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const { userId, getToken, isLoaded: authLoaded } = useAuth();
  const [deviceId, setDeviceId] = useState<string>("");
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [checkInRequests, setCheckInRequests] = useState<CheckInRequest[]>([]);
  const [myLastSeen, setMyLastSeen] = useState<Date>(new Date());
  const [myProfile, setMyProfileState] = useState<MyProfile | null>(null);
  const [circleId, setCircleId] = useState<string>("");
  const [inviteCode, setInviteCode] = useState<string>("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [plan, setPlan] = useState<string>("free");
  const [travelMode, setTravelModeState] = useState(false);
  const [travelDestination, setTravelDestinationState] = useState("");
  const [safetyEvents, setSafetyEvents] = useState<ApiSafetyEvent[]>([]);
  const [patterns, setPatterns] = useState<ApiPattern | null>(null);
  const [alertPrefs, setAlertPrefsState] = useState<AlertPrefs>({ usgs: true, noaa: true, gdacs: true });

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>("active");
  const deviceIdRef = useRef<string>("");
  const circleIdRef = useRef<string>("");

  const prevUserIdRef = useRef<string | null>(null);

  const myStatus: ActivityStatus = getStatusFromLastSeen(myLastSeen);

  const stopAllIntervals = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (refreshRef.current) { clearInterval(refreshRef.current); refreshRef.current = null; }
    if (safetyRef.current) { clearInterval(safetyRef.current); safetyRef.current = null; }
  }, []);

  /** Wipe all local state and AsyncStorage — call on sign out or user switch */
  const clearAllState = useCallback(async () => {
    stopAllIntervals();
    // Clear AsyncStorage
    await AsyncStorage.multiRemove(ALL_STORAGE_KEYS);
    // Reset all in-memory state
    setDeviceId("");
    setMembers([]);
    setCheckInRequests([]);
    setMyLastSeen(new Date());
    setMyProfileState(null);
    setCircleId("");
    setInviteCode("");
    setIsRegistered(false);
    setPlan("free");
    setTravelModeState(false);
    setTravelDestinationState("");
    setSafetyEvents([]);
    setPatterns(null);
    setAlertPrefsState({ usgs: true, noaa: true, gdacs: true });
    // Clear refs
    deviceIdRef.current = "";
    circleIdRef.current = "";
    setAuthTokenGetter(null);
  }, [stopAllIntervals]);

  const sendHeartbeatToServer = useCallback(async (uid: string) => {
    if (!uid) return;
    try {
      await api.sendHeartbeat(uid, "heartbeat");
      setMyLastSeen(new Date());
    } catch (e) {
      console.warn("Heartbeat failed:", e);
    }
  }, []);

  const refreshSafetyEvents = useCallback(async () => {
    try {
      const events = await api.getSafetyEvents();
      setSafetyEvents(events);
    } catch (e) {
      console.warn("Safety events failed:", e);
    }
  }, []);

  const refreshPatterns = useCallback(async (uid: string) => {
    if (!uid) return;
    try {
      const p = await api.getPatterns(uid);
      setPatterns(p);
    } catch (e) {
      console.warn("Patterns failed:", e);
    }
  }, []);

  const refreshCircle = useCallback(async () => {
    const cId = circleIdRef.current;
    const devId = deviceIdRef.current;
    if (!cId || !devId) return;
    try {
      const data = await api.getCircle(cId);
      setPlan(data.plan ?? "free");
      await AsyncStorage.setItem(PLAN_KEY, data.plan ?? "free");

      // Always sync inviteCode from server
      if (data.inviteCode) {
        setInviteCode(data.inviteCode);
        await AsyncStorage.setItem(INVITE_CODE_KEY, data.inviteCode);
      }

      const remoteMembers = data.members
        .filter((m) => m.userId !== devId)
        .map((m) => apiMemberToLocal(m, devId));
      setMembers(remoteMembers);

      const inactive = remoteMembers.filter(
        (m) => m.status === "inactive" || m.status === "away"
      );
      if (inactive.length > 0) {
        setCheckInRequests((prev) => {
          const existingIds = new Set(prev.map((c) => c.memberId));
          const newRequests = inactive
            .filter(
              (m) =>
                !existingIds.has(m.id) &&
                m.lastSeen &&
                Date.now() - m.lastSeen.getTime() > 1000 * 60 * 60 * 6
            )
            .map((m) => ({
              id: `ci_${m.id}_${Date.now()}`,
              memberId: m.id,
              memberName: m.name,
              timestamp: new Date(),
              responded: false,
            }));
          return newRequests.length > 0 ? [...prev, ...newRequests] : prev;
        });
      }
    } catch (e) {
      console.warn("Circle refresh failed:", e);
    }
  }, []);

  const startHeartbeat = useCallback(
    (uid: string) => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      sendHeartbeatToServer(uid);
      heartbeatRef.current = setInterval(
        () => sendHeartbeatToServer(uid),
        HEARTBEAT_INTERVAL_MS
      );
    },
    [sendHeartbeatToServer]
  );

  const startRefresh = useCallback(() => {
    if (refreshRef.current) clearInterval(refreshRef.current);
    refreshCircle();
    refreshRef.current = setInterval(refreshCircle, CIRCLE_REFRESH_MS);
  }, [refreshCircle]);

  const startSafetyRefresh = useCallback(() => {
    if (safetyRef.current) clearInterval(safetyRef.current);
    refreshSafetyEvents();
    safetyRef.current = setInterval(refreshSafetyEvents, SAFETY_REFRESH_MS);
  }, [refreshSafetyEvents]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (
        (prev === "background" || prev === "inactive") &&
        next === "active"
      ) {
        sendHeartbeatToServer(deviceIdRef.current);
        refreshCircle();
      }
    });
    return () => {
      sub.remove();
      stopAllIntervals();
    };
  }, [sendHeartbeatToServer, refreshCircle]);

  const setupCircle = useCallback(
    async (devId: string) => {
      let cId = await AsyncStorage.getItem(CIRCLE_KEY) ?? "";
      let code = await AsyncStorage.getItem(INVITE_CODE_KEY) ?? "";
      if (!cId) {
        try {
          const circle = await api.createCircle(devId);
          cId = circle.id;
          code = circle.inviteCode;
          await AsyncStorage.setItem(CIRCLE_KEY, cId);
          await AsyncStorage.setItem(INVITE_CODE_KEY, code);
        } catch (e) {
          console.warn("createCircle failed:", e);
        }
      }
      // If we have a circleId but no inviteCode, fetch it from the server
      if (cId && !code) {
        try {
          const circle = await api.getCircle(cId);
          code = circle.inviteCode;
          if (code) {
            await AsyncStorage.setItem(INVITE_CODE_KEY, code);
          }
        } catch (e) {
          console.warn("Failed to fetch inviteCode:", e);
        }
      }

      circleIdRef.current = cId;
      setCircleId(cId);
      setInviteCode(code);
      return cId;
    },
    []
  );

  const bootstrap = useCallback(async (uid: string) => {
    if (!uid) return;
    deviceIdRef.current = uid;
    setDeviceId(uid);

    try {
      const savedPlan = await AsyncStorage.getItem(PLAN_KEY);
      if (savedPlan) setPlan(savedPlan);

      const travelStr = await AsyncStorage.getItem(TRAVEL_KEY);
      if (travelStr) {
        const t = JSON.parse(travelStr);
        setTravelModeState(t.on ?? false);
        setTravelDestinationState(t.destination ?? "");
      }

      const alertPrefsStr = await AsyncStorage.getItem(ALERT_PREFS_KEY);
      if (alertPrefsStr) {
        setAlertPrefsState(JSON.parse(alertPrefsStr));
      }

      const profileStr = await AsyncStorage.getItem(PROFILE_KEY);
      if (profileStr) {
        const profile = JSON.parse(profileStr) as MyProfile;
        setMyProfileState(profile);
        try {
          await api.upsertUser({ id: uid, name: profile.name, region: profile.region });
          setIsRegistered(true);
        } catch (e) {
          console.warn("upsertUser failed:", e);
        }
      } else {
        try {
          const user = await api.getMe();
          if (user?.name) {
            const profile = { name: user.name, region: user.region ?? "" };
            setMyProfileState(profile);
            await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
            setIsRegistered(true);
          }
        } catch (e) {
          console.warn("getMe failed:", e);
        }
      }

      const cId = await setupCircle(uid);
      if (cId) {
        startHeartbeat(uid);
        startRefresh();
        refreshPatterns(uid);
      }

      startSafetyRefresh();

      const checkins = await AsyncStorage.getItem(CHECKINS_KEY);
      if (checkins) {
        setCheckInRequests(
          JSON.parse(checkins).map((c: CheckInRequest) => ({
            ...c,
            timestamp: new Date(c.timestamp),
          }))
        );
      }
    } catch (e) {
      console.error("Bootstrap error:", e);
    }
  }, [setupCircle, startHeartbeat, startRefresh, startSafetyRefresh, refreshPatterns]);

  useEffect(() => {
    if (!authLoaded) return;

    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId ?? null;

    if (!userId) {
      // Signed out — clear everything
      clearAllState();
      return;
    }

    // User changed (sign out then sign in as different user)
    if (prevUserId && prevUserId !== userId) {
      clearAllState().then(() => {
        setAuthTokenGetter(getToken);
        bootstrap(userId);
      });
      return;
    }

    setAuthTokenGetter(getToken);
    bootstrap(userId);
  }, [userId, authLoaded]);

  const addMember = useCallback(
    (member: Omit<FamilyMember, "id" | "status" | "lastSeen">) => {
      const newMember: FamilyMember = {
        ...member,
        id: generateId(8),
        status: "inactive",
        lastSeen: new Date(0),
      };
      setMembers((prev) => [...prev, newMember]);
    },
    []
  );

  const removeMember = useCallback(async (id: string) => {
    const cId = circleIdRef.current;
    if (!cId) {
      console.warn("removeMember: no circleId");
      return;
    }
    try {
      await api.removeMember(cId, id);
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (e: any) {
      console.error("removeMember failed:", e);
      throw e;
    }
  }, []);

  const respondToCheckIn = useCallback(
    async (requestId: string, response: "fine" | "help") => {
      const devId = deviceIdRef.current;
      if (devId) {
        api.sendHeartbeat(devId, "check_in_response").catch(() => {});
      }
      setCheckInRequests((prev) => {
        const updated = prev.map((c) =>
          c.id === requestId ? { ...c, responded: true, response } : c
        );
        AsyncStorage.setItem(CHECKINS_KEY, JSON.stringify(updated));
        return updated;
      });
      setMyLastSeen(new Date());
    },
    []
  );

  const sendHeartbeat = useCallback(() => {
    setMyLastSeen(new Date());
    sendHeartbeatToServer(deviceIdRef.current);
  }, [sendHeartbeatToServer]);

  const setMyProfile = useCallback(
    async (profile: MyProfile) => {
      setMyProfileState(profile);
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));

      const devId = deviceIdRef.current;
      if (!devId) return;

      try {
        await api.upsertUser({ id: devId, name: profile.name, region: profile.region });
        setIsRegistered(true);
      } catch (e) {
        console.warn("upsertUser failed:", e);
      }

      const cId = await setupCircle(devId);
      if (cId) {
        startHeartbeat(devId);
        startRefresh();
        refreshPatterns(devId);
      }
    },
    [setupCircle, startHeartbeat, startRefresh, refreshPatterns]
  );

  const setTravelMode = useCallback(
    async (on: boolean, destination?: string) => {
      const devId = deviceIdRef.current;
      setTravelModeState(on);
      setTravelDestinationState(on ? (destination ?? "") : "");
      await AsyncStorage.setItem(
        TRAVEL_KEY,
        JSON.stringify({ on, destination: destination ?? "" })
      );
      if (devId) {
        try {
          await api.setTravelMode(devId, on, destination);
        } catch (e) {
          console.warn("setTravelMode failed:", e);
        }
      }
    },
    []
  );

  const upgradePlan = useCallback(async () => {
    const cId = circleIdRef.current;
    if (!cId) return;
    try {
      await api.upgradePlan(cId, "premium");
      setPlan("premium");
      await AsyncStorage.setItem(PLAN_KEY, "premium");
    } catch (e) {
      console.warn("upgradePlan failed:", e);
    }
  }, []);

  const reloadCircleFromStorage = useCallback(async () => {
    const uid = deviceIdRef.current;
    if (!uid) return;
    const cId = await AsyncStorage.getItem(CIRCLE_KEY) ?? "";
    const code = await AsyncStorage.getItem(INVITE_CODE_KEY) ?? "";
    if (!cId) return;
    circleIdRef.current = cId;
    setCircleId(cId);
    setInviteCode(code);
    try {
      const circle = await api.getCircle(cId);
      if (circle.members) {
        setMembers(circle.members.map((m: ApiCircleMember) => apiMemberToLocal(m, uid)));
      }
    } catch (e) {
      console.warn("reloadCircleFromStorage fetch failed:", e);
    }
  }, []);

  const setAlertPref = useCallback(async (source: keyof AlertPrefs, enabled: boolean) => {
    setAlertPrefsState((prev) => {
      const next = { ...prev, [source]: enabled };
      AsyncStorage.setItem(ALERT_PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const prefFilteredEvents = safetyEvents.filter((e) => {
    if (e.source === "USGS" && !alertPrefs.usgs) return false;
    if (e.source === "NOAA" && !alertPrefs.noaa) return false;
    if (e.source === "GDACS" && !alertPrefs.gdacs) return false;
    return true;
  });

  const activeLocation = travelMode && travelDestination
    ? travelDestination
    : (myProfile?.region ?? "");

  const userCountry = activeLocation.includes(",")
    ? activeLocation.split(",").pop()?.trim().toLowerCase() ?? ""
    : activeLocation.trim().toLowerCase();

  const filteredSafetyEvents = userCountry
    ? prefFilteredEvents.filter((e) => {
        const haystack = `${e.region ?? ""} ${e.title ?? ""}`.toLowerCase();
        if (e.source === "NOAA") {
          return (
            userCountry.includes("united states") ||
            userCountry === "usa" ||
            userCountry === "us"
          );
        }
        return haystack.includes(userCountry);
      })
    : prefFilteredEvents;

  const pendingCheckIn = checkInRequests.find((c) => !c.responded) ?? null;

  return (
    <FamilyContext.Provider
      value={{
        members,
        checkInRequests,
        myStatus,
        myLastSeen,
        myProfile,
        circleId,
        inviteCode,
        deviceId,
        isRegistered,
        plan,
        travelMode,
        travelDestination,
        safetyEvents: filteredSafetyEvents,
        patterns,
        alertPrefs,
        addMember,
        removeMember,
        clearAllState,
        respondToCheckIn,
        sendHeartbeat,
        setMyProfile,
        pendingCheckIn,
        refreshCircle,
        reloadCircleFromStorage,
        setTravelMode,
        upgradePlan,
        refreshSafetyEvents,
        setAlertPref,
      }}
    >
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamilyContext(): FamilyContextType {
  const ctx = useContext(FamilyContext);
  if (!ctx)
    throw new Error("useFamilyContext must be used within FamilyProvider");
  return ctx;
}
