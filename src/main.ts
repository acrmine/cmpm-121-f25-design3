// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // student-controlled page style

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images

// Import our luck function
import luck from "./_luck.ts";

// ************************************************
// *************** CONSTANTS ***********************
// ************************************************

// Our classroom location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;
const INTERACTION_RADIUS = 0.0003; // 3 times TILE_DEGREES

// ************************************************
// *************** CLASSES AND TYPES ***************
// ************************************************

type Coord = {
  x: number;
  y: number;
};

interface Cache {
  posCoord: { i: number; j: number };
  rectangle: leaflet.Rectangle;
  tokens: Map<leaflet.Marker, number>;
}

// class _TokenBad {
//   posLatLng: leaflet.LatLng;
//   value: number;
//   containingMap: leaflet.Map;
//   marker: leaflet.Marker | null = null;

//   constructor(x: number, y: number, map: leaflet.Map, value: number = 1, origin: leaflet.LatLng = CLASSROOM_LATLNG) {
//     this.value = value;
//     this.containingMap = map;

//     const bounds = leaflet.latLngBounds([
//       [origin.lat + x * TILE_DEGREES, origin.lng + y * TILE_DEGREES],
//       [
//         origin.lat + (x + 1) * TILE_DEGREES,
//         origin.lng + (y + 1) * TILE_DEGREES,
//       ],
//     ]);
//     this.posLatLng = bounds.getCenter();

//     this.marker = leaflet.marker(bounds.getCenter(), { icon: this.getStdMarkerIcon(value.toString()) });
//     this.marker.addTo(map);

//     this.marker.on("click", () => {
//       this.onTokenClick();
//     });
//   }

//   getStdMarkerIcon(value: string) {
//     const tokenIcon = leaflet.divIcon({
//       className: "token",
//       html: `<div>${value}</div>`,
//       iconSize: [25, 25],
//     });
//     return tokenIcon;
//   }

//   onTokenClick() {
//     if (inventory.holdingItem) {
//       if (inventory.heldItemValue !== this.value.toString()) {
//         const temp = inventory.heldItemValue;
//         inventory.holdItem(this.value.toString());

//         if (temp !== null) {
//           this.marker!.setIcon(this.getStdMarkerIcon(temp));
//           this.value = parseInt(temp);
//         }
//       } else {
//         inventory.removeHeldItem();
//         this.marker!.setIcon(this.getStdMarkerIcon((this.value * 2).toString()));
//         this.value *= 2;
//       }
//     } else if (!inventory.holdingItem) {
//       inventory.holdItem(this.value.toString());
//       this.marker!.remove();
//       this.marker = null;
//     }
//   }
// }

class LeafletMap {
  obj: leaflet.Map;
  origin: leaflet.LatLng;
  caches: Map<string, Cache> = new Map();

  constructor(center: leaflet.LatLng, zoom: number) {
    this.origin = center;

    const mapDiv = document.createElement("div");
    mapDiv.id = "map";
    document.body.append(mapDiv);

    this.obj = leaflet.map(mapDiv, {
      center: center,
      zoom: zoom,
      minZoom: zoom,
      maxZoom: zoom,
      zoomControl: false,
      scrollWheelZoom: false,
    });

    // Populate the map with a background tile layer
    leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.obj);

    // Handle clicks on the map
    this.obj.on("click", (e: leaflet.LeafletMouseEvent) => {
      const clickLatLng = e.latlng;
      const clickCoord = coordsFromLatLng(clickLatLng, this.origin);
      const cache = this.getCacheAtCoord(clickCoord);
      if (!cache || distanceInDegrees(clickLatLng, this.origin) > INTERACTION_RADIUS) {
        return;
      }
      if (inventory.holdingItem) {
        this.addCacheToken(cache, parseInt(inventory.heldItemValue!), clickLatLng);
        inventory.removeHeldItem();
      }
    });
  }

  getCacheAtCoord(coord: Coord): Cache | undefined {
    return this.caches.get(`${coord.x},${coord.y}`);
  }

  setCacheAtCoord(coord: Coord, cache: Cache) {
    this.caches.set(`${coord.x},${coord.y}`, cache);
  }

  onTokenClick(e: leaflet.LeafletMouseEvent) {
    const tokenMarker = e.target as leaflet.Marker;
    const cache = this.getCacheAtCoord(coordsFromLatLng(tokenMarker.getLatLng(), this.origin));
    const tokenValue = cache?.tokens.get(tokenMarker);

    if (cache === undefined || tokenValue === undefined || distanceInDegrees(tokenMarker.getLatLng(), this.origin) > INTERACTION_RADIUS) {
      return;
    }

    if (inventory.holdingItem) {
      if (inventory.heldItemValue !== tokenValue.toString()) {
        const temp = inventory.heldItemValue;
        inventory.holdItem(tokenValue.toString());

        if (temp !== null) {
          tokenMarker.setIcon(this.getStdMarkerIcon(temp));
          cache.tokens.set(tokenMarker, parseInt(temp));
        }
      } else {
        inventory.removeHeldItem();
        tokenMarker.setIcon(this.getStdMarkerIcon((tokenValue * 2).toString()));
        cache.tokens.set(tokenMarker, tokenValue * 2);
      }
    } else if (!inventory.holdingItem) {
      inventory.holdItem(tokenValue.toString());
      tokenMarker.remove();
      cache.tokens.delete(tokenMarker);
    }
  }

  getStdMarkerIcon(value: string) {
    return leaflet.divIcon({
      className: "token",
      html: `<div>${value}</div>`,
      iconSize: [25, 25],
    });
  }

  spawnCache(i: number, j: number, startingTokenValue: number) {
    // Convert cell numbers into lat/lng bounds
    const bounds = leaflet.latLngBounds([
      [this.origin.lat + i * TILE_DEGREES, this.origin.lng + j * TILE_DEGREES],
      [this.origin.lat + (i + 1) * TILE_DEGREES, this.origin.lng + (j + 1) * TILE_DEGREES],
    ]);

    // Add a rectangle to the map to represent the cache
    const rect = leaflet.rectangle(bounds);
    rect.addTo(this.obj);

    const cacheTokens = new Map<leaflet.Marker, number>();
    const cache: Cache = {
      posCoord: { i, j },
      rectangle: rect,
      tokens: cacheTokens,
    };
    this.addCacheToken(cache, startingTokenValue, bounds.getCenter());
    this.setCacheAtCoord({ x: i, y: j }, cache);
  }

  addCacheToken(cache: Cache, value: number, posLatLng: leaflet.LatLng) {
    if (cache) {
      const tokenMarker = leaflet.marker(posLatLng);
      tokenMarker.setIcon(this.getStdMarkerIcon(value.toString()));
      tokenMarker.addTo(this.obj);

      cache.tokens.set(tokenMarker, value);
      tokenMarker.on("click", (e: leaflet.LeafletMouseEvent) => {
        this.onTokenClick(e);
      });
    }
  }
}

class Inventory {
  currItem: HTMLDivElement | null;
  invCont: HTMLDivElement;
  invHeader: HTMLHeadingElement;

  headerText: string = "Held Item:";

  constructor() {
    this.currItem = null;
    this.invCont = document.createElement("div");
    this.invCont.id = "inventory";
    document.body.appendChild(this.invCont);

    this.invHeader = document.createElement("h3");
    this.invHeader.innerText = this.headerText;
    this.invCont.appendChild(this.invHeader);
  }

  get holdingItem(): boolean {
    return this.currItem !== null;
  }

  get heldItemValue(): string | null {
    return this.currItem !== null ? this.currItem.innerText : null;
  }

  removeHeldItem() {
    if (this.currItem !== null) {
      this.currItem.remove();
      this.currItem = null;
    }
  }

  holdItem(value: string) {
    if (this.currItem !== null) {
      this.currItem.innerText = value;
    } else {
      this.currItem = document.createElement("div");
      this.currItem.className = "token";
      this.currItem.innerText = value;
      this.invCont.appendChild(this.currItem);
    }
  }
}

class Player {
  posLatLng: leaflet.LatLng;
  marker: leaflet.Marker;

  constructor(poslatlng: leaflet.LatLng, map: leaflet.Map) {
    this.posLatLng = poslatlng;
    this.marker = leaflet.marker(poslatlng);
    this.marker.bindTooltip("That's you!");
    this.marker.addTo(map);
  }
}

// ************************************************
// *************** UTILITY FUNCTIONS ***************
// ************************************************

// Utility: function that generates a random integer in [min, max) heavily weighted towards min
function randInt(min: number, max: number): number {
  const range = max - min;
  const r = Math.pow(Math.random(), 3); // cubic bias towards 0
  return min + Math.floor(r * range);
}

// Utility: function that computes the coords of a lat/lng point relative to an origin with units of size TILE_DEGREES
function coordsFromLatLng(latlng: leaflet.LatLng, origin: leaflet.LatLng): Coord {
  const latDiff = latlng.lat - origin.lat;
  const lngDiff = latlng.lng - origin.lng;
  return {
    x: Math.floor(latDiff / TILE_DEGREES),
    y: Math.floor(lngDiff / TILE_DEGREES),
  };
}

// Utility: function that computes the distance between two lat/lng points in degrees
function distanceInDegrees(a: leaflet.LatLng, b: leaflet.LatLng): number {
  const latDiff = b.lat - a.lat;
  const lngDiff = b.lng - a.lng;
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}

// Utility: function that prints the contents of a map (for debugging)
function _printMapContents(map: Map<Coord, Cache>) {
  console.log("Map contents:");
  map.forEach((value: Cache, key: Coord) => {
    console.log("Key: ", key, " Value: ", value);
  });
}

// ************************************************
// *************** UI ELEMENTS *********************
// ************************************************

// Create the map centered on the classroom
const map = new LeafletMap(CLASSROOM_LATLNG, GAMEPLAY_ZOOM_LEVEL);

const inventory = new Inventory();

// create a player object which will add a marker to represent the player
const _player = new Player(CLASSROOM_LATLNG, map.obj);

// ************************************************
// *************** MAIN PROGRAM ********************
// ************************************************

// Look around the player's neighborhood for caches to spawn
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    // If location i,j is lucky enough, spawn a cache!
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      map.spawnCache(i, j, Math.pow(2, randInt(0, 3)));
    }
  }
}
