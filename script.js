// script.js — Global Temperature Visualization (U.S.)

// SVG and tooltip setup
const svg = d3.select("#map");
const tooltip = d3.select("#tooltip");
const width = +svg.attr("width");
const height = +svg.attr("height");

// Controls
const yearInput = d3.select("#year");
const yearLabel = d3.select("#year-label");
const unitToggle = d3.select("#unit-toggle");
const unitLabel = d3.select("#unit-label");

// Projection and path
const projection = d3.geoAlbersUsa().scale(1200).translate([width / 2, height / 2]);
const path = d3.geoPath().projection(projection);

// Color scales (for °F and °C)
const colorScaleF = d3.scaleSequential()
    .domain([40, 80]) // Adjust as needed
    .interpolator(d3.interpolateTurbo);

const colorScaleC = d3.scaleSequential()
    .domain([5, 27]) // Adjust as needed
    .interpolator(d3.interpolateTurbo);

let mapData, tempData;
let currentUnit = "F";
let currentYear = +yearInput.property("value");

// Load map and data
Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
    d3.csv("data/state_yearly_avg.csv")
]).then(([us, data]) => {
    mapData = topojson.feature(us, us.objects.states).features;

    // Clean and typecast CSV data
    data.forEach(d => {
        d.Year = +d.Year;
        d.AvgTemp_F_Yearly = +d.AvgTemp_F_Yearly;
        d.AvgTemp_C_Yearly = +d.AvgTemp_C_Yearly;
    });
    tempData = data;

    drawMap();
    updateMap(currentYear);
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

// Update map coloring for selected year
function updateMap(selectedYear) {
    yearLabel.text(selectedYear);
    const yearData = tempData.filter(d => d.Year === selectedYear);
    const key = currentUnit === "F" ? "AvgTemp_F_Yearly" : "AvgTemp_C_Yearly";
    const colorScale = currentUnit === "F" ? colorScaleF : colorScaleC;
    const tempByState = new Map(yearData.map(d => [d.State, d[key]]));

    svg.selectAll(".state")
        .transition()
        .duration(400)
        .attr("fill", d => {
            const val = tempByState.get(d.properties.name);
            return val ? colorScale(val) : "#333";
        });
}

// Tooltip handlers
function handleMouseOver(event, d) {
    tooltip.style("opacity", 1);
}
function handleMouseMove(event, d) {
    const yearData = tempData.filter(x => x.Year === currentYear);
    const key = currentUnit === "F" ? "AvgTemp_F_Yearly" : "AvgTemp_C_Yearly";
    const val = yearData.find(x => x.State === d.properties.name)?.[key];
    tooltip
        .html(`<strong>${d.properties.name}</strong><br>${val ? val.toFixed(2) + " °" + currentUnit : "No data"}`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
}
function handleMouseLeave() {
    tooltip.style("opacity", 0);
}

// Build color legend
function buildLegend() {
    const legend = d3.select("#legend");
    legend.selectAll("*").remove();

    const scale = currentUnit === "F" ? colorScaleF : colorScaleC;
    const min = scale.domain()[0];
    const max = scale.domain()[1];
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
    currentYear = +event.target.value;
    updateMap(currentYear);
});

unitToggle.on("change", (event) => {
    currentUnit = event.target.checked ? "C" : "F";
    unitLabel.text("°" + currentUnit);
    updateMap(currentYear);
    buildLegend();
});
