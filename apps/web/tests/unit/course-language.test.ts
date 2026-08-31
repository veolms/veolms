import { describe, it, expect } from "vitest";
import ISO6391 from "iso-639-1";

describe("Course Language ISO-639-1 Integration", () => {
  it("resolves language names and codes correctly", () => {
    expect(ISO6391.getName("en")).toBe("English");
    expect(ISO6391.getName("hi")).toBe("Hindi");
    expect(ISO6391.getName("bn")).toBe("Bengali");
    expect(ISO6391.getName("es")).toBe("Spanish");
    expect(ISO6391.getName("fr")).toBe("French");

    expect(ISO6391.getCode("English")).toBe("en");
    expect(ISO6391.getCode("Hindi")).toBe("hi");
    expect(ISO6391.getCode("Bengali")).toBe("bn");
  });

  it("generates complete ISO-639-1 dataset with name and nativeName for search", () => {
    const codes = ISO6391.getAllCodes();
    expect(codes.length).toBeGreaterThan(100);
    expect(codes).toContain("en");
    expect(codes).toContain("hi");
    expect(codes).toContain("bn");

    const englishNative = ISO6391.getNativeName("en");
    const hindiNative = ISO6391.getNativeName("hi");
    const bengaliNative = ISO6391.getNativeName("bn");

    expect(englishNative).toBe("English");
    expect(hindiNative).toBe("हिन्दी");
    expect(bengaliNative).toBe("বাংলা");
  });
});
