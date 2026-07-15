export const GLOBAL_PROMPT_HELPERS = {
  BRAND_NAMES: `Achte auf die richtige Schreibweise dieser Marken und Begriffe: Never Code Alone (nicht nevercodealone, never code alone oder NeverCodeAlone), Roland Golla (nicht Roland Goler oder andere Varianten), roland@nevercodealone.de (nicht Roland@codealone.de oder andere Varianten), AI Nights (nicht AI Knights, AI Lights oder andere Varianten), Pimcore (nicht PimCore oder pimcore), TYPO3 (nicht Typo3 oder typo3), CypressIO (nicht Cypress.io oder cypress), JavaScript (nicht Javascript oder javascript), ChatGPT (nicht Chat-GPT oder chatgpt), OpenAI (nicht Open AI oder openai), React (nicht ReactJS oder react), Node.js (nicht NodeJS oder nodejs), Vue.js (nicht VueJS oder vuejs), TypeScript (nicht Typescript oder typescript), PHP (nicht php, Php, prp oder PRP), PHPUnit (nicht PhpUnit oder phpunit), PHPStan (nicht Phpstan oder php-stan), RectorPHP (nicht Rector oder rector-php), Vitest (nicht vitest oder vi-test), Make.com (nicht Make, Make.io oder make.com), Claude Code (nicht claude code oder ClaudeCode), Vibe Coding (nicht vibe coding, VibeCoding, White Coding, white coding, Weiß Coding, weiß coding, Weib Coding, weib coding oder andere Varianten), GitHub (nicht Github oder github), Docker (nicht docker), Kubernetes (nicht kubernetes), AWS (nicht aws), PostgreSQL (nicht postgres oder postgresql), Astro (nicht astro), Anthropic (nicht anthropic), Google Gemini (nicht google gemini oder Gemini), VS Code (nicht vscode oder VSCode), Laravel (nicht laravel), Symfony (nicht Symphony oder symfony), Next.js (nicht NextJS oder nextjs), WordPress (nicht wordpress oder Wordpress), Moltbot (nicht Maltbot, maltbot oder andere Varianten), Moltbook (nicht Maltbook, maltbook oder andere Varianten), Lovable (nicht Loverable, lovable, Laravel oder andere Varianten).`,

  AVOID_EXAGGERATION: `KEINE übertriebenen Wörter wie "ultimativ", "revolutionär", "Revolution", "revolutionieren", "unglaublich" - halte es sachlich und präzise.`,

  FACT_GROUNDING: `VERPFLICHTUNG auf Fakten aus dem Transkript. STRENG VERBOTEN, etwas zu erfinden oder zu ergänzen:
- KEINE Zeitangaben oder Datum-Bezüge ("vor ein paar Tagen", "heute", "gestern", "neulich", "kürzlich", Wochentage, Jahreszahlen), es sei denn, das exakte Wort steht im Transkript.
- KEINE Zahlen, Statistiken, Mengen oder Messwerte (Teilnehmer, Follower, Jahre, Prozent), die nicht im Transkript stehen.
- KEINE erfundenen Event-Orte, Event-Namen, Personennamen, Zitate, Quellen oder Ich-Erlebnisse.
- Jede Behauptung muss im Transkript belegt sein. Fehlt eine Angabe (z.B. ein Datum), dann LASSE sie weg statt sie zu erfinden.`,

  INFORMAL_ADDRESS: `Verwende eine informelle Anrede ("ihr/euch/eure" statt "Sie/Ihnen") und einen lockeren, direkten Ton.`,

  HUMANIZER: `Schreibe wie ein Mensch, nicht wie eine KI. Keine typischen KI-Schreibmuster. Konkret:

- KEINE Bindestriche, Gedankenstriche oder Trennstriche jeglicher Art (- – —). Schreibe Zusammensetzungen als ein Wort ("Webentwicklung") oder als zwei Wörter ("Web Entwicklung"), niemals mit Bindestrich. Nutze Kommas, Punkte oder eigene Sätze statt Trennstriche.
- KEINE Werbesprache oder Superlative ("atemberaubend", "beeindruckend", "bahnbrechend", "spielverändernd").
- KEINE redaktionellen Füllfloskeln ("es ist wichtig zu bemerken", "darüber hinaus", "außerdem", "fernab", "insbesondere", "immerhin", "letztendlich", "nichtsdestotrotz").
- KEINE Abschnitts-Zusammenfassungen ("insgesamt", "zusammenfassend", "das zeigt", "das unterstreicht").
- KEINE vagen Autoritäten ("viele Experten sagen", "Branchenberichte zeigen", "es ist allgemein bekannt").
- KEINE "In der heutigen X-Welt"- oder "Seit jeher"-Eröffnungen. Keine Floskeln wie "im Kern", "in Wirklichkeit", "Lass uns einen Blick werfen auf".
- KEINE rhetorischen Fake-Fragen als Füllmaterial ("Aber was bedeutet das wirklich?"). Eine echte Frage am Ende ist ok, keine als Filler.
- KEINE mechanische Regel-der-Drei (Trikolon: "X, Y und Z" in jedem Satz). Keine gleichförmigen Satzrhythmen, kein Parataxen-Staupen.
- KEINE Kollaborativsprache ("ich hoffe, das hilft", "lass uns gemeinsam schauen", "bleibt gespannt").
- KEINE Passivkonstruktionen wo Aktiv natürlicher klingt ("es wird gezeigt" -> "das zeigt").
- KEINE Unicode-Sonderzeichen, keine Emojis (wo nicht ausdrücklich gefordert).

Schreibe stattdessen authentisch deutsch:
- Direkt statt metaphorisch ("PHP bleibt relevant" statt "PHP steht als Zeugnis der Webgeschichte").
- Konkret statt abstrakt ("50 Entwickler" statt "eine beachtliche Entwicklergemeinde").
- Verben statt Nominalstil ("Die Tools helfen" statt "Die Unterstützung der Tools ist gegeben").
- Kurze, klare Sätze. Variable Satzlängen und -anfänge, kein Muster-Takt.
- Echte Meinung und Kante aus dem Transkript, glatt ist langweilig.`,
} as const;
