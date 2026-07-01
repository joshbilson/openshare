import { describe, expect, it } from "vitest";
import { parseTrackName } from "./parse-track-name";

describe("parseTrackName", () => {
  it("leaves a plain title untouched", () => {
    expect(parseTrackName("Redbone")).toEqual({ name: "Redbone", features: [] });
  });

  it("extracts a bracketed (feat. …)", () => {
    expect(parseTrackName("Sunflower (feat. Swae Lee)")).toEqual({
      name: "Sunflower",
      features: ["Swae Lee"],
    });
  });

  it("extracts a bracketed [ft …] with multiple artists", () => {
    expect(parseTrackName("No Role Modelz [ft. J. Cole & Bas]")).toEqual({
      name: "No Role Modelz",
      features: ["J. Cole", "Bas"],
    });
  });

  it("handles 'with' as a feature marker", () => {
    expect(parseTrackName("Ghost Town (with PARTYNEXTDOOR)")).toEqual({
      name: "Ghost Town",
      features: ["PARTYNEXTDOOR"],
    });
  });

  it("extracts a trailing, unbracketed feat.", () => {
    expect(parseTrackName("Jocelyn Flores feat. XXXTENTACION")).toEqual({
      name: "Jocelyn Flores",
      features: ["XXXTENTACION"],
    });
  });

  it("de-dupes repeated features case-insensitively", () => {
    const parsed = parseTrackName("Song (feat. Drake) (ft. drake)");
    expect(parsed.name).toBe("Song");
    expect(parsed.features).toEqual(["Drake"]);
  });
});
