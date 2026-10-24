export const ONE_HOUR_MS = 60 * 60 * 1000;

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
export function scheduleAlarm(context: AudioContext, delayMs: number) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const samples = buffer.getChannelData(0);
  const notes = [880, 1046.5, 1318.5];

  for (let note = 0; note < notes.length; note++) {
    const offset = Math.floor(note * 0.3 * context.sampleRate);
    const length = Math.floor(0.24 * context.sampleRate);
    for (let index = 0; index < length; index++) {
      const time = index / context.sampleRate;
      const envelope = Math.min(1, time / 0.015) * Math.max(0, 1 - time / 0.24);
      samples[offset + index] =
        Math.sin(2 * Math.PI * notes[note] * time) * envelope * 0.35;
    }
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(context.destination);
  source.start(context.currentTime + Math.max(0, delayMs) / 1000);
  return source;
}
