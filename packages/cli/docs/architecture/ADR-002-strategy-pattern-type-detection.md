# ADR-002: Strategy Pattern for Type Detection

**Status:** Accepted
**Date:** 2025-01-14
**Deciders:** Development Team
**Context:** TypeEmitter refactoring to support extensible type detection

## Context and Problem Statement

The original `TypeEmitter` class had hardcoded logic for detecting parameter types from ICU MessageFormat strings. This violated the Open/Closed Principle:

```typescript
// Before: Hardcoded detection logic
private detectParameterType(name: string, format?: string): string {
  if (format === "plural") return "plural";
  if (name.toLowerCase().includes("count")) return "number";
  if (name.toLowerCase().includes("total")) return "number";
  return "string";
}
```

**Problems:**

- **Not extensible**: Adding new detection rules requires modifying the class
- **Violates OCP**: Closed for extension, requires editing existing code
- **Hard to test**: All detection logic in one method
- **Not customizable**: Users can't add their own detection rules

## Decision Drivers

- **Extensibility**: Users should be able to add custom type detection rules
- **OCP Compliance**: Open for extension, closed for modification
- **Testability**: Each detector should be independently testable
- **Maintainability**: Clear, single-responsibility classes

## Considered Options

### Option 1: Keep hardcoded logic

- **Pros**: Simple, works for current use case
- **Cons**: Not extensible, violates OCP

### Option 2: Configuration-based detection

- **Pros**: Somewhat extensible via config
- **Cons**: Limited to simple rules, can't handle complex logic

### Option 3: Strategy Pattern with Chain of Responsibility ✅ **SELECTED**

- **Pros**: Fully extensible, testable, follows SOLID principles
- **Cons**: More complexity, more classes

## Decision Outcome

**Chosen option: Option 3 - Strategy Pattern with Chain of Responsibility**

Implemented a chain of detector strategies where each detector:

- Implements `ParameterTypeDetector` interface
- Returns a type or `null` (to pass to next detector)
- Can be added/removed/reordered by users

### Architecture

```typescript
interface ParameterTypeDetector {
  detect(
    paramName: string,
    paramFormat: string | undefined,
    fullValue: string,
  ): "string" | "number" | "plural" | null;
}

class TypeDetectorChain {
  private detectors: ParameterTypeDetector[];

  constructor(detectors?: ParameterTypeDetector[]) {
    this.detectors = detectors ?? TypeDetectorChain.createDefaultChain();
  }

  static createDefaultChain(): ParameterTypeDetector[] {
    return [
      new PluralFormatDetector(), // {count, plural, ...}
      new SelectFormatDetector(), // {gender, select, ...}
      new NumericNameDetector(), // count, total, num, etc.
      new DefaultDetector(), // Always returns 'string'
    ];
  }

  detect(paramName: string, paramFormat?: string, fullValue?: string) {
    for (const detector of this.detectors) {
      const result = detector.detect(paramName, paramFormat, fullValue);
      if (result !== null) return result;
    }
    return "string"; // Fallback
  }
}
```

### Built-in Detectors

1. **PluralFormatDetector**: Detects `{count, plural, ...}` → returns `"plural"`
2. **SelectFormatDetector**: Detects `{gender, select, ...}` → returns `"string"`
3. **NumericNameDetector**: Detects numeric patterns in names → returns `"number"`
4. **DefaultDetector**: Fallback → returns `"string"`

## Consequences

### Positive

- ✅ **Extensibility**: Users can add custom detectors
- ✅ **OCP Compliance**: New detectors added without modifying existing code
- ✅ **Testability**: Each detector is independently testable
- ✅ **Clear Responsibility**: Each detector handles one specific case
- ✅ **Customizable Order**: Detectors can be reordered for priority

### Negative

- ❌ **More classes**: 5 classes instead of 1 method
- ❌ **Slightly more complex**: Users need to understand chain pattern

### Mitigations

- **Default chain provided**: Zero-config works out of the box
- **Simple interface**: `ParameterTypeDetector` has one method
- **Documentation**: Examples of custom detectors in README

## Usage Examples

### Default Usage (No Configuration)

```typescript
const emitter = new TypeEmitter();
// Uses default detector chain automatically
```

### Custom Detector

```typescript
class CurrencyDetector implements ParameterTypeDetector {
  detect(paramName: string): "number" | null {
    return paramName.toLowerCase().includes("price") ? "number" : null;
  }
}

const customDetectors = [
  new CurrencyDetector(), // Custom detector first
  new PluralFormatDetector(),
  new NumericNameDetector(),
  new DefaultDetector(),
];

const emitter = new TypeEmitter(customDetectors);
```

### Result

```typescript
// "{price} USD" → { name: "price", type: "number" }
// "{count, plural, one {# item} other {# items}}" → { name: "count", type: "plural" }
// "{total} items" → { name: "total", type: "number" }
// "{name}" → { name: "name", type: "string" }
```

## Implementation Details

### Chain of Responsibility Flow

```
Input: paramName="count", paramFormat="plural", fullValue="{count, plural, ...}"
       ↓
PluralFormatDetector → "plural" ✅ (stops here)
```

```
Input: paramName="price", paramFormat=undefined, fullValue="{price}"
       ↓
PluralFormatDetector → null (continue)
       ↓
SelectFormatDetector → null (continue)
       ↓
NumericNameDetector → null (continue)
       ↓
DefaultDetector → "string" ✅
```

## Testing Strategy

Each detector is tested independently:

```typescript
describe("PluralFormatDetector", () => {
  it("should detect plural format", () => {
    const detector = new PluralFormatDetector();
    expect(detector.detect("count", "plural", "...")).toBe("plural");
  });

  it("should return null for non-plural", () => {
    const detector = new PluralFormatDetector();
    expect(detector.detect("name", undefined, "...")).toBe(null);
  });
});
```

## Related Decisions

- [ADR-001: Dependency Injection and SOLID Principles](./ADR-001-dependency-injection.md)
- [ADR-004: Error Handling and Logging](./ADR-004-error-handling-logging.md)

## References

- [Strategy Pattern](https://refactoring.guru/design-patterns/strategy)
- [Chain of Responsibility Pattern](https://refactoring.guru/design-patterns/chain-of-responsibility)
- [Open/Closed Principle](https://en.wikipedia.org/wiki/Open%E2%80%93closed_principle)
