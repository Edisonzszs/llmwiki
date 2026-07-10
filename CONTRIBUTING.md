# Contributing

Thanks for your interest in `llmwiki`. This is a small guide to keep the codebase
coherent.

## Develop

```bash
npm install        # workspace deps
npm test           # pretest builds dist/ (tsc -b), then runs vitest
npm run build      # compile all packages to dist/
npm run typecheck  # tsc -b (also builds)
```

Requires Node ≥ 20. Run a single package's tests with
`npx vitest run packages/core`.

## Architecture invariants (do not break)

1. **The graph is a view of `wiki/*.md`.** Never store structure as truth
   outside page files; never let a caller edit the graph directly.
2. **The deterministic core (`llmwiki-core`) never imports an LLM client.** Any
   module that needs a model takes an injected `LlmClient`. A `MockLlm` makes
   every consumer testable with no network.
3. **The filesystem is truth; `.llmwiki/` is disposable.** Anything in the
   derived index must be rebuildable from `raw/` + `wiki/`.

## Adding a core module

The core is pure functions, organized one concern per file under
`packages/core/src/`. Workflow (TDD):

1. Write a failing test in `<module>.test.ts` describing the behavior.
2. Run `npx vitest run packages/core/src/<module>.test.ts` — watch it fail.
3. Implement the minimal `<module>.ts` to pass; re-export from `index.ts`.
4. `npm test` stays green, `npm run typecheck` clean.

LLM-using modules (`ingest-runner`, `maintain`) accept an injected `LlmClient`
and stay deterministic given a `MockLlm`.

## Commits & PRs

- Keep PRs focused; reference the issue if any.
- Ensure `npm test` and `npm run typecheck` pass.
- Follow the existing code style (strict TS, ESM, no unnecessary deps).

## License

By contributing you agree your contributions are licensed under the project's
MIT license.
