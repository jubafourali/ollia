import { useAuth } from "@clerk/clerk-expo";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";
import { CityPicker } from "@/components/CityPicker";
import { UpgradeModal } from "@/components/UpgradeModal";
import { api } from "@/utils/api";
import {
  APP_CATALOG,
  getDetectionCapability,
  getSelectedApps,
  addSelectedApp,
  removeSelectedApp,
  resolveApps,
  type AppEntry,
} from "@/services/activityApps";

type SettingRowProps = {
  icon: string;
  iconLib?: "feather" | "ionicons";
  label: string;
  value?: boolean;
  onToggle?: (v: boolean) => void;
  subtitle?: string;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
};

function SettingRow({ icon, iconLib = "feather", label, value, onToggle, subtitle, onPress, chevron, danger, testID }: SettingRowProps) {
  const IconComp = iconLib === "ionicons" ? Ionicons : Feather;
  const color = danger ? "#EF4444" : BRAND.primary;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress && { opacity: 0.7 }]}
      onPress={onPress}
      testID={testID}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${color}15` }]}>
        <IconComp name={icon as any} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && { color: "#EF4444" }]}>{label}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {onToggle !== undefined && value !== undefined ? (
        <Switch
          value={value}
          onValueChange={(v) => {
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            onToggle(v);
          }}
          trackColor={{ false: BRAND.border, true: `${BRAND.primary}80` }}
          thumbColor={value ? BRAND.primary : BRAND.backgroundCard}
        />
      ) : chevron ? (
        <Feather name="chevron-right" size={18} color={BRAND.textMuted} />
      ) : null}
    </Pressable>
  );
}

function PlanCard({ plan, onUpgrade }: { plan: string; onUpgrade: () => void }) {
  const isPremium = plan === "premium";

  return (
    <View style={[styles.planCard, isPremium && styles.planCardPremium]}>
      <View style={styles.planCardHeader}>
        <View style={styles.planBadge}>
          <Feather
            name={isPremium ? "star" : "users"}
            size={14}
            color={isPremium ? "#F59E0B" : BRAND.primary}
          />
          <Text style={[styles.planBadgeText, isPremium && { color: "#F59E0B" }]}>
            {isPremium ? "Premium" : "Free Plan"}
          </Text>
        </View>
      </View>

      {isPremium ? (
        <View style={styles.planFeatures}>
          {["Unlimited family members", "Smart inactivity alerts", "Travel mode", "Disaster awareness", "Priority notifications"].map((f) => (
            <View key={f} style={styles.planFeatureRow}>
              <Feather name="check" size={13} color="#7C3AED" />
              <Text style={[styles.planFeatureText, { color: "#7C3AED" }]}>{f}</Text>
            </View>
          ))}
        </View>
      ) : (
        <>
          <View style={styles.planFeatures}>
            {["Up to 3 family members", "Basic activity reassurance"].map((f) => (
              <View key={f} style={styles.planFeatureRow}>
                <Feather name="check" size={13} color={BRAND.primary} />
                <Text style={styles.planFeatureText}>{f}</Text>
              </View>
            ))}
            {["Unlimited family members", "Smart inactivity alerts", "Travel mode", "Disaster awareness"].map((f) => (
              <View key={f} style={styles.planFeatureRow}>
                <Feather name="lock" size={13} color={BRAND.textMuted} />
                <Text style={[styles.planFeatureText, { color: BRAND.textMuted }]}>{f}</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.upgradeBtn, pressed && { opacity: 0.85 }]}
            onPress={onUpgrade}
            testID="upgrade-to-premium-btn"
          >
            <Feather name="star" size={15} color={BRAND.white} />
            <Text style={styles.upgradeBtnText}>Upgrade to Premium</Text>
          </Pressable>
          <Text style={styles.upgradePriceHint}>$9.99/mo · $79.99/yr</Text>
        </>
      )}
    </View>
  );
}

type SourceRowProps = {
  orgName: string;
  orgAbbrev: string;
  website: string;
  description: string;
  icon: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  isLast?: boolean;
};

function SourceRow({ orgName, orgAbbrev, website, description, icon, enabled, onToggle, isLast }: SourceRowProps) {
  return (
    <View style={[srcStyles.row, !isLast && srcStyles.rowBorder]}>
      <View style={srcStyles.rowIcon}>
        <Feather name={icon as any} size={17} color={enabled ? BRAND.primary : BRAND.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={srcStyles.orgLine}>
          <Text style={srcStyles.orgName}>{orgName}</Text>
          <View style={srcStyles.officialBadge}>
            <Feather name="shield" size={9} color="#059669" />
            <Text style={srcStyles.officialText}>Official</Text>
          </View>
        </View>
        <Text style={srcStyles.abbrev}>{orgAbbrev} · {website}</Text>
        <Text style={srcStyles.description}>{description}</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={(v) => {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          onToggle(v);
        }}
        trackColor={{ false: BRAND.border, true: `${BRAND.primary}80` }}
        thumbColor={enabled ? BRAND.primary : BRAND.backgroundCard}
      />
    </View>
  );
}

const srcStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.borderLight,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: `${BRAND.primary}15`,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  orgLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orgName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  officialBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#05966912",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#05966930",
  },
  officialText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#059669",
  },
  abbrev: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    marginTop: 1,
  },
  description: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    marginTop: 3,
    lineHeight: 16,
  },
});

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const { members, removeMember, clearAllState, plan, upgradePlan, alertPrefs, setAlertPref, myProfile, setMyProfile } = useFamilyContext();
  const [deleting, setDeleting] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [editName, setEditName] = useState(myProfile?.name ?? "");
  const [editCity, setEditCity] = useState(myProfile?.region ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [notifActivity, setNotifActivity] = useState(true);
  const [notifInactivity, setNotifInactivity] = useState(true);
  const [shareRegion, setShareRegion] = useState(true);

  const [ecName, setEcName] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [ecSaving, setEcSaving] = useState(false);
  const [ecSaved, setEcSaved] = useState(false);
  const [ecOriginal, setEcOriginal] = useState({ name: "", phone: "" });

  // Activity apps (Premium)
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);
  const [appSearch, setAppSearch] = useState("");
  const [showAppPicker, setShowAppPicker] = useState(false);

  // Safety preferences (Premium)
  const [thresholdHours, setThresholdHours] = useState(3);
  const [thresholdOriginal, setThresholdOriginal] = useState(3);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [scheduledDeadline, setScheduledDeadline] = useState<string | null>(null);
  const [schedulingSaving, setSchedulingSaving] = useState(false);

  useEffect(() => {
    setEditName(myProfile?.name ?? "");
    setEditCity(myProfile?.region ?? "");
  }, [myProfile]);

  useEffect(() => {
    api.getNotificationPrefs()
      .then((prefs) => {
        setNotifActivity(prefs.notifyActivity);
        setNotifInactivity(prefs.notifyInactivity);
      })
      .catch(() => {});
    api.getEmergencyContact()
      .then((ec) => {
        setEcName(ec.name ?? "");
        setEcPhone(ec.phone ?? "");
        setEcOriginal({ name: ec.name ?? "", phone: ec.phone ?? "" });
      })
      .catch(() => {});
    api.getSafetyPreferences()
      .then((prefs) => {
        setThresholdHours(prefs.inactivityThresholdHours);
        setThresholdOriginal(prefs.inactivityThresholdHours);
        setScheduledDeadline(prefs.scheduledCheckInDeadline);
      })
      .catch(() => {});
    getSelectedApps().then(setSelectedAppIds).catch(() => {});
  }, []);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const profileDirty =
    editName.trim() !== (myProfile?.name ?? "") ||
    editCity.trim() !== (myProfile?.region ?? "");

  async function handleSaveProfile() {
    if (!editName.trim() || profileSaving) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setProfileSaving(true);
    try {
      await setMyProfile({ name: editName.trim(), region: editCity.trim() });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch {}
    setProfileSaving(false);
  }

  const ecDirty =
    ecName.trim() !== ecOriginal.name || ecPhone.trim() !== ecOriginal.phone;

  async function handleSaveEmergencyContact() {
    if (ecSaving) return;
    setEcSaving(true);
    try {
      const saved = await api.updateEmergencyContact({
        name: ecName.trim() || null,
        phone: ecPhone.trim() || null,
      });
      const next = { name: saved.name ?? "", phone: saved.phone ?? "" };
      setEcOriginal(next);
      setEcSaved(true);
      setTimeout(() => setEcSaved(false), 2000);
    } catch {}
    setEcSaving(false);
  }

  async function handleSaveThreshold() {
    if (thresholdSaving || thresholdHours === thresholdOriginal) return;
    setThresholdSaving(true);
    try {
      const saved = await api.updateSafetyPreferences({ inactivityThresholdHours: thresholdHours });
      setThresholdOriginal(saved.inactivityThresholdHours);
    } catch {}
    setThresholdSaving(false);
  }

  async function handleScheduleCheckIn(hoursFromNow: number) {
    setSchedulingSaving(true);
    try {
      const deadline = new Date(Date.now() + hoursFromNow * 3600000).toISOString();
      const saved = await api.updateSafetyPreferences({ scheduledCheckInDeadline: deadline });
      setScheduledDeadline(saved.scheduledCheckInDeadline);
    } catch {}
    setSchedulingSaving(false);
  }

  async function handleCancelScheduledCheckIn() {
    setSchedulingSaving(true);
    try {
      await api.cancelScheduledCheckIn();
      setScheduledDeadline(null);
    } catch {}
    setSchedulingSaving(false);
  }

  function formatDeadline(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    if (diffMs <= 0) return "Expired";
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffH > 0) return `${timeStr} (${diffH}h ${diffM}m from now)`;
    return `${timeStr} (${diffM}m from now)`;
  }

  const detectionCapability = getDetectionCapability();
  const selectedApps = resolveApps(selectedAppIds);
  const filteredCatalog = appSearch.trim()
    ? APP_CATALOG.filter(
        (a) =>
          a.name.toLowerCase().includes(appSearch.toLowerCase()) ||
          a.category.toLowerCase().includes(appSearch.toLowerCase())
      )
    : APP_CATALOG;

  async function handleAddApp(appId: string) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = await addSelectedApp(appId);
    setSelectedAppIds(next);
  }

  async function handleRemoveApp(appId: string) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = await removeSelectedApp(appId);
    setSelectedAppIds(next);
  }

  const handleUpgrade = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setShowUpgrade(true);
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topInset }]}
      contentContainerStyle={[styles.content, Platform.OS === "web" && { paddingBottom: 34 }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionTitle}>My Profile</Text>
      <View style={[styles.section, { padding: 16, gap: 14 }]}>
        <View style={profileStyles.field}>
          <Text style={profileStyles.label}>Your name</Text>
          <TextInput
            style={profileStyles.input}
            placeholder="e.g. Sara, Juba"
            placeholderTextColor={BRAND.textMuted}
            value={editName}
            onChangeText={setEditName}
            autoCorrect={false}
          />
        </View>
        <View style={profileStyles.field}>
          <Text style={profileStyles.label}>Your city</Text>
          <Text style={profileStyles.hint}>Used to show you relevant safety alerts</Text>
          <CityPicker value={editCity} onChange={setEditCity} />
        </View>
        <Pressable
          style={({ pressed }) => [
            profileStyles.saveBtn,
            (!editName.trim() || !profileDirty) && profileStyles.saveBtnDisabled,
            pressed && { opacity: 0.85 },
          ]}
          onPress={handleSaveProfile}
          disabled={!editName.trim() || profileSaving || !profileDirty}
        >
          {profileSaved ? (
            <>
              <Feather name="check" size={16} color={BRAND.white} />
              <Text style={profileStyles.saveBtnText}>Saved</Text>
            </>
          ) : (
            <Text style={profileStyles.saveBtnText}>
              {profileSaving ? "Saving…" : "Save profile"}
            </Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Your Plan</Text>
      <PlanCard plan={plan} onUpgrade={handleUpgrade} />

      <Text style={styles.sectionTitle}>Safety Data Sources</Text>
      <View style={styles.section}>
        <SourceRow
          icon="zap"
          orgName="U.S. Geological Survey"
          orgAbbrev="USGS"
          website="earthquake.usgs.gov"
          description="Real-time earthquake alerts worldwide. Data published directly by USGS."
          enabled={alertPrefs.usgs}
          onToggle={(v) => setAlertPref("usgs", v)}
        />
        <SourceRow
          icon="cloud-lightning"
          orgName="National Weather Service"
          orgAbbrev="NOAA / NWS"
          website="weather.gov"
          description="Severe weather alerts for the United States including storms, floods, and extreme conditions."
          enabled={alertPrefs.noaa}
          onToggle={(v) => setAlertPref("noaa", v)}
        />
        <SourceRow
          icon="globe"
          orgName="Global Disaster Alert"
          orgAbbrev="GDACS / EU JRC"
          website="gdacs.org"
          description="Worldwide disaster alerts — earthquakes, cyclones, floods, and volcanoes. Covers UAE, Middle East, and all regions not served by NOAA."
          enabled={alertPrefs.gdacs}
          onToggle={(v) => setAlertPref("gdacs", v)}
          isLast
        />
      </View>
      <View style={styles.sourceDisclaimer}>
        <Feather name="info" size={12} color={BRAND.textMuted} />
        <Text style={styles.sourceDisclaimerText}>
          Ollia does not modify official alert data. Data is sourced directly from USGS, NOAA, and GDACS (EU Joint Research Centre) and linked to original reports. NOAA covers the US only — enable GDACS for global coverage including UAE and Middle East.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.section}>
        <SettingRow
          icon="bell"
          label="Activity alerts"
          subtitle="Notify when family is active"
          value={notifActivity}
          onToggle={(v) => {
            setNotifActivity(v);
            api.updateNotificationPrefs({ notifyActivity: v }).catch(() => setNotifActivity(!v));
          }}
          testID="activity-alerts-row"
        />
        <View style={styles.divider} />
        <SettingRow
          icon="alert-triangle"
          label="Inactivity alerts"
          subtitle="Notify if someone goes quiet"
          value={notifInactivity}
          onToggle={(v) => {
            setNotifInactivity(v);
            api.updateNotificationPrefs({ notifyInactivity: v }).catch(() => setNotifInactivity(!v));
          }}
          testID="inactivity-alerts-row"
        />
      </View>

      <Text style={styles.sectionTitle}>Safety Preferences</Text>
      {plan === "premium" ? (
        <View style={[styles.section, { padding: 16, gap: 16 }]}>
          {/* Inactivity threshold slider */}
          <View style={{ gap: 6 }}>
            <View style={spStyles.labelRow}>
              <Feather name="clock" size={15} color={BRAND.primary} />
              <Text style={profileStyles.label}>Inactivity threshold</Text>
            </View>
            <Text style={ecStyles.hint}>
              Alert you after this many hours of no activity
            </Text>
            <View style={spStyles.sliderRow}>
              <Pressable
                style={spStyles.stepBtn}
                onPress={() => setThresholdHours((h) => Math.max(1, h - 1))}
              >
                <Feather name="minus" size={16} color={BRAND.primary} />
              </Pressable>
              <View style={spStyles.sliderTrack}>
                <View
                  style={[
                    spStyles.sliderFill,
                    { width: `${((thresholdHours - 1) / 23) * 100}%` },
                  ]}
                />
              </View>
              <Pressable
                style={spStyles.stepBtn}
                onPress={() => setThresholdHours((h) => Math.min(24, h + 1))}
              >
                <Feather name="plus" size={16} color={BRAND.primary} />
              </Pressable>
              <View style={spStyles.valueBadge}>
                <Text style={spStyles.valueText}>{thresholdHours}h</Text>
              </View>
            </View>
            {thresholdHours !== thresholdOriginal && (
              <Pressable
                style={({ pressed }) => [
                  profileStyles.saveBtn,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={handleSaveThreshold}
                disabled={thresholdSaving}
              >
                <Text style={profileStyles.saveBtnText}>
                  {thresholdSaving ? "Saving…" : "Save threshold"}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Scheduled check-in */}
          <View style={spStyles.divider} />
          <View style={{ gap: 8 }}>
            <View style={spStyles.labelRow}>
              <Feather name="shield" size={15} color={BRAND.primary} />
              <Text style={profileStyles.label}>Scheduled mode</Text>
            </View>
            <Text style={ecStyles.hint}>
              Going on a hike or trip? Set a deadline — your circle gets alerted if you don't check in by then.
            </Text>

            {scheduledDeadline ? (
              <View style={spStyles.activeSchedule}>
                <View style={spStyles.activeScheduleTop}>
                  <Feather name="clock" size={14} color="#F59E0B" />
                  <Text style={spStyles.activeScheduleText}>
                    Check in by {formatDeadline(scheduledDeadline)}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [spStyles.cancelBtn, pressed && { opacity: 0.7 }]}
                  onPress={handleCancelScheduledCheckIn}
                  disabled={schedulingSaving}
                >
                  <Feather name="x" size={14} color={BRAND.statusRed} />
                  <Text style={spStyles.cancelBtnText}>
                    {schedulingSaving ? "Canceling…" : "Cancel scheduled check-in"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={spStyles.quickBtns}>
                {[2, 4, 8, 12].map((h) => (
                  <Pressable
                    key={h}
                    style={({ pressed }) => [
                      spStyles.quickBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => handleScheduleCheckIn(h)}
                    disabled={schedulingSaving}
                  >
                    <Text style={spStyles.quickBtnText}>{h}h</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      ) : (
        <Pressable style={styles.section} onPress={() => setShowUpgrade(true)}>
          <View style={spStyles.lockedRow}>
            <Feather name="lock" size={14} color={BRAND.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={spStyles.lockedTitle}>Safety Preferences</Text>
              <Text style={spStyles.lockedText}>
                Custom inactivity thresholds and scheduled check-ins — Premium feature
              </Text>
            </View>
            <Feather name="chevron-right" size={14} color={BRAND.textMuted} />
          </View>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>Activity Apps</Text>
      {plan === "premium" ? (
        <View style={[styles.section, { padding: 16, gap: 14 }]}>
          {/* Privacy notice */}
          <View style={aaStyles.privacyNotice}>
            <Feather name="eye-off" size={14} color={BRAND.primary} />
            <Text style={aaStyles.privacyText}>
              These apps are never monitored for content — Ollia only detects that you opened them. App names are stored on your device only and never sent to Ollia's servers.
            </Text>
          </View>

          {/* iOS limitation notice */}
          {!detectionCapability.available && (
            <View style={aaStyles.limitationNotice}>
              <Feather name="info" size={14} color="#92400E" />
              <View style={{ flex: 1 }}>
                <Text style={aaStyles.limitationText}>{detectionCapability.reason}</Text>
                <Text style={aaStyles.tipText}>{detectionCapability.tip}</Text>
              </View>
            </View>
          )}

          {/* Selected apps */}
          {selectedApps.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={profileStyles.label}>Selected apps</Text>
              <View style={aaStyles.chipContainer}>
                {selectedApps.map((app) => (
                  <View key={app.id} style={aaStyles.chip}>
                    <Text style={aaStyles.chipText}>{app.name}</Text>
                    <Pressable
                      onPress={() => handleRemoveApp(app.id)}
                      hitSlop={8}
                    >
                      <Feather name="x" size={13} color={BRAND.textSecondary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Add apps button / picker */}
          {showAppPicker ? (
            <View style={{ gap: 8 }}>
              <TextInput
                style={profileStyles.input}
                placeholder="Search apps…"
                placeholderTextColor={BRAND.textMuted}
                value={appSearch}
                onChangeText={setAppSearch}
                autoCorrect={false}
                autoFocus
              />
              <View style={aaStyles.appList}>
                {filteredCatalog
                  .filter((a) => !selectedAppIds.includes(a.id))
                  .slice(0, 12)
                  .map((app) => (
                    <Pressable
                      key={app.id}
                      style={({ pressed }) => [
                        aaStyles.appRow,
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={() => handleAddApp(app.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={aaStyles.appName}>{app.name}</Text>
                        <Text style={aaStyles.appCategory}>{app.category}</Text>
                      </View>
                      <Feather name="plus-circle" size={18} color={BRAND.primary} />
                    </Pressable>
                  ))}
              </View>
              <Pressable
                style={({ pressed }) => [aaStyles.doneBtn, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  setShowAppPicker(false);
                  setAppSearch("");
                }}
              >
                <Text style={aaStyles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [aaStyles.addBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setShowAppPicker(true)}
            >
              <Feather name="plus" size={16} color={BRAND.primary} />
              <Text style={aaStyles.addBtnText}>Add apps</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Pressable style={styles.section} onPress={() => setShowUpgrade(true)}>
          <View style={spStyles.lockedRow}>
            <Feather name="lock" size={14} color={BRAND.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={spStyles.lockedTitle}>Activity Apps</Text>
              <Text style={spStyles.lockedText}>
                Select apps that count as proof of life — Premium feature
              </Text>
            </View>
            <Feather name="chevron-right" size={14} color={BRAND.textMuted} />
          </View>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>Emergency Contact</Text>
      <View style={[styles.section, { padding: 16, gap: 14 }]}>
        <Text style={ecStyles.hint}>
          If you're unreachable for an extended period, Ollia will alert this person as a last resort.
        </Text>
        <View style={profileStyles.field}>
          <Text style={profileStyles.label}>Name</Text>
          <TextInput
            style={profileStyles.input}
            placeholder="e.g. Mom, Sara"
            placeholderTextColor={BRAND.textMuted}
            value={ecName}
            onChangeText={setEcName}
            autoCorrect={false}
          />
        </View>
        <View style={profileStyles.field}>
          <Text style={profileStyles.label}>Phone number</Text>
          <TextInput
            style={profileStyles.input}
            placeholder="+1 555 123 4567"
            placeholderTextColor={BRAND.textMuted}
            value={ecPhone}
            onChangeText={setEcPhone}
            keyboardType="phone-pad"
            autoCorrect={false}
          />
        </View>
        <Pressable
          style={({ pressed }) => [
            profileStyles.saveBtn,
            !ecDirty && profileStyles.saveBtnDisabled,
            pressed && { opacity: 0.85 },
          ]}
          onPress={handleSaveEmergencyContact}
          disabled={ecSaving || !ecDirty}
        >
          {ecSaved ? (
            <>
              <Feather name="check" size={16} color={BRAND.white} />
              <Text style={profileStyles.saveBtnText}>Saved</Text>
            </>
          ) : (
            <Text style={profileStyles.saveBtnText}>
              {ecSaving ? "Saving…" : "Save emergency contact"}
            </Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Privacy</Text>
      <View style={styles.section}>
        <SettingRow
          icon="map-pin"
          label="Share my region"
          subtitle="Show city-level location only"
          value={shareRegion}
          onToggle={setShareRegion}
          testID="share-region-row"
        />
      </View>

      <Text style={styles.sectionTitle}>Family Circle</Text>
      <View style={styles.section}>
        {members.length === 0 ? (
          <View style={styles.emptyMembers}>
            <Text style={styles.emptyMembersText}>No family members yet</Text>
          </View>
        ) : (
          [...members]
            .sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : 0))
            .map((m, i) => (
              <React.Fragment key={m.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={[styles.memberRow, m.isMe && styles.memberRowMe]}>
                  <View style={[styles.memberInitial, m.isMe && styles.memberInitialMe]}>
                    <Text style={styles.memberInitialText}>{m.avatar}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[styles.memberName, m.isMe && { color: BRAND.primary }]}>
                        {m.name}
                      </Text>
                      {m.isMe && (
                        <View style={styles.youBadge}>
                          <Text style={styles.youBadgeText}>You</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.memberRelation}>
                      {m.isMe ? "Circle owner" : m.relation}
                      {m.travelMode && m.travelDestination ? ` · Traveling` : ""}
                    </Text>
                  </View>
                  {m.isMe ? (
                    <View style={styles.ownerBadge}>
                      <Feather name="shield" size={14} color={BRAND.primary} />
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        Alert.alert(
                          "Remove member",
                          `Remove ${m.name} from your circle?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Remove",
                              style: "destructive",
                              onPress: async () => {
                                if (Platform.OS !== "web") {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                }
                                try {
                                  await removeMember(m.id);
                                } catch {
                                  Alert.alert("Error", "Failed to remove member. Please try again.");
                                }
                              },
                            },
                          ]
                        );
                      }}
                      style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.6 }]}
                    >
                      <Feather name="user-minus" size={16} color={BRAND.statusRed} />
                    </Pressable>
                  )}
                </View>
              </React.Fragment>
            ))
        )}
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}
        testID="sign-out-btn"
        onPress={() => {
          Alert.alert("Sign out", "Are you sure you want to sign out?", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Sign out",
              style: "destructive",
              onPress: async () => {
                await clearAllState();
                await signOut();
              },
            },
          ]);
        }}
      >
        <Feather name="log-out" size={17} color={BRAND.statusRed} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.deleteAccountBtn, pressed && { opacity: 0.7 }]}
        disabled={deleting}
        onPress={() => {
          Alert.alert(
            "Delete account",
            "Are you sure? This will permanently delete your account and remove you from all family circles. This cannot be undone.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete account",
                style: "destructive",
                onPress: async () => {
                  setDeleting(true);
                  try {
                    await api.deleteAccount();
                    await clearAllState();
                    await signOut();
                    router.replace("/(auth)/sign-in");
                  } catch (e) {
                    console.error("Delete account failed:", e);
                    Alert.alert("Error", "Failed to delete account. Please try again.");
                  } finally {
                    setDeleting(false);
                  }
                },
              },
            ]
          );
        }}
      >
        <Feather name="trash-2" size={17} color="#EF4444" />
        <Text style={styles.deleteAccountText}>
          {deleting ? "Deleting…" : "Delete account"}
        </Text>
      </Pressable>

      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onSelect={async (planType) => {
          await upgradePlan(planType);
          setShowUpgrade(false);
        }}
      />

      <View style={styles.aboutCard}>
        <View style={styles.aboutLogo}>
          <Text style={styles.aboutLogoText}>Oll</Text>
          <Text style={[styles.aboutLogoText, { color: BRAND.primary }]}>ia</Text>
        </View>
        <Text style={styles.aboutTagline}>
          A quiet signal that lets your family know you're okay.
        </Text>
        <Text style={styles.aboutVersion}>Version 2.0.0</Text>
        <Pressable onPress={() => Linking.openURL('https://ollia.app/terms')}>
          <Text>Terms of Service</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL('https://ollia.app/privacy')}>
          <Text>Privacy Policy</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const profileStyles = StyleSheet.create({
  field: {
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    marginBottom: 2,
  },
  input: {
    backgroundColor: BRAND.backgroundDeep,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: BRAND.text,
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
  },
  saveBtn: {
    backgroundColor: BRAND.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 4,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
});

const aaStyles = StyleSheet.create({
  privacyNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: `${BRAND.primary}08`,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: `${BRAND.primary}20`,
  },
  privacyText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    lineHeight: 17,
    flex: 1,
  },
  limitationNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FCD34D60",
  },
  limitationText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#92400E",
    lineHeight: 17,
  },
  tipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#92400E",
    lineHeight: 17,
    marginTop: 6,
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: `${BRAND.primary}12`,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${BRAND.primary}30`,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
  },
  appList: {
    maxHeight: 280,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
    backgroundColor: BRAND.backgroundDeep,
    overflow: "hidden",
  },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.borderLight,
    gap: 10,
  },
  appName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: BRAND.text,
  },
  appCategory: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: `${BRAND.primary}30`,
    borderStyle: "dashed",
  },
  addBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
  },
  doneBtn: {
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: BRAND.primary,
  },
  doneBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
});

const spStyles = StyleSheet.create({
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: `${BRAND.primary}12`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${BRAND.primary}30`,
  },
  sliderTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: BRAND.borderLight,
    overflow: "hidden",
  },
  sliderFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: BRAND.primary,
  },
  valueBadge: {
    backgroundColor: `${BRAND.primary}15`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${BRAND.primary}30`,
    minWidth: 44,
    alignItems: "center",
  },
  valueText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.primary,
  },
  divider: {
    height: 1,
    backgroundColor: BRAND.borderLight,
  },
  activeSchedule: {
    backgroundColor: "#F59E0B10",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F59E0B30",
    gap: 10,
  },
  activeScheduleTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activeScheduleText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#92400E",
    flex: 1,
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: `${BRAND.statusRed}10`,
    borderWidth: 1,
    borderColor: `${BRAND.statusRed}25`,
  },
  cancelBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: BRAND.statusRed,
  },
  quickBtns: {
    flexDirection: "row",
    gap: 8,
  },
  quickBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: `${BRAND.primary}10`,
    borderWidth: 1,
    borderColor: `${BRAND.primary}25`,
  },
  quickBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.primary,
  },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  lockedTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.textSecondary,
    marginBottom: 1,
  },
  lockedText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    lineHeight: 16,
  },
});

const ecStyles = StyleSheet.create({
  hint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    lineHeight: 18,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  section: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
    overflow: "hidden",
  },
  sourceDisclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 20,
  },
  sourceDisclaimerText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    flex: 1,
    lineHeight: 15,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: BRAND.text,
  },
  rowSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: BRAND.borderLight,
    marginLeft: 62,
  },
  planCard: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: BRAND.border,
    padding: 16,
    gap: 14,
  },
  planCardPremium: {
    borderColor: "#7C3AED40",
    backgroundColor: "#7C3AED06",
  },
  planCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: `${BRAND.primary}12`,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${BRAND.primary}30`,
  },
  planBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.primary,
  },
  planFeatures: {
    gap: 8,
  },
  planFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  planFeatureText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.text,
  },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F59E0B",
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 4,
  },
  upgradeBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
  upgradePriceHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    textAlign: "center",
    marginTop: -4,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  memberRowMe: {
    backgroundColor: `${BRAND.primary}06`,
  },
  memberInitial: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND.backgroundDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: BRAND.border,
  },
  memberInitialMe: {
    borderColor: `${BRAND.primary}50`,
    backgroundColor: `${BRAND.primary}10`,
  },
  memberInitialText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  youBadge: {
    backgroundColor: `${BRAND.primary}20`,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${BRAND.primary}40`,
  },
  youBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.primary,
  },
  ownerBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${BRAND.primary}12`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${BRAND.primary}30`,
  },
  memberName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: BRAND.text,
  },
  memberRelation: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${BRAND.statusRed}12`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${BRAND.statusRed}30`,
  },
  emptyMembers: {
    padding: 20,
    alignItems: "center",
  },
  emptyMembersText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: `${BRAND.statusRed}30`,
    backgroundColor: `${BRAND.statusRed}08`,
  },
  signOutText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: BRAND.statusRed,
  },
  deleteAccountBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#EF444440",
    backgroundColor: "#EF444410",
  },
  deleteAccountText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#EF4444",
  },
  aboutCard: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 8,
  },
  aboutLogo: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 4,
  },
  aboutLogoText: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
  },
  aboutTagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    textAlign: "center",
  },
  aboutVersion: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
});
