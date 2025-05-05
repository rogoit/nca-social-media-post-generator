# YouTube Content Generator

A tool for automatically optimizing YouTube transcripts, titles, and descriptions.

## About the Project

This tool helps YouTube creators optimize their video content. It takes a transcript of a YouTube video and:

1. Automatically corrects the punctuation of the transcript
2. Generates an SEO-optimized title for the video
3. Creates a detailed description structured into three well-organized paragraphs

The application is specifically designed for the developer community and uses informal language.

## Technology Stack

- **Frontend**: [Astro](https://astro.build/) with [TailwindCSS](https://tailwindcss.com/)
- **API**: Google Gemini 1.5 Pro via the Google Generative AI SDK
- **Language**: TypeScript

## Features

- **Transcript Correction**: Preserves 100% of the original words and word order, corrects only punctuation
- **Title Generator**: Creates easily readable, SEO-optimized titles without exaggerated language
- **Description Generator**: Creates detailed descriptions (approx. 1500 characters) in three paragraphs
- **Copy-to-Clipboard**: Convenient buttons for copying transcript, title, and description
- **Automatic Cleanup**: Removes single characters at the end of transcripts (common error in automatic transcription)

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

3. Configure API key:
   - Create a `.env` file in the root directory
   - Add your Google Gemini API key:
     ```
     GOOGLE_GEMINI_API_KEY=your-api-key
     ```

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