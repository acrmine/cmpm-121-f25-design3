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

// ************************************************
// *************** CLASSES AND TYPES ***************
// ************************************************

type Token = {
  posLatLng: leaflet.LatLng;
  value: number;
  marker: leaflet.Marker;
};

class Map {
  obj: leaflet.Map;
  origin: leaflet.LatLng;
  tokens: Token[] = [];

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
  }

  spawnCache(i: number, j: number, value: number = 1) {
    // Convert cell numbers into lat/lng bounds
    const bounds = leaflet.latLngBounds([
      [this.origin.lat + i * TILE_DEGREES, this.origin.lng + j * TILE_DEGREES],
      [
        this.origin.lat + (i + 1) * TILE_DEGREES,
        this.origin.lng + (j + 1) * TILE_DEGREES,
      ],
    ]);

    const tokenIcon = leaflet.divIcon({
      className: "token",
      html: `<div>${value}</div>`,
      iconSize: [25, 25],
    });

    // Add a token marker to the map
    const tokenMarker = leaflet.marker(bounds.getCenter(), { icon: tokenIcon });
    tokenMarker.addTo(this.obj);

    this.tokens.push({
      posLatLng: bounds.getCenter(),
      value: value,
      marker: tokenMarker,
    });

    tokenMarker.on("click", () => {
      if (inventory.holdingItem && inventory.heldItemValue !== value.toString()) {
        let temp = inventory.heldItemValue;
        inventory.holdItem(value.toString());

        let currIcon = tokenMarker.getIcon();
        currIcon = `<div>${temp}</div>`;
      }
    });
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
      this.currItem.style.backgroundColor = generateColor(parseInt(value));
    } else {
      this.currItem = document.createElement("div");
      this.currItem.className = "token";
      this.currItem.style.backgroundColor = generateColor(parseInt(value));
      this.currItem.innerText = value;
      this.invCont.appendChild(this.currItem);
    }
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

// Utility: convert HSL to RGB, used by color generator
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  // h in [0,360), s and l in [0,100]
  s /= 100;
  l /= 100;

  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  const r = Math.round(255 * f(0));
  const g = Math.round(255 * f(8));
  const b = Math.round(255 * f(4));
  return [r, g, b];
}

// Utility: generate a deterministic light/diffuse color from an integer seed.
function generateColor(seed: number): string {
  // Normalize seed to a 32-bit non-negative integer
  const s = Math.floor(seed) >>> 0;

  // Derive H, S, L deterministically from the seed
  const hue = (s * 2654435761) % 360; // Knuth multiplicative hashing then mod 360
  const sat = 40 + ((s >>> 8) % 20); // saturation between 40-59
  const light = 70 + ((s >>> 16) % 20); // lightness between 70-89 (light colors)

  const [r, g, b] = hslToRgb(hue, sat, light);

  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ************************************************
// *************** UI ELEMENTS *********************
// ************************************************

// Create the map centered on the classroom
const map = new Map(CLASSROOM_LATLNG, GAMEPLAY_ZOOM_LEVEL);

const inventory = new Inventory();

// Add a marker to represent the player
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map.obj);

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
