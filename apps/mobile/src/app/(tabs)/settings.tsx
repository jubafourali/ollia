import { useAuth } from "@clerk/clerk-expo";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  AppState,
  AppStateStatus,
  I18nManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Share,
} from "react-native";
import * as Clipboard from 'expo-clipboard';
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";

import * as Notifications from "expo-notifications";
import * as BackgroundFetch from "expo-background-fetch";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";
import { CityPicker } from "@/components/CityPicker";
import { UpgradeModal } from "@/components/UpgradeModal";
import { api } from "@/utils/api";
import i18n, { SUPPORTED_LANGUAGES, LANGUAGE_STORAGE_KEY, type LanguageCode } from "@/i18n";
import {
  APP_CATALOG,
  getSelectedApps,
  addSelectedApp,
  removeSelectedApp,
  resolveApps,
} from "@/services/activityApps";
import {
  requestLocationPermission,
  hasBackgroundLocationPermission,
} from "@/services/backgroundActivity";
import { APP_STORE_URL } from "@/constants";

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
  testID?: string;
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
  const { t } = useTranslation();
  const isPremium = plan === "premium";

  const premiumFeatures = [
    t("upgrade.plan.unlimitedMembers"),
      // TODO later
    // t("upgrade.plan.passiveDetection"),
    t("upgrade.plan.smartEscalation"),
    t("upgrade.plan.customInactivity"),
    t("upgrade.plan.scheduledMode"),
      // TODO Enable this later
    // t("upgrade.plan.activityApps"),
    t("upgrade.plan.travelMode"),
    t("upgrade.plan.cityAlerts"),
    t("upgrade.plan.severityControl"),
    t("upgrade.plan.activityPatterns"),
  ];

  const freeFeatures = [
    t("upgrade.freePlan.members"),
    t("upgrade.freePlan.basicReassurance"),
    t("upgrade.freePlan.safetyAlerts"),
  ];

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
            {isPremium ? t("settings.premium") : t("settings.freePlan")}
          </Text>
        </View>
      </View>

      {isPremium ? (
        <View style={styles.planFeatures}>
          {premiumFeatures.map((f) => (
            <View key={f} style={styles.planFeatureRow}>
              <Feather name="check" size={13} color="#92400E" />
              <Text style={[styles.planFeatureText, { color: "#92400E" }]}>{f}</Text>
            </View>
          ))}
        </View>
      ) : (
        <>
          <View style={styles.planFeatures}>
            {freeFeatures.map((f) => (
              <View key={f} style={styles.planFeatureRow}>
                <Feather name="check" size={13} color={BRAND.primary} />
                <Text style={styles.planFeatureText}>{f}</Text>
              </View>
            ))}
            {premiumFeatures.map((f) => (
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
            <Text style={styles.upgradeBtnText}>{t("settings.upgradeBtn")}</Text>
          </Pressable>
          <Text style={styles.upgradePriceHint}>{t("settings.upgradePrice")}</Text>
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
  const { t } = useTranslation();
  return (
    <View style={[srcStyles.row, !isLast && srcStyles.rowBorder]}>
      <View style={srcStyles.rowIcon}>
        <Feather name={icon as any} size={17} color={enabled ? BRAND.primary : BRAND.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={srcStyles.orgLine}>
          <Text style={srcStyles.orgName}>{orgName}</Text>
        </View>
        <Text style={srcStyles.abbrev}>{orgAbbrev} · {website}</Text>
        <Text style={srcStyles.description}>
          {description}{" "}
          <Text style={srcStyles.officialText}>{t("settings.officialBadge")}</Text>
        </Text>
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const { members, removeMember, clearAllState, plan, upgradePlan, alertPrefs, setAlertPref, myProfile, setMyProfile } = useFamilyContext();
  const [deleting, setDeleting] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<LanguageCode>(
    (i18n.language as LanguageCode) || "en"
  );

  const [editName, setEditName] = useState(myProfile?.name ?? "");
  const [editCity, setEditCity] = useState(myProfile?.region ?? "");
  const [editTimezone, setEditTimezone] = useState<string | undefined>(myProfile?.timezone);
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
  const [setupGuideApp, setSetupGuideApp] = useState<string | null>(null);
  const [shortcutToken, setShortcutToken] = useState<string | null>(null);
  const [shortcutTokenLoading, setShortcutTokenLoading] = useState(false);

  // Permission statuses
  const [notifPermGranted, setNotifPermGranted] = useState(true);
  const [bgRefreshStatus, setBgRefreshStatusLocal] = useState<"on" | "off" | "limited">("on");
  const [bgLocationGranted, setBgLocationGranted] = useState(true);

  // Safety preferences (Premium)
  const [thresholdHours, setThresholdHours] = useState(3);
  const [thresholdOriginal, setThresholdOriginal] = useState(3);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [scheduledDeadline, setScheduledDeadline] = useState<string | null>(null);
  const [schedulingSaving, setSchedulingSaving] = useState(false);
  const [urgentOvernightAlerts, setUrgentOvernightAlerts] = useState(false);
  const [urgentSaving, setUrgentSaving] = useState(false);

  useEffect(() => {
    setEditName(myProfile?.name ?? "");
    setEditCity(myProfile?.region ?? "");
    setEditTimezone(myProfile?.timezone);
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
        setUrgentOvernightAlerts(prefs.urgentOvernightAlerts);
      })
      .catch(() => {});
    getSelectedApps().then(setSelectedAppIds).catch(() => {});
  }, []);

  // Check permission statuses on mount and foreground resume
  useEffect(() => {
    if (Platform.OS === "web") return;

    async function checkPermissions() {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        setNotifPermGranted(status === "granted");
      } catch {}
      try {
        const s = await BackgroundFetch.getStatusAsync();
        if (s === BackgroundFetch.BackgroundFetchStatus.Available) {
          setBgRefreshStatusLocal("on");
        } else if (s === BackgroundFetch.BackgroundFetchStatus.Restricted) {
          setBgRefreshStatusLocal("limited");
        } else {
          setBgRefreshStatusLocal("off");
        }
      } catch {}
      try {
        const granted = await hasBackgroundLocationPermission();
        setBgLocationGranted(granted);
      } catch {}
    }

    checkPermissions();

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") checkPermissions();
    });
    return () => sub.remove();
  }, []);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const profileDirty =
    editName.trim() !== (myProfile?.name ?? "") ||
    editCity.trim() !== (myProfile?.region ?? "") ||
    editTimezone !== myProfile?.timezone;

  async function handleSaveProfile() {
    if (!editName.trim() || profileSaving) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setProfileSaving(true);
    try {
      await setMyProfile({
        name: editName.trim(),
        region: editCity.trim(),
        timezone: editTimezone,
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch {}
    setProfileSaving(false);
  }

  async function handleToggleUrgentOvernight(value: boolean) {
    if (urgentSaving) return;
    setUrgentSaving(true);
    setUrgentOvernightAlerts(value);
    try {
      const saved = await api.updateSafetyPreferences({ urgentOvernightAlerts: value });
      setUrgentOvernightAlerts(saved.urgentOvernightAlerts);
    } catch {
      // revert on failure
      setUrgentOvernightAlerts(!value);
    }
    setUrgentSaving(false);
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
    if (diffMs <= 0) return t("settings.expired");
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffH > 0) return `${timeStr} (${diffH}h ${diffM}m from now)`;
    return `${timeStr} (${diffM}m from now)`;
  }

  async function handleLanguageSelect(code: LanguageCode) {
    setShowLanguagePicker(false);
    if (code === currentLanguage) return;
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    await i18n.changeLanguage(code);
    setCurrentLanguage(code);
    // Also persist to backend
    api.updatePreferredLanguage(code).catch(() => {});
    // RTL requires a restart
    const needsRTL = false;
    const hadRTL = false;
    // const needsRTL = code === "ar";
    // const hadRTL = currentLanguage === "ar";
    if (needsRTL !== hadRTL) {
      I18nManager.forceRTL(needsRTL);
      Alert.alert(t("settings.chooseLanguage"), t("settings.restartRequired"));
    }
  }

  const currentLangLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentLanguage)?.label ?? "English";

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

  async function handleShareOllia() {
    try {
      await Share.share({
        message: t("settings.shareMessage"),
        url: APP_STORE_URL,
      });
    } catch {}
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: topInset }, Platform.OS === "web" && { paddingBottom: 34 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{t("settings.title")}</Text>

      <Text style={styles.sectionTitle}>{t("settings.myProfile")}</Text>
      <View style={[styles.section, { padding: 16, gap: 14 }]}>
        <View style={profileStyles.field}>
          <Text style={profileStyles.label}>{t("settings.yourName")}</Text>
          <TextInput
            style={profileStyles.input}
            placeholder={t("settings.namePlaceholder")}
            placeholderTextColor={BRAND.textMuted}
            value={editName}
            onChangeText={setEditName}
            autoCorrect={false}
          />
        </View>
        <View style={profileStyles.field}>
          <Text style={profileStyles.label}>{t("settings.yourCity")}</Text>
          <Text style={profileStyles.hint}>{t("settings.cityHint")}</Text>
          <CityPicker
            value={editCity}
            onChange={(displayName, tz) => {
              setEditCity(displayName);
              if (tz) setEditTimezone(tz);
            }}
          />
        </View>
        {/* Language selector */}
        <SettingRow
          icon="globe"
          label={t("settings.language")}
          subtitle={currentLangLabel}
          onPress={() => setShowLanguagePicker(true)}
          chevron
        />
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
              <Text style={profileStyles.saveBtnText}>{t("common.saved")}</Text>
            </>
          ) : (
            <Text style={profileStyles.saveBtnText}>
              {profileSaving ? t("common.saving") : t("settings.saveProfile")}
            </Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>{t("settings.yourPlan")}</Text>
      <PlanCard plan={plan} onUpgrade={handleUpgrade} />

      <Text style={styles.sectionTitle}>{t("settings.safetyDataSources")}</Text>
      <View style={styles.section}>
        <SourceRow
          icon="zap"
          orgName={t("sources.usgs.orgName")}
          orgAbbrev={t("sources.usgs.abbrev")}
          website={t("sources.usgs.website")}
          description={t("sources.usgs.description")}
          enabled={alertPrefs.usgs}
          onToggle={(v) => setAlertPref("usgs", v)}
        />
        <SourceRow
          icon="cloud-lightning"
          orgName={t("sources.noaa.orgName")}
          orgAbbrev={t("sources.noaa.abbrev")}
          website={t("sources.noaa.website")}
          description={t("sources.noaa.description")}
          enabled={alertPrefs.noaa}
          onToggle={(v) => setAlertPref("noaa", v)}
        />
        <SourceRow
          icon="globe"
          orgName={t("sources.gdacs.orgName")}
          orgAbbrev={t("sources.gdacs.abbrev")}
          website={t("sources.gdacs.website")}
          description={t("sources.gdacs.description")}
          enabled={alertPrefs.gdacs}
          onToggle={(v) => setAlertPref("gdacs", v)}
          isLast
        />
      </View>
      <View style={styles.sourceDisclaimer}>
        <Feather name="info" size={12} color={BRAND.textMuted} />
        <Text style={styles.sourceDisclaimerText}>
          {t("sources.disclaimer")}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>{t("settings.notifications")}</Text>
      <View style={styles.section}>
        <SettingRow
          icon="bell"
          label={t("settings.activityAlerts")}
          subtitle={t("settings.activityAlertsSubtitle")}
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
          label={t("settings.inactivityAlerts")}
          subtitle={t("settings.inactivityAlertsSubtitle")}
          value={notifInactivity}
          onToggle={(v) => {
            setNotifInactivity(v);
            api.updateNotificationPrefs({ notifyInactivity: v }).catch(() => setNotifInactivity(!v));
          }}
          testID="inactivity-alerts-row"
        />
      </View>

      <Text style={styles.sectionTitle}>{t("permissions.sectionTitle")}</Text>
      <View style={styles.section}>
        {/* Notifications */}
        <Pressable
          style={({ pressed }) => [styles.row, pressed && !notifPermGranted && { opacity: 0.7 }]}
          onPress={!notifPermGranted ? () => Linking.openURL("app-settings:") : undefined}
        >
          <View style={[styles.rowIcon, { backgroundColor: `${BRAND.primary}15` }]}>
            <Feather name="bell" size={18} color={BRAND.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>{t("permissions.notifications")}</Text>
            <Text style={styles.rowSubtitle}>
              {t("permissions.notificationsHint")}
            </Text>
          </View>
          <View style={[permStyles.badge, {backgroundColor: bgLocationGranted ? `${BRAND.statusGreen}18` : `#F59E0B18`, marginTop: 2}]}>
            <Text style={[permStyles.badgeText, { color: notifPermGranted ? BRAND.statusGreen : "#F59E0B" }]}>
              {notifPermGranted ? t("permissions.statusOn") : t("permissions.statusOff")}
            </Text>
          </View>
        </Pressable>

        <View style={styles.divider} />

        {/* Background App Refresh */}
        <Pressable
          style={({ pressed }) => [styles.row, pressed && bgRefreshStatus === "off" && { opacity: 0.7 }]}
          onPress={bgRefreshStatus === "off" ? () => Linking.openURL("app-settings:") : undefined}
        >
          <View style={[styles.rowIcon, { backgroundColor: `${BRAND.primary}15` }]}>
            <Feather name="refresh-cw" size={18} color={BRAND.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>{t("permissions.backgroundRefresh")}</Text>
            <Text style={styles.rowSubtitle}>
              {bgRefreshStatus === "limited"
                ? t("permissions.backgroundRefreshHintLowPower")
                : t("permissions.backgroundRefreshHint")}
            </Text>
          </View>
          <View style={[permStyles.badge, {
            backgroundColor: bgRefreshStatus === "on" ? `${BRAND.statusGreen}18`
              : bgRefreshStatus === "off" ? `#F59E0B18`
              : `${BRAND.textMuted}18`,
          }]}>
            <Text style={[permStyles.badgeText, {
              color: bgRefreshStatus === "on" ? BRAND.statusGreen
                : bgRefreshStatus === "off" ? "#F59E0B"
                : BRAND.textMuted,
            }]}>
              {bgRefreshStatus === "on" ? t("permissions.statusOn") : bgRefreshStatus === "off" ? t("permissions.statusOff") : t("permissions.statusLowPower")}
            </Text>
          </View>
        </Pressable>

        <View style={styles.divider} />

        {/* Background Location */}
        <Pressable
          style={({ pressed }) => [styles.row, pressed && !bgLocationGranted && { opacity: 0.7 }]}
          onPress={!bgLocationGranted ? async () => {
            const granted = await requestLocationPermission();
            if (granted) { setBgLocationGranted(true); return; }
            const ok = await hasBackgroundLocationPermission();
            if (ok) { setBgLocationGranted(true); return; }
            Linking.openURL("app-settings:");
          } : undefined}
        >
          <View style={[styles.rowIcon, { backgroundColor: `${BRAND.primary}15` }]}>
            <Feather name="map-pin" size={18} color={BRAND.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>{t("permissions.backgroundLocation")}</Text>
            <Text style={styles.rowSubtitle}>{t("permissions.backgroundLocationHint")}</Text>
          </View>
          <View style={[permStyles.badge, { backgroundColor: bgLocationGranted ? `${BRAND.statusGreen}18` : `#F59E0B18` }]}>
            <Text style={[permStyles.badgeText, { color: bgLocationGranted ? BRAND.statusGreen : "#F59E0B" }]}>
              {bgLocationGranted ? t("permissions.statusOn") : t("permissions.statusOff")}
            </Text>
          </View>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>{t("settings.safetyPreferences")}</Text>
      {plan === "premium" ? (
        <View style={[styles.section, { padding: 16, gap: 16 }]}>
          {/* Inactivity threshold slider */}
          <View style={{ gap: 6 }}>
            <View style={spStyles.labelRow}>
              <Feather name="clock" size={15} color={BRAND.primary} />
              <Text style={profileStyles.label}>{t("settings.inactivityThreshold")}</Text>
            </View>
            <Text style={ecStyles.hint}>
              {t("settings.inactivityThresholdHint")}
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
                  {thresholdSaving ? t("common.saving") : t("settings.saveThreshold")}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Scheduled check-in */}
          <View style={spStyles.divider} />
          <View style={{ gap: 8 }}>
            <View style={spStyles.labelRow}>
              <Feather name="shield" size={15} color={BRAND.primary} />
              <Text style={profileStyles.label}>{t("settings.scheduledMode")}</Text>
            </View>
            <Text style={ecStyles.hint}>
              {t("settings.scheduledModeHint")}
            </Text>

            {scheduledDeadline ? (
              <View style={spStyles.activeSchedule}>
                <View style={spStyles.activeScheduleTop}>
                  <Feather name="clock" size={14} color="#F59E0B" />
                  <Text style={spStyles.activeScheduleText}>
                    {formatDeadline(scheduledDeadline)}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [spStyles.cancelBtn, pressed && { opacity: 0.7 }]}
                  onPress={handleCancelScheduledCheckIn}
                  disabled={schedulingSaving}
                >
                  <Feather name="x" size={14} color={BRAND.statusRed} />
                  <Text style={spStyles.cancelBtnText}>
                    {schedulingSaving ? t("settings.canceling") : t("settings.cancelSchedule")}
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

          <View style={spStyles.divider} />
          <View style={spStyles.toggleRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={spStyles.labelRow}>
                <Feather name="moon" size={15} color={BRAND.primary} />
                <Text style={profileStyles.label}>{t("settings.urgentOvernight")}</Text>
              </View>
              <Text style={ecStyles.hint}>{t("settings.urgentOvernightHint")}</Text>
            </View>
            <Switch
              value={urgentOvernightAlerts}
              onValueChange={handleToggleUrgentOvernight}
              disabled={urgentSaving}
              trackColor={{ false: BRAND.border, true: `${BRAND.primary}80` }}
              thumbColor={urgentOvernightAlerts ? BRAND.primary : BRAND.backgroundCard}
            />
          </View>
        </View>
      ) : (
        <Pressable style={styles.section} onPress={() => setShowUpgrade(true)}>
          <View style={spStyles.lockedRow}>
            <Feather name="lock" size={14} color={BRAND.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={spStyles.lockedTitle}>{t("settings.safetyPreferences")}</Text>
              <Text style={spStyles.lockedText}>
                {t("settings.safetyPreferencesLocked")}
              </Text>
            </View>
            <Feather name="chevron-right" size={14} color={BRAND.textMuted} />
          </View>
        </Pressable>
      )}

      {/*TODO this feature will come soon after launch*/}
      {/*<Text style={styles.sectionTitle}>{t("settings.activityApps")}</Text>*/}
      {/*{plan === "premium" ? (*/}
      {/*  <View style={[styles.section, { padding: 16, gap: 14 }]}>*/}
      {/*    /!* Privacy notice *!/*/}
      {/*    <View style={aaStyles.privacyNotice}>*/}
      {/*      <Feather name="eye-off" size={14} color={BRAND.primary} />*/}
      {/*      <Text style={aaStyles.privacyText}>*/}
      {/*        {t("settings.activityAppsPrivacy")}*/}
      {/*      </Text>*/}
      {/*    </View>*/}

      {/*    /!* One-line explanation *!/*/}
      {/*    <Text style={aaStyles.explanationText}>*/}
      {/*      Opening one of these apps will quietly let your family know you're okay.*/}
      {/*    </Text>*/}

      {/*    /!* Selected apps *!/*/}
      {/*    {selectedApps.length > 0 && (*/}
      {/*      <View style={{ gap: 6 }}>*/}
      {/*        <Text style={profileStyles.label}>{t("settings.selectedApps")}</Text>*/}
      {/*        {selectedApps.map((app) => (*/}
      {/*          <View key={app.id} style={aaStyles.appChipRow}>*/}
      {/*            <View style={aaStyles.chip}>*/}
      {/*              <Text style={aaStyles.chipText}>{app.name}</Text>*/}
      {/*              <Pressable*/}
      {/*                onPress={() => handleRemoveApp(app.id)}*/}
      {/*                hitSlop={8}*/}
      {/*              >*/}
      {/*                <Feather name="x" size={13} color={BRAND.textSecondary} />*/}
      {/*              </Pressable>*/}
      {/*            </View>*/}
      {/*            <Pressable*/}
      {/*              style={({ pressed }) => [aaStyles.setupBtn, pressed && { opacity: 0.7 }]}*/}
      {/*              onPress={() => {*/}
      {/*                Linking.openURL("shortcuts://");*/}
      {/*                setSetupGuideApp(app.name);*/}
      {/*                if (!shortcutToken) {*/}
      {/*                  setShortcutTokenLoading(true);*/}
      {/*                  api.getShortcutToken()*/}
      {/*                    .then((res) => setShortcutToken(res.token))*/}
      {/*                    .catch(() => {})*/}
      {/*                    .finally(() => setShortcutTokenLoading(false));*/}
      {/*                }*/}
      {/*              }}*/}
      {/*            >*/}
      {/*              <Feather name="zap" size={13} color={BRAND.primary} />*/}
      {/*              <Text style={aaStyles.setupBtnText}>Set it up for me</Text>*/}
      {/*            </Pressable>*/}
      {/*          </View>*/}
      {/*        ))}*/}
      {/*      </View>*/}
      {/*    )}*/}

      {/*    /!* Add apps button / picker *!/*/}
      {/*    {showAppPicker ? (*/}
      {/*      <View style={{ gap: 8 }}>*/}
      {/*        <TextInput*/}
      {/*          style={profileStyles.input}*/}
      {/*          placeholder={t("common.searchApps")}*/}
      {/*          placeholderTextColor={BRAND.textMuted}*/}
      {/*          value={appSearch}*/}
      {/*          onChangeText={setAppSearch}*/}
      {/*          autoCorrect={false}*/}
      {/*          autoFocus*/}
      {/*        />*/}
      {/*        <View style={aaStyles.appList}>*/}
      {/*          {filteredCatalog*/}
      {/*            .filter((a) => !selectedAppIds.includes(a.id))*/}
      {/*            .slice(0, 12)*/}
      {/*            .map((app) => (*/}
      {/*              <Pressable*/}
      {/*                key={app.id}*/}
      {/*                style={({ pressed }) => [*/}
      {/*                  aaStyles.appRow,*/}
      {/*                  pressed && { opacity: 0.7 },*/}
      {/*                ]}*/}
      {/*                onPress={() => handleAddApp(app.id)}*/}
      {/*              >*/}
      {/*                <View style={{ flex: 1 }}>*/}
      {/*                  <Text style={aaStyles.appName}>{app.name}</Text>*/}
      {/*                  <Text style={aaStyles.appCategory}>{app.category}</Text>*/}
      {/*                </View>*/}
      {/*                <Feather name="plus-circle" size={18} color={BRAND.primary} />*/}
      {/*              </Pressable>*/}
      {/*            ))}*/}
      {/*        </View>*/}
      {/*        <Pressable*/}
      {/*          style={({ pressed }) => [aaStyles.doneBtn, pressed && { opacity: 0.7 }]}*/}
      {/*          onPress={() => {*/}
      {/*            setShowAppPicker(false);*/}
      {/*            setAppSearch("");*/}
      {/*          }}*/}
      {/*        >*/}
      {/*          <Text style={aaStyles.doneBtnText}>{t("common.done")}</Text>*/}
      {/*        </Pressable>*/}
      {/*      </View>*/}
      {/*    ) : (*/}
      {/*      <Pressable*/}
      {/*        style={({ pressed }) => [aaStyles.addBtn, pressed && { opacity: 0.7 }]}*/}
      {/*        onPress={() => setShowAppPicker(true)}*/}
      {/*      >*/}
      {/*        <Feather name="plus" size={16} color={BRAND.primary} />*/}
      {/*        <Text style={aaStyles.addBtnText}>{t("settings.addApps")}</Text>*/}
      {/*      </Pressable>*/}
      {/*    )}*/}
      {/*  </View>*/}
      {/*) : (*/}
      {/*  <Pressable style={styles.section} onPress={() => setShowUpgrade(true)}>*/}
      {/*    <View style={spStyles.lockedRow}>*/}
      {/*      <Feather name="lock" size={14} color={BRAND.textMuted} />*/}
      {/*      <View style={{ flex: 1 }}>*/}
      {/*        <Text style={spStyles.lockedTitle}>{t("settings.activityApps")}</Text>*/}
      {/*        <Text style={spStyles.lockedText}>*/}
      {/*          {t("settings.activityAppsLocked")}*/}
      {/*        </Text>*/}
      {/*      </View>*/}
      {/*      <Feather name="chevron-right" size={14} color={BRAND.textMuted} />*/}
      {/*    </View>*/}
      {/*  </Pressable>*/}
      {/*)}*/}

      {/*TODO this feature will come soon after launch*/}
      {/*<Text style={styles.sectionTitle}>{t("settings.emergencyContact")}</Text>*/}
      {/*<View style={[styles.section, { padding: 16, gap: 14 }]}>*/}
      {/*  <Text style={ecStyles.hint}>*/}
      {/*    {t("settings.emergencyContactHint")}*/}
      {/*  </Text>*/}
      {/*  <View style={profileStyles.field}>*/}
      {/*    <Text style={profileStyles.label}>{t("settings.name")}</Text>*/}
      {/*    <TextInput*/}
      {/*      style={profileStyles.input}*/}
      {/*      placeholder={t("settings.ecNamePlaceholder")}*/}
      {/*      placeholderTextColor={BRAND.textMuted}*/}
      {/*      value={ecName}*/}
      {/*      onChangeText={setEcName}*/}
      {/*      autoCorrect={false}*/}
      {/*    />*/}
      {/*  </View>*/}
      {/*  <View style={profileStyles.field}>*/}
      {/*    <Text style={profileStyles.label}>{t("settings.phoneNumber")}</Text>*/}
      {/*    <TextInput*/}
      {/*      style={profileStyles.input}*/}
      {/*      placeholder={t("settings.phonePlaceholder")}*/}
      {/*      placeholderTextColor={BRAND.textMuted}*/}
      {/*      value={ecPhone}*/}
      {/*      onChangeText={setEcPhone}*/}
      {/*      keyboardType="phone-pad"*/}
      {/*      autoCorrect={false}*/}
      {/*    />*/}
      {/*  </View>*/}
      {/*  <Pressable*/}
      {/*    style={({ pressed }) => [*/}
      {/*      profileStyles.saveBtn,*/}
      {/*      !ecDirty && profileStyles.saveBtnDisabled,*/}
      {/*      pressed && { opacity: 0.85 },*/}
      {/*    ]}*/}
      {/*    onPress={handleSaveEmergencyContact}*/}
      {/*    disabled={ecSaving || !ecDirty}*/}
      {/*  >*/}
      {/*    {ecSaved ? (*/}
      {/*      <>*/}
      {/*        <Feather name="check" size={16} color={BRAND.white} />*/}
      {/*        <Text style={profileStyles.saveBtnText}>{t("common.saved")}</Text>*/}
      {/*      </>*/}
      {/*    ) : (*/}
      {/*      <Text style={profileStyles.saveBtnText}>*/}
      {/*        {ecSaving ? t("common.saving") : t("settings.saveEmergencyContact")}*/}
      {/*      </Text>*/}
      {/*    )}*/}
      {/*  </Pressable>*/}
      {/*</View>*/}

      <Text style={styles.sectionTitle}>{t("settings.privacy")}</Text>
      <View style={styles.section}>
        <SettingRow
          icon="map-pin"
          label={t("settings.shareMyRegion")}
          subtitle={t("settings.shareMyRegionSubtitle")}
          value={shareRegion}
          onToggle={setShareRegion}
          testID="share-region-row"
        />
      </View>

      <Text style={styles.sectionTitle}>{t("settings.familyCircle")}</Text>
      <View style={styles.section}>
        {members.length === 0 ? (
          <View style={styles.emptyMembers}>
            <Text style={styles.emptyMembersText}>{t("settings.noFamilyMembers")}</Text>
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
                          <Text style={styles.youBadgeText}>{t("common.you")}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.memberRelation}>
                      {m.isMe ? t("settings.circleOwner") : m.relation}
                      {m.travelMode && m.travelDestination ? ` · ${t("settings.traveling")}` : ""}
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
                          t("settings.removeMember"),
                          t("settings.removeMemberMsg", { name: m.name }),
                          [
                            { text: t("common.cancel"), style: "cancel" },
                            {
                              text: t("common.remove"),
                              style: "destructive",
                              onPress: async () => {
                                if (Platform.OS !== "web") {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                }
                                try {
                                  await removeMember(m.id);
                                } catch {
                                  Alert.alert(t("common.error"), t("settings.failedRemoveMember"));
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
          Alert.alert(t("settings.signOutConfirmTitle"), t("settings.signOutConfirmMsg"), [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("settings.signOut"),
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
        <Text style={styles.signOutText}>{t("settings.signOut")}</Text>
      </Pressable>

      <Pressable
          style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.7 }]}
          onPress={handleShareOllia}
      >
        <Feather name="share" size={17} color={BRAND.primary} />
        <Text style={styles.shareBtnText}>{t("settings.shareOllia")}</Text>
      </Pressable>


      <Pressable
        style={({ pressed }) => [styles.deleteAccountBtn, pressed && { opacity: 0.7 }]}
        disabled={deleting}
        onPress={() => {
          Alert.alert(
            t("settings.deleteConfirmTitle"),
            t("settings.deleteConfirmMsg"),
            [
              { text: t("common.cancel"), style: "cancel" },
              {
                text: t("settings.deleteAccount"),
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
                    Alert.alert(t("common.error"), t("settings.failedDeleteAccount"));
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
          {deleting ? t("settings.deleting") : t("settings.deleteAccount")}
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

      {/* Language Picker Modal */}
      <Modal
        visible={showLanguagePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <Pressable style={langStyles.backdrop} onPress={() => setShowLanguagePicker(false)} />
        <View style={langStyles.sheet}>
          <View style={langStyles.handle} />
          <Text style={langStyles.title}>{t("settings.chooseLanguage")}</Text>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <Pressable
              key={lang.code}
              style={({ pressed }) => [
                langStyles.langRow,
                pressed && { opacity: 0.7 },
                lang.code === currentLanguage && langStyles.langRowSelected,
              ]}
              onPress={() => handleLanguageSelect(lang.code)}
            >
              <Text style={[langStyles.langLabel, lang.code === currentLanguage && langStyles.langLabelSelected]}>
                {lang.label}
              </Text>
              {lang.code === currentLanguage && (
                <Feather name="check" size={18} color={BRAND.primary} />
              )}
            </Pressable>
          ))}
          <Pressable
            style={({ pressed }) => [langStyles.cancelBtn, pressed && { opacity: 0.7 }]}
            onPress={() => setShowLanguagePicker(false)}
          >
            <Text style={langStyles.cancelText}>{t("common.cancel")}</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Shortcuts Setup Guide Modal */}
      <Modal
        visible={setupGuideApp !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSetupGuideApp(null)}
      >
        <Pressable style={guideStyles.backdrop} onPress={() => setSetupGuideApp(null)} />
        <View style={guideStyles.card}>
          <View style={guideStyles.iconRow}>
            <View style={guideStyles.iconCircle}>
              <Feather name="smartphone" size={22} color={BRAND.primary} />
            </View>
          </View>
          <Text style={guideStyles.title}>Set up Shortcuts</Text>
          <Text style={guideStyles.subtitle}>
            You're almost there! Follow these quick steps in the Shortcuts app:
          </Text>
          <View style={guideStyles.steps}>
            <View style={guideStyles.step}>
              <View style={guideStyles.stepNumber}>
                <Text style={guideStyles.stepNumberText}>1</Text>
              </View>
              <Text style={guideStyles.stepText}>
                Open <Text style={guideStyles.bold}>Shortcuts</Text> → tap <Text style={guideStyles.bold}>Automation</Text> at the bottom → tap <Text style={guideStyles.bold}>+</Text> top right
              </Text>
            </View>
            <View style={guideStyles.step}>
              <View style={guideStyles.stepNumber}>
                <Text style={guideStyles.stepNumberText}>2</Text>
              </View>
              <Text style={guideStyles.stepText}>
                Scroll down → tap <Text style={guideStyles.bold}>App</Text> → tap <Text style={guideStyles.bold}>Choose</Text> → select <Text style={guideStyles.bold}>{setupGuideApp}</Text> → tap <Text style={guideStyles.bold}>Done</Text> → make sure <Text style={guideStyles.bold}>Is Opened</Text> is selected → tap <Text style={guideStyles.bold}>Next</Text>
              </Text>
            </View>
            <View style={guideStyles.step}>
              <View style={guideStyles.stepNumber}>
                <Text style={guideStyles.stepNumberText}>3</Text>
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={guideStyles.stepText}>
                  Tap <Text style={guideStyles.bold}>New Blank Automation</Text> → search <Text style={guideStyles.bold}>Get contents of URL</Text> → tap it → paste your personal URL:
                </Text>
                {shortcutTokenLoading ? (
                  <Text style={guideStyles.urlPlaceholder}>Loading your URL...</Text>
                ) : shortcutToken ? (
                  <Pressable
                    style={({ pressed }) => [guideStyles.urlBox, pressed && { opacity: 0.7 }]}
                    onPress={async () => {
                      const url = `https://ollia-production.up.railway.app/api/activity/shortcut?token=${shortcutToken}`;
                      try {
                        await Clipboard.setStringAsync(url);
                      } catch {
                        try { await navigator.clipboard.writeText(url); } catch {}
                      }
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      Alert.alert("Copied!", "Your personal URL has been copied to the clipboard.");
                    }}
                  >
                    <Text style={guideStyles.urlText} numberOfLines={2}>
                      https://ollia-production.up.railway.app/api/activity/shortcut?token={shortcutToken}
                    </Text>
                    <Feather name="copy" size={14} color={BRAND.primary} />
                  </Pressable>
                ) : (
                  <Text style={guideStyles.urlPlaceholder}>Could not load your URL. Close and try again.</Text>
                )}
              </View>
            </View>
            <View style={guideStyles.step}>
              <View style={guideStyles.stepNumber}>
                <Text style={guideStyles.stepNumberText}>4</Text>
              </View>
              <Text style={guideStyles.stepText}>
                Turn off <Text style={guideStyles.bold}>Notify when run</Text> → tap <Text style={guideStyles.bold}>Done</Text> to save
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
                style={({ pressed }) => [guideStyles.openBtn, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  Linking.openURL("shortcuts://");
                  setSetupGuideApp(null);
                }}
            >
              <Text style={guideStyles.openBtnText}>Open Shortcuts</Text>
            </Pressable>
            <Pressable
                style={({ pressed }) => [guideStyles.gotItBtn, pressed && { opacity: 0.85 }]}
                onPress={() => setSetupGuideApp(null)}
            >
              <Text style={guideStyles.gotItText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.aboutCard}>
        <View style={styles.aboutLogo}>
          <Text style={styles.aboutLogoText}>Oll</Text>
          <Text style={[styles.aboutLogoText, { color: BRAND.primary }]}>ia</Text>
        </View>
        <Text style={styles.aboutTagline}>
          {t("settings.aboutTagline")}
        </Text>
        <Text style={styles.aboutVersion}>{t("common.version", { version: "2.0.0" })}</Text>
        <Pressable onPress={() => Linking.openURL('https://ollia.app/terms')}>
          <Text>{t("settings.termsOfService")}</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL('https://ollia.app/privacy')}>
          <Text>{t("settings.privacyPolicy")}</Text>
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
  explanationText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    lineHeight: 18,
  },
  appChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  setupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: `${BRAND.primary}10`,
    borderWidth: 1,
    borderColor: `${BRAND.primary}25`,
  },
  setupBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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

const permStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: 120,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
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
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    marginTop: 2,
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
    borderColor: "#92400E40",
    backgroundColor: "#92400E06",
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
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: `${BRAND.primary}30`,
    backgroundColor: `${BRAND.primary}08`,
  },
  shareBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
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

const langStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: BRAND.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: BRAND.borderLight,
    gap: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: BRAND.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
    textAlign: "center",
    marginBottom: 12,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  langRowSelected: {
    backgroundColor: `${BRAND.primary}10`,
  },
  langLabel: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: BRAND.text,
  },
  langLabelSelected: {
    fontFamily: "Inter_600SemiBold",
    color: BRAND.primary,
  },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: BRAND.backgroundCard,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: BRAND.textSecondary,
  },
});

const guideStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: BRAND.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: BRAND.borderLight,
  },
  iconRow: {
    alignItems: "center",
    marginBottom: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${BRAND.primary}12`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${BRAND.primary}30`,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  steps: {
    gap: 16,
    marginBottom: 24,
  },
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: `${BRAND.primary}12`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${BRAND.primary}30`,
    marginTop: 1,
  },
  stepNumberText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.primary,
  },
  stepText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.text,
    lineHeight: 20,
    flex: 1,
  },
  bold: {
    fontFamily: "Inter_600SemiBold",
  },
  urlBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${BRAND.primary}08`,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: `${BRAND.primary}20`,
  },
  urlText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
    flex: 1,
    lineHeight: 17,
  },
  urlPlaceholder: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    fontStyle: "italic",
  },
  openBtn: {
    flex: 1,
    backgroundColor: BRAND.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  openBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
  gotItBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
    backgroundColor: BRAND.backgroundCard,
  },
  gotItText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.textSecondary,
  },
});
