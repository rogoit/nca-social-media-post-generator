import type { APIRoute } from 'astro';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Google Gemini API
const genAI = new GoogleGenerativeAI(import.meta.env.GOOGLE_GEMINI_API_KEY);

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    let { transcript, type = 'youtube' } = body;
    let transcriptCleaned = false;

    // Validate required fields
    if (!transcript) {
      return new Response(
        JSON.stringify({
          error: 'Transkript fehlt',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Bereinige Transkript: Entferne einzelne Zeichen am Ende (häufige Fehler bei Transkriptionen)
    const words = transcript.trim().split(/\s+/);
    if (words.length > 0 && words[words.length - 1].length === 1) {
      words.pop(); // Entferne das letzte Wort, wenn es nur ein Zeichen ist
      transcript = words.join(' ');
      transcriptCleaned = true;
      console.log('Ein einzelnes Zeichen am Ende des Transkripts wurde entfernt.');
    }

    // Create a prompt based on the user input and content type
    let prompt;
    if (type === 'linkedin') {
      prompt = createLinkedinPrompt(transcript);
    } else {
      prompt = createYoutubePrompt(transcript);
    }

    // Generate text using Google Gemini API
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Debug: Log the raw AI response
    console.log(`--- DEBUG: RAW AI RESPONSE FOR ${type.toUpperCase()} ---`);
    console.log(text);
    console.log('--- END RAW AI RESPONSE ---');

    // Parse the structured response from the AI based on content type
    let parsedResponse;
    if (type === 'linkedin') {
      parsedResponse = parseLinkedinResponse(text);
    } else {
      parsedResponse = parseYoutubeResponse(text);
    }
    
    // Debug: Log the parsed response
    console.log('--- DEBUG: PARSED RESPONSE ---');
    console.log(JSON.stringify(parsedResponse, null, 2));
    console.log('--- END PARSED RESPONSE ---');

    // Füge Information hinzu, wenn das Transkript bereinigt wurde
    const responseData = {
      ...parsedResponse,
      transcriptCleaned: transcriptCleaned
    };

    return new Response(
      JSON.stringify(responseData),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Fehler beim Generieren des Inhalts:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Fehler beim Generieren des Inhalts',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};

function createYoutubePrompt(transcript: string): string {
  return `Du bist ein YouTube-Content-Optimierungsassistent. Ich stelle dir ein Transkript aus einem YouTube-Video zur Verfügung, das Fehler, Füllwörter oder unklare Sätze enthalten kann.

Deine Aufgabe ist es:
1. Eine 100% identische Version des Transkripts zu erstellen mit AUSSCHLIESSLICH korrigierter Interpunktion (Kommas, Punkte). ABSOLUT KEINE Änderungen an Wörtern oder Wortreihenfolge! KEINE Rechtschreibkorrekturen, KEINE Änderungen am Satzbau. NUR Kommata und Punkte hinzufügen/korrigieren wo nötig!
2. Einen SEO-optimierten, aufmerksamkeitsstarken YouTube-Titel zu generieren (60-70 Zeichen, mit Keyword am Anfang)
3. Eine SEHR LANGE YouTube-Beschreibung zu erstellen (ca. 1500 Zeichen, strukturiert in GENAU 3 sehr ausführlichen Absätzen)

Für den Titel:
- Hohe Lesbarkeit steht an erster Stelle! Verwende KEINE Sonderzeichen wie (), &, #, ! oder ähnliches
- KEINE übertriebenen Wörter wie "ultimativ", "revolutionär", "unglaublich" - halte es sachlich und präzise
- Verwende klare, direkte Sprache mit starken Verben und konkretem Nutzen
- Setze auf präzise Fachbegriffe statt übertriebene Adjektive
- Idealerweise 60-70 Zeichen (nicht zu kurz!)

Für die Beschreibung:
- WICHTIG: Die Zielgruppe sind Entwickler und die Developer-Community! Sprich die Leser entsprechend mit "ihr/euch/eure" (nicht mit "Sie/Ihnen") an und verwende eine lockere, technikaffine Sprache!
- TOTAL WICHTIG: Jeder Absatz soll etwa 500 Zeichen lang sein! Die gesamte Beschreibung soll ca. 1500 Zeichen umfassen.
- Die Beschreibung MUSS sehr detailliert und umfangreich sein mit vielen Informationen und Kontext!
- Absatz 1: Hauptproblem und Lösung (8-10 Sätze) - WICHTIG: Der ERSTE SATZ muss mit dem Hauptkeyword beginnen!
- Absatz 2: Ausführliche Details/Vorteile der im Video vorgestellten Methode (8-10 Sätze) - Erwähne konkrete Entwickler-Tools und technische Details!
- Absatz 3: Detaillierter Call-to-Action, was der Zuschauer als nächstes tun soll (8-10 Sätze) - Direkte Ansprache der Developer-Community mit konkreten nächsten Schritten!
- Verwende in allen Absätzen die wichtigsten Keywords, technische Begriffe und sehr detaillierte Beschreibungen

Bitte formatiere deine Antwort wie folgt (benutze weiterhin die englischen Abschnittsbezeichnungen, aber der Inhalt soll auf Deutsch sein):

TRANSCRIPT:
[korrigierter Transkripttext]

TITLE:
[YouTube-Titel, 60-70 Zeichen]

DESCRIPTION:
[SEHR LANGE YouTube-Beschreibung in GENAU 3 sehr ausführlichen Absätzen mit jeweils ca. 500 Zeichen, insgesamt ca. 1500 Zeichen, mit informeller Du/Ihr-Ansprache für Entwickler]

Hier ist das Transkript:
${transcript}`;
}

function createLinkedinPrompt(transcript: string): string {
  return `Du bist ein LinkedIn-Content-Optimierungsassistent. Ich stelle dir ein Transkript zur Verfügung, das ich in einen überzeugenden LinkedIn-Post umwandeln möchte.

Deine Aufgabe ist es, einen professionellen und ansprechenden LinkedIn-Post auf Deutsch zu erstellen, der folgende Spezifikationen erfüllt:

- Zielgruppe: Eigene Follower und Entscheider
- Thema: Informativ herausstellen
- Tone of Voice: Soll klar machen, dass ich viel Spaß an den Themen habe und diese direkt helfen; ich bringe das gerne in Demos und Remote Workshops in Teams
- Anrede: Informelle "ihr" Anrede verwenden, "Demo" nur erwähnen, wenn es um Barrierefreies Webdesign oder Refactoring geht
- Abschluss: Eine sehr gute und motivierende Frage stellen, die dazu einlädt zu antworten und Leser als Experten wertschätzt

Nicht zu verwendende Wörter:
- Revolution (und ähnliche übertriebene Begriffe)

Formatierung:
- LinkedIn-Post sollte zwischen 1000-1500 Zeichen lang sein
- Verwende Absätze zur besseren Lesbarkeit
- Nutze maximal ein Emoji pro Absatz (nicht übertreiben)
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
    transcript: '',
    title: '',
    description: ''
  };

  try {
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
  } catch (error) {
    console.error('Fehler beim Parsen der KI-Antwort:', error);
  }

  return result;
}

function parseLinkedinResponse(text: string): {
  linkedinPost: string;
} {
  // Default values in case parsing fails
  let result = {
    linkedinPost: ''
  };

  try {
    // Extract LinkedIn post
    const linkedinMatch = text.match(/LINKEDIN POST:\s*([\s\S]*?)(?=$)/);
    if (linkedinMatch && linkedinMatch[1]) {
      result.linkedinPost = linkedinMatch[1].trim();
    }
  } catch (error) {
    console.error('Fehler beim Parsen der KI-Antwort:', error);
  }

  return result;
}