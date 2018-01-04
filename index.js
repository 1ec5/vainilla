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
    let progressions = {
        forward: tags.oneway !== "-1",
        backward: tags.oneway !== "yes"
    };
    let direction = progression > 0 ? "forward" : "backward";
    let laneCount = parseInt(tags["lanes:" + direction]);
    let turnLanes = getTagsForProgression("turn", way, progression);
    if (turnLanes) {
        let turnLaneCount = turnLanes.split("|").length;
        laneCount = Math.max(laneCount || turnLaneCount, turnLaneCount);
    }
    if (!laneCount) {
        laneCount = parseInt(tags.lanes);
        if (progressions.forward && progressions.backward) {
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

let reader = new osmium.Reader(input, { node: true, way: true });
let handler = new osmium.Handler();
let location_handler = new osmium.LocationHandler();

let roadCount = 0;
let centerlineLength = 0;
let onewayCenterlineLength = 0;
let laneLength = 0;
let publicCenterlineLength = 0;
let onewayPublicCenterlineLength = 0;
let publicLaneLength = 0;
let interstateCenterlineLength = 0;
let interstateLaneLength = 0;

handler.on("way", way => {
    let coords = way.geojson().coordinates;
    let line = turf.lineString(coords);
    let length = turf.length(line, {
        units: "meters"
    });
    
    roadCount++;
    if (Math.floor(roadCount / 100000) > Math.floor((roadCount - 1) / 100000)) {
        console.log(`${roadCount} ways spanning ${centerlineLength} meters`);
    }
    
    let tags = way.tags();
    let isPublic = tags.highway !== "service" && (!tags.access || ["yes", "destination", "designated"].includes(tags.access));
    let isInterstate = tags.ref && tags.ref.startsWith("I ");
    centerlineLength += length;
    if (isPublic) {
        publicCenterlineLength += length;
    }
    if (isInterstate) {
        interstateCenterlineLength += length;
    }
    
    if ((tags.oneway === "yes" || tags.oneway === "-1") && ["motorway", "trunk", "primary", "secondary", "tertiary"].includes(tags.highway)) {
        onewayCenterlineLength += length;
        if (isPublic) {
            onewayPublicCenterlineLength += length;
        }
    }
    
    let wayLaneLength = length * getLaneCount(way);
    laneLength += wayLaneLength;
    if (isPublic) {
        publicLaneLength += wayLaneLength;
    }
    if (isInterstate) {
        interstateLaneLength += wayLaneLength;
    }
});
osmium.apply(reader, location_handler, handler);
console.log("----");
console.log("Interstates:");
console.log(`\t${interstateCenterlineLength / 2} centerline meters`);
console.log(`\t${interstateLaneLength} lane meters`);
console.log("Public roadways:");
console.log(`\tFrom ${publicCenterlineLength - onewayPublicCenterlineLength / 2} to ${publicCenterlineLength} centerline meters`);
console.log(`\t${publicLaneLength} lane meters`);
console.log("All roadways:");
console.log(`\tFrom ${centerlineLength - onewayCenterlineLength / 2} to ${centerlineLength} centerline meters`);
console.log(`\t${laneLength} lane meters`);
