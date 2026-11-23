# OffGrid Power

Plan how to power a house when the grid is down: build a load, test a battery, inverter and solar array, and see runtime, a worst-month energy balance, starting-watt checks and a plain-English system rating.

- Static files only. No build step, no network requests, no cookies, no tracking.
- Open `index.html` directly (file://) or serve the folder; both work.
- Every preset wattage and every PSH value is sourced and cited in the app. Hours/day that are only starter values are flagged. There is no invented “typical” presented as a measurement.
- Saved setups stay in this browser's localStorage. Export or import a JSON file (a Blob download and a file input — no fetch).

## Tests

```bash
node tests/math.test.js
```

Created by Jorge Guerra
