// Expo Push Notifications — free, no card needed, works with React Native
export async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: expoPushToken,
        title,
        body,
        data: data ?? {},
        sound: "default",
        priority: "high",
      }),
    });
  } catch (error) {
    // Never crash the app over a failed notification
    console.error("❌ Expo push notification failed:", error);
  }
}
