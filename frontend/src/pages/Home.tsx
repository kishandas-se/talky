import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { VideoCameraIcon, PhoneIcon, UserGroupIcon, ChatBubbleLeftRightIcon, PlusIcon, SignalIcon, LanguageIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { initializeSocket } from '../services/socket';
import { useDirectCallStore, OnlineUser } from '../stores/directCallStore';
import { useLanguageStore } from '../stores/languageStore';
import { translations } from '../i18n/translations';
import NameEntryModal from '../components/NameEntryModal';
import UserDropdown from '../components/UserDropdown';
import InstallPrompt from '../components/InstallPrompt';
import { getOrCreateUserId, normalizeUserId } from '../utils/userIdentity';
import { getAppUrl } from '../utils/urlHelpers';

export default function Home() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showDirectCallModal, setShowDirectCallModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [suggestedName, setSuggestedName] = useState<string>('');
  const [callType, setCallType] = useState<'video' | 'audio'>('video');
  const [joinLink, setJoinLink] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<OnlineUser | null>(null);
  
  const { 
    setOutgoing, 
    currentUsername, 
    currentUserId, 
    onlineUsers,
  } = useDirectCallStore((state) => ({
    setOutgoing: state.setOutgoing,
    currentUsername: state.currentUsername,
    currentUserId: state.currentUserId,
    onlineUsers: state.onlineUsers,
  }));

  const { language, toggleLanguage } = useLanguageStore();
  const t = translations[language];

  // Get available users (excluding current user)
  // Use strict comparison and ensure both values exist to avoid type mismatches
  const availableUsers = onlineUsers.filter(user => {
    if (!currentUserId) return true; // Show all if currentUserId not set yet
    return normalizeUserId(user.userId) !== normalizeUserId(currentUserId);
  });
  
  // Debug logging to track filtering
  useEffect(() => {
    if (currentUserId && onlineUsers.length > 0) {
      console.log(`🔍 Filtering users: currentUserId=${currentUserId} (${typeof currentUserId}), onlineUsers=${onlineUsers.length}, available=${availableUsers.length}`);
      console.log('Online users:', onlineUsers.map(u => ({ name: u.username, id: u.userId, type: typeof u.userId })));
    }
  }, [onlineUsers, currentUserId, availableUsers.length]);

  // Check if user has registered on mount
  useEffect(() => {
    // Check sessionStorage first (tab-specific), then localStorage (persistent)
    const sessionUsername = sessionStorage.getItem('talky_username');
    const storedUsername = localStorage.getItem('talky_username');
    
    // Validate that stored username is not a number (userId stored by mistake)
    if (sessionUsername && /^\d+$/.test(sessionUsername)) {
      console.warn('⚠️ Invalid username detected in session (numeric ID). Clearing...');
      sessionStorage.removeItem('talky_username');
    }
    if (storedUsername && /^\d+$/.test(storedUsername)) {
      console.warn('⚠️ Invalid username detected in storage (numeric ID). Clearing...');
      localStorage.removeItem('talky_username');
    }
    
    // Priority: sessionStorage > currentUsername > localStorage
    // This ensures each new tab/window asks for name unless already set in this session
    const activeUsername = sessionUsername || currentUsername;
    
    // If no username in current session, show modal (new tab/window)
    if (!activeUsername) {
      // If there's a stored username from previous sessions, suggest it but still show modal
      if (storedUsername && !/^\d+$/.test(storedUsername)) {
        console.log('📝 Found previous username, suggesting it in modal');
        setSuggestedName(storedUsername);
      }
      setShowNameModal(true);
      return;
    }
    
    // If username exists in session but not in store, re-register
    if (activeUsername && !currentUsername) {
      const socket = initializeSocket();
      socket.emit('direct:register', {
        username: activeUsername,
        clientUserId: getOrCreateUserId(),
      });
    }
  }, [currentUsername]);

  // Handle name submission from modal
  const handleNameSubmit = useCallback((name: string) => {
    const socket = initializeSocket();
    
    // Store in sessionStorage first (this tab/window only)
    sessionStorage.setItem('talky_username', name);
    sessionStorage.setItem('guestName', name);
    
    // Also store in localStorage for convenience (will be suggested in future sessions)
    localStorage.setItem('talky_username', name);
    
    // Register with backend
    socket.emit('direct:register', {
      username: name,
      clientUserId: getOrCreateUserId(),
    });
    
    setShowNameModal(false);
    toast.success(`👋 ${t.welcome}, ${name}!`);
  }, [t]);

  const handleCreateCall = useCallback(() => {
    if (!currentUsername) {
      toast.error(t.pleaseWaitForRegistration);
      return;
    }

    // Generate call ID
    const callId = crypto.randomUUID().split('-')[0];
    const callLink = getAppUrl(`/call/${callId}`);
    
    // Store user info
    sessionStorage.setItem('guestName', currentUsername);
    sessionStorage.setItem('callType', callType);
    
    // Copy link to clipboard
    navigator.clipboard.writeText(callLink);
    toast.success(`📋 ${t.callLinkCopied}`);
    
    // Navigate to call
    navigate(`/call/${callId}`);
  }, [currentUsername, callType, navigate, t]);

  const handleJoinCall = useCallback(() => {
    if (!currentUsername) {
      toast.error(t.pleaseWaitForRegistration);
      return;
    }
    
    if (!joinLink.trim()) {
      toast.error(t.pleaseEnterCallLink);
      return;
    }

    // Extract call ID from link
    const id = joinLink.includes('/call/') 
      ? joinLink.split('/call/').pop()
      : joinLink;
    
    if (id) {
      sessionStorage.setItem('guestName', currentUsername);
      sessionStorage.setItem('callType', callType);
      navigate(`/call/${id}`);
    } else {
      toast.error(t.invalidCallLink);
    }
  }, [currentUsername, joinLink, callType, navigate, t]);

  const handleDirectCall = useCallback(() => {
    if (!currentUsername) {
      toast.error(t.pleaseWaitForRegistration);
      return;
    }

    if (!selectedRecipient) {
      toast.error(t.pleaseSelectRecipient);
      return;
    }

    sessionStorage.setItem('guestName', currentUsername);
    sessionStorage.setItem('callType', 'audio');

    const socket = initializeSocket();

    setOutgoing({
      callerName: currentUsername,
      calleeName: selectedRecipient.username,
      callType: 'audio',
    });

    socket.emit('call:initiate', {
      targetName: selectedRecipient.username,
      callerName: currentUsername,
      callType: 'audio',
    });

    setShowDirectCallModal(false);
    setSelectedRecipient(null);
    toast(`📞 ${t.callingUser} ${selectedRecipient.username}...`, { icon: '📞' });
  }, [currentUsername, selectedRecipient, setOutgoing, t]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
      <header className="bg-white/90 backdrop-blur-md border-b border-purple-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">{t.appName}</h1>
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
              title={t.toggleLanguage}
            >
              <LanguageIcon className="h-4 w-4" />
              <span>{language === 'en' ? 'বাং' : 'EN'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-10">
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-3">
            {t.connectInstantly}
          </h2>
          <p className="text-sm sm:text-base text-gray-700">
            {t.homeTagline}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-2xl mx-auto">
          {/* Create Call */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="group bg-white/90 hover:bg-white border-2 border-purple-200 hover:border-purple-400 rounded-2xl p-4 sm:p-6 transition-all duration-200 hover:shadow-xl transform hover:scale-105 active:scale-95"
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-3 bg-gradient-to-br from-purple-100 to-indigo-100 group-hover:from-purple-200 group-hover:to-indigo-200 rounded-xl transition-all shadow-sm">
                <PlusIcon className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900">{t.createCall}</h3>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{t.newVideoCall}</p>
              </div>
            </div>
          </button>

          {/* Join Call */}
          <button
            onClick={() => setShowJoinModal(true)}
            className="group bg-white/90 hover:bg-white border-2 border-blue-200 hover:border-blue-400 rounded-2xl p-4 sm:p-6 transition-all duration-200 hover:shadow-xl transform hover:scale-105 active:scale-95"
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-3 bg-gradient-to-br from-blue-100 to-cyan-100 group-hover:from-blue-200 group-hover:to-cyan-200 rounded-xl transition-all shadow-sm">
                <PhoneIcon className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900">{t.joinCall}</h3>
                <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5">{t.joinWithLink}</p>
              </div>
            </div>
          </button>

          {/* Join Meeting */}
          <button
            onClick={() => navigate('/meeting')}
            className="group bg-white/90 hover:bg-white border-2 border-emerald-200 hover:border-emerald-400 rounded-2xl p-4 sm:p-6 transition-all duration-200 hover:shadow-xl transform hover:scale-105 active:scale-95"
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-3 bg-gradient-to-br from-emerald-100 to-teal-100 group-hover:from-emerald-200 group-hover:to-teal-200 rounded-xl transition-all shadow-sm">
                <UserGroupIcon className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900">{t.joinMeeting}</h3>
                <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5">{t.multiPartyMeeting}</p>
              </div>
            </div>
          </button>

          {/* Chat */}
          <button
            onClick={() => navigate('/chat')}
            className="group bg-white/90 hover:bg-white border-2 border-pink-200 hover:border-pink-400 rounded-2xl p-4 sm:p-6 transition-all duration-200 hover:shadow-xl transform hover:scale-105 active:scale-95"
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-3 bg-gradient-to-br from-pink-100 to-rose-100 group-hover:from-pink-200 group-hover:to-rose-200 rounded-xl transition-all shadow-sm">
                <ChatBubbleLeftRightIcon className="h-5 w-5 sm:h-6 sm:w-6 text-pink-600" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900">{t.openChat}</h3>
                <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5">{t.defaultChatRoom}</p>
              </div>
            </div>
          </button>

          {/* Direct Call */}
          <button
            onClick={() => setShowDirectCallModal(true)}
            className="group bg-gradient-to-br from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 border-2 border-purple-300 hover:border-purple-400 rounded-2xl p-4 sm:p-6 transition-all duration-200 hover:shadow-xl transform hover:scale-105 active:scale-95 col-span-2"
          >
            <div className="flex items-center justify-center gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-200 to-pink-200 group-hover:from-purple-300 group-hover:to-pink-300 rounded-xl transition-all shadow-md">
                <SignalIcon className="h-6 w-6 sm:h-7 sm:w-7 text-purple-700" />
              </div>
              <div className="text-left">
                <h3 className="text-sm sm:text-base font-bold text-gray-900">{t.directCall}</h3>
                <p className="text-[10px] sm:text-xs text-gray-700 mt-0.5">{t.directCallDesc}</p>
              </div>
            </div>
          </button>
        </div>
      </main>

      {/* Create Call Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4 sm:p-5 shadow-2xl">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">{t.createCall}</h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">{t.yourName}</label>
                <div className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-gray-50 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                    {currentUsername?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <span className="font-medium text-gray-900">{currentUsername || t.notRegistered}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">{t.callType}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setCallType('video')}
                    className={`p-3 rounded-lg border transition-all ${
                      callType === 'video'
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <VideoCameraIcon className={`h-5 w-5 mx-auto mb-1 ${callType === 'video' ? 'text-purple-600' : 'text-gray-600'}`} />
                    <div className={`text-xs font-medium ${callType === 'video' ? 'text-purple-600' : 'text-gray-700'}`}>
                      {t.video}
                    </div>
                  </button>
                  <button
                    onClick={() => setCallType('audio')}
                    className={`p-3 rounded-lg border transition-all ${
                      callType === 'audio'
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <PhoneIcon className={`h-5 w-5 mx-auto mb-1 ${callType === 'audio' ? 'text-purple-600' : 'text-gray-600'}`} />
                    <div className={`text-xs font-medium ${callType === 'audio' ? 'text-purple-600' : 'text-gray-700'}`}>
                      {t.audio}
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleCreateCall}
                  className="flex-1 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition"
                >
                  {t.create}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Join Call Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4 sm:p-5 shadow-2xl">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">{t.joinCall}</h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">{t.yourName}</label>
                <div className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-gray-50 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                    {currentUsername?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <span className="font-medium text-gray-900">{currentUsername || t.notRegistered}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">{t.callLinkOrId}</label>
                <input
                  type="text"
                  value={joinLink}
                  onChange={(e) => setJoinLink(e.target.value)}
                  placeholder={t.pasteCallLink}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleJoinCall}
                  className="flex-1 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition"
                >
                  {t.join}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Name Entry Modal (First Time) */}
      {showNameModal && <NameEntryModal onSubmit={handleNameSubmit} suggestedName={suggestedName} />}

      {/* Direct Call Modal */}
      {showDirectCallModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4 sm:p-5 shadow-2xl">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">{t.directCall}</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  {t.yourName}
                </label>
                <div className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-gray-50 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                    {currentUsername?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <span className="font-medium text-gray-900">{currentUsername || t.notRegistered}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  {t.selectRecipient}
                  {availableUsers.length > 0 && (
                    <span className="text-green-600 ml-1">({availableUsers.length} {t.online})</span>
                  )}
                </label>
                <UserDropdown
                  users={availableUsers}
                  selectedUser={selectedRecipient}
                  onSelect={setSelectedRecipient}
                  disabled={availableUsers.length === 0}
                />
                {availableUsers.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    ⚠️ {t.noUsersOnline}
                  </p>
                )}
              </div>

              <div className="text-xs text-gray-500 rounded-lg bg-purple-50 border border-purple-100 px-3 py-2">
                <p className="font-medium text-purple-900 mb-1">📞 {t.audioFirstMode}</p>
                <p>{t.audioFirstDesc}</p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setShowDirectCallModal(false);
                    setSelectedRecipient(null);
                  }}
                  className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleDirectCall}
                  className="flex-1 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!selectedRecipient || availableUsers.length === 0}
                >
                  {t.callNow}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PWA Install Prompt */}
      <InstallPrompt />
    </div>
  );
}
