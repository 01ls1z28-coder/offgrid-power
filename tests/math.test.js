/* Off-Grid Power — hand-check tests. No dependencies: node tests/math.test.js */
var M = require("../js/math.js");
var D = require("../js/data.js");
var P = require("../js/psh.js");

var pass = 0, fail = 0;
function near(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-9 : eps); }
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; console.log("FAIL", name, detail == null ? "" : detail); }
}
function eq(a, b, name, eps) { ok(near(a, b, eps), name, a + " !== " + b); }

/* 1. Runtime: usable 2,000 Wh, 100 W AC, η = 0.90, idle 0.
   hours = 2000 / (100/0.9) = 18. */
eq(M.runtimeHours(2000, 100, 0.9, 0), 18, "runtime 2000 Wh / 100 W / 0.9 η");
/* With 20 W idle: draw = 100/0.9 + 20 = 131.111..., hours = 2000/131.111... */
eq(M.runtimeHours(2000, 100, 0.9, 20), 2000 / (100 / 0.9 + 20), "runtime with idle", 1e-9);

/* 2. Daily Wh: 2 × 200 W × 24 h × 1/3 duty = 3,200 Wh. */
eq(M.itemDailyWh({ qty: 2, runW: 200, hours: 24, duty: 1/3 }), 3200, "fridge-style daily Wh");

/* 3. Load totals / surge (Honda-style).
   Fridge 200 run / 1600 surge, simultaneous; microwave 1500, not simultaneous.
   Peak run = 200. Peak surge = max(1600, 200+1500) = 1700. */
(function () {
  var t = M.loadTotals([
    { qty: 1, runW: 200, surgeW: 1600, hours: 24, duty: 1/3, sim: true },
    { qty: 1, runW: 1500, surgeW: 1500, hours: 0.25, duty: 1, sim: false }
  ]);
  eq(t.dailyWh, 200 * 24 / 3 + 1500 * 0.25, "combined daily Wh", 1e-9);
  eq(t.peakRun, 200, "peak running (simultaneous only)");
  eq(t.peakSurge, 1700, "peak surge = fridge start or microwave on top of fridge");
})();

/* 4. Pack energy: 12 V 100 Ah, 4S 2P = 48 V, 200 Ah, 9,600 Wh.
   Usable at 80% DoD and temp 1.0 = 7,680 Wh. */
eq(M.packV(12, 4), 48, "pack V");
eq(M.packAh(100, 2), 200, "pack Ah");
eq(M.packWh(12, 100, 4, 2), 9600, "pack Wh");
eq(M.usableWh(12, 100, 4, 2, 0.8, 1), 7680, "usable Wh");

/* 5. Voc cold, manufacturer coefficient.
   40 V, β = −0.27 %/°C, T = −20 °C:
   40 × [1 + (−0.27/100)×(−20−25)] = 40 × [1 + 0.1215] = 44.86. */
eq(M.vocColdCoeff(40, -0.27, -20), 44.86, "Voc cold, manufacturer β", 1e-12);

/* 6. NEC Table 690.7(A). −20 °C is the −16 to −20 band, factor 1.18.
   40 × 1.18 = 47.2. String of 3 = 141.6. */
eq(M.nec6907Factor(-20), 1.18, "NEC 690.7(A) at −20 °C");
eq(M.nec6907Factor(25), 1, "NEC 690.7(A) at 25 °C is 1.00");
eq(M.nec6907Factor(-40), 1.25, "NEC 690.7(A) at −40 °C");
ok(M.nec6907Factor(-41) === null, "NEC 690.7(A) does not invent a factor below −40 °C");
eq(M.vocColdNEC(40, -20), 47.2, "Voc × 1.18", 1e-12);
eq(M.stringVoc(47.2, 3), 141.6, "string Voc", 1e-12);
eq(M.nec6907Factor(0), 1.10, "NEC 690.7(A) at 0 °C");
eq(M.nec6907Factor(-25), 1.20, "NEC 690.7(A) at −25 °C");

/* 7. Voltage drop. 100 A, 10 ft one way, 2 AWG 0.194 Ω/kft:
   Vd = 100 × 0.194 × 20 / 1000 = 0.388 V. On 48 V: 0.8083...%. */
eq(M.voltageDrop(100, 10, 0.194), 0.388, "voltage drop volts", 1e-12);
eq(M.voltageDropPct(100, 10, 0.194, 48), 0.388 / 48 * 100, "voltage drop percent", 1e-12);
eq(D.wireByAwg("2").ohm, 0.194, "Table 8, 2 AWG");
eq(D.wireByAwg("4/0").ohm, 0.0608, "Table 8, 4/0 AWG");
eq(D.wireByAwg("4/0").amp75, 230, "Table 310.16, 4/0 75 °C");

/* 8. PSH harvest. 1,000 W × 4.4 h × 0.86 × 0.98 = 3,711.2 Wh. */
eq(M.harvestDayWh(1000, 4.4, 0.86, 0.98), 1000 * 4.4 * 0.86 * 0.98, "PSH harvest", 1e-12);

/* 9. Controller currents. PWM: 10 A Isc × 2 strings × 1.25 = 25 A.
   MPPT: 2,000 W × 0.98 / 48 V = 40.833... A. */
eq(M.pwmArrayAmps(10, 2, 1.25), 25, "PWM Isc × np × 1.25");
eq(M.mpptChargeAmps(2000, 48, 0.98), 2000 * 0.98 / 48, "MPPT charge amps", 1e-12);

/* 10. Inverter DC current. 3,000 W AC, 48 V, 0.93 η, 20 W idle:
   (3000/0.93 + 20) / 48. */
eq(M.dcAmps(3000, 48, 0.93, 20), (3000 / 0.93 + 20) / 48, "inverter DC amps", 1e-12);
eq(M.withContinuousFactor(100), 125, "125% continuous factor");

/* 11. Surge check. Inverter 3,000 / 6,000 W, fridge 200/1600 + base 0. */
(function () {
  var items = [{ qty: 1, runW: 200, surgeW: 1600, hours: 24, duty: 1, sim: true, name: "fridge" }];
  var c = M.surgeCheck(items[0], items, 3000, 6000);
  ok(c.ok && c.needSurge === 1600 && c.needRun === 200, "inverter starts the fridge");
  var no = M.surgeCheck(items[0], items, 3000, 1000);
  ok(!no.ok && !no.okSurge, "inverter surge too small");
})();

/* 12. Sizer tiers. Daily 5,000 Wh AC, η 0.9, idle 0, DoD 0.8, temp 1, 2 days,
   worst PSH 3, derate 0.86, η_cc 1.
   dailyDc = 5000/0.9.
   Min battery = dailyDc × 2 / 0.8.
   Min array = dailyDc / (3 × 0.86).
   Recommended × 1.25, comfortable × 1.50. */
(function () {
  var z = M.sizeSystem({ dailyAcWh: 5000, peakRun: 1000, peakSurge: 2000, pshWorst: 3, derate: 0.86, etaCc: 1, etaInv: 0.9, idleW: 0, dod: 0.8, tempDerate: 1, days: 2 });
  var dailyDc = 5000 / 0.9;
  eq(z.dailyDc, dailyDc, "sizer daily DC", 1e-9);
  eq(z.min.batteryWh, dailyDc * 2 / 0.8, "sizer min battery", 1e-9);
  eq(z.min.arrayW, dailyDc / (3 * 0.86), "sizer min array", 1e-9);
  eq(z.rec.batteryWh, z.min.batteryWh * 1.25, "sizer recommended 1.25", 1e-9);
  eq(z.comf.arrayW, z.min.arrayW * 1.5, "sizer comfortable 1.50", 1e-9);
  eq(z.min.invCont, 1000, "sizer min inverter = peak run");
  eq(z.rec.invCont, 1250, "sizer recommended inverter 1.25 × peak");
})();

/* 13. Rating deductions. */
(function () {
  var r = M.rateSystem([
    { level: "ok", text: "a" },
    { level: "warn", text: "b" },
    { level: "fail", text: "c" }
  ]);
  eq(r.score, 100 - 8 - 18, "rating 100 − 8 − 18");
  eq(r.fails, 1, "fail count");
  eq(r.warns, 1, "warn count");
  var z = M.rateSystem([]);
  for (var i = 0; i < 10; i++) z = M.rateSystem(z.checks.concat([{ level: "fail", text: "x" }]));
  /* rebuild */
  var many = [];
  for (i = 0; i < 10; i++) many.push({ level: "fail", text: "x" });
  eq(M.rateSystem(many).score, 0, "rating floors at 0");
})();

/* 14. 12/24/48 V recommendation: 3,000 W, 0.9 η, 0 idle, 10 ft.
   12 V: I = 3000/0.9/12 = 277.8 A, ×1.25 = 347 > 230, so 12 V fails ampacity.
   24 V: I = 138.9, ×1.25 = 173.6 < 230. Drop with 4/0: 138.9×0.0608×20/1000/24 ×100 ≈ 0.70% < 3%.
   So 24 V is the lowest that passes. */
(function () {
  var r = M.recommendVoltage(3000, 0.9, 0, 10);
  eq(r.chosen, 24, "recommend 24 V for a 3 kW inverter on a short run");
  ok(!r.all[0].okAmp, "12 V fails 4/0 ampacity at 3 kW");
  ok(r.all[1].okAmp && r.all[1].okVd, "24 V passes");
})();

/* 15. Day length at the equator is 12 h on any day (Cooper declination, no refraction). */
eq(M.dayLengthHours(0, 15), 12, "equator mid-January day length", 1e-9);
eq(M.dayLengthHours(0, 172), 12, "equator mid-June day length", 1e-9);
/* Declination at n = 81 (approx March 22) is near 0. */
ok(Math.abs(M.declinationDeg(81)) < 1, "declination near 0 around day 81", M.declinationDeg(81));

/* 16. Half-sine irradiance integrates to PSH (1-hour mid-point sum ≈ integral).
   For L = 12 h, PSH = 6, Ipk = 6 π / (2×12) = π/4.
   Summing I(h+0.5) over the 12 daylight hours should be close to 6. */
(function () {
  var L = 12, psh = 6, s = 0, h;
  for (h = 0; h < 24; h++) s += M.irradiance(h + 0.5, psh, L);
  ok(near(s, psh, 0.02), "irradiance hourly sum ≈ PSH", s);
  eq(M.irradiance(12, 6, 12), 6 * Math.PI / (2 * 12), "noon irradiance = Ipk", 1e-12);
  eq(M.irradiance(3, 6, 12), 0, "before sunrise irradiance is 0");
})();

/* 17. SOC: no load, some sun, pack starts full — stays full, curtailment > 0.
    Full load, no sun — SOC falls, deficit eventually. */
(function () {
  var full = M.simulateSoc({ usableWh: 1000, startSoc: 1, days: 1, psh: 5, lat: 0, doy: 15, arrayW: 500, derate: 1, etaCc: 1, etaInv: 1, idleW: 0, loadWhHour: new Array(24).fill(0) });
  eq(full.endSoc, 1, "no load, starts full, stays full", 1e-12);
  ok(full.curtailedWh > 0, "surplus solar is curtailed when the pack is full", full.curtailedWh);
  var dark = M.simulateSoc({ usableWh: 1000, startSoc: 1, days: 2, psh: 0, lat: 0, doy: 15, arrayW: 0, derate: 1, etaCc: 1, etaInv: 1, idleW: 0, loadWhHour: new Array(24).fill(100) });
  /* 100 Wh each hour × 24 h × 2 days = 4,800 Wh, pack 1,000 Wh → deficit 3,800, end SOC 0. */
  eq(dark.endSoc, 0, "unlit pack is emptied");
  ok(near(dark.deficitWh, 4800 - 1000, 1e-6), "deficit = load − usable", dark.deficitWh);
})();

/* 18. Fuse list: 125 A request → 125; 126 → 150. */
eq(M.nextFuse(125), 125, "fuse exact 125");
eq(M.nextFuse(126), 150, "fuse next 150");
eq(M.nextFuse(15), 15, "fuse 15");

/* 19. JSON round-trip of a setup object (the save/export shape). */
(function () {
  var s = { v: 1, name: "Test", items: [{ uid: "a", name: "Fridge", runW: 200, surgeW: 1600, hours: 24, duty: 1/3, qty: 1, sim: true }],
    chem: "lifepo4", vNom: 12, ah: 100, ns: 4, np: 1, etaInv: 0.93, idleW: 20, arrayW: 2000, tilt: "lat", stationId: 94846, derate: 0.86 };
  var t = JSON.parse(JSON.stringify(s));
  ok(t.name === s.name && t.items[0].runW === 200 && t.stationId === 94846 && t.items.length === 1, "JSON round-trip preserves the setup");
  ok(near(M.itemDailyWh(t.items[0]), 1600, 1e-9), "round-tripped item still computes 1,600 Wh");
})();

/* 20. PSH table integrity: 239 stations, Chicago latitude-tilt year average 4.4,
    Anchorage 3.0, matching published annual summaries of the same NREL manual. */
(function () {
  eq(P.STATIONS.length, 239, "239 NREL stations");
  var chi = P.STATIONS.filter(function (s) { return s.name === "Chicago" && s.st === "IL"; })[0];
  var anc = P.STATIONS.filter(function (s) { return s.name === "Anchorage" && s.st === "AK"; })[0];
  ok(!!chi && !!anc, "Chicago and Anchorage are present");
  var year = function (s) { return s.psh.lat.reduce(function (a, b) { return a + b; }, 0) / 12; };
  eq(Math.round(year(chi) * 10) / 10, 4.4, "Chicago latitude-tilt year average 4.4");
  eq(Math.round(year(anc) * 10) / 10, 3.0, "Anchorage latitude-tilt year average 3.0");
  ok(chi.psh.lat.length === 12 && chi.psh[0].length === 12, "five tilts, 12 months");
  /* Every month in range for a mid-latitude station. */
  ok(chi.psh.lat.every(function (x) { return x >= 0.5 && x <= 10; }), "Chicago monthly PSH in a plausible range");
})();

/* 21. DOE fridge duty is exactly 1/3 in the library. */
(function () {
  var f = D.loadById("fridge-es");
  eq(f.duty, 1/3, "ENERGY STAR fridge duty is 1/3");
  eq(f.surgeW, 1200, "Honda ENERGY STAR fridge surge 1,200 W");
  eq(D.loadById("kettle").hours, 1, "DOE kettle example hours = 1");
  eq(D.loadById("kettle").runW, 1500, "DOE kettle 1,500 W");
  eq(D.loadById("o2-everflo").runW, 350, "EverFlo 350 W");
  eq(D.loadById("cpap-hum").runW, 22, "AirSense 10 + humidifier 22 W");
  eq(D.loadById("well-1").runW, 1000, "Honda 1 hp induction 1,000 W running");
  eq(D.loadById("well-1").surgeW, 3000, "Honda 1 hp induction 3,000 W starting");
})();

console.log("PASS " + pass + "  FAIL " + fail);
if (fail) process.exit(1);
