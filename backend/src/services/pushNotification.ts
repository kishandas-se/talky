import { PushSubscriptionModel } from '../models/pushSubscription.model';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidEmail = process.env.VAPID_SUBJECT || 'mailto:talky@local.dev';

let configured = false;
let webpushClient: any = null;

function ensureConfigured(): boolean {
  if (configured) return true;

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('⚠️ VAPID keys not configured. Push notifications are disabled.');
    return false;
  }

  if (!webpushClient) {
    try {
      // Optional runtime dependency to keep development unblocked until package install.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      webpushClient = require('web-push');
    } catch (_error) {
      console.warn('⚠️ web-push package is not installed. Push notifications are disabled.');
      return false;
    }
  }

  webpushClient.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
  configured = true;
  return true;
}

export function getPublicVapidKey(): string | null {
  return vapidPublicKey || null;
}

export async function sendIncomingCallPush(params: {
  calleeName: string;
  callerName: string;
  invitationId: string;
  callSessionId: string;
  callType: 'audio' | 'video';
}): Promise<void> {
  if (!ensureConfigured()) return;

  const subscriptions = PushSubscriptionModel.findByUsername(params.calleeName);
  if (!subscriptions.length) return;

  const payload = JSON.stringify({
    type: 'incoming_call',
    title: `Incoming ${params.callType} call`,
    body: `${params.callerName} is calling you`,
    invitationId: params.invitationId,
    callSessionId: params.callSessionId,
    callerName: params.callerName,
    callType: params.callType,
  });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpushClient.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
      } catch (error: any) {
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          PushSubscriptionModel.removeByEndpoint(sub.endpoint);
        }
      }
    })
  );
}
