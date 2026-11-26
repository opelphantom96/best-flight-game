# AURORA CARGO — freight over the fjords, under the lights

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/opelphantom96/best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/opelphantom96/best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A 3D cargo plane flies over an arctic fjord at dawn, under a moving aurora.
Thread gold rings between the ice cliffs, pick up cargo low over the home
strip, and land it on a glowing ice strip at the far fjord — before the
storm arrives. Clouds ice the wings, the wind pushes you sideways, and the
fuel gauge is always a decision.

## How to play

Five deliveries, further and stormier each time. Fly through every gold
ring (+50, +6s), swoop low over the home strip to load cargo, then land on
the destination strip with the skis out and gently — landing without skis,
or too hard, or in the water, ends the flight. Finish all five missions to
win: CARGO DELIVERED — DAWN OVER THE FJORDS.

## Controls

- **W / S** or **↑ / ↓** — throttle (need ≥35% to stay up)
- **A / D** or **← / →** — turn
- **Mouse** — pitch (up = climb)
- **Space** — air brake / flare for landing
- **L** — skis out / in (required for landing)
- **Enter** — start / next mission
- **P** — pause, **R** — restart, **M** — mute

## Run it

`node serve.ts` serves `game/` on http://localhost:8080. No build step,
no network: the game is static files, three.js vendored under
`game/vendor/three/`.
