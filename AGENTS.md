# AGENTS.md

Shared instructions for AI agents working on this repository.

## Project

MK Damage Numbers is a standalone Foundry VTT module for Foundry v13-v14 and
Shadowdark RPG v4+. It replaces Shadowdark's linear HP scrolling text with
bouncing damage and healing numbers drawn directly on Foundry's canvas.

The module must remain independent of RPG Damage Numbers and other optional
modules. Shadowdark is the only supported game system.

## Repository Structure

```text
module.json       Foundry module manifest and release metadata
README.md         User-facing installation and configuration guide
CHANGELOG.md      Release notes and version history
LICENSE           MIT license
release.ps1       Local release build and publishing helper
scripts/bridge.js Settings, Shadowdark integration, and canvas animation
```

There is no build step or package manager. Foundry loads `scripts/bridge.js`
directly as a browser-native ES module.

## Compatibility

- Preserve Foundry VTT v13-v14 support unless the user explicitly changes the
  compatibility target.
- Preserve compatibility with Shadowdark RPG v4.0.0 or later.
- Treat Shadowdark methods beginning with `_` as private integration points.
  Keep feature detection and clear failure logging around them.
- Prefer namespaced Foundry APIs such as `foundry.canvas.containers.PreciseText`
  and `foundry.utils.Color`.
- Do not restore the RPG Damage Numbers dependency or its global compatibility
  shim.

## Animation Behavior

- Damage uses Shadowdark's configured damage color; healing uses its healing
  color.
- Preserve Shadowdark's Animate HP Change world setting, defeated-token
  suppression, and Dynamic Token Ring flash.
- Preserve the lethal-hit fallback for HP updates that land exactly on zero.
- Keep animation timing frame-rate independent by using the Foundry canvas
  ticker's elapsed time.
- Every ticker callback and canvas display object must be cleaned up after the
  animation or during `canvasTearDown`.
- Avoid sockets for HP animations. Shadowdark's actor update workflow already
  runs the animation on connected clients.

## Coding Style

- Use modern JavaScript, two-space indentation, semicolons, and concise
  comments.
- Keep `MODULE_VERSION` aligned with `module.json`.
- Keep user-facing settings and their defaults backward compatible unless a
  migration is included.
- Avoid broad refactors unrelated to the requested change.
- Log actionable errors with the module ID prefix.

## Verification

Run the strongest practical checks after changes:

```powershell
node --check scripts/bridge.js
Get-Content -Raw module.json | ConvertFrom-Json | Out-Null
git diff --check
```

For animation or Foundry API changes, also test manually in a Shadowdark world:

- damage and healing each create one correctly colored number;
- a lethal hit ending at zero HP still animates exactly once;
- defeated tokens do not animate;
- linked and unlinked token actors both animate;
- font, size, and vertical-origin settings apply;
- Token Ring flashes still work;
- animations disappear and leave no ticker callbacks after canvas teardown.

If live Foundry testing is unavailable, report that limitation explicitly.

## Documentation

Update `README.md` whenever installation, compatibility, settings, or visible
behavior changes. Add a matching entry to `CHANGELOG.md` for release-facing
changes.

## Releases

- Follow semantic versioning.
- Keep `module.json`, `scripts/bridge.js`, and `CHANGELOG.md` on the same
  release version.
- Keep the version segment in `download` aligned with the `v<version>` GitHub
  release tag.
- The downloadable archive must be named `mk-damage-numbers.zip`.
- Attach both `module.json` and `mk-damage-numbers.zip` to the GitHub release.
- Use `release.ps1` to build release assets and do not commit generated `dist/`
  output.

