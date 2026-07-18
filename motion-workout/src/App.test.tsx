// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import stages from "../public/data/stages.json";
import settings from "../public/data/settings.json";
import warmUp from "../public/data/warmUp.json";
import App from "./App";
import { ACTIVE_SESSION_KEY } from "./WorkoutRunner";

const mockWorkoutFetch = vi.fn((input: string | URL | Request) => {
  const target = String(input);
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(target.includes("stages.json") ? stages : target.includes("settings.json") ? settings : warmUp),
  });
});

describe("Motion workout experience", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", mockWorkoutFetch);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads the JSON program and switches program stages", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Lower body." })).toBeInTheDocument();
    expect(screen.getByText("JSON connected")).toBeInTheDocument();

    const buildTab = screen.getByRole("tab", { name: /Build/ });
    fireEvent.click(buildTab);

    expect(screen.getByText("Stage 2 · Day 1")).toBeInTheDocument();
    expect(screen.getByText("Leg press")).toBeInTheDocument();
  });

  it("opens the progress sidebar and resets device progress", async () => {
    render(<App />);
    const progressButton = await screen.findByRole("button", { name: /Program progress/ });
    fireEvent.click(progressButton);

    expect(screen.getByRole("complementary", { name: "Workout progress" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset device progress" }));
    expect(window.confirm).toHaveBeenCalledOnce();
  });

  it("runs a timed interval, rest countdown, and repetition round", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Start workout/ }));
    expect(screen.getByRole("dialog", { name: "Workout overview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enter workout" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start on the whistle" }));

    expect(await screen.findByRole("heading", { name: "Treadmill walk" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));
    expect(screen.getByRole("button", { name: "Pause timer" })).toBeInTheDocument();
    expect(window.localStorage.getItem(ACTIVE_SESSION_KEY)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Finish interval" }));
    expect(await screen.findByRole("heading", { name: "Breathe. Reset." })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip rest" }));
    expect(await screen.findByRole("heading", { name: "Neck circles" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Set complete/ }));
    expect(await screen.findByRole("heading", { name: "Breathe. Reset." })).toBeInTheDocument();
  });

  it("pauses, saves, and restores an active session", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Start workout/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enter workout" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start on the whistle" }));

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(await screen.findByRole("heading", { name: "Take your time." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save & return later" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Take your time." })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Resume workout/ })).toBeInTheDocument();
    expect(window.localStorage.getItem(ACTIVE_SESSION_KEY)).not.toBeNull();

    cleanup();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Resume workout/ }));
    fireEvent.click(screen.getByRole("button", { name: "Resume session" }));
    expect(await screen.findByRole("heading", { name: "Take your time." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume workout" }));
    expect(await screen.findByRole("heading", { name: "Treadmill walk" })).toBeInTheDocument();
  });
});
