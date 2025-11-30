// ==============================
// State Detail Page Script (Zoom enabled, Correct padding, Correct city temps, Comparison ready)
// ==============================

// ------------------------------
// Global zoom scale for dot size
// ------------------------------
let currentZoomScale = 1;

// ------------------------------
// Get state from query
// ------------------------------
const params = new URLSearchParams(window.location.search);
const selectedState = params.get("state");

if (selectedState) {
    document.getElementById("state-header").textContent = `${selectedState} — Temperature View`;
    document.getElementById("state-title").textContent = `Average Temperatures in ${selectedState}`;
    document.title = `${selectedState} — State Temperature View`;
}

// Back button
document.getElementById("back-btn").addEventListener("click", () => {
    window.location.href = "../index.html";
});

// Controls
const monthYearInput = d3.select("#monthyear");
const monthYearLabel = d3.select("#monthyear-label");
const unitToggle = d3.select("#unit-toggle");
const dataToggle = d3.select("#data-toggle");

// (All delta controls removed)
let currentUnit = "F";
let currentDataset = "monthly";
let currentYear = 1800;
let currentMonth = 1;

const START_YEAR = 1800;
const END_YEAR   = 2013;

// Comparison state (for line chart)
let compareState = null;

let isPlaying = false;
let animationInterval = null;
const ANIMATION_SPEED = 100; // milliseconds between steps

// Tooltip for line chart hover
const lineTooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

// SVGs
const svgState = d3.select("#stateview");
const svgLine = d3.select("#linechart");

let timelineIndicator = null;
let timelineIndicatorDot = null;
let lineChartGroup = null;
let lineChartXScale = null;
let lineChartHeight = null;
let lineChartMargin = null;

// Tooltip for city dots
const cityTooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

// Color Scales
const colorScaleF = d3.scaleSequential().interpolator(d3.interpolateTurbo);
const colorScaleC = d3.scaleSequential().interpolator(d3.interpolateTurbo);

// Helpers
const idxFromYM = (y,m) => (y - START_YEAR) * 12 + (m - 1);
function monthName(m) { return new Date(2000, m - 1).toLocaleString("default", { month: "short" }); }

// ------------------------------
// Load all data
// ------------------------------
Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
    d3.csv("../data/state_yearly_avg.csv"),
    d3.csv("../data/state_monthly_avg.csv"),
    d3.csv("../data/city_monthly_avg.csv")
]).then(([us, yearly, monthly, cities]) => {

    const geo = topojson.feature(us, us.objects.states).features;
    const stateFeature = geo.find(f => f.properties.name === selectedState);

    // Clean state yearly
    yearly.forEach(d => {
        d.Year = +d.Year;
        d.AvgTemp_F_Yearly = +d.AvgTemp_F_Yearly;
        d.AvgTemp_C_Yearly = +d.AvgTemp_C_Yearly;
    });

    // Clean state monthly
    monthly.forEach(d => {
        d.dt = new Date(d.dt);
        d.Year = d.dt.getFullYear();
        d.Month = d.dt.getMonth() + 1;
        d.AvgTemp_F = +d.AvgTemp_F;
        d.AvgTemp_C = +d.AvgTemp_C;
    });

    // Clean city data
    cities.forEach(d => {
        d.dt = new Date(d.dt);
        d.Year = d.dt.getFullYear();
        d.Month = d.dt.getMonth() + 1;
        d.AvgTemp_C = +d.AvgTemp_C;
        d.AverageTemperatureF = +d.AverageTemperatureF;
        d.Latitude = +d.Latitude;
        d.Longitude = +d.Longitude;
    });

    const stateYearly  = yearly.filter(d => d.State === selectedState);
    const stateMonthly = monthly.filter(d => d.State === selectedState);
    const stateCities  = cities.filter(d => d.State === selectedState);

    // ================================
    // Comparison dropdown setup
    // ================================
    const compareSelect = document.getElementById("compare-select");
    if (compareSelect) {
        const allStates = Array.from(new Set(monthly.map(d => d.State))).sort();
        allStates.forEach(s => {
            if (s !== selectedState) {
                const opt = document.createElement("option");
                opt.value = s;
                opt.textContent = s;
                compareSelect.appendChild(opt);
            }
        });
        compareSelect.addEventListener("change", e => {
            compareState = e.target.value || null;
            updateView();
        });
    }

    // Slider setup
    const totalMonths = (END_YEAR - START_YEAR + 1) * 12 - 1;
    monthYearInput.attr("min", 0).attr("max", totalMonths).property("value", 0);
    monthYearLabel.text("Jan-1800");

    // Initial render
    drawStateMap(stateFeature, stateMonthly, currentMonth, currentYear, stateCities);
    drawLineChart(stateMonthly, "monthly");
    updateTimelineIndicator(); // Initialize timeline indicator position

    // Stats (main state)
    updateMainStateStats();

    // ------------------------------
    // View update logic
    // ------------------------------
    function updateView() {
        const mode = currentDataset === "yearly" ? "yearly" : "monthly";
        let mainData = mode === "yearly" ? stateYearly : stateMonthly;

        // Update slider label
        if (mode === "yearly") {
            monthYearLabel.text(currentYear);
        } else {
            monthYearLabel.text(`${monthName(currentMonth)}-${currentYear}`);
        }

        // Comparison dataset
        let compareData = null;
        if (compareState) {
            compareData = (mode === "yearly")
                ? yearly.filter(d => d.State === compareState)
                : monthly.filter(d => d.State === compareState);
        }

        drawStateMap(
            stateFeature,
            mainData,
            mode === "yearly" ? 1 : currentMonth,
            currentYear,
            stateCities
        );

        drawLineChart(mainData, mode, compareData);
        updateTimelineIndicator(); // Update indicator position

        updateMainStateStats();
    }

    function updateTimelineIndicator() {
        if (!timelineIndicator || !lineChartXScale) return;

        let xVal;
        if (currentDataset === "yearly") {
            xVal = currentYear;
        } else {
            xVal = idxFromYM(currentYear, currentMonth);
        }

        const domain = lineChartXScale.domain();
        const isInDomain = xVal >= domain[0] && xVal <= domain[1];
        
        if (isInDomain) {
            const xPos = lineChartXScale(xVal);
            timelineIndicator
                .attr("x1", xPos)
                .attr("x2", xPos)
                .style("opacity", 1);
            
            const dot = lineChartGroup.select(".timeline-indicator-dot");
            if (!dot.empty()) {
                dot.attr("cx", xPos)
                   .attr("cy", 0)
                   .style("opacity", 1);
            }
        } else {
            timelineIndicator.style("opacity", 0);
            const dot = lineChartGroup.select(".timeline-indicator-dot");
            if (!dot.empty()) {
                dot.style("opacity", 0);
            }
        }
    }

    // ------------------------------
    // Slider change updates
    // ------------------------------
    monthYearInput.on("input", e => {
        const index = +e.target.value;
        currentYear = START_YEAR + Math.floor(index / 12);
        currentMonth = (index % 12) + 1;
        updateView();
    });

    unitToggle.on("change", e => { currentUnit = e.target.checked ? "C" : "F"; updateView(); });
    dataToggle.on("change", e => { 
        currentDataset = e.target.checked ? "yearly" : "monthly"; 
        if (isPlaying) {
            togglePlayPause();
        }
        updateView(); 
    });

    function togglePlayPause() {
        isPlaying = !isPlaying;
        const playBtn = document.getElementById("play-pause-btn");
        const playIcon = document.getElementById("play-icon");

        if (isPlaying) {
            playBtn.classList.add("playing");
            playIcon.textContent = "⏸";
            startAnimation();
        } else {
            playBtn.classList.remove("playing");
            playIcon.textContent = "▶";
            stopAnimation();
        }
    }

    function startAnimation() {
        if (animationInterval) {
            clearInterval(animationInterval);
        }

        animationInterval = setInterval(() => {
            const slider = document.getElementById("monthyear");
            const currentVal = +slider.value;
            const min = +slider.min;
            const max = +slider.max;


            const increment = currentDataset === "yearly" ? 12 : 1;

            if (currentVal >= max) {
                slider.value = min;
                slider.dispatchEvent(new Event("input", { bubbles: true }));
            } else {
                const newVal = Math.min(currentVal + increment, max);
                slider.value = newVal;
                slider.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }, ANIMATION_SPEED);
    }

    function stopAnimation() {
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
    }

    const playBtn = document.getElementById("play-pause-btn");
    if (playBtn) {
        playBtn.addEventListener("click", togglePlayPause);
    }


    // ------------------------------
    // Stats helper
    // ------------------------------
    function updateMainStateStats() {
        const unitKeyMonthly = currentUnit === "F" ? "AvgTemp_F" : "AvgTemp_C";
        const unitKeyYearly  = currentUnit === "F" ? "AvgTemp_F_Yearly" : "AvgTemp_C_Yearly";

        const cleanMonthly = stateMonthly
            .filter(d => d[unitKeyMonthly] != null && !isNaN(d[unitKeyMonthly]) && d[unitKeyMonthly] !== 0)
            .map(d => ({ Year: d.Year, Month: d.Month, value: d[unitKeyMonthly] }));

        const cleanYearly = stateYearly
            .filter(d => d[unitKeyYearly] != null && !isNaN(d[unitKeyYearly]) && d[unitKeyYearly] !== 0);

        updateStatsPanel(cleanMonthly, cleanYearly, window.lastComputedSlope || null,
            currentDataset === "yearly" ? "yearly" : "monthly");
    }

});


// ========================================================================
// DRAW STATE MAP  (Average only — delta removed)
// ========================================================================
function drawStateMap(stateFeature, data, month, year, stateCities) {

    svgState.selectAll("*").remove();

    // Size setup
    const node = document.getElementById("stateview");
    const width  = node.clientWidth  || 980;
    const height = node.clientHeight || 600;

    const innerMargin = { top: 30, right: 30, bottom: 70, left: 30 };

    const g = svgState.append("g").attr("class", "zoom-layer");

    // Zoom
    const zoom = d3.zoom()
        .scaleExtent([1, 12])
        .on("zoom", event => {
            currentZoomScale = event.transform.k;
            g.attr("transform", event.transform);
            g.selectAll(".city-dot")
                .filter(function() { return !d3.select(this).classed("hovered"); })
                .attr("r", 4 / currentZoomScale);
        });
    svgState.call(zoom);

    // Projection
    const projection = d3.geoMercator()
        .fitExtent(
            [
                [innerMargin.left, innerMargin.top],
                [width - innerMargin.right, height - innerMargin.bottom]
            ],
            stateFeature
        );
    const path = d3.geoPath(projection);

    const neutralFill = "var(--nodata)";
    const key =
        currentUnit === "F"
            ? (data[0].AvgTemp_F_Yearly !== undefined ? "AvgTemp_F_Yearly" : "AvgTemp_F")
            : (data[0].AvgTemp_C_Yearly !== undefined ? "AvgTemp_C_Yearly" : "AvgTemp_C");

    // Filter for this date
    const filtered = data[0].Month
        ? data.filter(d => d.Year === year && d.Month === month)
        : data.filter(d => d.Year === year);

    const tempVal = filtered.length ? +filtered[0][key] : null;

    const scale = currentUnit === "F" ? colorScaleF : colorScaleC;
    scale.domain([0, currentUnit === "F" ? 90 : 32]);

    // Draw state fill
    g.append("path")
        .datum(stateFeature)
        .attr("d", path)
        .attr("fill", tempVal == null ? neutralFill : scale(tempVal))
        .attr("stroke", "var(--border)")
        .attr("stroke-width", 1.6);

    // Draw city dots
    const keyCity = currentUnit === "F" ? "AverageTemperatureF" : "AvgTemp_C";

    const cityData = data[0].Month
        ? stateCities.filter(d => d.Year === year && d.Month === month)
        : stateCities.filter(d => d.Year === year);

    g.selectAll(".city-dot")
        .data(cityData)
        .enter()
        .append("circle")
        .attr("class", "city-dot")
        .attr("cx", d => projection([d.Longitude, d.Latitude])?.[0] || null)
        .attr("cy", d => projection([d.Longitude, d.Latitude])?.[1] || null)
        .attr("r", 4)
        .attr("fill", d => {
            const v = d[keyCity];
            return (v == null || isNaN(v)) ? neutralFill : scale(v);
        })
        .attr("stroke", "var(--card)")
        .attr("stroke-width", 1.4)
        .on("mouseover", function(e, d) {
            d3.select(this).classed("hovered", true).transition().duration(120)
                .attr("r", 7).attr("stroke", "var(--accent)").attr("stroke-width", 2);

            const v = d[keyCity];
            const text = (v == null || isNaN(v))
                ? `${d.City}: No data`
                : `${d.City}: ${v.toFixed(1)} °${currentUnit}`;

            cityTooltip.style("opacity", 1)
                .html(text)
                .style("left", (e.pageX + 12) + "px")
                .style("top", (e.pageY - 28) + "px");
        })
        .on("mousemove", e => {
            cityTooltip.style("left", (e.pageX + 12) + "px").style("top", (e.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).classed("hovered", false)
                .transition().duration(120)
                .attr("r", 4 / currentZoomScale)
                .attr("stroke", "var(--card)")
                .attr("stroke-width", 1.4);
            cityTooltip.style("opacity", 0);
        });

    // Bottom label
    svgState.append("text")
        .attr("x", width / 2)
        .attr("y", height - innerMargin.bottom / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--text)")
        .attr("font-size", "14px")
        .text(
            tempVal == null
                ? `No data for ${filtered[0]?.Month ? monthName(month) + " " : ""}${year}`
                : `${filtered[0]?.Month ? monthName(month) + " " : ""}${year} Avg: ${tempVal.toFixed(1)} °${currentUnit}`
        );
}


// ========================================================================
// LINE CHART (comparison + hover)
// ========================================================================
function drawLineChart(data, mode, compareData = null) {

    svgLine.selectAll("*").remove();

    const key =
        currentUnit === "F"
            ? (mode === "yearly" ? "AvgTemp_F_Yearly" : "AvgTemp_F")
            : (mode === "yearly" ? "AvgTemp_C_Yearly" : "AvgTemp_C");

    let cleanData = data.filter(d => d[key] != null && !isNaN(d[key]) && d[key] !== 0);

    if (cleanData.length < 2) {
        svgLine.append("text")
            .attr("x", 20)
            .attr("y", 40)
            .attr("fill", "var(--muted)")
            .attr("font-size", "16px")
            .text("Not enough data available for this state.");
        return;
    }

    const margin = { top: 40, right: 30, bottom: 85, left: 60 };
    const widthLC = 980 - margin.left - margin.right;
    const heightLC = 300 - margin.top - margin.bottom;
    const g = svgLine.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    
    lineChartGroup = g;
    lineChartMargin = margin;
    lineChartHeight = heightLC;

    const parseIndex = d => (d.Year - START_YEAR) * 12 + (d.Month - 1);

    // X-axis extent
    let fullExtent;

    if (mode === "yearly") {
        let years = cleanData.map(d => d.Year);
        if (compareData) {
            const cleanCompare = compareData.filter(d => d[key] != null && !isNaN(d[key]) && d[key] !== 0);
            years = years.concat(cleanCompare.map(d => d.Year));
        }
        fullExtent = d3.extent(years);
    } else {
        let idxs = cleanData.map(parseIndex);
        if (compareData) {
            const cleanCompare = compareData.filter(d => d[key] != null && !isNaN(d[key]) && d[key] !== 0);
            idxs = idxs.concat(cleanCompare.map(parseIndex));
        }
        fullExtent = d3.extent(idxs);
    }

    // Scales
    const x = d3.scaleLinear().domain(fullExtent).range([0, widthLC]);
    lineChartXScale = x; // Store for timeline indicator updates

    const xAxis = d3.axisBottom(x).ticks(10).tickFormat(i => {
        if (mode === "yearly") return i;
        const y = START_YEAR + Math.floor(i / 12);
        const m = (i % 12) + 1;
        return `${monthName(m)} ${y}`;
    });

    // Y scale covers main + comparison
    let allVals = cleanData.map(d => d[key]);

    let comparePoints = [];

    if (compareData) {
        const cleanCompare = compareData.filter(d => d[key] != null && !isNaN(d[key]) && d[key] !== 0);
        allVals = allVals.concat(cleanCompare.map(d => d[key]));

        comparePoints = cleanCompare.map(d => ({
            Year: d.Year,
            Month: d.Month,
            value: d[key],
            xVal: mode === "yearly" ? d.Year : parseIndex(d)
        }));
    }

    const y = d3.scaleLinear().domain(d3.extent(allVals)).nice().range([heightLC, 0]);

    // Main line
    const lineMain = d3.line()
        .x(d => (mode === "yearly" ? x(d.Year) : x(parseIndex(d))))
        .y(d => y(d[key]));

    g.append("path")
        .datum(cleanData)
        .attr("fill", "none")
        .attr("stroke", "var(--accent)")
        .attr("stroke-width", 1.8)
        .attr("d", lineMain);

    // Comparison line
    if (comparePoints.length > 1) {
        const lineCompare = d3.line()
            .x(d => x(d.xVal))
            .y(d => y(d.value));

        g.append("path")
            .datum(comparePoints)
            .attr("fill", "none")
            .attr("stroke", "var(--muted)")
            .attr("stroke-width", 1.4)
            .attr("stroke-dasharray", "4 3")
            .attr("d", lineCompare);

        // Comparison trend line
        const tx = comparePoints.map(p => p.xVal);
        const ty = comparePoints.map(p => p.value);
        const nC = tx.length;
        const sumX = d3.sum(tx);
        const sumY = d3.sum(ty);
        const sumXY = d3.sum(tx.map((d, i) => d * ty[i]));
        const sumXX = d3.sum(tx.map(d => d * d));
        const slopeC = (nC * sumXY - sumX * sumY) / (nC * sumXX - sumX * sumX);
        const interceptC = (sumY - slopeC * sumX) / nC;
        const xStartC = d3.min(tx);
        const xEndC = d3.max(tx);

        g.append("line")
            .attr("x1", x(xStartC)).attr("y1", y(slopeC * xStartC + interceptC))
            .attr("x2", x(xEndC)).attr("y2", y(slopeC * xEndC + interceptC))
            .attr("stroke", "var(--muted)")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "4 4")
            .attr("opacity", 0.8);

        // Comparison slope label
        const slopeCPer = mode === "yearly" ? "per year" : "per month";

        g.append("text")
            .attr("x", 8)
            .attr("y", -25)
            .attr("fill", "var(--muted)")
            .attr("font-size", "12px")
            .text(`${compareState} Trend: ${slopeC.toFixed(3)} °${currentUnit} ${slopeCPer}`);

    }


    // Axes
    g.append("g").attr("transform", `translate(0,${heightLC})`).call(xAxis);
    g.append("g").call(d3.axisLeft(y));

    // Trend line for main
    const mainPts = cleanData.map(d => ({
        Year: d.Year,
        Month: d.Month,
        value: d[key],
        xVal: mode === "yearly" ? d.Year : parseIndex(d)
    }));

    const mx = mainPts.map(p => p.xVal);
    const my = mainPts.map(p => p.value);

    const n = mx.length;
    const sumX = d3.sum(mx);
    const sumY = d3.sum(my);
    const sumXY = d3.sum(mx.map((d, i) => d * my[i]));
    const sumXX = d3.sum(mx.map(d => d * d));

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    window.lastComputedSlope = slope;

    const xStart = d3.min(mx);
    const xEnd = d3.max(mx);

    g.append("line")
        .attr("x1", x(xStart)).attr("y1", y(slope * xStart + intercept))
        .attr("x2", x(xEnd)).attr("y2", y(slope * xEnd + intercept))
        .attr("stroke", "var(--muted)")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "6 4")
        .attr("opacity", 0.9);

    // Slope label
    const slopePer = mode === "yearly" ? "per year" : "per month";
    g.append("text")
        .attr("x", 8)
        .attr("y", -10)
        .attr("fill", "var(--muted)")
        .attr("font-size", "13px")
        .text(`${selectedState} Trend: ${slope.toFixed(3)} °${currentUnit} ${slopePer}`);

    timelineIndicator = g.append("line")
        .attr("class", "timeline-indicator")
        .attr("stroke", "var(--accent)")
        .attr("stroke-width", 3)
        .attr("stroke-dasharray", "6 3")
        .attr("y1", 0)
        .attr("y2", heightLC)
        .style("opacity", 1)
        .style("pointer-events", "none")
        .style("filter", "drop-shadow(0 0 3px var(--accent))");
    
    g.append("circle")
        .attr("class", "timeline-indicator-dot")
        .attr("r", 5)
        .attr("fill", "var(--accent)")
        .attr("stroke", "var(--card)")
        .attr("stroke-width", 2)
        .style("opacity", 1)
        .style("pointer-events", "none")
        .style("filter", "drop-shadow(0 0 4px var(--accent))");

    // Hover: crosshair, dots, tooltip
    const hoverLine = g.append("line")
        .attr("stroke", "var(--muted)")
        .attr("stroke-width", 1)
        .attr("y1", 0).attr("y2", heightLC)
        .style("opacity", 0);

    const mainDot = g.append("circle")
        .attr("r", 4)
        .attr("fill", "var(--accent)")
        .attr("stroke", "var(--card)")
        .attr("stroke-width", 1.2)
        .style("opacity", 0);

    const compareDot = g.append("circle")
        .attr("r", 4)
        .attr("fill", "var(--muted)")
        .attr("stroke", "var(--card)")
        .attr("stroke-width", 1.2)
        .style("opacity", 0);

    g.append("rect")
        .attr("width", widthLC).attr("height", heightLC)
        .style("fill", "none")
        .style("pointer-events", "all")
        .on("mouseover", () => {
            hoverLine.style("opacity", 1);
            mainDot.style("opacity", 1);
        })
        .on("mouseout", () => {
            hoverLine.style("opacity", 0);
            mainDot.style("opacity", 0);
            compareDot.style("opacity", 0);
            lineTooltip.style("opacity", 0);
        })
        .on("mousemove", (event) => {
            const [mxPos] = d3.pointer(event);
            const xVal = x.invert(mxPos);

            const mainNear = d3.least(mainPts, d => Math.abs(d.xVal - xVal));
            if (!mainNear) return;

            const cx = x(mainNear.xVal);
            const cy = y(mainNear.value);

            hoverLine.attr("x1", cx).attr("x2", cx);
            mainDot.attr("cx", cx).attr("cy", cy).style("opacity", 1);

            let compareNear = null;
            if (comparePoints.length) {
                compareNear = d3.least(comparePoints, d => Math.abs(d.xVal - xVal));
                if (compareNear) {
                    compareDot.attr("cx", x(compareNear.xVal)).attr("cy", y(compareNear.value)).style("opacity", 1);
                } else {
                    compareDot.style("opacity", 0);
                }
            }

            const label = mode === "yearly"
                ? `${mainNear.Year}`
                : `${monthName(mainNear.Month)} ${mainNear.Year}`;

            let html = `<strong>${label}</strong>`;
            html += `<br>${selectedState}: ${mainNear.value.toFixed(2)} °${currentUnit}`;
            if (compareState && compareNear) {
                html += `<br>${compareState}: ${compareNear.value.toFixed(2)} °${currentUnit}`;
            }

            lineTooltip
                .style("opacity", 1)
                .html(html)
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY - 28) + "px");
        });
}


// ========================================================================
// STATE STATS PANEL
// ========================================================================
function updateStatsPanel(cleanMonthly, cleanYearly, slope, mode) {

    const fmt = (v) => (v == null || isNaN(v)) ? "—" : `${v.toFixed(2)} °${currentUnit}`;
    const fmtYM = (y,m) => (y && m) ? `${monthName(m)} ${y}` : "—";

    // State name
    document.getElementById("stat-state-name").textContent = selectedState;

    // Avg temp
    const allTemps = cleanMonthly.map(d => d.value);
    const avgAll = allTemps.length ? d3.mean(allTemps) : null;
    document.getElementById("stat-avg-temp").textContent = fmt(avgAll);

    // Slope
    let perUnit = mode === "yearly" ? "yr" : "mo";
    document.getElementById("stat-rate-change").textContent =
        slope ? `${slope.toFixed(3)} °${currentUnit} / ${perUnit}` : "—";


    // Hottest/coldest year
    const yearKey = currentUnit === "F" ? "AvgTemp_F_Yearly" : "AvgTemp_C_Yearly";
    const validY = cleanYearly.filter(d => d[yearKey] != null);

    let hottestY = null, coldestY = null;
    if (validY.length) {
        hottestY = validY.reduce((a,b) => a[yearKey] > b[yearKey] ? a : b);
        coldestY = validY.reduce((a,b) => a[yearKey] < b[yearKey] ? a : b);
    }
    document.getElementById("stat-hottest-year").textContent =
        hottestY ? `${hottestY.Year} (${fmt(hottestY[yearKey])})` : "—";
    document.getElementById("stat-coldest-year").textContent =
        coldestY ? `${coldestY.Year} (${fmt(coldestY[yearKey])})` : "—";

    // Hottest/coldest month
    const validM = cleanMonthly.filter(d => d.value != null);

    let hottestM = null, coldestM = null;
    if (validM.length) {
        hottestM = validM.reduce((a,b) => a.value > b.value ? a : b);
        coldestM = validM.reduce((a,b) => a.value < b.value ? a : b);
    }
    document.getElementById("stat-hottest-month").textContent =
        hottestM ? `${fmtYM(hottestM.Year, hottestM.Month)} (${fmt(hottestM.value)})` : "—";
    document.getElementById("stat-coldest-month").textContent =
        coldestM ? `${fmtYM(coldestM.Year, coldestM.Month)} (${fmt(coldestM.value)})` : "—";

    // Biggest fluctuation
    const fluct = d3.rollups(
        validM,
        rows => d3.max(rows.map(r => r.value)) - d3.min(rows.map(r => r.value)),
        d => d.Year
    );

    let biggest = null;
    if (fluct.length) {
        biggest = fluct.reduce((a,b) => a[1] > b[1] ? a : b);
    }
    document.getElementById("stat-biggest-fluct").textContent =
        biggest ? `${biggest[0]} (${fmt(biggest[1])})` : "—";

    // Data coverage
    const years = validM.map(d => d.Year);
    const minY = d3.min(years);
    const maxY = d3.max(years);
    document.getElementById("stat-data-range").textContent =
        (minY && maxY) ? `${minY}–${maxY}` : "—";

    // Total change
    let totalChange = null;
    if (validY.length >= 2) {
        const sorted = validY.sort((a,b) => a.Year - b.Year);
        totalChange = sorted[sorted.length-1][yearKey] - sorted[0][yearKey];
    }
    document.getElementById("stat-total-change").textContent = fmt(totalChange);

    // Variability
    const variability = allTemps.length >= 2 ? d3.deviation(allTemps) : null;
    document.getElementById("stat-variability").textContent = fmt(variability);
}