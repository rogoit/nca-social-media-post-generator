# Testing Structure

## 3-Tier Testing Strategy

```
test/
├── unit/         # Pure functions, 100% mocked
├── functional/   # Service workflows, mocked AI
├── real/         # Actual API calls, validate prompts
└── utils/        # Shared mocks & fixtures
```

## Running Tests

```bash
npm run test:unit          # Fast, isolated functions
npm run test:functional    # Service workflows (mocked AI)
npm run test:real          # Real API validation (requires keys)
npm run test:all           # Run everything
```

## Test Tiers

**Unit** (`test/unit/`)
- Single functions only
- Mock everything
- Fast (< 100ms)

**Functional** (`test/functional/`)
- Complete workflows
- Mock AI SDKs only
- Test failover logic

**Real** (`test/real/`)
- No mocking
- Validate prompt quality
- See `test/real/README.md`

## Execution Order

Static analysis → Unit → Functional → Real

## Adding Tests

- **Unit**: Test pure logic, mock all dependencies
- **Functional**: Test workflows, mock AI APIs only
- **Real**: Validate with actual AI responses
