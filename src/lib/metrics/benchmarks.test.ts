import { describe, it, expect } from "vitest";
import { getBenchmarks, positionVsBenchmark, toneFor } from "./benchmarks";

describe("benchmarks", () => {
  it("отдаёт ориентиры по отрасли (fallback на saas)", () => {
    expect(getBenchmarks("saas").length).toBeGreaterThan(0);
    expect(getBenchmarks("unknown" as never)).toEqual(getBenchmarks("saas"));
  });

  it("позиция относительно квартилей", () => {
    const b = getBenchmarks("saas").find((x) => x.metric === "netMargin")!;
    expect(positionVsBenchmark(2, b)).toBe("below");
    expect(positionVsBenchmark(20, b)).toBe("around");
    expect(positionVsBenchmark(40, b)).toBe("above");
  });

  it("тон: для маржи выше = хорошо, для доли маркетинга ниже = хорошо", () => {
    expect(toneFor("netMargin", "above")).toBe("ok");
    expect(toneFor("netMargin", "below")).toBe("warn");
    expect(toneFor("marketingShare", "below")).toBe("ok");
    expect(toneFor("marketingShare", "above")).toBe("warn");
    expect(toneFor("netMargin", "around")).toBe("info");
  });
});
