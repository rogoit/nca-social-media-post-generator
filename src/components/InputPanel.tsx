import { useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import {
  generationStore,
  detectKeywords,
  startVideoGeneration,
  reset,
} from "../stores/generation-store.js";

const ALLOWED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export default function InputPanel() {
  const state = useStore(generationStore);
  const [caption, setCaption] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showPanel = state.stage === "idle" || state.stage === "error";

  if (!showPanel) {
    return (
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => {
            reset();
            setCaption("");
            setVideoFile(null);
            setLocalError(null);
          }}
          disabled={state.stage === "generating"}
          className="py-1 px-3 text-sm border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          Neu starten
        </button>
      </div>
    );
  }

  const captionUsable = caption.trim().length > 0;
  const videoUsable = videoFile !== null;

  const pickFile = (file: File | null) => {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setLocalError("Ungültiges Format. Erlaubt sind: MP4, MOV, WebM.");
      return;
    }
    setLocalError(null);
    if (captionUsable) setCaption("");
    setVideoFile(file);
  };

  const onCaptionChange = (value: string) => {
    setCaption(value);
    if (value.trim().length > 0 && videoFile) setVideoFile(null);
    setLocalError(null);
  };

  const handleCaptionSubmit = async () => {
    setBusy(true);
    try {
      await detectKeywords(caption.trim());
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Keyword-Erkennung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const handleVideoSubmit = async () => {
    if (!videoFile) return;
    setLocalError(null);
    await startVideoGeneration(videoFile, videoDuration);
  };

  return (
    <div className="space-y-6">
      {localError && (
        <div className="p-3 bg-red-50 text-red-700 rounded-md border border-red-200 text-sm">
          {localError}
        </div>
      )}

      {/* Caption input (desktop path — keyword confirmation follows) */}
      {!videoUsable && (
        <div>
          <label htmlFor="caption-input" className="block text-sm font-medium text-gray-700 mb-2">
            Transkript einfügen
            <span className="ml-2 text-xs text-gray-400 font-normal">
              Keywords werden erkannt und können bestätigt werden
            </span>
          </label>
          <textarea
            id="caption-input"
            rows={4}
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            placeholder="Füge dein YouTube-Transkript hier ein..."
            className="w-full h-28 sm:h-64 resize-y px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            type="button"
            disabled={!captionUsable || busy}
            onClick={handleCaptionSubmit}
            className="mt-3 w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Erkennt..." : "Keywords erkennen"}
          </button>
        </div>
      )}

      {/* Divider */}
      {!captionUsable && !videoUsable && (
        <div className="flex items-center text-xs text-gray-400">
          <div className="flex-1 border-t border-gray-200" />
          <span className="px-3">oder</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>
      )}

      {/* Video upload (phone path — starts immediately) */}
      {!captionUsable && (
        <div>
          {!videoUsable ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files[0] ?? null);
              }}
              className={`border-2 border-dashed rounded-lg p-5 sm:p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-300 hover:border-indigo-500 hover:bg-indigo-50"
              }`}
            >
              <p className="text-gray-500 mb-2">Video hierher ziehen oder klicken zum Auswählen</p>
              <p className="text-xs text-gray-400">MP4, MOV, WebM</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-md">
                <span className="text-sm text-gray-700 truncate">{videoFile!.name}</span>
                <button
                  type="button"
                  onClick={() => setVideoFile(null)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Entfernen
                </button>
              </div>
              <div>
                <label
                  htmlFor="video-duration-input"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Video-Dauer (optional, für YouTube Zeitstempel)
                </label>
                <input
                  id="video-duration-input"
                  type="text"
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(e.target.value)}
                  placeholder="z.B. 7:16"
                  pattern="^([0-9]{1,2}):([0-5][0-9])$"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={handleVideoSubmit}
                className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Content generieren
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
