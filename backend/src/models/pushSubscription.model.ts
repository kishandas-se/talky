import db from '../config/database';

export interface PushSubscriptionRecord {
  id: number;
  username: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
  updated_at: string;
}

export class PushSubscriptionModel {
  static upsert(payload: {
    username: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }): void {
    db.prepare(
      `INSERT INTO push_subscriptions (username, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint)
       DO UPDATE SET
         username = excluded.username,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         updated_at = CURRENT_TIMESTAMP`
    ).run(payload.username, payload.endpoint, payload.p256dh, payload.auth);
  }

  static removeByEndpoint(endpoint: string): void {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  }

  static findByUsername(username: string): PushSubscriptionRecord[] {
    return db
      .prepare('SELECT * FROM push_subscriptions WHERE username = ? ORDER BY updated_at DESC')
      .all(username) as PushSubscriptionRecord[];
  }
}
