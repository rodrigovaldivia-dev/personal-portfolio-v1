import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/clock.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2017 },
});
const { formatTime, ONE_HOUR_MS, remainingTime, scheduleAlarm } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("starts at one hour and rounds up partial seconds", () => {
  assert.equal(formatTime(ONE_HOUR_MS), "01:00:00");
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
