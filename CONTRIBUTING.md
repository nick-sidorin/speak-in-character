# Contributing

Changes to SpeakInCharacter go through **pull requests targeting `main`**.

## Checks required for merge

The PR workflow [`CI`](.github/workflows/ci.yml) checks:

- TypeScript on the renderer and Electron main process;
- Vitest unit tests and coverage thresholds (audio guards, locale and local history);
- Native Windows keyboard regression tests (including repeated shortcut presses);
- Windows system UI language command;
- Full packaged Electron Windows x64 build, including the bundled keyboard helper.

The stable aggregate status check is **`CI / required`**, which fails if either the unit-test job or Windows-build job fails, is cancelled, or is skipped.

To enforce this on the GitHub **`main`** ruleset:

1. Require a pull request before merging; block direct pushes.
2. Require status checks to pass and select **`CI / required`** after this PR has produced its first CI run.
3. Optionally require the branch to be up to date before merging.
4. Enable **Allow squash merging**, disable merge commits and rebase merges in repository settings.
5. Disable bypasses for administrators if you want the rules to apply to everyone.

CI runs on **pull requests**, not every push to `main`. It does not upload the ~130MB application artifact on every PR; it **does** build and inspect the packaged program. The separate manual Windows workflow remains for downloadable preview builds.

## Development

Install Node.js 22 or later:

```sh
npm install
npm run typecheck
npm test
npm run test:coverage
```

On Windows, the GitHub Actions CI compiles `native/hotkey.cs` before packaging with `npm run dist:win`. Keep any behavior fixes accompanied by a regression test wherever practical. Add to coverage gradually rather than claiming the entire GUI is already covered.

If you are updating this workflow itself, **do not merge until the new `CI / required` check has succeeded**.
