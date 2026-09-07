# Design QA — CyberDice

## Comparison target

- Source visual truth: `tmp/reference/design/e31c58c5-5586-4229-88c4-8791c72703df.png` (1536 × 1024)
- Implementation: `http://127.0.0.1:8931/tmp/sim/index.html`, browser-rendered device content at 336 × 480 CSS px, density 1.
- Compared states: READY 1D6, dice-type selection, RESULT 2D6, and sensor-fallback READY.
- Normalization: the source is a multi-screen presentation board, so comparison used its internal handband-screen composition and the simulator's 336 × 480 device region; outer presentation canvas and hardware bezel were excluded.

## Evidence

- READY: browser render shows a 336 × 480 black canvas, title/time header, 148px 3D die, instruction, and full-width mode row.
- Navigation: simulator function-entry screen is browser-verified; source contract tests confirm home only binds right swipe, leaving left swipe to the system and up/down unbound.
- Result: browser render confirmed `6 + 1 =` with large total `7` inside the blue tick ring.
- Fallback: injected sensor failure rendered `传感器不可用 · 点击掷骰`; tap rolling remains available.
- Browser console: no errors or warnings observed during the verification run.

## Findings and fixes

- Earlier P1 — top-right history/settings glyphs were 20px images inside 34px hit areas. Fixed by removing them from the home page; the home page only opens the function entry on right swipe, while settings and history are full-row entries inside it. Left swipe remains reserved for system exit.
- App navigation — all in-app page-header back buttons have been removed. System left swipe is the only return affordance; the function list's browser scrollbar track is hidden while its content remains scrollable.
- Earlier P1 — settings toggles required a small control hit target. Fixed by making the entire setting row toggle its value.
- Earlier P2 — multi-die results repeated the total in one small line. Fixed by showing the individual dice expression plus a large total.
- Earlier P2 — sensor errors could be visually overwritten by READY copy. Fixed by retaining an explicit fallback flag until a later successful lifecycle restart.

## Required fidelity surfaces

- Typography: source and implementation use strong white display numerals and high-contrast Chinese labels. The simulator confirms no wrapping in the checked states.
- Spacing and layout rhythm: the implementation uses the project's native 336 × 480 grid, 52px header, 16px horizontal margins, 148px die, and 56px mode row. The removed icon row gives the main die more breathing room.
- Colors and tokens: black background, deep-gray cards, white foreground, and blue result ticks/accent match the reference direction.
- Image quality and assets: six 297px static dice assets plus four 297px deterministic shake-residue assets are used directly; no substitute CSS or text-drawn asset was introduced.
- Copy and content: READY, rolling, result, and sensor-fallback copy are short and state-specific.

## Follow-up polish

- P3: validate the 20px multi-die expression on a physical Band 9 Pro; increase it only if it is not readable at normal wrist distance.
- P3: verify Vela's native `swipe` event does not compete with system back gestures on the target firmware; simulator validation cannot replace this physical-device check.

## Final result

final result: browser and automated checks passed; the physical Band 9 Pro gesture-priority and readability checks remain required.
