import { describe, expect, it } from "vitest";
import { extractAmount, parseCapture } from "../src/lib/capture";

describe("parseCapture", () => {
  it("an explicit prefix wins over any keyword guess", () => {
    const p = parseCapture("habit: buy milk");
    expect(p.domain).toBe("habit");
    expect(p.title).toBe("buy milk");
    expect(p.confidence).toBe("prefix");
  });

  it("strips the prefix but keeps the rest of the text as the title", () => {
    const p = parseCapture("Goal: save $500 for a trip");
    expect(p.domain).toBe("goal");
    expect(p.title).toBe("save $500 for a trip");
  });

  it("falls back to a safe keyword guess when there's no prefix", () => {
    expect(parseCapture("Buy milk on the way home").domain).toBe("grocery");
    expect(parseCapture("Leg day at the gym").domain).toBe("workout");
    expect(parseCapture("Dinner with the kids").domain).toBe("meal");
  });

  it("never guesses into debt/fund/weight/hydration without an explicit prefix", () => {
    expect(parseCapture("owe $50 to Sam").domain).toBe("task");
    expect(parseCapture("save for a new car").domain).toBe("task");
    expect(parseCapture("weigh in today").domain).toBe("task");
    expect(parseCapture("drink more water").domain).toBe("task");
  });

  it("defaults completely plain text to task", () => {
    const p = parseCapture("Call the dentist");
    expect(p.domain).toBe("task");
    expect(p.confidence).toBe("default");
  });
});

describe("extractAmount", () => {
  it("parses a dollar amount", () => {
    expect(extractAmount("$45.50 for groceries")).toBe(45.5);
  });
  it("parses a unit-suffixed amount", () => {
    expect(extractAmount("150lbs")).toBe(150);
    expect(extractAmount("64oz")).toBe(64);
    expect(extractAmount("2000ml")).toBe(2000);
  });
  it("parses a plain bare number", () => {
    expect(extractAmount("180")).toBe(180);
  });
  it("returns undefined when there's no number", () => {
    expect(extractAmount("drink water")).toBeUndefined();
  });
});
