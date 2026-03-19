# StreamDeck Sonos Controller

## Overview

Control Sonos speakers from your Elgato Stream Deck. Supports keys and encoder dials. Built on the original work by [GenericMale](https://github.com/GenericMale/streamdeck-sonos/).

## Features

- Control multiple Sonos speakers and groups from a single Stream Deck
- Currently Playing display with album art
- Group volume and mute support
- Subnet-based device discovery
- Encoder dial control for Volume, Bass, and Treble
- Marquee titles for track and album names
- Configurable volume step, polling interval, and timeout durations

## Installation

Download the latest plugin release [here](https://github.com/jgchristopher/streamdeck-sonoscontroller/releases). Open the downloaded `.streamDeckPlugin` file and it will install automatically.

## Initial Setup

![Initial Setup](./doc/initial_setup.png)

1. Drag any Sonos Controller action onto your Stream Deck
2. In the Property Inspector, expand **Global Settings**
3. Enter your network subnet (e.g., `192.168.1`) and click **Discover**, or type a known Sonos device IP directly into **Primary Device Address**
4. Click **Save and Connect**

The plugin queries that device's zone topology to find all speakers and groups on your network.

UPnP must be enabled in the Sonos app for discovery to work: **Settings > System > Network > UPnP**.

## Configuring Actions

![Select Sonos Speaker](./doc/select_sonos_speaker.png)

Each button gets its own speaker assignment. The speaker selector shows both individual speakers and groups in an accordion layout.

- Groups display as `Speaker Name [Group: N]` where N is the member count
- Satellite speakers (surround channels in a 5.1 setup) are hidden by default. Enable **Show Satellite Speakers** in Global Settings to display them with a satellite icon
- A filter field lets you search by name or Sonos Speaker ID
- When targeting a group, the **Apply volume/mute to entire group** toggle controls whether commands affect the full group or just the coordinator speaker (enabled by default)

### Display Options

Different actions support different display options:

| Option | Available On |
|--------|-------------|
| State Based Title | Toggle Mute, Toggle Play/Pause, Toggle Play Mode, Toggle Input Source, Volume Up, Volume Down, Play Next Track, Play Previous Track |
| Display Marquee Title | Play Sonos Favorite, Currently Playing |
| Display Marquee Album Title | Toggle Play/Pause, Currently Playing |
| Display Album Art | Toggle Play/Pause, Play Sonos Favorite, Currently Playing |

### Global Settings

- **Device Check Interval**: How often the plugin polls speaker status (default: 10 seconds)
- **Device Timeout Duration**: Timeout for device commands (default: 5 seconds)
- **Show Satellite Speakers**: Show satellite speakers (surround channels) in the speaker selector (default: off)

## Supported Actions

### Currently Playing

Displays the current track, album art, and playback state. Pressing the key triggers a manual status refresh. Keypad only.

### Toggle Mute

Toggles mute state between muted and unmuted.

### Toggle Play/Pause

Switches between playing, paused, and stopped states.

### Toggle Play Mode

Cycles through enabled play modes:

- **Normal**: Sequential playback
- **Shuffle_NoRepeat**: Random order, no repeats
- **Shuffle_Repeat_One**: Loops current track, shuffles the rest
- **Shuffle**: Random order with repeats
- **Repeat_One**: Loops current track
- **Repeat_All**: Loops entire playlist

![Toggle Play Modes](./doc/toggle_play_modes.png)

You can uncheck any mode you do not want in the rotation.

### Toggle Input Source

Switches between Sonos Queue, TV Input, and Line-In.

### Play Next Track

Skips to the next track in the queue.

### Play Previous Track

Returns to the previous track in the queue.

### Volume Up / Volume Down

Adjusts volume by a configurable step size (default: 10, range: 1 to 50).

### Play Sonos Favorite

![Select Sonos Favorite](./doc/select_sonos_favorite.png)

Plays a designated Sonos favorite. Supports album art display.

### Audio Equalizer

Encoder-only action. Adjust Volume, Bass, and Treble using a Stream Deck encoder dial.

## Troubleshooting

**No Sonos devices found**: Verify your subnet is correct and that UPnP is enabled in the Sonos app (Settings > System > Network > UPnP).

**Timeout errors**: Increase the Device Timeout Duration in Global Settings.

**Stale speaker list**: Click "Save and Reconnect" to re-query the network.

**Rate limiting**: The plugin limits status polling to 3 updates per 10-second window per speaker. If a speaker shows as rate limited, it will recover automatically.

**Missing speakers**: If a speaker does not appear in the selector, it may be a satellite (surround channel). Enable **Show Satellite Speakers** in Global Settings to see all devices.

## Contributing

Submit issues or pull requests on [GitHub](https://github.com/jgchristopher/streamdeck-sonoscontroller).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
