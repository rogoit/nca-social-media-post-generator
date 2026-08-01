import { describe, it, expect, afterEach } from "vitest";
import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  extractAudioToWav,
  cleanupWorkDir,
  AudioExtractionError,
} from "../../src/utils/audio-extraction.js";

const execFileAsync = promisify(execFile);

async function makeTestVideo(durationSec = 1): Promise<Buffer> {
  // Generate a tiny test clip deterministically with ffmpeg itself (installed
  // on the dev box), then read it back as a Buffer so the test exercises the
  // same path the application does.
  const dir = join(tmpdir(), `fixture-${randomBytes(4).toString("hex")}`);
  const videoPath = join(dir, "in.mp4");
  await import("node:fs/promises").then((fs) => fs.mkdir(dir, { recursive: true }));
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${durationSec}`,
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=64x64:d=${durationSec}`,
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-shortest",
    videoPath,
  ]);
  const buf = await import("node:fs/promises").then((fs) => fs.readFile(videoPath));
  await import("node:fs/promises").then((fs) => fs.rm(dir, { recursive: true, force: true }));
  return buf;
}

describe("audio-extraction", () => {
  let workDirs: string[] = [];

  afterEach(async () => {
    // Clean up any temp dirs created during the test
    for (const dir of workDirs) {
      if (existsSync(dir)) {
        await cleanupWorkDir(dir);
      }
    }
    workDirs = [];
  });

  it("should extract audio from a real video buffer to 16kHz mono WAV", async () => {
    const video = await makeTestVideo(1);
    const { wavPath, workDir } = await extractAudioToWav(video);
    workDirs.push(workDir);

    expect(existsSync(wavPath)).toBe(true);
    const wav = statSync(wavPath);
    expect(wav.size).toBeGreaterThan(1000);

    const probe = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=sample_rate,channels,codec_name",
      "-of",
      "csv=p=0",
      wavPath,
    ]);
    expect(probe.stdout.trim()).toMatch(/pcm_s16le.*16000.*1|pcm_s16le.*1.*16000/);
  }, 30000);

  it("should reject a buffer that is not a video", async () => {
    const badBuffer = Buffer.from("this is definitely not a video file");
    await expect(extractAudioToWav(badBuffer)).rejects.toThrow(AudioExtractionError);
  }, 30000);

  it("should reject a video with no audio track", async () => {
    const dir = join(tmpdir(), `silent-${randomBytes(4).toString("hex")}`);
    const videoPath = join(dir, "silent.mp4");
    await import("node:fs/promises").then((fs) => fs.mkdir(dir, { recursive: true }));
    // Video WITHOUT audio track
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=64x64:d=0.5",
      "-c:v",
      "libx264",
      "-an",
      videoPath,
    ]);
    const buf = await import("node:fs/promises").then((fs) => fs.readFile(videoPath));
    await import("node:fs/promises").then((fs) => fs.rm(dir, { recursive: true, force: true }));

    await expect(extractAudioToWav(buf)).rejects.toThrow(AudioExtractionError);
  }, 30000);

  it("should leave no leftover dirs after cleanupWorkDir", async () => {
    const video = await makeTestVideo(1);
    const { workDir } = await extractAudioToWav(video);
    expect(existsSync(workDir)).toBe(true);
    await cleanupWorkDir(workDir);
    expect(existsSync(workDir)).toBe(false);
    const remaining = await readdir(tmpdir());
    expect(remaining.filter((d) => d.startsWith("smgen-"))).toHaveLength(0);
  }, 30000);
});
