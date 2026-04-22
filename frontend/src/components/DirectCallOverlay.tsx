import { useEffect, useMemo, useRef } from 'react';
import { PhoneIcon, PhoneXMarkIcon, VideoCameraIcon, SignalIcon } from '@heroicons/react/24/outline';
import { getSocket } from '../services/socket';
import { useDirectCallStore } from '../stores/directCallStore';
import { useLanguageStore } from '../stores/languageStore';
import { translations } from '../i18n/translations';

function useRingtone(active: boolean): void {
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const playBeep = () => {
      try {
        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextCtor) return;
        const audioCtx = new AudioContextCtor();
        const oscillator = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gain.gain.value = 0.03;

        oscillator.connect(gain);
        gain.connect(audioCtx.destination);
        oscillator.start();

        window.setTimeout(() => {
          oscillator.stop();
          audioCtx.close();
        }, 250);
      } catch (_error) {
        // Ignore ringtone failures caused by browser autoplay policies.
      }
    };

    playBeep();
    intervalRef.current = window.setInterval(playBeep, 1200);

    // Attempt to vibrate (requires user interaction, may be blocked by browser)
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([250, 120, 250, 120, 250]);
      } catch (error) {
        // Silently ignore vibrate errors (blocked by browser policy)
      }
    }

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate(0);
        } catch (error) {
          // Silently ignore vibrate errors
        }
      }
    };
  }, [active]);
}

export default function DirectCallOverlay() {
  const {
    status,
    invitationId,
    callerName,
    calleeName,
    peerName,
    callType,
    signalBars,
    quality,
    reset,
    setStatus,
  } = useDirectCallStore();

  const { language } = useLanguageStore();
  const t = translations[language];

  const isVisible = status === 'incoming_call' || status === 'outgoing_call' || status === 'connecting';
  const isRinging = status === 'incoming_call' || status === 'outgoing_call';

  useRingtone(isRinging);

  const displayName = useMemo(() => {
    if (status === 'incoming_call') return callerName || t.unknownCaller;
    if (status === 'outgoing_call') return calleeName || t.unknown;
    return peerName || calleeName || callerName || t.connecting;
  }, [status, callerName, calleeName, peerName, t]);

  if (!isVisible) return null;

  const socket = getSocket();

  const handleAccept = () => {
    if (!socket || !invitationId) return;
    socket.emit('call:accept', { invitationId });
    setStatus('connecting');
  };

  const handleReject = () => {
    if (!socket || !invitationId) return;
    socket.emit('call:reject', { invitationId });
    setStatus('ended');
    setTimeout(reset, 500);
  };

  const handleCancel = () => {
    if (!socket || !invitationId) return;
    socket.emit('call:cancel', { invitationId });
    setStatus('ended');
    setTimeout(reset, 500);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-gradient-to-b from-purple-950/95 via-slate-900/95 to-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-purple-400/20 bg-slate-900/90 shadow-2xl p-6 text-center">
        <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center text-2xl font-bold shadow-xl">
          {(displayName || 'U').charAt(0).toUpperCase()}
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">{displayName}</h2>
        <p className="text-sm text-gray-300 mb-5">
          {status === 'incoming_call' && `${t.incomingCall} ${callType} ${t.calling.toLowerCase()}...`}
          {status === 'outgoing_call' && `${t.calling} ${displayName}...`}
          {status === 'connecting' && t.connectingCall}
        </p>

        <div className="mb-5 flex items-center justify-center gap-2 text-xs text-gray-200">
          <SignalIcon className="h-4 w-4" />
          <span className="uppercase tracking-wide">{quality}</span>
          <div className="flex items-end gap-0.5 ml-1">
            {[1, 2, 3, 4, 5].map((bar) => (
              <span
                key={bar}
                className={`w-1 rounded-sm ${bar <= signalBars ? 'bg-emerald-400' : 'bg-white/20'}`}
                style={{ height: `${bar * 4}px` }}
              />
            ))}
          </div>
        </div>

        <div className="mb-6 text-xs text-gray-300 rounded-xl border border-gray-700/70 bg-black/20 p-3">
          {t.audioFirstDesc}
        </div>

        {status === 'incoming_call' ? (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleReject}
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 transition-all shadow-lg flex items-center justify-center"
              title={t.rejectCall}
            >
              <PhoneXMarkIcon className="h-6 w-6 text-white" />
            </button>
            <button
              onClick={handleAccept}
              className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 transition-all shadow-lg flex items-center justify-center"
              title={t.acceptCall}
            >
              <PhoneIcon className="h-6 w-6 text-white" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleCancel}
              className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold shadow-lg"
            >
              {t.cancel}
            </button>
            {status === 'connecting' && (
              <div className="inline-flex items-center gap-1.5 text-emerald-300 text-xs font-semibold">
                <VideoCameraIcon className="h-4 w-4" />
                {t.preparingCallRoom}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
