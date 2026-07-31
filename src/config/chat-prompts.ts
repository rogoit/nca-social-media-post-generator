import { GLOBAL_PROMPT_HELPERS } from "./prompts.js";

type ChatPlatform = "youtube" | "linkedin" | "instagram" | "tiktok";

interface PlatformMessageOptions {
  videoDuration?: string;
}

export class ChatPrompts {
  static createInitialMessage(transcript: string): string {
    return `Du bist ein Social-Media-Content-Optimierungsassistent für Entwickler-Content im Jahr ${new Date().getFullYear()}.

${GLOBAL_PROMPT_HELPERS.BRAND_NAMES}

${GLOBAL_PROMPT_HELPERS.FACT_GROUNDING}

${GLOBAL_PROMPT_HELPERS.AVOID_EXAGGERATION}

${GLOBAL_PROMPT_HELPERS.INFORMAL_ADDRESS}

${GLOBAL_PROMPT_HELPERS.HUMANIZER}

Hier ist das Transkript eines Videos. Es enthält Erkennungsfehler aus der Sprache-zu-Text-Umwandlung.

Transkript:
${transcript}

Deine Aufgabe: Gib ein JSON-Objekt mit genau diesen Feldern zurück:
- "transcript": Eine korrigierte Version des Transkripts mit AUSSCHLIESSLICH korrigierter Interpunktion (Kommas, Punkte) und korrekter Schreibweise der Marken und Begriffe aus dem Brandnames-Hinweis. KEINE weiteren Änderungen an Wörtern oder Satzbau!
- "keywords": Ein Array mit genau 3 SEO-Keywords (jeweils max. 2-3 Wörter, KEINE Nummerierung, KEIN Markdown, KEINE Sonderzeichen).

Korrektur-Hinweise:
- "Clothe", "clode", "clot" ersetze mit "Claude"
- "Superlo", "Superclo", "Superclode" ersetze mit "SuperClaude"
- "PAP", "PP" ersetze mit "PHP"
- "Sulo", "Solu" ersetze mit "Sulu"
- "Open Code", "open code", "opencode", "cs code" ersetze mit "OpenCode"
- Wenn Transkript auf Englisch ist, bleibe auf Englisch

Antworte NUR mit dem JSON-Objekt, kein sonstiger Text, kein Markdown.`;
  }

  static createPlatformMessage(
    platform: ChatPlatform,
    options: PlatformMessageOptions = {}
  ): string {
    switch (platform) {
      case "youtube":
        return this.youtubeMessage(options.videoDuration);
      case "linkedin":
        return this.linkedinMessage();
      case "instagram":
        return this.instagramMessage();
      case "tiktok":
        return this.tiktokMessage();
    }
  }

  private static youtubeMessage(videoDuration?: string): string {
    const timestampsField = videoDuration
      ? `\n- "timestamps": Ein Array mit GENAU 5 Zeitstempel-Strings im Format "0:00 Topic-Name". Erster ist "0:00", letzter ist "${videoDuration}", alle gleichmäßig verteilt über die Themen des Transkripts.`
      : "";

    const timestampsRule = videoDuration ? `\n\ntimestamps: 5 Einträge, gleichmäßig verteilt.` : "";

    return `Erstelle jetzt YouTube-Content basierend auf dem korrigierten Transkript und den Keywords. Gib ein JSON-Objekt mit diesen Feldern zurück:
- "title": SEO-optimierter Titel (60-70 Zeichen, Keyword am Anfang).
- "description": Sehr lange Beschreibung (ca. 1500 Zeichen, GENAU 3 ausführliche Absätze à 8-10 Sätze).${timestampsField}

Regeln:
Titel: VERBOTEN sind "Meine Meinung zu...", negative Clickbait, (), &, #, !. Statt "&" immer "und"/"+" schreiben. Nie "Im Short zeige ich"/"Im Video". Ich-Perspektive. Englisch wenn Transkript englisch.
Beschreibung: Für Entwickler. Absatz 1: These mit Hauptkeyword am Anfang. Absatz 2: Argumente aus dem Transkript. Absatz 3: Community-Diskussion. NUR Fakten aus dem Transkript. Erfinde KEINE Zeitangaben, Daten, Zahlen, Events oder Zitate, die nicht im Transkript stehen.${timestampsRule}

Antworte NUR mit dem JSON-Objekt, kein sonstiger Text, kein Markdown.`;
  }

  private static linkedinMessage(): string {
    return `Erstelle jetzt einen LinkedIn-Post basierend auf dem korrigierten Transkript und den Keywords. Gib ein JSON-Objekt mit dem Feld "linkedinPost" zurück:

- 1000-1500 Zeichen, mit Absätzen
- Zielgruppe: Follower und Entscheider
- Ton: Spaß an Themen, helfe in Demos und Remote Workshops
- KEINE EMOJIS
- Keywords prominent integriert
- Abschluss: Motivierende Frage
- 3-5 Hashtags am Ende
- NUR passende Tools/Technologien
- NUR Fakten aus dem Transkript. Erfinde KEINE Zeitangaben, Daten, Zahlen, Events oder Zitate, die nicht im Transkript stehen.

Antworte NUR mit dem JSON-Objekt, kein sonstiger Text, kein Markdown.`;
  }

  private static instagramMessage(): string {
    return `Erstelle jetzt einen Instagram-Post basierend auf dem korrigierten Transkript. Gib ein JSON-Objekt mit dem Feld "instagramPost" zurück:

- 500-800 Zeichen
- Persönlich, kurze Absätze
- KEINE Emojis
- GENAU 10 Hashtags: erste 3 MÜSSEN #nca #duisburg #ncatestify sein, 7 themenspezifisch
- NUR Fakten aus dem Transkript. Erfinde KEINE Zeitangaben, Daten, Zahlen, Events oder Zitate, die nicht im Transkript stehen.

Antworte NUR mit dem JSON-Objekt, kein sonstiger Text, kein Markdown.`;
  }

  private static tiktokMessage(): string {
    return `Erstelle jetzt einen TikTok-Post basierend auf dem korrigierten Transkript und den Keywords. Gib ein JSON-Objekt mit dem Feld "tiktokPost" zurück:

- 150-300 Zeichen (ohne Hashtags)
- Starker Hook in den ersten 10-15 Wörtern
- KEINE Emojis
- 3-6 Hashtags (deutsch + englisch Mix)
- NUR Fakten aus dem Transkript. Erfinde KEINE Zeitangaben, Daten, Zahlen, Events oder Zitate, die nicht im Transkript stehen.

Antworte NUR mit dem JSON-Objekt, kein sonstiger Text, kein Markdown.`;
  }
}
