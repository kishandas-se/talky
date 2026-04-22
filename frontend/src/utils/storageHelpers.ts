/**
 * Clear all Talky-related storage data
 * This is useful for debugging or starting fresh
 */
export function clearAllTalkyStorage(): void {
  // Clear localStorage items
  const localStorageKeys = [
    'talky_username',
    'talky_guestId',
    'talky-direct-call',
    'talky-language',
  ];

  localStorageKeys.forEach((key) => {
    localStorage.removeItem(key);
  });

  // Clear all sessionStorage
  sessionStorage.clear();

  console.log('✅ All Talky storage cleared');
}

/**
 * Get current storage state for debugging
 */
export function debugStorage(): void {
  console.group('🔍 Talky Storage Debug');
  
  console.log('localStorage:');
  console.log('  talky_username:', localStorage.getItem('talky_username'));
  console.log('  talky_guestId:', localStorage.getItem('talky_guestId'));
  console.log('  talky-direct-call:', localStorage.getItem('talky-direct-call'));
  console.log('  talky-language:', localStorage.getItem('talky-language'));
  
  console.log('\nsessionStorage:');
  console.log('  guestName:', sessionStorage.getItem('guestName'));
  console.log('  guestId:', sessionStorage.getItem('guestId'));
  console.log('  callType:', sessionStorage.getItem('callType'));
  console.log('  directCallPeer:', sessionStorage.getItem('directCallPeer'));
  
  console.groupEnd();
}

// Expose to window for easy console access
if (typeof window !== 'undefined') {
  (window as any).clearTalkyStorage = clearAllTalkyStorage;
  (window as any).debugTalkyStorage = debugStorage;
}
