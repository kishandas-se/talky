import { Socket } from 'socket.io-client';

// Production-grade ICE servers optimized for rural/low-bandwidth areas
const ICE_SERVERS = {
  iceServers: [
    // Multiple STUN servers for better NAT traversal in rural areas
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    // Free TURN servers with UDP, TCP, and TLS for challenging network conditions
    { 
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    { 
      urls: 'turn:openrelay.metered.ca:80?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    { 
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    { 
      urls: 'turns:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle' as RTCBundlePolicy,
  rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy,
};

// Low-bandwidth optimized configuration for very poor networks
const LOW_BANDWIDTH_ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { 
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    { 
      urls: 'turn:openrelay.metered.ca:80?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    { 
      urls: 'turns:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
  ],
  iceCandidatePoolSize: 5,
  bundlePolicy: 'max-bundle' as RTCBundlePolicy,
  rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy,
};

// Video quality presets for different bandwidth scenarios
export type VideoQuality = 'high' | 'medium' | 'low' | 'audio-only' | 'ultra-low-audio';

export interface VideoConstraints {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
}

const VIDEO_QUALITY_PRESETS: Record<VideoQuality, VideoConstraints | null> = {
  'high': { width: 1280, height: 720, frameRate: 30, maxBitrate: 2500000 },     // 2.5 Mbps - WiFi/4G+
  'medium': { width: 640, height: 480, frameRate: 20, maxBitrate: 800000 },     // 800 kbps - 3G/4G
  'low': { width: 320, height: 240, frameRate: 15, maxBitrate: 300000 },        // 300 kbps - 2G/slow 3G (Rural areas)
  'audio-only': null, // No video, audio only (16-24 kbps) - Works on any network
  'ultra-low-audio': null // Ultra-low audio (6-12 kbps) - Matches cellular codec efficiency for extreme rural areas
};

// Connection quality levels
export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'disconnected';

export interface ConnectionStats {
  quality: ConnectionQuality;
  bitrate: number;
  packetLoss: number;
  roundTripTime: number;
}

export class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private socket: Socket | null = null;
  private roomId: string | null = null;
  private connectionQuality: ConnectionQuality = 'excellent';
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;
  private qualityMonitors: Map<string, number> = new Map();
  private currentVideoQuality: VideoQuality = 'low'; // Default to low for better rural compatibility
  private isLowBandwidthMode: boolean = false;
  private latestStats: ConnectionStats | null = null;
  private networkMonitor: number | null = null;
  private lastNetworkType: string | null = null;
  private initialConnectionsComplete: Set<string> = new Set();
  private pendingIceCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  public onQualityChange?: (quality: ConnectionQuality) => void;
  public onReconnecting?: (attempt: number) => void;
  public onReconnected?: () => void;
  public onBandwidthWarning?: (message: string) => void;
  public onNetworkChange?: (type: string) => void;

  setSocket(socket: Socket) {
    this.socket = socket;
  }

  setRoomId(roomId: string) {
    this.roomId = roomId;
    // Start network monitoring when joining a room
    this.setupNetworkMonitoring();
  }

  /**
   * Enable low-bandwidth mode for rural/poor network areas
   */
  enableLowBandwidthMode(): void {
    this.isLowBandwidthMode = true;
    this.currentVideoQuality = 'low';
    console.log('📶 Low-bandwidth mode enabled - optimized for rural areas');
    this.onBandwidthWarning?.('Low-bandwidth mode active - optimized for poor network');
  }

  /**
   * Set video quality manually
   */
  async setVideoQuality(quality: VideoQuality): Promise<MediaStream | null> {
    const oldQuality = this.currentVideoQuality;
    this.currentVideoQuality = quality;
    console.log(`🎥 Video quality changed: ${oldQuality} → ${quality}`);
    
    // If we have an active stream, restart with new quality
    if (this.localStream) {
      const newStream = await this.restartWithQuality(quality);
      return newStream;
    }
    return null;
  }

  /**
   * Get local media stream with adaptive quality based on network
   */
  async getLocalStream(audio = true, video = true): Promise<MediaStream> {
    try {
      const quality = VIDEO_QUALITY_PRESETS[this.currentVideoQuality];
      
      // Audio-only mode for very poor networks
      if (this.currentVideoQuality === 'audio-only' || this.currentVideoQuality === 'ultra-low-audio' || !video) {
        const isUltraLow = this.currentVideoQuality === 'ultra-low-audio';
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: audio ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            // Ultra-low sample rate for extreme rural conditions (matches cellular codec)
            sampleRate: isUltraLow ? 8000 : (this.isLowBandwidthMode ? 16000 : 48000),
            channelCount: 1, // Mono for bandwidth savings
          } : false,
        });
        this.localStream = stream;
        console.log(`🎤 Audio-only stream acquired (${isUltraLow ? 'ultra-low 6-12kbps' : 'low-bandwidth 16-24kbps'})`);
        return stream;
      }

      // Video + Audio with quality constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? {
          width: { ideal: quality!.width, max: quality!.width },
          height: { ideal: quality!.height, max: quality!.height },
          frameRate: { ideal: quality!.frameRate, max: quality!.frameRate },
          facingMode: 'user',
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: this.isLowBandwidthMode ? 16000 : 48000,
        } : false,
      });
      
      this.localStream = stream;
      console.log(`🎥 Stream acquired - Quality: ${this.currentVideoQuality} (${quality!.width}x${quality!.height}@${quality!.frameRate}fps, ${(quality!.maxBitrate / 1000).toFixed(0)}kbps)`);
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      // Fallback to audio-only if video fails
      if (video && this.currentVideoQuality !== 'audio-only') {
        console.log('⚠️ Video failed, falling back to audio-only');
        this.currentVideoQuality = 'audio-only';
        return this.getLocalStream(audio, false);
      }
      throw error;
    }
  }

  /**
   * Restart stream with new quality settings
   */
  private async restartWithQuality(quality: VideoQuality): Promise<MediaStream> {
    const wasAudioEnabled = this.localStream?.getAudioTracks()[0]?.enabled ?? true;
    const wasVideoEnabled = this.localStream?.getVideoTracks()[0]?.enabled ?? true;
    
    // Stop old stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    
    // Get new stream with updated quality
    const newStream = await this.getLocalStream(wasAudioEnabled, quality !== 'audio-only');
    
    // Apply the previous enabled/disabled state to new tracks
    if (newStream.getAudioTracks()[0]) {
      newStream.getAudioTracks()[0].enabled = wasAudioEnabled;
    }
    if (newStream.getVideoTracks()[0]) {
      newStream.getVideoTracks()[0].enabled = wasVideoEnabled;
    }
    
    // Update local stream reference
    this.localStream = newStream;
    
    // Update all peer connections with new tracks
    this.peerConnections.forEach((pc) => {
      // Replace video track
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (videoSender && newVideoTrack) {
        videoSender.replaceTrack(newVideoTrack);
        console.log('✅ Replaced video track in peer connection');
      } else if (!videoSender && newVideoTrack) {
        // Add video track if switching from audio-only to video
        pc.addTrack(newVideoTrack, newStream);
        console.log('✅ Added video track to peer connection');
      }
      
      // Replace audio track
      const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio');
      const newAudioTrack = newStream.getAudioTracks()[0];
      if (audioSender && newAudioTrack) {
        audioSender.replaceTrack(newAudioTrack);
        console.log('✅ Replaced audio track in peer connection');
      }
    });
    
    return newStream;
  }

  async getDisplayMedia(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      return stream;
    } catch (error) {
      console.error('Error accessing display media:', error);
      throw error;
    }
  }

  createPeerConnection(targetSocketId: string, onRemoteStream?: (stream: MediaStream) => void): RTCPeerConnection {
    // Use low-bandwidth config if enabled
    const config = this.isLowBandwidthMode ? LOW_BANDWIDTH_ICE_SERVERS : ICE_SERVERS;
    const peerConnection = new RTCPeerConnection(config);

    // Add local stream tracks to peer connection with bandwidth limits
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        console.log(`Adding ${track.kind} track to peer connection for ${targetSocketId}`);
        const sender = peerConnection.addTrack(track, this.localStream!);
        
        // Apply bitrate limits based on quality settings
        const quality = VIDEO_QUALITY_PRESETS[this.currentVideoQuality];
        if (track.kind === 'video' && quality) {
          this.applyBitrateLimit(sender, quality.maxBitrate);
        }
        if (track.kind === 'audio') {
          const isUltraLow = this.currentVideoQuality === 'ultra-low-audio';
          const audioMaxBitrate = isUltraLow ? 12000 : (this.isLowBandwidthMode ? 16000 : 24000);
          this.applyAudioOptimization(sender, audioMaxBitrate, isUltraLow);
        }
      });

      // Prefer Opus codec for resilient low-bitrate voice quality with rural optimizations
      if ((window as any).RTCRtpSender?.getCapabilities) {
        const audioCapabilities = RTCRtpSender.getCapabilities('audio');
        const opusCodecs = audioCapabilities?.codecs?.filter((c) => c.mimeType.toLowerCase().includes('opus')) || [];
        const fallbackCodecs = audioCapabilities?.codecs?.filter((c) => !c.mimeType.toLowerCase().includes('opus')) || [];
        const preferredCodecs = [...opusCodecs, ...fallbackCodecs];

        peerConnection.getTransceivers().forEach((transceiver) => {
          if (transceiver.sender?.track?.kind === 'audio' && preferredCodecs.length > 0 && transceiver.setCodecPreferences) {
            transceiver.setCodecPreferences(preferredCodecs);
          }
        });
      }
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log(`Received remote ${event.track.kind} track from:`, targetSocketId);
      if (onRemoteStream && event.streams[0]) {
        console.log('Remote stream has tracks:', event.streams[0].getTracks().map(t => t.kind));
        onRemoteStream(event.streams[0]);
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        console.log('Sending ICE candidate to:', targetSocketId);
        this.socket.emit('ice-candidate', {
          roomId: this.roomId,
          candidate: event.candidate,
          targetSocketId,
        });
      }
    };

    // Handle connection state changes with auto-reconnection
    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state for ${targetSocketId}:`, peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'failed') {
        console.error('❌ Connection failed for peer:', targetSocketId);
        this.handleConnectionFailure(targetSocketId, onRemoteStream);
      } else if (peerConnection.connectionState === 'disconnected') {
        console.warn('⚠️ Connection disconnected for peer:', targetSocketId);
        // Wait before attempting reconnection
        setTimeout(() => {
          if (peerConnection.connectionState === 'disconnected') {
            this.handleConnectionFailure(targetSocketId, onRemoteStream);
          }
        }, 3000);
      } else if (peerConnection.connectionState === 'connected') {
        console.log('✅ Successfully connected to:', targetSocketId);
        // Reset reconnect attempts on successful connection
        this.reconnectAttempts.set(targetSocketId, 0);
        this.onReconnected?.();
        // Start monitoring connection quality
        this.startQualityMonitoring(targetSocketId);
      }
    };

    // Handle ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${targetSocketId}:`, peerConnection.iceConnectionState);
      
      if (peerConnection.iceConnectionState === 'failed') {
        console.log('🔄 ICE connection failed, attempting restart');
        peerConnection.restartIce();
      }
    };

    // Handle negotiation needed (e.g., when tracks are added dynamically)
    peerConnection.onnegotiationneeded = async () => {
      try {
        console.log('🔄 Renegotiation needed for:', targetSocketId);
        // Only create offer if we're in stable state and not already negotiating
        if (peerConnection.signalingState === 'stable') {
          const offer = await peerConnection.createOffer();
          // Do NOT optimize SDP during renegotiation - only on initial connection
          // This prevents m-line order changes that cause errors
          await peerConnection.setLocalDescription(offer);
          
          if (this.socket) {
            this.socket.emit('webrtc-offer', {
              roomId: this.roomId,
              offer,
              targetSocketId,
            });
            console.log('✅ Sent renegotiation offer to:', targetSocketId);
          }
        } else {
          console.log(`⏸️ Skipping renegotiation - peer in state: ${peerConnection.signalingState}`);
        }
      } catch (error) {
        console.error('Error during renegotiation:', error);
      }
    };

    this.peerConnections.set(targetSocketId, peerConnection);
    return peerConnection;
  }

  async createOffer(targetSocketId: string, onRemoteStream?: (stream: MediaStream) => void): Promise<void> {
    const peerConnection = this.createPeerConnection(targetSocketId, onRemoteStream);

    try {
      const offer = await peerConnection.createOffer();
      // Optimize Opus codec only on initial connection
      const optimizedOffer = this.optimizeOpusSDP(offer);
      await peerConnection.setLocalDescription(optimizedOffer);
      
      // Mark this connection as having completed initial setup
      this.initialConnectionsComplete.add(targetSocketId);

      if (this.socket) {
        this.socket.emit('webrtc-offer', {
          roomId: this.roomId,
          offer: optimizedOffer,
          targetSocketId,
        });
      }
    } catch (error) {
      console.error('Error creating offer:', error);
      throw error;
    }
  }

  async handleOffer(offer: RTCSessionDescriptionInit, senderSocketId: string, onRemoteStream?: (stream: MediaStream) => void): Promise<RTCSessionDescriptionInit> {
    // Check if we already have a peer connection with this socket
    let peerConnection = this.peerConnections.get(senderSocketId);
    
    // If peer connection exists and is in wrong state, close it and create new one
    if (peerConnection) {
      if (peerConnection.signalingState !== 'stable') {
        console.log('Existing peer connection in non-stable state, closing and recreating');
        peerConnection.close();
        this.peerConnections.delete(senderSocketId);
        peerConnection = this.createPeerConnection(senderSocketId, onRemoteStream);
      }
    } else {
      peerConnection = this.createPeerConnection(senderSocketId, onRemoteStream);
    }

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      // Optimize Opus codec only on initial connection
      const optimizedAnswer = this.optimizeOpusSDP(answer);
      await peerConnection.setLocalDescription(optimizedAnswer);
      console.log('✅ Created and sent answer');
      
      // Mark this connection as having completed initial setup
      this.initialConnectionsComplete.add(senderSocketId);
      
      // Apply any pending ICE candidates now that remote description is set
      await this.applyPendingIceCandidates(senderSocketId, peerConnection);

      return optimizedAnswer;
    } catch (error) {
      console.error('Error handling offer:', error);
      throw error;
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit, senderSocketId: string): Promise<void> {
    const peerConnection = this.peerConnections.get(senderSocketId);

    if (peerConnection) {
      try {
        // Check if we're in the correct state to set remote description
        if (peerConnection.signalingState !== 'have-local-offer') {
          console.warn(`Cannot set answer - peer connection in state: ${peerConnection.signalingState}`);
          return;
        }
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('✅ Remote answer set successfully');
        
        // Apply any pending ICE candidates now that remote description is set
        await this.applyPendingIceCandidates(senderSocketId, peerConnection);
      } catch (error) {
        console.error('Error handling answer:', error);
        throw error;
      }
    } else {
      console.warn('No peer connection found for:', senderSocketId);
    }
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit, senderSocketId: string): Promise<void> {
    const peerConnection = this.peerConnections.get(senderSocketId);

    if (peerConnection) {
      try {
        // Only add ICE candidate if remote description is set
        if (peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('✅ ICE candidate added for:', senderSocketId);
        } else {
          // Queue ICE candidate until remote description is set
          console.log('📥 Queueing ICE candidate (remote description not set yet) for:', senderSocketId);
          if (!this.pendingIceCandidates.has(senderSocketId)) {
            this.pendingIceCandidates.set(senderSocketId, []);
          }
          this.pendingIceCandidates.get(senderSocketId)!.push(candidate);
        }
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    }
  }

  private async applyPendingIceCandidates(socketId: string, peerConnection: RTCPeerConnection): Promise<void> {
    const pending = this.pendingIceCandidates.get(socketId);
    if (pending && pending.length > 0) {
      console.log(`📤 Applying ${pending.length} pending ICE candidates for:`, socketId);
      for (const candidate of pending) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Error applying pending ICE candidate:', error);
        }
      }
      this.pendingIceCandidates.delete(socketId);
    }
  }

  onRemoteStream(callback: (socketId: string, stream: MediaStream) => void) {
    this.peerConnections.forEach((peerConnection, socketId) => {
      peerConnection.ontrack = (event) => {
        console.log('Received remote stream from:', socketId);
        callback(socketId, event.streams[0]);
      };
    });
  }

  getPeerConnection(socketId: string): RTCPeerConnection | undefined {
    return this.peerConnections.get(socketId);
  }

  toggleAudio(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  toggleVideo(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  async replaceVideoTrack(newStream: MediaStream) {
    const videoTrack = newStream.getVideoTracks()[0];
    
    this.peerConnections.forEach((peerConnection) => {
      const sender = peerConnection.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack);
      }
    });

    // Replace local stream video track
    if (this.localStream) {
      const oldVideoTrack = this.localStream.getVideoTracks()[0];
      if (oldVideoTrack) {
        oldVideoTrack.stop();
        this.localStream.removeTrack(oldVideoTrack);
      }
      this.localStream.addTrack(videoTrack);
    }
  }

  /**
   * Add video track to an audio-only call
   * @param videoTrack The video track to add
   */
  async addVideoTrack(videoTrack: MediaStreamTrack): Promise<void> {
    console.log('➕ Adding video track to peer connections...');
    
    // Add to local stream
    if (this.localStream) {
      this.localStream.addTrack(videoTrack);
      console.log('✅ Added video track to local stream');
    }

    // Add to all peer connections
    let trackAdded = false;
    this.peerConnections.forEach((peerConnection, socketId) => {
      const videoSender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
      
      if (!videoSender) {
        // No video sender exists, add the track
        peerConnection.addTrack(videoTrack, this.localStream!);
        console.log(`✅ Added video track to peer connection ${socketId}`);
        trackAdded = true;
      } else if (videoSender.track === null || !videoSender.track.enabled) {
        // Video sender exists but no active track, replace it
        videoSender.replaceTrack(videoTrack);
        console.log(`✅ Replaced video track in peer connection ${socketId}`);
        trackAdded = true;
      } else {
        console.log(`ℹ️ Video sender already has active track in peer connection ${socketId}`);
      }
    });

    if (trackAdded) {
      console.log('✅ Video track added successfully, renegotiation will be triggered automatically');
    }
  }

  removePeer(socketId: string): void {
    const peerConnection = this.peerConnections.get(socketId);
    if (peerConnection) {
      // Close peer connection
      peerConnection.close();
      this.peerConnections.delete(socketId);
    }
    
    // Stop quality monitoring
    this.stopQualityMonitoring(socketId);
    
    // Clear reconnect attempts
    this.reconnectAttempts.delete(socketId);
    
    // Clear initial connection tracking
    this.initialConnectionsComplete.delete(socketId);
    
    // Clear pending ICE candidates
    this.pendingIceCandidates.delete(socketId);
    
    console.log('🧹 Cleaned up peer connection for:', socketId);
  }

  /**
   * Handle connection failure with exponential backoff reconnection
   * Enhanced: Switches to ultra-low mode on final attempt before giving up
   */
  private async handleConnectionFailure(targetSocketId: string, onRemoteStream?: (stream: MediaStream) => void) {
    const attempts = this.reconnectAttempts.get(targetSocketId) || 0;
    
    // On final attempt, switch to ultra-low audio mode as last resort
    if (attempts === this.maxReconnectAttempts - 1 && this.currentVideoQuality !== 'ultra-low-audio') {
      console.log('🚨 Final reconnection attempt - switching to ultra-low audio mode (6-12 kbps)');
      this.currentVideoQuality = 'ultra-low-audio';
      this.isLowBandwidthMode = true;
      this.onBandwidthWarning?.('Final attempt: Ultra-low audio mode (cellular-quality)');
      
      try {
        await this.restartWithQuality('ultra-low-audio');
      } catch (error) {
        console.error('Failed to switch to ultra-low mode:', error);
      }
    }
    
    if (attempts >= this.maxReconnectAttempts) {
      console.error(`Max reconnection attempts reached for ${targetSocketId}`);
      this.updateQuality('disconnected');
      this.onBandwidthWarning?.('Connection lost - please check network and retry');
      return;
    }

    const newAttempts = attempts + 1;
    this.reconnectAttempts.set(targetSocketId, newAttempts);
    this.onReconnecting?.(newAttempts);

    // Exponential backoff: 2^attempt * 1000ms (1s, 2s, 4s, 8s, 16s)
    const delay = Math.min(Math.pow(2, attempts) * 1000, 16000);
    console.log(`🔄 Reconnecting to ${targetSocketId} (attempt ${newAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);

    setTimeout(async () => {
      try {
        // Remove old peer connection
        const oldPeer = this.peerConnections.get(targetSocketId);
        if (oldPeer) {
          oldPeer.close();
          this.peerConnections.delete(targetSocketId);
        }

        // Create new offer to reconnect
        await this.createOffer(targetSocketId, onRemoteStream);
      } catch (error) {
        console.error('Reconnection attempt failed:', error);
        // Try again with next backoff
        this.handleConnectionFailure(targetSocketId, onRemoteStream);
      }
    }, delay);
  }

  /**
   * Start monitoring connection quality and adapt bitrate
   */
  private startQualityMonitoring(targetSocketId: string): void {
    // Clear any existing monitor
    this.stopQualityMonitoring(targetSocketId);

    const monitor = window.setInterval(async () => {
      const peerConnection = this.peerConnections.get(targetSocketId);
      if (!peerConnection) {
        this.stopQualityMonitoring(targetSocketId);
        return;
      }

      try {
        const stats = await this.getConnectionStats(peerConnection);
        const quality = this.determineQuality(stats);
        
        if (quality !== this.connectionQuality) {
          this.connectionQuality = quality;
          this.onQualityChange?.(quality);
          console.log(`📊 Connection quality: ${quality}`);
        }

        // Adaptive bitrate based on quality
        if (quality === 'poor') {
          await this.reduceBitrate(peerConnection);
        } else if (quality === 'excellent') {
          await this.increaseBitrate(peerConnection);
        }
      } catch (error) {
        console.error('Error monitoring quality:', error);
      }
    }, 2000); // Check every 2 seconds

    this.qualityMonitors.set(targetSocketId, monitor);
  }

  private stopQualityMonitoring(targetSocketId: string) {
    const monitor = this.qualityMonitors.get(targetSocketId);
    if (monitor) {
      clearInterval(monitor);
      this.qualityMonitors.delete(targetSocketId);
    }
  }

  /**
   * Get connection statistics
   */
  private async getConnectionStats(peerConnection: RTCPeerConnection): Promise<ConnectionStats> {
    const stats = await peerConnection.getStats();
    let bitrate = 0;
    let packetLoss = 0;
    let roundTripTime = 0;

    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && (report.kind === 'video' || report.kind === 'audio')) {
        // Calculate bitrate
        if (report.bytesReceived && report.timestamp) {
          bitrate += (report.bytesReceived * 8) / 1000; // kbps
        }
        // Packet loss
        if (report.packetsLost && report.packetsReceived) {
          packetLoss = (report.packetsLost / (report.packetsReceived + report.packetsLost)) * 100;
        }
      }
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        roundTripTime = report.currentRoundTripTime * 1000 || 0; // Convert to ms
      }
    });

    const computedStats = {
      quality: this.connectionQuality,
      bitrate,
      packetLoss,
      roundTripTime,
    };

    this.latestStats = computedStats;
    return computedStats;
  }

  /**
   * Determine connection quality based on stats - Balanced thresholds for rural areas
   */
  private determineQuality(stats: ConnectionStats): ConnectionQuality {
    // Balanced thresholds - not too aggressive to avoid audio interruption
    if (stats.packetLoss > 15 || stats.roundTripTime > 800) {
      return 'poor';
    } else if (stats.packetLoss > 8 || stats.roundTripTime > 500) {
      return 'good';
    } else {
      return 'excellent';
    }
  }

  /**
   * Apply bitrate limit to sender
   */
  private async applyBitrateLimit(sender: RTCRtpSender, maxBitrate: number): Promise<void> {
    try {
      const parameters = sender.getParameters();
      if (!parameters.encodings) {
        parameters.encodings = [{}];
      }
      parameters.encodings[0].maxBitrate = maxBitrate;
      await sender.setParameters(parameters);
      console.log(`📊 Applied bitrate limit: ${(maxBitrate / 1000).toFixed(0)} kbps`)
    } catch (error) {
      console.error('Error applying bitrate limit:', error);
    }
  }

  /**
   * Apply low-bitrate audio optimization (Opus-friendly constraints)
   */
  private async applyAudioOptimization(sender: RTCRtpSender, maxBitrate: number, ultraLow: boolean): Promise<void> {
    try {
      const parameters = sender.getParameters();
      if (!parameters.encodings) {
        parameters.encodings = [{}];
      }

      // Only modify the encodings - other fields are read-only
      // Support ultra-low bitrates (6-12 kbps) for extreme rural scenarios
      parameters.encodings[0].maxBitrate = maxBitrate;
      
      // Note: DTX and other codec parameters are set via SDP negotiation,
      // not through setParameters(). The Opus codec preference is set
      // during peer connection creation in createPeerConnection().

      await sender.setParameters(parameters);
      const mode = ultraLow ? 'ultra-low (6-12kbps)' : 'normal';
      console.log(`🎤 Applied audio optimization: ${(maxBitrate / 1000).toFixed(0)}kbps (${mode} mode)`);
    } catch (error) {
      console.error('Error applying audio optimization:', error);
    }
  }

  /**
   * Reduce bitrate for poor connection - Balanced approach
   */
  private async reduceBitrate(peerConnection: RTCPeerConnection): Promise<void> {
    const stats = await this.getConnectionStats(peerConnection);
    const severe = stats.packetLoss > 20 || stats.roundTripTime > 1000;
    const critical = stats.packetLoss > 12 || stats.roundTripTime > 700;
    const senders = peerConnection.getSenders();
    
    for (const sender of senders) {
      if (sender.track?.kind === 'video') {
        if (severe && sender.track.enabled && this.currentVideoQuality !== 'audio-only' && this.currentVideoQuality !== 'ultra-low-audio') {
          // Only pause video in severe conditions (>20% packet loss)
          sender.track.enabled = false;
          this.onBandwidthWarning?.('Severe network issues - paused video to maintain audio');
          console.log('⏸️ Video paused due to severe packet loss (>20%)');
        } else if (critical && sender.track.enabled) {
          // Reduce video bitrate in critical conditions
          const currentQuality = VIDEO_QUALITY_PRESETS[this.currentVideoQuality];
          const targetBitrate = currentQuality ? Math.max(currentQuality.maxBitrate * 0.5, 150000) : 150000;
          await this.applyBitrateLimit(sender, targetBitrate);
          console.log(`🔽 Reduced video bitrate to ${(targetBitrate / 1000).toFixed(0)}kbps due to critical conditions`);
        }
      }

      if (sender.track?.kind === 'audio') {
        // Only reduce audio bitrate in severe conditions, never disable it
        if (severe) {
          const isUltraLow = this.currentVideoQuality === 'ultra-low-audio';
          const targetBitrate = isUltraLow ? 6000 : 12000;
          await this.applyAudioOptimization(sender, targetBitrate, true);
          console.log(`🎤 Reduced audio to minimum bitrate (${targetBitrate / 1000}kbps) due to severe conditions`);
        }
      }
    }
  }

  /**
   * Increase bitrate for good connection - But respect quality settings
   */
  private async increaseBitrate(peerConnection: RTCPeerConnection): Promise<void> {
    const senders = peerConnection.getSenders();
    for (const sender of senders) {
      if (sender.track?.kind === 'video') {
        // Re-enable video if it was paused and connection improved
        if (!sender.track.enabled && this.currentVideoQuality !== 'audio-only' && this.currentVideoQuality !== 'ultra-low-audio') {
          sender.track.enabled = true;
          console.log('▶️ Video re-enabled - connection improved');
        }
        
        // Increase bitrate but don't exceed the current quality preset limit
        const currentQuality = VIDEO_QUALITY_PRESETS[this.currentVideoQuality];
        const maxAllowedBitrate = currentQuality?.maxBitrate || 2000000;
        
        await this.applyBitrateLimit(sender, maxAllowedBitrate);
        console.log(`🔼 Increased video bitrate to ${(maxAllowedBitrate / 1000).toFixed(0)}kbps (${this.currentVideoQuality} quality)`);
      }

      if (sender.track?.kind === 'audio') {
        const isUltraLow = this.currentVideoQuality === 'ultra-low-audio';
        const normalBitrate = isUltraLow ? 12000 : 24000;
        await this.applyAudioOptimization(sender, normalBitrate, isUltraLow);
      }
    }
  }

  getSignalBars(): 1 | 2 | 3 | 4 | 5 {
    if (!this.latestStats) {
      switch (this.connectionQuality) {
        case 'excellent':
          return 5;
        case 'good':
          return 4;
        case 'poor':
          return 2;
        case 'disconnected':
          return 1;
      }
    }

    const stats = this.latestStats;
    if (!stats) return 5;

    // Updated thresholds matching determineQuality
    if (stats.packetLoss > 15 || stats.roundTripTime > 800) return 1;
    if (stats.packetLoss > 10 || stats.roundTripTime > 600) return 2;
    if (stats.packetLoss > 5 || stats.roundTripTime > 400) return 3;
    if (stats.packetLoss > 2 || stats.roundTripTime > 250) return 4;
    return 5;
  }

  /**
   * Setup network monitoring for automatic quality adaptation
   * Phase 2: Network change detection
   */
  private setupNetworkMonitoring(): void {
    // Clean up existing monitor
    if (this.networkMonitor) {
      clearInterval(this.networkMonitor);
    }

    // Monitor network type changes using Network Information API
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      
      // Get initial network type
      this.lastNetworkType = connection?.effectiveType || 'unknown';
      console.log(`📶 Initial network type: ${this.lastNetworkType}`);

      // Listen for network changes
      const handleNetworkChange = () => {
        const newType = connection?.effectiveType || 'unknown';
        if (newType !== this.lastNetworkType) {
          console.log(`📶 Network changed: ${this.lastNetworkType} → ${newType}`);
          this.lastNetworkType = newType;
          this.onNetworkChange?.(newType);
          
          // Auto-adapt quality based on network type
          this.adaptToNetworkType(newType);
        }
      };

      connection?.addEventListener('change', handleNetworkChange);
    }

    // Monitor online/offline events
    const handleOnline = () => {
      console.log('🟢 Network online');
      this.onNetworkChange?.('online');
    };

    const handleOffline = () => {
      console.log('🔴 Network offline');
      this.onNetworkChange?.('offline');
      this.updateQuality('disconnected');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    console.log('✅ Network monitoring enabled');
  }

  /**
   * Adapt quality based on detected network type
   */
  private async adaptToNetworkType(networkType: string): Promise<void> {
    switch (networkType) {
      case 'slow-2g':
      case '2g':
        console.log('📶 2G network detected - switching to ultra-low audio mode');
        if (this.currentVideoQuality !== 'ultra-low-audio') {
          await this.setVideoQuality('ultra-low-audio');
          this.onBandwidthWarning?.('2G network: Ultra-low audio mode active');
        }
        break;
      
      case '3g':
        console.log('📶 3G network detected - switching to audio-only mode');
        if (this.currentVideoQuality !== 'audio-only' && this.currentVideoQuality !== 'ultra-low-audio') {
          await this.setVideoQuality('audio-only');
          this.onBandwidthWarning?.('3G network: Audio-only mode active');
        }
        break;
      
      case '4g':
        console.log('📶 4G network detected - switching to low quality');
        if (this.currentVideoQuality === 'ultra-low-audio' || this.currentVideoQuality === 'audio-only') {
          await this.setVideoQuality('low');
        }
        break;
    }
  }

  /**
   * Optimize Opus codec parameters in SDP for rural networks
   * Enables FEC, DTX, and low-bitrate flags
   */
  private optimizeOpusSDP(description: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
    if (!description.sdp) return description;

    let sdp = description.sdp;
    const isUltraLow = this.currentVideoQuality === 'ultra-low-audio';
    
    // Find Opus codec line (e.g., "a=rtpmap:111 opus/48000/2")
    const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/\d+\/\d+/);
    if (opusMatch) {
      const opusPayloadType = opusMatch[1];
      
      // Look for existing fmtp line for Opus
      const fmtpRegex = new RegExp(`a=fmtp:${opusPayloadType} (.+)`);
      const fmtpMatch = sdp.match(fmtpRegex);
      
      // Opus parameters optimized for rural networks:
      // - maxaveragebitrate: 6000-12000 for ultra-low, 16000-24000 for normal
      // - useinbandfec=1: Forward Error Correction for packet loss resilience
      // - usedtx=1: Discontinuous Transmission to save bandwidth during silence
      // - stereo=0: Mono audio for bandwidth savings
      // - cbr=1: Constant Bitrate for predictable bandwidth usage
      const maxBitrate = isUltraLow ? 12000 : 24000;
      const opusParams = `maxaveragebitrate=${maxBitrate};useinbandfec=1;usedtx=1;stereo=0;cbr=1`;
      
      if (fmtpMatch) {
        // Replace existing fmtp line
        sdp = sdp.replace(fmtpRegex, `a=fmtp:${opusPayloadType} ${opusParams}`);
      } else {
        // Add new fmtp line after rtpmap
        const rtpmapLine = `a=rtpmap:${opusPayloadType} opus/48000/2`;
        sdp = sdp.replace(rtpmapLine, `${rtpmapLine}\r\na=fmtp:${opusPayloadType} ${opusParams}`);
      }
      
      console.log(`🎵 Opus SDP optimized: ${opusParams}`);
    }

    return { ...description, sdp };
  }

  private updateQuality(quality: ConnectionQuality): void {
    if (this.connectionQuality !== quality) {
      this.connectionQuality = quality;
      this.onQualityChange?.(quality);
    }
  }

  /**
   * Get current connection quality
   */
  getConnectionQuality(): ConnectionQuality {
    return this.connectionQuality;
  }

  /**
   * Get current video quality setting
   */
  getCurrentVideoQuality(): VideoQuality {
    return this.currentVideoQuality;
  }

  /**
   * Check if low-bandwidth mode is enabled
   */
  isInLowBandwidthMode(): boolean {
    return this.isLowBandwidthMode;
  }

  /**
   * Auto-optimize based on real-time network statistics
   * Call this periodically from UI to get optimization suggestions
   */
  async autoOptimizeForBandwidth(peerConnection: RTCPeerConnection): Promise<{ shouldDowngrade: boolean; suggestedQuality: VideoQuality | null }> {
    try {
      const stats = await this.getConnectionStats(peerConnection);
      
      // Very poor connection - suggest audio-only
      if (stats.packetLoss > 20 || stats.roundTripTime > 1000) {
        return { shouldDowngrade: true, suggestedQuality: 'audio-only' };
      }
      
      // Poor connection - suggest low quality
      if (stats.packetLoss > 15 || stats.roundTripTime > 800) {
        if (this.currentVideoQuality !== 'low' && this.currentVideoQuality !== 'audio-only') {
          return { shouldDowngrade: true, suggestedQuality: 'low' };
        }
      }
      
      // Moderate connection - suggest medium
      if (stats.packetLoss > 8 || stats.roundTripTime > 400) {
        if (this.currentVideoQuality === 'high') {
          return { shouldDowngrade: true, suggestedQuality: 'medium' };
        }
      }
      
      return { shouldDowngrade: false, suggestedQuality: null };
    } catch (error) {
      console.error('Error in auto-optimization:', error);
      return { shouldDowngrade: false, suggestedQuality: null };
    }
  }

  /**
   * Comprehensive cleanup - stops all connections, streams, and monitoring
   */
  cleanup(): void {
    console.log('🧹 Starting WebRTC cleanup...');
    
    // Stop network monitoring
    if (this.networkMonitor) {
      clearInterval(this.networkMonitor);
      this.networkMonitor = null;
      console.log('  ✓ Stopped network monitor');
    }
    
    // Stop all quality monitoring
    this.qualityMonitors.forEach((monitor, socketId) => {
      clearInterval(monitor);
      console.log(`  ✓ Stopped quality monitor for ${socketId}`);
    });
    this.qualityMonitors.clear();
    
    // Close all peer connections
    this.peerConnections.forEach((peerConnection, socketId) => {
      peerConnection.close();
      console.log(`  ✓ Closed peer connection for ${socketId}`);
    });
    this.peerConnections.clear();
    
    // Clear reconnection attempts
    this.reconnectAttempts.clear();
    
    // Clear initial connection tracking
    this.initialConnectionsComplete.clear();
    
    // Clear pending ICE candidates
    this.pendingIceCandidates.clear();

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
        console.log(`  ✓ Stopped ${track.kind} track`);
      });
      this.localStream = null;
    }

    // Reset state
    this.roomId = null;
    this.socket = null;
    this.connectionQuality = 'excellent';
    this.lastNetworkType = null;
    
    console.log('✅ WebRTC cleanup complete');
  }

  getCurrentLocalStream(): MediaStream | null {
    return this.localStream;
  }
}

export default new WebRTCService();
