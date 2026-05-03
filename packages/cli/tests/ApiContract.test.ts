import { describe, expect, it } from "vitest";
import { API_ENDPOINTS } from "../src/core/ApiClient";

describe("CLI API endpoint contract", () => {
  it("matches the public /v1 backend API paths", () => {
    expect(API_ENDPOINTS.project).toBe("/v1/project");
    expect(API_ENDPOINTS.translations).toBe("/v1/translations");
    expect(API_ENDPOINTS.projectSchema(123)).toBe("/v1/projects/123/schema");
    expect(API_ENDPOINTS.projectSchemaStream(123)).toBe("/v1/projects/123/schema/stream");
    expect(API_ENDPOINTS.projectImportCommit(123)).toBe("/v1/projects/123/import/commit");
  });

  it("does not use legacy /api/v1 routes", () => {
    const paths = [
      API_ENDPOINTS.project,
      API_ENDPOINTS.translations,
      API_ENDPOINTS.projectSchema(123),
      API_ENDPOINTS.projectSchemaStream(123),
      API_ENDPOINTS.projectImportCommit(123),
    ];

    for (const path of paths) {
      expect(path).not.toContain("/api/v1");
    }
  });
});
