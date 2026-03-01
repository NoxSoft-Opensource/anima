import { describe, expect, it } from "vitest";
import { AnimaSchema } from "./zod-schema.js";

describe("$schema key in config (#14998)", () => {
  it("accepts config with $schema string", () => {
    const result = AnimaSchema.safeParse({
      $schema: "https://anima.ai/config.json",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.$schema).toBe("https://anima.ai/config.json");
    }
  });

  it("accepts config without $schema", () => {
    const result = AnimaSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects non-string $schema", () => {
    const result = AnimaSchema.safeParse({ $schema: 123 });
    expect(result.success).toBe(false);
  });
});
