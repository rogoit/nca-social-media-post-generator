import { useStore } from "@nanostores/react";
import { generationStore, reset } from "../stores/generation-store.js";

export default function ErrorBanner() {
  const state = useStore(generationStore);

  if (state.stage !== "error" || !state.errorMessage) return null;

  return (
    <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-md border border-red-200 flex items-center justify-between">
      <p className="text-sm">{state.errorMessage}</p>
      <button
        type="button"
        onClick={reset}
        className="ml-4 py-1 px-3 text-sm border border-red-300 rounded-md hover:bg-red-100"
      >
        Neu starten
      </button>
    </div>
  );
}
