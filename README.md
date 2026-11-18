# Spinwise Roulette Analyzer — GitHub Pages

This is a static React/Vite app. The included GitHub Actions workflow builds the site and deploys it to GitHub Pages. It is **manual only**: pushing files does not publish the site by itself.

## Publish on GitHub.com

1. Download and extract the Spinwise Pages package. Create a GitHub repository named `spinwise-roulette-analyzer`.
2. Put the extracted project files in the repository root. Keep the hidden `.github/workflows/deploy-pages.yml` file; GitHub Actions needs it. From a terminal in the extracted folder, you can initialize and push the files with:

   ```sh
   git init -b main
   git add .
   git commit -m "Add Spinwise Roulette Analyzer"
   git remote add origin https://github.com/YOUR-GITHUB-USERNAME/spinwise-roulette-analyzer.git
   git push -u origin main
   ```

3. In the GitHub repository, open **Settings → Pages**. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Open **Actions**, select **Deploy Spinwise to GitHub Pages**, then click **Run workflow** on the `main` branch. The workflow builds and deploys the site; wait for it to succeed before using the URL shown by GitHub.

For the requested repository name, the usual project-site URL format is `https://YOUR-GITHUB-USERNAME.github.io/spinwise-roulette-analyzer/`. If you rename the repository, change `BASE_PATH` in `.github/workflows/deploy-pages.yml` to `/<new-repository-name>/` before running the workflow. Account and repository settings determine whether Pages can deploy from a private repository. The site itself is public to anyone with its URL; if you make the repository public, its source code is public too.

## Build locally

The Pages workflow uses Node.js 24 and the pnpm version pinned in `package.json`. To reproduce its build on Linux or macOS:

```sh
pnpm install --frozen-lockfile
BASE_PATH=/spinwise-roulette-analyzer/ pnpm build
```

The workflow uses GitHub’s Pages artifact deployment flow. See [GitHub’s custom-workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite’s static-deployment guide](https://vite.dev/guide/static-deploy).

## Privacy and limitations

This site has no server or shared database. Spin history is stored in each visitor’s browser and is not uploaded by the app. Screen sharing is preview-only: the app does not read roulette numbers from screen pixels or capture shared-screen audio. Voice input uses the visitor’s microphone; their browser’s speech service may process it. Manual entry is available. Historical runs and fairness checks describe past results and do not predict the next result on a fair, independent wheel.
