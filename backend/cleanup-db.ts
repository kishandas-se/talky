/**
 * Database cleanup script
 * Removes all existing data to start fresh with new user registration system
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'data', 'talky.db');
const db = new Database(dbPath);

console.log('🧹 Starting database cleanup...\n');

try {
  // Get counts before cleanup (with proper error handling)
  const getTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
  const tableNames = getTables.map(t => t.name);
  
  console.log('📊 Current database tables:');
  tableNames.forEach(name => console.log(`   - ${name}`));
  console.log('');

  let userCount = { count: 0 };
  let messageCount = { count: 0 };
  let callInviteCount = { count: 0 };
  let pushSubCount = { count: 0 };

  if (tableNames.includes('users')) {
    userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  }
  if (tableNames.includes('messages')) {
    messageCount = db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
  }
  if (tableNames.includes('call_invitations')) {
    callInviteCount = db.prepare('SELECT COUNT(*) as count FROM call_invitations').get() as { count: number };
  }
  if (tableNames.includes('push_subscriptions')) {
    pushSubCount = db.prepare('SELECT COUNT(*) as count FROM push_subscriptions').get() as { count: number };
  }

  console.log('📊 Current database state:');
  console.log(`   Users: ${userCount.count}`);
  console.log(`   Messages: ${messageCount.count}`);
  console.log(`   Call Invitations: ${callInviteCount.count}`);
  console.log(`   Push Subscriptions: ${pushSubCount.count}\n`);

  // Clean up all tables
  console.log('🗑️  Deleting all records...');
  
  if (tableNames.includes('messages')) {
    db.prepare('DELETE FROM messages').run();
    console.log('   ✅ Cleared messages');
  }
  
  if (tableNames.includes('message_read_receipts')) {
    db.prepare('DELETE FROM message_read_receipts').run();
    console.log('   ✅ Cleared message read receipts');
  }
  
  if (tableNames.includes('call_invitations')) {
    db.prepare('DELETE FROM call_invitations').run();
    console.log('   ✅ Cleared call invitations');
  }
  
  if (tableNames.includes('call_history')) {
    db.prepare('DELETE FROM call_history').run();
    console.log('   ✅ Cleared call history');
  }
  
  if (tableNames.includes('push_subscriptions')) {
    db.prepare('DELETE FROM push_subscriptions').run();
    console.log('   ✅ Cleared push subscriptions');
  }
  
  if (tableNames.includes('meeting_rooms')) {
    db.prepare('DELETE FROM meeting_rooms').run();
    console.log('   ✅ Cleared meeting rooms');
  }
  
  if (tableNames.includes('users')) {
    db.prepare('DELETE FROM users').run();
    console.log('   ✅ Cleared users');
  }

  // Reset auto-increment counters
  if (tableNames.includes('sqlite_sequence')) {
    db.prepare('DELETE FROM sqlite_sequence').run();
    console.log('   ✅ Reset auto-increment counters\n');
  }

  console.log('✨ Database cleanup complete!\n');
  console.log('🎉 Ready to start fresh with new user registration system\n');

} catch (error) {
  console.error('❌ Error during cleanup:', error);
  process.exit(1);
} finally {
  db.close();
}
