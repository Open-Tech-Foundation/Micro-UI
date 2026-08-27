# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Unit and end-to-end test suite for `@opentf/micro-ui` with FakeDOM helper (`packages/micro-ui/test/`)
- `Gravity` demo page — N-body Newtonian simulator with canvas, presets (solar/orbits/binary/cluster), gravity/damping/speed controls, trails, and click-to-add bodies (`demo/src/gravity.ts`)
- Parallel real-DOM test layer using `jsdom` + Node's built-in test runner at `packages/micro-ui/test/jsdom/`, wired via `[tasks.test:jsdom]` in `tasks.toml`. Covers init render, event → update reconcile, keyed list reorder identity, controlled input, and `onReady` cleanup. Runs alongside the in-house FakeDOM tests without replacing them.

