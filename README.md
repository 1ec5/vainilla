# Vainilla

A command line tool that generates statistics from a vanilla extract of [OpenStreetMap](https://www.openstreetmap.org/).

## Serving suggestions

You’ll need these ingredients:

* 1 [Osmium](http://osmcode.org/osmium-tool/) command line tool
* 1 [Node.js](https://nodejs.org/) (known to work in v8.9.1)
* 1 fresh, PBF-flavored [regional extract](http://download.geofabrik.de/) from Geofabrik

Baking statistics is easy:

1. Clone this repository and run `npm install` to install Vainilla’s dependencies.
1. Run Vainilla on the filtered extract:
   ```
   node index.js region.osm.pbf
   ```

Wait until you see a golden brown crust of centerline and lane lengths in meters. Let sit for a few moments, top with a building acreage, then serve on the appropriate OpenStreetMap Wiki page ([example](https://wiki.openstreetmap.org/wiki/Ohio/Statistics)).

## About the name

_Vainilla_ is the Spanish word for vanilla. This tool allows local OpenStreetMap communities to show off, perhaps _vainly_, how much progress they’ve made towards a complete map, using a plain-vanilla extract of OpenStreetMap as input.
