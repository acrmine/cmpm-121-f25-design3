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

class Token {
  posLatLng: leaflet.LatLng;
  value: number;
  containingMap: leaflet.Map;
  marker: leaflet.Marker | null = null;

  constructor(x: number, y: number, map: leaflet.Map, value: number = 1, origin: leaflet.LatLng = CLASSROOM_LATLNG) {
    this.value = value;
    this.containingMap = map;

    const bounds = leaflet.latLngBounds([
      [origin.lat + x * TILE_DEGREES, origin.lng + y * TILE_DEGREES],
      [
        origin.lat + (x + 1) * TILE_DEGREES,
        origin.lng + (y + 1) * TILE_DEGREES,
      ],
    ]);
    this.posLatLng = bounds.getCenter();

    this.marker = leaflet.marker(bounds.getCenter(), { icon: this.getStdMarkerIcon(value.toString()) });
    this.marker.addTo(map);

    this.marker.on("click", this.onTokenClick);
  }

  getStdMarkerIcon(value: string) {
    const tokenIcon = leaflet.divIcon({
      className: "token",
      html: `<div>${value}</div>`,
      iconSize: [25, 25],
    });
    return tokenIcon;
  }

  onTokenClick() {
    if (inventory.holdingItem) {
      if (inventory.heldItemValue !== this.value.toString()) {
        const temp = inventory.heldItemValue;
        inventory.holdItem(this.value.toString());

        if (temp !== null) {
          this.marker!.setIcon(this.getStdMarkerIcon(temp));
        }
      } else {
        inventory.removeHeldItem();
        this.marker!.setIcon(this.getStdMarkerIcon((this.value * 2).toString()));
      }
    } else if (!inventory.holdingItem) {
      inventory.holdItem(this.value.toString());
    }
  }
}

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

  updateMarkerIcon(marker: leaflet.Marker, value: string) {
    const tokenIcon = leaflet.divIcon({
      className: "token",
      html: `<div>${value}</div>`,
      iconSize: [25, 25],
    });
    marker.setIcon(tokenIcon);
  }

  spawnCache(i: number, j: number, value: number = 1) {
    this.tokens.push(new Token(i, j, this.obj, value, this.origin));
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

// ************************************************
// *************** UTILITY FUNCTIONS ***************
// ************************************************

// Utility: function that generates a random integer in [min, max) heavily weighted towards min
function randInt(min: number, max: number): number {
  const range = max - min;
  const r = Math.pow(Math.random(), 3); // cubic bias towards 0
  return min + Math.floor(r * range);
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
