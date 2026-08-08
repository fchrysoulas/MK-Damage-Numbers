# Changelog

All notable changes to MK Damage Numbers are documented here.

## Unreleased

## 2.0.1

- Replaced the free-text font-family setting with a dropdown populated from
  Foundry's available fonts.
- Documented the 1.7-second animation display duration and 0.85-second fade
  start.

## 2.0.0

- Removed the RPG Damage Numbers dependency and compatibility shim.
- Added a standalone canvas animation with pop-in scaling, randomized arc,
  gravity, one rebound, and fade-out.
- Preserved Shadowdark's damage and healing colors, Animate HP Change setting,
  defeated-token suppression, and Dynamic Token Ring flash.
- Preserved lethal-hit numbers for HP updates that land exactly on zero while
  preventing duplicate animation if Shadowdark handles the update upstream.
- Added animation cleanup on completion and canvas teardown.
- Added Foundry VTT v14 compatibility while retaining v13 support.
- Declared Shadowdark v4.0.0 or later as the supported system.
- Removed obsolete `restricted` fields from world-setting registrations.
- Added GitHub installation, update, issue, and release metadata.

## 1.1.0

- Added the original Shadowdark bridge for RPG Damage Numbers.
- Added world settings for font family, font size, and vertical origin.
- Replaced Shadowdark's native HP scrolling text while preserving its Token
  Ring flash and defeated-token behavior.
