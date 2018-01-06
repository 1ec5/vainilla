"use strict";

let osmium = require("osmium");
let turf = require("@turf/turf");

let process = require("process");

/**
 * Returns the value of a tag on the given way, respecting directional variants
 * of the tag.
 *
 * @param tag {String} The base tag name, not including `:lanes`, `:backward`,
 *  or `:forward`.
 * @param way {Object} The tagged way.
 * @param progression {Number} A positive number for the forward direction or a
 *  negative number for the backward direction.
 * @param laneCount {Number} The number of lanes in the direction indicated by
 *  `progression`.
 * @returns {String} The tag value.
 */
function getTagsForProgression(tag, way, progression, laneCount) {
    let direction = progression > 0 ? "forward" : "backward";
    let wayTags = way.tags();
    let tags = wayTags[`${tag}:lanes:${direction}`] || wayTags[`${tag}:lanes`];
    if (tags) {
        return tags;
    }
    
    tags = wayTags[`${tag}:${direction}`] || wayTags[tag];
    if (tags && laneCount) {
        return new Array(laneCount).fill(tags).join("|");
    }
    return tags;
}

/**
 * Returns the number of lanes in the given way.
 *
 * @param way {Object} The way on which to count the lanes.
 * @param progression {Number} A positive number for the forward direction or a
 *  negative number for the backward direction. Omit this parameter to count all
 *  the lanes regardless of progression.
 * @returns {Number} The number of lanes in one direction, or the number of
 *  lanes in every direction if `progression` is omitted.
 */
function getLaneCount(way, progression) {
    let tags = way.tags();
    if (!progression) {
        if (tags.lanes) {
            return parseInt(tags.lanes);
        }
        // Service roads normally lack centerlines.
        if (tags.highway === "service") {
            return 1;
        }
        let laneCount = 0;
        if (tags.oneway !== "-1") {
            laneCount += getLaneCount(way, 1);
        }
        if (tags.oneway !== "yes") {
            laneCount += getLaneCount(way, -1);
        }
        return laneCount;
    }
    let direction = progression > 0 ? "forward" : "backward";
    let laneCount = parseInt(tags["lanes:" + direction]);
    let turnLanes = getTagsForProgression("turn", way, progression);
    if (turnLanes) {
        let turnLaneCount = turnLanes.split("|").length;
        laneCount = Math.max(laneCount || turnLaneCount, turnLaneCount);
    }
    if (!laneCount) {
        laneCount = parseInt(tags.lanes);
        if (!tags.oneway || tags.oneway === "no") {
            laneCount = Math.floor(laneCount / 2);
        }
    }
    return laneCount || 1;
}

let input = process.argv[2];
if (!input) {
    console.error("Usage: node index.js roads.osm.pbf");
    return;
}

let handler = new osmium.Handler();

let roadCount = 0;
let centerlineLength = 0;
let onewayCenterlineLength = 0;
let laneLength = 0;
let publicCenterlineLength = 0;
let onewayPublicCenterlineLength = 0;
let publicLaneLength = 0;
let interstateCenterlineLength = 0;
let interstateLaneLength = 0;
let freewayCenterlineLength = 0;
let freewayLaneLength = 0;
let turnLaneLength = 0;

let alleyLength = 0;
let drivewayLength = 0;
let parkingAisleLength = 0;
let driveThroughLength = 0;

let bikeLaneLength = 0;
let sharrowLength = 0;

handler.on("way", way => {
    let tags = way.tags();
    if (!tags.highway && !tags.cycleway && !tags.footway) {
        return;
    }
    
    let feature = way.geojson();
    let length = turf.length(feature, {
        units: "meters"
    });
    
    let isPublic = tags.highway !== "service" && (!tags.access || ["yes", "destination", "designated"].includes(tags.access));
    let isInterstate = tags.ref && tags.ref.startsWith("I ") && tags.highway !== "motorway_link";
    let isFreeway = tags.highway === "motorway";
    centerlineLength += length;
    if (isPublic) {
        publicCenterlineLength += length;
    }
    if (isInterstate) {
        interstateCenterlineLength += length;
    } else if (isFreeway) {
        freewayCenterlineLength += length;
    }
    
    roadCount++;
    if (Math.floor(roadCount / 100000) > Math.floor((roadCount - 1) / 100000)) {
        console.log(`${roadCount} ways spanning ${centerlineLength} meters`);
    }
    
    let isOneWay = tags.oneway === "yes" || tags.oneway === "-1";
    if (isOneWay && ["motorway", "trunk", "primary", "secondary", "tertiary"].includes(tags.highway)) {
        onewayCenterlineLength += length;
        if (isPublic) {
            onewayPublicCenterlineLength += length;
        }
    }
    
    if (tags.highway === "service") {
        switch (tags.service) {
            case "alley":
                alleyLength += length;
                break;
            case "driveway":
                drivewayLength += length;
                break;
            case "parking_aisle":
                parkingAisleLength += length;
                break;
            case "drive-through":
            case "drive_through":
                driveThroughLength += length;
                break;
        }
    }
    
    let wayLaneLength = length * getLaneCount(way);
    laneLength += wayLaneLength;
    if (isPublic) {
        publicLaneLength += wayLaneLength;
    }
    if (isInterstate) {
        interstateLaneLength += wayLaneLength;
    } else if (isFreeway) {
        freewayLaneLength += wayLaneLength;
    }
    
    let isTurnChannel = (tags.turn || (tags.lanes === "1") || (!tags.lanes)) && isOneWay &&
        (tags.highway === "service" || tags.highway.includes("_link"));
    if (!isTurnChannel) {
        if (tags.oneway !== "-1") {
            let turnLanes = getTagsForProgression("turn", way, 1, getLaneCount(way, 1));
            let turnLaneCount = turnLanes ? turnLanes.split("|").filter(lane => lane && lane !== "through" && !lane.includes("merge")).length : 0;
            turnLaneLength += turnLaneCount * length;
        }
        if (tags.oneway !== "yes") {
            let turnLanes = getTagsForProgression("turn", way, -1, getLaneCount(way, -1));
            let turnLaneCount = turnLanes ? turnLanes.split("|").filter(lane => lane && lane !== "through" && !lane.includes("merge")).length : 0;
            turnLaneLength += turnLaneCount * length;
        }
    }
    
    if (isOneWay) {
        if (tags.cycleway === "lane" || tags["cycleway:left"] === "lane" || tags["cycleway:right"] === "lane") {
            bikeLaneLength += length;
        }
        if (tags.cycleway === "shared_lane" || tags["cycleway:left"] === "shared_lane" || tags["cycleway:right"] === "shared_lane") {
            sharrowLength += length;
        }
    } else {
        if (tags.cycleway === "lane" || tags["cycleway:left"] === "lane") {
            bikeLaneLength += length;
        }
        if (tags.cycleway === "lane" || tags["cycleway:right"] === "lane") {
            bikeLaneLength += length;
        }
        if (tags.cycleway === "shared_lane" || tags["cycleway:left"] === "shared_lane") {
            sharrowLength += length;
        }
        if (tags.cycleway === "shared_lane" || tags["cycleway:right"] === "shared_lane") {
            sharrowLength += length;
        }
    }
});

let buildingCount = 0;
let buildingCoverArea = 0;

handler.on("area", area => {
    if (!area.tags("building")) {
        return;
    }
    let feature;
    try {
        feature = area.geojson();
    } catch (e) {
        console.warn("Degenerate area:", area);
        return;
    }
    let squareMeters = turf.area(feature, {
        units: "meters"
    });
    
    buildingCoverArea += squareMeters;
    
    buildingCount++;
    if (Math.floor(buildingCount / 100000) > Math.floor((buildingCount - 1) / 100000)) {
        console.log(`${buildingCount} areas covering ${buildingCoverArea} square meters`);
    }
});

let file = new osmium.File(input);
let mp = new osmium.MultipolygonCollector();
let reader = new osmium.BasicReader(file, { node: false, way: true, relation: true });
mp.read_relations(reader);
reader.close();

reader = new osmium.Reader(file);
let locationHandler = new osmium.LocationHandler();
osmium.apply(reader, locationHandler, mp.handler(handler));
reader.close();

console.log("----");
console.log("Interstates:");
console.log(`\t${interstateCenterlineLength / 2} centerline meters`);
console.log(`\t${interstateLaneLength} lane meters`);
console.log("Other freeways and expressways:");
console.log(`\t${freewayCenterlineLength / 2} centerline meters`);
console.log(`\t${freewayLaneLength} lane meters`);
console.log("Public roadways:");
console.log(`\tFrom ${publicCenterlineLength - onewayPublicCenterlineLength / 2} to ${publicCenterlineLength} centerline meters`);
console.log(`\t${publicLaneLength} lane meters`);
console.log("Service roads:");
console.log(`\t${alleyLength} meters of alleys`);
console.log(`\t${drivewayLength} meters of driveways`);
console.log(`\t${parkingAisleLength} meters of parking aisles`);
console.log(`\t${driveThroughLength} meters of drive-throughs`);
console.log("All roadways:");
console.log(`\tFrom ${centerlineLength - onewayCenterlineLength / 2} to ${centerlineLength} centerline meters`);
console.log(`\t${laneLength} lane meters`);
console.log("Attributes:");
console.log(`\t${turnLaneLength} meters of turn lanes`);
console.log(`\t${bikeLaneLength} meters of bike lanes`);
console.log(`\t${sharrowLength} meters of sharrows`);

console.log("----");
console.log("Buildings:");
console.log(`\t${buildingCoverArea} square meters of buildings`);
