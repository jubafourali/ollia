---
name: i18n multi-language support
description: Multi-language support added using i18next + react-i18next + expo-localization. Four languages: en, fr, ar, bs. RTL for Arabic.
type: project
---

Multi-language support implemented across the entire mobile app.

**Why:** User requirement to support English, French, Arabic, and Bosnian with auto-detection from device locale.

**How to apply:** When adding new user-facing strings, always use `t('namespace.key')` from `useTranslation()`. Add the key to all 4 locale files at `apps/mobile/src/locales/{en,fr,ar,bs}.json`. Arabic is RTL — handled automatically via `I18nManager.forceRTL` on language switch (requires app restart).

Key files:
- `src/locales/` — 4 JSON files (329 lines each, all keys present in all languages)
- `src/i18n/index.ts` — i18next config, exports `LANGUAGE_STORAGE_KEY`, `SUPPORTED_LANGUAGES`, `mapLocaleToSupported`
- `src/app/_layout.tsx` — initializes language from AsyncStorage / device locale on startup, applies RTL
- `src/app/(tabs)/settings.tsx` — Language picker modal under My Profile section

Backend:
- `V14__add_preferred_language.sql` — adds `preferred_language VARCHAR(10) DEFAULT 'en'` to users table
- `entity/User.kt` — `preferredLanguage: String = "en"` field
- `controller/ReferenceApiController.kt` — `PATCH /api/users/me/language` endpoint
- `scheduler/EscalationScheduler.kt` — push notifications sent in recipient's preferred language via `PushMessages` object with L1/L2/L3 strings in all 4 languages