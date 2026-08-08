# MK Damage Numbers

MK Damage Numbers is a lightweight, standalone damage-number module for
Foundry Virtual Tabletop and Shadowdark RPG. It replaces Shadowdark's native
linear HP scrolling text with numbers that pop, arc, bounce, and fade above the
affected token.

No additional modules are required.

## Compatibility

- Foundry VTT: v13-v14
- Shadowdark RPG: v4.0.0 or later
- Module version: 2.0.2

## Features

- Standalone bouncing damage and healing numbers.
- Shadowdark's native damage and healing colors.
- Configurable font family, font size, and vertical origin.
- Randomized horizontal movement and arc for a less repetitive effect.
- Pop-in scale, gravity, one rebound, and smooth fade-out.
- Preserves Shadowdark's **Animate HP Change** world setting.
- Preserves Dynamic Token Ring damage and healing flashes.
- Suppresses numbers for defeated tokens, matching Shadowdark behavior.
- Handles lethal hits that land exactly on zero HP.
- Cleans up animations when they finish or when the canvas is torn down.

## Installation

### Install from the module manifest

1. Open Foundry VTT and select **Add-on Modules**.
2. Click **Install Module**.
3. Paste this URL into **Manifest URL**:

   ```text
   https://github.com/fchrysoulas/MK-Damage-Numbers/releases/latest/download/module.json
   ```

4. Click **Install**.
5. Enable **MK Damage Numbers** in a Shadowdark world.

### Install manually

1. Download `mk-damage-numbers.zip` from the desired GitHub release.
2. Extract it to `FoundryVTT/Data/modules/mk-damage-numbers/`.
3. Restart Foundry and enable the module in a Shadowdark world.

## Configuration

Open:

```text
Configure Settings > Module Settings > MK Damage Numbers
```

Available world settings:

- **Font Family**: dropdown listing all loaded Foundry fonts, including
  additional fonts configured for the current world.
- **Font Size**: fixed text size in pixels.
- **Animation Duration**: display time in seconds, from 0.5 to 5.0 seconds.
  The number begins fading halfway through the selected duration.
- **Vertical Origin Offset**: starting height relative to token height.
  Negative values move the number higher.

Shadowdark's own **Animate HP Change** setting remains the master switch. When
that setting is disabled, MK Damage Numbers does not animate HP changes.

The default animation duration is **1.7 seconds**, with fading beginning after
**0.85 seconds**.


## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MK Damage Numbers is released under the MIT License. See [LICENSE](LICENSE).
