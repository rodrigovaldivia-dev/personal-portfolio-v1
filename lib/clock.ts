export const ONE_HOUR_MS = 60 * 60 * 1000;
export const FOUR_HOURS_MS = 4 * ONE_HOUR_MS;

export type TimerSound = "alarm" | "celebration" | "hourly";

export function remainingTime(endsAt: number, now = Date.now()) {
  return Math.max(0, endsAt - now);
}

export function formatTime(milliseconds: number) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

// Schedule on the audio clock so a throttled UI interval does not trigger the alarm.
// Browsers can still suspend audio or unload a background page.
export function scheduleAlarm(context: AudioContext, delayMs: number, sound: TimerSound = "alarm") {
  const seconds = sound === "celebration" ? 3.6 : sound === "hourly" ? 1.4 : 2;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
  const samples = buffer.getChannelData(0);
  const notes = sound === "celebration"
    ? [
        { frequency: 523.25, offset: 0, length: 0.16, volume: 0.24 },
        { frequency: 659.25, offset: 0.18, length: 0.16, volume: 0.24 },
        { frequency: 783.99, offset: 0.36, length: 0.16, volume: 0.24 },
        { frequency: 1046.5, offset: 0.54, length: 0.3, volume: 0.28 },
        { frequency: 783.99, offset: 0.9, length: 0.16, volume: 0.24 },
        { frequency: 880, offset: 1.08, length: 0.16, volume: 0.24 },
        { frequency: 987.77, offset: 1.26, length: 0.25, volume: 0.24 },
        ...[523.25, 659.25, 783.99, 1046.5].map((frequency) => ({
          frequency, offset: 1.6, length: 1.2, volume: 0.11,
        })),
      ]
    : sound === "hourly"
      ? [659.25, 880].map((frequency, index) => ({
          frequency, offset: index * 0.32, length: 0.65, volume: 0.2,
        }))
      : [880, 1046.5, 1318.5].map((frequency, index) => ({
          frequency, offset: index * 0.3, length: 0.24, volume: 0.35,
        }));

  for (const note of notes) {
    const offset = Math.floor(note.offset * context.sampleRate);
    const length = Math.floor(note.length * context.sampleRate);
    for (let index = 0; index < length; index++) {
      const time = index / context.sampleRate;
      const envelope = Math.min(1, time / 0.015) * Math.max(0, 1 - time / note.length);
      samples[offset + index] +=
        Math.sin(2 * Math.PI * note.frequency * time) * envelope * note.volume;
    }
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = sound !== "hourly";
  source.connect(context.destination);
  source.start(context.currentTime + Math.max(0, delayMs) / 1000);
  return source;
}

export function scheduleTimerSounds(context: AudioContext, duration: number, remaining: number) {
  const sources = [scheduleAlarm(context, remaining, duration === FOUR_HOURS_MS ? "celebration" : "alarm")];
  if (duration === FOUR_HOURS_MS) {
    for (let elapsedHours = 1; elapsedHours < 4; elapsedHours++) {
      const milestoneRemaining = duration - elapsedHours * ONE_HOUR_MS;
      // Only schedule future milestones; resuming never replays past hours.
      if (remaining > milestoneRemaining) {
        sources.push(scheduleAlarm(context, remaining - milestoneRemaining, "hourly"));
      }
    }
  }
  return sources;
}
