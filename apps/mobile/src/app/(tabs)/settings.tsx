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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";
import { CityPicker } from "@/components/CityPicker";
import { api } from "@/utils/api";

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

function SettingRow({ icon, iconLib = "feather", label, value, onToggle, subtitle, onPress, chevron, danger }: SettingRowProps) {
  const IconComp = iconLib === "ionicons" ? Ionicons : Feather;
  const color = danger ? "#EF4444" : BRAND.primary;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress && { opacity: 0.7 }]}
      onPress={onPress}
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
            color={isPremium ? "#7C3AED" : BRAND.primary}
          />
          <Text style={[styles.planBadgeText, isPremium && { color: "#7C3AED" }]}>
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
          >
            <Feather name="star" size={15} color={BRAND.white} />
            <Text style={styles.upgradeBtnText}>Upgrade to Premium — $5/mo</Text>
          </Pressable>
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

  const [editName, setEditName] = useState(myProfile?.name ?? "");
  const [editCity, setEditCity] = useState(myProfile?.region ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [notifActivity, setNotifActivity] = useState(true);
  const [notifInactivity, setNotifInactivity] = useState(true);
  const [shareRegion, setShareRegion] = useState(true);

  useEffect(() => {
    setEditName(myProfile?.name ?? "");
    setEditCity(myProfile?.region ?? "");
  }, [myProfile]);

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

  const handleUpgrade = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (Platform.OS === "web") {
      upgradePlan();
      return;
    }
    Alert.alert(
      "Upgrade to Premium",
      "Unlock unlimited family members, travel mode, disaster alerts, and more for $5/month.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Upgrade",
          onPress: () => upgradePlan(),
        },
      ]
    );
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
          onToggle={setNotifActivity}
        />
        <View style={styles.divider} />
        <SettingRow
          icon="alert-triangle"
          label="Inactivity alerts"
          subtitle="Notify if someone goes quiet"
          value={notifInactivity}
          onToggle={setNotifInactivity}
        />
      </View>

      <Text style={styles.sectionTitle}>Privacy</Text>
      <View style={styles.section}>
        <SettingRow
          icon="map-pin"
          label="Share my region"
          subtitle="Show city-level location only"
          value={shareRegion}
          onToggle={setShareRegion}
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

      <View style={styles.aboutCard}>
        <View style={styles.aboutLogo}>
          <Text style={styles.aboutLogoText}>Oll</Text>
          <Text style={[styles.aboutLogoText, { color: BRAND.primary }]}>ia</Text>
        </View>
        <Text style={styles.aboutTagline}>
          A quiet signal that lets your family know you're okay.
        </Text>
        <Text style={styles.aboutVersion}>Version 2.0.0</Text>
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
    backgroundColor: "#7C3AED",
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 4,
  },
  upgradeBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
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
