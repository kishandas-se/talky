import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DATABASE_PATH || './data/talky.db';
const dbDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Initialize schema
export function initializeDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Meeting rooms table
  db.exec(`
    CREATE TABLE IF NOT EXISTS meeting_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      is_permanent BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Messages table - Supports both authenticated and guest users.
  // SQLite stores dynamic types, so user_id can hold persistent UUID strings.
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      user_id INTEGER,
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      file_url TEXT,
      file_name TEXT,
      file_size INTEGER,
      file_type TEXT,
      status TEXT DEFAULT 'sent',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Message read receipts - Supports guest users and persistent UUID strings.
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_read_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      UNIQUE(message_id, user_id)
    )
  `);

  // Call history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS call_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id TEXT UNIQUE NOT NULL,
      room_id TEXT NOT NULL,
      initiator_id INTEGER NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      duration_seconds INTEGER,
      FOREIGN KEY (initiator_id) REFERENCES users(id)
    )
  `);

  // Direct call invitation tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS call_invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invitation_id TEXT UNIQUE NOT NULL,
      call_session_id TEXT NOT NULL,
      caller_name TEXT NOT NULL,
      callee_name TEXT NOT NULL,
      call_type TEXT NOT NULL DEFAULT 'audio',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      responded_at DATETIME
    )
  `);

  // Web push subscriptions keyed by endpoint
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_call_history_room_id ON call_history(room_id);
    CREATE INDEX IF NOT EXISTS idx_message_read_receipts_message_id ON message_read_receipts(message_id);
    CREATE INDEX IF NOT EXISTS idx_message_read_receipts_user_id ON message_read_receipts(user_id);
    CREATE INDEX IF NOT EXISTS idx_call_invitations_caller_name ON call_invitations(caller_name);
    CREATE INDEX IF NOT EXISTS idx_call_invitations_callee_name ON call_invitations(callee_name);
    CREATE INDEX IF NOT EXISTS idx_call_invitations_status ON call_invitations(status);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_username ON push_subscriptions(username);
  `);

  // Create default permanent meeting room
  const existingRoom = db.prepare('SELECT id FROM meeting_rooms WHERE room_id = ?').get('personal-room');
  
  if (!existingRoom) {
    // Create a default system user if not exists
    const systemUser = db.prepare('SELECT id FROM users WHERE username = ?').get('system');
    let systemUserId = systemUser ? (systemUser as any).id : null;

    if (!systemUserId) {
      const result = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(
        'system',
        'system@talky.local',
        'no-password-system-user'
      );
      systemUserId = result.lastInsertRowid;
    }

    db.prepare('INSERT INTO meeting_rooms (room_id, name, created_by, is_permanent) VALUES (?, ?, ?, ?)').run(
      'personal-room',
      'Personal Meeting Room',
      systemUserId,
      1
    );

    console.log('✅ Created default permanent meeting room: personal-room');
  }

  console.log('✅ Database initialized successfully');
}

// Run initialization if this file is executed directly
if (require.main === module) {
  initializeDatabase();
}

export default db;
