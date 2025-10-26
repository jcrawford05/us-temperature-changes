const MAP_W = 980, MAP_H = 600;
const STATE_W = 980, STATE_H = 320;
const LINE_W = 980, LINE_H = 300;
const MARGIN = { t: 24, r: 24, b: 40, l: 52 };

const NAME_FIX = new Map([
    ["District of Columbia", "District of Columbia"]
]);

const fallbackRows = (() => {
    const years = d3.range(1900, 2021);
    const states = [
        "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
        "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
        "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
        "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
        "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
        "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
        "West Virginia", "Wisconsin", "Wyoming"
    ];

    const baseTemps = {
        "Alaska": 25, "Hawaii": 75, "Florida": 70, "Texas": 62, "California": 58,
        "Arizona": 60, "Nevada": 55, "New Mexico": 55, "Utah": 46, "Colorado": 45,
        "Wyoming": 40, "Montana": 42, "North Dakota": 40, "South Dakota": 45,
        "Minnesota": 40, "Wisconsin": 42, "Michigan": 45, "Maine": 42, "Vermont": 42,
        "New Hampshire": 45, "Massachusetts": 48, "Connecticut": 50, "Rhode Island": 50,
        "New York": 50, "Pennsylvania": 48, "New Jersey": 52, "Delaware": 54,
        "Maryland": 54, "Virginia": 55, "West Virginia": 52, "Kentucky": 55,
        "Tennessee": 58, "North Carolina": 58, "South Carolina": 62, "Georgia": 62,
        "Alabama": 62, "Mississippi": 62, "Louisiana": 65, "Arkansas": 58,
        "Missouri": 55, "Iowa": 48, "Illinois": 50, "Indiana": 50, "Ohio": 50,
        "Kansas": 52, "Nebraska": 48, "Oklahoma": 58, "Washington": 48, "Oregon": 50,
        "Idaho": 45, "District of Columbia": 55
    };

    const rows = [];
    for (const s of states) {
        const baseTemp = baseTemps[s] || 50;
        for (const y of years) {
            const trend = (y - 1900) * 0.03;
            const noise = d3.randomNormal.source(d3.randomLcg(42 + s.charCodeAt(0)))(0, 1.2)();
            rows.push({ state: s, year: y, temp_f: +(baseTemp + trend + noise).toFixed(2) });
        }
    }
    return rows;
})();

let stateYearMap = new Map();
let yearsDomain = [1900, 2020];
let selectedYear = 2000;
let currentState = null;
let useCelsius = false;

const yearInput = document.getElementById("year");
const yearLabel = document.getElementById("year-label");
const unitToggle = document.getElementById("unit-toggle");
const unitLabel = document.getElementById("unit-label");
const mapSvg = d3.select("#map").attr("viewBox", `0 0 ${MAP_W} ${MAP_H}`);
const tooltip = d3.select("#tooltip");
const detailTitle = d3.select("#detail-title");
const stateTitle = d3.select("#state-title");

const color = d3.scaleSequential().interpolator(d3.interpolateTurbo);

let statesMesh = null;
let nameToFeature = new Map();

function fahrenheitToCelsius(f) {
    return (f - 32) * 5 / 9;
}

function celsiusToFahrenheit(c) {
    return c * 9 / 5 + 32;
}

function convertTemperature(temp, toCelsius) {
    return toCelsius ? fahrenheitToCelsius(temp) : temp;
}

function formatTemperature(temp, useCelsius) {
    const convertedTemp = convertTemperature(temp, useCelsius);
    const unit = useCelsius ? '°C' : '°F';
    return `${convertedTemp.toFixed(1)}${unit}`;
}

function renderLegend(scale, container) {
    container.innerHTML = "";
    const min = scale.domain()[0], max = scale.domain()[1];
    const swatch = document.createElement("canvas");
    swatch.width = 240; swatch.height = 14;
    const ctx = swatch.getContext("2d");
    for (let i = 0; i < swatch.width; i++) {
        const t = i / (swatch.width - 1);
        ctx.fillStyle = scale(min + t * (max - min));
        ctx.fillRect(i, 0, 1, swatch.height);
    }
    const wrap = document.getElementById("legend");
    wrap.appendChild(swatch);
    const axis = document.createElement("div");
    axis.style.display = "flex";
    axis.style.justifyContent = "space-between";
    axis.style.width = "240px";
    axis.style.fontSize = "12px";
    axis.style.color = "#9ca3af";
    const unit = useCelsius ? '°C' : '°F';
    const minConverted = convertTemperature(min, useCelsius);
    const maxConverted = convertTemperature(max, useCelsius);
    axis.innerHTML = `<span>${minConverted.toFixed(1)}${unit}</span><span>Avg Temp</span><span>${maxConverted.toFixed(1)}${unit}</span>`;
    wrap.appendChild(axis);
}

console.log("Script loaded - version 2");

init();

async function init() {
    const us = await d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");
    statesMesh = topojson.feature(us, us.objects.states);
    nameToFeature = new Map(statesMesh.features.map(f => [fixName(f.properties && f.properties.name), f]));

    let rows = [];
    console.log("Using fallback data (CSV file not available)");
    rows = fallbackRows;

    const nested = d3.group(rows, d => d.state);
    stateYearMap = new Map(
        Array.from(nested, ([state, arr]) => [state, new Map(arr.map(r => [r.year, r.temp_f]))])
    );

    const allYears = Array.from(new Set(rows.map(r => r.year))).sort((a, b) => a - b);
    yearsDomain = [allYears[0], allYears[allYears.length - 1]];
    selectedYear = clamp(+yearInput.value || yearsDomain[0], yearsDomain[0], yearsDomain[1]);
    yearInput.min = yearsDomain[0];
    yearInput.max = yearsDomain[1];
    yearInput.value = selectedYear;
    yearLabel.textContent = selectedYear;

    updateColorDomainForYear(selectedYear);
    renderLegend(color, document.getElementById("legend"));

    const projection = d3.geoAlbersUsa().fitSize([MAP_W, MAP_H], statesMesh);
    const path = d3.geoPath(projection);

    const g = mapSvg.append("g");
    console.log("Creating map with", statesMesh.features.length, "states");
    g.selectAll("path.state")
        .data(statesMesh.features)
        .join("path")
        .attr("class", "state")
        .attr("d", path)
        .attr("fill", d => {
            const name = fixName(d.properties && d.properties.name);
            const val = stateYearMap.get(name)?.get(selectedYear);
            return val != null ? color(val) : "#2a3557";
        })
        .on("mousemove", (event, d) => {
            const name = fixName(d.properties && d.properties.name);
            const val = stateYearMap.get(name)?.get(selectedYear);
            tooltip
                .style("opacity", 1)
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY + 12) + "px")
                .html(`
          <div><strong>${name}</strong></div>
          <div>${selectedYear}: ${val != null ? formatTemperature(val, useCelsius) : "No data"}</div>
        `);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0))
        .on("click", (event, d) => {
            const name = fixName(d.properties && d.properties.name);
            console.log("Clicked state:", name);
            window.location.href = `./state.html?state=${encodeURIComponent(name)}`;
        });

    unitToggle.addEventListener("change", () => {
        useCelsius = unitToggle.checked;
        unitLabel.textContent = useCelsius ? '°C' : '°F';
        updateColorDomainForYear(selectedYear);
        g.selectAll("path.state")
            .transition().duration(250)
            .attr("fill", d => {
                const name = fixName(d.properties && d.properties.name);
                const val = stateYearMap.get(name)?.get(selectedYear);
                return val != null ? color(val) : "#2a3557";
            });
    });

    yearInput.addEventListener("input", () => {
        selectedYear = +yearInput.value;
        yearLabel.textContent = selectedYear;
        updateColorDomainForYear(selectedYear);
        g.selectAll("path.state")
            .transition().duration(250)
            .attr("fill", d => {
                const name = fixName(d.properties && d.properties.name);
                const val = stateYearMap.get(name)?.get(selectedYear);
                return val != null ? color(val) : "#2a3557";
            });
    });

    drawStateView(null);
    drawLine(null);
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fixName(name) { return NAME_FIX.get(name) || name; }

function updateColorDomainForYear(year) {
    const vals = [];
    for (const [, byYear] of stateYearMap) {
        const v = byYear.get(year);
        if (v != null) vals.push(v);
    }
    if (vals.length) {
        const q10 = d3.quantile(vals, 0.10);
        const q90 = d3.quantile(vals, 0.90);
        color.domain([q10, q90]);
    } else {
        color.domain([40, 80]);
    }
    renderLegend(color, document.getElementById("legend"));
}

function drawStateView(stateName) {
    stateSvg.selectAll("*").remove();

    const g = stateSvg.append("g");
    if (!stateName || !nameToFeature.has(stateName)) {
        stateTitle.text("Click a state to open its focused view");
        g.append("text")
            .attr("x", STATE_W / 2)
            .attr("y", STATE_H / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#9ca3af")
            .text("No state selected");
        return;
    }

    const feature = nameToFeature.get(stateName);
    const projection = d3.geoAlbersUsa().fitSize([STATE_W, STATE_H], feature);
    const path = d3.geoPath(projection);

    const val = stateYearMap.get(stateName)?.get(selectedYear);
    const fill = val != null ? color(val) : "#2a3557";

    stateTitle.text(`${stateName} — ${selectedYear} Avg Temp ${val != null ? `${val.toFixed(2)}°F` : "(no data)"}`);

    g.append("path")
        .datum(feature)
        .attr("d", path)
        .attr("fill", fill)
        .attr("stroke", "#0b1022")
        .attr("stroke-width", 1.5);

    if (val != null) {
        const c = d3.geoPath(projection).centroid(feature);
        g.append("text")
            .attr("x", c[0])
            .attr("y", c[1])
            .attr("text-anchor", "middle")
            .attr("dy", "-0.6em")
            .attr("fill", "#e5e7eb")
            .style("font-weight", 600)
            .text(`${val.toFixed(1)}°F`);
    }
}

function drawLine(stateName) {
    lineSvg.selectAll("*").remove();

    const g = lineSvg.append("g").attr("transform", `translate(${MARGIN.l},${MARGIN.t})`);
    const innerW = LINE_W - MARGIN.l - MARGIN.r;
    const innerH = LINE_H - MARGIN.t - MARGIN.b;

    if (!stateName || !stateYearMap.has(stateName)) {
        detailTitle.text("Click a state to see its trend");
        g.append("text")
            .attr("x", innerW / 2)
            .attr("y", innerH / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#9ca3af")
            .text("No state selected");
        return;
    }
    detailTitle.text(`${stateName} — ${yearsDomain[0]}–${yearsDomain[1]} Avg Temp (°F)`);

    const series = Array.from(stateYearMap.get(stateName).entries())
        .map(([year, temp_f]) => ({ year: +year, temp_f: +temp_f }))
        .filter(d => d.year >= yearsDomain[0] && d.year <= yearsDomain[1])
        .sort((a, b) => a.year - b.year);

    if (!series.length) {
        g.append("text")
            .attr("x", innerW / 2)
            .attr("y", innerH / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#9ca3af")
            .text("No data");
        return;
    }

    const x = d3.scaleLinear().domain(d3.extent(series, d => d.year)).nice().range([0, innerW]);
    const y = d3.scaleLinear().domain(d3.extent(series, d => d.temp_f)).nice().range([innerH, 0]);

    const xAxis = d3.axisBottom(x).ticks(8).tickFormat(d3.format("d"));
    const yAxis = d3.axisLeft(y).ticks(6);

    g.append("g").attr("transform", `translate(0,${innerH})`).attr("class", "axis").call(xAxis);
    g.append("g").attr("class", "axis").call(yAxis);

    g.append("text")
        .attr("x", innerW)
        .attr("y", innerH + 32)
        .attr("text-anchor", "end")
        .attr("fill", "#9ca3af")
        .text("Year");

    g.append("text")
        .attr("x", 0)
        .attr("y", -8)
        .attr("text-anchor", "start")
        .attr("fill", "#9ca3af")
        .text("Average Temperature (°F)");

    const line = d3.line().x(d => x(d.year)).y(d => y(d.temp_f)).curve(d3.curveMonotoneX);

    g.append("path")
        .datum(series)
        .attr("fill", "none")
        .attr("stroke", "#22d3ee")
        .attr("stroke-width", 2)
        .attr("d", line);

    const sel = series.find(d => d.year === selectedYear);
    if (sel) {
        g.append("circle")
            .attr("cx", x(sel.year))
            .attr("cy", y(sel.temp_f))
            .attr("r", 4)
            .attr("fill", "#22d3ee")
            .attr("stroke", "#0b1022");

        g.append("text")
            .attr("x", x(sel.year) + 8)
            .attr("y", y(sel.temp_f) - 8)
            .attr("fill", "#e5e7eb")
            .text(`${sel.year}: ${sel.temp_f.toFixed(2)}°F`);
    }
}

