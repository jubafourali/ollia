import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from 'expo-localization';

import en from "../locales/en.json";
import fr from "../locales/fr.json";

export const LANGUAGE_STORAGE_KEY = "@ollia_language";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export function mapLocaleToSupported(locale: string): LanguageCode {
  const lower = locale.toLowerCase();
  if (lower.startsWith("fr")) return "fr";
  return "en";
}

const deviceLocale = Localization.getLocales()[0]?.languageTag ?? "en";
const detectedLang = mapLocaleToSupported(deviceLocale);

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