import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Dumbbell,
  Flame,
  Gauge,
  History,
  Menu,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
  TrendingUp,
  Trophy,
  X,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import WorkoutRunner, {
  ACTIVE_SESSION_KEY,
  type WorkoutCompletionPayload,
  type WorkoutDayData,
  type WorkoutExercise,
} from "./WorkoutRunner";

type Stages = WorkoutDayData[][];

type ProgressState = {
  currentWeek: number;
  currentDay: number;
  completedDays: string[];
  workoutsCompleted: number;
  setsCompleted: number;
  streak: number;
  lastWorkoutAt: string | null;
};

type SessionTarget = {
  week: number;
  day: number;
};

type WorkoutSettings = {
  restSeconds: number;
  prep: { name: string; durationMinutes: number };
  conditioning: { name: string; durationMinutesByStage: number[] };
};

const DEFAULT_SETTINGS: WorkoutSettings = {
  restSeconds: 15,
  prep: { name: "Treadmill walk", durationMinutes: 15 },
  conditioning: { name: "Steady-state cardio", durationMinutesByStage: [30, 45, 60] },
};

const STORAGE_KEY = "motion-workout-progress-v1";

const DEFAULT_PROGRESS: ProgressState = {
  currentWeek: 1,
  currentDay: 0,
  completedDays: [],
  workoutsCompleted: 0,
  setsCompleted: 0,
  streak: 0,
  lastWorkoutAt: null,
};

const STAGE_META = [
  { name: "Foundation", eyebrow: "Control & consistency", weeks: "Weeks 1–6" },
  { name: "Build", eyebrow: "Volume & capacity", weeks: "Weeks 7–12" },
  { name: "Peak", eyebrow: "Intensity & finish", weeks: "Weeks 13–18" },
];

const DAY_META = [
  { title: "Lower body", short: "Lower", focus: "Quads · Glutes · Calves" },
  { title: "Back & pull", short: "Pull", focus: "Lats · Mid-back · Hinge" },
  { title: "Chest & push", short: "Push", focus: "Chest · Pressing strength" },
  { title: "Recovery", short: "Rest", focus: "Rest · Mobility · Reset" },
  { title: "Arms", short: "Arms", focus: "Biceps · Triceps · Forearms" },
  { title: "Shoulders & core", short: "Core", focus: "Delts · Trunk control" },
];

const dayKey = (week: number, day: number) => `w${week}-d${day}`;
const stageFromWeek = (week: number) => Math.min(2, Math.floor((week - 1) / 6));

const isRestDay = (day: WorkoutDayData | undefined): day is ["Rest"] =>
  Boolean(day && day.length === 1 && day[0] === "Rest");

const formatLastWorkout = (date: string | null) => {
  if (!date) return "No session yet";
  const parsed = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - parsed.getTime()) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
};

const exerciseDuration = (exercise: WorkoutExercise) => {
  if (exercise.durationSeconds !== undefined) return Math.max(1, Number(exercise.durationSeconds));
  if (exercise.durationMinutes !== undefined) return Math.max(1, Number(exercise.durationMinutes) * 60);
  return 0;
};

const exerciseTarget = (exercise: WorkoutExercise) => {
  const duration = exerciseDuration(exercise);
  return duration > 0 ? `${Math.round(duration / 60)} min` : exercise.counts ?? "—";
};

const getNextProgramPosition = (week: number, day: number) => {
  if (week === 18 && day === 5) return { week: 18, day: 5 };
  if (day < 5) return { week, day: day + 1 };
  return { week: Math.min(18, week + 1), day: 0 };
};

function YouTubeLink({ name }: { name: string }) {
  return (
    <a
      className="youtube-link"
      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise form`)}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Search YouTube for ${name} technique`}
      title="View technique on YouTube"
      onClick={(event) => event.stopPropagation()}
    >
      <Video size={15} strokeWidth={2.2} />
    </a>
  );
}

function MiniRing({ value, label }: { value: number; label: string }) {
  const safeValue = Math.min(100, Math.max(0, value));
  return (
    <div
      className="mini-ring"
      style={{ "--ring-value": `${safeValue * 3.6}deg` } as CSSProperties}
      aria-label={`${label}: ${Math.round(safeValue)} percent`}
    >
      <div><strong>{Math.round(safeValue)}%</strong><span>{label}</span></div>
    </div>
  );
}

export default function App() {
  const [stages, setStages] = useState<Stages | null>(null);
  const [warmUp, setWarmUp] = useState<WorkoutExercise[]>([]);
  const [settings, setSettings] = useState<WorkoutSettings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState<ProgressState>(DEFAULT_PROGRESS);
  const [selectedStage, setSelectedStage] = useState(0);
  const [selectedDay, setSelectedDay] = useState(0);
  const [sessionTarget, setSessionTarget] = useState<SessionTarget>({ week: 1, day: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [dataError, setDataError] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const base = import.meta.env.BASE_URL;
        const [stagesResponse, warmUpResponse, settingsResponse] = await Promise.all([
          fetch(`${base}data/stages.json`),
          fetch(`${base}data/warmUp.json`),
          fetch(`${base}data/settings.json`),
        ]);
        if (!stagesResponse.ok || !warmUpResponse.ok || !settingsResponse.ok) throw new Error("Workout data unavailable");
        const [stageData, warmUpData, settingsData] = await Promise.all([
          stagesResponse.json() as Promise<Stages>,
          warmUpResponse.json() as Promise<WorkoutExercise[]>,
          settingsResponse.json() as Promise<WorkoutSettings>,
        ]);
        const validStages = Array.isArray(stageData) && stageData.length === 3 && stageData.every((stage) => Array.isArray(stage) && stage.length === 6);
        const validWarmUp = Array.isArray(warmUpData) && warmUpData.every((exercise) => typeof exercise?.name === "string");
        const validSettings = Number(settingsData?.restSeconds) > 0
          && Number(settingsData?.prep?.durationMinutes) > 0
          && Array.isArray(settingsData?.conditioning?.durationMinutesByStage)
          && settingsData.conditioning.durationMinutesByStage.length === 3;
        if (!validStages || !validWarmUp || !validSettings) throw new Error("Workout data has an invalid structure");
        setStages(stageData);
        setWarmUp(warmUpData);
        setSettings(settingsData);
      } catch {
        setDataError(true);
      }
    };

    const hydrationTimer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        let nextProgress = DEFAULT_PROGRESS;
        if (stored) {
          nextProgress = { ...DEFAULT_PROGRESS, ...(JSON.parse(stored) as ProgressState) };
        } else {
          const legacyWeek = Number(window.localStorage.getItem("weekProgress"));
          const legacyDay = Number(window.localStorage.getItem("dayProgress"));
          if (Number.isFinite(legacyWeek) || Number.isFinite(legacyDay)) {
            nextProgress = {
              ...DEFAULT_PROGRESS,
              currentWeek: Math.min(18, Math.max(1, (legacyWeek || 0) + 1)),
              currentDay: Math.min(5, Math.max(0, legacyDay || 0)),
            };
          }
        }

        let target = { week: nextProgress.currentWeek, day: nextProgress.currentDay };
        const activeSession = window.localStorage.getItem(ACTIVE_SESSION_KEY);
        if (activeSession) {
          const parsed = JSON.parse(activeSession) as { week?: number; day?: number; phase?: string };
          if (typeof parsed.week === "number" && typeof parsed.day === "number" && parsed.phase !== "complete") {
            target = { week: parsed.week, day: parsed.day };
            setHasActiveSession(true);
          }
        }

        setProgress(nextProgress);
        setSelectedStage(stageFromWeek(nextProgress.currentWeek));
        setSelectedDay(nextProgress.currentDay);
        setSessionTarget(target);
      } catch {
        setProgress(DEFAULT_PROGRESS);
        setSessionTarget({ week: 1, day: 0 });
      }
      setHydrated(true);
    }, 0);

    void load();
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [hydrated, progress]);

  useEffect(() => {
    document.body.classList.toggle("no-scroll", sidebarOpen || introOpen || runnerOpen);
    return () => document.body.classList.remove("no-scroll");
  }, [introOpen, runnerOpen, sidebarOpen]);

  const currentStage = stageFromWeek(progress.currentWeek);
  const currentDayData = stages?.[currentStage]?.[progress.currentDay];
  const selectedDayData = stages?.[selectedStage]?.[selectedDay];
  const restToday = isRestDay(currentDayData);

  const runnerStage = stageFromWeek(sessionTarget.week);
  const runnerDayData = stages?.[runnerStage]?.[sessionTarget.day];

  const totalSets = useMemo(() => {
    if (!currentDayData || isRestDay(currentDayData)) return 0;
    return currentDayData.reduce((sum, exercise) => sum + Math.max(1, Number(exercise.rounds ?? 1)), 0);
  }, [currentDayData]);

  const sessionMinutes = useMemo(() => {
    if (!currentDayData || isRestDay(currentDayData)) return 0;
    const strengthEstimate = currentDayData.reduce((sum, exercise) => {
      const duration = exerciseDuration(exercise);
      return sum + (duration > 0 ? duration / 60 : Math.max(1, Number(exercise.rounds ?? 1)) * 1.35);
    }, 0);
    return Math.round(settings.prep.durationMinutes + warmUp.length * 1.2 + strengthEstimate + (settings.conditioning.durationMinutesByStage[currentStage] ?? 0));
  }, [currentDayData, currentStage, settings, warmUp.length]);

  const overallPercent = (progress.completedDays.length / 108) * 100;
  const stageCompleted = progress.completedDays.filter((key) => {
    const week = Number(key.match(/^w(\d+)/)?.[1] ?? 0);
    return stageFromWeek(week) === currentStage;
  }).length;
  const stagePercent = (stageCompleted / 36) * 100;

  const openWorkoutOverview = () => {
    if (!hasActiveSession) setSessionTarget({ week: progress.currentWeek, day: progress.currentDay });
    setIntroOpen(true);
  };

  const resetProgress = () => {
    if (!window.confirm("Reset all workout progress on this device? This cannot be undone.")) return;
    setProgress(DEFAULT_PROGRESS);
    setSessionTarget({ week: 1, day: 0 });
    setSelectedStage(0);
    setSelectedDay(0);
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    setHasActiveSession(false);
    setSidebarOpen(false);
  };

  const handleWorkoutComplete = (result: WorkoutCompletionPayload) => {
    const next = getNextProgramPosition(result.week, result.day);
    setHasActiveSession(false);
    setSelectedStage(stageFromWeek(next.week));
    setSelectedDay(next.day);
    setProgress((current) => {
      const key = dayKey(result.week, result.day);
      const alreadyComplete = current.completedDays.includes(key);
      const completedDays = alreadyComplete ? current.completedDays : [...current.completedDays, key];
      const now = new Date();
      let nextStreak = current.streak;

      if (!alreadyComplete) {
        if (!current.lastWorkoutAt) {
          nextStreak = 1;
        } else {
          const previous = new Date(current.lastWorkoutAt);
          const previousDay = Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth(), previous.getUTCDate());
          const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
          const difference = Math.round((today - previousDay) / 86_400_000);
          nextStreak = difference === 0 ? current.streak : difference === 1 ? current.streak + 1 : 1;
        }
      }

      return {
        ...current,
        currentWeek: next.week,
        currentDay: next.day,
        completedDays,
        workoutsCompleted: current.workoutsCompleted + (!alreadyComplete && !result.isRestDay ? 1 : 0),
        setsCompleted: current.setsCompleted + (!alreadyComplete ? result.setsCompleted : 0),
        streak: nextStreak,
        lastWorkoutAt: alreadyComplete ? current.lastWorkoutAt : now.toISOString(),
      };
    });
  };

  if (dataError) {
    return (
      <main className="error-page">
        <div className="error-card">
          <Dumbbell size={32} />
          <p className="eyebrow">Workout data</p>
          <h1>We couldn’t load the program.</h1>
          <p>Make sure stages.json and warmUp.json are available in public/data, then refresh the page.</p>
          <button className="primary-button" onClick={() => window.location.reload()}>Try again <RotateCcw size={17} /></button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="dashboard-surface" aria-hidden={runnerOpen}>
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="Motion home"><span className="brand-mark"><Activity size={19} /></span><span>MOTION</span></a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <a className="active" href="#top">Today</a>
          <a href="#program">Program</a>
          <a href="#insights">Insights</a>
        </nav>
        <button className="progress-trigger" onClick={() => setSidebarOpen(true)}>
          <span className="trigger-ring" style={{ "--trigger-progress": `${overallPercent * 3.6}deg` } as CSSProperties}><span /></span>
          <span className="trigger-copy"><small>Program progress</small><strong>{Math.round(overallPercent)}% complete</strong></span>
          <Menu size={20} />
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="status-line"><span className="live-dot" /><span>Week {progress.currentWeek} · Day {progress.currentDay + 1}</span><span className="status-divider" /><span>{STAGE_META[currentStage].name} phase</span></div>
          <p className="eyebrow">Your next session</p>
          <h1>{DAY_META[progress.currentDay].title}<span>.</span></h1>
          <p className="hero-description">
            {restToday
              ? "A deliberate recovery day to absorb the work, restore range, and return ready for the next training block."
              : `${DAY_META[progress.currentDay].focus}. Move through the warm-up, structured rounds, and stage-specific conditioning without losing your place.`}
          </p>
          <div className="session-chips" aria-label="Session summary">
            <span><Clock3 size={16} /> {restToday ? "Recovery day" : `≈ ${sessionMinutes} min`}</span>
            <span><Dumbbell size={16} /> {restToday ? "No lifting" : `${currentDayData?.length ?? 0} exercises`}</span>
            <span><Gauge size={16} /> {restToday ? "Low load" : `${totalSets} working sets`}</span>
          </div>
          <div className="hero-actions">
            <button className="primary-button large" onClick={openWorkoutOverview} disabled={!stages}>
              <span className="button-icon"><Play size={18} fill="currentColor" /></span>
              {hasActiveSession ? "Resume workout" : restToday ? "Open recovery day" : "Start workout"}
              <ArrowRight size={18} />
            </button>
            <a className="text-button" href="#program">Review today’s plan <ChevronRight size={17} /></a>
          </div>
          <div className="resume-note"><CircleCheck size={17} /><span>Your exact position is saved automatically on this device.</span></div>
        </div>

        <div className="hero-visual" aria-label="Current program progress">
          <div className="visual-grid" /><div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="hero-ring" style={{ "--hero-progress": `${stagePercent * 3.6}deg` } as CSSProperties}>
            <div className="hero-ring-inner"><span>Stage {currentStage + 1}</span><strong>{Math.round(stagePercent)}<small>%</small></strong><em>{STAGE_META[currentStage].name}</em></div>
          </div>
          <div className="float-card float-card-top"><span className="float-icon"><Flame size={17} /></span><div><small>Program streak</small><strong>{progress.streak} days</strong></div></div>
          <div className="float-card float-card-bottom"><span className="float-icon"><TrendingUp size={17} /></span><div><small>Last trained</small><strong>{formatLastWorkout(progress.lastWorkoutAt)}</strong></div></div>
          <div className="visual-caption"><span>18-week progressive cycle</span><span>{progress.completedDays.length} / 108 days</span></div>
        </div>
      </section>

      <section className="metrics" id="insights" aria-label="Training insights">
        <article className="metric-card"><span className="metric-icon blue"><Trophy size={19} /></span><div><small>Sessions finished</small><strong>{progress.workoutsCompleted}</strong></div><span className="metric-detail">All time</span></article>
        <article className="metric-card"><span className="metric-icon violet"><Dumbbell size={19} /></span><div><small>Rounds completed</small><strong>{progress.setsCompleted}</strong></div><span className="metric-detail">Quality volume</span></article>
        <article className="metric-card"><span className="metric-icon amber"><Flame size={19} /></span><div><small>Program streak</small><strong>{progress.streak}</strong></div><span className="metric-detail">Consecutive days</span></article>
        <article className="metric-card progress-metric"><MiniRing value={overallPercent} label="cycle" /><div><small>Overall progress</small><strong>Week {progress.currentWeek} of 18</strong></div></article>
      </section>

      <section className="program-section" id="program">
        <div className="section-heading">
          <div><p className="eyebrow">The program</p><h2>Built to progress with you.</h2><p>Three six-week stages. Six focused days per cycle. Every exercise is read directly from your workout files.</p></div>
          <div className="data-status"><span /> JSON connected</div>
        </div>

        <div className="stage-tabs" role="tablist" aria-label="Workout stages">
          {STAGE_META.map((stage, index) => (
            <button key={stage.name} className={selectedStage === index ? "active" : ""} onClick={() => { setSelectedStage(index); setSelectedDay(0); }} role="tab" aria-selected={selectedStage === index}>
              <span>0{index + 1}</span><div><strong>{stage.name}</strong><small>{stage.weeks}</small></div>{selectedStage === index && <Check size={16} />}
            </button>
          ))}
        </div>

        <div className="program-layout">
          <div className="day-list" role="tablist" aria-label="Training days">
            {DAY_META.map((day, index) => {
              const data = stages?.[selectedStage]?.[index];
              const rest = isRestDay(data);
              const rounds = !data || rest ? 0 : data.reduce((sum, item) => sum + Math.max(1, Number(item.rounds ?? 1)), 0);
              return (
                <button key={day.title} className={selectedDay === index ? "day-row active" : "day-row"} onClick={() => setSelectedDay(index)} role="tab" aria-selected={selectedDay === index}>
                  <span className="day-number">{String(index + 1).padStart(2, "0")}</span><span className="day-copy"><strong>{day.title}</strong><small>{day.focus}</small></span><span className="day-stat">{rest ? "Reset" : `${rounds} sets`}</span><ChevronRight size={18} />
                </button>
              );
            })}
          </div>

          <article className="day-detail">
            <div className="detail-topline"><div><span>Stage {selectedStage + 1} · Day {selectedDay + 1}</span><h3>{DAY_META[selectedDay].title}</h3></div><div className="detail-badge">{STAGE_META[selectedStage].eyebrow}</div></div>
            {isRestDay(selectedDayData) ? (
              <div className="recovery-card"><span className="recovery-icon"><Sparkles size={24} /></span><div><h4>Recovery is part of the program.</h4><p>No programmed resistance work today. Keep movement easy and arrive at the next session recovered.</p></div></div>
            ) : (
              <div className="exercise-table">
                <div className="exercise-table-head"><span>Exercise</span><span>Sets</span><span>Reps</span></div>
                {selectedDayData?.map((exercise, index) => (
                  <div className="exercise-row" key={`${exercise.name}-${index}`}><span className="exercise-index">{String(index + 1).padStart(2, "0")}</span><span className="exercise-name">{exercise.name}<YouTubeLink name={exercise.name} /></span><strong>{exercise.rounds ?? 1}</strong><strong>{exerciseTarget(exercise)}</strong></div>
                ))}
              </div>
            )}
            {!isRestDay(selectedDayData) && <div className="detail-footer"><span><Timer size={16} /> Includes {settings.prep.durationMinutes} min {settings.prep.name.toLowerCase()} + {settings.conditioning.durationMinutesByStage[selectedStage] ?? 0} min cardio</span><span><Activity size={16} /> {warmUp.length} warm-up movements</span></div>}
          </article>
        </div>
      </section>

      <section className="how-it-works">
        <div className="how-copy"><p className="eyebrow">One focused flow</p><h2>You train. Motion keeps the count.</h2><p>The session view removes distractions, remembers every round, and restores your exact position if you step away.</p></div>
        <div className="flow-steps">
          <article><span>01</span><Play size={21} /><strong>Start on the whistle</strong><p>Audio cues set the beginning and end of each work interval.</p></article>
          <article><span>02</span><Dumbbell size={21} /><strong>Tap when the set is done</strong><p>Manual progression keeps control in your hands.</p></article>
          <article><span>03</span><Timer size={21} /><strong>Recover for 15 seconds</strong><p>A clear countdown prepares you for the next round.</p></article>
        </div>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark"><Activity size={18} /></span><span>MOTION</span></a><p>Train with intention. Adjust any exercise to your ability and equipment.</p><span>Program data stays in your JSON. Progress stays on your device.</span></footer>

      <div className={sidebarOpen ? "drawer-layer open" : "drawer-layer"} aria-hidden={!sidebarOpen}>
        <button className="drawer-scrim" aria-label="Close progress panel" onClick={() => setSidebarOpen(false)} />
        <aside className="progress-drawer" aria-label="Workout progress">
          <div className="drawer-header"><div><p className="eyebrow">Your progress</p><h2>Stay in motion.</h2></div><button className="icon-button" onClick={() => setSidebarOpen(false)} aria-label="Close progress panel"><X size={20} /></button></div>
          <div className="drawer-progress-card"><MiniRing value={overallPercent} label="complete" /><div><span>18-week cycle</span><strong>Week {progress.currentWeek}, Day {progress.currentDay + 1}</strong><small>{progress.completedDays.length} of 108 program days complete</small></div></div>
          <div className="drawer-stats"><div><History size={17} /><span>Last session</span><strong>{formatLastWorkout(progress.lastWorkoutAt)}</strong></div><div><Flame size={17} /><span>Program streak</span><strong>{progress.streak} days</strong></div></div>
          <div className="timeline-heading"><span>Current week</span><small>{STAGE_META[currentStage].name}</small></div>
          <div className="week-timeline">
            {DAY_META.map((day, index) => {
              const completed = progress.completedDays.includes(dayKey(progress.currentWeek, index));
              const current = progress.currentDay === index;
              return <div className={current ? "timeline-row current" : "timeline-row"} key={day.title}><span className={completed ? "timeline-dot complete" : "timeline-dot"}>{completed ? <Check size={13} /> : index + 1}</span><div><strong>{day.title}</strong><small>{day.focus}</small></div><em>{completed ? "Done" : current ? "Next" : "Planned"}</em></div>;
            })}
          </div>
          <button className="reset-button" onClick={resetProgress}><RotateCcw size={16} /> Reset device progress</button>
        </aside>
      </div>

      <div className={introOpen ? "modal-layer open" : "modal-layer"} aria-hidden={!introOpen}>
        <button className="modal-scrim" aria-label="Close workout overview" onClick={() => setIntroOpen(false)} />
        <section className="session-intro" role="dialog" aria-modal="true" aria-label="Workout overview">
          <button className="icon-button intro-close" onClick={() => setIntroOpen(false)} aria-label="Close workout overview"><X size={20} /></button>
          <div className="intro-mark"><Dumbbell size={24} /></div>
          <p className="eyebrow">Week {sessionTarget.week} · Day {sessionTarget.day + 1}</p>
          <h2>{DAY_META[sessionTarget.day].title}</h2>
          <p>{isRestDay(runnerDayData) ? "A quiet day to recover before your next programmed session." : "Your guided session includes timed prep, every JSON-defined round, 15-second rests, and stage conditioning."}</p>
          <div className="intro-summary">
            <div><small>Warm-up</small><strong>{isRestDay(runnerDayData) ? "—" : `${warmUp.length} moves`}</strong></div>
            <div><small>Main work</small><strong>{isRestDay(runnerDayData) ? "Rest" : `${runnerDayData?.length ?? 0} moves`}</strong></div>
            <div><small>Conditioning</small><strong>{isRestDay(runnerDayData) ? "Optional" : `${settings.conditioning.durationMinutesByStage[runnerStage] ?? 0} min`}</strong></div>
          </div>
          <button className="primary-button large intro-action" onClick={() => { setIntroOpen(false); setRunnerOpen(true); setHasActiveSession(true); }}>
            {hasActiveSession ? "Resume session" : isRestDay(runnerDayData) ? "Open recovery" : "Enter workout"} <ArrowRight size={18} />
          </button>
        </section>
      </div>
      </div>

      <WorkoutRunner
        open={runnerOpen}
        week={sessionTarget.week}
        day={sessionTarget.day}
        stageIndex={runnerStage}
        dayTitle={DAY_META[sessionTarget.day].title}
        dayFocus={DAY_META[sessionTarget.day].focus}
        workoutDay={runnerDayData}
        warmUp={warmUp}
        prepName={settings.prep.name}
        prepMinutes={settings.prep.durationMinutes}
        cardioName={settings.conditioning.name}
        cardioMinutes={settings.conditioning.durationMinutesByStage[runnerStage] ?? 0}
        restSeconds={settings.restSeconds}
        onExit={() => setRunnerOpen(false)}
        onComplete={handleWorkoutComplete}
      />
    </main>
  );
}
