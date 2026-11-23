/* Off-Grid Power — calculation library.
   Classic script + Node (module.exports) for the tests. No dependencies.
   Formulas are also listed in the app's "How we calculate" section. */
(function (root) {
  "use strict";
  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
  /* Mid-month day-of-year used for the daylight-length profile (non-leap). */
  var MID_DOY = [15,45,74,105,135,166,196,227,258,288,319,349];

  function num(x, d) { x = +x; return isFinite(x) ? x : (d || 0); }
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function round(x, n) { var p = Math.pow(10, n == null ? 2 : n); return Math.round(x * p) / p; }

  /* ---------- battery pack ---------- */
  /* Ns in series raises voltage; Np in parallel raises amp-hours.
     Energy (Wh) = V_nom × Ah × Ns × Np. */
  function packV(vNom, ns) { return num(vNom) * Math.max(1, num(ns, 1)); }
  function packAh(ah, np) { return num(ah) * Math.max(1, num(np, 1)); }
  function packWh(vNom, ah, ns, np) { return packV(vNom, ns) * packAh(ah, np); }
  /* Usable DC energy at the bus. DoD and a temperature factor are fractions (0–1). */
  function usableWh(vNom, ah, ns, np, dod, tempDerate) {
    return packWh(vNom, ah, ns, np) * clamp(num(dod, 1), 0, 1) * clamp(num(tempDerate, 1), 0, 2);
  }

  /* ---------- loads ---------- */
  /* Daily AC watt-hours: qty × running watts × hours/day × duty cycle.
     Duty is the fraction of those hours the device actually draws running watts
     (DOE Energy Saver: a refrigerator plugged in 24 h typically runs about 1/3 of the time). */
  function itemDailyWh(it) {
    return num(it.qty, 1) * num(it.runW) * num(it.hours) * clamp(num(it.duty, 1), 0, 1);
  }
  function itemRunW(it) { return num(it.qty, 1) * num(it.runW); }
  function itemSurgeW(it) { return num(it.qty, 1) * num(it.surgeW, it.runW); }

  /* Peak running = sum of items marked simultaneous.
     Peak surge = for each item, (simultaneous running of the others + this item's surge);
     take the maximum. Same idea as Honda's / Generac's "add running watts, then add
     the single largest extra starting watts." */
  function loadTotals(items) {
    items = items || [];
    var dailyWh = 0, peakRun = 0, i, it, surgePeak = 0, startExtra = 0, worst = null;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      dailyWh += itemDailyWh(it);
      if (it.sim) peakRun += itemRunW(it);
    }
    for (i = 0; i < items.length; i++) {
      it = items[i];
      var others = peakRun - (it.sim ? itemRunW(it) : 0);
      var s = others + itemSurgeW(it);
      var extra = Math.max(0, itemSurgeW(it) - itemRunW(it));
      if (s > surgePeak) { surgePeak = s; worst = it; }
      if (extra > startExtra) startExtra = extra;
    }
    if (!items.length) surgePeak = 0;
    var maxItemRun = 0;
    for (i = 0; i < items.length; i++) maxItemRun = Math.max(maxItemRun, itemRunW(items[i]));
    return { dailyWh: dailyWh, peakRun: peakRun, peakSurge: surgePeak, startExtra: startExtra, worstStart: worst, maxItemRun: maxItemRun };
  }

  /* ---------- inverter path ---------- */
  /* DC watts drawn for a given AC load: P_dc = P_ac / η + P_idle.
     η is a fraction (e.g. 0.93). Idle is the inverter's zero-load self-consumption. */
  function dcWatts(acW, eta, idleW) {
    eta = clamp(num(eta, 1), 0.01, 1);
    return num(acW) / eta + num(idleW);
  }
  function dcAmps(acW, vBat, eta, idleW) {
    var v = num(vBat);
    if (v <= 0) return Infinity;
    return dcWatts(acW, eta, idleW) / v;
  }
  /* Hours a constant AC load can run from usable DC watt-hours.
     usable = hours × (load/η + idle)  =>  hours = usable / (load/η + idle). */
  function runtimeHours(usable, acW, eta, idleW) {
    var draw = dcWatts(acW, eta, idleW);
    if (draw <= 0) return Infinity;
    return num(usable) / draw;
  }

  /* ---------- Voc, NEC 690.7 ---------- */
  /* Manufacturer coefficient method (NEC 690.7 allows the module's published voltage-
     temperature coefficient). β is %/°C and is negative (e.g. −0.27).
     Voc_cold = Voc_stc × [1 + (β/100) × (T_cold − 25)]. */
  function vocColdCoeff(vocStc, betaPctPerC, tCold, tStc) {
    if (tStc == null) tStc = 25;
    return num(vocStc) * (1 + num(betaPctPerC) / 100 * (num(tCold) - tStc));
  }
  /* NEC Table 690.7(A) (2023), crystalline / multicrystalline silicon, excerpted in
     University of Maryland Extension EB-2023-0676, Table 3. Temperatures are ambient °C. */
  var NEC_6907A = [
    { lo: 20, hi: 24, k: 1.02 },
    { lo: 15, hi: 19, k: 1.04 },
    { lo: 10, hi: 14, k: 1.06 },
    { lo: 5,  hi: 9,  k: 1.08 },
    { lo: 0,  hi: 4,  k: 1.10 },
    { lo: -5, hi: -1, k: 1.12 },
    { lo: -10,hi: -6, k: 1.14 },
    { lo: -15,hi: -11,k: 1.16 },
    { lo: -20,hi: -16,k: 1.18 },
    { lo: -25,hi: -21,k: 1.20 },
    { lo: -30,hi: -26,k: 1.21 },
    { lo: -35,hi: -31,k: 1.23 },
    { lo: -40,hi: -36,k: 1.25 }
  ];
  function nec6907Factor(tC) {
    tC = num(tC);
    if (tC >= 25) return 1;
    var i, row;
    for (i = 0; i < NEC_6907A.length; i++) {
      row = NEC_6907A[i];
      if (tC >= row.lo && tC <= row.hi) return row.k;
    }
    /* Below −40 °C the table stops; do not invent an extrapolation. */
    if (tC < -40) return null;
    /* Between 24 and 25 °C: treat as 1.00 (STC is 25). */
    if (tC > 24 && tC < 25) return 1;
    return null;
  }
  function vocColdNEC(vocStc, tC) {
    var k = nec6907Factor(tC);
    if (k == null) return null;
    return num(vocStc) * k;
  }
  function stringVoc(vocModuleCold, ns) { return num(vocModuleCold) * Math.max(1, num(ns, 1)); }

  /* ---------- voltage drop & wire ---------- */
  /* Round-trip drop (V) = I × R_ohm_per_kft × (2 × one_way_ft) / 1000.
     R is NEC Chapter 9 Table 8, uncoated copper, DC resistance at 75 °C, ohm/kft, stranded. */
  function voltageDrop(amps, oneWayFt, ohmPerKft) {
    return num(amps) * num(ohmPerKft) * (2 * num(oneWayFt)) / 1000;
  }
  function voltageDropPct(amps, oneWayFt, ohmPerKft, vSys) {
    var v = num(vSys);
    if (v <= 0) return Infinity;
    return 100 * voltageDrop(amps, oneWayFt, ohmPerKft) / v;
  }

  /* Standard fuse/breaker sizes, NEC 240.6(A) (the common list). */
  var FUSE_SIZES = [15,20,25,30,35,40,45,50,60,70,80,90,100,110,125,150,175,200,225,250,300,350,400,450,500,600,700,800];
  function nextFuse(amps) {
    var a = num(amps), i;
    for (i = 0; i < FUSE_SIZES.length; i++) if (FUSE_SIZES[i] >= a - 1e-9) return FUSE_SIZES[i];
    return null;
  }

  /* ---------- charge controller ---------- */
  /* PWM: array current is Isc × parallel strings. NEC 690.8(A)(1) uses 125% of Isc
     for the maximum current of a PV source circuit. */
  function pwmArrayAmps(isc, np, factor) {
    if (factor == null) factor = 1.25;
    return num(isc) * Math.max(1, num(np, 1)) * factor;
  }
  /* MPPT charge current (battery side) ≈ (array watts × controller efficiency) / battery voltage. */
  function mpptChargeAmps(arrayW, vBat, etaCc) {
    var v = num(vBat);
    if (v <= 0) return Infinity;
    return num(arrayW) * clamp(num(etaCc, 1), 0.01, 1) / v;
  }

  /* ---------- solar harvest ---------- */
  /* Daily energy delivered to the DC bus (Wh) =
     array_W × PSH(kWh/m²/day) × derate × η_controller.
     PSH is already plane-of-array irradiation at the chosen tilt; 1 kWh/m²/day on a
     1 kW-STC array is 1 kWh before derates. */
  function harvestDayWh(arrayW, psh, derate, etaCc) {
    return num(arrayW) * num(psh) * clamp(num(derate, 1), 0, 2) * clamp(num(etaCc, 1), 0.01, 1);
  }

  /* Cooper (1969) declination, as used in Duffie & Beckman:
     δ = 23.45° × sin(360° × (284 + n) / 365), n = day of year. */
  function declinationDeg(n) {
    return 23.45 * Math.sin((Math.PI / 180) * 360 * (284 + num(n)) / 365);
  }
  /* Sunrise-to-sunset length (hours) at latitude φ, ignoring refraction.
     ωs = arccos(−tan φ tan δ);  day length = 2 ωs / 15.  Polar day/night clamped. */
  function dayLengthHours(latDeg, doy) {
    var phi = num(latDeg) * Math.PI / 180;
    var dec = declinationDeg(doy) * Math.PI / 180;
    var x = -Math.tan(phi) * Math.tan(dec);
    if (x >= 1) return 0;
    if (x <= -1) return 24;
    return 2 * (Math.acos(x) * 180 / Math.PI) / 15;
  }
  /* Half-sine irradiance shape whose integral over daylight equals PSH (kWh/m²).
     I(t) = Ipk × sin(π × (t − sunrise) / L),  Ipk = PSH × π / (2L).
     Returns kW/m² (numerically equal to sun-hours per hour). */
  function irradiance(hour, psh, dayLen) {
    var L = num(dayLen);
    if (L <= 0) return 0;
    var sunrise = 12 - L / 2, sunset = 12 + L / 2, t = num(hour);
    if (t <= sunrise || t >= sunset) return 0;
    var ipk = num(psh) * Math.PI / (2 * L);
    return ipk * Math.sin(Math.PI * (t - sunrise) / L);
  }

  /* Hourly SOC over `days`. loadWhHour[h] is AC watt-hours in hour h (0–23), repeated each day.
     SOC is stored energy remaining / usable, 0–1. Extra solar after the pack is full is curtailed. */
  function simulateSoc(o) {
    var usable = num(o.usableWh);
    var soc = clamp(num(o.startSoc, 1), 0, 1);
    var days = Math.max(1, num(o.days, 1) | 0);
    var psh = num(o.psh);
    var dayLen = dayLengthHours(o.lat, o.doy);
    var etaInv = clamp(num(o.etaInv, 1), 0.01, 1);
    var etaCc = clamp(num(o.etaCc, 1), 0.01, 1);
    var derate = clamp(num(o.derate, 1), 0, 2);
    var arrayW = num(o.arrayW);
    var idleW = num(o.idleW);
    var loadH = o.loadWhHour || [];
    var hours = [], h, d, ac, dcNeed, pv, t, curtailed = 0, deficit = 0, minSoc = soc;
    var startHour = o.startHour == null ? 0 : num(o.startHour);
    for (d = 0; d < days; d++) {
      for (h = 0; h < 24; h++) {
        ac = num(loadH[h]);
        dcNeed = dcWatts(ac, etaInv, idleW);
        /* Mid-hour irradiance (h+0.5) times 1 h. */
        pv = arrayW * derate * etaCc * irradiance(h + 0.5, psh, dayLen);
        var net = pv - dcNeed; /* Wh into the pack (can be negative) */
        var energy = soc * usable + net;
        if (energy > usable) { curtailed += energy - usable; energy = usable; }
        if (energy < 0) { deficit += -energy; energy = 0; }
        soc = usable > 0 ? energy / usable : 0;
        if (soc < minSoc) minSoc = soc;
        hours.push({ day: d, hour: h, t: d * 24 + h, soc: soc, pv: pv, loadAc: ac, dcNeed: dcNeed, net: net });
      }
    }
    return { hours: hours, endSoc: soc, minSoc: minSoc, curtailedWh: curtailed, deficitWh: deficit, dayLen: dayLen };
  }

  /* Default load shape: always-on energy spread evenly over 24 h; occasional (non-sim)
     energy placed in the 17:00–21:00 window (a planning assumption, not a measurement). */
  function loadProfile(items) {
    var hour = new Array(24), i, h, base = 0, eve = 0;
    for (i = 0; i < 24; i++) hour[i] = 0;
    (items || []).forEach(function (it) {
      var wh = itemDailyWh(it);
      if (it.sim) base += wh; else eve += wh;
    });
    for (h = 0; h < 24; h++) hour[h] += base / 24;
    /* Four evening hours 17–20 inclusive. */
    for (h = 17; h <= 20; h++) hour[h] += eve / 4;
    return hour;
  }

  /* ---------- surge check per item ---------- */
  function surgeCheck(it, items, invCont, invSurge) {
    var totals = loadTotals(items);
    var others = totals.peakRun - (it.sim ? itemRunW(it) : 0);
    var needSurge = others + itemSurgeW(it);
    var needRun = others + itemRunW(it);
    var okSurge = num(invSurge) >= needSurge;
    var okRun = num(invCont) >= needRun;
    return { needSurge: needSurge, needRun: needRun, okSurge: okSurge, okRun: okRun, ok: okSurge && okRun };
  }

  /* ---------- 12 / 24 / 48 V recommendation ---------- */
  /* Choose the lowest of 12, 24, 48 V where (a) 125% of continuous DC current is within
     one 4/0 AWG 75 °C copper conductor (230 A, NEC Table 310.16) and (b) voltage drop on
     the given one-way run with that 4/0 (0.0608 Ω/kft) is ≤ 3% (NEC 210.19(A) Informational
     Note on 3% branch-circuit drop). This is a documented method, not a marketing rule of thumb. */
  var AMP_4_0 = 230;
  var R_4_0 = 0.0608;
  var CONT_FACTOR = 1.25;
  /* Planning duty-peak factor on the 24 h average AC draw (daily Wh / 24).
     Same 125% figure as the continuous-current multiplier, used here so the
     inverter can cover a modest concentration of the day's energy above a flat
     average. Not a code requirement. */
  var DUTY_PEAK_FACTOR = 1.25;
  /* Hours/day (× duty) at or above which a non-simultaneous load gets a warning. */
  var HEAVY_HOURS = 4;
  function voltageOk(v, acW, eta, idleW, oneWayFt) {
    var i = dcAmps(acW, v, eta, idleW);
    var vd = voltageDropPct(i, oneWayFt, R_4_0, v);
    return { v: v, amps: i, amps125: i * CONT_FACTOR, vdPct: vd, okAmp: i * CONT_FACTOR <= AMP_4_0 + 1e-9, okVd: vd <= 3 };
  }
  function recommendVoltage(acW, eta, idleW, oneWayFt) {
    var vs = [12, 24, 48], i, r, pick = null, all = [];
    for (i = 0; i < vs.length; i++) {
      r = voltageOk(vs[i], acW, eta, idleW, oneWayFt);
      all.push(r);
      if (!pick && r.okAmp && r.okVd) pick = r;
    }
    return { chosen: pick ? pick.v : 48, all: all, fallback: !pick };
  }

  /* ---------- sizer ---------- */
  /* Inverter continuous floor (watts) = max of:
       1. peak running = sum of items marked simultaneous,
       2. the largest single item's running watts (qty included),
       3. (daily AC Wh / 24) × DUTY_PEAK_FACTOR (1.25).
     A system that cannot pass (1) or (2), or whose continuous rating × 24 is
     below the day's AC watt-hours, cannot serve the load as entered. */
  function inverterContinuous(o) {
    var peak = num(o.peakRun);
    var largest = num(o.maxItemRun);
    var avgW = num(o.dailyAcWh) / 24;
    var factor = o.dutyPeakFactor == null ? DUTY_PEAK_FACTOR : num(o.dutyPeakFactor);
    var peaked = avgW * factor;
    return {
      invCont: Math.max(peak, largest, peaked),
      peakRun: peak, maxItemRun: largest, avgW: avgW,
      dutyPeakW: peaked, factor: factor
    };
  }

  function heavyUnflagged(items, hoursFloor) {
    hoursFloor = hoursFloor == null ? HEAVY_HOURS : hoursFloor;
    return (items || []).filter(function (it) {
      return !it.sim && num(it.hours) * clamp(num(it.duty, 1), 0, 1) >= hoursFloor;
    });
  }

  /* Exact series-unit Ah such that usableWh == target (continuous Ah). */
  function ahExactForUsable(usableTarget, vNom, ns, np, dod, tempDerate) {
    var den = num(vNom) * Math.max(1, num(ns, 1)) * Math.max(1, num(np, 1)) *
      clamp(num(dod, 0.8), 0.01, 1) * clamp(num(tempDerate, 1), 0.01, 2);
    if (den <= 0) return Infinity;
    return num(usableTarget) / den;
  }
  /* Smallest integer Ah per series unit (given ns, np) with usable >= target. */
  function minimalAhForUsable(usableTarget, vNom, ns, np, dod, tempDerate) {
    var exact = ahExactForUsable(usableTarget, vNom, ns, np, dod, tempDerate);
    if (!isFinite(exact) || exact <= 0) return 0;
    var ah = Math.ceil(exact - 1e-9);
    return ah < 1 ? 1 : ah;
  }

  /* Usable battery DC Wh = (daily AC Wh / η + idle × 24) × days × margin.
     Nameplate Wh = usable / (DoD × temp). The two must be shown separately;
     Apply uses nameplate only once (or picks integer Ah so usable >= target).
     Minimum array W = daily DC need / (worst-month PSH × derate × η_cc).
     Inverter continuous = inverterContinuous() × (1.00 / 1.25 / 1.50 by tier).
     Surge = peak surge (simultaneous running + the largest extra start).
     MPPT controller A = array W × η_cc / pack V.
     Recommended margin 1.25 and comfortable 1.50 are planning margins, not a
     code requirement on kilowatt-hours. */
  function sizeSystem(o) {
    var eta = clamp(num(o.etaInv, 0.93), 0.01, 1);
    var dailyDc = num(o.dailyAcWh) / eta + num(o.idleW) * 24;
    var denom = clamp(num(o.dod, 0.8), 0.01, 1) * clamp(num(o.tempDerate, 1), 0.01, 2);
    var days = Math.max(0.1, num(o.days, 1));
    var psh = Math.max(0.05, num(o.pshWorst));
    var etaCc = clamp(num(o.etaCc, 1), 0.01, 1);
    var der = clamp(num(o.derate, 1), 0.01, 2) * etaCc;
    var packV = Math.max(1, num(o.packV, 48));
    var inv = inverterContinuous(o);
    function tier(margin, name) {
      var usable = dailyDc * days * margin;
      var nameplate = usable / denom;
      var arrayW = dailyDc * margin / (psh * der);
      var invCont = inv.invCont * (name === "Minimum" ? 1 : margin);
      return {
        name: name, margin: margin,
        usableWh: usable, usableKwh: usable / 1000,
        nameplateWh: nameplate, nameplateKwh: nameplate / 1000,
        arrayW: arrayW,
        invCont: invCont,
        invSurge: num(o.peakSurge),
        ccAmp: arrayW * etaCc / packV
      };
    }
    return {
      dailyDc: dailyDc, inv: inv,
      min: tier(1, "Minimum"), rec: tier(1.25, "Recommended"), comf: tier(1.5, "Comfortable")
    };
  }

  /* ---------- rating 0–100 ---------- */
  /* Start at 100. Fail −18, warn −8, each, floored at 0. The deductions are documented
     here and in the app so the score is not a black box. */
  function rateSystem(checks) {
    var score = 100, i, c, fails = 0, warns = 0;
    for (i = 0; i < checks.length; i++) {
      c = checks[i];
      if (c.level === "fail") { score -= 18; fails++; }
      else if (c.level === "warn") { score -= 8; warns++; }
    }
    return { score: clamp(Math.round(score), 0, 100), fails: fails, warns: warns, checks: checks };
  }

  /* 125% continuous-current multiplier used on DC amps (NEC 690.8 / 215.3 style). */
  function withContinuousFactor(amps) { return num(amps) * CONT_FACTOR; }

  var api = {
    MONTHS: MONTHS, MONTH_DAYS: MONTH_DAYS, MID_DOY: MID_DOY, NEC_6907A: NEC_6907A,
    FUSE_SIZES: FUSE_SIZES, CONT_FACTOR: CONT_FACTOR, DUTY_PEAK_FACTOR: DUTY_PEAK_FACTOR,
    HEAVY_HOURS: HEAVY_HOURS, AMP_4_0: AMP_4_0, R_4_0: R_4_0,
    num: num, clamp: clamp, round: round,
    packV: packV, packAh: packAh, packWh: packWh, usableWh: usableWh,
    inverterContinuous: inverterContinuous, heavyUnflagged: heavyUnflagged,
    ahExactForUsable: ahExactForUsable, minimalAhForUsable: minimalAhForUsable,
    itemDailyWh: itemDailyWh, itemRunW: itemRunW, itemSurgeW: itemSurgeW, loadTotals: loadTotals,
    dcWatts: dcWatts, dcAmps: dcAmps, runtimeHours: runtimeHours,
    vocColdCoeff: vocColdCoeff, nec6907Factor: nec6907Factor, vocColdNEC: vocColdNEC, stringVoc: stringVoc,
    voltageDrop: voltageDrop, voltageDropPct: voltageDropPct, nextFuse: nextFuse,
    pwmArrayAmps: pwmArrayAmps, mpptChargeAmps: mpptChargeAmps,
    harvestDayWh: harvestDayWh,
    declinationDeg: declinationDeg, dayLengthHours: dayLengthHours, irradiance: irradiance,
    simulateSoc: simulateSoc, loadProfile: loadProfile,
    surgeCheck: surgeCheck, voltageOk: voltageOk, recommendVoltage: recommendVoltage,
    sizeSystem: sizeSystem, rateSystem: rateSystem, withContinuousFactor: withContinuousFactor
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OffGridMath = api;
})(typeof window !== "undefined" ? window : this);
