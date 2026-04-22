import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  MicrophoneIcon, 
  VideoCameraIcon, 
  PhoneXMarkIcon, 
  ComputerDesktopIcon, 
  ChatBubbleLeftRightIcon, 
  UserGroupIcon, 
  PaperAirplaneIcon, 
  PaperClipIcon, 
  DocumentTextIcon, 
  ArrowDownTrayIcon, 
  CheckIcon, 
  WifiIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  DocumentDuplicateIcon
} from '@heroicons/react/24/outline';
import { 
  MicrophoneIcon as MicrophoneOffIcon, 
  VideoCameraIcon as VideoCameraOffIcon,
  LanguageIcon
} from '@heroicons/react/24/solid';
import { CheckIcon as CheckSolidIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { initializeSocket, getSocket } from '../services/socket';
import { WebRTCService, ConnectionQuality, VideoQuality } from '../services/webrtc';
import { useDirectCallStore } from '../stores/directCallStore';
import { useLanguageStore } from '../stores/languageStore';
import { translations } from '../i18n/translations';
import { translateEnglishToBengali } from '../services/translator';

interface Participant {
  userId: number;
  username: string;
  socketId: string;
  joinedAt: string;
}

interface Message {
  id: number;
  roomId?: string;
  userId?: number;
  username: string;
  content: string;
  messageType?: 'text' | 'system' | 'image' | 'video' | 'document';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  status?: 'sent' | 'delivered' | 'read';
  createdAt: string;
  readBy?: number[];
  isOwn: boolean;
}

export default function CallRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { currentUsername } = useDirectCallStore();
  const { language } = useLanguageStore();
  const t = translations[language];
  const [isLoading, setIsLoading] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('excellent');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isLocalVideoMinimized, setIsLocalVideoMinimized] = useState(false);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('low');
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use registered username from global store
  const guestName = currentUsername || t.guest;
  
  // Get peer name from sessionStorage (for direct calls)
  const [peerName] = useState(() => {
    const peer = sessionStorage.getItem('directCallPeer');
    return peer || null;
  });
  
  const [guestId] = useState(() => {
    // Generate unique ID per browser tab for call room
    // This ensures each tab is a unique participant
    const numericId = Date.now() + Math.floor(Math.random() * 1000);
    console.log('🆕 CallRoom - Generated unique tab guestId:', numericId);
    return numericId;
  });
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcServiceRef = useRef<WebRTCService>(new WebRTCService());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasJoinedRoom = useRef(false); // Prevent duplicate joins

  useEffect(() => {
    if (!roomId) {
      toast.error(t.invalidCallLink);
      navigate('/');
      return;
    }

    const socket = initializeSocket();
    const webrtcService = webrtcServiceRef.current;
    webrtcService.setSocket(socket);
    webrtcService.setRoomId(roomId);

    // Set up connection quality callbacks
    webrtcService.onQualityChange = (quality) => {
      setConnectionQuality(quality);
      if (quality === 'poor') {
        toast(t.connectionQualityPoor, { icon: '⚠️' });
      } else if (quality === 'disconnected') {
        toast.error(t.connectionLost);
      }
    };

    webrtcService.onReconnecting = (attempt) => {
      setIsReconnecting(true);
      setReconnectAttempt(attempt);
      toast(`${t.reconnectingAttempt} ${attempt})`, { icon: '🔄' });
    };

    webrtcService.onReconnected = () => {
      setIsReconnecting(false);
      setReconnectAttempt(0);
      toast.success(t.reconnected);
    };

    // Get call type from sessionStorage
    const callType = sessionStorage.getItem('callType') || 'video';
    const enableVideo = callType === 'video';

    // Get local media stream
    const initializeMedia = async () => {
      try {
        // Enable low-bandwidth mode for better performance on slow networks
        webrtcService.enableLowBandwidthMode();
        
        // Set connection quality callback
        webrtcService.onQualityChange = (quality: ConnectionQuality) => {
          setConnectionQuality(quality);
          console.log('📊 Connection quality changed:', quality);
        };
        
        // Set bandwidth warning callback
        webrtcService.onBandwidthWarning = (message: string) => {
          toast(message, { icon: '⚠️', duration: 4000 });
        };
        
        const stream = await webrtcService.getLocalStream(true, enableVideo);
        localStreamRef.current = stream;
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Set initial video state
        setIsVideoEnabled(enableVideo);

        // Join room via socket and wait for it to complete (only once!)
        if (!hasJoinedRoom.current) {
          hasJoinedRoom.current = true;
          console.log('🚪 Joining room:', roomId);
          
          // Join signaling room for WebRTC
          socket.emit('join-room', {
            roomId,
            userId: guestId,
            username: guestName
          });

          // Join chat room separately
          socket.emit('chat:join', {
            roomId,
            userId: guestId,
            username: guestName
          });
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing media:', error);
        toast.error(t.failedToAccessMedia);
        setIsLoading(false);
      }
    };

    // Socket event listeners
    socket.on('room-participants', (participantsList: Participant[]) => {
      console.log('Room participants:', participantsList);
      setParticipants(participantsList);
      
      // DON'T create offers here - wait for existing users to send us offers
      // This prevents the "glare" condition where both sides try to create offers
      console.log(`Joined room with ${participantsList.length} participant(s). Waiting for offers...`);
    });

    socket.on('user-joined', (participant: Participant) => {
      console.log('User joined:', participant);
      setParticipants(prev => [...prev, participant]);
      toast.success(`👤 ${participant.username} ${t.joined}`);
      
      // Create WebRTC offer for new participant
      if (participant.socketId !== socket.id) {
        webrtcService.createOffer(participant.socketId, (remoteStream) => {
          console.log('Setting remote stream from offer callback', remoteStream.id);
          remoteStreamRef.current = remoteStream;
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(err => {
              console.log('Autoplay prevented, attempting user interaction:', err);
              // Add click handler to play on user interaction
              remoteVideoRef.current?.addEventListener('click', () => {
                remoteVideoRef.current?.play();
              }, { once: true });
            });
          }
        });
      }
    });

    socket.on('user-left', (participant: Participant) => {
      console.log('User left:', participant);
      setParticipants(prev => prev.filter(p => p.socketId !== participant.socketId));
      toast(`${participant.username} ${t.left}`);
    });

    socket.on('webrtc-offer', async ({ offer, senderSocketId }: any) => {
      console.log('Received WebRTC offer from:', senderSocketId);
      const answer = await webrtcService.handleOffer(offer, senderSocketId, (remoteStream) => {
        console.log('Setting remote stream from answer callback', remoteStream.id);
        remoteStreamRef.current = remoteStream;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(err => {
            console.log('Autoplay prevented, attempting user interaction:', err);
            // Add click handler to play on user interaction
            remoteVideoRef.current?.addEventListener('click', () => {
              remoteVideoRef.current?.play();
            }, { once: true });
          });
        }
      });
      socket.emit('webrtc-answer', {
        roomId,
        answer,
        targetSocketId: senderSocketId
      });
    });

    socket.on('webrtc-answer', async ({ answer, senderSocketId }: any) => {
      console.log('Received WebRTC answer from:', senderSocketId);
      await webrtcService.handleAnswer(answer, senderSocketId);
    });

    socket.on('ice-candidate', async ({ candidate, senderSocketId }: any) => {
      console.log('Received ICE candidate from:', senderSocketId);
      await webrtcService.handleIceCandidate(candidate, senderSocketId);
    });

    // Chat event listeners
    socket.on('chat:history', ({ messages: loadedMessages }: any) => {
      console.log('📜 Chat history received:', loadedMessages.length, 'messages');
      const formattedMessages = loadedMessages.map((msg: any) => {
        // Normalize for comparison to handle type mismatches
        const msgUserId = Number(msg.user_id);
        const currentUserId = Number(guestId);
        const normalizedMsgUsername = (msg.username || '').trim().toLowerCase();
        const normalizedGuestName = (guestName || '').trim().toLowerCase();
        
        const userIdMatches = !isNaN(msgUserId) && !isNaN(currentUserId) && msgUserId === currentUserId;
        const usernameMatches = normalizedMsgUsername === normalizedGuestName;
        const isOwn = userIdMatches || usernameMatches;
        
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
      setMessages(formattedMessages);
      console.log('✅ Loaded', formattedMessages.length, 'messages into state');
    });

    socket.on('chat:message', (message: any) => {
      console.log('💬 New message received:', message.content);
      
      // Normalize for comparison to handle type mismatches
      const msgUserId = Number(message.userId);
      const currentUserId = Number(guestId);
      const normalizedMsgUsername = (message.username || '').trim().toLowerCase();
      const normalizedGuestName = (guestName || '').trim().toLowerCase();
      
      const userIdMatches = !isNaN(msgUserId) && !isNaN(currentUserId) && msgUserId === currentUserId;
      const usernameMatches = normalizedMsgUsername === normalizedGuestName;
      const isOwn = userIdMatches || usernameMatches;
      
      const newMsg: Message = {
        id: message.id,
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
      setMessages(prev => [...prev, newMsg]);
      console.log('✅ Message added to state, isOwn:', isOwn);
    });

    socket.on('chat:error', ({ error }: any) => {
      console.error('❌ Chat error:', error);
      toast.error(error);
    });

    // Listen for message status updates (delivered/read)
    socket.on('chat:status', ({ messageId, status }: any) => {
      console.log('📊 Message status update:', messageId, status);
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, status } : msg
      ));
    });

    // Initialize media
    initializeMedia();

    // Cleanup
    return () => {
      socket.emit('leave-room', { roomId });
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      socket.off('room-participants');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('ice-candidate');
      socket.off('chat:history');
      socket.off('chat:message');
      socket.off('chat:error');
      socket.off('chat:status');
    };
  }, [roomId, navigate, guestName]);

  // Handle phone sleep/wake with Page Visibility API
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('📱 Page hidden (phone sleep/background)');
        // Keep connection alive - don't stop streams
      } else {
        console.log('📱 Page visible (phone wake/foreground)');
        // Resume video if it was enabled
        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          localVideoRef.current.play().catch(err => console.log('Play error:', err));
        }
        if (remoteVideoRef.current && remoteStreamRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
          remoteVideoRef.current.play().catch(err => console.log('Play error:', err));
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Prevent accidental back button / page close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t.areYouSureLeavingCall;
      return t.areYouSureLeavingCall;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [t]);

  // Keep wake lock to prevent phone sleep during call (if supported)
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('🔒 Wake lock acquired - screen will stay on');
        }
      } catch (err) {
        console.log('Wake lock not supported or denied:', err);
      }
    };

    requestWakeLock();

    return () => {
      if (wakeLock) {
        wakeLock.release().then(() => {
          console.log('🔓 Wake lock released');
        });
      }
    };
  }, []);

  // Monitor remote stream and ensure it's playing (audio or video)
  useEffect(() => {
    const checkRemoteStream = () => {
      if (remoteVideoRef.current && remoteStreamRef.current) {
        const videoTracks = remoteStreamRef.current.getVideoTracks();
        const audioTracks = remoteStreamRef.current.getAudioTracks();
        
        // Consider stream ready if we have either video OR audio tracks that are live
        const hasLiveVideo = videoTracks.length > 0 && videoTracks[0].enabled && videoTracks[0].readyState === 'live';
        const hasLiveAudio = audioTracks.length > 0 && audioTracks[0].readyState === 'live';
        const hasStream = hasLiveVideo || hasLiveAudio;
        
        setHasRemoteVideo(hasStream);
        
        if (hasStream && remoteVideoRef.current.paused) {
          console.log('Remote stream is paused, attempting to play...');
          remoteVideoRef.current.play().catch(err => {
            console.error('Failed to play remote stream:', err);
          });
        }
      }
    };

    // Check initially and set up interval
    checkRemoteStream();
    const interval = setInterval(checkRemoteStream, 1000);

    return () => clearInterval(interval);
  }, [participants.length]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    console.log('🎨 Messages state updated, current count:', messages.length);
    console.log('🎨 Current messages:', messages);
    if (messagesEndRef.current && showChat) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showChat]);

  // Reattach local video stream when video is maximized after being minimized
  useEffect(() => {
    if (!isLocalVideoMinimized && localStreamRef.current && localVideoRef.current) {
      console.log('📹 Reattaching local video stream after maximize');
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isLocalVideoMinimized]);

  // Mark messages as read when chat is opened
  useEffect(() => {
    if (showChat && messages.length > 0) {
      const socket = getSocket();
      if (socket && roomId && guestId) {
        // Mark all unread messages from others as read
        const unreadMessages = messages.filter(msg => 
          !msg.isOwn && msg.status !== 'read'
        );
        
        unreadMessages.forEach(msg => {
          socket.emit('chat:read', {
            messageId: msg.id,
            userId: guestId,
            roomId
          });
        });
        
        if (unreadMessages.length > 0) {
          console.log(`📖 Marked ${unreadMessages.length} messages as read`);
        }
      }
    }
  }, [showChat, messages, roomId, guestId]);

  const handleLeaveCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    const socket = getSocket();
    if (socket) {
      socket.emit('leave-room', { roomId });
      
      // If this is a direct call, notify the other user
      const directCallPeer = sessionStorage.getItem('directCallPeer');
      if (directCallPeer) {
        socket.emit('call:end', { 
          roomId, 
          username: guestName 
        });
      }
    }
    toast(`📴 ${t.callEnded}`, { icon: '📴' });
    navigate('/');
  };

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

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;

    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    
    // If video track exists, just toggle it
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      toast.success(videoTrack.enabled ? t.cameraOn : t.cameraOff);
      return;
    }
    
    // If no video track (audio-only call), add video
    if (!isVideoEnabled) {
      try {
        toast(t.enablingCamera, { icon: '📹', duration: 1000 });
        
        // Get video track
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          }
        });
        
        const newVideoTrack = videoStream.getVideoTracks()[0];
        
        if (!newVideoTrack) {
          throw new Error('Failed to get video track');
        }

        // Add video track using WebRTC service
        const webrtcService = webrtcServiceRef.current;
        await webrtcService.addVideoTrack(newVideoTrack);
        
        // Update local video element
        if (localVideoRef.current) {
          // Reassign srcObject to ensure video element updates
          localVideoRef.current.srcObject = localStreamRef.current;
          await localVideoRef.current.play().catch(err => {
            console.log('Local video autoplay prevented:', err);
          });
        }
        
        setIsVideoEnabled(true);
        toast.success(t.cameraEnabled);
      } catch (error) {
        console.error('Error enabling video:', error);
        toast.error(t.failedToEnableCamera);
      }
    } else {
      // Turn off video
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = false;
        setIsVideoEnabled(false);
        toast.success(t.cameraOff);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await webrtcServiceRef.current.getDisplayMedia();
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (localStreamRef.current && localVideoRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          localStreamRef.current.removeTrack(videoTrack);
          localStreamRef.current.addTrack(screenTrack);
          localVideoRef.current.srcObject = localStreamRef.current;
          
          screenTrack.onended = () => {
            setIsScreenSharing(false);
            toast(`📺 ${t.screenSharingStopped}`, { icon: '📺' });
          };
        }
        
        setIsScreenSharing(true);
        toast.success(t.screenSharingStarted);
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
          localStreamRef.current.removeTrack(screenTrack);
          localStreamRef.current.addTrack(videoTrack);
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        
        setIsScreenSharing(false);
        toast.success(`📺 ${t.screenSharingStopped}`);
      } catch (error) {
        console.error('Error stopping screen share:', error);
      }
    }
  };

  const handleQualityChange = async (quality: VideoQuality) => {
    try {
      const webrtcService = webrtcServiceRef.current;
      const newStream = await webrtcService.setVideoQuality(quality);
      
      if (newStream && localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
        localStreamRef.current = newStream;
        setVideoQuality(quality);
        setShowQualityMenu(false);
        
        const qualityLabels: Record<VideoQuality, string> = {
          'high': t.highQualityFull,
          'medium': t.mediumQualityFull,
          'low': t.lowQualityFull,
          'audio-only': t.audioOnlyFull,
          'ultra-low-audio': 'Ultra-low Audio (6-12kbps)'
        };
        
        toast.success(`${t.switchedToQuality} ${qualityLabels[quality]} ${t.quality}`);
      }
    } catch (error) {
      console.error('Error changing quality:', error);
      toast.error(t.failedToChangeQuality);
    }
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}/call/${roomId}`;
    navigator.clipboard.writeText(link);
    toast.success(`📋 ${t.roomLinkCopied}`);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    const socket = getSocket();
    if (socket) {
      console.log('💬 Sending message:', messageInput.trim());
      socket.emit('chat:message', {
        roomId,
        userId: guestId,
        username: guestName,
        content: messageInput.trim()
      });
      setMessageInput('');
    } else {
      console.error('❌ Socket not available');
      toast.error(t.failedToSendMessage);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !roomId) return;

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

      // Determine message type
      let messageType: 'image' | 'video' | 'document' = 'document';
      if (file.type.startsWith('image/')) messageType = 'image';
      else if (file.type.startsWith('video/')) messageType = 'video';

      // Send file message
      console.log('📎 Sending file:', file.name);
      socket.emit('chat:file', {
        roomId,
        userId: guestId,
        username: guestName,
        fileUrl: data.fileUrl,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        messageType
      });

      toast.success(`📎 ${t.fileUploadedSuccessfully}`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(t.failedToUploadFile);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const renderMessageContent = (msg: Message) => {
    if (msg.messageType === 'image' && msg.fileUrl) {
      return (
        <div className="relative group">
          <img
            src={msg.fileUrl}
            alt={msg.fileName}
            className="rounded-lg max-w-full mb-1"
          />
          <a 
            href={msg.fileUrl} 
            download={msg.fileName}
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            title={t.downloadImage}
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5 text-white" />
          </a>
          <p className="text-[10px] opacity-70">{msg.fileName}</p>
        </div>
      );
    }

    if (msg.messageType === 'video' && msg.fileUrl) {
      return (
        <div className="relative group">
          <video
            src={msg.fileUrl}
            controls
            className="rounded-lg max-w-full mb-1"
          />
          <a 
            href={msg.fileUrl} 
            download={msg.fileName}
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            title={t.downloadVideo}
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5 text-white" />
          </a>
          <p className="text-[10px] opacity-70">{msg.fileName}</p>
        </div>
      );
    }

    if (msg.messageType === 'document' && msg.fileUrl) {
      return (
        <a
          href={msg.fileUrl}
          download={msg.fileName}
          className="flex items-center space-x-1.5 p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition"
        >
          <DocumentTextIcon className="h-3.5 w-3.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium truncate">{msg.fileName}</p>
            <p className="text-[9px] opacity-70">{formatFileSize(msg.fileSize)}</p>
          </div>
          <ArrowDownTrayIcon className="h-3 w-3 flex-shrink-0" />
        </a>
      );
    }

    return <p className="text-xs leading-relaxed">{msg.content}</p>;
  };

  const renderMessageStatus = (msg: Message) => {
    if (!msg.isOwn) return null;

    if (msg.status === 'read') {
      return (
        <div className="flex">
          <CheckSolidIcon className="h-2.5 w-2.5 text-blue-300 -mr-1" />
          <CheckSolidIcon className="h-2.5 w-2.5 text-blue-300" />
        </div>
      );
    }
    if (msg.status === 'delivered') {
      return (
        <div className="flex">
          <CheckSolidIcon className="h-2.5 w-2.5 opacity-60 -mr-1" />
          <CheckSolidIcon className="h-2.5 w-2.5 opacity-60" />
        </div>
      );
    }
    return <CheckIcon className="h-2.5 w-2.5 opacity-50" />;
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
        <div className="text-center">
          <div className="inline-flex p-6 bg-purple-600/20 rounded-full mb-4 backdrop-blur-sm border border-purple-500/20">
            <VideoCameraIcon className="h-12 w-12 text-purple-400 animate-pulse" />
          </div>
          <p className="text-white text-lg font-medium">Joining call...</p>
          <p className="text-gray-400 text-sm mt-2">{t.settingConnection}</p>
        </div>
      </div>
    );
  }

  const hasRemoteParticipant = participants.length > 1;

  // Connection quality indicator component
  const ConnectionIndicator = () => {
    const getIndicatorColor = () => {
      switch (connectionQuality) {
        case 'excellent': return 'bg-green-500';
        case 'good': return 'bg-yellow-500';
        case 'poor': return 'bg-orange-500';
        case 'disconnected': return 'bg-red-500';
      }
    };

    const getIndicatorIcon = () => {
      if (connectionQuality === 'disconnected' || isReconnecting) {
        return <WifiIcon className="h-3 w-3 text-white" />;
      }
      return null;
    };

    const getIndicatorText = () => {
      if (isReconnecting) {
        return `Reconnecting... (${reconnectAttempt}/${5})`;
      }
      switch (connectionQuality) {
        case 'excellent': return 'Excellent';
        case 'good': return 'Good';
        case 'poor': return 'Poor';
        case 'disconnected': return 'Disconnected';
      }
    };

    const signalBars = webrtcServiceRef.current.getSignalBars();

    return (
      <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full ${getIndicatorColor()} ${isReconnecting ? 'animate-pulse' : ''}`}>
        {getIndicatorIcon()}
        <div className="flex items-end gap-0.5">
          {[1, 2, 3, 4, 5].map((bar) => (
            <span
              key={bar}
              className={`w-0.5 rounded-sm ${bar <= signalBars ? 'bg-white' : 'bg-white/30'}`}
              style={{ height: `${bar * 2 + 2}px` }}
            />
          ))}
        </div>
        <span className="text-white text-xs font-medium">{getIndicatorText()}</span>
      </div>
    );
  };

  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col md:flex-row relative overflow-hidden">
      {/* Main Video Container - Resizes when chat is open */}
      <div className={`flex-1 relative transition-all duration-300 ${
        showChat ? 'md:mr-0' : ''
      }`}>
        {/* Remote Video (Full Screen when available) */}
        {hasRemoteParticipant ? (
          <div className="absolute inset-0 bg-gray-800">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              onClick={() => {
                if (remoteVideoRef.current?.paused) {
                  remoteVideoRef.current.play();
                }
              }}
              className="w-full h-full object-cover cursor-pointer"
            />
            {/* Loading indicator if stream isn't ready */}
            {!hasRemoteVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 backdrop-blur-sm">
                <div className="text-center">
                  <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4 mx-auto"></div>
                  <p className="text-white text-sm font-medium">Connecting...</p>
                  <p className="text-gray-400 text-xs mt-1">{t.pleaseWait}</p>
                  <button
                    onClick={() => remoteVideoRef.current?.play()}
                    className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition-all hover:scale-105 shadow-lg"
                  >
                    Tap to start
                  </button>
                </div>
              </div>
            )}
            {/* Reconnection overlay */}
            {isReconnecting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50">
                <div className="text-center bg-gray-800/90 rounded-2xl p-6 shadow-2xl border border-gray-700">
                  <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-3 mx-auto"></div>
                  <p className="text-white text-sm font-medium">Reconnecting...</p>
                  <p className="text-gray-400 text-xs mt-1">Attempt {reconnectAttempt} of 5</p>
                  <div className="mt-3 flex items-center justify-center space-x-1">
                    {[...Array(5)].map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-2 h-2 rounded-full ${i < reconnectAttempt ? 'bg-yellow-500' : 'bg-gray-600'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {/* Remote participant name overlay */}
            <div className="absolute bottom-20 sm:bottom-24 left-4">
              <div className="bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                <p className="text-white text-sm font-medium">
                  {peerName || participants.find(p => p.username !== guestName)?.username || 'Guest'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
            <div className="text-center px-4">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-purple-600/30 to-blue-600/30 rounded-full flex items-center justify-center mb-4 mx-auto backdrop-blur-sm border border-purple-500/20">
                <UserGroupIcon className="h-8 w-8 sm:h-10 sm:w-10 text-purple-400" />
              </div>
              <p className="text-white text-base sm:text-lg font-medium mb-2">{t.waitingForOthers}</p>
              <p className="text-gray-400 text-sm mb-4">{t.shareCallLinkToInvite}</p>
              <button
                onClick={copyRoomLink}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg text-sm transition-all hover:scale-105 shadow-lg inline-flex items-center space-x-2"
              >
                <DocumentDuplicateIcon className="h-4 w-4" />
                <span>{t.copyCallLink}</span>
              </button>
            </div>
          </div>
        )}

        {/* Local Video (Picture-in-Picture) - Fully Minimizable */}
        {!isLocalVideoMinimized && (
        <div className={`absolute top-20 transition-all duration-300 z-10 w-28 h-36 sm:w-36 sm:h-44 md:w-40 md:h-52 rounded-xl ${
          showChat ? 'right-4 md:right-4' : 'right-4'
        } overflow-hidden shadow-2xl border-2 border-white/20 bg-gray-800`}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {!isVideoEnabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <div className="text-center">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-purple-600 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-white text-lg sm:text-xl font-bold">
                    {guestName.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          )}
          {/* Muted indicator on local video */}
          {!isAudioEnabled && (
            <div className="absolute top-1 right-1 bg-red-500 p-1 rounded">
              <MicrophoneOffIcon className="h-3 w-3 text-white" />
            </div>
          )}
          {/* Minimize toggle */}
          <button
            onClick={() => setIsLocalVideoMinimized(true)}
            className="absolute bottom-1 right-1 bg-black/60 hover:bg-black/80 p-1 rounded-full transition-all"
            title={t.hideLocalVideo}
          >
            <ArrowsPointingInIcon className="h-3 w-3 text-white" />
          </button>
        </div>
        )}
        
        {/* Restore local video button (when minimized) */}
        {isLocalVideoMinimized && (
          <button
            onClick={() => setIsLocalVideoMinimized(false)}
            className={`absolute top-20 transition-all duration-300 z-10 ${
              showChat ? 'right-4 md:right-4' : 'right-4'
            } w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-700 shadow-2xl border-2 border-white/20 flex items-center justify-center`}
            title={t.showLocalVideo}
          >
            <ArrowsPointingOutIcon className="h-5 w-5 text-white" />
          </button>
        )}

        {/* Top Bar - Mobile Optimized with Connection Quality */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 via-black/40 to-transparent p-3 sm:p-4 z-20 backdrop-blur-sm">
          <div className="flex items-center justify-center max-w-7xl mx-auto">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-white text-xs sm:text-sm font-medium">{participants.length} in call</span>
              </div>
              <ConnectionIndicator />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Control Bar - Enhanced Design */}
      <div className={`absolute left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent pb-safe z-30 transition-all duration-300 backdrop-blur-md ${
        showChat ? 'bottom-[40%] md:bottom-0' : 'bottom-0'
      }`}>
        <div className="px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-center justify-center space-x-2.5 sm:space-x-3 max-w-lg mx-auto">
            {/* Microphone Button */}
            <button
              onClick={toggleAudio}
              className={`p-3 sm:p-3.5 rounded-full transition-all shadow-lg hover:scale-105 ${
                isAudioEnabled
                  ? 'bg-gray-800/80 hover:bg-gray-700 border border-gray-700/50'
                  : 'bg-red-600 hover:bg-red-700 border border-red-500/50'
              }`}
              title={isAudioEnabled ? 'Mute' : 'Unmute'}
            >
              {isAudioEnabled ? (
                <MicrophoneIcon className="h-4 w-4 sm:h-4 sm:w-4 text-white" />
              ) : (
                <MicrophoneOffIcon className="h-4 w-4 sm:h-4 sm:w-4 text-white" />
              )}
            </button>

            {/* Video Button */}
            <button
              onClick={toggleVideo}
              className={`p-3 sm:p-3.5 rounded-full transition-all shadow-lg hover:scale-105 ${
                isVideoEnabled
                  ? 'bg-gray-800/80 hover:bg-gray-700 border border-gray-700/50'
                  : 'bg-red-600 hover:bg-red-700 border border-red-500/50'
              }`}
              title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {isVideoEnabled ? (
                <VideoCameraIcon className="h-4 w-4 sm:h-4 sm:w-4 text-white" />
              ) : (
                <VideoCameraOffIcon className="h-4 w-4 sm:h-4 sm:w-4 text-white" />
              )}
            </button>

            {/* End Call Button - Prominent */}
            <button
              onClick={handleLeaveCall}
              className="p-3.5 sm:p-4 px-6 sm:px-7 rounded-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 transition-all shadow-xl hover:scale-105 border border-red-500/50"
              title={t.leaveCallTooltip}
            >
              <PhoneXMarkIcon className="h-4 w-4 sm:h-4 sm:w-4 text-white" />
            </button>

            {/* Screen Share Button (Hidden on small mobile) */}
            <button
              onClick={toggleScreenShare}
              className={`hidden sm:block p-3 sm:p-3.5 rounded-full transition-all shadow-lg hover:scale-105 ${
                isScreenSharing
                  ? 'bg-purple-600 hover:bg-purple-700 border border-purple-500/50'
                  : 'bg-gray-800/80 hover:bg-gray-700 border border-gray-700/50'
              }`}
              title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            >
              <ComputerDesktopIcon className="h-4 w-4 sm:h-4 sm:w-4 text-white" />
            </button>

            {/* Chat Button */}
            <button
              onClick={() => setShowChat(!showChat)}
              className={`p-3 sm:p-3.5 rounded-full transition-all shadow-lg hover:scale-105 ${
                showChat 
                  ? 'bg-purple-600 hover:bg-purple-700 border border-purple-500/50' 
                  : 'bg-gray-800/80 hover:bg-gray-700 border border-gray-700/50'
              }`}
              title={showChat ? 'Close chat' : 'Open chat'}
            >
              <ChatBubbleLeftRightIcon className="h-4 w-4 sm:h-4 sm:w-4 text-white" />
            </button>
            
            {/* Video Quality Button */}
            <div className="relative">
              <button
                onClick={() => setShowQualityMenu(!showQualityMenu)}
                className="p-3 sm:p-3.5 rounded-full transition-all shadow-lg hover:scale-105 bg-gray-800/80 hover:bg-gray-700 border border-gray-700/50"
                title={t.videoQualityTooltip}
              >
                <WifiIcon className="h-4 w-4 sm:h-4 sm:w-4 text-white" />
              </button>
              
              {/* Quality Menu */}
              {showQualityMenu && (
                <div className="absolute bottom-full mb-2 right-0 bg-gray-900 rounded-lg shadow-2xl p-2 min-w-[180px] border border-gray-700">
                  <div className="text-white text-xs font-semibold px-3 py-2 border-b border-gray-700">
                    {t.videoQuality}
                  </div>
                  {[
                    { value: 'high', label: t.highQuality720p, icon: '🔥' },
                    { value: 'medium', label: t.mediumQuality480p, icon: '⚡' },
                    { value: 'low', label: t.lowQuality240p, icon: '🌙', recommended: true },
                    { value: 'audio-only', label: t.audioOnly, icon: '📶' },
                    { value: 'ultra-low-audio', label: 'Ultra-low (Rural)', icon: '🌾' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleQualityChange(option.value as VideoQuality)}
                      className={`w-full text-left px-3 py-2 text-xs rounded transition-colors flex items-center justify-between ${
                        videoQuality === option.value
                          ? 'bg-purple-600 text-white'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{option.icon}</span>
                        <span>{option.label}</span>
                      </span>
                      {option.recommended && (
                        <span className="text-[9px] bg-green-500 text-white px-1.5 py-0.5 rounded">
                          Best
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Panel - PWA ChatApp Style */}
      {showChat && (
        <div className="w-full md:w-96 h-2/5 md:h-full bg-gradient-to-br from-purple-50 via-white to-purple-50/30 border-t md:border-t-0 md:border-l border-purple-100 flex flex-col z-40 animate-in slide-in-from-bottom md:slide-in-from-right duration-300 shadow-2xl">
          {/* Header - PWA Style */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 via-purple-500 to-purple-600 shadow-lg">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowChat(false)}
                className="p-1.5 hover:bg-white/20 rounded-full transition-all"
                title={t.closeChat}
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center">
                  <UserGroupIcon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{t.callChat}</h3>
                  <p className="text-[10px] text-white/80">{participants.length} participant{participants.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Messages - PWA ChatApp Style with Avatars */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-white/40 backdrop-blur-sm">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-400">
                  <div className="p-4 bg-gradient-to-br from-purple-100 to-purple-200 rounded-full inline-block mb-3">
                    <ChatBubbleLeftRightIcon className="h-8 w-8 text-purple-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">{t.noMessagesYet}</p>
                  <p className="text-xs mt-1 text-gray-400">{t.startConversation}</p>
                </div>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={`${msg.id}-${index}`} className={`flex items-end gap-2 ${msg.isOwn ? 'flex-row-reverse' : 'flex-row'} animate-in slide-in-from-bottom duration-200`}>
                  {/* Avatar */}
                  {!msg.isOwn && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm">
                      {msg.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  {/* Message Bubble */}
                  <div className={`max-w-[70%] ${
                    msg.isOwn 
                      ? 'bg-gradient-to-br from-purple-600 via-purple-500 to-purple-600 text-white' 
                      : 'bg-white text-gray-800 border border-purple-100'
                  } rounded-2xl ${
                    msg.isOwn 
                      ? 'rounded-br-md' 
                      : 'rounded-bl-md'
                  } px-3 py-2 shadow-sm`}>
                    {renderMessageContent(msg)}
                    <div className="flex items-center justify-end gap-1.5 mt-1">
                      <p className={`text-[9px] ${
                        msg.isOwn ? 'text-white/70' : 'text-gray-400'
                      }`}>
                        {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                      {renderMessageStatus(msg)}
                    </div>
                  </div>
                  
                  {/* Own Avatar */}
                  {msg.isOwn && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm">
                      {guestName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              ))
            )}
            {/* Auto-scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input - PWA ChatApp Style */}
          <form onSubmit={sendMessage} className="p-3 bg-white border-t border-purple-100 shadow-lg">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
            />
            <div className="flex items-center gap-2">
              {/* Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex-shrink-0 p-2 hover:bg-purple-50 rounded-full transition-colors disabled:opacity-50"
              >
                {isUploading ? (
                  <div className="h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <PaperClipIcon className="h-4 w-4 text-purple-600" />
                )}
              </button>
              
              {/* Message Input */}
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={t.typeMessage}
                  className="w-full px-4 py-2 pr-10 bg-purple-50/50 border border-purple-200 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-[11px] placeholder:text-gray-400 transition-all"
                  autoFocus
                />
                {/* Emoji Button (placeholder) */}
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-purple-600 transition-colors"
                >
                  <span className="text-lg">😊</span>
                </button>
              </div>
              
              {/* Translate Button */}
              <button
                type="button"
                onClick={handleTranslate}
                disabled={!messageInput.trim() || isTranslating}
                title={t.translateToBengali}
                className="flex-shrink-0 p-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-full hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg disabled:hover:shadow-md"
              >
                {isTranslating ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <LanguageIcon className="h-4 w-4" />
                )}
              </button>
              
              {/* Send Button */}
              <button
                type="submit"
                disabled={!messageInput.trim()}
                className="flex-shrink-0 p-2.5 bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-full hover:from-purple-700 hover:to-purple-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg disabled:hover:shadow-md"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
