# Development Workflow with Claude

## 1. TDD Workflow with Claude

### Before Starting Implementation

1. **Read `task.md` in plan mode**
   - Let Claude analyze the requirements
   - Understand the full scope before coding
   - Ask Claude to explore existing code patterns

2. **Research Phase**
   - Use Claude to search codebase for similar implementations
   - Identify files that need modification
   - Understand test structure (unit/functional/real)

3. **Plan the Implementation**
   - Define test cases first
   - Identify which prompts or code need changes
   - Determine test locations and naming

## 2. Red-Green-Refactor Cycle

### RED Phase: Write Failing Tests

1. **Create test file** in appropriate folder:
   - `test/unit/` - Pure function tests, fully mocked
   - `test/functional/` - Workflow tests with mocked AI
   - `test/real/` - Integration tests with real AI APIs

2. **Run only the new test** to verify it fails:
   ```bash
   # For real tests
   npm run test:real -- test/real/your-feature.test.ts

   # For unit tests
   npm run test:unit -- test/unit/your-feature.test.ts

   # For functional tests
   npm run test:functional -- test/functional/your-feature.test.ts
   ```

3. **Verify RED phase**: Tests should fail with expected errors

### GREEN Phase: Implement Feature

1. **Make minimal changes** to pass tests:
   - Update `src/config/prompts.ts` for AI behavior
   - Modify utilities in `src/utils/` for logic changes
   - Update types in `src/types/` if needed

2. **Run only necessary tests** during development:
   ```bash
   # Run only your test file
   npm run test:real -- test/real/your-feature.test.ts
   ```

3. **Iterate quickly**:
   - Fix → Run test → Fix → Run test
   - Do NOT run full test suite yet
   - Focus only on making your tests pass

4. **Monitor test output** for:
   - Passing tests ✓
   - Expected behavior validation
   - No unintended side effects

### REFACTOR Phase: Validate Complete

1. **Run full test suite** after implementation:
   ```bash
   npm run test:all
   ```

2. **Verify no regressions**:
   - All existing tests still pass
   - Your new tests pass
   - No broken functionality

3. **Format code with Prettier**:
   ```bash
   npm run format
   ```
   - Ensures consistent code style
   - Automatically fixes formatting issues
   - Must pass before commit

4. **Clean up if needed**:
   - Remove debug code
   - Improve code clarity
   - Update comments

## 3. Key Principles

### Test Management
- **Never modify existing tests** unless explicitly required by task
- Existing tests are regression protection
- Only add new tests for new features

### Efficient Testing
- **During development**: Run only relevant tests
- **After completion**: Run full test suite once
- Avoid unnecessary full test runs (saves time and API costs)

### Test Structure
- **Unit tests** (`test/unit/`): Fast, isolated, no external dependencies
- **Functional tests** (`test/functional/`): Workflow validation, mocked AI
- **Real tests** (`test/real/`): AI prompt validation, actual API calls

### AI Prompt Testing
- Use **real tests** for prompt validation
- Test with actual AI providers (Google Gemini, Anthropic Claude)
- Verify AI output matches expected format and content
- Include edge cases and brand corrections

### Code Changes
- Make targeted, minimal changes
- Update only files directly related to feature
- Preserve existing functionality
- Follow existing code patterns

### Commit Strategy
- Commit after GREEN phase success
- Include test file in commit
- Use conventional commit messages
- Document what changed and why

## 4. Code Conventions

### Code Style
- **Prettier**: All code must be formatted with Prettier
- **Run before commit**: `npm run format`
- **Check formatting**: `npm run format:check`
- **Configuration**: Project uses Prettier with Astro plugin

### TypeScript Standards
- **Type safety**: No `any` types without justification
- **Strict mode**: Follow project's strict TypeScript config
- **Explicit types**: Define interfaces for all data structures
- **Type checking**: Run `npm run type-check` before commit

### Naming Conventions
- **Files**: kebab-case (e.g., `brand-detection.test.ts`)
- **Functions**: camelCase (e.g., `parseYouTubeResponse`)
- **Classes**: PascalCase (e.g., `AIProviderManager`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `BRAND_NAMES`)

### File Organization
- **Config**: `src/config/` for constants and prompts
- **Utils**: `src/utils/` for business logic
- **Types**: `src/types/` for TypeScript definitions
- **Tests**: Match source structure in `test/{unit,functional,real}/`

### Import Order
1. External dependencies (npm packages)
2. Internal types
3. Internal utilities
4. Blank line between groups

### Code Quality Checklist
Before committing, ensure:
- [ ] All tests pass (`npm run test:all`)
- [ ] Code formatted with Prettier (`npm run format`)
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] No console.log statements (except in error handling)
- [ ] Existing tests unchanged (unless explicitly required)
- [ ] New tests added for new features
- [ ] Comments added for complex logic
