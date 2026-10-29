"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BellRing, Pause, Play, RotateCcw, Timer, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/molecules/ModeToggle";
import { formatTime, FOUR_HOURS_MS, ONE_HOUR_MS, remainingTime, scheduleAlarm, scheduleTimerSounds } from "@/lib/clock";

type Status = "ready" | "running" | "paused" | "finished";
const STORAGE_KEY = "portfolio-clock";

export function ClockTimer() {
  const [duration, setDuration] = useState(ONE_HOUR_MS);
  const [remaining, setRemaining] = useState(ONE_HOUR_MS);
  const [status, setStatus] = useState<Status>("ready");
  const [soundReady, setSoundReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [restored, setRestored] = useState(false);
  const deadline = useRef<number | null>(null);
  const context = useRef<AudioContext | null>(null);
  const alarm = useRef<AudioBufferSourceNode[]>([]);
  const preview = useRef<AudioBufferSourceNode | null>(null);

  const stopAlarm = useCallback(() => {
    for (const source of alarm.current) {
      source.stop();
      source.disconnect();
    }
    alarm.current = [];
  }, []);

  const stopPreview = useCallback(() => {
    preview.current?.stop();
    preview.current?.disconnect();
    preview.current = null;
  }, []);

  const enableAudio = async () => {
    if (!context.current) {
      context.current = new AudioContext();
      context.current.onstatechange = () => {
        setSoundReady(context.current?.state === "running");
      };
    }
    await context.current.resume();
    if (context.current.state !== "running") {
      throw new Error("Audio is blocked");
    }
    setSoundReady(true);
    setError("");
    return context.current;
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (
        saved &&
        Number.isFinite(saved.duration) && saved.duration > 0 && saved.duration <= FOUR_HOURS_MS &&
        Number.isFinite(saved.remaining) && saved.remaining >= 0 && saved.remaining <= saved.duration &&
        ["ready", "running", "paused", "finished"].includes(saved.status) &&
        (saved.status !== "running" || (Number.isFinite(saved.deadline) && saved.deadline > 0))
      ) {
        const left = saved.status === "running" ? remainingTime(saved.deadline) : saved.remaining;
        deadline.current = saved.status === "running" ? saved.deadline : null;
        setDuration(saved.duration);
        setRemaining(left);
        setStatus(left === 0 ? "finished" : saved.status);
      }
    } catch {
      // The timer also works when browser storage is unavailable.
    }
    setRestored(true);

    return () => {
      stopAlarm();
      stopPreview();
      if (context.current) {
        context.current.onstatechange = null;
        void context.current.close().catch(() => {});
        context.current = null;
      }
    };
  }, [stopAlarm, stopPreview]);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        duration, remaining, status, deadline: deadline.current,
      }));
    } catch {
      // Storage is optional; the current timer continues without it.
    }
  }, [duration, remaining, status, restored]);

  useEffect(() => {
    if (status !== "running") return;
    const update = () => {
      if (deadline.current === null) return;
      const left = remainingTime(deadline.current);
      setRemaining(left);
      if (left === 0) setStatus("finished");
    };
    const catchUp = () => {
      update();
      // Reconcile the audio clock with wall time after sleep or suspension.
      if (context.current?.state === "running" && deadline.current !== null) {
        stopAlarm();
        alarm.current = scheduleTimerSounds(context.current, duration, remainingTime(deadline.current));
      }
    };
    update();
    const interval = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("pageshow", catchUp);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("pageshow", catchUp);
    };
  }, [duration, status, stopAlarm]);

  useEffect(() => {
    document.title = status === "ready"
      ? "Clock | Rodrigo Valdivia"
      : status === "finished" ? "Time’s up! | Clock" : `${formatTime(remaining)} | Clock`;
  }, [status, remaining]);

  useEffect(() => () => { document.title = "Rodrigo Valdivia"; }, []);

  const start = async () => {
    setStarting(true);
    try {
      const audio = await enableAudio();
      stopPreview();
      stopAlarm();
      const left = status === "finished" ? duration : remaining;
      deadline.current = Date.now() + left;
      alarm.current = scheduleTimerSounds(audio, duration, left);
      setRemaining(left);
      setStatus("running");
    } catch {
      setError("Sound could not start. Allow audio for this site, then try again.");
    } finally {
      setStarting(false);
    }
  };

  const pause = () => {
    const left = remainingTime(deadline.current!);
    deadline.current = null;
    setRemaining(left);
    setStatus(left === 0 ? "finished" : "paused");
    if (left > 0) stopAlarm();
  };

  const reset = (nextDuration = duration) => {
    stopAlarm();
    stopPreview();
    deadline.current = null;
    setDuration(nextDuration);
    setRemaining(nextDuration);
    setStatus("ready");
    setError("");
  };

  const testSound = async (hourly = false) => {
    setStarting(true);
    try {
      const audio = await enableAudio();
      stopPreview();
      if (status === "running" || status === "finished") {
        stopAlarm();
        alarm.current = scheduleTimerSounds(audio, duration, status === "finished" ? 0 : remainingTime(deadline.current!));
      }
      if (status === "finished") return;
      const sound = scheduleAlarm(audio, 0, hourly ? "hourly" : duration === FOUR_HOURS_MS ? "celebration" : "alarm");
      sound.loop = false;
      preview.current = sound;
    } catch {
      setError("Sound is unavailable. Check your browser’s audio permissions and try again.");
    } finally {
      setStarting(false);
    }
  };

  const progress = Math.min(100, Math.max(0, ((duration - remaining) / duration) * 100));
  const finished = status === "finished";

  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-2 rounded text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to portfolio
        </Link>
        <ModeToggle />
      </header>

      <div className="mx-auto max-w-2xl px-5 pb-16 pt-8 sm:pt-16">
        <div className="mb-8 text-center">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <Timer className="size-3.5" aria-hidden="true" /> A little time to focus
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Make this time yours.</h1>
          <p className="mt-3 text-muted-foreground">Pick a duration, press start, and take one thing at a time.</p>
        </div>

        <section aria-label="Countdown timer" className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-10">
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span className="uppercase tracking-widest">Focus timer</span>
            <span className="flex items-center gap-1.5"><Volume2 className="size-3.5" aria-hidden="true" /> {soundReady ? "Sound enabled" : "Sound needs a click"}</span>
          </div>

          <div className="py-10 text-center sm:py-12">
            <p role="timer" aria-label="Time remaining" aria-live="off" className={`font-mono text-[clamp(2.75rem,12vw,5rem)] font-semibold leading-none tabular-nums tracking-tight ${finished ? "text-primary" : "text-foreground"}`}>
              {formatTime(remaining)}
            </p>
            <p role="status" className="mt-5 min-h-6 text-sm text-muted-foreground">
              {finished ? "Time’s up. Take a breath — you’ve earned a break." : status === "running" ? "One thing at a time. You’ve got this." : status === "paused" ? "Paused. Pick up whenever you’re ready." : "Your next focus session starts here."}
            </p>
          </div>

          <div role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="mb-8 h-1.5 overflow-hidden rounded-full bg-secondary dark:bg-muted-foreground/50">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>

          <div className="mb-8 flex flex-wrap justify-center gap-2" role="group" aria-label="Timer duration">
            {[15, 30, 60, 240].map((minutes) => (
              <Button key={minutes} variant={duration === minutes * 60000 ? "secondary" : "ghost"} size="sm" aria-pressed={duration === minutes * 60000} disabled={!restored || status !== "ready" || starting} onClick={() => reset(minutes * 60000)}>
                {minutes >= 60 ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}` : `${minutes} min`}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {finished ? (
              <Button size="lg" onClick={() => reset()} disabled={starting} className="min-w-40"><BellRing aria-hidden="true" /> Dismiss alarm</Button>
            ) : status === "running" ? (
              <Button size="lg" onClick={pause} disabled={starting} className="min-w-40"><Pause aria-hidden="true" /> Pause timer</Button>
            ) : (
              <Button size="lg" onClick={start} disabled={!restored || starting} className="min-w-40"><Play aria-hidden="true" /> {starting ? "Enabling sound…" : status === "paused" ? "Resume timer" : "Start timer"}</Button>
            )}
            <Button size="lg" variant="outline" onClick={() => reset()} disabled={starting || !restored || status === "ready"}><RotateCcw aria-hidden="true" /> Reset</Button>
          </div>

          <div className="mt-6 text-center">
            <Button variant="link" size="sm" onClick={() => testSound()} disabled={starting || !restored}><Volume2 aria-hidden="true" /> {duration === FOUR_HOURS_MS ? "Test celebration" : "Test sound"}</Button>
            {duration === FOUR_HOURS_MS && <Button variant="link" size="sm" onClick={() => testSound(true)} disabled={starting || !restored || finished}><Volume2 aria-hidden="true" /> Test hourly chime</Button>}
            <p className="mt-1 text-xs text-muted-foreground">{duration === FOUR_HOURS_MS ? "A brief chime marks each hour and stops automatically. The final celebration repeats until dismissed." : "The alarm repeats until you dismiss it."}</p>
          </div>
          {error && <p role="alert" className="mt-4 text-center text-sm text-destructive">{error}</p>}
          {status !== "ready" && !soundReady && !error && <p role="status" className="mt-4 text-center text-sm text-muted-foreground">Click “{duration === FOUR_HOURS_MS ? "Test celebration" : "Test sound"}” to enable the alarm after a refresh or audio interruption.</p>}
        </section>

        <aside className="mt-6 rounded-2xl border border-border bg-muted/50 p-5 text-sm leading-relaxed text-muted-foreground">
          <h2 className="mb-1 font-medium text-foreground">Can I switch tabs?</h2>
          <p>Yes. The alarm is scheduled to play even while you’re in another tab. Keep this page open, your device awake, and the tab and speakers unmuted. Browser power saving, a locked phone, or a suspended tab can delay or prevent the sound.</p>
          <p className="mt-2">Refreshing keeps your countdown in this tab. Use the sound test afterwards to enable the alarm again.</p>
        </aside>
      </div>
    </main>
  );
}
