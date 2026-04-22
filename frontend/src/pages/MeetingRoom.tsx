import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  MicrophoneIcon, 
  VideoCameraIcon, 
  PhoneXMarkIcon, 
  ComputerDesktopIcon, 
  ChatBubbleLeftRightIcon, 
  UserGroupIcon, 
  Cog6ToothIcon, 
  DocumentDuplicateIcon, 
  UserPlusIcon, 
  PaperAirplaneIcon,
  ArrowLeftIcon,
  SignalIcon
} from '@heroicons/react/24/outline';
import { 
  MicrophoneIcon as MicrophoneOffIcon, 
  VideoCameraIcon as VideoCameraOffIcon,
  LanguageIcon
} from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { initializeSocket, getSocket } from '../services/socket';
import { WebRTCService, type VideoQuality, type ConnectionQuality } from '../services/webrtc';
import { useDirectCallStore } from '../stores/directCallStore';
import { useLanguageStore } from '../stores/languageStore';
import { translations } from '../i18n/translations';
import { translateEnglishToBengali } from '../services/translator';

// Default meeting room constants
const DEFAULT_ROOM_ID = 'talky-meeting';
const DEFAULT_ROOM_NAME = 'Talky Meeting';

interface Participant {
  userId: number;
  username: string;
  socketId: string;
  joinedAt: string;
}

interface Message {
  id: number;
  username: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
}

export default function MeetingRoom() {
  const navigate = useNavigate();
  const { currentUsername } = useDirectCallStore();
  const { language } = useLanguageStore();
  const t = translations[language];
  const [isLoading, setIsLoading] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [userId, setUserId] = useState<number>(0);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('low'); // Default to low for rural optimization
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('excellent');
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const webrtcServiceRef = useRef<WebRTCService>(new WebRTCService());
  const localStreamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cleanupFnsRef = useRef<Array<() => void>>([]);
  const participantsRef = useRef<Participant[]>([]);

  // Keep participants ref in sync with state
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // Memoized helper function to set remote video stream (DRY principle)
  const setRemoteVideoStream = useCallback((socketId: string, remoteStream: MediaStream) => {
    console.log('🎥 Setting remote stream for:', socketId);
    const videoElement = remoteVideoRefs.current.get(socketId);
    if (videoElement) {
      videoElement.srcObject = remoteStream;
      videoElement.style.display = 'block';
      // Ensure audio is enabled
      videoElement.muted = false;
      videoElement.volume = 1.0;
      // Log track info for debugging
      const audioTracks = remoteStream.getAudioTracks();
      const videoTracks = remoteStream.getVideoTracks();
      console.log(`📊 Remote stream tracks - Audio: ${audioTracks.length}, Video: ${videoTracks.length}`);
      audioTracks.forEach(track => console.log(`🎤 Audio track enabled: ${track.enabled}`));
      // Immediately play the video to avoid delays
      videoElement.play().catch(err => console.log('Auto-play prevented:', err));
    }
  }, []);

  // Memoized grid styles based on participant count - fit to viewport
  const totalParticipants = participants.length + 1; // +1 for local user
  const gridStyles = useMemo(() => ({
    // Only set height, let Tailwind responsive classes handle columns
    height: '100%'
  }), [totalParticipants]);

  // Responsive grid classes for mobile-first vertical layout
  const gridClasses = useMemo(() => {
    // Increased gap on mobile for better separation
    const baseClasses = 'grid gap-4 sm:gap-3 md:gap-4';
    // Add overflow-y-auto on mobile for scrolling when many participants
    const scrollClass = totalParticipants > 2 ? 'overflow-y-auto' : '';
    
    // Mobile: Always single column (vertical)
    // Tablet/Desktop: Multi-column based on participant count
    if (totalParticipants === 1) {
      return `${baseClasses} grid-cols-1 ${scrollClass}`;
    } else if (totalParticipants === 2) {
      return `${baseClasses} grid-cols-1 sm:grid-cols-2 ${scrollClass}`;
    } else if (totalParticipants <= 4) {
      return `${baseClasses} grid-cols-1 sm:grid-cols-2 ${scrollClass}`;
    } else if (totalParticipants <= 6) {
      return `${baseClasses} grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${scrollClass}`;
    } else {
      return `${baseClasses} grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 ${scrollClass}`;
    }
  }, [totalParticipants]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Generate a unique user ID for this tab/window (not stored in sessionStorage)
    // This ensures each browser tab is treated as a separate user
    const uniqueUserId = Date.now() + Math.floor(Math.random() * 10000);
    
    // Use registered username from global store
    const userName = currentUsername || 'Guest User';
    
    setUserId(uniqueUserId);
    
    console.log('👤 MeetingRoom - Current user:', {
      userId: uniqueUserId,
      userName
    });

    const socket = initializeSocket();
    const webrtcService = webrtcServiceRef.current;
    webrtcService.setSocket(socket);
    webrtcService.setRoomId(DEFAULT_ROOM_ID);

    // Setup quality monitoring callbacks for low-bandwidth optimization
    webrtcService.onQualityChange = async (quality: ConnectionQuality) => {
      setConnectionQuality(quality);
      console.log('📶 Connection quality changed:', quality);
      
      if (quality === 'poor') {
        toast(`⚠️ ${t.poorConnectionAdjusting}`, { icon: '⚠️', duration: 3000 });
        
        // Auto-switch to lower quality on poor connection
        const currentQuality = webrtcService.getCurrentVideoQuality();
        let targetQuality: VideoQuality | null = null;
        
        if (currentQuality === 'high') {
          targetQuality = 'medium';
        } else if (currentQuality === 'medium') {
          targetQuality = 'low';
        }
        
        if (targetQuality) {
          try {
            const newStream = await webrtcService.setVideoQuality(targetQuality);
            if (newStream && localVideoRef.current) {
              localVideoRef.current.srcObject = newStream;
              localStreamRef.current = newStream;
            }
            setVideoQuality(targetQuality);
            console.log(`🔽 Auto-switched to ${targetQuality} quality due to poor connection`);
            
            const qualityLabels: Record<VideoQuality, string> = {
              'high': 'High',
              'medium': 'Medium',
              'low': 'Low',
              'audio-only': 'Audio-only',
              'ultra-low-audio': 'Ultra-low'
            };
            toast.success(`${t.switchedToQuality} ${qualityLabels[targetQuality]} ${t.quality}`, { duration: 2000 });
          } catch (error) {
            console.error('Error auto-switching quality:', error);
          }
        }
      } else if (quality === 'good') {
        toast(`📶 ${t.connectionImproved}`, { icon: '📶', duration: 2000 });
      }
    };

    webrtcService.onBandwidthWarning = (message: string) => {
      toast(message, { icon: '⚠️', duration: 4000 });
    };

    // Enable low-bandwidth mode for rural optimization
    webrtcService.enableLowBandwidthMode();

    // Setup WebRTC signaling FIRST (before any socket events that might trigger offers)
    const setupWebRTCSignaling = (socket: any, webrtcService: WebRTCService) => {
      // Handle incoming WebRTC offer
      socket.on('webrtc-offer', async ({ offer, senderSocketId }: any) => {
        console.log('📨 Received WebRTC offer from:', senderSocketId);
        try {
          const answer = await webrtcService.handleOffer(
            offer,
            senderSocketId,
            (remoteStream) => {
              console.log('🎥 Setting remote stream for:', senderSocketId);
              const videoElement = remoteVideoRefs.current.get(senderSocketId);
              if (videoElement) {
                videoElement.srcObject = remoteStream;
                videoElement.style.display = 'block';
                // Ensure audio is enabled
                videoElement.muted = false;
                videoElement.volume = 1.0;
                // Log track info
                const audioTracks = remoteStream.getAudioTracks();
                console.log(`📊 Remote audio tracks: ${audioTracks.length}`);
                audioTracks.forEach(track => console.log(`🎤 Audio enabled: ${track.enabled}`));
                videoElement.play().catch(err => console.log('Auto-play prevented:', err));
              }
            }
          );

          // Send answer back
          socket.emit('webrtc-answer', {
            roomId: DEFAULT_ROOM_ID,
            answer,
            targetSocketId: senderSocketId,
          });
        } catch (error) {
          console.error('Error handling offer:', error);
        }
      });

      // Handle incoming WebRTC answer
      socket.on('webrtc-answer', async ({ answer, senderSocketId }: any) => {
        console.log('📨 Received WebRTC answer from:', senderSocketId);
        try {
          await webrtcService.handleAnswer(answer, senderSocketId);
        } catch (error) {
          console.error('Error handling answer:', error);
        }
      });

      // Handle ICE candidates
      socket.on('ice-candidate', async ({ candidate, senderSocketId }: any) => {
        console.log('📨 Received ICE candidate from:', senderSocketId);
        try {
          await webrtcService.handleIceCandidate(candidate, senderSocketId);
        } catch (error) {
          console.error('Error handling ICE candidate:', error);
        }
      });
    };
    
    // Setup WebRTC signaling handlers IMMEDIATELY
    setupWebRTCSignaling(socket, webrtcService);

    // Get local media stream BEFORE setting up room event listeners
    const initializeMedia = async () => {
      try {
        console.log('🎥 Getting local media stream...');
        const stream = await webrtcService.getLocalStream(true, true);
        localStreamRef.current = stream;
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        console.log('✅ Local stream ready, tracks:', stream.getTracks().map(t => `${t.kind}: ${t.enabled}`).join(', '));

        // NOW setup room event listeners (after stream is ready)
        socket.on('room-participants', (participantsList: Participant[]) => {
          console.log('👥 Room participants:', participantsList);
          // Filter out yourself from the participants list
          const otherParticipants = participantsList.filter(p => p.userId !== uniqueUserId);
          setParticipants(otherParticipants);
          
          // Small delay to ensure remote peer handlers are ready
          setTimeout(() => {
            // Create WebRTC offers for existing participants
            otherParticipants.forEach((participant) => {
              console.log('📞 Creating offer for existing participant:', participant.username);
              webrtcServiceRef.current.createOffer(
                participant.socketId,
                (remoteStream) => setRemoteVideoStream(participant.socketId, remoteStream)
              ).catch((err) => console.error('Error creating offer:', err));
            });
          }, 100); // 100ms delay to ensure handlers are ready
        });

        socket.on('user-joined', (participant: Participant) => {
          console.log('👋 User joined:', participant);
          
          // Prevent adding duplicates and yourself
          setParticipants(prev => {
            const isDuplicate = prev.some(p => p.socketId === participant.socketId);
            const isYourself = participant.userId === uniqueUserId;
            
            if (isDuplicate || isYourself) {
              console.log('Skipping duplicate or self:', participant.username);
              return prev;
            }
            
            return [...prev, participant];
          });
          
          // Only show toast and create offer if it's not yourself
          if (participant.userId !== uniqueUserId) {
            toast.success(`👤 ${participant.username} ${t.joinedTheMeeting}`);
            
            console.log('📞 Creating offer for new participant:', participant.username);
            webrtcServiceRef.current.createOffer(
              participant.socketId,
              (remoteStream) => setRemoteVideoStream(participant.socketId, remoteStream)
            ).catch((err) => console.error('Error creating offer:', err));
          }
        });

        socket.on('user-left', (participant: Participant) => {
          console.log('👋 User left:', participant);
          setParticipants(prev => prev.filter(p => p.socketId !== participant.socketId));
          
          // Clean up WebRTC peer connection
          if (webrtcServiceRef.current) {
            webrtcServiceRef.current.removePeer(participant.socketId);
          }
          
          // Clean up video element reference
          remoteVideoRefs.current.delete(participant.socketId);
          
          toast(`${participant.username} left the meeting`);
        });

        // Chat event listeners (compatible with backend chat:message format)
        socket.on('chat:history', ({ messages: loadedMessages }: any) => {
          console.log('📜 Loading chat history:', loadedMessages?.length || 0, 'messages');
          if (loadedMessages && loadedMessages.length > 0) {
            const formattedMessages = loadedMessages.map((msg: any) => {
              // Normalized comparison for message ownership
              const normalizedMsgUsername = (msg.username || '').trim().toLowerCase();
              const normalizedUserName = (userName || '').trim().toLowerCase();
              const usernameMatches = normalizedMsgUsername === normalizedUserName;
              
              const msgUserId = Number(msg.user_id);
              const currentUserId = Number(uniqueUserId);
              const userIdMatches = !isNaN(msgUserId) && !isNaN(currentUserId) && msgUserId === currentUserId;
              
              const isOwn = userIdMatches || usernameMatches;
              
              console.log('💬 Message ownership check:', {
                msgUsername: msg.username,
                userName,
                normalizedMsgUsername,
                normalizedUserName,
                usernameMatches,
                msgUserId,
                currentUserId,
                userIdMatches,
                isOwn
              });
              
              return {
                id: msg.id,
                username: msg.username,
                content: msg.content,
                createdAt: msg.created_at,
                isOwn
              };
            });
            setMessages(formattedMessages);
          }
        });

        socket.on('chat:message', (message: any) => {
          console.log('💬 Received chat message:', message);
          
          // Normalized comparison for message ownership
          const normalizedMsgUsername = (message.username || '').trim().toLowerCase();
          const normalizedUserName = (userName || '').trim().toLowerCase();
          const usernameMatches = normalizedMsgUsername === normalizedUserName;
          
          const msgUserId = Number(message.userId);
          const currentUserId = Number(uniqueUserId);
          const userIdMatches = !isNaN(msgUserId) && !isNaN(currentUserId) && msgUserId === currentUserId;
          
          setMessages(prev => [...prev, {
            id: message.id || Date.now(),
            username: message.username,
            content: message.content,
            createdAt: message.createdAt,
            isOwn: userIdMatches || usernameMatches
          }]);
        });

        // Join room via socket with unique user info
        socket.emit('join-room', {
          roomId: DEFAULT_ROOM_ID,
          userId: uniqueUserId,
          username: userName
        });
        console.log('✅ Joined room with userId:', uniqueUserId);

        // Join chat room for messaging
        socket.emit('chat:join', {
          roomId: DEFAULT_ROOM_ID,
          userId: uniqueUserId,
          username: userName
        });

        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing media:', error);
        toast.error(t.failedToEnableCamera);
        setIsLoading(false);
      }
    };

    // Initialize media
    initializeMedia();

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up MeetingRoom component');
      
      socket.emit('leave-room', { roomId: DEFAULT_ROOM_ID });
      
      // Stop all local media tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log(`🚫 Stopped ${track.kind} track`);
        });
        localStreamRef.current = null;
      }
      
      // Close all peer connections using current participants from ref
      if (webrtcServiceRef.current && participantsRef.current) {
        participantsRef.current.forEach((participant) => {
          webrtcServiceRef.current.removePeer(participant.socketId);
        });
      }
      
      // Clear video refs
      remoteVideoRefs.current.clear();
      
      // Execute any additional cleanup functions
      cleanupFnsRef.current.forEach(fn => fn());
      cleanupFnsRef.current = [];
      
      // Remove socket event listeners
      socket.off('room-participants');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('chat:history');
      socket.off('chat:message');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('ice-candidate');
      
      console.log('✅ Cleanup complete');
    };
  }, [currentUsername]);

  const handleLeaveCall = () => {
    setShowLeaveConfirm(true);
  };

  const confirmLeave = useCallback(() => {
    console.log('🚪 Leaving meeting...');
    
    // Stop all local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`🚫 Stopped ${track.kind} track`);
      });
    }
    
    // Close all peer connections using current participants from ref
    if (webrtcServiceRef.current && participantsRef.current) {
      participantsRef.current.forEach((participant) => {
        webrtcServiceRef.current.removePeer(participant.socketId);
      });
    }
    
    // Emit leave room event
    const socket = getSocket();
    if (socket) {
      socket.emit('leave-room', { roomId: DEFAULT_ROOM_ID });
    }
    
    navigate('/');
  }, [navigate]);

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        toast.success(audioTrack.enabled ? t.microphoneUnmuted : t.microphoneMuted);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        toast.success(videoTrack.enabled ? t.cameraOn : t.cameraOff);
      }
    }
  };

  const handleQualityChange = useCallback(async (quality: VideoQuality) => {
    try {
      const newStream = await webrtcServiceRef.current.setVideoQuality(quality);
      
      // Update local video element with new stream
      if (newStream && localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
        localStreamRef.current = newStream;
        console.log('✅ Updated local video with new quality stream');
      }
      
      setVideoQuality(quality);
      setShowQualityMenu(false);
      
      const qualityLabels: Record<VideoQuality, string> = {
        'high': 'High (720p, WiFi/4G+)',
        'medium': 'Medium (480p, 3G/4G)',
        'low': 'Low (240p, 2G/slow 3G)',
        'audio-only': 'Audio Only (any network)',
        'ultra-low-audio': 'Ultra-low Audio (6-12kbps, rural/2G)'
      };
      
      toast.success(`${t.switchedToQuality} ${qualityLabels[quality]} ${t.quality}`);
    } catch (error) {
      console.error('Error changing quality:', error);
      toast.error(t.failedToChangeQuality);
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await webrtcServiceRef.current.getDisplayMedia();
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (localStreamRef.current && localVideoRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          localStreamRef.current.removeTrack(videoTrack);
          localStreamRef.current.addTrack(screenTrack);
          localVideoRef.current.srcObject = localStreamRef.current;
          
          const handleScreenShareEnd = () => {
            setIsScreenSharing(false);
            toast(`📺 ${t.screenSharingStopped}`, { icon: '📺' });
          };
          
          screenTrack.onended = handleScreenShareEnd;
          
          // Store cleanup function
          cleanupFnsRef.current.push(() => {
            screenTrack.onended = null;
            screenTrack.stop();
          });
        }
        
        setIsScreenSharing(true);
        toast.success(`📺 ${t.screenSharingStarted}`);
      } catch (error) {
        console.error('Error sharing screen:', error);
        toast.error(t.failedToShareScreen);
      }
    } else {
      try {
        const videoStream = await webrtcServiceRef.current.getLocalStream(true, true);
        const videoTrack = videoStream.getVideoTracks()[0];
        
        if (localStreamRef.current && localVideoRef.current) {
          const screenTrack = localStreamRef.current.getVideoTracks()[0];
          screenTrack.stop(); // Stop screen track
          localStreamRef.current.removeTrack(screenTrack);
          localStreamRef.current.addTrack(videoTrack);
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        
        setIsScreenSharing(false);
        toast.success(t.screenSharingStopped);
      } catch (error) {
        console.error('Error stopping screen share:', error);
        toast.error(t.failedToStopSharing);
      }
    }
  }, [isScreenSharing]);

  const copyRoomLink = () => {
    const link = `${window.location.origin}/meeting/${DEFAULT_ROOM_ID}`;
    navigator.clipboard.writeText(link);
    toast.success(t.roomLinkCopied);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    const socket = getSocket();
    if (socket) {
      console.log('📤 Sending message to room:', DEFAULT_ROOM_ID);
      socket.emit('chat:message', {
        roomId: DEFAULT_ROOM_ID,
        userId: userId,
        username: currentUsername || 'Guest User',
        content: messageInput.trim()
      });
      setMessageInput('');
    }
  };

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

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 to-blue-900">
        <div className="text-center">
          <div className="inline-flex p-6 bg-white/10 backdrop-blur-lg rounded-full mb-4">
            <UserGroupIcon className="h-10 w-10 text-white animate-pulse" />
          </div>
          <p className="text-white text-xl font-semibold">Joining meeting room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-lg border-b border-white/10 px-3 sm:px-6 py-2.5 sm:py-3">
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <button
              onClick={() => navigate('/')}
              className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-all flex-shrink-0"
              title={t.backToHome}
            >
              <ArrowLeftIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <div className="p-1.5 sm:p-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg flex-shrink-0">
              <UserGroupIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-bold truncate">{DEFAULT_ROOM_NAME}</h1>
              <div className="text-xs sm:text-sm text-gray-300">
                <span className="truncate max-w-[100px] sm:max-w-none">{currentUsername || 'Guest User'}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <div className="hidden sm:flex items-center space-x-1.5 bg-white/10 backdrop-blur-lg px-2.5 py-1.5 rounded-full">
              <UserGroupIcon className="h-3 w-3 text-purple-300" />
              <span className="text-xs font-semibold">{participants.length}</span>
            </div>
            <button
              onClick={copyRoomLink}
              className="p-2 sm:px-3 sm:py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all flex items-center gap-1.5"
              title={t.copyRoomLink}
            >
              <DocumentDuplicateIcon className="h-4 w-4 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline text-xs">Invite</span>
            </button>
            <button
              onClick={() => setShowChat(!showChat)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
            >
              <ChatBubbleLeftRightIcon className="h-4 w-4" />
            </button>
            <button className="hidden sm:block p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all">
              <Cog6ToothIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Video Area */}
      <div className="flex-1 flex items-center justify-center p-3 sm:p-4 md:p-6 relative overflow-hidden">
        <div className="w-full h-full max-w-7xl mx-auto">
          {/* Video grid for multiple participants - vertical on mobile, responsive grid on desktop */}
          <div className={gridClasses} style={gridStyles}>
              {/* Your video */}
              <div className="relative video-tile bg-black/40 backdrop-blur-lg rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 h-[40vh] sm:min-h-0 sm:aspect-auto">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!isVideoEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-900 to-blue-900">
                    <div className="text-center">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center mb-2 sm:mb-3 mx-auto shadow-2xl">
                        <span className="text-2xl sm:text-3xl md:text-4xl font-bold">{(currentUsername || 'GU').substring(0, 2).toUpperCase()}</span>
                      </div>
                      <p className="text-gray-300 text-xs sm:text-sm">{t.cameraIsOff}</p>
                    </div>
                  </div>
                )}
                
                <div className="absolute bottom-2 sm:bottom-3 md:bottom-4 left-2 sm:left-3 md:left-4 right-2 sm:right-3 md:right-4 flex justify-between items-center gap-2">
                  <div className="bg-black/60 backdrop-blur-md px-2 sm:px-3 py-1 sm:py-1.5 rounded-full max-w-[calc(100%-50px)]">
                    <p className="font-semibold text-xs sm:text-sm truncate">{currentUsername || 'Guest User'} (You)</p>
                  </div>
                  {!isAudioEnabled && (
                    <div className="bg-red-500 p-1.5 sm:p-2 rounded-full flex-shrink-0">
                      <MicrophoneOffIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>
                  )}
                </div>
              </div>

              {/* Other participants */}
              {participants.map((participant) => (
                <div key={participant.socketId} className="relative video-tile bg-black/40 backdrop-blur-lg rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 h-[40vh] sm:min-h-0 sm:aspect-auto">
                  {/* Remote video element - audio enabled */}
                  <video
                    ref={(el) => {
                      if (el) {
                        remoteVideoRefs.current.set(participant.socketId, el);
                        // Ensure audio is enabled for remote participants
                        el.muted = false;
                        el.volume = 1.0;
                      } else {
                        remoteVideoRefs.current.delete(participant.socketId);
                      }
                    }}
                    autoPlay
                    playsInline
                    muted={false}
                    className="w-full h-full object-cover absolute inset-0 z-10"
                    style={{ display: 'none' }}
                  />
                  {/* Avatar fallback when no video stream */}
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-900 to-purple-900 z-0">
                    <div className="text-center">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto shadow-2xl">
                        <span className="text-2xl sm:text-3xl md:text-4xl font-bold">{participant.username.substring(0, 2).toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="absolute bottom-2 sm:bottom-3 md:bottom-4 left-2 sm:left-3 md:left-4 right-2 sm:right-3 md:right-4 z-20">
                    <div className="bg-black/60 backdrop-blur-md px-2 sm:px-3 py-1 sm:py-1.5 rounded-full inline-block max-w-full">
                      <p className="font-semibold text-xs sm:text-sm truncate">{participant.username}</p>
                    </div>
                  </div>
                </div>
              ))}

              {/* Empty slot - waiting for more participants */}
              {participants.length === 0 && (
                <div className="hidden sm:block relative video-tile bg-black/20 backdrop-blur-lg rounded-3xl overflow-hidden border border-white/10 border-dashed h-[40vh] sm:min-h-0 sm:aspect-auto">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center px-4">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/10 rounded-full flex items-center justify-center mb-2 sm:mb-3 mx-auto">
                        <UserPlusIcon className="h-6 w-6 sm:h-8 sm:w-8 text-white/50" />
                      </div>
                      <p className="text-gray-400 text-xs sm:text-sm">{t.waitingForOthers}</p>
                      <button
                        onClick={copyRoomLink}
                        className="mt-2 sm:mt-3 text-[10px] sm:text-xs text-purple-300 hover:text-purple-200 underline"
                      >
                        Share invite link
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Chat sidebar (if open) */}
        {showChat && (
          <>
            {/* Mobile: Bottom sheet style */}
            <div className="sm:hidden fixed inset-x-0 bottom-0 top-1/3 bg-white rounded-t-3xl shadow-2xl p-4 flex flex-col z-30">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-base font-bold text-gray-900">{t.meetingChat}</h3>
                <button
                  onClick={() => setShowChat(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <span className="text-lg">✕</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto mb-3 space-y-2">
                {messages.length === 0 ? (
                  <p className="text-gray-500 text-[10px] text-center py-8">
                    No messages yet. Say hello! 👋
                  </p>
                ) : (
                  <>
                    {messages.map((msg, index) => (
                      <div key={`${msg.id}-${index}`} className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className={`rounded-2xl px-2.5 py-1.5 max-w-[85%] shadow-md ${
                          msg.isOwn 
                            ? 'bg-gradient-to-br from-purple-600 to-purple-500 text-white rounded-br-sm' 
                            : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'
                        }`}>
                          {!msg.isOwn && <p className="text-[9px] font-semibold mb-0.5 opacity-70">{msg.username}</p>}
                          <p className="text-[10px] break-words">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
              <form onSubmit={sendMessage} className="flex space-x-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={t.typeMessage}
                  className="flex-1 px-3 py-2 text-[11px] border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900 shadow-sm"
                />
                <button
                  type="button"
                  onClick={handleTranslate}
                  disabled={!messageInput.trim() || isTranslating}
                  title={t.translateToBengali}
                  className="p-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all flex-shrink-0 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTranslating ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <LanguageIcon className="h-5 w-5" />
                  )}
                </button>
                <button
                  type="submit"
                  className="p-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all flex-shrink-0 shadow-md"
                >
                  <PaperAirplaneIcon className="h-5 w-5" />
                </button>
              </form>
            </div>
            
            {/* Desktop/Tablet: Sidebar */}
            <div className="hidden sm:block absolute right-3 md:right-6 top-6 bottom-24 w-80 md:w-96 bg-white rounded-2xl shadow-2xl p-4 flex-col z-20">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-bold text-gray-900">{t.meetingChat}</h3>
                <button
                  onClick={() => setShowChat(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors shadow-sm"
                >
                  <span className="text-lg">✕</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto mb-4 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-gray-500 text-[11px] text-center py-8">
                    No messages yet. Say hello! 👋
                  </p>
                ) : (
                  <>
                    {messages.map((msg, index) => (
                      <div key={`${msg.id}-${index}`} className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className={`rounded-2xl px-2.5 py-1.5 max-w-[75%] shadow-md ${
                          msg.isOwn 
                            ? 'bg-gradient-to-br from-purple-600 to-purple-500 text-white rounded-br-sm' 
                            : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'
                        }`}>
                          {!msg.isOwn && <p className="text-[9px] font-semibold mb-0.5 opacity-70">{msg.username}</p>}
                          <p className="text-[11px] break-words">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
              <form onSubmit={sendMessage} className="flex space-x-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={t.typeMessage}
                  className="flex-1 px-4 py-2 text-[11px] border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900 shadow-sm"
                />
                <button
                  type="button"
                  onClick={handleTranslate}
                  disabled={!messageInput.trim() || isTranslating}
                  title={t.translateToBengali}
                  className="p-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all flex-shrink-0 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTranslating ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <LanguageIcon className="h-5 w-5" />
                  )}
                </button>
                <button
                  type="submit"
                  className="p-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all flex-shrink-0 shadow-md"
                >
                  <PaperAirplaneIcon className="h-5 w-5" />
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* Control Bar */}
      <div className="bg-black/30 backdrop-blur-lg border-t border-white/10 px-3 sm:px-6 py-3 sm:py-4 md:py-6">
        <div className="max-w-2xl mx-auto flex justify-center items-center gap-2 sm:gap-3 md:gap-4">
          <button
            onClick={toggleAudio}
            className={`p-3 sm:p-4 rounded-full transition-all duration-200 ${isAudioEnabled ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
            title={isAudioEnabled ? 'Mute' : 'Unmute'}
          >
            {isAudioEnabled ? <MicrophoneIcon className="h-4 w-4 sm:h-5 sm:w-5" /> : <MicrophoneOffIcon className="h-4 w-4 sm:h-5 sm:w-5" />}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-3 sm:p-4 rounded-full transition-all duration-200 ${isVideoEnabled ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
            title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {isVideoEnabled ? <VideoCameraIcon className="h-4 w-4 sm:h-5 sm:w-5" /> : <VideoCameraOffIcon className="h-4 w-4 sm:h-5 sm:w-5" />}
          </button>

          {/* Video Quality Selector */}
          <div className="relative">
            <button
              onClick={() => setShowQualityMenu(!showQualityMenu)}
              className={`p-3 sm:p-4 rounded-full transition-all duration-200 bg-white/20 hover:bg-white/30 text-white ${
                connectionQuality === 'poor' ? 'ring-2 ring-yellow-400' : 
                connectionQuality === 'excellent' ? 'ring-2 ring-green-400' : ''
              }`}
              title={t.videoQualitySettings}
            >
              <SignalIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            
            {showQualityMenu && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-xl p-2 min-w-[200px] z-50">
                <div className="text-[10px] text-gray-500 font-semibold mb-2 px-2">
                  Connection: <span className={`${
                    connectionQuality === 'poor' ? 'text-red-500' : 
                    connectionQuality === 'good' ? 'text-yellow-500' : 
                    'text-green-500'
                  }`}>{connectionQuality.toUpperCase()}</span>
                </div>
                <button
                  onClick={() => handleQualityChange('high')}
                  className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 transition ${videoQuality === 'high' ? 'bg-purple-100 font-semibold' : ''}`}
                >
                  <div>{t.highQuality720p}</div>
                  <div className="text-[10px] text-gray-500">{t.wifiOnly}</div>
                </button>
                <button
                  onClick={() => handleQualityChange('medium')}
                  className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 transition ${videoQuality === 'medium' ? 'bg-purple-100 font-semibold' : ''}`}
                >
                  <div>{t.mediumQuality480p}</div>
                  <div className="text-[10px] text-gray-500">{t.threeGFourG}</div>
                </button>
                <button
                  onClick={() => handleQualityChange('low')}
                  className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 transition ${videoQuality === 'low' ? 'bg-purple-100 font-semibold' : ''}`}
                >
                  <div>{t.lowQuality240p} ⭐</div>
                  <div className="text-[10px] text-gray-500">{t.twoGSlowThreeG}</div>
                </button>
                <button
                  onClick={() => handleQualityChange('audio-only')}
                  className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 transition ${videoQuality === 'audio-only' ? 'bg-purple-100 font-semibold' : ''}`}
                >
                  <div>{t.audioOnly}</div>
                  <div className="text-[10px] text-gray-500">{t.anyNetwork}</div>
                </button>
                <button
                  onClick={() => handleQualityChange('ultra-low-audio')}
                  className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 transition ${videoQuality === 'ultra-low-audio' ? 'bg-purple-100 font-semibold' : ''}`}
                >
                  <div>Ultra-low Audio 🌾</div>
                  <div className="text-[10px] text-gray-500">Rural/2G (6-12 kbps)</div>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={toggleScreenShare}
            className={`hidden sm:flex p-3 sm:p-4 rounded-full transition-all duration-200 ${isScreenSharing ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-white/20 hover:bg-white/30 text-white'}`}
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          >
            <ComputerDesktopIcon className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>

          <button
            onClick={handleLeaveCall}
            className="px-6 sm:px-8 md:px-10 py-3 sm:py-4 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all duration-200 flex items-center gap-2"
            title={t.leaveMeetingTooltip}
          >
            <PhoneXMarkIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline text-sm font-medium">Leave</span>
          </button>
        </div>
        
        <div className="text-center mt-2 sm:mt-3 md:mt-4">
          <p className="text-[10px] sm:text-xs text-gray-400">
            {t.sharedMeetingRoom} • {videoQuality === 'low' ? t.optimizedRuralAreas : `${t.video}: ${videoQuality}`}
          </p>
        </div>
      </div>

      {/* Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t.leaveMeetingQuestion}</h3>
            <p className="text-sm text-gray-600 mb-6">{t.areYouSureLeave}</p>
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                {t.cancel}
              </button>
              <button
                onClick={confirmLeave}
                className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
              >
                {t.leave}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
