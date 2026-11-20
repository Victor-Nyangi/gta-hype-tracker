import { describe, expect, it } from "vitest";
import { comma, fmt, formatDay, signedHours } from "@/lib/format";
import { daysSince, LAUNCH_MS } from "@/lib/time";

describe("format", () => {
  it("fmt matches the prototype", () => {
    expect(fmt(4_200_000)).toBe("4.20M");
    expect(fmt(364_548)).toBe("365K");
    expect(fmt(9_876)).toBe("9,876");
  });
  it("comma rounds", () => expect(comma(1234567.6)).toBe("1,234,568"));
  it("formats days in UTC", () => {
    expect(formatDay("2013-09-17")).toBe("September 17, 2013");
    expect(formatDay("2026-11-19", "short")).toBe("Nov 19, 2026");
  });
  it("signs hours with a real minus", () => {
    expect(signedHours(-12)).toBe("−12h");
    expect(signedHours(3)).toBe("+3h");
  });
});

describe("daysSince", () => {
  it("counts to launch when the clock is unknown (server render)", () => {
    expect(daysSince("2026-11-18", null)).toBe(1);
    expect(daysSince("2013-09-17", null)).toBe(daysSince("2013-09-17", LAUNCH_MS));
  });
  it("counts to now on the client", () => {
    expect(daysSince("2026-11-19", LAUNCH_MS + 3 * 86_400_000 + 5)).toBe(3);
  });
});
