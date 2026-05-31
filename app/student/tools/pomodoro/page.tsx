'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, Pause, RotateCcw, Settings2, Coffee, Brain, ChevronUp, ChevronDown, X, Volume2, VolumeX, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Phase = 'focus' | 'shortBreak' | 'longBreak' | 'complete';
type TimerState = 'idle' | 'running' | 'paused';

function computeSessionPlan(focusMins: number) {
  if (focusMins <= 15) return { shortBreak: 3, longBreak: 10, sessionsBeforeLong: 4 };
  if (focusMins <= 25) return { shortBreak: 5, longBreak: 15, sessionsBeforeLong: 4 };
  if (focusMins <= 45) return { shortBreak: 8, longBreak: 20, sessionsBeforeLong: 3 };
  return { shortBreak: 10, longBreak: 25, sessionsBeforeLong: 3 };
}

function computeSplitPlan(totalMins: number) {
  // Total time = pure study time, split evenly into 3 sessions. Breaks are added on top.
  const sessionMins = Math.max(5, Math.round(totalMins / 3));
  const breakMins = Math.max(3, Math.round(sessionMins / 5));
  return { sessionMins, breakMins };
}

const PHASE_META: Record<Phase, { label: string; color: string; ringColor: string; bgGradient: string; icon: typeof Brain }> = {
  focus:      { label: 'Focus',        color: 'text-brand-deep', ringColor: 'stroke-brand',           bgGradient: 'from-brand-soft/40 to-background',  icon: Brain },
  shortBreak: { label: 'Short Break',  color: 'text-coral',      ringColor: 'stroke-coral',           bgGradient: 'from-coral-soft/40 to-background',  icon: Coffee },
  longBreak:  { label: 'Long Break',   color: 'text-sky',        ringColor: 'stroke-[var(--sky)]',    bgGradient: 'from-sky/20 to-background',         icon: Coffee },
  complete:   { label: 'Complete!',    color: 'text-brand-deep', ringColor: 'stroke-brand',           bgGradient: 'from-brand-soft/60 to-background',  icon: CheckCircle2 },
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

  // Split-mode state
  const [splitInput, setSplitInput] = useState('');
  const [breakInput, setBreakInput] = useState('');
  const [splitSessionMins, setSplitSessionMins] = useState<number | null>(null);
  const [splitBreakMins, setSplitBreakMins] = useState<number | null>(null);

  const isSplitMode = splitSessionMins !== null;
  const plan = computeSessionPlan(focusDuration);
  const activeFocusDuration = splitSessionMins ?? focusDuration;
  const activeBreakMins = splitBreakMins ?? plan.shortBreak;
  const activeSessions = isSplitMode ? 3 : plan.sessionsBeforeLong;

  const phaseDuration = useCallback(() => {
    switch (phase) {
      case 'focus':      return activeFocusDuration * 60;
      case 'shortBreak': return activeBreakMins * 60;
      case 'longBreak':  return plan.longBreak * 60;
      case 'complete':   return 0;
    }
  }, [phase, activeFocusDuration, activeBreakMins, plan]);

  const progress = phase === 'complete' ? 1 : (1 - secondsLeft / phaseDuration());

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
        if (phase === 'focus') setTotalFocusSeconds((t) => t + 1);
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

        if (isSplitMode && next >= 3) {
          setPhase('complete');
        } else if (!isSplitMode && next % plan.sessionsBeforeLong === 0) {
          setPhase('longBreak');
          setSecondsLeft(plan.longBreak * 60);
        } else {
          setPhase('shortBreak');
          setSecondsLeft(activeBreakMins * 60);
        }
      } else if (phase === 'shortBreak' || phase === 'longBreak') {
        setPhase('focus');
        setSecondsLeft(activeFocusDuration * 60);
      }
    }
  }, [secondsLeft, timerState, phase, completedSessions, activeFocusDuration, plan, soundEnabled, isSplitMode, activeBreakMins]);

  function handleStart() {
    if (timerState === 'idle' && secondsLeft === 0) setSecondsLeft(phaseDuration());
    setTimerState('running');
  }

  function handlePause() { setTimerState('paused'); }

  function handleReset() {
    setTimerState('idle');
    setPhase('focus');
    setSecondsLeft(activeFocusDuration * 60);
    setCompletedSessions(0);
    setTotalFocusSeconds(0);
  }

  function handleClearSplit() {
    setSplitSessionMins(null);
    setSplitBreakMins(null);
    setSplitInput('');
    setBreakInput('');
    setTimerState('idle');
    setPhase('focus');
    setSecondsLeft(focusDuration * 60);
    setCompletedSessions(0);
    setTotalFocusSeconds(0);
  }

  function handleApplySplit() {
    const total = parseInt(splitInput, 10);
    if (!total || total < 15 || total > 480) return;
    const sp = computeSplitPlan(total);
    const customBreak = parseInt(breakInput, 10);
    setSplitSessionMins(sp.sessionMins);
    setSplitBreakMins(customBreak >= 1 ? customBreak : sp.breakMins);
    setTimerState('idle');
    setPhase('focus');
    setSecondsLeft(sp.sessionMins * 60);
    setCompletedSessions(0);
    setTotalFocusSeconds(0);
    setShowSettings(false);
  }

  function adjustDuration(delta: number) {
    if (isSplitMode) return;
    const next = Math.max(5, Math.min(90, focusDuration + delta));
    setFocusDuration(next);
    if (timerState === 'idle' && phase === 'focus') setSecondsLeft(next * 60);
  }

  const meta = PHASE_META[phase];
  const circumference = 2 * Math.PI * 140;
  const strokeDashoffset = circumference * (1 - progress);
  const focusMinsDone = Math.floor(totalFocusSeconds / 60);

  const sessionDots = Array.from({ length: activeSessions }, (_, i) =>
    i < (completedSessions % activeSessions || (completedSessions > 0 && phase !== 'focus' ? activeSessions : 0))
  );

  // Preview plan for the split input (before applying)
  const previewPlan = splitInput && parseInt(splitInput, 10) >= 15
    ? (() => {
        const sp = computeSplitPlan(parseInt(splitInput, 10));
        const customBreak = parseInt(breakInput, 10);
        return { sessionMins: sp.sessionMins, breakMins: customBreak >= 1 ? customBreak : sp.breakMins };
      })()
    : null;

  return (
    <div className={cn('min-h-screen bg-gradient-to-b transition-colors duration-700', meta.bgGradient)}>
      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col min-h-screen">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/student/tools" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink transition">
            <ArrowLeft className="size-4" /> Tools
          </Link>
          <div className="flex items-center gap-2">
            {isSplitMode && (
              <button
                onClick={handleClearSplit}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-soft text-brand-deep text-xs font-semibold hover:bg-brand/20 transition"
                title="Clear split plan"
              >
                Split plan <X className="size-3" />
              </button>
            )}
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
          <div className={cn('inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold',
            phase === 'focus' ? 'bg-brand-soft text-brand-deep' :
            phase === 'complete' ? 'bg-brand-soft text-brand-deep' :
            phase === 'shortBreak' ? 'bg-coral-soft text-coral' : 'bg-sky/20 text-sky'
          )}>
            <meta.icon className="size-4" />
            {meta.label}
          </div>
        </div>

        {/* Session dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {sessionDots.map((done, i) => (
            <div key={i} className={cn('size-2.5 rounded-full transition-all', done ? 'bg-brand scale-110' : 'bg-border')} />
          ))}
        </div>

        {/* Timer ring / Complete screen */}
        <div className="flex-1 flex items-center justify-center">
          {phase === 'complete' ? (
            <div className="flex flex-col items-center gap-4 text-center px-6">
              <div className="size-24 rounded-full bg-brand-soft grid place-items-center">
                <CheckCircle2 className="size-12 text-brand-deep" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-ink">All done!</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  You focused for <span className="font-semibold text-ink">{focusMinsDone} min</span> across 3 sessions
                </p>
              </div>
              <button
                onClick={handleClearSplit}
                className="mt-2 px-6 py-2.5 rounded-2xl bg-brand text-white font-semibold text-sm hover:bg-brand-deep transition"
              >
                Start over
              </button>
            </div>
          ) : (
            <div className="relative">
              <svg width="320" height="320" viewBox="0 0 320 320" className="transform -rotate-90">
                <circle cx="160" cy="160" r="140" fill="none" stroke="var(--border)" strokeWidth="6" />
                <circle
                  cx="160" cy="160" r="140" fill="none"
                  className={cn(meta.ringColor, 'transition-all duration-300')}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {timerState === 'idle' && phase === 'focus' && !isSplitMode && (
                  <button onClick={() => adjustDuration(5)} className="size-8 rounded-full hover:bg-muted grid place-items-center transition mb-1">
                    <ChevronUp className="size-5 text-muted-foreground" />
                  </button>
                )}
                <div className={cn('text-6xl font-bold tabular-nums tracking-tight', meta.color)}>
                  {formatTime(secondsLeft)}
                </div>
                {timerState === 'idle' && phase === 'focus' && !isSplitMode && (
                  <button onClick={() => adjustDuration(-5)} className="size-8 rounded-full hover:bg-muted grid place-items-center transition mt-1">
                    <ChevronDown className="size-5 text-muted-foreground" />
                  </button>
                )}
                {timerState !== 'idle' && (
                  <div className="text-xs text-muted-foreground mt-1 font-medium">
                    {phase === 'focus'
                      ? `Session ${(completedSessions % activeSessions) + 1} of ${activeSessions}`
                      : 'Take a breather'}
                  </div>
                )}
                {isSplitMode && timerState === 'idle' && phase === 'focus' && (
                  <div className="text-xs text-muted-foreground mt-1 font-medium">
                    Session {completedSessions + 1} of 3
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Controls — hidden on complete screen */}
        {phase !== 'complete' && (
          <div className="flex items-center justify-center gap-4 mb-8">
            <button onClick={handleReset} className="size-12 rounded-2xl border border-border hover:bg-muted grid place-items-center transition" title="Reset">
              <RotateCcw className="size-5 text-muted-foreground" />
            </button>
            <button
              onClick={timerState === 'running' ? handlePause : handleStart}
              className={cn(
                'size-16 rounded-full grid place-items-center text-white font-bold transition shadow-lg hover:scale-105 active:scale-95',
                phase === 'focus' ? 'bg-brand hover:bg-brand-deep' : phase === 'shortBreak' ? 'bg-coral hover:bg-coral' : 'bg-[var(--sky)]'
              )}
            >
              {timerState === 'running' ? <Pause className="size-6" /> : <Play className="size-6 ml-0.5" />}
            </button>
            <button
              onClick={() => {
                setTimerState('idle');
                if (phase === 'focus') {
                  const next = completedSessions + 1;
                  setCompletedSessions(next);
                  if (isSplitMode && next >= 3) {
                    setPhase('complete');
                  } else if (!isSplitMode && next % plan.sessionsBeforeLong === 0) {
                    setPhase('longBreak');
                    setSecondsLeft(plan.longBreak * 60);
                  } else {
                    setPhase('shortBreak');
                    setSecondsLeft(activeBreakMins * 60);
                  }
                } else {
                  setPhase('focus');
                  setSecondsLeft(activeFocusDuration * 60);
                }
              }}
              className="size-12 rounded-2xl border border-border hover:bg-muted grid place-items-center transition"
              title="Skip"
            >
              <Play className="size-4 text-muted-foreground" />
              <Play className="size-4 text-muted-foreground -ml-2.5" />
            </button>
          </div>
        )}

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
            <div className="text-lg font-bold tabular-nums text-ink">{activeFocusDuration}</div>
            <div className="text-[11px] text-muted-foreground">Min / session</div>
          </div>
        </div>

        {/* Split-mode plan card */}
        {!isSplitMode && timerState === 'idle' && phase === 'focus' && (
          <div className="rounded-2xl border border-border bg-background p-5 mb-4 shadow-sm">
            <h3 className="font-semibold text-ink text-sm mb-0.5">Plan your session</h3>
            <p className="text-xs text-muted-foreground mb-3">Enter total study time — auto-split into 3 sessions with 2 breaks</p>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                min={15}
                max={480}
                placeholder="e.g. 90"
                value={splitInput}
                onChange={(e) => setSplitInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplySplit()}
                className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
              <span className="self-center text-sm text-muted-foreground">min study</span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={60}
                placeholder="auto"
                value={breakInput}
                onChange={(e) => setBreakInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplySplit()}
                className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-coral/40"
              />
              <span className="self-center text-sm text-muted-foreground">min break</span>
              <button
                onClick={handleApplySplit}
                disabled={!previewPlan}
                className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-40 hover:bg-brand-deep transition"
              >
                Apply
              </button>
            </div>

            {/* Preview */}
            {previewPlan && (
              <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                {[1, 2, 3].flatMap((n) => [
                  <div key={`s${n}`} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-soft text-brand-deep text-xs font-semibold">
                    <Brain className="size-3" /> {previewPlan.sessionMins}m
                  </div>,
                  ...(n < 3 ? [
                    <div key={`b${n}`} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-coral-soft text-coral text-xs font-semibold">
                      <Coffee className="size-3" /> {previewPlan.breakMins}m
                    </div>
                  ] : [])
                ])}
              </div>
            )}
          </div>
        )}

        {/* Settings panel */}
        {showSettings && (
          <div className="rounded-2xl border border-border bg-background p-5 mb-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink text-sm">Session Settings</h3>
              <button onClick={() => setShowSettings(false)} className="size-7 rounded-lg hover:bg-muted grid place-items-center">
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>

            {isSplitMode ? (
              <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between"><span>Session duration</span><span className="font-semibold text-ink">{splitSessionMins} min</span></div>
                <div className="flex justify-between"><span>Break duration</span><span className="font-semibold text-ink">{splitBreakMins} min</span></div>
                <div className="flex justify-between"><span>Total sessions</span><span className="font-semibold text-ink">3</span></div>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Focus duration</label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="range" min={5} max={90} step={5} value={focusDuration}
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
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
