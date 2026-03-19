# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Stream Deck plugin for controlling Sonos speakers. Built with Vue 3 and Vite, packaged as an Elgato Stream Deck plugin. Pure JavaScript (no TypeScript).

## Commands

```bash
npm run build          # Production build to xyz.jdotc.sonoscontroller.sdPlugin/
npm run build_dev      # Debug build with sourcemaps
npm run dev            # Vite dev server
npm run lint           # ESLint with auto-fix
npm run format         # Prettier (128-char line width)
npm run validate       # Validate StreamDeck plugin structure
npm run package        # Create distributable .streamDeckPlugin file
```

No test framework is configured. Validation is done through `npm run validate` and manual testing.

Always run `npm run package` after `npm run build` or `npm run build_dev`. This produces the `.streamDeckPlugin` file needed for installation. Use `npm run package` directly (not `npx streamdeck pack`).

## Architecture

This is a two-process Stream Deck plugin:

**Plugin process** (`plugin.html` -> `src/plugin/main.js` -> `PluginComponent.vue`): Runs in the background. Manages WebSocket connection to Stream Deck hardware, polls Sonos devices, dispatches actions on button presses/dial turns.

**Property Inspector process** (`pi.html` -> `src/pi/main.js` -> `PiComponent.vue`): Configuration UI shown when a user selects a button in the Stream Deck app. Handles speaker discovery, favorite selection, and per-action settings.

### Data flow

```
Stream Deck Hardware -> Plugin (WebSocket) -> Action handler -> SonosController (UPnP) -> Sonos Speaker
```

### Key modules

- `src/modules/actions/sonosController.js` - All 11 action implementations (toggle mute, play/pause, play modes, volume, favorites, equalizer, etc.). Each action has handlers for different controller types (keypad, encoder).
- `src/modules/plugin/SonosSpeakers.js` - Reactive speaker state manager using Vue `reactive()`. Tracks operational status, rate limiting, and per-button contexts.
- `src/modules/common/sonosController.js` - Wraps the `sonos` npm package with UPnP calls for playback, volume, favorites, zone groups.
- `src/modules/common/streamdeck.js` - WebSocket wrapper for Stream Deck communication.

### Build output

Vite builds both entry points into `xyz.jdotc.sonoscontroller.sdPlugin/`. The plugin manifest lives at `public/manifest.json` and defines all actions, icons, and controller mappings. Plugin UUID: `xyz.jdotc.sonoscontroller`.

### Patterns

- Speaker state uses Vue `reactive()` as a store pattern (not Vuex/Pinia)
- Worker-based timers (`src/modules/common/timers.js`) to avoid plugin sleep issues
- Rate limiting on Sonos polling (max 3 updates per 10-second window)
- Base64 buffer encoding for Sonos favorite metadata
- SVG icon generation via snapsvg-cjs
