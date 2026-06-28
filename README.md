# YouTube Content Generator

A tool for automatically optimizing YouTube transcripts, titles, and descriptions.

## About the Project

This tool helps YouTube creators optimize their video content. It takes a transcript of a YouTube video and:

1. Automatically corrects the punctuation of the transcript
2. Generates an SEO-optimized title for the video
3. Creates a detailed description structured into three well-organized paragraphs

The application is specifically designed for the developer community and uses informal language.

## Never Code Alone - Vibe Coding Example

This is a **Never Code Alone** consulting project demonstrating TDD (Test-Driven Development) with no human in the loop for "Vibe Coding" best practices.

This example project is created by **Roland Golla** ([rolandgolla.de](https://rolandgolla.de)) and relates to his 2025 developer keynote: [Vibe Coding](https://talks.nevercodealone.de/vibe-coding.html).

The project is under **MIT license** and open for contributions. You can support this project and help add new features to it.

## Technology Stack

- **Frontend**: [Astro](https://astro.build/) with [TailwindCSS](https://tailwindcss.com/)
- **API**: Primary: Google Gemini 1.5 Pro, Fallback: Anthropic Claude
- **Language**: TypeScript

## Features

- **Transcript Correction**: Preserves 100% of the original words and word order, corrects only punctuation
- **Title Generator**: Creates easily readable, SEO-optimized titles without exaggerated language
- **Description Generator**: Creates detailed descriptions (approx. 1500 characters) in three paragraphs
- **Copy-to-Clipboard**: Convenient buttons for copying transcript, title, and description
- **Automatic Cleanup**: Removes single characters at the end of transcripts (common error in automatic transcription)
- **AI Fallback**: Automatically switches to Claude when Google Gemini is unavailable or rate-limited
- **Video Upload**: Upload a video file (MP4, MOV, WebM up to 100 MB) and automatically extract transcript via Gemini
- **Multi-Platform Generation**: Generates optimized content for YouTube, LinkedIn, Instagram, and TikTok simultaneously
- **Platform Approval**: Review and approve/regenerate content per platform before publishing
- **n8n Integration**: Send approved content + video to n8n webhook for automated distribution

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd social-media-post-generator
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure API keys:
   - Create a `.env` file with your API keys:
     ```
     GOOGLE_GEMINI_API_KEY=your-key-here
     MISTRAL_API_KEY=your-key-here
     N8N_WEBHOOK_URL=your-n8n-webhook-url
     ```
   - Optional: Customize AI models (comma-separated, tries in order):
     ```
     GOOGLE_GEMINI_MODELS=gemini-2.5-pro,gemini-2.5-flash
     MISTRAL_MODELS=mistral-large-latest
     ```
   - To obtain a Mistral API key:
     1. Visit [Mistral's console](https://console.mistral.ai/)
     2. Sign up or log in to your account
     3. Navigate to the API keys section
     4. Create a new API key
     5. Copy the key and add it to your `.env` file
   - To obtain a Google Gemini API key:
     1. Visit [Google AI Studio](https://makersuite.google.com/)
     2. Sign up or log in with your Google account
     3. Navigate to the API keys section
     4. Create a new API key
     5. Copy the key and add it to your `.env` file

4. Start the development server:
   ```bash
   npx astro dev -vvv
   ```

## Usage

1. Open the application in your browser (default at http://localhost:4321)
2. Paste your YouTube transcript into the text field
3. Click on "Generate YouTube Content"
4. After processing, you'll receive:
   - A corrected version of your transcript
   - An optimized title
   - A structured description in three paragraphs
5. Use the copy buttons to copy the results to your clipboard

## License

[MIT](LICENSE)
