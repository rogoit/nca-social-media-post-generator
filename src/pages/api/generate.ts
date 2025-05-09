import type { APIRoute } from "astro";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

// Initialize Google Gemini API
const GOOGLE_GEMINI_API_KEY = import.meta.env.GOOGLE_GEMINI_API_KEY?.replace(/["']/g, '').trim();
const genAI = new GoogleGenerativeAI(GOOGLE_GEMINI_API_KEY);

// Initialize Anthropic Claude API
const ANTHROPIC_API_KEY = import.meta.env.ANTHROPIC_API_KEY?.replace(/["']/g, '').trim();

// Initialize client with let so we can recreate it if needed
let anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

// Global prompt helpers for consistent content generation
const brandNamesPrompt = "Achte auf die richtige Schreibweise dieser Marken und Begriffe: Pimcore (nicht PimCore oder pimcore), TYPO3 (nicht Typo3 oder typo3), CypressIO (nicht Cypress.io oder cypress), JavaScript (nicht Javascript oder javascript), ChatGPT (nicht Chat-GPT oder chatgpt), OpenAI (nicht Open AI oder openai), React (nicht ReactJS oder react), Node.js (nicht NodeJS oder nodejs), Vue.js (nicht VueJS oder vuejs), TypeScript (nicht Typescript oder typescript).";
const avoidExaggerationPrompt = "KEINE übertriebenen Wörter wie \"ultimativ\", \"revolutionär\", \"unglaublich\" - halte es sachlich und präzise.";
const informalAddressPrompt = "Verwende eine informelle Anrede (\"ihr/euch/eure\" statt \"Sie/Ihnen\") und einen lockeren, direkten Ton.";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    let { transcript, type = "youtube" } = body;
    let transcriptCleaned = false;

    // Validate required fields
    if (!transcript) {
      return new Response(
        JSON.stringify({
          error: "Transkript fehlt",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Bereinige Transkript: Entferne einzelne Zeichen am Ende (häufige Fehler bei Transkriptionen)
    const words = transcript.trim().split(/\s+/);
    if (words.length > 0 && words[words.length - 1].length === 1) {
      words.pop(); // Entferne das letzte Wort, wenn es nur ein Zeichen ist
      transcript = words.join(" ");
      transcriptCleaned = true;
      console.log(
        "Ein einzelnes Zeichen am Ende des Transkripts wurde entfernt."
      );
    }

    // Create a prompt based on the user input and content type
    let prompt;
    if (type === "linkedin") {
      prompt = createLinkedinPrompt(transcript);
    } else {
      prompt = createYoutubePrompt(transcript);
    }

    // Try Google Gemini API first, fall back to Claude if rate limited
    let text;
    let modelUsed = "gemini-1.5-pro"; // Default model
    
    try {
      // Generate text using Google Gemini API
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      text = response.text();
    } catch (error) {
      // Fall back to Claude
      try {
        // Fall back to Claude with a more available model
        const claudeModel = "claude-3-haiku-20240307";
        const message = await anthropic.messages.create({
          model: claudeModel,
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
        });
        
        text = message.content[0].text;
        modelUsed = claudeModel;
      } catch (claudeError) {
        throw new Error(`Content generation failed with both AI providers.`);
      }
    }

    // The generated text is now available in 'text' variable

    // Parse the structured response from the AI based on content type
    let parsedResponse;
    if (type === "linkedin") {
      parsedResponse = parseLinkedinResponse(text);
    } else {
      parsedResponse = parseYoutubeResponse(text);
    }

    // The parsed response is now available in 'parsedResponse' variable

    // Füge Information hinzu, wenn das Transkript bereinigt wurde und welches Modell verwendet wurde
    const responseData = {
      ...parsedResponse,
      transcriptCleaned: transcriptCleaned,
      modelUsed: modelUsed,
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    // Generic error handling with appropriate message
    return new Response(
      JSON.stringify({
        error: "Fehler beim Generieren des Inhalts",
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

function createYoutubePrompt(transcript: string): string {
  return `Du bist ein YouTube-Content-Optimierungsassistent. Ich stelle dir ein Transkript aus einem YouTube-Video zur Verfügung, das Fehler, Füllwörter oder unklare Sätze enthalten kann.

${brandNamesPrompt}

Deine Aufgabe ist es:
1. Eine 100% identische Version des Transkripts zu erstellen mit AUSSCHLIESSLICH korrigierter Interpunktion (Kommas, Punkte) und korrekter Schreibweise der Marken und Begriffe im Brandnames-Hinweis. EINZIGE AUSNAHME: Die im Brandnames-Hinweis genannten Marken und Begriffe müssen in der korrekten Schreibweise (Pimcore, TYPO3, CypressIO, JavaScript, ChatGPT, OpenAI) angegeben werden. Ansonsten ABSOLUT KEINE Änderungen an anderen Wörtern oder Wortreihenfolge! KEINE weiteren Rechtschreibkorrekturen, KEINE Änderungen am Satzbau. NUR Kommata und Punkte hinzufügen/korrigieren wo nötig plus korrekte Marken-Schreibweise!
2. Einen SEO-optimierten, aufmerksamkeitsstarken YouTube-Titel zu generieren (60-70 Zeichen, mit Keyword am Anfang)
3. Eine SEHR LANGE YouTube-Beschreibung zu erstellen (ca. 1500 Zeichen, strukturiert in GENAU 3 sehr ausführlichen Absätzen)

Für den Titel:
- Hohe Lesbarkeit steht an erster Stelle! Verwende KEINE Sonderzeichen wie (), &, #, ! oder ähnliches
- ${avoidExaggerationPrompt}
- Verwende klare, direkte Sprache mit starken Verben und konkretem Nutzen
- Setze auf präzise Fachbegriffe statt übertriebene Adjektive (sofern im Transkript vorhanden)
- Idealerweise 60-70 Zeichen (nicht zu kurz!)

Für die Beschreibung:
- WICHTIG: Die Zielgruppe sind Entwickler und die Developer-Community! ${informalAddressPrompt} Verwende eine technikaffine Sprache! ABER: Der Inhalt MUSS sich strikt auf das Transkript beziehen!
- TOTAL WICHTIG: Jeder Absatz soll etwa 500 Zeichen lang sein! Die gesamte Beschreibung soll ca. 1500 Zeichen umfassen.
- Die Beschreibung MUSS sehr detailliert und umfangreich sein mit vielen Informationen und Kontext, ABER **AUSSCHLIESSLICH BASIEREND AUF DEM TRANSKRIPTINHALT!** Erfinde nichts!
- Absatz 1: Hauptproblem und Lösung/Diskussionspunkt (8-10 Sätze) - WICHTIG: Der ERSTE SATZ muss mit dem Hauptkeyword beginnen! **Stelle sicher, dass Problem und Diskussion direkt aus dem Transkript abgeleitet sind.**
- Absatz 2: Ausführliche Details/Argumente/Punkte, die **im Video (Transkript) vorgestellt werden** (8-10 Sätze) - Erwähne konkrete Entwickler-Tools und technische Details **NUR, WENN SIE EXPLIZIT IM TRANSKRIPT VORKOMMEN!** Andernfalls, detailliere die im Transkript genannten allgemeinen Argumente, Aspekte oder Meinungen. **Erfinde keine Tools oder technischen Details, wenn sie nicht genannt wurden!**
- Absatz 3: Detaillierter Call-to-Action, was der Zuschauer als nächstes tun soll (8-10 Sätze) - Direkte Ansprache der Developer-Community mit konkreten nächsten Schritten, die sich **logisch aus dem Transkriptinhalt ergeben** (z.B. zur Diskussion des im Video genannten Problems aufrufen, Meinung in Kommentaren teilen).
- Verwende in allen Absätzen die wichtigsten Keywords und Begriffe **aus dem Transkript**.

Hinweise:
- Keine Programmiersprache schreiben, die nicht im Transkript vorkommt.
- **ABSOLUT KRITISCH: Schreibe in der Beschreibung NUR das, was im Video (Transkript) besprochen wurde. Erfinde KEINE Informationen, Beispiele, Tools, Strategien oder Meinungen, die nicht explizit genannt werden, auch wenn andere Anweisungen (wie Zielgruppenansprache oder Länge) dies nahezulegen scheinen. Die Treue zum Transkriptinhalt hat oberste Priorität! Wenn das Transkript keine Details für Entwickler enthält, dann schreibe auch keine solchen Details in die Beschreibung, sondern bleibe allgemein, aber behalte den lockeren "ihr/euch"-Ton bei.**

Bitte formatiere deine Antwort wie folgt (benutze weiterhin die englischen Abschnittsbezeichnungen, aber der Inhalt soll auf Deutsch sein):

TRANSCRIPT:
[korrigierter Transkripttext]

TITLE:
[YouTube-Titel, 60-70 Zeichen]

DESCRIPTION:
[SEHR LANGE YouTube-Beschreibung in GENAU 3 sehr ausführlichen Absätzen mit jeweils ca. 500 Zeichen, insgesamt ca. 1500 Zeichen, mit informeller Du/Ihr-Ansprache für Entwickler, ABER STRIKT AM TRANSKRIPTINHALT ORIENTIERT]

Hier ist das Transkript:
${transcript}`;
}

function createLinkedinPrompt(transcript: string): string {
  return `Du bist ein LinkedIn-Content-Optimierungsassistent. Ich stelle dir ein Transkript zur Verfügung, das ich in einen überzeugenden LinkedIn-Post umwandeln möchte.

${brandNamesPrompt}

Deine Aufgabe ist es, einen professionellen und ansprechenden LinkedIn-Post auf Deutsch zu erstellen, der folgende Spezifikationen erfüllt:

- Zielgruppe: Eigene Follower und Entscheider
- Thema: Informativ herausstellen
- Tone of Voice: Soll klar machen, dass ich viel Spaß an den Themen habe und diese direkt helfen; ich bringe das gerne in Demos und Remote Workshops in Teams
- Anrede: ${informalAddressPrompt} "Demo" nur erwähnen, wenn es um Barrierefreies Webdesign oder Refactoring geht
- Abschluss: Eine sehr gute und motivierende Frage stellen, die dazu einlädt zu antworten und Leser als Experten wertschätzt

Nicht zu verwendende Wörter:
- Revolution (und ähnliche übertriebene Begriffe)
${avoidExaggerationPrompt}

Formatierung:
- LinkedIn-Post sollte zwischen 1000-1500 Zeichen lang sein
- Verwende Absätze zur besseren Lesbarkeit
- WICHTIG: KEINE EMOJIS VERWENDEN - verzichte komplett auf Emojis im Text
- Füge 3-5 relevante Hashtags am Ende hinzu

Bitte formatiere deine Antwort wie folgt (benutze die englische Bezeichnung "LINKEDIN POST", aber der Inhalt soll komplett auf Deutsch sein):

LINKEDIN POST:
[Der komplette LinkedIn-Post auf Deutsch mit Absätzen und Hashtags]

Hier ist das Transkript:
${transcript}`;
}

function parseYoutubeResponse(text: string): {
  transcript: string;
  title: string;
  description: string;
} {
  // Default values in case parsing fails
  let result = {
    transcript: "",
    title: "",
    description: "",
  };

  // Extract transcript
  const transcriptMatch = text.match(/TRANSCRIPT:\s*([\s\S]*?)(?=TITLE:|$)/);
  if (transcriptMatch && transcriptMatch[1]) {
    result.transcript = transcriptMatch[1].trim();
  }

  // Extract title
  const titleMatch = text.match(/TITLE:\s*([\s\S]*?)(?=DESCRIPTION:|$)/);
  if (titleMatch && titleMatch[1]) {
    result.title = titleMatch[1].trim();
  }

  // Extract description
  const descriptionMatch = text.match(/DESCRIPTION:\s*([\s\S]*?)(?=$)/);
  if (descriptionMatch && descriptionMatch[1]) {
    result.description = descriptionMatch[1].trim();
  }

  return result;
}

function parseLinkedinResponse(text: string): {
  linkedinPost: string;
} {
  // Default values in case parsing fails
  let result = {
    linkedinPost: "",
  };

  // Extract LinkedIn post
  const linkedinMatch = text.match(/LINKEDIN POST:\s*([\s\S]*?)(?=$)/);
  if (linkedinMatch && linkedinMatch[1]) {
    result.linkedinPost = linkedinMatch[1].trim();
  }

  return result;
}
