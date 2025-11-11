# Real AI Tests

Tests that make actual API calls to validate prompts and AI behavior.

## Setup

### 1. Get API Keys

**Google Gemini:**
- Visit: https://aistudio.google.com/app/apikey
- Create API key

**Anthropic Claude:**
- Visit: https://console.anthropic.com/
- Create API key

### 2. Set Environment Variables

```bash
export GOOGLE_GEMINI_API_KEY="your-key-here"
export ANTHROPIC_API_KEY="your-key-here"
```

Or create `.env`:
```
GOOGLE_GEMINI_API_KEY=your-key-here
ANTHROPIC_API_KEY=your-key-here
```

## Running Tests

```bash
# Run real tests only
npm run test:real

# Run specific test file
npm run test:real -- real/prompt-validation.test.ts

# Run with both providers
GOOGLE_GEMINI_API_KEY=xxx ANTHROPIC_API_KEY=yyy npm run test:real
```

## Test Files

- `prompt-validation.test.ts` - Validate prompt quality for each platform
- `response-parsing.test.ts` - Test parsing of real AI responses
- `model-comparison.test.ts` - Compare Google vs Claude output
- `edge-cases.test.ts` - Test unusual inputs with real AI

## Important

- **Tests skip automatically if API keys missing**
- **Costs money** - API usage charges apply
- **Slower** - Real network calls (30-60s per test)
- **Rate limits** - May fail if you hit API quotas

## Troubleshooting

**Tests skipped:**
- Check API keys are set
- Keys should not have quotes or extra spaces

**Tests timeout:**
- Increase timeout in test file
- Check network connection
- Verify API service status

**API errors:**
- Check API key validity
- Verify account has credits
- Check rate limits
