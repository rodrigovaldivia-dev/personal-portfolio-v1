import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/clock.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2017 },
});
const { formatTime, FOUR_HOURS_MS, ONE_HOUR_MS, remainingTime, scheduleAlarm, scheduleTimerSounds } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("starts at one hour and rounds up partial seconds", () => {
  assert.equal(formatTime(ONE_HOUR_MS), "01:00:00");
  assert.equal(formatTime(FOUR_HOURS_MS), "04:00:00");
  assert.equal(formatTime(59999), "00:01:00");
  assert.equal(formatTime(1), "00:00:01");
  assert.equal(formatTime(0), "00:00:00");
  assert.equal(formatTime(-1000), "00:00:00");
});

test("uses the deadline to catch up after delayed background ticks", () => {
  const start = 1_000_000;
  const deadline = start + ONE_HOUR_MS;
  assert.equal(remainingTime(deadline, start), ONE_HOUR_MS);
  assert.equal(remainingTime(deadline, start + 47 * 60000), 13 * 60000);
  assert.equal(remainingTime(deadline, deadline + 5000), 0);
});

test("pausing and resuming preserves the remaining duration", () => {
  const paused = remainingTime(ONE_HOUR_MS, 20 * 60000);
  const resumedAt = 3 * ONE_HOUR_MS;
  assert.equal(remainingTime(resumedAt + paused, resumedAt), 40 * 60000);
});

test("pre-schedules a repeating audible alarm on the audio clock", () => {
  const samples = new Float32Array(48000 * 2);
  let startTime;
  const source = {
    connect(destination) { assert.equal(destination, "speakers"); },
    start(time) { startTime = time; },
  };
  const buffer = { getChannelData: () => samples };
  const context = {
    currentTime: 10,
    sampleRate: 48000,
    destination: "speakers",
    createBuffer: () => buffer,
    createBufferSource: () => source,
  };
  assert.equal(scheduleAlarm(context, ONE_HOUR_MS), source);
  assert.equal(startTime, 3610);
  assert.equal(source.loop, true);
  assert.equal(source.buffer, buffer);
  assert.ok(samples.some((value) => Math.abs(value) > 0.1));
  assert.ok(samples.every((value) => Math.abs(value) <= 0.35));
  scheduleAlarm(context, -1000);
  assert.equal(startTime, 10);
});

function audioContext() {
  return {
    currentTime: 10,
    sampleRate: 8000,
    destination: "speakers",
    createBuffer(channels, length, sampleRate) {
      const samples = new Float32Array(length);
      return { duration: length / sampleRate, getChannelData: () => samples };
    },
    createBufferSource() {
      return {
        connect() {},
        start(time) { this.startTime = time; },
      };
    },
  };
}

test("four-hour sessions schedule three finite hourly chimes and a distinct final celebration", () => {
  const context = audioContext();
  const [final, ...chimes] = scheduleTimerSounds(context, FOUR_HOURS_MS, FOUR_HOURS_MS);
  assert.equal(final.startTime, 10 + 4 * 3600);
  assert.equal(final.loop, true);
  assert.equal(final.buffer.duration, 3.6);
  assert.deepEqual(chimes.map((source) => source.startTime), [3610, 7210, 10810]);
  for (const chime of chimes) {
    assert.equal(chime.loop, false);
    assert.equal(chime.buffer.duration, 1.4);
    assert.ok(chime.buffer.getChannelData(0).some((sample) => Math.abs(sample) > 0.1));
  }
  const standard = scheduleAlarm(context, 0);
  assert.notDeepEqual(final.buffer.getChannelData(0).slice(0, 1000), standard.buffer.getChannelData(0).slice(0, 1000));
  for (const source of [final, ...chimes]) {
    assert.ok(source.buffer.getChannelData(0).every((sample) => Number.isFinite(sample) && Math.abs(sample) < 1));
  }
});

test("resuming or reconciling a four-hour session only schedules future hourly milestones", () => {
  const context = audioContext();
  // Paused after 90 minutes: the next chime is 30 minutes after resuming.
  const [final, ...chimes] = scheduleTimerSounds(context, FOUR_HOURS_MS, 2.5 * ONE_HOUR_MS);
  assert.equal(final.startTime, 9010);
  assert.deepEqual(chimes.map((source) => source.startTime), [1810, 5410]);
  // Already reached the second hour: never replay its chime.
  const atMilestone = scheduleTimerSounds(context, FOUR_HOURS_MS, 2 * ONE_HOUR_MS);
  assert.deepEqual(atMilestone.map((source) => source.startTime), [7210, 3610]);
  const finished = scheduleTimerSounds(context, FOUR_HOURS_MS, 0);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].startTime, 10);
});

test("shorter sessions keep their original repeating alarm without hourly chimes", () => {
  for (const duration of [15 * 60000, 30 * 60000, ONE_HOUR_MS]) {
    const sources = scheduleTimerSounds(audioContext(), duration, duration);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].loop, true);
    assert.equal(sources[0].buffer.duration, 2);
  }
});
