# Motion Workout

Motion is a polished, mobile-first workout companion built around editable JSON data. It presents an 18-week, three-stage routine; guides the user through timed and repetition-based work; announces transitions with synthesized whistle cues; and restores the exact session position from Local Storage after the page is closed.

The site is a static React application. It does not require a database, server, account, API key, or paid service. It can be hosted directly on GitHub Pages.

## What is included

- Dark, responsive interface with `#3498F2` as the principal accent.
- JSON-driven stage, day, warm-up, and timing data.
- Three six-week stages and six programmed days per week.
- Full-screen, low-distraction workout runner.
- Manual tap-to-complete progression for repetition work.
- Dedicated start/pause controls for timed exercises.
- Automatic 15-second rest periods by default.
- Distinct whistle patterns for workout start, set completion, rest completion, and session completion.
- Pause, save, leave, and exact-position resume behavior.
- Program and in-session progress sidebars.
- YouTube technique-search link beside every exercise.
- Device-local progress, streak, completed-day, round, and active-session storage.
- Legacy migration from the original `weekProgress` and `dayProgress` Local Storage keys.
- Automated data, interaction, lint, and production-build checks.
- A ready-to-use GitHub Pages deployment workflow.

## Quick start

Requirements: [Node.js](https://nodejs.org/) 22 or newer and npm.

```bash
npm install
npm run dev
```

Open the local address shown by Vite.

Production validation:

```bash
npm run lint
npm test
npm run build
npm run preview
```

The production output is created in `dist/`.

## Project structure

```text
motion-workout/
├── .github/workflows/deploy-pages.yml  # Validation and GitHub Pages deployment
├── public/
│   ├── data/
│   │   ├── stages.json                 # Main stage/day workout program
│   │   ├── warmUp.json                 # Warm-up sequence
│   │   └── settings.json               # Rest, treadmill, and cardio timing
│   ├── favicon.svg
│   └── manifest.webmanifest
├── src/
│   ├── App.tsx                         # Dashboard, program browser, progress state
│   ├── WorkoutRunner.tsx               # Session engine, timers, audio, persistence
│   ├── styles.css                      # Complete responsive design system
│   ├── App.test.tsx                    # Interaction tests
│   ├── data.test.ts                    # JSON structure tests
│   └── main.tsx
├── GITHUB_UPLOAD_GUIDE.md
├── index.html
├── package.json
└── vite.config.ts
```

## Editing the workout program

The workout content is not embedded in the interface. Update the files in `public/data/`, rebuild, and the website will use the revised data.

### `stages.json`

The structure is:

```text
stages[stage][day][exercise]
```

- There are three stages.
- Each stage contains six day arrays.
- The website maps Stage 1 to Weeks 1–6, Stage 2 to Weeks 7–12, and Stage 3 to Weeks 13–18.
- A recovery day is represented exactly as `["Rest"]`.

Standard repetition exercise:

```json
{
  "name": "Barbell back squats",
  "rounds": "6",
  "counts": "10"
}
```

Timed exercise supported inside either JSON file:

```json
{
  "name": "Running",
  "type": "timed",
  "rounds": 1,
  "durationMinutes": 20
}
```

You may use `durationSeconds` instead of `durationMinutes`. Any exercise with `type: "timed"`, `durationMinutes`, or `durationSeconds` receives timer controls automatically. All other exercises receive round/repetition controls.

### `warmUp.json`

Warm-up entries use the same exercise schema and are performed in array order before the selected day’s main work. Changing the order in the file changes the order in the session.

### `settings.json`

```json
{
  "restSeconds": 15,
  "prep": {
    "name": "Treadmill walk",
    "durationMinutes": 15
  },
  "conditioning": {
    "name": "Steady-state cardio",
    "durationMinutesByStage": [30, 45, 60]
  }
}
```

This file controls the rest countdown, timed preparation block, and conditioning duration for each stage without requiring a code change.

## Local Storage behavior

Progress is intentionally private to the current browser/device.

| Key | Purpose |
| --- | --- |
| `motion-workout-progress-v1` | Current week/day, completed days, total sessions, total rounds, streak, and last completion date |
| `motion-active-session-v1` | Exact in-session exercise, round, timer, rest, pause, sound, and elapsed-time state |

Clearing browser site data resets the saved state. There is also a guarded “Reset device progress” control in the progress sidebar.

## GitHub and deployment

Follow [GITHUB_UPLOAD_GUIDE.md](./GITHUB_UPLOAD_GUIDE.md) for browser, terminal, and GitHub Desktop upload instructions.

After the repository is on GitHub:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **GitHub Actions** as the source.
3. Push to `main`, or run the workflow manually from the **Actions** tab.

The included workflow installs from `package-lock.json`, lints, tests, builds, and deploys `dist/`. The relative Vite base is already configured for a project site such as `https://username.github.io/repository-name/`.

## Important implementation notes

- Exercise names are intentionally preserved from the supplied JSON. Correct spelling or terminology directly in those files if desired.
- The displayed routine can contain substantial training volume. Review the program itself independently and adapt load, technique, exercise selection, and volume to the individual user.
- Synthesized whistles use the Web Audio API and begin only after a user gesture. A sound toggle is available in the session header.
- YouTube links open a search query rather than depending on a fixed third-party video.
- No personal workout data leaves the browser.

## License

No license has been assigned. Add a license before allowing unrestricted public reuse.
