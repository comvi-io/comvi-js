# ADR-001: Dependency Injection and SOLID Principles

**Status:** Accepted
**Date:** 2025-01-14
**Deciders:** Development Team
**Context:** TypeGenerator refactoring to eliminate god object anti-pattern

## Context and Problem Statement

The original `TypeGenerator` class violated multiple SOLID principles:

- **Single Responsibility Principle (SRP)**: Handled file I/O, API calls, type generation, and user feedback
- **Dependency Inversion Principle (DIP)**: Directly depended on Node.js `fs` module and `console`
- **God Object anti-pattern**: 156 lines doing everything, difficult to test and maintain

This made the class:

- Hard to test (couldn't mock filesystem or console)
- Difficult to extend or modify
- Tightly coupled to implementation details
- Violated separation of concerns

## Decision Drivers

- **Testability**: Need to test without real filesystem operations
- **Maintainability**: Single Responsibility Principle for better code organization
- **Flexibility**: Ability to swap implementations (e.g., in-memory filesystem for tests)
- **SOLID Compliance**: Proper dependency management and abstractions

## Considered Options

### Option 1: Keep current implementation

- **Pros**: No refactoring needed, works as-is
- **Cons**: Untestable, violates SOLID, hard to maintain

### Option 2: Partial refactoring (extract some methods)

- **Pros**: Easier to implement incrementally
- **Cons**: Doesn't fully solve the problem, still tightly coupled

### Option 3: Full dependency injection with abstractions ✅ **SELECTED**

- **Pros**: Fully testable, SOLID compliant, highly maintainable
- **Cons**: More upfront work, more files to manage

## Decision Outcome

**Chosen option: Option 3 - Full dependency injection with abstractions**

Implemented complete refactor with:

- **FileSystemWriter** abstraction with `NodeFileSystem` and `InMemoryFileSystem` implementations
- **GenerationReporter** abstraction with `ConsoleReporter`, `SilentReporter`, and `CollectingReporter`
- **Logger** abstraction with `ConsoleLogger` and `SilentLogger`
- **CacheManager** with pluggable `Cache` implementations

### Architecture

```typescript
class TypeGenerator {
  constructor(
    options: GeneratorOptions,
    dependencies?: {
      writer?: FileSystemWriter;
      reporter?: GenerationReporter;
      logger?: Logger;
      cacheManager?: CacheManager;
    },
  ) {
    // Inject dependencies or use defaults
    this.writer = dependencies?.writer ?? new FileSystemWriter();
    this.reporter = dependencies?.reporter ?? new ConsoleReporter();
    this.logger = dependencies?.logger ?? createLogger();
    // ...
  }
}
```

## Consequences

### Positive

- ✅ **Full test coverage**: Can inject mocks/stubs for all dependencies
- ✅ **SOLID compliance**: Each class has single responsibility
- ✅ **Flexibility**: Easy to swap implementations (e.g., in-memory for tests)
- ✅ **Maintainability**: Clear separation of concerns, easier to understand
- ✅ **Extensibility**: Easy to add new reporters, filesystem implementations, etc.

### Negative

- ❌ **More files**: 7 new files created (errors, logger, FileSystemWriter, GenerationReporter, Cache, RateLimiter, typeDetectors)
- ❌ **Complexity**: Slightly more complex initialization (mitigated by defaults)
- ❌ **Learning curve**: Team needs to understand DI pattern

### Mitigations

- **Default implementations** provided for all dependencies (zero-config for users)
- **Comprehensive tests** showing how to use DI for testing
- **Documentation** in README and code comments

## Implementation Details

### Before (God Object)

```typescript
class TypeGenerator {
  async generate() {
    // Validate connection
    // Fetch translations
    // Generate types
    // Create directories (using fs directly)
    // Write files (using fs directly)
    // Log to console (using console directly)
    // Handle errors
  }
}
```

### After (Dependency Injection)

```typescript
class TypeGenerator {
  constructor(
    options: GeneratorOptions,
    dependencies?: {...}
  ) {
    this.apiClient = new ApiClient(options);
    this.typeEmitter = new TypeEmitter();
    this.writer = dependencies?.writer ?? new FileSystemWriter();
    this.reporter = dependencies?.reporter ?? new ConsoleReporter();
    this.logger = dependencies?.logger ?? createLogger();
    this.cacheManager = dependencies?.cacheManager ?? new CacheManager(...);
  }

  async generate() {
    this.reporter.reportStart();
    const data = await this.apiClient.fetchAllTranslations(...);
    const types = this.typeEmitter.generate(data);
    await this.writer.write(path, types);
    this.reporter.reportSuccess({...});
  }
}
```

## Related Decisions

- [ADR-002: Strategy Pattern for Type Detection](./ADR-002-strategy-pattern-type-detection.md)
- [ADR-003: Caching and Rate Limiting](./ADR-003-caching-rate-limiting.md)
- [ADR-004: Error Handling and Logging](./ADR-004-error-handling-logging.md)

## References

- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Dependency Injection](https://en.wikipedia.org/wiki/Dependency_injection)
- [God Object Anti-pattern](https://en.wikipedia.org/wiki/God_object)
