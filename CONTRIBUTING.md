# Contributing

Changes to SpeakInCharacter go through **pull requests targeting `main`**.

## Checks required for merge

The PR workflow [`CI`](.github/workflows/ci.yml) checks:

- TypeScript on the renderer and Electron main process;
- Vitest unit tests and coverage thresholds (audio guards, locale and local history);
- Portable release ZIP packaging regression tests (Linux; Bash, zip and unzip);
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

CI runs on **pull requests**, not every push to `main`. It builds and inspects the packaged program and attaches a downloadable Windows preview to the PR with 7-day retention. The separate manual Windows workflow remains available for preview builds.

## Development

Install Node.js 22 or later:

```sh
npm ci
npm run typecheck
npm test
npm run test:coverage
```

On Windows, the GitHub Actions CI compiles `native/hotkey.cs` before packaging with `npm run dist:win`. Keep any behavior fixes accompanied by a regression test wherever practical. Add to coverage gradually rather than claiming the entire GUI is already covered.

If you are updating this workflow itself, **do not merge until the new `CI / required` check has succeeded**.

## Stable releases

With explicit owner approval, merge tested PRs using squash, then create a
`vX.Y.Z` tag on the intended `main` commit. The tag must match `package.json`
and have release notes at `.github/release-notes/vX.Y.Z.md`. Tag pushes run
the reusable CI (tests, full Windows package and Electron/native smoke), then
publish a stable portable ZIP plus `SHA256SUMS.txt`. The release uses artifacts
from that exact workflow run; the tag is never created from a different build.

A draft is created first and published only after both assets are uploaded.
Already published releases are left unchanged on reruns. To retry a failed
publication, dispatch the release workflow with the existing tag as its ref.
Do not move a published tag or bypass `main` protection. Use `npm ci` and keep
`package-lock.json` current when deliberately changing dependencies.
