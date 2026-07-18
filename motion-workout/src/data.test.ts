import { describe, expect, it } from "vitest";
import stages from "../public/data/stages.json";
import settings from "../public/data/settings.json";
import warmUp from "../public/data/warmUp.json";

describe("workout data", () => {
  it("keeps the expected three-stage, six-day program", () => {
    expect(stages).toHaveLength(3);
    stages.forEach((stage) => expect(stage).toHaveLength(6));
  });

  it("keeps day four as the programmed recovery day", () => {
    stages.forEach((stage) => expect(stage[3]).toEqual(["Rest"]));
  });

  it("provides complete exercise fields", () => {
    const exercises = stages.flat(2).filter((entry) => typeof entry === "object");
    exercises.forEach((exercise) => {
      expect(exercise).toHaveProperty("name");
      expect(Number(exercise.rounds)).toBeGreaterThan(0);
      expect(Number(exercise.counts)).toBeGreaterThan(0);
    });
    expect(warmUp).toHaveLength(17);
  });

  it("keeps session timing in editable JSON settings", () => {
    expect(settings.restSeconds).toBe(15);
    expect(settings.prep.durationMinutes).toBeGreaterThan(0);
    expect(settings.conditioning.durationMinutesByStage).toEqual([30, 45, 60]);
  });
});
