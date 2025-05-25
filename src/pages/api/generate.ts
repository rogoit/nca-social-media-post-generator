import type { APIRoute } from "astro";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

// Type definitions
interface GenerateRequest {
  transcript: string;
  type?: "youtube" | "linkedin" | "twitter" | "keywords";
  videoDuration?: string;
  keywords?: string[];
}

interface GenerateResponse {
  transcript?: string;
  title?: string;
  description?: string;
  timestamps?: string;
  linkedinPost?: string;
  twitterPost?: string;
  keywords?: string[];
  transcriptCleaned: boolean;
  modelUsed: string;
  error?: string;
}

interface AIError {
  status?: number;
  message: string;
  provider: string;
}

// Initialize AI providers
const GOOGLE_GEMINI_API_KEY = import.meta.env.GOOGLE_GEMINI_API_KEY?.replace(/["']/g, '').trim();
const ANTHROPIC_API_KEY = import.meta.env.ANTHROPIC_API_KEY?.replace(/["']/g, '').trim();

const genAI = new GoogleGenerativeAI(GOOGLE_GEMINI_API_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Global prompt helpers for consistent content generation
const BRAND_NAMES_PROMPT = "Achte auf die richtige Schreibweise dieser Marken und Begriffe: Pimcore (nicht PimCore oder pimcore), TYPO3 (nicht Typo3 oder typo3), CypressIO (nicht Cypress.io oder cypress), JavaScript (nicht Javascript oder javascript), ChatGPT (nicht Chat-GPT oder chatgpt), OpenAI (nicht Open AI oder openai), React (nicht ReactJS oder react), Node.js (nicht NodeJS oder nodejs), Vue.js (nicht VueJS oder vuejs), TypeScript (nicht Typescript oder typescript), PHP (nicht php oder Php), PHPUnit (nicht PhpUnit oder phpunit), PHPStan (nicht Phpstan oder php-stan), RectorPHP (nicht Rector oder rector-php), Vitest (nicht vitest oder vi-test), Make.com (nicht Make, Make.io oder make.com), Claude 4 (nicht Claude4 oder claude 4), Claude 3.7 (nicht Claude37 oder claude 3.7), Vibe Coding (nicht vibe coding oder VibeCoding).";
const AVOID_EXAGGERATION_PROMPT = "KEINE übertriebenen Wörter wie \"ultimativ\", \"revolutionär\", \"unglaublich\" - halte es sachlich und präzise.";
const INFORMAL_ADDRESS_PROMPT = "Verwende eine informelle Anrede (\"ihr/euch/eure\" statt \"Sie/Ihnen\") und einen lockeren, direkten Ton.";

// Available models for fallback
const AI_MODELS = {
  google: ["gemini-1.5-pro", "gemini-1.5-flash"],
  anthropic: ["claude-3-haiku-20240307", "claude-3-sonnet-20240229"]
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as GenerateRequest;
    const { type = "youtube", videoDuration, keywords } = body;
    let { transcript } = body;
    let transcriptCleaned = false;

    // Validate required fields
    if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
      return new Response(
        JSON.stringify({
          error: "Transkript fehlt oder ist ungültig",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Validate type
    if (type !== "youtube" && type !== "linkedin" && type !== "twitter" && type !== "keywords") {
      return new Response(
        JSON.stringify({
          error: "Ungültiger Typ. Erlaubt sind: youtube, linkedin, twitter, keywords",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Clean transcript: Remove single characters at the end
    const words = transcript.trim().split(/\s+/);
    if (words.length > 0 && words[words.length - 1].length === 1) {
      words.pop();
      transcript = words.join(" ");
      transcriptCleaned = true;
      console.log("Ein einzelnes Zeichen am Ende des Transkripts wurde entfernt.");
    }

    // Create prompt based on content type
    let prompt: string;
    if (type === "linkedin") {
      prompt = createLinkedinPrompt(transcript, keywords);
    } else if (type === "twitter") {
      prompt = createTwitterPrompt(transcript);
    } else if (type === "keywords") {
      prompt = createKeywordsPrompt(transcript);
    } else {
      prompt = createYoutubePrompt(transcript, videoDuration, keywords);
    }

    // Try to generate content with AI providers
    let text: string;
    let modelUsed: string = "";
    const errors: AIError[] = [];

    // Try Google Gemini models
    for (const model of AI_MODELS.google) {
      try {
        const genModel = genAI.getGenerativeModel({ model });
        const result = await genModel.generateContent(prompt);
        const response = await result.response;
        text = response.text();
        modelUsed = model;
        break;
      } catch (error: any) {
        errors.push({
          provider: "Google Gemini",
          message: error.message || "Unbekannter Fehler",
          status: error.status,
        });
        console.error(`Fehler mit ${model}:`, error.message);
      }
    }

    // If Google failed, try Anthropic models
    if (!modelUsed) {
      for (const model of AI_MODELS.anthropic) {
        try {
          const message = await anthropic.messages.create({
            model,
            max_tokens: 4000,
            messages: [
              {
                role: "user",
                content: prompt
              }
            ],
          });
          
          text = message.content[0].text;
          modelUsed = model;
          break;
        } catch (error: any) {
          errors.push({
            provider: "Anthropic Claude",
            message: error.message || "Unbekannter Fehler",
            status: error.status,
          });
          console.error(`Fehler mit ${model}:`, error.message);
        }
      }
    }

    // If all providers failed
    if (!modelUsed) {
      const errorMessage = errors.map(e => `${e.provider}: ${e.message}`).join(", ");
      return new Response(
        JSON.stringify({
          error: "Inhaltsgenerierung fehlgeschlagen",
          details: errorMessage,
          errors,
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Parse the structured response from AI
    let parsedResponse: Partial<GenerateResponse>;
    if (type === "linkedin") {
      parsedResponse = parseLinkedinResponse(text!);
    } else if (type === "twitter") {
      parsedResponse = parseTwitterResponse(text!);
    } else if (type === "keywords") {
      parsedResponse = parseKeywordsResponse(text!);
    } else {
      parsedResponse = parseYoutubeResponse(text!);
    }

    // Add metadata to response
    const responseData: GenerateResponse = {
      ...parsedResponse,
      transcriptCleaned,
      modelUsed,
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("Unerwarteter Fehler:", error);
    return new Response(
      JSON.stringify({
        error: "Unerwarteter Fehler beim Generieren des Inhalts",
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};

function createPromptBase(transcript: string): string {
  return `${BRAND_NAMES_PROMPT}

${AVOID_EXAGGERATION_PROMPT}

${INFORMAL_ADDRESS_PROMPT}

Transkript:
${transcript}`;
}

function createYoutubePrompt(transcript: string, videoDuration?: string, keywords?: string[]): string {
  const base = createPromptBase(transcript);
  const keywordsPrompt = keywords && keywords.length > 0 
    ? `\n\nPRIORITÄT-KEYWORDS: Diese Keywords sollen priorisiert und prominent verwendet werden: ${keywords.join(', ')}`
    : '';
  
  return `Du bist ein YouTube-Content-Optimierungsassistent für Entwickler-Content. Wichtiger Hinweis: Es handelt sich um YouTube SHORTS, NICHT um lange Videos.

${base}${keywordsPrompt}

Deine Aufgabe ist es:
1. Eine 100% identische Version des Transkripts zu erstellen mit AUSSCHLIESSLICH korrigierter Interpunktion (Kommas, Punkte) und korrekter Schreibweise der Marken und Begriffe im Brandnames-Hinweis. EINZIGE AUSNAHME: Die im Brandnames-Hinweis genannten Marken und Begriffe müssen in der korrekten Schreibweise angegeben werden. Ansonsten ABSOLUT KEINE Änderungen an anderen Wörtern oder Wortreihenfolge! KEINE weiteren Rechtschreibkorrekturen, KEINE Änderungen am Satzbau. NUR Kommata und Punkte hinzufügen/korrigieren wo nötig plus korrekte Marken-Schreibweise!
2. Einen SEO-optimierten, aufmerksamkeitsstarken YouTube-Titel zu generieren (60-70 Zeichen, mit Keyword am Anfang)
3. Eine SEHR LANGE YouTube-Beschreibung zu erstellen (ca. 1500 Zeichen, strukturiert in GENAU 3 sehr ausführlichen Absätzen)${videoDuration ? `
4. SEO-optimierte Zeitstempel mit Topics generieren (GENAU 5 Zeitstempel basierend auf der Video-Dauer: ${videoDuration})` : ''}

Für den Titel:
- Stelle eine kontroverse These auf oder provoziere eine Diskussion (Beispiel: "PHP ist 2024 immer noch die beste Wahl für...")
- Nutze Formulierungen wie "Meine Meinung zu...", "Warum ich denke, dass...", "3 Gründe warum..."
- Hohe Lesbarkeit steht an erster Stelle! Verwende KEINE Sonderzeichen wie (), &, #, ! oder ähnliches
- Setze auf präzise Fachbegriffe statt übertriebene Adjektive (sofern im Transkript vorhanden)
- WICHTIG: Verwende die Priorität-Keywords prominent im Titel, besonders am Anfang
- Idealerweise 60-70 Zeichen (nicht zu kurz!)

Für die Beschreibung:
- WICHTIG: Die Zielgruppe sind Entwickler und die Developer-Community! Verwende eine technikaffine Sprache! ABER: Der Inhalt MUSS sich strikt auf das Transkript beziehen!
- TOTAL WICHTIG: Jeder Absatz soll etwa 500 Zeichen lang sein! Die gesamte Beschreibung soll ca. 1500 Zeichen umfassen.
- Die Beschreibung MUSS sehr detailliert und umfangreich sein mit vielen Informationen und Kontext, ABER **AUSSCHLIESSLICH BASIEREND AUF DEM TRANSKRIPTINHALT!** Erfinde nichts!
- WICHTIG: Integriere die Priorität-Keywords natürlich und prominent in die Beschreibung
- Absatz 1: Stelle eine These oder kontroverse Meinung auf, die sich aus dem Transkript ergibt (8-10 Sätze) - WICHTIG: Der ERSTE SATZ muss mit dem Hauptkeyword beginnen und direkt eine Meinung oder These präsentieren!
- Absatz 2: Führe Argumente und Gegenpositionen aus **die im Short (Transkript) erwähnt werden** (8-10 Sätze) - Formuliere Fragen wie "Was denkt ihr zu..." oder "Habt ihr ähnliche Erfahrungen mit..."
- Absatz 3: Fordere die Community zur Diskussion auf (8-10 Sätze) - Stelle konkrete Fragen, lade zu Gegenargumenten ein, frage nach eigenen Erfahrungen!
- Verwende Formulierungen wie: "Ich behaupte...", "Meiner Meinung nach...", "Was ist eure Erfahrung mit...", "Widersprecht mir gerne in den Kommentaren!"

Hinweise:
- Keine Programmiersprache schreiben, die nicht im Transkript vorkommt.
- NIEMALS Formulierungen wie "Im Video diskutieren wir" verwenden - es sind SHORTS!
- **ABSOLUT KRITISCH: Schreibe in der Beschreibung NUR das, was im Short (Transkript) besprochen wurde. Erfinde KEINE Informationen, Beispiele, Tools, Strategien oder Meinungen, die nicht explizit genannt werden.**${videoDuration ? `

Für die Zeitstempel (nur wenn Video-Dauer angegeben: ${videoDuration}):
- Erstelle GENAU 5 Zeitstempel gleichmäßig über die Video-Dauer verteilt
- Der erste Zeitstempel soll immer 0:00 sein
- Der letzte Zeitstempel soll die angegebene Video-Dauer sein (${videoDuration})
- Verteile die mittleren 3 Zeitstempel gleichmäßig dazwischen
- Jeder Zeitstempel soll ein prägnantes, SEO-optimiertes Topic haben (max. 60 Zeichen)
- Die Topics MÜSSEN sich direkt aus dem Transkriptinhalt ableiten - KEINE erfundenen Topics!
- Format: "0:00 Topic-Name"
- Topics sollen als Sprungmarken fungieren und Nutzer zum Klicken animieren
- Verwende Keywords aus dem Transkript in den Topic-Namen
- Beispiel: "0:00 Warum PHP 2024 relevant bleibt", "2:15 Moderne PHP-Features im Einsatz"` : ''}

Bitte formatiere deine Antwort wie folgt (benutze weiterhin die englischen Abschnittsbezeichnungen, aber der Inhalt soll auf Deutsch sein):

TRANSCRIPT:
[korrigierter Transkripttext]

TITLE:
[YouTube-Titel mit These/Meinung, 60-70 Zeichen]

DESCRIPTION:
[SEHR LANGE YouTube-Beschreibung in GENAU 3 sehr ausführlichen Absätzen mit jeweils ca. 500 Zeichen, insgesamt ca. 1500 Zeichen, mit kontroversen Thesen und Fragen an die Community]${videoDuration ? `

TIMESTAMPS:
[5 SEO-optimierte Zeitstempel mit Topics, gleichmäßig über ${videoDuration} verteilt]` : ''}`;
}

function createLinkedinPrompt(transcript: string, keywords?: string[]): string {
  const base = createPromptBase(transcript);
  const keywordsPrompt = keywords && keywords.length > 0 
    ? `\n\nPRIORITÄT-KEYWORDS: Diese Keywords sollen priorisiert und prominent verwendet werden: ${keywords.join(', ')}`
    : '';
  
  return `Du bist ein LinkedIn-Content-Optimierungsassistent. Ich stelle dir ein Transkript zur Verfügung, das ich in einen überzeugenden LinkedIn-Post umwandeln möchte.

${base}${keywordsPrompt}

Deine Aufgabe ist es, einen professionellen und ansprechenden LinkedIn-Post auf Deutsch zu erstellen, der folgende Spezifikationen erfüllt:

- Zielgruppe: Eigene Follower und Entscheider
- Thema: Informativ herausstellen
- Tone of Voice: Soll klar machen, dass ich viel Spaß an den Themen habe und diese direkt helfen; ich bringe das gerne in Demos und Remote Workshops in Teams
- Anrede: "Demo" nur erwähnen, wenn es um Barrierefreies Webdesign oder Refactoring geht
- WICHTIG: Integriere die Priorität-Keywords natürlich und prominent in den Post
- Abschluss: Eine sehr gute und motivierende Frage stellen, die dazu einlädt zu antworten und Leser als Experten wertschätzt

Kontext-spezifische Beispiele:
- Bei AI-Themen: Erwähne relevante AI-Tools wie ChatGPT, Gemini, Claude oder AI Studio
- Bei PHP-Themen: Erwähne PHP-spezifische Tools wie PHPUnit, PHPStan, RectorPHP oder Composer
- Bei JavaScript-Themen: Erwähne JS-Tools wie Node.js, npm, Vitest oder TypeScript
- WICHTIG: Verwende NUR die Tools/Technologien, die inhaltlich zum Hauptthema passen - keine Vermischung!

Nicht zu verwendende Wörter:
- Revolution (und ähnliche übertriebene Begriffe)

Formatierung:
- LinkedIn-Post sollte zwischen 1000-1500 Zeichen lang sein
- Verwende Absätze zur besseren Lesbarkeit
- WICHTIG: KEINE EMOJIS VERWENDEN - verzichte komplett auf Emojis im Text
- Füge 3-5 relevante Hashtags am Ende hinzu

Bitte formatiere deine Antwort wie folgt (benutze die englische Bezeichnung "LINKEDIN POST", aber der Inhalt soll komplett auf Deutsch sein):

LINKEDIN POST:
[Der komplette LinkedIn-Post auf Deutsch mit Absätzen und Hashtags]`;
}

function createTwitterPrompt(transcript: string): string {
  const base = createPromptBase(transcript);
  return `Du bist ein Twitter-Content-Optimierungsassistent für Entwickler-Content. Ich stelle dir ein Transkript zur Verfügung, das ich in einen ansprechenden Twitter-Post umwandeln möchte.

${base}

Deine Aufgabe ist es, einen prägnanten und ansprechenden Twitter-Post auf Deutsch zu erstellen, der folgende Spezifikationen erfüllt:

- Zielgruppe: Developer-Community und Tech-Enthusiasten
- Tone of Voice: Direkt, meinungsstark und diskussionsfördernd
- Zeichenlimit: Maximal 280 Zeichen
- Stil: Prägnant, auf den Punkt, provokativ aber sachlich

Inhaltliche Anforderungen:
- Stelle eine These oder kontroverse Meinung auf, die sich aus dem Transkript ergibt
- Verwende eine direkte, persönliche Ansprache ("Ich glaube...", "Meine Erfahrung...")
- Fordere zur Diskussion auf mit Formulierungen wie "Was meint ihr?" oder "Stimmt ihr zu?"
- Nutze 1-2 relevante Hashtags (maximal!)

Kontext-spezifische Beispiele:
- Bei AI-Themen: Erwähne relevante AI-Tools wie ChatGPT, Gemini, Claude
- Bei PHP-Themen: Erwähne PHP-spezifische Tools wie PHPUnit, PHPStan, RectorPHP
- Bei JavaScript-Themen: Erwähne JS-Tools wie Node.js, TypeScript, Vitest
- WICHTIG: Verwende NUR die Tools/Technologien, die inhaltlich zum Hauptthema passen

Formatierung:
- KEINE Emojis verwenden
- Kurze, prägnante Sätze
- Maximal 280 Zeichen inklusive Hashtags
- 1-2 relevante Hashtags am Ende

Bitte formatiere deine Antwort wie folgt (benutze die englische Bezeichnung "TWITTER POST", aber der Inhalt soll komplett auf Deutsch sein):

TWITTER POST:
[Der komplette Twitter-Post auf Deutsch, maximal 280 Zeichen mit Hashtags]`;
}

||||||| parent of e47548b (Add AI-powered keyword detection with SEO integration)
=======
function createKeywordsPrompt(transcript: string): string {
  return `Du bist ein AI-Assistent für SEO-Keyword-Extraktion. Analysiere das folgende Transkript und extrahiere die 3 wichtigsten Keywords für YouTube-Tags.

${BRAND_NAMES_PROMPT}

Transkript:
${transcript}

WICHTIG: Analysiere NUR den gegebenen Text. Verwende KEINE vordefinierten Listen oder Beispiele.

Identifiziere die wichtigsten Begriffe, die:
- Tatsächlich im Transkript vorkommen
- Das Hauptthema repräsentieren
- Als YouTube-Tags relevant wären
- Spezifisch genug sind (keine allgemeinen Wörter wie "gut", "machen", "project")
- Bevorzuge Markennamen und spezifische Technologien (z.B. "Claude 4", "Astro Framework")

Extrahiere die 3 relevantesten Keywords direkt aus dem Transkript-Inhalt.

Gib die Keywords in folgendem Format zurück:

KEYWORDS:
keyword1
keyword2
keyword3`;
}

>>>>>>> e47548b (Add AI-powered keyword detection with SEO integration)
function parseYoutubeResponse(text: string): Partial<GenerateResponse> {
  // Default values in case parsing fails
  const result: Partial<GenerateResponse> = {
    transcript: "",
    title: "",
    description: "",
  };

  // Extract transcript
  const transcriptMatch = text.match(/TRANSCRIPT:\s*([\s\S]*?)(?=TITLE:|$)/);
  if (transcriptMatch?.[1]) {
    result.transcript = transcriptMatch[1].trim();
  }

  // Extract title
  const titleMatch = text.match(/TITLE:\s*([\s\S]*?)(?=DESCRIPTION:|$)/);
  if (titleMatch?.[1]) {
    result.title = titleMatch[1].trim();
  }

  // Extract description
  const descriptionMatch = text.match(/DESCRIPTION:\s*([\s\S]*?)(?=TIMESTAMPS:|$)/);
  if (descriptionMatch?.[1]) {
    result.description = descriptionMatch[1].trim();
  }

  // Extract timestamps (if present)
  const timestampsMatch = text.match(/TIMESTAMPS:\s*([\s\S]*?)(?=$)/);
  if (timestampsMatch?.[1]) {
    result.timestamps = timestampsMatch[1].trim();
  }

  return result;
}

function parseLinkedinResponse(text: string): Partial<GenerateResponse> {
  // Default values in case parsing fails
  const result: Partial<GenerateResponse> = {
    linkedinPost: "",
  };

  // Extract LinkedIn post
  const linkedinMatch = text.match(/LINKEDIN POST:\s*([\s\S]*?)(?=$)/);
  if (linkedinMatch?.[1]) {
    result.linkedinPost = linkedinMatch[1].trim();
  }

  return result;
}

function parseTwitterResponse(text: string): Partial<GenerateResponse> {
  // Default values in case parsing fails
  const result: Partial<GenerateResponse> = {
    twitterPost: "",
  };

  // Extract Twitter post
  const twitterMatch = text.match(/TWITTER POST:\s*([\s\S]*?)(?=$)/);
  if (twitterMatch?.[1]) {
    result.twitterPost = twitterMatch[1].trim();
  }

  return result;
}

function parseKeywordsResponse(text: string): Partial<GenerateResponse> {
  const result: Partial<GenerateResponse> = {
    keywords: [],
  };

  // Extract keywords
  const keywordsMatch = text.match(/KEYWORDS:\s*([\s\S]*?)(?=$)/);
  if (keywordsMatch?.[1]) {
    const keywordsText = keywordsMatch[1].trim();
    const keywords = keywordsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .slice(0, 3); // Ensure max 3 keywords
    
    result.keywords = keywords;
  }

  return result;
}