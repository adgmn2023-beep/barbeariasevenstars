import "server-only";
import webpush from "web-push";
import { privilegedDb } from "./supabase/server";
export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ([
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(url.hostname) ||
        url.hostname.endsWith(".push.apple.com") ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export async function sendPush(
  userIds: string[],
  payload: { title: string; body: string; url: string },
) {
  if (!userIds.length) return { failed: 0, sent: 0 };
  const db = privilegedDb();
  const { data, error } = await db
    .from("push_subscriptions")
    .select("*")
    .in("user_id", userIds);
  if (error) {
    console.error("Falha ao buscar assinaturas de push", { code: error.code });
    return { failed: 1, sent: 0 };
  }
  if (!data?.length) return { failed: 0, sent: 0 };
  if (
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !process.env.VAPID_SUBJECT
  ) {
    console.error("Push não enviado: chaves VAPID ausentes.");
    return { failed: data.length, sent: 0 };
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  let failed = 0,
    sent = 0;
  await Promise.all(
    data.map(async (subscription) => {
      try {
        if (!allowedPushEndpoint(subscription.endpoint))
          throw new Error("Destino não permitido.");
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          { TTL: 3600, timeout: 10000 },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        console.error("Falha no envio de push", {
          subscriptionId: subscription.id,
          status: status ?? "indisponível",
        });
        if (status === 404 || status === 410) {
          const { error } = await db
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id);
          if (error)
            console.error("Falha ao remover assinatura expirada", {
              code: error.code,
            });
        } else failed++;
      }
    }),
  );
  return { failed, sent };
}
