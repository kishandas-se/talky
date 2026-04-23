import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  CheckIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';
import { CheckIcon as CheckSolidIcon, LanguageIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { initializeSocket, getSocket } from '../services/socket';
import { Message } from '../types';
import { useDirectCallStore } from '../stores/directCallStore';
import { useLanguageStore } from '../stores/languageStore';
import { translations } from '../i18n/translations';
import { translateEnglishToBengali } from '../services/translator';
import { appendUniqueMessage, dedupeMessages } from '../utils/chatMessages';
import { getOrCreateUserId, normalizeUserId } from '../utils/userIdentity';

// Default chat room for everyone
const DEFAULT_ROOM_ID = 'talky-general';
const DEFAULT_ROOM_NAME = 'Talky Chat';

export default function Chat() {
  const navigate = useNavigate();
  const { currentUsername } = useDirectCallStore();
  const { language } = useLanguageStore();
  const t = translations[language];
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingMessages, setPendingMessages] = useState<Array<{ content: string; timestamp: number }>>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Use registered username from global store
  const guestName = currentUsername || t.guest;
  
  const [guestId] = useState(() => {
    const existingId = getOrCreateUserId();
    console.log('📌 Using persistent guestId:', existingId);
    return existingId;
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Monitor online/offline status for rural network resilience
  useEffect(() => {
    const handleOnline = () => {
      console.log('🟢 Back online - flushing queued messages');
      setIsOnline(true);
      toast.success(t.connectionRestored);
      
      // Send all pending messages
      if (pendingMessages.length > 0) {
        const socket = getSocket();
        if (socket && socket.connected) {
          pendingMessages.forEach((msg) => {
            socket.emit('chat:message', {
              roomId: DEFAULT_ROOM_ID,
              userId: guestId,
              username: guestName,
              content: msg.content
            });
          });
          toast.success(`${t.sentQueuedMessages} ${pendingMessages.length} ${t.queuedMessages}`);
          setPendingMessages([]);
        }
      }
    };

    const handleOffline = () => {
      console.log('🔴 Offline - messages will be queued');
      setIsOnline(false);
      toast.error(t.noInternetConnection, { duration: 5000 });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [pendingMessages, guestId, guestName]);

  // Auto-join the default room
  useEffect(() => {
    console.log('👤 Joining default chat room - Name:', guestName, 'ID:', guestId);

    const socket = initializeSocket();
    
    socket.emit('chat:join', {
      roomId: DEFAULT_ROOM_ID,
      userId: guestId,
      username: guestName
    });

    const handleHistory = ({ messages: loadedMessages }: any) => {
      console.log('========================================');
      console.log('📜 Loading message history:', loadedMessages.length, 'messages');
      console.log('👤 CURRENT USER - guestId:', guestId, '(type:', typeof guestId, '), guestName:', `"${guestName}"`);
      console.log('========================================');
      
      const formattedMessages = loadedMessages.map((msg: any) => {
        // Normalize username for comparison (trim whitespace, case-insensitive)
        const normalizedMsgUsername = (msg.username || '').trim().toLowerCase();
        const normalizedGuestName = (guestName || '').trim().toLowerCase();
        
        // Primary check: username match (more reliable, case-insensitive)
        const usernameMatches = normalizedMsgUsername === normalizedGuestName;
        
        // Secondary check: userId match with type coercion
        const msgUserId = normalizeUserId(msg.user_id);
        const currentUserId = normalizeUserId(guestId);
        const userIdMatches = msgUserId !== '' && msgUserId === currentUserId;
        
        // A message is "own" if either username or userId matches
        const isOwn = usernameMatches || userIdMatches;
        
        console.log(`\n📝 Message ${msg.id}: "${msg.content?.substring(0, 30)}..."`);
        console.log(`   FROM: "${msg.username}" (user_id: ${msg.user_id}, type: ${typeof msg.user_id})`);
        console.log(`   Username comparison: "${normalizedMsgUsername}" vs "${normalizedGuestName}" = ${usernameMatches ? '✅ MATCH' : '❌ NO MATCH'}`);
        console.log(`   UserId comparison: ${msgUserId} vs ${currentUserId} = ${userIdMatches ? '✅ MATCH' : '❌ NO MATCH'}`);
        console.log(`   ➡️ isOwn: ${isOwn ? '✅ YES (right-aligned)' : '❌ NO (left-aligned)'}`);
        
        return {
          id: msg.id,
          roomId: msg.room_id,
          userId: msg.user_id,
          username: msg.username,
          content: msg.content,
          messageType: msg.message_type || 'text',
          fileUrl: msg.file_url,
          fileName: msg.file_name,
          fileSize: msg.file_size,
          fileType: msg.file_type,
          status: msg.status || 'sent',
          createdAt: msg.created_at,
          readBy: msg.read_by || [],
          isOwn
        };
      });
      setMessages(dedupeMessages(formattedMessages));
    };

    const handleMessage = (message: any) => {
      console.log('\n========================================');
      console.log('📨 NEW MESSAGE RECEIVED');
      console.log('========================================');
      
      // Normalize username for comparison (trim whitespace, case-insensitive)
      const normalizedMsgUsername = (message.username || '').trim().toLowerCase();
      const normalizedGuestName = (guestName || '').trim().toLowerCase();
      
      // Primary check: username match (more reliable, case-insensitive)
      const usernameMatches = normalizedMsgUsername === normalizedGuestName;
      
      // Secondary check: userId match with type coercion
      const msgUserId = normalizeUserId(message.userId);
      const currentUserId = normalizeUserId(guestId);
      const userIdMatches = msgUserId !== '' && msgUserId === currentUserId;
      
      // A message is "own" if either username or userId matches
      const isOwn = usernameMatches || userIdMatches;
      
      console.log(`📝 Message content: "${message.content}"`);
      console.log(`👤 FROM: "${message.username}" (userId: ${message.userId}, type: ${typeof message.userId})`);
      console.log(`👤 CURRENT USER: "${guestName}" (guestId: ${guestId}, type: ${typeof guestId})`);
      console.log(`\n🔍 COMPARISON RESULTS:`);
      console.log(`   Username: "${normalizedMsgUsername}" vs "${normalizedGuestName}" = ${usernameMatches ? '✅ MATCH' : '❌ NO MATCH'}`);
      console.log(`   UserId: ${msgUserId} (${typeof msgUserId}) vs ${currentUserId} (${typeof currentUserId}) = ${userIdMatches ? '✅ MATCH' : '❌ NO MATCH'}`);
      console.log(`\n➡️ FINAL RESULT: isOwn = ${isOwn ? '✅ YES (right-aligned)' : '❌ NO (left-aligned)'}`);
      console.log('========================================\n');
      
      const newMsg: Message = {
        id: message.id || Date.now(),
        roomId: message.roomId,
        userId: message.userId,
        username: message.username,
        content: message.content,
        messageType: message.messageType || 'text',
        fileUrl: message.fileUrl,
        fileName: message.fileName,
        fileSize: message.fileSize,
        fileType: message.fileType,
        status: message.status || 'sent',
        createdAt: message.createdAt,
        readBy: message.readBy || [],
        isOwn
      };
      setMessages(prev => appendUniqueMessage(prev, newMsg));
    };

    const handleStatus = ({ messageId, status }: any) => {
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, status } : msg
      ));
    };

    socket.on('chat:history', handleHistory);
    socket.on('chat:message', handleMessage);
    socket.on('chat:status', handleStatus);

    // Cleanup function to remove listeners
    return () => {
      socket.off('chat:history', handleHistory);
      socket.off('chat:message', handleMessage);
      socket.off('chat:status', handleStatus);
    };
  }, [guestId, guestName, currentUsername]);

  const sendMessage = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    const socket = getSocket();
    
    // If offline or socket not connected, queue the message
    if (!navigator.onLine || !socket || !socket.connected) {
      console.log('📦 Queueing message (offline or disconnected)');
      setPendingMessages(prev => [...prev, { 
        content: messageInput.trim(), 
        timestamp: Date.now() 
      }]);
      toast(t.messageQueued, { icon: '📦' });
      setMessageInput('');
      return;
    }

    console.log('\n========================================');
    console.log('📤 SENDING MESSAGE');
    console.log('========================================');
    console.log('Content:', messageInput.trim());
    console.log('guestId:', guestId, '(type:', typeof guestId, ')');
    console.log('guestName:', guestName);
    console.log('========================================\n');
    
    socket.emit('chat:message', {
      roomId: DEFAULT_ROOM_ID,
      userId: guestId,
      username: guestName,
      content: messageInput.trim()
    });
    
    setMessageInput('');
  }, [messageInput, guestId, guestName]);

  const handleTranslate = async () => {
    if (!messageInput.trim()) return;
    
    setIsTranslating(true);
    try {
      const translatedText = await translateEnglishToBengali(messageInput);
      setMessageInput(translatedText);
      toast.success(t.textTranslated, { icon: '🌐', duration: 2000 });
    } catch (error) {
      console.error('Translation error:', error);
      toast.error(t.translationFailed, { icon: '⚠️' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();

      const socket = getSocket();
      if (!socket) throw new Error('No socket connection');

      let messageType: 'image' | 'video' | 'document' = 'document';
      if (file.type.startsWith('image/')) messageType = 'image';
      else if (file.type.startsWith('video/')) messageType = 'video';

      const fileUrl = data.file?.url || data.url;

      socket.emit('chat:file', {
        roomId: DEFAULT_ROOM_ID,
        userId: guestId,
        username: guestName,
        fileUrl: fileUrl,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        messageType
      });

      toast.success(t.fileUploaded);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(t.failedToUploadFile);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [guestId, guestName]);

  const formatFileSize = useCallback((bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }, []);

  const renderMessageContent = useCallback((msg: Message) => {
    if (msg.messageType === 'image' && msg.fileUrl) {
      return (
        <div className="relative group">
          <img src={msg.fileUrl} alt={msg.fileName} className="rounded-lg max-w-full mb-1 shadow-md" />
          <a 
            href={msg.fileUrl} 
            download={msg.fileName}
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
            title={t.downloadImage}
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5 text-white" />
          </a>
          <p className="text-[9px] opacity-70">{msg.fileName}</p>
        </div>
      );
    }

    if (msg.messageType === 'video' && msg.fileUrl) {
      return (
        <div className="relative group">
          <video src={msg.fileUrl} controls className="rounded-lg max-w-full mb-1 shadow-md" />
          <a 
            href={msg.fileUrl} 
            download={msg.fileName}
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
            title={t.downloadVideo}
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5 text-white" />
          </a>
          <p className="text-[9px] opacity-70">{msg.fileName}</p>
        </div>
      );
    }

    if (msg.messageType === 'document' && msg.fileUrl) {
      return (
        <a href={msg.fileUrl} download={msg.fileName} className="flex items-center gap-2 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition shadow-sm">
          <DocumentTextIcon className="h-4 w-4" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium truncate">{msg.fileName}</p>
            <p className="text-[8px] opacity-70">{formatFileSize(msg.fileSize)}</p>
          </div>
          <ArrowDownTrayIcon className="h-3 w-3" />
        </a>
      );
    }

    return <p className="text-[11px] break-words leading-relaxed">{msg.content}</p>;
  }, [formatFileSize]);

  const renderMessageStatus = useCallback((msg: Message) => {
    if (!msg.isOwn) return null;
    if (msg.status === 'read') {
      return (
        <div className="flex">
          <CheckSolidIcon className="h-3 w-3 text-blue-300 -mr-1.5" />
          <CheckSolidIcon className="h-3 w-3 text-blue-300" />
        </div>
      );
    }
    if (msg.status === 'delivered') {
      return (
        <div className="flex">
          <CheckSolidIcon className="h-3 w-3 opacity-60 -mr-1.5" />
          <CheckSolidIcon className="h-3 w-3 opacity-60" />
        </div>
      );
    }
    return <CheckIcon className="h-3 w-3 opacity-50" />;
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50">
      {/* Header */}
      <div className="px-3 py-3 bg-gradient-to-r from-purple-600 via-purple-500 to-purple-600 shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <button onClick={() => navigate('/')} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors shadow-sm">
            <ArrowLeftIcon className="h-4 w-4 text-white" />
          </button>
          
          <div className="w-9 h-9 rounded-full bg-white/30 flex items-center justify-center shadow-md">
            <ChatBubbleLeftRightIcon className="h-4 w-4 text-white" />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white">{DEFAULT_ROOM_NAME}</h3>
              {/* Connection status indicator */}
              {!isOnline && (
                <span className="px-2 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full shadow-sm">
                  OFFLINE
                </span>
              )}
              {pendingMessages.length > 0 && (
                <span className="px-2 py-0.5 bg-yellow-500 text-white text-[9px] font-bold rounded-full shadow-sm">
                  {pendingMessages.length} QUEUED
                </span>
              )}
            </div>
            <div className="text-[10px] text-white/90">
              <span>{guestName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="max-w-2xl mx-auto space-y-2">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <div className="p-5 bg-white rounded-full mb-3 shadow-lg">
                <ChatBubbleLeftRightIcon className="h-10 w-10 text-purple-600" />
              </div>
              <p className="text-sm text-gray-600 font-medium">{t.noMessagesYet}</p>
              <p className="text-xs text-gray-400 mt-1">Start the conversation!</p>
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[75%] sm:max-w-md`}>
                  <div className={`rounded-2xl px-2.5 py-1.5 shadow-md ${
                    msg.isOwn 
                      ? 'bg-gradient-to-br from-purple-600 to-purple-500 text-white rounded-br-sm' 
                      : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'
                  }`}>
                    {!msg.isOwn && (
                      <p className="text-[9px] font-semibold mb-0.5 opacity-70">{msg.username}</p>
                    )}
                    {renderMessageContent(msg)}
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                      <span className="text-[8px] opacity-70">
                        {new Date(msg.createdAt).toLocaleTimeString('en-US', { 
                          hour: 'numeric', 
                          minute: '2-digit',
                          hour12: true 
                        })}
                      </span>
                      {renderMessageStatus(msg)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Message Input */}
      <div className="border-t border-gray-200 p-3 bg-white shadow-lg">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={sendMessage} className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
            >
              <PaperClipIcon className="h-5 w-5" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*,video/*,.pdf,.doc,.docx"
            />
            
            <div className="flex-1 relative">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder={t.typeMessage}
                className="w-full px-3 py-2 text-[11px] border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm"
              />
            </div>
            
            <button
              type="button"
              onClick={handleTranslate}
              disabled={!messageInput.trim() || isTranslating}
              title={t.translateToBengali}
              className="p-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-full hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md transform hover:scale-105 active:scale-95"
            >
              {isTranslating ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <LanguageIcon className="h-5 w-5" />
              )}
            </button>
            
            <button
              type="submit"
              disabled={!messageInput.trim() || isUploading}
              className="p-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          </form>
          
          {/* Low-bandwidth info footer */}
          <div className="text-center mt-2">
            <p className="text-[9px] text-gray-500">
              {pendingMessages.length > 0 
                ? `${pendingMessages.length} ${pendingMessages.length > 1 ? t.messagesQueuedCount : t.messageQueuedCount} ${t.queuedWillSendWhenOnline}` 
                : t.messagesWorkOffline
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
