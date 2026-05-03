# Contributing to Comvi

We love your input! We want to make contributing to Comvi as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue that pull request!

## Pull Request Process

1. Update the README.md with details of changes to the interface, if applicable
2. Update the docs/ folder with any new documentation
3. The PR will be merged once you have the sign-off of at least one other developer

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same [MIT License](http://choosealicense.com/licenses/mit/) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report bugs using GitHub's [issue tracker]

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](); it's that easy!

## Write bug reports with detail, background, and sample code

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## Use a Consistent Coding Style

- Use TypeScript for all new code
- 2 spaces for indentation rather than tabs
- You can try running `pnpm lint` for style unification

## License

By contributing, you agree that your contributions will be licensed under its MIT License.

## Development Setup

### Prerequisites

- Node.js (v22 or higher)
- pnpm (v9 or higher)
- Git

### Getting Started

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/your-username/comvi-js.git
   cd comvi-js
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Create a new branch for your feature:
   ```bash
   git checkout -b feature/amazing-feature
   ```

### Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run linting
pnpm lint
```

### Development Modes

Comvi i18n has two development modes optimized for different workflows:

```bash
# Full development mode - packages + test apps
pnpm dev

# Library-only mode - only library packages (faster, less resource usage)
pnpm dev:lib
```

**How it works:**

- Most packages use **source imports** for instant HMR - changes to source files are reflected immediately
- Some packages use **watch mode** (rebuild on change):
  - `@comvi/plugin-in-context-editor` - Vue plugin with bundled CSS

**Stopping dev mode:** Press `Ctrl+C` - the process will stop cleanly without errors.

### Package-specific Commands

```bash
# Build a specific package
pnpm --filter @comvi/core build
pnpm --filter @comvi/vue build

# Test a specific package
pnpm --filter @comvi/core test
pnpm --filter @comvi/vue test

# Run tests in CI mode (non-watch)
pnpm --filter @comvi/core test run
```

### Project Structure

```
comvi/
├── packages/
│   ├── core/                      # Framework-agnostic core
│   ├── vue/                       # Vue 3 bindings
│   ├── react/                     # React 18+ bindings
│   ├── plugin-fetch-loader/       # HTTP translation loader
│   ├── plugin-locale-detector/    # Browser locale detection
│   ├── plugin-in-context-editor/  # Visual translation editor
├── tooling/
│   ├── vite-config/               # Shared Vite build configuration
│   └── test-utils/                # Shared testing utilities
├── test-apps/
│   ├── vue/                       # Vue test application
│   └── react/                     # React test application
└── docs/                          # Documentation
```

## Testing

We use Vitest for testing. Write tests for any new features or bug fixes.

```typescript
// Example test
import { describe, it, expect } from "vitest";
import { createI18n } from "../src";

describe("createI18n", () => {
  it("should create an i18n instance", () => {
    const i18n = createI18n({
      locale: "en",
      translation: {
        en: { hello: "Hello" },
      },
    });
    expect(i18n.t("hello")).toBe("Hello");
  });
});
```

## Documentation

- Update relevant documentation for any changes
- Add JSDoc comments for new functions and classes
- Include examples for new features
- Update the API reference if needed
- For package release flow, see [RELEASING.md](RELEASING.md)

## Code Review Process

1. Create a pull request
2. Ensure CI checks pass
3. Get at least one review from a maintainer
4. Address any feedback
5. Merge once approved

## Questions?

Feel free to open an issue for any questions or concerns. We're happy to help!

## Recognition

Contributors who make significant improvements will be added to the project's contributors list.

## References

This document was adapted from the open-source contribution guidelines for [Facebook's Draft](https://github.com/facebook/draft-js/blob/a9316a723f9e918afde44dea68b5f9f39b7d9b00/CONTRIBUTING.md).
