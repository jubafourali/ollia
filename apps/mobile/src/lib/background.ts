import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const HEARTBEAT_TASK = 'OLLIA_HEARTBEAT';

TaskManager.defineTask(HEARTBEAT_TASK, async () => {
  try {
    const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';
    // Background tasks can't access React hooks, so we use SecureStore directly
    const SecureStore = require('expo-secure-store');
    const token = await SecureStore.getItemAsync('clerk_session_token');

    if (!token) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const response = await fetch(`${API_URL}/api/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (response.ok) {
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.Failed;
  } catch (error) {
    console.error('Background heartbeat failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundHeartbeat() {
  try {
    await BackgroundFetch.registerTaskAsync(HEARTBEAT_TASK, {
      minimumInterval: 30 * 60, // 30 minutes
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log('Background heartbeat registered');
  } catch (error) {
    console.error('Failed to register background heartbeat:', error);
  }
}
