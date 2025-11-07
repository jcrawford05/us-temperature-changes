// ==============================
// State Detail Page Script (Δ-ready)
// ==============================

// --- 1. Get state name from query ---
const params = new URLSearchParams(window.location.search);
const selectedState = params.get("state");

// --- 2. Update page title and header ---
if (selectedState) {
    document.getElementById("state-header").textContent = `${selectedState} — Temperature View`;
    document.getElementById("state-title").textContent = `Average Temperatures in ${selectedState}`;
    document.title = `${selectedState} — State Temperature View`;
}

// --- 3. Back button ---
document.getElementById("back-btn").addEventListener("click", () => {
    window.location.href = "../index.html";
});

// --- 4. Controls ---
const monthYearInput = d3.select("#monthyear");
const monthYearLabel = d3.select("#monthyear-label");
const unitToggle = d3.select("#unit-toggle");
const dataToggle = d3.select("#data-toggle");

// Analytics UI (same IDs as landing)
const displayToggle = d3.select("#display-toggle");
const baseRange = d3.select("#base-range");
const endRange  = d3.select("#end-range");
const baseLabel = d3.select("#base-label");
const endLabel  = d3.select("#end-label");
const endRow    = d3.select("#end-row");

let currentUnit = "F";
let currentDataset = "monthly";
let currentYear = 1800;
let currentMonth = 1;

let displayMode = "average";
let baseYear = 1800, baseMonth = 1;
let endYear  = 2000, endMonth  = 1;

const START_YEAR = 1800;
const END_YEAR   = 2020;

// --- 5. SVG setup ---
const width = 980, height = 400;
const svgState = d3.select("#stateview");
const svgLine = d3.select("#linechart");

// --- 6. Color scales ---
const colorScaleF = d3.scaleSequential().interpolator(d3.interpolateTurbo);
const colorScaleC = d3.scaleSequential().interpolator(d3.interpolateTurbo);

// Helpers
const idxFromYM = (y,m) => (y - START_YEAR) * 12 + (m - 1);
const ymFromIdx = (i) => [START_YEAR + Math.floor(i/12), (i % 12) + 1];
function monthName(m){ return new Date(2000, m - 1).toLocaleString("default", { month: "short" }); }
function fmtLabel(y,m,isMonthly){ return isMonthly ? `${monthName(m)}-${y}` : `${y}`; }

// --- 7. Load map and data ---
Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
    d3.csv("../data/state_yearly_avg.csv"),
    d3.csv("../data/state_monthly_avg.csv")
]).then(([us, yearly, monthly]) => {
    const geo = topojson.feature(us, us.objects.states).features;
    const stateFeature = geo.find(f => f.properties.name === selectedState);

    // --- Clean and filter data ---
    yearly.forEach(d => {
        d.Year = +d.Year;
        d.AvgTemp_F_Yearly = +d.AvgTemp_F_Yearly;
        d.AvgTemp_C_Yearly = +d.AvgTemp_C_Yearly;
    });
    monthly.forEach(d => {
        d.dt = new Date(d.dt);
        d.Year = d.dt.getFullYear();
        d.Month = d.dt.getMonth() + 1;
        d.AvgTemp_F = +d.AvgTemp_F;
        d.AvgTemp_C = +d.AvgTemp_C;
    });

    const stateYearly = yearly.filter(d => d.State === selectedState);
    const stateMonthly = monthly.filter(d => d.State === selectedState);

    // --- Initial slider setup (monthly default) ---
    const totalMonths = (END_YEAR - START_YEAR + 1) * 12 - 1;
    monthYearInput.attr("min", 0).attr("max", totalMonths).attr("step", 1).property("value", 0);

    // --- Initial draw (monthly)
    monthYearLabel.text("Jan-1800");
    drawStateMap(stateFeature, stateMonthly, currentMonth, currentYear);
    drawLineChart(stateMonthly, "monthly");

    // Initialize analytics sliders for monthly
    initAnalyticsSliders();

    // --- Helper: update all visualizations ---
    function updateView() {
        if (currentDataset === "yearly") {
            monthYearInput.attr("min", START_YEAR).attr("max", END_YEAR).attr("step", 1).property("value", currentYear);
            monthYearLabel.text(currentYear);
            drawStateMap(stateFeature, stateYearly, 1, currentYear);
            drawLineChart(
                displayMode === "average" ? stateYearly : [{Year: baseYear}, {Year: endYear}], // used only for axis
                "yearly"
            );
        } else {
            const idx = (currentYear - START_YEAR) * 12 + (currentMonth - 1);
            monthYearInput.attr("min", 0).attr("max", totalMonths).attr("step", 1).property("value", idx);
            monthYearLabel.text(`${monthName(currentMonth)}-${currentYear}`);
            drawStateMap(stateFeature, stateMonthly, currentMonth, currentYear);
            drawLineChart(
                displayMode === "average" ? stateMonthly : [{Year: baseYear, Month: baseMonth},{Year: endYear, Month: endMonth}],
                "monthly"
            );
        }
        initAnalyticsSliders();
    }

    // --- Slider handler ---
    monthYearInput.on("input", e => {
        if (currentDataset === "yearly") {
            currentYear = +e.target.value;
            monthYearLabel.text(currentYear);
            drawStateMap(stateFeature, stateYearly, 1, currentYear);
            drawLineChart(stateYearly, "yearly");
        } else {
            const index = +e.target.value;
            const year = START_YEAR + Math.floor(index / 12);
            const month = (index % 12) + 1;
            currentYear = year; currentMonth = month;
            monthYearLabel.text(`${monthName(month)}-${year}`);
            drawStateMap(stateFeature, stateMonthly, currentMonth, currentYear);
            drawLineChart(stateMonthly, "monthly");
        }
    });

    // --- °F / °C toggle ---
    unitToggle.on("change", e => {
        currentUnit = e.target.checked ? "C" : "F";
        updateView();
    });

    // --- Data View toggle (Monthly / Yearly) ---
    dataToggle.on("change", e => {
        currentDataset = e.target.checked ? "yearly" : "monthly";
        updateView();
    });

// --- Analytics toggle ---
    displayToggle.on("change", e => {
        displayMode = e.target.checked ? "delta" : "average";

        // Show/hide the analytics section
        const analyticsSection = document.querySelector(".analytics");
        analyticsSection.style.display = displayMode === "delta" ? "block" : "none";

        // Disable (gray out) the main month/year slider when in delta mode
        const mainSlider = document.getElementById("monthyear");
        if (displayMode === "delta") {
            mainSlider.disabled = true;
            mainSlider.style.opacity = "0.4";
            mainSlider.style.pointerEvents = "none";
        } else {
            mainSlider.disabled = false;
            mainSlider.style.opacity = "1.0";
            mainSlider.style.pointerEvents = "auto";
        }

        // Show or hide both Base/End sliders
        const endRowEl = document.getElementById("end-row");
        const baseRowEl = document.querySelector(".range-row");
        endRowEl.style.display = displayMode === "delta" ? "grid" : "none";
        baseRowEl.style.display = displayMode === "delta" ? "grid" : "none";

        updateView();
    });


    // --- Analytics sliders ---
    baseRange.on("input", e => {
        if (currentDataset === "yearly") {
            baseYear = +e.target.value;
            if (displayMode === "delta" && endYear < baseYear) { endYear = baseYear; endRange.property("value", endYear); }
            baseLabel.text(fmtLabel(baseYear, 1, false));
            endLabel.text(fmtLabel(endYear, 1, false));
        } else {
            let [y, m] = ymFromIdx(+e.target.value);
            baseYear = y; baseMonth = m;
            if (displayMode === "delta" && (endYear < baseYear || (endYear === baseYear && endMonth < baseMonth))) {
                endYear = baseYear; endMonth = baseMonth; endRange.property("value", idxFromYM(endYear, endMonth));
            }
            baseLabel.text(fmtLabel(baseYear, baseMonth, true));
            endLabel.text(fmtLabel(endYear, endMonth, true));
        }
        updateView();
    });

    endRange.on("input", e => {
        if (currentDataset === "yearly") {
            endYear = Math.max(+e.target.value, baseYear);
            endRange.property("value", endYear);
            endLabel.text(fmtLabel(endYear, 1, false));
        } else {
            let [y, m] = ymFromIdx(+e.target.value);
            if (y < baseYear || (y === baseYear && m < baseMonth)) { y = baseYear; m = baseMonth; }
            endYear = y; endMonth = m;
            endRange.property("value", idxFromYM(endYear, endMonth));
            endLabel.text(fmtLabel(endYear, endMonth, true));
        }
        updateView();
    });

    // --- Analytics slider init
    function initAnalyticsSliders() {
        if (currentDataset === "yearly") {
            baseRange.attr("min", START_YEAR).attr("max", END_YEAR).attr("step", 1).property("value", baseYear);
            endRange .attr("min", START_YEAR).attr("max", END_YEAR).attr("step", 1).property("value", endYear);
            baseLabel.text(fmtLabel(baseYear, 1, false));
            endLabel.text(fmtLabel(endYear, 1, false));
        } else {
            const maxIdx = (END_YEAR - START_YEAR + 1) * 12 - 1;
            baseRange.attr("min", 0).attr("max", maxIdx).attr("step", 1).property("value", idxFromYM(baseYear, baseMonth));
            endRange .attr("min", 0).attr("max", maxIdx).attr("step", 1).property("value", idxFromYM(endYear, endMonth));
            baseLabel.text(fmtLabel(baseYear, baseMonth, true));
            endLabel.text(fmtLabel(endYear, endMonth, true));
        }
        endRow.style("display", displayMode === "delta" ? "grid" : "none");
    }
});

// --- 8. Draw state map (Avg or Delta)
function drawStateMap(stateFeature, data, month = 1, year = 1800) {
    const key =
        currentUnit === "F"
            ? (data[0].AvgTemp_F_Yearly !== undefined ? "AvgTemp_F_Yearly" : "AvgTemp_F")
            : (data[0].AvgTemp_C_Yearly !== undefined ? "AvgTemp_C_Yearly" : "AvgTemp_C");

    svgState.selectAll("*").remove();
    const projection = d3.geoAlbersUsa().fitSize([width * 0.9, height * 0.9], stateFeature);
    const path = d3.geoPath(projection);

    if (displayMode === "average") {
        const filtered = data[0].Month
            ? data.filter(d => d.Year === year && d.Month === month)
            : data.filter(d => d.Year === year);
        const tempVal = filtered.length ? (isNaN(filtered[0][key]) ? null : +filtered[0][key]) : null;
        const scale = currentUnit === "F" ? colorScaleF : colorScaleC;
        scale.domain([0, currentUnit === "F" ? 90 : 32]);

        svgState.append("path")
            .datum(stateFeature)
            .attr("d", path)
            .attr("fill", tempVal == null ? "#555" : scale(tempVal))
            .attr("stroke", "var(--border)")
            .attr("stroke-width", 1.5)
            .attr("transform", `translate(${width * 0.05}, ${height * 0.05})`);

        svgState.append("text")
            .attr("x", width / 2).attr("y", height - 20)
            .attr("text-anchor", "middle").attr("fill", "var(--text)").attr("font-size", "14px")
            .text(tempVal == null
                ? `No data found for ${data[0].Month ? `${monthName(month)} ` : ""}${year}`
                : `${data[0].Month ? `${monthName(month)} ` : ""}${year} Avg: ${tempVal.toFixed(1)} °${currentUnit}`);
        return;
    }

    const keyF = data[0].AvgTemp_F_Yearly !== undefined ? "AvgTemp_F_Yearly" : "AvgTemp_F";
    const keyC = data[0].AvgTemp_C_Yearly !== undefined ? "AvgTemp_C_Yearly" : "AvgTemp_C";
    const keyUse = currentUnit === "F" ? keyF : keyC;

    const valAt = (Y, M) => {
        const rows = data[0].Month
            ? data.filter(d => d.Year === Y && d.Month === M)
            : data.filter(d => d.Year === Y);
        return rows[0] && rows[0][keyUse] != null && !isNaN(rows[0][keyUse]) ? +rows[0][keyUse] : null;
    };

    const b = valAt(baseYear, baseMonth);
    const e = valAt(endYear, endMonth);
    const delta = (b == null || e == null) ? null : (e - b);
    const domain = delta == null ? [-1, 1] : [delta - 2, delta + 2];
    const deltaScale = d3.scaleSequential().domain([domain[0], domain[1]]).interpolator(d3.interpolateRdBu);

    svgState.append("path")
        .datum(stateFeature)
        .attr("d", path)
        .attr("fill", delta == null ? "#666" : deltaScale(delta))
        .attr("stroke", "var(--border)")
        .attr("stroke-width", 1.5)
        .attr("transform", `translate(${width * 0.05}, ${height * 0.05})`);

    svgState.append("text")
        .attr("x", width / 2).attr("y", height - 20)
        .attr("text-anchor", "middle").attr("fill", "var(--text)").attr("font-size", "14px")
        .text(delta == null
            ? `Δ Temp (${fmtLabel(baseYear, baseMonth, !!data[0].Month)} → ${fmtLabel(endYear, endMonth, !!data[0].Month)}): No data available for comparison`
            : `Δ Temp (${fmtLabel(baseYear, baseMonth, !!data[0].Month)} → ${fmtLabel(endYear, endMonth, !!data[0].Month)}): ${(delta >= 0 ? "+" : "")}${delta.toFixed(2)} °${currentUnit}`);
}

// --- 9. Draw line chart ---
// In Avg mode: full series. In Δ mode: two points (base & end) connected.
function drawLineChart(data, mode = "monthly") {
    svgLine.selectAll("*").remove();

    const key =
        currentUnit === "F"
            ? (mode === "yearly" ? "AvgTemp_F_Yearly" : "AvgTemp_F")
            : (mode === "yearly" ? "AvgTemp_C_Yearly" : "AvgTemp_C");

    const margin = { top: 40, right: 30, bottom: 85, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svgLine.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    if (displayMode === "delta") {
        // Two-point Δ view (base & end)
        const pts = mode === "yearly"
            ? [{x: baseYear, y: dataAtYear(baseYear)}, {x: endYear, y: dataAtYear(endYear)}]
            : [{x: idxFromYM(baseYear, baseMonth), y: dataAtMonth(baseYear, baseMonth)},
                {x: idxFromYM(endYear, endMonth),   y: dataAtMonth(endYear, endMonth)}];

        const x = d3.scaleLinear()
            .domain(d3.extent(pts, d => d.x)).nice()
            .range([0, innerWidth]);

        const y = d3.scaleLinear()
            .domain(d3.extent(pts, d => d.y != null ? d.y : 0)).nice()
            .range([innerHeight, 0]);

        const line = d3.line().x(d => x(d.x)).y(d => y(d.y));

        g.append("path")
            .datum(pts.filter(p => p.y != null))
            .attr("fill", "none")
            .attr("stroke", "var(--accent)")
            .attr("stroke-width", 1.8)
            .attr("d", line);

        g.selectAll(".pt").data(pts).enter().append("circle")
            .attr("class", "pt")
            .attr("r", 3.5)
            .attr("cx", d => x(d.x))
            .attr("cy", d => y(d.y))
            .attr("fill", "var(--accent)");

        const xAxis = d3.axisBottom(x)
            .ticks(6)
            .tickFormat(v => mode === "yearly"
                ? `${v}`
                : (() => { const y = START_YEAR + Math.floor(v/12); const m = (v%12)+1; return `${monthName(m)} ${y}`; })());

        g.append("g").attr("transform", `translate(0,${innerHeight})`).call(xAxis)
            .selectAll("text").style("fill", "var(--muted)").style("font-size", "10px")
            .attr("transform", "rotate(-40)").attr("text-anchor", "end");
        g.selectAll(".domain, .tick line").attr("stroke", "var(--border)");

        g.append("g").call(d3.axisLeft(y).ticks(6))
            .selectAll("text").style("fill", "var(--muted)");

        g.append("text")
            .attr("x", innerWidth/2).attr("y", innerHeight + 65)
            .attr("text-anchor", "middle").attr("fill", "var(--muted)").attr("font-size", "13px")
            .text(mode === "yearly" ? "Year" : "Month-Year");

        g.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -innerHeight/2).attr("y", -45)
            .attr("text-anchor", "middle").attr("fill", "var(--muted)").attr("font-size", "13px")
            .text(`Average Temperature (°${currentUnit})`);

        g.append("text")
            .attr("x", innerWidth/2).attr("y", -10)
            .attr("text-anchor", "middle").attr("fill", "var(--text)").attr("font-size", "15px")
            .text(`Base vs End — ${selectedState}`);
        return;
    }

    // Average mode: full series
    let x, xAxis;
    if (mode === "yearly") {
        x = d3.scaleLinear().domain(d3.extent(data, d => d.Year)).range([0, innerWidth]);
        xAxis = d3.axisBottom(x).tickFormat(d3.format("d")).ticks(10);
    } else {
        const parseIndex = d => (d.Year - START_YEAR) * 12 + d.Month - 1;
        x = d3.scaleLinear().domain(d3.extent(data, parseIndex)).range([0, innerWidth]);
        xAxis = d3.axisBottom(x).ticks(10).tickFormat(i => {
            const y = START_YEAR + Math.floor(i / 12), m = (i % 12) + 1; return `${monthName(m)} ${y}`;
        });
    }

    const y = d3.scaleLinear()
        .domain(d3.extent(data, d => d[key])).nice()
        .range([innerHeight, 0]);

    const line = d3.line()
        .x(d => (mode === "yearly" ? x(d.Year) : x((d.Year - START_YEAR) * 12 + d.Month - 1)))
        .y(d => y(d[key]));

    g.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "var(--accent)")
        .attr("stroke-width", 1.8)
        .attr("d", line);

    const xAxisG = g.append("g").attr("transform", `translate(0,${innerHeight})`).call(xAxis);
    xAxisG.selectAll("text").style("fill", "var(--muted)").style("font-size", "10px")
        .attr("transform", "rotate(-40)").attr("text-anchor", "end");
    xAxisG.select(".domain").attr("stroke", "var(--border)").attr("stroke-width", 1.5);
    xAxisG.selectAll(".tick line").attr("stroke", "var(--border)").attr("stroke-width", 0.8).attr("y2", 4);

    g.append("g").call(d3.axisLeft(y).ticks(6)).selectAll("text").style("fill", "var(--muted)");

    g.append("text").attr("x", innerWidth / 2).attr("y", innerHeight + 65)
        .attr("text-anchor", "middle").attr("fill", "var(--muted)").attr("font-size", "13px")
        .text(mode === "yearly" ? "Year" : "Month-Year");

    g.append("text").attr("transform", "rotate(-90)").attr("x", -innerHeight / 2).attr("y", -45)
        .attr("text-anchor", "middle").attr("fill", "var(--muted)").attr("font-size", "13px")
        .text(`Average Temperature (°${currentUnit})`);

    g.append("text").attr("x", innerWidth / 2).attr("y", -10)
        .attr("text-anchor", "middle").attr("fill", "var(--text)").attr("font-size", "15px")
        .text(mode === "yearly"
            ? `Yearly Average Temperature Trend — ${selectedState}`
            : `Monthly Average Temperature Trend — ${selectedState}`);

    // Helpers for Δ mode line (pull point values)
    function dataAtYear(Y){
        const k = currentUnit === "F" ? "AvgTemp_F_Yearly" : "AvgTemp_C_Yearly";
        const row = data.find(d => d.Year === Y);
        return row ? +row[k] : null;
    }
    function dataAtMonth(Y, M){
        const k = currentUnit === "F" ? "AvgTemp_F" : "AvgTemp_C";
        const row = data.find(d => d.Year === Y && d.Month === M);
        return row ? +row[k] : null;
    }
}
