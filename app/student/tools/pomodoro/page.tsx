'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, Pause, RotateCcw, Settings2, Coffee, Brain, ChevronUp, ChevronDown, X, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

type Phase = 'focus' | 'shortBreak' | 'longBreak';
type TimerState = 'idle' | 'running' | 'paused';

function computeSessionPlan(focusMins: number) {
  if (focusMins <= 15) return { shortBreak: 3, longBreak: 10, sessionsBeforeLong: 4 };
  if (focusMins <= 25) return { shortBreak: 5, longBreak: 15, sessionsBeforeLong: 4 };
  if (focusMins <= 45) return { shortBreak: 8, longBreak: 20, sessionsBeforeLong: 3 };
  return { shortBreak: 10, longBreak: 25, sessionsBeforeLong: 3 };
}

const PHASE_META: Record<Phase, { label: string; color: string; ringColor: string; bgGradient: string; icon: typeof Brain }> = {
  focus: { label: 'Focus', color: 'text-brand-deep', ringColor: 'stroke-brand', bgGradient: 'from-brand-soft/40 to-background', icon: Brain },
  shortBreak: { label: 'Short Break', color: 'text-coral', ringColor: 'stroke-coral', bgGradient: 'from-coral-soft/40 to-background', icon: Coffee },
  longBreak: { label: 'Long Break', color: 'text-sky', ringColor: 'stroke-[var(--sky)]', bgGradient: 'from-sky/20 to-background', icon: Coffee },
};

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(830, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
    gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 1);
  } catch {}
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function PomodoroPage() {
  const [focusDuration, setFocusDuration] = useState(25);
  const [phase, setPhase] = useState<Phase>('focus');
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [totalFocusSeconds, setTotalFocusSeconds] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const plan = computeSessionPlan(focusDuration);

  const phaseDuration = useCallback(() => {
    switch (phase) {
      case 'focus': return focusDuration * 60;
      case 'shortBreak': return plan.shortBreak * 60;
      case 'longBreak': return plan.longBreak * 60;
    }
  }, [phase, focusDuration, plan]);

  const progress = 1 - secondsLeft / phaseDuration();

  useEffect(() => {
    if (timerState === 'running') {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            return 0;
          }
          return prev - 1;
        });
        if (phase === 'focus') {
          setTotalFocusSeconds((t) => t + 1);
        }
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerState, phase]);

  useEffect(() => {
    if (secondsLeft === 0 && timerState === 'running') {
      setTimerState('idle');
      if (soundEnabled) playChime();

      if (phase === 'focus') {
        const next = completedSessions + 1;
        setCompletedSessions(next);
        if (next % plan.sessionsBeforeLong === 0) {
          setPhase('longBreak');
          setSecondsLeft(plan.longBreak * 60);
        } else {
          setPhase('shortBreak');
          setSecondsLeft(plan.shortBreak * 60);
        }
      } else {
        setPhase('focus');
        setSecondsLeft(focusDuration * 60);
      }
    }
  }, [secondsLeft, timerState, phase, completedSessions, focusDuration, plan, soundEnabled]);

  function handleStart() {
    if (timerState === 'idle' && secondsLeft === 0) {
      setSecondsLeft(phaseDuration());
    }
    setTimerState('running');
  }

  function handlePause() {
    setTimerState('paused');
  }

  function handleReset() {
    setTimerState('idle');
    setPhase('focus');
    setSecondsLeft(focusDuration * 60);
    setCompletedSessions(0);
    setTotalFocusSeconds(0);
  }

  function adjustDuration(delta: number) {
    const next = Math.max(5, Math.min(90, focusDuration + delta));
    setFocusDuration(next);
    if (timerState === 'idle' && phase === 'focus') {
      setSecondsLeft(next * 60);
    }
  }

  const meta = PHASE_META[phase];
  const circumference = 2 * Math.PI * 140;
  const strokeDashoffset = circumference * (1 - progress);

  const focusMinsDone = Math.floor(totalFocusSeconds / 60);

  const sessionDots = Array.from({ length: plan.sessionsBeforeLong }, (_, i) => i < (completedSessions % plan.sessionsBeforeLong || (completedSessions > 0 && phase !== 'focus' ? plan.sessionsBeforeLong : 0)));

  return (
    <div className={cn('min-h-screen bg-gradient-to-b transition-colors duration-700', meta.bgGradient)}>
      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/student/tools" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink transition">
            <ArrowLeft className="size-4" /> Tools
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="size-9 rounded-xl hover:bg-muted grid place-items-center transition"
              title={soundEnabled ? 'Mute' : 'Unmute'}
            >
              {soundEnabled ? <Volume2 className="size-4 text-muted-foreground" /> : <VolumeX className="size-4 text-muted-foreground" />}
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn('size-9 rounded-xl grid place-items-center transition', showSettings ? 'bg-ink text-white' : 'hover:bg-muted text-muted-foreground')}
            >
              <Settings2 className="size-4" />
            </button>
          </div>
        </div>

        {/* Phase indicator */}
        <div className="text-center mb-2">
          <div className={cn('inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold', phase === 'focus' ? 'bg-brand-soft text-brand-deep' : phase === 'shortBreak' ? 'bg-coral-soft text-coral' : 'bg-sky/20 text-sky')}>
            <meta.icon className="size-4" />
            {meta.label}
          </div>
        </div>

        {/* Session dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {sessionDots.map((done, i) => (
            <div
              key={i}
              className={cn('size-2.5 rounded-full transition-all', done ? 'bg-brand scale-110' : 'bg-border')}
            />
          ))}
        </div>

        {/* Timer ring */}
        <div className="flex-1 flex items-center justify-center">
          <div className="relative">
            <svg width="320" height="320" viewBox="0 0 320 320" className="transform -rotate-90">
              <circle cx="160" cy="160" r="140" fill="none" stroke="var(--border)" strokeWidth="6" />
              <circle
                cx="160"
                cy="160"
                r="140"
                fill="none"
                className={cn(meta.ringColor, 'transition-all duration-300')}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {/* Duration adjuster (only in idle focus) */}
              {timerState === 'idle' && phase === 'focus' && (
                <button
                  onClick={() => adjustDuration(5)}
                  className="size-8 rounded-full hover:bg-muted grid place-items-center transition mb-1"
                >
                  <ChevronUp className="size-5 text-muted-foreground" />
                </button>
              )}
              <div className={cn('text-6xl font-bold tabular-nums tracking-tight', meta.color)}>
                {formatTime(secondsLeft)}
              </div>
              {timerState === 'idle' && phase === 'focus' && (
                <button
                  onClick={() => adjustDuration(-5)}
                  className="size-8 rounded-full hover:bg-muted grid place-items-center transition mt-1"
                >
                  <ChevronDown className="size-5 text-muted-foreground" />
                </button>
              )}
              {timerState !== 'idle' && (
                <div className="text-xs text-muted-foreground mt-1 font-medium">
                  {phase === 'focus' ? `Session ${(completedSessions % plan.sessionsBeforeLong) + 1} of ${plan.sessionsBeforeLong}` : 'Take a breather'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <button
            onClick={handleReset}
            className="size-12 rounded-2xl border border-border hover:bg-muted grid place-items-center transition"
            title="Reset"
          >
            <RotateCcw className="size-5 text-muted-foreground" />
          </button>
          <button
            onClick={timerState === 'running' ? handlePause : handleStart}
            className={cn(
              'size-16 rounded-full grid place-items-center text-white font-bold transition shadow-lg hover:scale-105 active:scale-95',
              phase === 'focus' ? 'bg-brand hover:bg-brand-deep' : phase === 'shortBreak' ? 'bg-coral hover:bg-coral' : 'bg-[var(--sky)]'
            )}
          >
            {timerState === 'running'
              ? <Pause className="size-6" />
              : <Play className="size-6 ml-0.5" />
            }
          </button>
          <button
            onClick={() => {
              setTimerState('idle');
              if (phase === 'focus') {
                const isLong = (completedSessions + 1) % plan.sessionsBeforeLong === 0;
                setPhase(isLong ? 'longBreak' : 'shortBreak');
                setSecondsLeft(isLong ? plan.longBreak * 60 : plan.shortBreak * 60);
                setCompletedSessions((c) => c + 1);
              } else {
                setPhase('focus');
                setSecondsLeft(focusDuration * 60);
              }
            }}
            className="size-12 rounded-2xl border border-border hover:bg-muted grid place-items-center transition"
            title="Skip"
          >
            <Play className="size-4 text-muted-foreground" />
            <Play className="size-4 text-muted-foreground -ml-2.5" />
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-2xl border border-border bg-background/80 backdrop-blur p-3 text-center">
            <div className="text-lg font-bold tabular-nums text-ink">{completedSessions}</div>
            <div className="text-[11px] text-muted-foreground">Sessions</div>
          </div>
          <div className="rounded-2xl border border-border bg-background/80 backdrop-blur p-3 text-center">
            <div className="text-lg font-bold tabular-nums text-ink">{focusMinsDone}</div>
            <div className="text-[11px] text-muted-foreground">Focus mins</div>
          </div>
          <div className="rounded-2xl border border-border bg-background/80 backdrop-blur p-3 text-center">
            <div className="text-lg font-bold tabular-nums text-ink">{focusDuration}</div>
            <div className="text-[11px] text-muted-foreground">Min / session</div>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="rounded-2xl border border-border bg-background p-5 mb-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink text-sm">Session Settings</h3>
              <button onClick={() => setShowSettings(false)} className="size-7 rounded-lg hover:bg-muted grid place-items-center">
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Focus duration</label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="range"
                  min={5}
                  max={90}
                  step={5}
                  value={focusDuration}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setFocusDuration(v);
                    if (timerState === 'idle' && phase === 'focus') setSecondsLeft(v * 60);
                  }}
                  className="flex-1 accent-[var(--brand)]"
                />
                <span className="text-sm font-bold tabular-nums text-ink w-12 text-right">{focusDuration} min</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[15, 25, 45].map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setFocusDuration(preset);
                    if (timerState === 'idle' && phase === 'focus') setSecondsLeft(preset * 60);
                  }}
                  className={cn(
                    'py-2 rounded-xl text-sm font-semibold border transition',
                    focusDuration === preset ? 'bg-brand text-white border-brand' : 'border-border text-muted-foreground hover:border-brand/40'
                  )}
                >
                  {preset} min
                </button>
              ))}
            </div>

            <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Short break</span><span className="font-semibold text-ink">{plan.shortBreak} min</span></div>
              <div className="flex justify-between"><span>Long break</span><span className="font-semibold text-ink">{plan.longBreak} min</span></div>
              <div className="flex justify-between"><span>Sessions before long break</span><span className="font-semibold text-ink">{plan.sessionsBeforeLong}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
