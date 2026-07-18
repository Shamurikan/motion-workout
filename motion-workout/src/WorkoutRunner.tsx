"use client";

import {
  Activity,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Dumbbell,
  Flag,
  ListChecks,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
  X,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type WorkoutExercise = {
  name: string;
  rounds?: string | number;
  counts?: string | number;
  type?: "reps" | "timed";
  durationSeconds?: string | number;
  durationMinutes?: string | number;
};

export type WorkoutDayData = WorkoutExercise[] | ["Rest"];

type SessionItem = {
  id: string;
  name: string;
  section: "Prep" | "Warm-up" | "Main work" | "Conditioning";
  mode: "reps" | "timed";
  rounds: number;
  reps?: number;
  durationSeconds?: number;
  source: "program" | "support";
};

type RunnerPhase = "ready" | "active" | "rest" | "complete";

type RunnerSnapshot = {
  version: 1;
  week: number;
  day: number;
  phase: RunnerPhase;
  itemIndex: number;
  roundIndex: number;
  timerRemaining: number;
  timerRunning: boolean;
  restRemaining: number;
  paused: boolean;
  soundEnabled: boolean;
  elapsedSeconds: number;
  completedSets: number;
  startedAt: string | null;
  updatedAt: number;
};

export type WorkoutCompletionPayload = {
  week: number;
  day: number;
  setsCompleted: number;
  elapsedSeconds: number;
  isRestDay: boolean;
};

type WorkoutRunnerProps = {
  open: boolean;
  week: number;
  day: number;
  stageIndex: number;
  dayTitle: string;
  dayFocus: string;
  workoutDay: WorkoutDayData | undefined;
  warmUp: WorkoutExercise[];
  prepName: string;
  prepMinutes: number;
  cardioName: string;
  cardioMinutes: number;
  restSeconds: number;
  onExit: () => void;
  onComplete: (payload: WorkoutCompletionPayload) => void;
};

export const ACTIVE_SESSION_KEY = "motion-active-session-v1";

const isRestDay = (day: WorkoutDayData | undefined): day is ["Rest"] =>
  Boolean(day && day.length === 1 && day[0] === "Rest");

const formatClock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainingSeconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

const exerciseDuration = (exercise: WorkoutExercise) => {
  if (exercise.durationSeconds !== undefined) return Math.max(1, Number(exercise.durationSeconds));
  if (exercise.durationMinutes !== undefined) return Math.max(1, Number(exercise.durationMinutes) * 60);
  return 0;
};

const exerciseMode = (exercise: WorkoutExercise): "reps" | "timed" =>
  exercise.type === "timed" || exerciseDuration(exercise) > 0 ? "timed" : "reps";

const makeInitialSnapshot = (week: number, day: number, restSeconds: number): RunnerSnapshot => ({
  version: 1,
  week,
  day,
  phase: "ready",
  itemIndex: 0,
  roundIndex: 0,
  timerRemaining: 0,
  timerRunning: false,
  restRemaining: restSeconds,
  paused: false,
  soundEnabled: true,
  elapsedSeconds: 0,
  completedSets: 0,
  startedAt: null,
  updatedAt: Date.now(),
});

let sharedAudioContext: AudioContext | null = null;

const playWhistle = (pattern: "start" | "set" | "go" | "finish", enabled: boolean) => {
  if (!enabled || typeof window === "undefined") return;
  try {
    sharedAudioContext ??= new AudioContext();
    const context = sharedAudioContext;
    void context.resume();
    const chirps = pattern === "start" ? 2 : pattern === "finish" ? 3 : pattern === "go" ? 2 : 1;
    const baseTime = context.currentTime + 0.02;

    for (let index = 0; index < chirps; index += 1) {
      const start = baseTime + index * 0.18;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(pattern === "set" ? 1780 : 2050, start);
      oscillator.frequency.exponentialRampToValueAtTime(pattern === "finish" ? 1380 : 2850, start + 0.12);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.145);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.16);
    }
  } catch {
    // Audio cues are progressive enhancement; the visual flow remains complete.
  }
};

function TechniqueLink({ name }: { name: string }) {
  return (
    <a
      className="runner-youtube"
      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise form`)}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Search YouTube for ${name} technique`}
      onClick={(event) => event.stopPropagation()}
    >
      <Video size={16} />
      <span>Technique</span>
    </a>
  );
}

export default function WorkoutRunner({
  open,
  week,
  day,
  stageIndex,
  dayTitle,
  dayFocus,
  workoutDay,
  warmUp,
  prepName,
  prepMinutes,
  cardioName,
  cardioMinutes,
  restSeconds,
  onExit,
  onComplete,
}: WorkoutRunnerProps) {
  const queue = useMemo<SessionItem[]>(() => {
    if (!workoutDay || isRestDay(workoutDay)) return [];
    return [
      {
        id: "prep-treadmill",
        name: prepName,
        section: "Prep",
        mode: "timed",
        rounds: 1,
        durationSeconds: prepMinutes * 60,
        source: "support",
      },
      ...warmUp.map((exercise, index) => ({
        id: `warmup-${index}-${exercise.name}`,
        name: exercise.name,
        section: "Warm-up" as const,
        mode: exerciseMode(exercise),
        rounds: Math.max(1, Number(exercise.rounds ?? 1)),
        reps: Math.max(1, Number(exercise.counts ?? 1)),
        durationSeconds: exerciseDuration(exercise) || undefined,
        source: "program" as const,
      })),
      ...workoutDay.map((exercise, index) => ({
        id: `main-${index}-${exercise.name}`,
        name: exercise.name,
        section: "Main work" as const,
        mode: exerciseMode(exercise),
        rounds: Math.max(1, Number(exercise.rounds ?? 1)),
        reps: Math.max(1, Number(exercise.counts ?? 1)),
        durationSeconds: exerciseDuration(exercise) || undefined,
        source: "program" as const,
      })),
      {
        id: "finish-cardio",
        name: cardioName,
        section: "Conditioning",
        mode: "timed",
        rounds: 1,
        durationSeconds: cardioMinutes * 60,
        source: "support",
      },
    ];
  }, [cardioMinutes, cardioName, prepMinutes, prepName, warmUp, workoutDay]);

  const [snapshot, setSnapshot] = useState<RunnerSnapshot>(() => makeInitialSnapshot(week, day, restSeconds));
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const completionSent = useRef(false);

  const totalSets = useMemo(() => queue.reduce((sum, item) => sum + item.rounds, 0), [queue]);
  const currentItem = queue[snapshot.itemIndex];

  const nextPosition = useCallback(
    (itemIndex: number, roundIndex: number) => {
      const item = queue[itemIndex];
      if (!item) return null;
      if (roundIndex + 1 < item.rounds) return { itemIndex, roundIndex: roundIndex + 1 };
      if (itemIndex + 1 < queue.length) return { itemIndex: itemIndex + 1, roundIndex: 0 };
      return null;
    },
    [queue],
  );

  const upcomingPosition = currentItem ? nextPosition(snapshot.itemIndex, snapshot.roundIndex) : null;
  const upcomingItem = upcomingPosition ? queue[upcomingPosition.itemIndex] : null;
  const totalProgress = totalSets ? (snapshot.completedSets / totalSets) * 100 : 0;

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      let nextSnapshot = makeInitialSnapshot(week, day, restSeconds);
      try {
        const stored = window.localStorage.getItem(ACTIVE_SESSION_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as RunnerSnapshot;
          if (parsed.version === 1 && parsed.week === week && parsed.day === day && parsed.phase !== "complete") {
            const secondsAway = Math.max(0, Math.floor((Date.now() - parsed.updatedAt) / 1000));
            nextSnapshot = { ...parsed, updatedAt: Date.now() };
            if (!parsed.paused && parsed.phase === "rest") {
              nextSnapshot.restRemaining = Math.max(0, parsed.restRemaining - secondsAway);
              nextSnapshot.elapsedSeconds += Math.min(secondsAway, parsed.restRemaining);
            } else if (!parsed.paused && parsed.phase === "active" && parsed.timerRunning) {
              nextSnapshot.timerRemaining = Math.max(0, parsed.timerRemaining - secondsAway);
              nextSnapshot.elapsedSeconds += Math.min(secondsAway, parsed.timerRemaining);
            }
          }
        }
      } catch {
        nextSnapshot = makeInitialSnapshot(week, day, restSeconds);
      }
      setSnapshot(nextSnapshot);
      setHydrated(true);
      completionSent.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [day, open, restSeconds, week]);

  useEffect(() => {
    if (!open || !hydrated || snapshot.phase === "complete") return;
    window.localStorage.setItem(
      ACTIVE_SESSION_KEY,
      JSON.stringify({ ...snapshot, updatedAt: Date.now() }),
    );
  }, [hydrated, open, snapshot]);

  useEffect(() => {
    if (!open || !hydrated || snapshot.paused || snapshot.phase === "ready" || snapshot.phase === "complete") return;
    const interval = window.setInterval(() => {
      setSnapshot((current) => {
        if (current.paused || current.phase === "ready" || current.phase === "complete") return current;
        if (current.phase === "rest") {
          return {
            ...current,
            restRemaining: Math.max(0, current.restRemaining - 1),
            elapsedSeconds: current.elapsedSeconds + 1,
            updatedAt: Date.now(),
          };
        }
        if (current.phase === "active" && current.timerRunning) {
          return {
            ...current,
            timerRemaining: Math.max(0, current.timerRemaining - 1),
            elapsedSeconds: current.elapsedSeconds + 1,
            updatedAt: Date.now(),
          };
        }
        return {
          ...current,
          elapsedSeconds: current.elapsedSeconds + 1,
          updatedAt: Date.now(),
        };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [hydrated, open, snapshot.paused, snapshot.phase]);

  const completeSession = useCallback(
    (current: RunnerSnapshot) => {
      const completed = { ...current, phase: "complete" as const, timerRunning: false, paused: false, updatedAt: Date.now() };
      setSnapshot(completed);
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
      playWhistle("finish", current.soundEnabled);
    },
    [],
  );

  const advanceAfterRest = useCallback(() => {
    setSnapshot((current) => {
      if (current.phase !== "rest") return current;
      const next = nextPosition(current.itemIndex, current.roundIndex);
      if (!next) {
        window.setTimeout(() => completeSession(current), 0);
        return current;
      }
      const nextItem = queue[next.itemIndex];
      playWhistle("go", current.soundEnabled);
      return {
        ...current,
        phase: "active",
        itemIndex: next.itemIndex,
        roundIndex: next.roundIndex,
        timerRemaining: nextItem.mode === "timed" ? nextItem.durationSeconds ?? 0 : 0,
        timerRunning: false,
        restRemaining: restSeconds,
        updatedAt: Date.now(),
      };
    });
  }, [completeSession, nextPosition, queue, restSeconds]);

  const finishCurrentSet = useCallback(() => {
    if (!currentItem || snapshot.phase !== "active" || snapshot.paused) return;
    const next = nextPosition(snapshot.itemIndex, snapshot.roundIndex);
    playWhistle("set", snapshot.soundEnabled);
    setSnapshot((current) => {
      const updated = {
        ...current,
        completedSets: current.completedSets + 1,
        timerRunning: false,
        updatedAt: Date.now(),
      };
      if (!next) {
        window.setTimeout(() => completeSession(updated), 0);
        return updated;
      }
      return { ...updated, phase: "rest" as const, restRemaining: restSeconds };
    });
  }, [completeSession, currentItem, nextPosition, restSeconds, snapshot.itemIndex, snapshot.paused, snapshot.phase, snapshot.roundIndex, snapshot.soundEnabled]);

  useEffect(() => {
    if (!open || snapshot.paused) return;
    if (snapshot.phase !== "rest" || snapshot.restRemaining !== 0) return;
    const timer = window.setTimeout(advanceAfterRest, 0);
    return () => window.clearTimeout(timer);
  }, [advanceAfterRest, open, snapshot.paused, snapshot.phase, snapshot.restRemaining]);

  useEffect(() => {
    if (!open || snapshot.paused || !currentItem) return;
    if (snapshot.phase !== "active" || currentItem.mode !== "timed" || !snapshot.timerRunning || snapshot.timerRemaining !== 0) return;
    const timer = window.setTimeout(finishCurrentSet, 0);
    return () => window.clearTimeout(timer);
  }, [currentItem, finishCurrentSet, open, snapshot.paused, snapshot.phase, snapshot.timerRemaining, snapshot.timerRunning]);

  useEffect(() => {
    if (!open || snapshot.phase !== "complete" || completionSent.current) return;
    completionSent.current = true;
    onComplete({
      week,
      day,
      setsCompleted: snapshot.completedSets,
      elapsedSeconds: snapshot.elapsedSeconds,
      isRestDay: isRestDay(workoutDay),
    });
  }, [day, onComplete, open, snapshot.completedSets, snapshot.elapsedSeconds, snapshot.phase, week, workoutDay]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.code === "Space" || event.code === "Enter") && snapshot.phase === "active" && currentItem?.mode === "reps" && !snapshot.paused) {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button, a")) return;
        event.preventDefault();
        finishCurrentSet();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentItem?.mode, finishCurrentSet, open, snapshot.paused, snapshot.phase]);

  const startSession = () => {
    if (isRestDay(workoutDay)) {
      const completed = { ...snapshot, phase: "complete" as const, startedAt: new Date().toISOString(), updatedAt: Date.now() };
      setSnapshot(completed);
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
      playWhistle("finish", snapshot.soundEnabled);
      return;
    }
    const firstItem = queue[0];
    playWhistle("start", snapshot.soundEnabled);
    setSnapshot((current) => ({
      ...current,
      phase: "active",
      startedAt: current.startedAt ?? new Date().toISOString(),
      timerRemaining: firstItem?.mode === "timed" ? firstItem.durationSeconds ?? 0 : 0,
      timerRunning: false,
      paused: false,
      updatedAt: Date.now(),
    }));
  };

  const toggleTimer = () => {
    if (!currentItem || currentItem.mode !== "timed" || snapshot.phase !== "active" || snapshot.paused) return;
    const starting = !snapshot.timerRunning;
    if (starting) playWhistle("go", snapshot.soundEnabled);
    setSnapshot((current) => ({ ...current, timerRunning: !current.timerRunning, updatedAt: Date.now() }));
  };

  const handleExit = () => {
    if (snapshot.phase !== "complete") {
      const savedSnapshot = {
        ...snapshot,
        paused: snapshot.phase === "ready" ? false : true,
        updatedAt: Date.now(),
      };
      setSnapshot(savedSnapshot);
      window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(savedSnapshot));
    }
    setOutlineOpen(false);
    onExit();
  };

  const restartSession = () => {
    const fresh = makeInitialSnapshot(week, day, restSeconds);
    setSnapshot(fresh);
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    completionSent.current = false;
  };

  if (!open) return null;

  const currentSectionSets = queue
    .slice(0, snapshot.itemIndex)
    .reduce((sum, item) => sum + item.rounds, 0) + snapshot.roundIndex;

  return (
    <div className="runner-shell" role="dialog" aria-modal="true" aria-label="Active workout session">
      <div className="runner-noise" />

      <header className="runner-header">
        <button className="runner-exit" onClick={handleExit} aria-label="Save and leave workout">
          <ArrowLeft size={19} />
          <span>Save & leave</span>
        </button>
        <div className="runner-brand"><Activity size={17} /><span>MOTION</span></div>
        <div className="runner-header-actions">
          <button
            className="runner-icon-button"
            onClick={() => setSnapshot((current) => ({ ...current, soundEnabled: !current.soundEnabled }))}
            aria-label={snapshot.soundEnabled ? "Mute workout sounds" : "Enable workout sounds"}
          >
            {snapshot.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button className="runner-icon-button" onClick={() => setOutlineOpen(true)} aria-label="Open session progress">
            <ListChecks size={19} />
          </button>
        </div>
      </header>

      <div className="runner-progress-track"><span style={{ width: `${totalProgress}%` }} /></div>

      {snapshot.phase === "ready" && (
        <section className="runner-ready">
          <div className="ready-orbit"><div><Dumbbell size={36} /></div></div>
          <p className="runner-kicker">Week {week} · Stage {stageIndex + 1} · Day {day + 1}</p>
          <h1>{dayTitle}<span>.</span></h1>
          <p>{isRestDay(workoutDay) ? "Recovery is programmed work. Mark the day complete when you’re ready to move forward." : dayFocus}</p>
          <div className="ready-grid">
            <div><span><Clock3 size={17} /></span><small>Flow</small><strong>{isRestDay(workoutDay) ? "Recovery" : "Guided"}</strong></div>
            <div><span><Dumbbell size={17} /></span><small>Total rounds</small><strong>{isRestDay(workoutDay) ? "—" : totalSets}</strong></div>
            <div><span><Timer size={17} /></span><small>Rest</small><strong>{isRestDay(workoutDay) ? "—" : `${restSeconds} sec`}</strong></div>
          </div>
          <button className="runner-start-button" onClick={startSession}>
            <span><Play size={20} fill="currentColor" /></span>
            {isRestDay(workoutDay) ? "Complete recovery day" : "Start on the whistle"}
            <ChevronRight size={19} />
          </button>
          {!isRestDay(workoutDay) && <small className="ready-hint">Sound cues are enabled · Your position saves automatically</small>}
        </section>
      )}

      {snapshot.phase === "active" && currentItem && (
        <section
          className={`runner-focus ${currentItem.mode === "reps" && !snapshot.paused ? "is-tappable" : ""}`}
          onClick={currentItem.mode === "reps" ? finishCurrentSet : undefined}
          role={currentItem.mode === "reps" ? "button" : undefined}
          tabIndex={currentItem.mode === "reps" ? 0 : undefined}
          aria-label={currentItem.mode === "reps" ? `Complete set ${snapshot.roundIndex + 1} of ${currentItem.rounds}` : undefined}
        >
          <div className="focus-meta">
            <span>{currentItem.section}</span>
            <i />
            <span>Exercise {snapshot.itemIndex + 1} of {queue.length}</span>
          </div>

          <div className="focus-title-row">
            <h1>{currentItem.name}</h1>
            <TechniqueLink name={currentItem.name} />
          </div>

          {currentItem.mode === "reps" ? (
            <>
              <div className="rep-target">
                <span>{currentItem.reps}</span>
                <div><strong>reps</strong><small>Controlled form</small></div>
              </div>
              <div className="round-status">
                <span>Round {snapshot.roundIndex + 1} of {currentItem.rounds}</span>
                <div className="round-dots">
                  {Array.from({ length: currentItem.rounds }, (_, index) => (
                    <i key={index} className={index < snapshot.roundIndex ? "done" : index === snapshot.roundIndex ? "current" : ""} />
                  ))}
                </div>
              </div>
              <button className="tap-target" onClick={(event) => { event.stopPropagation(); finishCurrentSet(); }}>
                <span><Check size={22} /></span>
                <div><strong>Set complete</strong><small>Tap here or anywhere on screen</small></div>
                <ChevronRight size={20} />
              </button>
            </>
          ) : (
            <>
              <div className="timer-display" aria-live="polite">{formatClock(snapshot.timerRemaining)}</div>
              <div className="timer-caption"><span>{snapshot.timerRunning ? "Timer running" : snapshot.timerRemaining < (currentItem.durationSeconds ?? 0) ? "Timer paused" : "Ready when you are"}</span><i /></div>
              <div className="timer-actions">
                <button className="timer-primary" onClick={toggleTimer}>
                  {snapshot.timerRunning ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                  {snapshot.timerRunning ? "Pause timer" : snapshot.timerRemaining < (currentItem.durationSeconds ?? 0) ? "Resume timer" : "Start timer"}
                </button>
                <button className="timer-finish" onClick={finishCurrentSet}>Finish interval</button>
              </div>
            </>
          )}

          <div className="focus-footer">
            <span><Clock3 size={15} /> Session {formatClock(snapshot.elapsedSeconds)}</span>
            <span>{upcomingItem ? `Next: ${upcomingItem.name}` : "Final interval"}</span>
          </div>
        </section>
      )}

      {snapshot.phase === "rest" && (
        <section className="runner-rest">
          <p className="runner-kicker">Set complete · Recover</p>
          <div
            className="rest-ring"
            style={{ "--rest-progress": `${((restSeconds - snapshot.restRemaining) / restSeconds) * 360}deg` } as React.CSSProperties}
          >
            <div><strong>{snapshot.restRemaining}</strong><span>seconds</span></div>
          </div>
          <h1>Breathe. Reset.</h1>
          <p>{upcomingItem ? <>Next up: <strong>{upcomingItem.name}</strong>{upcomingPosition && queue[upcomingPosition.itemIndex]?.mode === "reps" ? ` · Round ${upcomingPosition.roundIndex + 1}` : ""}</> : "One final breath before you finish."}</p>
          <button className="skip-rest" onClick={advanceAfterRest}>Skip rest <ChevronRight size={17} /></button>
          <div className="rest-progress-copy"><span>{snapshot.completedSets} rounds done</span><span>{totalSets - snapshot.completedSets} remaining</span></div>
        </section>
      )}

      {snapshot.phase === "complete" && (
        <section className="runner-complete">
          <div className="complete-mark"><CircleCheck size={42} /></div>
          <p className="runner-kicker">Session complete</p>
          <h1>{isRestDay(workoutDay) ? "Recovery logged." : "Strong work."}</h1>
          <p>{isRestDay(workoutDay) ? "The recovery day is complete and your program is ready to move forward." : "Every round was recorded. Your next workout is ready whenever you are."}</p>
          <div className="complete-stats">
            <div><small>Time</small><strong>{formatClock(snapshot.elapsedSeconds)}</strong></div>
            <div><small>Rounds</small><strong>{snapshot.completedSets}</strong></div>
            <div><small>Exercises</small><strong>{queue.length || "—"}</strong></div>
          </div>
          <button className="runner-start-button" onClick={handleExit}><Flag size={19} /> Return to dashboard <ChevronRight size={18} /></button>
          <button className="restart-link" onClick={restartSession}><RotateCcw size={15} /> Run this session again</button>
        </section>
      )}

      {snapshot.paused && snapshot.phase !== "complete" && (
        <div className="pause-layer">
          <div className="pause-card">
            <span className="pause-mark"><Pause size={26} fill="currentColor" /></span>
            <p className="runner-kicker">Session paused</p>
            <h2>Take your time.</h2>
            <p>Your timer and exact position are held safely.</p>
            <button onClick={() => setSnapshot((current) => ({ ...current, paused: false, updatedAt: Date.now() }))}><Play size={18} fill="currentColor" /> Resume workout</button>
            <button onClick={handleExit}>Save & return later</button>
          </div>
        </div>
      )}

      {snapshot.phase !== "ready" && snapshot.phase !== "complete" && !snapshot.paused && (
        <button className="floating-pause" onClick={() => setSnapshot((current) => ({ ...current, paused: true, timerRunning: current.timerRunning, updatedAt: Date.now() }))}>
          <Pause size={17} fill="currentColor" /> Pause
        </button>
      )}

      <div className={outlineOpen ? "runner-outline-layer open" : "runner-outline-layer"} aria-hidden={!outlineOpen}>
        <button className="outline-scrim" onClick={() => setOutlineOpen(false)} aria-label="Close session progress" />
        <aside className="runner-outline" aria-label="Session progress">
          <div className="outline-header">
            <div><p className="runner-kicker">Session map</p><h2>{dayTitle}</h2></div>
            <button className="runner-icon-button" onClick={() => setOutlineOpen(false)} aria-label="Close session progress"><X size={19} /></button>
          </div>
          <div className="outline-overview">
            <div><span style={{ width: `${totalProgress}%` }} /></div>
            <p><strong>{snapshot.completedSets}</strong> of {totalSets} rounds complete</p>
          </div>
          <div className="outline-list">
            {queue.map((item, index) => {
              const before = index < snapshot.itemIndex;
              const active = index === snapshot.itemIndex && snapshot.phase !== "ready";
              const completedWithin = active ? snapshot.roundIndex : 0;
              return (
                <div className={active ? "outline-item active" : before ? "outline-item done" : "outline-item"} key={item.id}>
                  <span className="outline-state">{before ? <Check size={14} /> : index + 1}</span>
                  <div><small>{item.section}</small><strong>{item.name}</strong><em>{item.mode === "timed" ? formatClock(item.durationSeconds ?? 0) : `${item.rounds} × ${item.reps} reps`}</em></div>
                  {active && <span className="outline-round">{completedWithin + 1}/{item.rounds}</span>}
                </div>
              );
            })}
          </div>
          <div className="outline-footer"><Activity size={16} /><span>{currentSectionSets} rounds reached · Session {formatClock(snapshot.elapsedSeconds)}</span></div>
        </aside>
      </div>
    </div>
  );
}
