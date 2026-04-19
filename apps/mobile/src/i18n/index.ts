import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { NativeModules, Platform } from "react-native";

import en from "../locales/en.json";
import fr from "../locales/fr.json";

export const LANGUAGE_STORAGE_KEY = "@ollia_language";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/** Map a raw device locale code to one of our supported languages. */
export function mapLocaleToSupported(locale: string): LanguageCode {
  const lower = locale.toLowerCase();
  if (lower.startsWith("fr")) return "fr";
  return "en";
}

// Detect device locale
const deviceLocale =
    Platform.OS === "ios"
        ? NativeModules.SettingsManager?.settings?.AppleLocale ||
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        : NativeModules.I18nManager?.localeIdentifier;

const detectedLang = mapLocaleToSupported(deviceLocale ?? "en");

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: detectedLang,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;