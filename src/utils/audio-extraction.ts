import { spawn } from "node:child_process";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

/**
 * Extracts the audio track from a video file with ffmpeg into a 16 kHz
 * mono WAV suitable for speech-to-text. Writes input and output to a
 * private temp dir that is removed after the operation. Nothing else
 * touches disk on the request path.
 */
export interface ExtractedAudio {
  /** Absolute path of the produced WAV file (inside a temp dir you should pass to cleanup). */
  wavPath: string;
  /** Absolute path of the private temp dir created for this extraction. */
  workDir: string;
}

export class AudioExtractionError extends Error {
  constructor(
    message: string,
    readonly stderr?: string
  ) {
    super(message);
    this.name = "AudioExtractionError";
  }
}

/**
 * Extracts audio from videoBuffer to a WAV file.
 *
 * @param videoBuffer  Original video file bytes (MP4 / MOV / WebM / etc.).
 * @param inputSuffix  Filename suffix hint for ffmpeg format sniffing (e.g. ".mp4").
 * @param timeoutMs    Hard kill for the ffmpeg process (default 120s — large uploads need headroom).
 */
export async function extractAudioToWav(
  videoBuffer: Buffer,
  inputSuffix = ".mp4",
  timeoutMs = 120_000
): Promise<ExtractedAudio> {
  const workDir = await mkdtemp(join(tmpdir(), `smgen-${randomBytes(4).toString("hex")}-`));
  try {
    const inputPath = join(workDir, `input${inputSuffix}`);
    const wavPath = join(workDir, "audio.wav");
    await import("node:fs/promises").then((fs) => fs.writeFile(inputPath, videoBuffer));

    await runFfmpeg(
      [
        // Overwrite output if rerun; hide banner; fail on error
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        // Drop video, single mono channel @16kHz, 16-bit PCM WAV
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        wavPath,
      ],
      timeoutMs
    );

    const files = await readdir(workDir);
    if (!files.includes("audio.wav")) {
      throw new AudioExtractionError("ffmpeg completed but produced no WAV file");
    }

    return { wavPath, workDir };
  } catch (error) {
    await cleanupWorkDir(workDir);
    throw error;
  }
}

/** Removes the temp dir created by extractAudioToWav. Safe to call twice. */
export async function cleanupWorkDir(workDir: string): Promise<void> {
  await rm(workDir, { recursive: true, force: true });
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    const stderrChunks: Buffer[] = [];
    child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new AudioExtractionError(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new AudioExtractionError(
          `Failed to start ffmpeg (is it installed and on PATH?): ${err.message}`
        )
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      if (code === 0) {
        resolve();
      } else {
        reject(
          new AudioExtractionError(
            `ffmpeg exited with code ${code}${stderr ? `: ${stderr.slice(0, 2000)}` : ""}`,
            stderr
          )
        );
      }
    });
  });
}
