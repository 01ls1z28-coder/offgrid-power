/* Off-Grid Power — table UI. Classic script, works from file://. No fetch, no modules. */
(function () {
  "use strict";
  var M = window.OffGridMath, D = window.OffGridData, P = window.OffGridPSH;
  var $ = function (id) { return document.getElementById(id); };
  var STORE = "offgridpower-setups";

  function uid() { return "i" + Math.random().toString(36).slice(2, 9); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function parseNum(s) {
    if (s == null || s === "") return null;
    var x = parseFloat(String(s).replace(/,/g, ""));
    return isFinite(x) ? x : null;
  }
  function fmt(x, d) {
    if (x == null || !isFinite(x)) return "—";
    if (Math.abs(x) >= 1000) return Math.round(x).toLocaleString("en-US");
    return M.round(x, d == null ? 1 : d).toLocaleString("en-US");
  }
  function fmtKwh(wh) { return fmt(wh / 1000, 2) + " kWh"; }
  function fmtWh(wh) { return Math.abs(wh) >= 1000 ? (wh < 0 ? "−" : "") + fmtKwh(Math.abs(wh)) : fmt(wh, 0) + " Wh"; }
  function fmtHrs(h) {
    if (!isFinite(h)) return "∞";
    if (h >= 48) return fmt(h / 24, 1) + " days";
    return fmt(h, 1) + " h";
  }

  var S = {
    items: [],
    cat: "kitchen",
    chem: "lifepo4",
    vNom: 12, ah: 100, ns: 4, np: 1,
    bmsCont: 100, bmsPeak: 200,
    dod: 0.8, rte: 0.95, tempDerate: 1,
    invCont: 3000, invSurge: 6000, invSecs: 5, etaInv: 0.93, idleW: 20,
    wave: "pure", split: 0,
    stationId: null, tilt: "lat", pshManual: "",
    arrayW: 2000, wp: "", voc: "", isc: "", betaVoc: "",
    nsMod: 1, npMod: 1,
    derate: D.PVWATTS_DERATE, tCold: -20,
    ccType: "mppt", ccVoc: 150, ccAmp: 60, etaCc: 0.98,
    genW: "", chgA: "", fuelGalH: "",
    wireFt: 10,
    targetDays: 2, simDays: 3,
    saveName: ""
  };

  function station() { return S.stationId ? P.byId(S.stationId) : null; }
  function pshMonth(st, monthIdx) {
    if (S.pshManual !== "" && S.pshManual != null && isFinite(+S.pshManual)) {
      var v = +S.pshManual; var a = [];
      for (var i = 0; i < 12; i++) a[i] = v;
      return monthIdx == null ? a : v;
    }
    if (!st) return monthIdx == null ? null : null;
    var row = st.psh[S.tilt] || st.psh.lat;
    return monthIdx == null ? row : row[monthIdx];
  }
  function arrayWatts() {
    var w = M.num(S.arrayW);
    var wp = parseNum(S.wp);
    if (wp && wp > 0) return wp * Math.max(1, S.nsMod) * Math.max(1, S.npMod);
    return w;
  }
  function pack() {
    return {
      v: M.packV(S.vNom, S.ns),
      ah: M.packAh(S.ah, S.np),
      wh: M.packWh(S.vNom, S.ah, S.ns, S.np),
      usable: M.usableWh(S.vNom, S.ah, S.ns, S.np, S.dod, S.tempDerate)
    };
  }

  /* ---------- sections ---------- */
  document.querySelectorAll(".secnav button").forEach(function (b) {
    b.addEventListener("click", function () { showSec(b.getAttribute("data-sec")); });
  });
  function showSec(id) {
    ["loads","equip","results","sizer","compare","how"].forEach(function (s) {
      $("sec-" + s).hidden = s !== id;
    });
    document.querySelectorAll(".secnav button").forEach(function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-sec") === id);
    });
    if (id === "results" || id === "sizer" || id === "equip") renderAll();
    window.scrollTo(0, 0);
  }

  /* ---------- loads ---------- */
  function renderCats() {
    var box = $("cats"); box.textContent = "";
    D.CATS.forEach(function (c) {
      var b = el("button", "chip-btn" + (S.cat === c.id ? " is-on" : ""), c.name);
      b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", S.cat === c.id ? "true" : "false");
      b.addEventListener("click", function () { S.cat = c.id; renderCats(); renderPresets(); });
      box.appendChild(b);
    });
  }
  function renderPresets() {
    var box = $("presets"); box.textContent = "";
    D.LOADS.filter(function (p) { return p.cat === S.cat; }).forEach(function (p) {
      var b = el("button", "chip-btn");
      b.type = "button";
      b.innerHTML = "";
      b.appendChild(document.createTextNode(p.name));
      b.title = p.note || "";
      b.addEventListener("click", function () { addLoad(p); });
      box.appendChild(b);
    });
  }
  function addLoad(p) {
    var it = {
      uid: uid(), srcId: p.id || "custom", name: p.name, cat: p.cat || "kitchen",
      runW: p.runW, surgeW: p.surgeW, hours: p.hours, duty: p.duty, qty: p.qty || 1,
      sim: !!p.sim, volts: p.volts || 120, note: p.note || "", flag: p.flag || "",
      src: p.src || "", custom: !!p.custom
    };
    S.items.push(it);
    renderLoads();
  }
  $("add-custom").addEventListener("click", function () {
    addLoad({ name: "Custom item", cat: S.cat, runW: 100, surgeW: 100, hours: 1, duty: 1, sim: false, volts: 120,
      note: "Enter running watts, starting watts and hours from the nameplate or a meter.", flag: "Custom — numbers are yours.", custom: true, src: "" });
  });

  function stepper(val, step, min, onChange) {
    var wrap = el("div", "stepper");
    var minus = el("button", "step", "−"); minus.type = "button"; minus.setAttribute("aria-label", "Decrease");
    var inp = el("input"); inp.type = "text"; inp.inputMode = "decimal"; inp.value = String(val);
    var plus = el("button", "step", "+"); plus.type = "button"; plus.setAttribute("aria-label", "Increase");
    function set(v) { if (min != null && v < min) v = min; inp.value = String(v); onChange(v); }
    minus.addEventListener("click", function () { set((parseNum(inp.value) || 0) - step); });
    plus.addEventListener("click", function () { set((parseNum(inp.value) || 0) + step); });
    inp.addEventListener("change", function () { var v = parseNum(inp.value); if (v == null) v = min || 0; set(v); });
    wrap.appendChild(minus); wrap.appendChild(inp); wrap.appendChild(plus);
    return wrap;
  }
  function field(label, value, unit, onChange, opts) {
    var cell = el("div", "num-cell" + (opts && opts.span2 ? " span2" : ""));
    var lb = el("label", "lbl", label);
    var f = el("div", "field");
    var inp = el("input"); inp.type = "text"; inp.inputMode = opts && opts.text ? "text" : "decimal"; inp.value = value == null || value === "" ? "" : String(value);
    inp.setAttribute("aria-label", label);
    inp.addEventListener("change", function () { onChange(opts && opts.text ? inp.value : parseNum(inp.value)); });
    f.appendChild(inp);
    if (unit) f.appendChild(el("span", "field-sym", unit));
    cell.appendChild(lb); cell.appendChild(f);
    if (opts && opts.hint) cell.appendChild(el("p", "hint" + (opts.flag ? " hl" : ""), opts.hint));
    return cell;
  }

  function renderLoads() {
    var box = $("load-list"); box.textContent = "";
    if (!S.items.length) box.appendChild(el("p", "hint", "No loads yet. Add presets above, or a custom item. Totals stay at zero until you do."));
    S.items.forEach(function (it, idx) {
      var card = el("div", "load-card");
      var top = el("div", "load-top");
      var left = el("div");
      var title = it.custom ? null : el("h3", "", it.name);
      if (it.custom) {
        var nf = el("div", "field"); var ni = el("input"); ni.type = "text"; ni.value = it.name; ni.setAttribute("aria-label", "Item name");
        ni.addEventListener("change", function () { it.name = ni.value; });
        nf.appendChild(ni); left.appendChild(nf);
      } else left.appendChild(title);
      top.appendChild(left);
      var rm = el("button", "icon-x", "×"); rm.type = "button"; rm.setAttribute("aria-label", "Remove " + it.name);
      rm.addEventListener("click", function () { S.items.splice(idx, 1); renderLoads(); });
      top.appendChild(rm);
      card.appendChild(top);
      var grid = el("div", "num-grid");
      grid.appendChild(field("Quantity", it.qty, "×", function (v) { it.qty = Math.max(1, v || 1); renderLoadTot(); }));
      grid.appendChild(field("Running", it.runW, "W", function (v) { it.runW = v || 0; renderLoadTot(); }));
      grid.appendChild(field("Starting / surge", it.surgeW, "W", function (v) { it.surgeW = v == null ? it.runW : v; renderLoadTot(); }));
      grid.appendChild(field("Hours / day", it.hours, "h", function (v) { it.hours = v || 0; renderLoadTot(); }, { flag: !!it.flag, hint: it.flag && /hour|h\/day|starter/i.test(it.flag) ? it.flag : "" }));
      grid.appendChild(field("Duty cycle", M.round(it.duty, 3), "×", function (v) { it.duty = M.clamp(v == null ? 1 : v, 0, 1); renderLoadTot(); }));
      var simc = el("div", "num-cell");
      var lab = el("label", "toggle");
      var cb = el("input"); cb.type = "checkbox"; cb.checked = !!it.sim;
      cb.addEventListener("change", function () { it.sim = cb.checked; renderLoadTot(); });
      lab.appendChild(cb); lab.appendChild(document.createTextNode("On at the same time (counts toward peak running watts)"));
      simc.appendChild(el("span", "lbl", "Simultaneous")); simc.appendChild(lab);
      grid.appendChild(simc);
      card.appendChild(grid);
      var src = "";
      if (it.src && D.SOURCES[it.src]) src = D.SOURCES[it.src].name;
      if (it.note) src = (src ? src + " " : "") + it.note;
      if (it.flag) src = (src ? src + " " : "") + "Flag: " + it.flag;
      if (src) card.appendChild(el("p", "load-src", src));
      var daily = M.itemDailyWh(it);
      card.appendChild(el("p", "hint", "Daily " + fmtWh(daily) + (it.volts === 240 ? " · 240 V" : "")));
      box.appendChild(card);
    });
    renderLoadTot();
  }
  function renderLoadTot() {
    var t = M.loadTotals(S.items);
    $("load-tot").innerHTML = "";
    function ro(k, v, s) { var d = el("div", "ro"); d.appendChild(el("span", "ro-k", k)); d.appendChild(el("span", "ro-v mono", v)); if (s) d.appendChild(el("span", "ro-s", s)); $("load-tot").appendChild(d); }
    ro("Daily energy", fmtWh(t.dailyWh), "Sum of running watts × hours × duty × quantity");
    ro("Peak running", fmt(t.peakRun, 0) + " W", "Items marked simultaneous");
    ro("Peak surge", fmt(t.peakSurge, 0) + " W", t.worstStart ? ("Worst start: " + t.worstStart.name) : "");
    ro("Items", String(S.items.length), "");
    $("load-hint").textContent = t.dailyWh ? "" : "Add at least one load to see runtime and a size recommendation.";
  }

  /* ---------- equipment ---------- */
  function setSeg(box, val, attr, fn) {
    box.querySelectorAll("button").forEach(function (b) {
      var v = b.getAttribute(attr);
      b.classList.toggle("is-on", String(v) === String(val));
    });
    if (fn) box.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { fn(b.getAttribute(attr)); };
    });
  }
  function renderChem() {
    var box = $("chem"); box.textContent = "";
    D.CHEM.forEach(function (c) {
      var b = el("button", S.chem === c.id ? "is-on" : "", c.name); b.type = "button"; b.setAttribute("data-v", c.id);
      b.addEventListener("click", function () {
        S.chem = c.id; S.dod = c.dod; S.rte = c.rte; renderEquip();
      });
      box.appendChild(b);
    });
    var c = D.chemById(S.chem);
    $("chem-note").textContent = c ? (c.dodNote + (c.flag ? " Flagged: typical design value, confirm with your manual." : "") + " Default DoD " + Math.round(c.dod * 100) + "%.") : "";
  }
  function renderEquip() {
    renderChem();
    setSeg($("vnom"), S.vNom, "data-v", function (v) { S.vNom = +v; renderEquip(); });
    setSeg($("wave"), S.wave, "data-v", function (v) { S.wave = v; });
    setSeg($("split"), S.split, "data-v", function (v) { S.split = +v; });
    setSeg($("tilt"), S.tilt, "data-v", function (v) { S.tilt = v; renderCityNote(); });
    setSeg($("cc-type"), S.ccType, "data-v", function (v) { S.ccType = v; });

    var bg = $("bat-grid"); bg.textContent = "";
    bg.appendChild(field("Amp-hours of one battery", S.ah, "Ah", function (v) { S.ah = v || 0; renderBatRead(); }));
    bg.appendChild(field("In series", S.ns, "S", function (v) { S.ns = Math.max(1, v || 1); renderBatRead(); }));
    bg.appendChild(field("In parallel", S.np, "P", function (v) { S.np = Math.max(1, v || 1); renderBatRead(); }));
    bg.appendChild(field("Usable depth of discharge", S.dod, "×", function (v) { S.dod = M.clamp(v == null ? 0.8 : v, 0, 1); renderBatRead(); }));
    bg.appendChild(field("Round-trip efficiency", S.rte, "×", function (v) { S.rte = M.clamp(v == null ? 0.95 : v, 0.01, 1); }));
    bg.appendChild(field("Temperature capacity factor", S.tempDerate, "×", function (v) { S.tempDerate = v == null ? 1 : v; renderBatRead(); }, { hint: "1.00 means no derate. Enter a colder-weather factor from your battery manual if you have one — this tool does not invent one." }));
    bg.appendChild(field("BMS continuous", S.bmsCont, "A", function (v) { S.bmsCont = v || 0; }));
    bg.appendChild(field("BMS peak", S.bmsPeak, "A", function (v) { S.bmsPeak = v || 0; }));
    renderBatRead();

    var ig = $("inv-grid"); ig.textContent = "";
    ig.appendChild(field("Continuous power", S.invCont, "W", function (v) { S.invCont = v || 0; }));
    ig.appendChild(field("Surge power", S.invSurge, "W", function (v) { S.invSurge = v || 0; }));
    ig.appendChild(field("Surge duration", S.invSecs, "s", function (v) { S.invSecs = v || 0; }, { hint: "Seconds the inverter can hold surge, from the datasheet. Used as a note, not a thermal model." }));
    ig.appendChild(field("Efficiency", S.etaInv, "×", function (v) { S.etaInv = M.clamp(v == null ? 0.93 : v, 0.01, 1); }, { hint: "Starter 0.93 — replace with the CEC or mid-load figure on your datasheet." }));
    ig.appendChild(field("Idle / zero-load draw", S.idleW, "W", function (v) { S.idleW = v || 0; }, { hint: "Starter 20 W — enter the published self-consumption of your inverter." }));
    ig.appendChild(field("One-way battery-to-inverter cable", S.wireFt, "ft", function (v) { S.wireFt = v || 0; }));

    renderCities();
    var pg = $("pv-grid"); pg.textContent = "";
    pg.appendChild(field("Total array (STC)", S.arrayW, "W", function (v) { S.arrayW = v || 0; }, { hint: "Or fill module watts and string counts below, which then override this." }));
    pg.appendChild(field("Module watts (optional)", S.wp, "Wp", function (v) { S.wp = v; }));
    pg.appendChild(field("Modules in series", S.nsMod, "S", function (v) { S.nsMod = Math.max(1, v || 1); }));
    pg.appendChild(field("Strings in parallel", S.npMod, "P", function (v) { S.npMod = Math.max(1, v || 1); }));
    pg.appendChild(field("Module Voc (STC)", S.voc, "V", function (v) { S.voc = v; }, { hint: "From the module label. Leave blank to skip the cold-Voc check rather than guess." }));
    pg.appendChild(field("Module Isc (STC)", S.isc, "A", function (v) { S.isc = v; }));
    pg.appendChild(field("Voc temp. coefficient β", S.betaVoc, "%/°C", function (v) { S.betaVoc = v; }, { hint: "A negative number, for example −0.27. From the datasheet. Leave blank to skip the coefficient method." }));
    pg.appendChild(field("Coldest expected ambient", S.tCold, "°C", function (v) { S.tCold = v == null ? -20 : v; }, { hint: "NEC 690.7 points at ASHRAE extreme annual mean minimum design dry-bulb. Enter the value for your site." }));
    pg.appendChild(field("System derate (PVWatts default 0.86)", S.derate, "×", function (v) { S.derate = v == null ? 0.86 : v; }));
    pg.appendChild(field("Manual PSH override", S.pshManual, "h/day", function (v) { S.pshManual = v == null ? "" : v; renderCityNote(); }, { hint: "Leave blank to use the NREL monthly table. If filled, every month uses this figure (for example a PVWatts result you already ran)." }));

    var cg = $("cc-grid"); cg.textContent = "";
    cg.appendChild(field("Max PV voltage", S.ccVoc, "V", function (v) { S.ccVoc = v || 0; }));
    cg.appendChild(field("Max charge current", S.ccAmp, "A", function (v) { S.ccAmp = v || 0; }));
    cg.appendChild(field("Controller efficiency", S.etaCc, "×", function (v) { S.etaCc = M.clamp(v == null ? 0.98 : v, 0.01, 1); }, { hint: "MPPT controllers often publish ~97–99%. PWM is often lower. Enter the datasheet figure. Starter 0.98 is labeled as such." }));

    var gg = $("gen-grid"); gg.textContent = "";
    gg.appendChild(field("Generator running watts", S.genW, "W", function (v) { S.genW = v; }));
    gg.appendChild(field("Charger current into the battery", S.chgA, "A", function (v) { S.chgA = v; }));
    gg.appendChild(field("Fuel use (if sourced)", S.fuelGalH, "gal/h", function (v) { S.fuelGalH = v; }, { hint: "Only if you have a manual figure. Nothing is estimated here." }));
  }
  function renderBatRead() {
    var p = pack();
    $("bat-read").innerHTML = "";
    function ro(k, v, s) { var d = el("div", "ro"); d.appendChild(el("span", "ro-k", k)); d.appendChild(el("span", "ro-v mono", v)); if (s) d.appendChild(el("span", "ro-s", s)); $("bat-read").appendChild(d); }
    ro("Pack voltage", fmt(p.v, 1) + " V", S.ns + "S" + S.np + "P");
    ro("Pack capacity", fmt(p.ah, 0) + " Ah", "");
    ro("Nameplate energy", fmtKwh(p.wh), "");
    ro("Usable energy", fmtKwh(p.usable), "After DoD and temperature factor");
  }
  function renderCities() {
    var box = $("quick-cities"); box.textContent = "";
    D.QUICK_CITIES.forEach(function (q) {
      var st = P.search(q.name).filter(function (s) { return s.st === q.st && s.name.toLowerCase() === q.name.toLowerCase(); })[0]
        || P.search(q.name).filter(function (s) { return s.st === q.st; })[0];
      if (!st) return;
      var b = el("button", "chip-btn" + (S.stationId === st.id ? " is-on" : ""), q.name + ", " + q.st);
      b.type = "button";
      b.addEventListener("click", function () { S.stationId = st.id; renderCities(); renderCityNote(); $("city-q").value = st.name + ", " + st.st; });
      box.appendChild(b);
    });
    renderCityNote();
  }
  $("city-q").addEventListener("input", function () {
    var q = $("city-q").value, list = $("city-list");
    list.textContent = "";
    if (!q.trim()) { list.hidden = true; return; }
    var hits = P.search(q).slice(0, 20);
    if (!hits.length) { list.hidden = true; return; }
    hits.forEach(function (s) {
      var b = el("button", S.stationId === s.id ? "is-on" : "", s.name + ", " + s.st + "  (" + s.lat + "°N)");
      b.type = "button";
      b.addEventListener("click", function () {
        S.stationId = s.id; $("city-q").value = s.name + ", " + s.st; list.hidden = true; renderCities();
      });
      list.appendChild(el("li")).appendChild(b);
    });
    list.hidden = false;
  });
  function renderCityNote() {
    var st = station();
    var man = S.pshManual !== "" && isFinite(+S.pshManual);
    if (man) { $("city-src").textContent = "Using your manual PSH of " + S.pshManual + " h/day for every month."; return; }
    if (!st) { $("city-src").textContent = "Pick a station, or enter a manual PSH. The table is NREL/TP-463-5607, 1961–1990 monthly means, south-facing fixed flat-plate."; return; }
    var row = pshMonth(st);
    var worst = Math.min.apply(null, row), wi = row.indexOf(worst);
    $("city-src").textContent = st.name + ", " + st.st + " · " + st.lat + "°N, " + st.elev + " m  ·  " +
      "latitude-tilt year average (for reference) uses the chosen tilt's monthly values. Worst month at this tilt: " +
      M.MONTHS[wi] + " " + worst + " kWh/m²/day. Source: NREL Solar Radiation Data Manual (NREL/TP-463-5607).";
  }

  /* ---------- results ---------- */
  function worstMonth(row) {
    if (!row) return null;
    var i = 0, w = 0, m = row[0];
    for (i = 1; i < 12; i++) if (row[i] < m) { m = row[i]; w = i; }
    return { i: w, psh: m };
  }
  function buildChecks(p, t, st, row) {
    var checks = [], aw = arrayWatts(), v = p.v;
    var dailyDc = t.dailyWh / Math.max(0.01, S.etaInv) + S.idleW * 24;
    var w = row ? worstMonth(row) : null;
    var harvestW = w ? M.harvestDayWh(aw, w.psh, S.derate, S.etaCc) : null;
    /* energy */
    if (!t.dailyWh) checks.push({ level: "warn", text: "No loads yet, so energy balance and runtime are empty." });
    if (w && harvestW != null) {
      var gap = harvestW - dailyDc;
      if (gap >= 0) checks.push({ level: "ok", text: "Worst month (" + M.MONTHS[w.i] + ", PSH " + w.psh + ") harvests " + fmtWh(harvestW) + " to the DC bus versus " + fmtWh(dailyDc) + " needed — a surplus of " + fmtWh(gap) + "." });
      else if (gap > -0.25 * dailyDc) checks.push({ level: "warn", text: "Worst month (" + M.MONTHS[w.i] + ") is short by " + fmtWh(-gap) + " (" + fmt(100 * -gap / dailyDc, 0) + "%). A generator or a larger array would close the gap." });
      else checks.push({ level: "fail", text: "Worst month (" + M.MONTHS[w.i] + ") harvests only " + fmtWh(harvestW) + " against " + fmtWh(dailyDc) + " needed — more than a 25% shortfall." });
    } else if (t.dailyWh) checks.push({ level: "warn", text: "Pick an NREL station or enter a manual PSH to check the monthly energy balance." });
    /* autonomy */
    var hours = M.runtimeHours(p.usable, t.dailyWh ? t.dailyWh / 24 : 0, S.etaInv, S.idleW);
    var days = t.dailyWh ? p.usable / dailyDc : Infinity;
    if (t.dailyWh) {
      if (days >= S.targetDays) checks.push({ level: "ok", text: "Usable battery energy covers about " + fmt(days, 1) + " days at this load (target " + S.targetDays + ")." });
      else if (days >= 0.7 * S.targetDays) checks.push({ level: "warn", text: "About " + fmt(days, 1) + " days of autonomy, short of the " + S.targetDays + "-day target." });
      else checks.push({ level: "fail", text: "About " + fmt(days, 1) + " days of autonomy, well short of the " + S.targetDays + "-day target." });
    }
    /* inverter continuous / surge */
    if (t.peakRun > S.invCont) checks.push({ level: "fail", text: "Inverter continuous rating " + fmt(S.invCont, 0) + " W is below peak running load " + fmt(t.peakRun, 0) + " W." });
    else if (t.peakRun > 0.9 * S.invCont) checks.push({ level: "warn", text: "Peak running load is " + fmt(100 * t.peakRun / Math.max(1, S.invCont), 0) + "% of the inverter's continuous rating." });
    else if (t.peakRun) checks.push({ level: "ok", text: "Peak running load " + fmt(t.peakRun, 0) + " W is within the inverter's " + fmt(S.invCont, 0) + " W continuous rating." });
    if (t.peakSurge > S.invSurge) checks.push({ level: "fail", text: "Inverter surge rating " + fmt(S.invSurge, 0) + " W is below peak surge " + fmt(t.peakSurge, 0) + " W. A motor (well pump, fridge, AC) may not start." });
    else if (t.peakSurge) checks.push({ level: "ok", text: "Peak surge " + fmt(t.peakSurge, 0) + " W is within the inverter's " + fmt(S.invSurge, 0) + " W surge rating." });
    if (S.wave === "modified" && S.items.some(function (it) { return /pump|fridge|freezer|air conditioner|cpap|oxygen|furnace/i.test(it.name); })) {
      checks.push({ level: "warn", text: "Modified sine wave is selected. Motors, some medical devices and many electronics prefer or require a pure sine inverter — check each nameplate." });
    }
    if (S.items.some(function (it) { return it.volts === 240; }) && !S.split) {
      checks.push({ level: "fail", text: "A 240 V load is on the list, but the inverter is set to 120 V only. Use a split-phase or 240 V inverter, or drop those loads." });
    }
    /* Voc */
    var voc = parseNum(S.voc), beta = parseNum(S.betaVoc);
    if (voc && voc > 0) {
      var nec = M.vocColdNEC(voc, S.tCold);
      var coeff = (beta != null) ? M.vocColdCoeff(voc, beta, S.tCold) : null;
      var necS = nec != null ? M.stringVoc(nec, S.nsMod) : null;
      var coS = coeff != null ? M.stringVoc(coeff, S.nsMod) : null;
      function vocLine(label, vs) {
        if (vs == null) return;
        if (vs > S.ccVoc) checks.push({ level: "fail", text: label + " string Voc " + fmt(vs, 1) + " V exceeds the controller maximum of " + fmt(S.ccVoc, 0) + " V at " + S.tCold + " °C." });
        else if (vs > 0.9 * S.ccVoc) checks.push({ level: "warn", text: label + " string Voc " + fmt(vs, 1) + " V is within 10% of the controller maximum " + fmt(S.ccVoc, 0) + " V." });
        else checks.push({ level: "ok", text: label + " string Voc " + fmt(vs, 1) + " V is under the controller maximum " + fmt(S.ccVoc, 0) + " V." });
      }
      vocLine("NEC 690.7(A)", necS);
      vocLine("Manufacturer coefficient", coS);
      if (nec == null && S.tCold < -40) checks.push({ level: "warn", text: "NEC Table 690.7(A) stops at −40 °C. Use the manufacturer coefficient method for colder sites, or do not invent a factor." });
    } else {
      checks.push({ level: "warn", text: "Module Voc is blank, so the cold string-voltage check was not run. Enter Voc from the label to check it." });
    }
    /* controller current */
    var isc = parseNum(S.isc);
    if (S.ccType === "pwm") {
      if (isc && isc > 0) {
        var ia = M.pwmArrayAmps(isc, S.npMod, 1.25);
        if (ia > S.ccAmp) checks.push({ level: "fail", text: "PWM array current Isc × parallels × 1.25 = " + fmt(ia, 1) + " A, above the controller's " + fmt(S.ccAmp, 0) + " A rating." });
        else checks.push({ level: "ok", text: "PWM array current Isc × parallels × 1.25 = " + fmt(ia, 1) + " A, within the controller's " + fmt(S.ccAmp, 0) + " A rating." });
      } else checks.push({ level: "warn", text: "Module Isc is blank, so the PWM current check was not run." });
    } else {
      var im = M.mpptChargeAmps(aw, v, S.etaCc);
      if (im > S.ccAmp) checks.push({ level: "fail", text: "MPPT charge current ≈ " + fmt(im, 1) + " A (array W × η / battery V) exceeds the controller's " + fmt(S.ccAmp, 0) + " A rating." });
      else if (aw) checks.push({ level: "ok", text: "MPPT charge current ≈ " + fmt(im, 1) + " A, within the controller's " + fmt(S.ccAmp, 0) + " A rating." });
    }
    /* BMS / wire */
    var iDc = M.dcAmps(Math.max(t.peakRun, 1), v, S.etaInv, S.idleW);
    var i125 = M.withContinuousFactor(iDc);
    if (S.bmsCont && i125 > S.bmsCont) checks.push({ level: "fail", text: "Inverter DC current × 1.25 = " + fmt(i125, 1) + " A, above the BMS continuous rating of " + fmt(S.bmsCont, 0) + " A." });
    else if (S.bmsCont && iDc > 0.9 * S.bmsCont) checks.push({ level: "warn", text: "Inverter DC current " + fmt(iDc, 1) + " A is close to the BMS continuous rating " + fmt(S.bmsCont, 0) + " A (125% value is " + fmt(i125, 1) + " A)." });
    else if (S.bmsCont) checks.push({ level: "ok", text: "Inverter DC current " + fmt(iDc, 1) + " A (× 1.25 = " + fmt(i125, 1) + " A) is within the BMS continuous rating " + fmt(S.bmsCont, 0) + " A." });
    var cRate = p.ah > 0 ? iDc / p.ah : 0;
    var cLim = S.chem === "lifepo4" || S.chem === "nmc" ? 1 : 0.2;
    if (cRate > cLim) checks.push({ level: "warn", text: "C-rate " + fmt(cRate, 2) + " C is above the planning cap of " + cLim + " C for this chemistry. Confirm continuous current with your battery manual." });
    else if (p.ah) checks.push({ level: "ok", text: "C-rate " + fmt(cRate, 2) + " C is within the planning cap of " + cLim + " C for this chemistry." });
    /* 240 dryer flag */
    if (S.items.some(function (it) { return it.srcId === "dryer-elec" || /dryer/i.test(it.name) && it.runW >= 4000; })) {
      checks.push({ level: "warn", text: "An electric clothes dryer is on the list. It is a very large 240 V load (Honda 5,400 W running). Many off-grid plans omit it or use a gas dryer." });
    }
    return checks;
  }

  function pickWire(amps125, v, ft) {
    var i, w, ok = null, note = "";
    for (i = 0; i < D.WIRES.length; i++) {
      w = D.WIRES[i];
      var vd = M.voltageDropPct(amps125 / 1.25, ft, w.ohm, v);
      if (w.amp75 + 1e-9 >= amps125 && vd <= 3) { ok = { wire: w, vd: vd, amps: amps125 / 1.25 }; break; }
    }
    if (!ok) {
      w = D.WIRES[D.WIRES.length - 1];
      ok = { wire: w, vd: M.voltageDropPct(amps125 / 1.25, ft, w.ohm, v), amps: amps125 / 1.25, short: true };
    }
    var fuse = M.nextFuse(amps125);
    if (fuse && fuse > ok.wire.amp75) { note = "The next 240.6(A) size at 125% current is " + fuse + " A, which is above this wire's 75 °C ampacity. Step up a size, parallel conductors, or shorten the run — a licensed electrician applies the adopted code."; fuse = null; }
    return { wire: ok.wire, vd: ok.vd, fuse: fuse, short: !!ok.short, note: note };
  }

  function renderResults() {
    var p = pack(), t = M.loadTotals(S.items), st = station(), row = pshMonth(st);
    var checks = buildChecks(p, t, st, row);
    var rated = M.rateSystem(checks);
    var cls = rated.fails ? "fail" : rated.warns ? "warn" : "ok";
    $("score-box").innerHTML = "";
    var n = el("div", "score-num " + cls, String(rated.score));
    var side = el("div");
    side.appendChild(el("p", "hint", "System rating · start at 100, minus 18 for each fail and 8 for each warn."));
    var chips = el("div", "chips-row");
    chips.appendChild(el("span", "chip " + cls, rated.fails ? "Fail" : rated.warns ? "Warn" : "Pass"));
    chips.appendChild(el("span", "chip info", rated.fails + " fail · " + rated.warns + " warn"));
    side.appendChild(chips);
    $("score-box").appendChild(n); $("score-box").appendChild(side);
    var ul = $("checks"); ul.textContent = "";
    checks.forEach(function (c) {
      var li = el("li");
      li.appendChild(el("span", "tag " + c.level, c.level));
      li.appendChild(el("span", "", c.text));
      ul.appendChild(li);
    });

    $("res-tot").innerHTML = "";
    var dailyDc = t.dailyWh / Math.max(0.01, S.etaInv) + S.idleW * 24;
    var days = t.dailyWh ? p.usable / dailyDc : Infinity;
    function ro(k, v, s, kind) { var d = el("div", "ro" + (kind ? " " + kind : "")); d.appendChild(el("span", "ro-k", k)); d.appendChild(el("span", "ro-v mono", v)); if (s) d.appendChild(el("span", "ro-s", s)); $("res-tot").appendChild(d); }
    ro("Usable battery", fmtKwh(p.usable), p.v + " V pack");
    ro("Daily AC load", fmtWh(t.dailyWh), "");
    ro("Daily DC need", fmtWh(dailyDc), "Load / η + idle × 24");
    ro("Autonomy", fmtHrs(days * 24), "Usable ÷ daily DC need");

    /* runtime table */
    var rt = $("run-tbl"); rt.innerHTML = "<thead><tr><th>Load</th><th>W</th><th>Wh/d</th><th>Alone</th></tr></thead>";
    var tb = el("tbody");
    var allH = M.runtimeHours(p.usable, t.dailyWh ? t.dailyWh / 24 : 0, S.etaInv, S.idleW);
    var tr0 = el("tr"); tr0.appendChild(el("th", "", "Whole set (average watts)")); tr0.appendChild(el("td", "mono", fmt(t.dailyWh / 24, 0))); tr0.appendChild(el("td", "mono", fmt(t.dailyWh, 0))); tr0.appendChild(el("td", "mono", fmtHrs(allH)));
    tb.appendChild(tr0);
    S.items.forEach(function (it) {
      var run = M.itemRunW(it);
      var h = M.runtimeHours(p.usable, run, S.etaInv, S.idleW);
      var tr = el("tr");
      tr.appendChild(el("th", "", it.name + (it.qty > 1 ? " ×" + it.qty : "")));
      tr.appendChild(el("td", "mono", fmt(run, 0)));
      tr.appendChild(el("td", "mono", fmt(M.itemDailyWh(it), 0)));
      tr.appendChild(el("td", "mono", fmtHrs(h)));
      tb.appendChild(tr);
    });
    rt.appendChild(tb);

    /* monthly harvest */
    renderMonthChart(row, dailyDc);
    var mt = $("month-tbl"); mt.innerHTML = "<thead><tr><th>Month</th><th>PSH</th><th>Harvest</th><th>Balance</th></tr></thead>";
    var mtb = el("tbody");
    if (row) {
      row.forEach(function (psh, i) {
        var hv = M.harvestDayWh(arrayWatts(), psh, S.derate, S.etaCc);
        var tr = el("tr");
        tr.appendChild(el("th", "", M.MONTHS[i]));
        tr.appendChild(el("td", "mono", fmt(psh, 1)));
        tr.appendChild(el("td", "mono", fmtWh(hv)));
        tr.appendChild(el("td", "mono", (hv - dailyDc >= 0 ? "+" : "") + fmtWh(hv - dailyDc)));
        mtb.appendChild(tr);
      });
    } else {
      var tr = el("tr"); tr.appendChild(el("th", "", "—")); tr.appendChild(el("td", "", "Pick a location")); tr.appendChild(el("td", "", "")); tr.appendChild(el("td", "", "")); mtb.appendChild(tr);
    }
    mt.appendChild(mtb);

    /* SOC */
    var w = row ? worstMonth(row) : null;
    var stn = station();
    var lat = stn ? stn.lat : 35;
    var psh = w ? w.psh : (parseNum(S.pshManual) || 0);
    $("soc-hint").textContent = w
      ? ("Profile for " + M.MONTHS[w.i] + " at this site (PSH " + psh + " kWh/m²/day, mid-month daylight from latitude " + lat + "°N). Always-on energy is flat; occasional loads sit in 17:00–21:00 — a planning shape, not a measured profile. The pack starts full.")
      : "Pick a location (or enter manual PSH) to draw the SOC profile. The half-sine daylight shape and the evening occasional-load window are documented planning assumptions.";
    if (psh > 0 && p.usable > 0) {
      var sim = M.simulateSoc({
        usableWh: p.usable, startSoc: 1, days: S.simDays, psh: psh, lat: lat,
        doy: M.MID_DOY[w ? w.i : 0], arrayW: arrayWatts(), derate: S.derate, etaCc: S.etaCc,
        etaInv: S.etaInv, idleW: S.idleW, loadWhHour: M.loadProfile(S.items)
      });
      renderSocChart(sim);
    } else { $("soc-chart").textContent = ""; }

    /* surge table */
    var stbl = $("surge-tbl"); stbl.innerHTML = "<thead><tr><th>Load</th><th>Start W</th><th>Run W</th><th>Verdict</th></tr></thead>";
    var stb = el("tbody");
    S.items.forEach(function (it) {
      var c = M.surgeCheck(it, S.items, S.invCont, S.invSurge);
      var tr = el("tr");
      tr.appendChild(el("th", "", it.name));
      tr.appendChild(el("td", "mono", fmt(c.needSurge, 0) + " W"));
      tr.appendChild(el("td", "mono", fmt(c.needRun, 0) + " W"));
      tr.appendChild(el("td", "", c.ok ? "Starts" : (!c.okSurge ? "Surge short" : "Continuous short")));
      stb.appendChild(tr);
    });
    stbl.appendChild(stb);

    /* wire */
    var iDc = M.dcAmps(Math.max(t.peakRun, 0), p.v, S.etaInv, S.idleW);
    var i125 = M.withContinuousFactor(iDc);
    var rec = pickWire(i125, p.v, S.wireFt);
    $("wire-read").innerHTML = "";
    function wr(k, v, s, kind) { var d = el("div", "ro" + (kind ? " " + kind : "")); d.appendChild(el("span", "ro-k", k)); d.appendChild(el("span", "ro-v mono", v)); if (s) d.appendChild(el("span", "ro-s", s)); $("wire-read").appendChild(d); }
    wr("DC current", fmt(iDc, 1) + " A", "P / (V × η) + idle");
    wr("× 1.25", fmt(i125, 1) + " A", "Continuous-current factor");
    wr("Suggested copper", rec.wire.awg + " AWG", "75 °C ampacity " + rec.wire.amp75 + " A · " + rec.wire.ohm + " Ω/kft");
    wr("Voltage drop", fmt(rec.vd, 2) + "%", S.wireFt + " ft one way, round trip", rec.vd > 3 ? "warn" : "ok");
    wr("Suggested fuse", rec.fuse ? rec.fuse + " A" : "See note", "NEC 240.6(A) next size at or above 125% current, not above the wire's ampacity");
    wr("C-rate", fmt(p.ah ? iDc / p.ah : 0, 2) + " C", "");
    $("wire-hint").textContent = (rec.note || "Suggestion only — confirm ampacity, temperature correction and the adopted NEC edition with a licensed electrician.") + (rec.short ? " Even 4/0 is short of 125% current or the 3% drop target on this run." : "");

    /* 12/24/48 */
    var recV = M.recommendVoltage(Math.max(t.peakRun, S.invCont), S.etaInv, S.idleW, S.wireFt);
    $("volt-hint").textContent = "Recommended pack voltage: " + recV.chosen + " V — the lowest of 12/24/48 at which 125% of continuous DC current fits one 4/0 AWG 75 °C copper conductor (230 A) and voltage drop on this " + S.wireFt + " ft run with 4/0 is ≤ 3%. " + (recV.fallback ? "None of the three fully pass; 48 V is still the best of them." : "") + " This method is documented under How we calculate; it is not a marketing rule of thumb.";
    var vt = $("volt-tbl"); vt.innerHTML = "<thead><tr><th>Voltage</th><th>DC A</th><th>× 1.25</th><th>4/0 drop</th><th></th></tr></thead>";
    var vtb = el("tbody");
    recV.all.forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("th", "", r.v + " V"));
      tr.appendChild(el("td", "mono", fmt(r.amps, 1)));
      tr.appendChild(el("td", "mono", fmt(r.amps125, 1) + (r.okAmp ? "" : " (over 230 A)")));
      tr.appendChild(el("td", "mono", fmt(r.vdPct, 2) + "%" + (r.okVd ? "" : " (>3%)")));
      tr.appendChild(el("td", "", r.okAmp && r.okVd ? (r.v === recV.chosen ? "Recommended" : "Also OK") : "Short"));
      vtb.appendChild(tr);
    });
    vt.appendChild(vtb);
  }

  function renderMonthChart(row, dailyDc) {
    var box = $("month-chart"); box.textContent = "";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 640 230"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Monthly harvest versus daily DC need");
    if (!row) { box.appendChild(svg); return; }
    var hv = row.map(function (psh) { return M.harvestDayWh(arrayWatts(), psh, S.derate, S.etaCc); });
    var max = Math.max(dailyDc, Math.max.apply(null, hv), 1);
    var padL = 52, padR = 56, padT = 18, padB = 28, W = 640 - padL - padR, H = 230 - padT - padB;
    function x(i) { return padL + (i + 0.5) * W / 12; }
    function y(v) { return padT + H - H * v / max; }
    var d = "", i;
    hv.forEach(function (v, i) { d += (i ? "L" : "M") + x(i) + "," + y(v) + " "; });
    var area = document.createElementNS(svg.namespaceURI, "path");
    area.setAttribute("d", d + "L" + x(11) + "," + y(0) + " L" + x(0) + "," + y(0) + " Z");
    area.setAttribute("fill", "rgba(56,224,255,.15)"); area.setAttribute("stroke", "none");
    var path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", d); path.setAttribute("fill", "none"); path.setAttribute("stroke", "#38e0ff"); path.setAttribute("stroke-width", "2.2");
    var line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", padL); line.setAttribute("x2", padL + W); line.setAttribute("y1", y(dailyDc)); line.setAttribute("y2", y(dailyDc));
    line.setAttribute("stroke", "#e0c17c"); line.setAttribute("stroke-dasharray", "4 4"); line.setAttribute("stroke-width", "1.6");
    svg.appendChild(area); svg.appendChild(line); svg.appendChild(path);
    function label(tx, ty, text, anchor, cls) {
      var t = document.createElementNS(svg.namespaceURI, "text");
      t.setAttribute("x", tx); t.setAttribute("y", ty); t.setAttribute("text-anchor", anchor || "start");
      t.setAttribute("class", cls || "chart-l"); t.textContent = text; svg.appendChild(t);
    }
    label(padL + W + 4, y(dailyDc) + 4, "Load", "start", "chart-ax");
    label(8, y(max) + 4, fmtKwh(max), "start", "chart-ax");
    M.MONTHS.forEach(function (m, i) {
      label(x(i), 222, m, "middle");
    });
    box.appendChild(svg);
  }
  function renderSocChart(sim) {
    var box = $("soc-chart"); box.textContent = "";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    var n = sim.hours.length;
    svg.setAttribute("viewBox", "0 0 640 220"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Battery state of charge over time");
    var padL = 36, padR = 12, padT = 16, padB = 24, W = 640 - padL - padR, H = 220 - padT - padB;
    function x(i) { return padL + i * W / Math.max(1, n - 1); }
    function y(s) { return padT + H - H * s; }
    var areaD = "", d = "";
    sim.hours.forEach(function (h, i) {
      var p = x(i) + "," + y(h.soc) + " ";
      d += (i ? "L" : "M") + p;
      if (!i) areaD = "M" + x(0) + "," + y(0) + " L" + p;
      else areaD += "L" + p;
    });
    areaD += "L" + x(n - 1) + "," + y(0) + " Z";
    var area = document.createElementNS(svg.namespaceURI, "path");
    area.setAttribute("d", areaD); area.setAttribute("fill", "rgba(155,223,186,.16)"); area.setAttribute("stroke", "none");
    var path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", d); path.setAttribute("fill", "none"); path.setAttribute("stroke", "#9bdfba"); path.setAttribute("stroke-width", "2.2");
    svg.appendChild(area); svg.appendChild(path);
    var dodLine = 1 - S.dod;
    var ln = document.createElementNS(svg.namespaceURI, "line");
    ln.setAttribute("x1", padL); ln.setAttribute("x2", padL + W); ln.setAttribute("y1", y(dodLine)); ln.setAttribute("y2", y(dodLine));
    ln.setAttribute("stroke", "#e0c17c"); ln.setAttribute("stroke-dasharray", "4 4"); ln.setAttribute("stroke-width", "1.4");
    svg.appendChild(ln);
    function label(tx, ty, text, anchor) {
      var t = document.createElementNS(svg.namespaceURI, "text");
      t.setAttribute("x", tx); t.setAttribute("y", ty); t.setAttribute("text-anchor", anchor || "start");
      t.setAttribute("class", "chart-l"); t.textContent = text; svg.appendChild(t);
    }
    label(4, y(1) + 4, "100%");
    label(4, y(0) + 4, "0%");
    var days = S.simDays;
    var i;
    for (i = 0; i < days; i++) label(x(i * 24), 214, "Day " + (i + 1), "start");
    box.appendChild(svg);
    var cap = el("p", "hint");
    cap.textContent = S.simDays + " day" + (S.simDays > 1 ? "s" : "") + " · min SOC " + Math.round(sim.minSoc * 100) + "% · daylight " + M.round(sim.dayLen, 1) + " h · curtailed " + fmtWh(sim.curtailedWh) + (sim.deficitWh ? " · deficit " + fmtWh(sim.deficitWh) : "") + " · dashed line is 1 − usable DoD.";
    box.appendChild(cap);
  }

  /* ---------- sizer ---------- */
  function renderSizer() {
    var g = $("siz-grid"); g.textContent = "";
    g.appendChild(field("Target days of autonomy", S.targetDays, "days", function (v) { S.targetDays = Math.max(0.25, v || 1); renderSizer(); }));
    g.appendChild(field("Days to plot on the SOC chart", S.simDays, "days", function (v) { S.simDays = Math.max(1, v || 1); }));
    var t = M.loadTotals(S.items), st = station(), row = pshMonth(st), w = row ? worstMonth(row) : null;
    var psh = w ? w.psh : parseNum(S.pshManual);
    var box = $("tiers"); box.textContent = "";
    if (!t.dailyWh || !psh) {
      box.appendChild(el("p", "hint", "Add loads and pick a location (or enter a manual PSH) to size the pack and array."));
      return;
    }
    var z = M.sizeSystem({ dailyAcWh: t.dailyWh, peakRun: t.peakRun, peakSurge: t.peakSurge, pshWorst: psh, derate: S.derate, etaCc: S.etaCc, etaInv: S.etaInv, idleW: S.idleW, dod: S.dod, tempDerate: S.tempDerate, days: S.targetDays });
    ["min","rec","comf"].forEach(function (k) {
      var tier = z[k], card = el("div", "tier");
      card.appendChild(el("h3", "", tier.name));
      card.appendChild(el("p", "hint", "Energy margin " + Math.round(tier.margin * 100) + "%"));
      var grid = el("div", "tier-grid");
      function cell(lab, val) { var c = el("div", "ro"); c.appendChild(el("span", "ro-k", lab)); c.appendChild(el("span", "ro-v mono", val)); grid.appendChild(c); }
      cell("Battery", fmt(tier.batteryKwh, 2) + " kWh usable");
      cell("Array", fmt(tier.arrayW, 0) + " W STC");
      cell("Inverter, continuous", fmt(tier.invCont, 0) + " W");
      cell("Inverter, surge", fmt(tier.invSurge, 0) + " W");
      card.appendChild(grid);
      var apply = el("button", "btn", "Apply this size to equipment"); apply.type = "button";
      apply.addEventListener("click", function () {
        /* Represent usable kWh as a 48 V pack of 12 V 100 Ah blocks when possible; otherwise keep voltage and set Ah. */
        var v = pack().v || 48;
        var needWh = tier.batteryWh / Math.max(0.01, S.dod * S.tempDerate); /* nameplate */
        var ah = needWh / v;
        S.ah = M.round(ah / Math.max(1, S.np), 0);
        S.arrayW = M.round(tier.arrayW, 0);
        S.invCont = M.round(Math.max(tier.invCont, t.peakRun), 0);
        S.invSurge = M.round(Math.max(tier.invSurge, t.peakSurge), 0);
        showSec("equip");
      });
      card.appendChild(apply);
      box.appendChild(card);
    });
  }

  /* ---------- save / compare ---------- */
  function snapshot() {
    return {
      v: 1, name: S.saveName || "Setup", when: new Date().toISOString(),
      items: S.items, chem: S.chem, vNom: S.vNom, ah: S.ah, ns: S.ns, np: S.np,
      bmsCont: S.bmsCont, bmsPeak: S.bmsPeak, dod: S.dod, rte: S.rte, tempDerate: S.tempDerate,
      invCont: S.invCont, invSurge: S.invSurge, invSecs: S.invSecs, etaInv: S.etaInv, idleW: S.idleW, wave: S.wave, split: S.split,
      stationId: S.stationId, tilt: S.tilt, pshManual: S.pshManual, arrayW: S.arrayW, wp: S.wp, voc: S.voc, isc: S.isc, betaVoc: S.betaVoc,
      nsMod: S.nsMod, npMod: S.npMod, derate: S.derate, tCold: S.tCold, ccType: S.ccType, ccVoc: S.ccVoc, ccAmp: S.ccAmp, etaCc: S.etaCc,
      genW: S.genW, chgA: S.chgA, fuelGalH: S.fuelGalH, wireFt: S.wireFt, targetDays: S.targetDays, simDays: S.simDays
    };
  }
  function applySnap(s) {
    if (!s || typeof s !== "object") return false;
    Object.keys(s).forEach(function (k) {
      if (k === "v" || k === "name" || k === "when") return;
      if (k in S) S[k] = s[k];
    });
    S.saveName = s.name || "";
    if (!Array.isArray(S.items)) S.items = [];
    return true;
  }
  function loadStore() {
    try { var raw = localStorage.getItem(STORE); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }
  function writeStore(arr) {
    try { localStorage.setItem(STORE, JSON.stringify(arr)); return true; } catch (e) { return false; }
  }
  var picked = [];
  $("save-btn").addEventListener("click", function () {
    S.saveName = $("save-name").value || "Setup";
    var all = loadStore();
    all.push(snapshot());
    $("save-msg").textContent = writeStore(all) ? ("Saved “" + S.saveName + "” in this browser.") : "Could not write to localStorage (private mode?). Use Export JSON instead.";
    renderSaved();
  });
  $("export-btn").addEventListener("click", function () {
    S.saveName = $("save-name").value || S.saveName || "Setup";
    var blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (S.saveName || "offgrid-setup").replace(/\s+/g, "-").toLowerCase() + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $("import-file").addEventListener("change", function () {
    var f = $("import-file").files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var s = JSON.parse(reader.result);
        if (!applySnap(s)) throw new Error("bad");
        $("save-name").value = S.saveName;
        $("save-msg").textContent = "Imported “" + (s.name || "setup") + "”.";
        renderAll();
      } catch (e) { $("save-msg").textContent = "That file is not a recognized setup JSON."; }
    };
    reader.readAsText(f);
    $("import-file").value = "";
  });
  function renderSaved() {
    var box = $("saved-list"); box.textContent = "";
    var all = loadStore();
    if (!all.length) box.appendChild(el("p", "hint", "No saved setups yet."));
    all.forEach(function (s, i) {
      var b = el("button", "chip-btn" + (picked.indexOf(i) >= 0 ? " is-on" : ""), (s.name || "Setup") + (s.when ? "" : ""));
      b.type = "button"; b.title = s.when || "";
      b.addEventListener("click", function () {
        var at = picked.indexOf(i);
        if (at >= 0) picked.splice(at, 1);
        else { if (picked.length >= 3) picked.shift(); picked.push(i); }
        renderSaved();
      });
      var load = el("button", "chip-btn", "Load"); load.type = "button";
      load.addEventListener("click", function (ev) { ev.stopPropagation(); applySnap(s); $("save-name").value = S.saveName; renderAll(); showSec("loads"); });
      var del = el("button", "chip-btn", "Delete"); del.type = "button";
      del.addEventListener("click", function (ev) {
        ev.stopPropagation(); all.splice(i, 1); writeStore(all);
        picked = picked.filter(function (x) { return x !== i; }).map(function (x) { return x > i ? x - 1 : x; });
        renderSaved();
      });
      var wrap = el("div", "chips-row");
      wrap.appendChild(b); wrap.appendChild(load); wrap.appendChild(del);
      box.appendChild(wrap);
    });
    var wrap = $("cmp-tbl-wrap"); wrap.textContent = "";
    if (picked.length < 2) { wrap.appendChild(el("p", "hint", "Turn on two or three saved setups to compare them side by side.")); return; }
    var snaps = picked.map(function (i) { return all[i]; });
    function addRow(label, fn) {
      var row = el("div", "cmp-row");
      row.appendChild(el("div", "cmp-lab", label));
      var vals = el("div", "cmp-vals");
      snaps.forEach(function (s) {
        var hold = JSON.parse(JSON.stringify(S));
        applySnap(s);
        var p = pack(), t = M.loadTotals(S.items), st = station(), rowPsh = pshMonth(st);
        var v = fn(p, t, rowPsh, s);
        applySnap(hold);
        var cell = el("div", "cmp-cell");
        cell.appendChild(el("span", "ro-k", s.name || "Setup"));
        cell.appendChild(el("span", "ro-v mono", v));
        vals.appendChild(cell);
      });
      row.appendChild(vals);
      wrap.appendChild(row);
    }
    addRow("Daily AC load", function (p, t) { return fmtWh(t.dailyWh); });
    addRow("Peak running / surge", function (p, t) { return fmt(t.peakRun, 0) + " / " + fmt(t.peakSurge, 0) + " W"; });
    addRow("Pack", function (p) { return fmt(p.v, 0) + " V · " + fmtKwh(p.usable) + " usable"; });
    addRow("Inverter", function () { return fmt(S.invCont, 0) + " / " + fmt(S.invSurge, 0) + " W"; });
    addRow("Array", function () { return fmt(arrayWatts(), 0) + " W"; });
    addRow("Location", function (p, t, row, s) { var st = s.stationId ? P.byId(s.stationId) : null; return st ? st.name + ", " + st.st : (s.pshManual ? "PSH " + s.pshManual : "—"); });
    addRow("Worst-month harvest", function (p, t, row) {
      if (!row) return "—";
      var w = worstMonth(row);
      return fmtWh(M.harvestDayWh(arrayWatts(), w.psh, S.derate, S.etaCc)) + " (" + M.MONTHS[w.i] + ")";
    });
    addRow("Autonomy", function (p, t) {
      var dailyDc = t.dailyWh / Math.max(0.01, S.etaInv) + S.idleW * 24;
      return t.dailyWh ? fmt(p.usable / dailyDc, 1) + " days" : "—";
    });
    addRow("Rating", function (p, t, row) { return String(M.rateSystem(buildChecks(p, t, station(), row)).score); });
  }

  function renderSources() {
    var ul = $("src-list"); ul.textContent = "";
    Object.keys(D.SOURCES).forEach(function (k) {
      var s = D.SOURCES[k], li = el("li");
      var a = el("a"); a.href = s.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = s.name;
      li.appendChild(a); ul.appendChild(li);
    });
    var fl = $("flag-list"); fl.textContent = "";
    function f(t) { fl.appendChild(el("li", "", t)); }
    f("Hours/day on most presets are starter values you should edit (exceptions: the DOE kettle example of about 1 hour, and 24-hour always-on devices). Each flagged item says so next to the load.");
    f("Duty 1/3 is the DOE/VCE refrigerator rule. Applying it to a freezer is labeled as a starting estimate.");
    f("Well-pump watts are Honda's generic capacitor-start induction-motor table, not a named pump. Enter nameplate amps × volts for your well.");
    f("ISP gateway 14.69 W and standalone Wi-Fi router 8.45 W are 2024 U.S. SNE Voluntary Agreement volume-weighted ready-state averages (Table 2), not a named box — enter your adapter or the Appendix A row if you have it.");
    f("The Apple 20 W USB-C charger preset is the official USB-PD output (9 V × 2.22 A), not a measured AC input. Apple does not publish wall-draw watts.");
    f("Mitsubishi MSZ/MUZ-GL09NA cooling rated input is 585 W (range 240–1,050 W); heating at 47 °F is 720 W. Surge uses published LRA 7.7 A × 230 V.");
    f("Harman Accentra-2: 255 W normal run, 340 W start cycle, 440 W published maximum. SimplyGo: 120 W not charging, 150 W charging.");
    f("Inogen portable concentrators are omitted: official G5 manuals list the AC adapter as 100–240 V, 2.0–1.0 A max and 24 V / 5.0 A output, but not a running wattage by setting, so no Inogen preset is shipped.");
    f("LED 10 W is the common 60 W-replacement class, not a DOE table entry.");
    f("Honda and DOE disagree on some items (laptop 200–250 W vs 50 W; washer 1,200 W vs 350–500 W). Both presets are offered; enter the nameplate.");
    f("Recommended / Comfortable sizer margins (1.25× and 1.50×) are planning margins, not a code requirement on kilowatt-hours.");
    f("Inverter efficiency 0.93 and idle 20 W, and controller efficiency 0.98, are labeled starters. Replace them with datasheet figures.");
    f("The SOC evening window for occasional loads and the half-sine irradiance shape are planning assumptions, documented under How we calculate.");
    f("NEC tables are cited from the 2023 NEC as excerpted by UMD Extension (690.7(A)) and from standard public reprints of Chapter 9 Table 8 and Table 310.16. Use the edition your inspector enforces.");
    f("The NREL PSH table is 1961–1990, not a current typical meteorological year. A newer PVWatts run can be pasted into the manual PSH box.");
  }

  function renderAll() {
    renderCats(); renderPresets(); renderLoads(); renderEquip(); renderSaved(); renderSources();
    /* results/sizer fill when visible */
    if (!$("sec-results").hidden) renderResults();
    if (!$("sec-sizer").hidden) renderSizer();
  }

  /* first paint, then reveal (avoids CLS while grids hydrate) */
  try {
    $("save-name").value = S.saveName;
    renderAll();
  } finally {
    document.documentElement.classList.add("ready");
  }
})();
