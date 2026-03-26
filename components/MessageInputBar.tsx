'use client';

import { useState, useRef, useEffect } from 'react';
import { FaceSmileIcon, PaperClipIcon, MicrophoneIcon, TrashIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { PauseIcon, PlayIcon } from '@heroicons/react/24/solid';

const EMOJIS = ['😀','😊','👍','❤️','😂','🎉','🔥','✨','🙏','👋','😅','🤔','😍','🥳','💯','📎','🎤','📷','✅','❌'];
const WAVEFORM_BARS = 24;

type MessageInputBarProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  onFileSelect?: (file: File) => void;
  onVoiceRecord?: (blob: Blob) => void;
  /** When provided, green send button on the recording bar sends the voice note immediately instead of only adding to draft. */
  onVoiceRecordAndSend?: (blob: Blob) => void;
  attachmentPreview?: { name: string; type: 'file' | 'image' | 'voice' } | null;
  onClearAttachment?: () => void;
};

export default function MessageInputBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Type a message...',
  disabled,
  sending,
  onFileSelect,
  onVoiceRecord,
  onVoiceRecordAndSend,
  attachmentPreview,
  onClearAttachment,
}: MessageInputBarProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(() => Array(WAVEFORM_BARS).fill(0));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  const rafRef = useRef<number>(0);
  const sendAfterStopRef = useRef(false);

  const canSend = (value.trim() || attachmentPreview) && !sending && !disabled;

  const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    onSubmit();
  };

  const insertEmoji = (emoji: string) => {
    onChange(value + emoji);
  };

  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size > 0) {
          if (sendAfterStopRef.current && onVoiceRecordAndSend) onVoiceRecordAndSend(blob);
          else onVoiceRecord?.(blob);
        }
        sendAfterStopRef.current = false;
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingPaused(false);
      setElapsedSec(0);
      setWaveform(Array(WAVEFORM_BARS).fill(0));
      startTimeRef.current = Date.now();

      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.6;
        const src = ctx.createMediaStreamSource(stream);
        src.connect(analyser);
        analyserRef.current = { ctx, analyser };
      } catch (_) {
        analyserRef.current = null;
      }
    } catch (err) {
      console.error('Voice recording failed:', err);
    }
  };

  const cancelVoice = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      mr.stop();
      mediaRecorderRef.current = null;
      chunksRef.current = [];
    }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    analyserRef.current = null;
    setRecording(false);
    setRecordingPaused(false);
    setElapsedSec(0);
    setWaveform(Array(WAVEFORM_BARS).fill(0));
  };

  const stopAndSendVoice = () => {
    sendAfterStopRef.current = !!onVoiceRecordAndSend;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    analyserRef.current = null;
    setRecording(false);
    setRecordingPaused(false);
    setElapsedSec(0);
    setWaveform(Array(WAVEFORM_BARS).fill(0));
  };

  const togglePauseVoice = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (mr.state === 'paused') {
      mr.resume();
      startTimeRef.current = Date.now() - elapsedSec * 1000;
      setRecordingPaused(false);
    } else {
      mr.pause();
      setRecordingPaused(true);
    }
  };

  useEffect(() => {
    if (!recording) return;
    timerIntervalRef.current = setInterval(() => {
      if (!recordingPaused) setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 200);
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [recording, recordingPaused]);

  useEffect(() => {
    if (!recording || recordingPaused) return;
    const data = new Uint8Array(analyserRef.current?.analyser?.frequencyBinCount ?? 0);
    let cancelled = false;
    const tick = () => {
      if (cancelled || !analyserRef.current) return;
      const { analyser } = analyserRef.current;
      analyser.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor(data.length / WAVEFORM_BARS));
      const next = Array.from({ length: WAVEFORM_BARS }, (_, i) => {
        const v = data[Math.min(i * step, data.length - 1)] ?? 0;
        return Math.min(1, v / 128);
      });
      setWaveform(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [recording, recordingPaused]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect?.(file);
    e.target.value = '';
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4 bg-white">
      {attachmentPreview && !recording && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-gray-100 rounded-lg">
          <span className="text-sm text-gray-600 truncate flex-1">
            {attachmentPreview.type === 'voice' ? '🎤 Voice note' : attachmentPreview.type === 'image' ? '📷 Image' : '📎 ' + attachmentPreview.name}
          </span>
          {onClearAttachment && (
            <button type="button" onClick={onClearAttachment} className="text-gray-500 hover:text-red-600 p-1" aria-label="Remove attachment">
              ✕
            </button>
          )}
        </div>
      )}

      {recording && onVoiceRecord ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-gray-100 border border-gray-200 rounded-full min-h-[3rem]">
            <button type="button" onClick={cancelVoice} className="p-1.5 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-200" aria-label="Discard recording">
              <TrashIcon className="w-5 h-5" />
            </button>
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" aria-hidden />
            <span className="text-gray-700 font-mono text-sm tabular-nums shrink-0">{formatTime(elapsedSec)}</span>
            <div className="flex-1 flex items-center justify-center gap-0.5 min-w-0 h-6">
              {waveform.map((h, i) => (
                <div
                  key={i}
                  className="w-1 bg-gray-500 rounded-full shrink-0 transition-all duration-75"
                  style={{ height: `${Math.max(4, h * 20)}px` }}
                />
              ))}
            </div>
            <button type="button" onClick={togglePauseVoice} className="p-1.5 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-200" aria-label={recordingPaused ? 'Resume' : 'Pause'}>
              {recordingPaused ? <PlayIcon className="w-5 h-5" /> : <PauseIcon className="w-5 h-5" />}
            </button>
            <button type="button" onClick={stopAndSendVoice} className="p-2 bg-itutor-green hover:bg-emerald-600 text-white rounded-full shrink-0" aria-label="Send voice note">
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              rows={2}
              className="w-full px-4 py-3 pr-24 bg-gray-50 border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green resize-none placeholder-gray-500 disabled:opacity-50"
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-0.5">
              {/* Emoji */}
              <button
                type="button"
                onClick={() => setEmojiOpen((o) => !o)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                aria-label="Insert emoji"
              >
                <FaceSmileIcon className="w-5 h-5" />
              </button>
              {emojiOpen && (
                <>
                  <div className="fixed inset-0 z-10" aria-hidden onClick={() => setEmojiOpen(false)} />
                  <div className="absolute right-0 bottom-full mb-1 p-2 bg-white border border-gray-200 rounded-xl shadow-lg z-20 grid grid-cols-5 gap-1 w-[11rem]">
                    {EMOJIS.map((e) => (
                      <button key={e} type="button" onClick={() => { insertEmoji(e); setEmojiOpen(false); }} className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded">
                        {e}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {/* Attach file */}
              {onFileSelect && (
                <>
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.txt" onChange={handleFileChange} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Attach file">
                    <PaperClipIcon className="w-5 h-5" />
                  </button>
                </>
              )}
              {/* Voice */}
              {onVoiceRecord && (
                <button
                  type="button"
                  onClick={startVoice}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                  aria-label="Record voice"
                >
                  <MicrophoneIcon className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={!canSend}
            className="px-5 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
          >
            {sending ? <span className="animate-spin">⏳</span> : 'Send'}
          </button>
        </div>
      )}
    </form>
  );
}
