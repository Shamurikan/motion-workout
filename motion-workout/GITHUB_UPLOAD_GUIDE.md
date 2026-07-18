# Upload Motion Workout to GitHub

This project is ready to upload as it is. Do not upload `node_modules/`, `dist/`, `.npm-cache/`, or `.npm-home/`; they are generated locally and are already excluded by `.gitignore`.

## Option 1 — GitHub website

1. Extract the downloaded `motion-workout-github-ready.zip` file.
2. Sign in to [GitHub](https://github.com/).
3. Select **New repository**.
4. Enter a repository name, such as `motion-workout`.
5. Choose **Public** or **Private**.
6. Leave **Add a README**, **Add .gitignore**, and **Choose a license** disabled because the project already includes the required files.
7. Select **Create repository**.
8. On the empty-repository page, choose **uploading an existing file**.
9. Drag the *contents inside* the extracted `motion-workout` folder into the upload area. Make sure `.github`, `public`, `src`, `package.json`, and `README.md` are at the repository root.
10. Enter `Initial Motion workout website` as the commit message and select **Commit changes**.

## Option 2 — Terminal

Open a terminal inside the extracted project folder, then run:

```bash
git init
git add .
git commit -m "Initial Motion workout website"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace `YOUR-USERNAME` and `YOUR-REPOSITORY` with the real GitHub values. GitHub may ask you to authenticate in the browser or use a personal access token; do not place a password or token inside the project files.

## Option 3 — GitHub Desktop

1. Extract the ZIP.
2. Open GitHub Desktop.
3. Select **File → Add local repository**.
4. Choose the extracted project folder.
5. If prompted, select **create a repository here**.
6. Commit all project files with the message `Initial Motion workout website`.
7. Select **Publish repository** and choose the desired visibility.

## Publish with GitHub Pages

The included workflow at `.github/workflows/deploy-pages.yml` handles validation and deployment.

1. Open the repository on GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open **Actions** and select **Validate and deploy to GitHub Pages**.
5. If a run did not start automatically, select **Run workflow** and use the `main` branch.
6. Wait for the build and deploy jobs to become green.
7. The deployed address appears in the workflow and on the Pages settings screen. It normally has this form:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/
```

Every later push to `main` validates and redeploys the site automatically.

## Update the workout later

Edit one or more of these files:

```text
public/data/stages.json
public/data/warmUp.json
public/data/settings.json
```

Then commit and push:

```bash
git add public/data
git commit -m "Update workout program"
git push
```

GitHub Pages will rebuild the updated program.

## Verify before pushing

```bash
npm install
npm run lint
npm test
npm run build
```

All four commands should finish without errors.

## Common mistakes

- **A second folder level appears on GitHub:** upload the contents of the extracted folder, not the folder that contains them.
- **The workflow cannot find `package.json`:** `package.json` is not at the repository root.
- **The website shows a 404:** enable GitHub Actions under **Settings → Pages**, then run the deployment workflow.
- **An exercise change does not appear:** confirm the JSON is valid, commit the changed file, and wait for the latest Pages workflow to finish.
- **Progress seems missing on another device:** progress is intentionally stored in the browser’s Local Storage and does not sync between devices.
