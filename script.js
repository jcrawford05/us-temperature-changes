// script.js — Global Temperature Visualization (U.S.)

const svg = d3.select("#map");
const tooltip = d3.select("#tooltip");
const width = +svg.attr("width");
const height = +svg.attr("height");

// Controls
const yearInput = d3.select("#year");
const yearLabel = d3.select("#year-label");
const unitToggle = d3.select("#unit-toggle");
const unitLabel = d3.select("#unit-label");
const dataToggle = d3.select("#data-toggle");

// Projection and path
const projection = d3.geoAlbersUsa().scale(1200).translate([width / 2, height / 2]);
const path = d3.geoPath().projection(projection);

// Color scales
const colorScaleF = d3.scaleSequential().domain([40, 80]).interpolator(d3.interpolateTurbo);
const colorScaleC = d3.scaleSequential().domain([5, 27]).interpolator(d3.interpolateTurbo);

let mapData, tempData = {}, currentDataset = "yearly";
let currentUnit = "F";
let currentValue = 2000;

// Load topoJSON and both datasets
Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
    d3.csv("data/state_yearly_avg.csv"),
    d3.csv("data/state_monthly_avg.csv")
]).then(([us, yearly, monthly]) => {
    mapData = topojson.feature(us, us.objects.states).features;

    // Process yearly data
    yearly.forEach(d => {
        d.Year = +d.Year;
        d.AvgTemp_F_Yearly = +d.AvgTemp_F_Yearly;
        d.AvgTemp_C_Yearly = +d.AvgTemp_C_Yearly;
    });

    // Process monthly data
    monthly.forEach(d => {
        d.dt = new Date(d.dt);
        d.Year = d.dt.getFullYear();
        d.Month = d.dt.getMonth() + 1;
        d.AvgTemp_F = +d.AvgTemp_F;
        d.AvgTemp_C = +d.AvgTemp_C;
    });

    tempData = { yearly, monthly };

    drawMap();
    updateMap(currentValue);
    buildLegend();
});

// Draw map base
function drawMap() {
    svg.selectAll(".state")
        .data(mapData)
        .join("path")
        .attr("class", "state")
        .attr("d", path)
        .on("mouseover", handleMouseOver)
        .on("mousemove", handleMouseMove)
        .on("mouseleave", handleMouseLeave);
}

// Update map for selected value
function updateMap(selectedValue) {
    let dataset = currentDataset === "yearly" ? tempData.yearly : tempData.monthly;
    const colorScale = currentUnit === "F" ? colorScaleF : colorScaleC;
    const key = currentUnit === "F"
        ? (currentDataset === "yearly" ? "AvgTemp_F_Yearly" : "AvgTemp_F")
        : (currentDataset === "yearly" ? "AvgTemp_C_Yearly" : "AvgTemp_C");

    let filtered;
    if (currentDataset === "yearly") {
        filtered = dataset.filter(d => d.Year === selectedValue);
        yearLabel.text(selectedValue);
    } else {
        const [month, year] = selectedValue.split("-").map(Number);
        filtered = dataset.filter(d => d.Year === year && d.Month === month);
        const monthName = new Date(year, month - 1).toLocaleString("default", { month: "short" });
        yearLabel.text(`${monthName}-${year}`);
    }

    const tempByState = new Map(filtered.map(d => [d.State, d[key]]));

    svg.selectAll(".state")
        .transition()
        .duration(400)
        .attr("fill", d => {
            const val = tempByState.get(d.properties.name);
            return val ? colorScale(val) : "#333";
        });
}

// Tooltip handlers
function handleMouseOver() { tooltip.style("opacity", 1); }
function handleMouseMove(event, d) {
    const dataset = currentDataset === "yearly" ? tempData.yearly : tempData.monthly;
    const key = currentUnit === "F"
        ? (currentDataset === "yearly" ? "AvgTemp_F_Yearly" : "AvgTemp_F")
        : (currentDataset === "yearly" ? "AvgTemp_C_Yearly" : "AvgTemp_C");

    let val;
    if (currentDataset === "yearly") {
        val = dataset.find(x => x.State === d.properties.name && x.Year === +currentValue)?.[key];
    } else {
        const [month, year] = currentValue.split("-").map(Number);
        val = dataset.find(x => x.State === d.properties.name && x.Year === year && x.Month === month)?.[key];
    }

    tooltip.html(`<strong>${d.properties.name}</strong><br>${val ? val.toFixed(2) + " °" + currentUnit : "No data"}`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
}
function handleMouseLeave() { tooltip.style("opacity", 0); }

// Build legend
function buildLegend() {
    const legend = d3.select("#legend");
    legend.selectAll("*").remove();
    const scale = currentUnit === "F" ? colorScaleF : colorScaleC;
    const [min, max] = scale.domain();
    const steps = 6;
    const range = d3.range(min, max, (max - min) / steps);
    range.forEach(v => {
        legend.append("div")
            .style("width", "40px")
            .style("height", "16px")
            .style("background", scale(v))
            .style("display", "inline-block");
    });
    legend.append("span")
        .text(` ${min.toFixed(0)}°${currentUnit} - ${max.toFixed(0)}°${currentUnit}`)
        .style("margin-left", "8px");
}

// Event listeners
yearInput.on("input", (event) => {
    currentValue = currentDataset === "yearly"
        ? +event.target.value
        : event.target.value; // keep as string for MM-YYYY
    updateMap(currentValue);
});

unitToggle.on("change", (event) => {
    currentUnit = event.target.checked ? "C" : "F";
    unitLabel.text("°" + currentUnit);
    updateMap(currentValue);
    buildLegend();
});

dataToggle.on("change", (event) => {
    currentDataset = event.target.value;

    if (currentDataset === "yearly") {
        yearInput.attr("min", 1800).attr("max", 2020).attr("step", 1);
        currentValue = 2000;
        yearInput.property("value", currentValue);
    } else {
        // Monthly: treat slider as index of months
        const startYear = 1800, endYear = 2020;
        const totalMonths = (endYear - startYear + 1) * 12;
        yearInput.attr("min", 0).attr("max", totalMonths - 1).attr("step", 1);
        yearInput.property("value", 0);
        currentValue = "1-1800";
    }

    updateMap(currentValue);
});

// Adjust displayed label for monthly view slider movement
yearInput.on("input", function(event) {
    if (currentDataset === "yearly") {
        currentValue = +this.value;
    } else {
        const startYear = 1800;
        const monthIndex = +this.value;
        const year = startYear + Math.floor(monthIndex / 12);
        const month = (monthIndex % 12) + 1;
        currentValue = `${month}-${year}`;
    }
    updateMap(currentValue);
});
