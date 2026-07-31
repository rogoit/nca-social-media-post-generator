import { useState } from "react";
import { useStore } from "@nanostores/react";
import { generationStore, startCaptionGeneration } from "../stores/generation-store.js";

const MAX_KEYWORDS = 3;

export default function KeywordConfirm() {
  const state = useStore(generationStore);
  const [editedKeywords, setEditedKeywords] = useState<string[] | null>(null);
  const [videoDuration, setVideoDuration] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  if (state.stage !== "keywords") return null;

  const chips = editedKeywords ?? state.keywords;

  const addKeyword = () => {
    const trimmed = input.trim();
    if (!trimmed || chips.length >= MAX_KEYWORDS || chips.includes(trimmed)) return;
    setEditedKeywords([...chips, trimmed]);
    setInput("");
  };

  const removeKeyword = (kw: string) => {
    setEditedKeywords(chips.filter((k) => k !== kw));
  };

  const handleConfirm = async () => {
    setBusy(true);
    await startCaptionGeneration(videoDuration);
    setBusy(false);
  };

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Keywords bestätigen ({chips.length}/{MAX_KEYWORDS})
        </label>
        <div className="flex flex-wrap gap-2">
          {chips.map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-indigo-300 rounded-full text-sm text-indigo-700"
            >
              {kw}
              <button
                type="button"
                onClick={() => removeKeyword(kw)}
                aria-label={`Keyword ${kw} entfernen`}
                className="text-indigo-400 hover:text-indigo-700 font-bold"
              >
                ×
              </button>
            </span>
          ))}
          {chips.length < MAX_KEYWORDS && (
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="Keyword hinzufügen..."
              className="px-3 py-1 border border-indigo-300 rounded-full text-sm outline-none focus:ring-1 focus:ring-indigo-500"
            />
          )}
        </div>
      </div>

      <div>
        <label htmlFor="kc-video-duration" className="block text-sm font-medium text-gray-700 mb-1">
          Video-Dauer (optional, für YouTube Zeitstempel)
        </label>
        <input
          id="kc-video-duration"
          type="text"
          value={videoDuration}
          onChange={(e) => setVideoDuration(e.target.value)}
          placeholder="z.B. 7:16"
          pattern="^([0-9]{1,2}):([0-5][0-9])$"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
        />
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={busy || chips.length === 0}
        className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? "Starte Generierung..." : "Bestätigen und alle Plattformen generieren"}
      </button>
    </div>
  );
}
