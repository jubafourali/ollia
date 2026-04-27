import AsyncStorage from '@react-native-async-storage/async-storage';

let StoreReview: any = null;
try {
    StoreReview = require('expo-store-review');
} catch (e) {
    console.error("Store reviewed not available", e);
}

const REVIEW_KEYS = {
    promptCount: 'ollia_prompt_count',
    installDate: 'ollia_install_date',
};

const MAX_PROMPTS = 2;

export const initInstallDate = async () => {
    const existing = await AsyncStorage.getItem(REVIEW_KEYS.installDate);
    if (!existing) {
        await AsyncStorage.setItem(REVIEW_KEYS.installDate, Date.now().toString());
    }
};

export const triggerReviewIfEligible = async () => {
    const count = parseInt(await AsyncStorage.getItem(REVIEW_KEYS.promptCount) ?? '0');
    if (count >= MAX_PROMPTS) return;

    if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
        await AsyncStorage.setItem(REVIEW_KEYS.promptCount, (count + 1).toString());
    }
};

export const triggerReviewAfterFirstMember = async () => {
    const count = parseInt(await AsyncStorage.getItem(REVIEW_KEYS.promptCount) ?? '0');
    if (count > 0) return; // already prompted before
    await triggerReviewIfEligible();
};

export const triggerReviewAfter7Days = async () => {
    const count = parseInt(await AsyncStorage.getItem(REVIEW_KEYS.promptCount) ?? '0');
    if (count >= MAX_PROMPTS) return; // already used both attempts
    if (count === 0) return; // first prompt hasn't fired yet, wait for it

    const installDate = await AsyncStorage.getItem(REVIEW_KEYS.installDate);
    if (!installDate) return;

    const daysSinceInstall = (Date.now() - parseInt(installDate)) / (1000 * 60 * 60 * 24);
    if (daysSinceInstall >= 7) {
        await triggerReviewIfEligible();
    }
};