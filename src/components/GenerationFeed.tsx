import { useState, useEffect } from "react";
import { useStore } from "@nanostores/react";
import {
  generationStore,
  retryPlatform,
  loadPersistedRunOnMount,
  type PlatformKey,
  type PlatformState,
} from "../stores/generation-store.js";

const PLATFORM_META: Record<PlatformKey, { name: string; color: string; barColor: string }> = {
  youtube: { name: "YouTube", color: "text-red-600", barColor: "bg-red-600" },
  linkedin: { name: "LinkedIn", color: "text-blue-600", barColor: "bg-blue-600" },
  instagram: { name: "Instagram", color: "text-pink-600", barColor: "bg-pink-500" },
  tiktok: { name: "TikTok", color: "text-gray-900", barColor: "bg-gray-900" },
};

const PLATFORM_ORDER: PlatformKey[] = ["youtube", "linkedin", "instagram", "tiktok"];

export default function GenerationFeed() {
  const state = useStore(generationStore);

  // On mount: rehydrate the most recent persisted run (refresh / SSE-drop
  // recovery). Finished cards reappear immediately; missing platforms
  // resume silently. Runs once.
  useEffect(() => {
    void loadPersistedRunOnMount();
  }, []);

  if (state.stage === "idle" || state.stage === "keywords") return null;

  return (
    <div className="mt-4 sm:mt-8 space-y-4 sm:space-y-6">
      {state.correctedTranscript && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Korrigiertes Transkript</h2>
            <CopyButton text={state.correctedTranscript} />
          </div>
          <ExpandableText
            text={state.correctedTranscript}
            multiline
            desktopScrollClassName="sm:max-h-48 sm:overflow-y-auto"
          />
          {state.keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {state.keywords.map((kw) => (
                <span
                  key={kw}
                  className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
          {state.modelUsed && (
            <p className="mt-1 text-xs text-gray-400">Modell: {state.modelUsed}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PLATFORM_ORDER.map((key) => (
          <PlatformCard
            key={key}
            platformKey={key}
            meta={PLATFORM_META[key]}
            platform={state.platforms[key]}
          />
        ))}
      </div>
    </div>
  );
}

function PlatformCard({
  platformKey,
  meta,
  platform,
}: {
  platformKey: PlatformKey;
  meta: { name: string; color: string; barColor: string };
  platform: PlatformState;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className={`font-semibold ${meta.color}`}>{meta.name}</h3>
        {platform.modelUsed && platform.status === "ready" && (
          <span className="text-xs text-gray-400">{platform.modelUsed}</span>
        )}
      </div>

      <StatusBar status={platform.status} barColor={meta.barColor} />

      <div className="mt-3">
        {platform.status === "error" && (
          <div className="space-y-2">
            <p className="text-sm text-red-600">{platform.errorMessage}</p>
            <button
              type="button"
              onClick={() => retryPlatform(platformKey)}
              className="py-1 px-3 text-sm border border-red-300 text-red-700 rounded-md hover:bg-red-50"
            >
              Erneut versuchen
            </button>
          </div>
        )}

        {platform.status === "ready" && platform.content && (
          <PlatformContent platformKey={platformKey} content={platform.content} />
        )}

        {platform.humanizerWarnings && platform.status === "ready" && (
          <p className="mt-2 text-xs text-amber-600">
            Hinweis: KI-Muster erkannt ({platform.humanizerWarnings.join(", ")}) — bitte vor dem
            Posten prüfen.
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBar({ status, barColor }: { status: PlatformState["status"]; barColor: string }) {
  if (status === "idle") return null;

  const label =
    status === "queued"
      ? "Wartet…"
      : status === "pending"
        ? "Wird generiert..."
        : status === "humanizer"
          ? "Qualitätsprüfung..."
          : status === "ready"
            ? "Fertig"
            : "Fehlgeschlagen";

  const isWaiting = status === "queued";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-xs ${status === "error" ? "text-red-600" : isWaiting ? "text-gray-400" : "text-gray-500"}`}
          role="status"
        >
          {label}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        {status === "ready" ? (
          <div className={`h-full w-full ${barColor} transition-all duration-500`} />
        ) : status === "error" ? (
          <div className="h-full w-full bg-red-500" />
        ) : isWaiting ? (
          <div className="h-full w-0" />
        ) : (
          <div className={`h-full w-1/3 ${barColor} animate-progress-indeterminate rounded-full`} />
        )}
      </div>
    </div>
  );
}

function PlatformContent({
  platformKey,
  content,
}: {
  platformKey: PlatformKey;
  content: Record<string, unknown>;
}) {
  if (platformKey === "youtube") {
    const title = (content.title as string) ?? "";
    const description = (content.description as string) ?? "";
    const timestamps = content.timestamps;
    const timestampsText = Array.isArray(timestamps)
      ? timestamps.join("\n")
      : ((timestamps as string) ?? "");
    return (
      <div className="space-y-3 text-sm">
        <ContentBlock label="Titel" text={title} />
        <ContentBlock label="Beschreibung" text={description} multiline />
        {timestampsText && <ContentBlock label="Zeitstempel" text={timestampsText} multiline />}
      </div>
    );
  }

  const field =
    platformKey === "linkedin"
      ? "linkedinPost"
      : platformKey === "instagram"
        ? "instagramPost"
        : "tiktokPost";

  return (
    <div className="text-sm">
      <ContentBlock label="Post" text={(content[field] as string) ?? ""} multiline />
    </div>
  );
}

function ContentBlock({
  label,
  text,
  multiline = false,
}: {
  label: string;
  text: string;
  multiline?: boolean;
}) {
  return (
    <div className="border border-gray-200 rounded-md">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <CopyButton text={text} />
      </div>
      <ExpandableText
        text={text}
        multiline={multiline}
        desktopScrollClassName={multiline ? "sm:max-h-56 sm:overflow-y-auto" : undefined}
        blockClassName="px-3 py-2"
      />
    </div>
  );
}

function ExpandableText({
  text,
  multiline = false,
  desktopScrollClassName,
  blockClassName = "",
}: {
  text: string;
  multiline?: boolean;
  desktopScrollClassName?: string;
  blockClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const isLong = words.length > 10;

  const baseBlock = `text-sm text-gray-700 ${blockClassName}`.trim();
  const multilineCls = multiline ? "whitespace-pre-line" : "";
  const mobileCollapsed = !expanded && isLong ? "line-clamp-1" : "";

  return (
    <div>
      <div
        className={`${baseBlock} ${multilineCls} ${mobileCollapsed} ${desktopScrollClassName ?? ""}`.trim()}
      >
        {text}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="sm:hidden mt-1 text-xs text-indigo-600 hover:text-indigo-800"
        >
          {expanded ? "Weniger" : "Mehr"}
        </button>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API blocked (e.g. non-secure context) — leave button unchanged
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="py-1 px-2 text-xs border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-100"
    >
      {copied ? "Kopiert!" : "Kopieren"}
    </button>
  );
}
