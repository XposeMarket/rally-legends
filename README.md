# Rally Legends

Browser rally sim on **real-world stages**. Play: https://rally-legends.vercel.app

- 9 stages baked from real roads (OpenStreetMap via OSRM) + real terrain (AWS Terrain Tiles): Col de Turini (Monte-Carlo, night, snow/ice tarmac), Colin's Crest (Sweden, snow), Ouninpohja (Finland, gravel), Brenig (Wales, mud/rain), Hell's Gate (Kenya, dirt), Loutraki (Greece, rocky), Vizzavona (Corsica, tarmac), Monte-Carlo Streets (city), Pikes Peak (tarmac/gravel).
- 9 cars from Mini Cooper S to GR Yaris Rally1: AWD/RWD/FWD, real torque curves, gear ratios, diffs.
- Physics: rigid body, 4-corner suspension with ARBs and digressive dampers, combined-slip tyre model per surface, tyre compounds, turbo lag/anti-lag, centre/axle diffs, hydraulic handbrake, aero, damage, rollovers, obstacle collisions.
- Generated co-driver pace notes (1-6 scale, hairpins, crests, tightens/opens) with voice.
- Championship, records, rivals, splits. Keyboard, gamepad, touch (wheel/buttons/tilt).

Controls: arrows/WASD, Space handbrake, Q/E shift (G toggles manual), C camera, R recover, Esc pause.

Rebuild stages: `npm i && node tools/bake.mjs && node tools/previews.mjs`. Tests: `node tools/phys-bench.mjs`, `node tools/phys-test.mjs <stage> <car>`.
