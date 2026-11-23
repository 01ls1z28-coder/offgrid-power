# OffGrid Power

Plan how to power a house when the grid is down: build a load, test a battery, inverter and solar array, and see runtime, a worst-month energy balance, starting-watt checks and a plain-English system rating.

- Static files only. No build step, no network requests, no cookies, no tracking.
- Open `index.html` directly (file://) or serve the folder; both work.
- Every preset wattage and every PSH value is sourced and cited in the app. Hours/day that are only starter values are flagged. There is no invented “typical” presented as a measurement.
- Saved setups stay in this browser's localStorage. Export or import a JSON file (a Blob download and a file input — no fetch).


## Quick start and sizer

Three chips on the Loads page — Essentials only, Medical + fridge, and Whole house lite — each load a cited preset list and a Recommended-tier starter system sized for Chicago’s worst month (NREL station 94846, latitude tilt, December PSH 2.5). How that system is chosen is under How we calculate in the app.

Each sizer tier lists usable battery energy (what the load can draw) and nameplate energy (usable ÷ DoD ÷ temperature factor) separately. Apply sets the smallest integer amp-hours that meets the usable target and does not divide by depth of discharge twice.

## Tests

```bash
node tests/math.test.js
```

Created by Jorge Guerra
