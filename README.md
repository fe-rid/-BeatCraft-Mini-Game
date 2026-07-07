# BeatCraft

BeatCraft is a colorful, browser-based rhythm game that puts you in the flow of fast, satisfying beat-matching. Tap falling notes in four lanes, build combos, and clear increasingly challenging levels without any setup or installation.

## Overview

This project is a lightweight single-page game built with HTML, CSS, and JavaScript. It combines arcade-style visuals with simple rhythm gameplay for a quick and fun experience on desktop or mobile.

## Features

- 9 unlockable levels with rising BPM and difficulty
- Four-lane gameplay with keyboard or touch controls
- Score, combo, accuracy, and life tracking
- Perfect, good, and miss feedback
- Pause/resume support and reduced-motion toggle
- Bright, playful UI with animated results and progress tracking

## How to Play

1. Open the game in your browser.
2. Choose a level from the level select screen.
3. Watch the notes fall down the lanes.
4. Press the matching key or tap the lane when the note reaches the target line.
5. Keep your combo going and aim for high accuracy to earn a better score.

## Controls

- Keyboard: D, F, J, K
- Touch: Tap the on-screen lane buttons
- Space: Pause or resume
- Escape: Quit the current run

## Run Locally

You can play the game immediately by opening [index.html](index.html) in a browser.

If you prefer a local server, run:

```bash
python -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Project Structure

- [index.html](index.html) — complete game UI, styling, and logic
- [README.md](README.md) — project overview and instructions

## Notes

BeatCraft is fully self-contained, so there is no build step, package install, or dependency setup required.
