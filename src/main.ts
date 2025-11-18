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

// Centering coordinates on latitude 0 and longitude 0
const COORD_ORIGIN = leaflet.latLng(0, 0);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const CACHE_SPAWN_PROBABILITY = 0.1;
const INTERACTION_RADIUS = 0.0003; // 3 times TILE_DEGREES

const VICTORY_CONDITION = 64;

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

class LeafletMap {
  obj: leaflet.Map;
  origin: leaflet.LatLng;
  caches: Map<string, Cache> = new Map();
  cachedCaches: Map<string, Map<leaflet.LatLng, number> | null> = new Map();

  winStatus: HTMLDivElement;

  constructor(startingFocus: leaflet.LatLng, zoom: number, coordOrigin: leaflet.LatLng) {
    this.origin = coordOrigin;
    this.winStatus = this.createVictoryStatus();

    const mapDiv = document.createElement("div");
    mapDiv.id = "map";
    document.body.append(mapDiv);

    this.obj = leaflet.map(mapDiv, {
      center: startingFocus,
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

    this.loadFromStorage();
    this.spawnCachesInBounds(this.obj.getBounds());

    // Handle clicks on the map
    this.obj.on("click", (e: leaflet.LeafletMouseEvent) => {
      const clickLatLng = e.latlng;
      const clickCoord = coordsFromLatLng(clickLatLng);
      const cache = this.getCacheAtCoord(clickCoord);
      if (!cache || distanceInDegrees(clickLatLng, player.posLatLng) > INTERACTION_RADIUS) {
        return;
      }
      if (inventory.holdingItem) {
        this.addCacheToken(cache, parseInt(inventory.heldItemValue!), clickLatLng);
        inventory.removeHeldItem();
      }
    });

    // Handle map movements to spawn/remove caches
    this.obj.on("moveend", () => {
      const bounds = this.obj.getBounds();
      this.removeOutOfBoundsCaches(bounds);
      this.spawnCachesInBounds(bounds);
    });
  }

  loadFromStorage() {
    const stowedCachedCaches = localStorage.getItem("cachedCaches");
    if (stowedCachedCaches) {
      this.stringToCachedCaches(stowedCachedCaches);
    }
  }

  onTokenClick(e: leaflet.LeafletMouseEvent) {
    const tokenMarker = e.target as leaflet.Marker;
    const cache = this.getCacheAtCoord(coordsFromLatLng(tokenMarker.getLatLng()));
    const tokenValue = cache?.tokens.get(tokenMarker);

    if (
      cache === undefined ||
      tokenValue === undefined ||
      distanceInDegrees(tokenMarker.getLatLng(), player.posLatLng) > INTERACTION_RADIUS
    ) {
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

    // Check for victory condition
    if (inventory.heldItemValue === VICTORY_CONDITION.toString()) {
      this.winStatus.innerText = `You Got a ${VICTORY_CONDITION} Token! You Win!`;
    }
  }

  getCacheAtCoord(coord: Coord): Cache | undefined {
    return this.caches.get(`${coord.x},${coord.y}`);
  }

  setCacheAtCoord(coord: Coord, cache: Cache) {
    this.caches.set(`${coord.x},${coord.y}`, cache);
  }

  getStowedCache(coord: Coord): Map<leaflet.LatLng, number> | null | undefined {
    const key = `${coord.x},${coord.y}`;
    const cache = this.cachedCaches.get(key);
    if (cache !== undefined) {
      this.cachedCaches.delete(key);
    }
    return cache;
  }

  getStdMarkerIcon(value: string) {
    return leaflet.divIcon({
      className: "token",
      html: `<div>${value}</div>`,
      iconSize: [25, 25],
    });
  }

  createVictoryStatus() {
    const winStatus = document.createElement("div");
    winStatus.id = "win-status";
    winStatus.innerText = `Goal: get a token of value ${VICTORY_CONDITION}`;
    document.body.appendChild(winStatus);

    return winStatus;
  }

  spawnCache(i: number, j: number, startingTokenValue: number) {
    if (this.getCacheAtCoord({ x: i, y: j }) === undefined) {
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

      const stowedCache = this.getStowedCache({ x: i, y: j });
      if (stowedCache !== undefined) {
        if (stowedCache !== null) {
          stowedCache.forEach((value: number, posLatLng: leaflet.LatLng) => {
            this.addCacheToken(cache, value, posLatLng);
          });
        }
      } else {
        this.addCacheToken(cache, startingTokenValue, bounds.getCenter());
      }
      this.setCacheAtCoord({ x: i, y: j }, cache);
    }
  }

  deleteCache(cache: Cache) {
    if (cache) {
      const key = `${cache.posCoord.i},${cache.posCoord.j}`;
      cache.rectangle.remove();
      cache.tokens.forEach((_, marker: leaflet.Marker) => {
        marker.remove();
      });
      this.caches.delete(key);
    }
  }

  stowCache(cache: Cache) {
    if (cache) {
      const key = `${cache.posCoord.i},${cache.posCoord.j}`;
      if (cache.tokens.size > 0) {
        const tokenMap = new Map<leaflet.LatLng, number>();
        cache.tokens.forEach((value: number, marker: leaflet.Marker) => {
          tokenMap.set(marker.getLatLng(), value);
        });
        this.cachedCaches.set(key, tokenMap);
      } else {
        this.cachedCaches.set(key, null);
      }
      this.deleteCache(cache);
    }
  }

  cachedCachesToString() {
    let result = "";
    this.cachedCaches.forEach((tokenMap: Map<leaflet.LatLng, number> | null, key: string) => {
      result += `Cache at (${key}):\n`;
      if (tokenMap !== null) {
        tokenMap.forEach((value: number, posLatLng: leaflet.LatLng) => {
          result += `  Token at ${posLatLng.toString()}: ${value}\n`;
        });
      } else {
        result += "  No tokens\n";
      }
    });
    return result;
  }

  stringToCachedCaches(dataStr: string) {
    const lines = dataStr.split("\n");
    let currentKey: string | null = null;

    for (const rawLine of lines) {
      const line = rawLine; // keep original spacing for some parsing, use trimmed when helpful
      if (line.startsWith("Cache at ")) {
        currentKey = substringBetween(line, "()");
      } else if (currentKey !== null) {
        const trimmed = line.trim();
        if (trimmed === "") {
          continue;
        }

        if (trimmed === "No tokens") {
          this.cachedCaches.set(currentKey, null);
          continue;
        }

        if (trimmed.startsWith("Token at ")) {
          // trimmed looks like: "Token at (lat, lng): <value>"
          const idx = trimmed.lastIndexOf(": ");
          if (idx === -1) {
            continue;
          }
          const posPart = trimmed.substring("Token at ".length, idx);
          const valPart = trimmed.substring(idx + 2);
          const posLatLng = latLngFromString(posPart);
          const value = parseInt(valPart);
          if (!isNaN(posLatLng.lat) && !isNaN(posLatLng.lng) && !isNaN(value)) {
            const existing = this.cachedCaches.get(currentKey);
            if (existing === undefined || existing === null) {
              const m = new Map<leaflet.LatLng, number>();
              m.set(posLatLng, value);
              this.cachedCaches.set(currentKey, m);
            } else {
              existing.set(posLatLng, value);
              this.cachedCaches.set(currentKey, existing);
            }
          }
        }
      }
    }
  }

  addCacheToken(cache: Cache, value: number, posLatLng: leaflet.LatLng) {
    if (cache && value >= 1) {
      const tokenMarker = leaflet.marker(posLatLng);
      tokenMarker.setIcon(this.getStdMarkerIcon(value.toString()));
      tokenMarker.addTo(this.obj);

      cache.tokens.set(tokenMarker, value);
      tokenMarker.on("click", (e: leaflet.LeafletMouseEvent) => {
        this.onTokenClick(e);
      });
    }
  }

  spawnCachesInBounds(bounds: leaflet.LatLngBounds) {
    const bottomLeftCoord = coordsFromLatLng(bounds.getSouthWest());
    const topRightCoord = coordsFromLatLng(bounds.getNorthEast());

    for (let i = bottomLeftCoord.x - 1; i <= topRightCoord.x + 1; i++) {
      for (let j = bottomLeftCoord.y - 1; j <= topRightCoord.y + 1; j++) {
        if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
          this.spawnCache(i, j, Math.pow(2, randInt(-1, 3)));
        }
      }
    }
  }

  removeOutOfBoundsCaches(bounds: leaflet.LatLngBounds) {
    this.caches.forEach((cache: Cache, _key: string) => {
      const cacheBounds = cache.rectangle.getBounds();
      if (!bounds.intersects(cacheBounds)) {
        this.stowCache(cache);
      }
    });
  }

  resetGame() {
    this.caches.forEach((cache: Cache, _key: string) => {
      this.deleteCache(cache);
    });
    this.cachedCaches.clear();
    this.winStatus.innerText = `Goal: get a token of value ${VICTORY_CONDITION}`;
    inventory.removeHeldItem();
    player.setPlayerPos(CLASSROOM_LATLNG);
    this.spawnCachesInBounds(this.obj.getBounds());
  }
}

class Inventory {
  currItem: HTMLDivElement | null;
  invCont: HTMLDivElement;
  elemCont: HTMLDivElement;
  invHeader: HTMLHeadingElement;

  headerText: string = "Held Item:";

  constructor() {
    this.currItem = null;

    this.invCont = document.createElement("div");
    this.invCont.classList.add("centered-horizontal");
    document.body.appendChild(this.invCont);

    this.elemCont = document.createElement("div");
    this.elemCont.id = "inventory";
    this.invCont.appendChild(this.elemCont);

    this.invHeader = document.createElement("h3");
    this.invHeader.innerText = this.headerText;
    this.elemCont.appendChild(this.invHeader);

    const heldItemStr = localStorage.getItem("heldItem");
    if (heldItemStr && heldItemStr !== "") {
      this.holdItem(heldItemStr);
    }
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
      this.elemCont.appendChild(this.currItem);
    }
  }
}

class Player {
  posLatLng: leaflet.LatLng;
  marker: leaflet.Marker;

  centerOnPlayer: boolean = true;
  moveWithGps: boolean = false;

  constructor(poslatlng: leaflet.LatLng, map: leaflet.Map) {
    this.posLatLng = poslatlng.clone();
    this.marker = leaflet.marker(poslatlng);
    this.marker.bindTooltip("That's you!");
    this.marker.addTo(map);

    const playerPosStr = localStorage.getItem("playerPos");
    if (playerPosStr) {
      this.setPlayerPos(latLngFromString(playerPosStr));
    }

    // Set up GPS movement if available
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition((position) => {
        if (this.moveWithGps) {
          const newLatLng = leaflet.latLng(
            position.coords.latitude,
            position.coords.longitude,
          );
          this.setPlayerPos(newLatLng);
        }
      });
    }
  }

  createMvmntButtons() {
    const leftRightPadding = "0 1rem";
    const upDownPadding = "0.5rem 1.2rem";

    // greater movement button container
    const mvmntBtnCont = document.createElement("div");
    mvmntBtnCont.classList.add("mvmntBtns");
    document.body.appendChild(mvmntBtnCont);

    const leftBtn = document.createElement("button");
    leftBtn.innerText = "←";
    leftBtn.style.padding = leftRightPadding;
    mvmntBtnCont.appendChild(leftBtn);
    leftBtn.onclick = () => {
      this.moveByTile("left");
    };

    // button that contains up and down buttons in the same spot
    const upDownBtnCont = document.createElement("div");
    upDownBtnCont.classList.add("mvmntBtns-upDown");
    mvmntBtnCont.appendChild(upDownBtnCont);

    const upBtn = document.createElement("button");
    upBtn.innerText = "↑";
    upBtn.style.padding = upDownPadding;
    upDownBtnCont.appendChild(upBtn);
    upBtn.onclick = () => {
      this.moveByTile("up");
    };

    const downBtn = document.createElement("button");
    downBtn.innerText = "↓";
    downBtn.style.padding = upDownPadding;
    upDownBtnCont.appendChild(downBtn);
    downBtn.onclick = () => {
      this.moveByTile("down");
    };

    const rightBtn = document.createElement("button");
    rightBtn.innerText = "→";
    rightBtn.style.padding = leftRightPadding;
    mvmntBtnCont.appendChild(rightBtn);
    rightBtn.onclick = () => {
      this.moveByTile("right");
    };
  }

  createSettingsButtons(containerToAppendTo: HTMLElement) {
    const settingsCont = document.createElement("div");
    settingsCont.classList.add("settingsCont");
    containerToAppendTo.appendChild(settingsCont);

    const settingsHeader = document.createElement("label");
    settingsHeader.innerHTML = "<strong>Settings</strong>";
    settingsCont.appendChild(settingsHeader);

    const playerFocusCont = document.createElement("div");
    settingsCont.appendChild(playerFocusCont);

    const focusBtn = document.createElement("input");
    focusBtn.type = "checkbox";
    focusBtn.checked = this.centerOnPlayer;
    playerFocusCont.appendChild(focusBtn);
    const focusLabel = document.createElement("label");
    focusLabel.innerText = "Center map on player";
    playerFocusCont.appendChild(focusLabel);
    focusBtn.addEventListener("click", () => {
      this.centerOnPlayer = focusBtn.checked;
      if (this.centerOnPlayer) {
        map.obj.setView(this.posLatLng);
      }
    });

    const moveWithGpsCont = document.createElement("div");
    settingsCont.appendChild(moveWithGpsCont);

    const gpsBtn = document.createElement("input");
    gpsBtn.type = "checkbox";
    gpsBtn.checked = this.moveWithGps;
    moveWithGpsCont.appendChild(gpsBtn);
    const gpsLabel = document.createElement("label");
    gpsLabel.innerText = "Move player with GPS";
    moveWithGpsCont.appendChild(gpsLabel);
    gpsBtn.addEventListener("click", () => {
      this.moveWithGps = gpsBtn.checked;
    });
  }

  createResetBtn(containerToAppendTo: HTMLElement) {
    const resetBtn = document.createElement("button");
    resetBtn.id = "reset-btn";
    resetBtn.innerHTML = "Reset<br>Game";
    containerToAppendTo.appendChild(resetBtn);
    resetBtn.onclick = () => {
      if (confirm("Are you sure? This will erase all progress.")) {
        map.resetGame();
      }
    };
  }

  setPlayerPos(newLatLng: leaflet.LatLng | undefined = undefined) {
    if (newLatLng !== undefined) {
      this.posLatLng = newLatLng.clone();
    }
    this.marker.setLatLng(this.posLatLng);
    if (this.centerOnPlayer) {
      map.obj.setView(this.posLatLng);
    }
  }

  moveByTile(direction: "up" | "down" | "left" | "right") {
    if (this.moveWithGps) {
      return;
    }
    switch (direction) {
      case "up":
        this.posLatLng.lat += TILE_DEGREES;
        break;
      case "down":
        this.posLatLng.lat -= TILE_DEGREES;
        break;
      case "left":
        this.posLatLng.lng -= TILE_DEGREES;
        break;
      case "right":
        this.posLatLng.lng += TILE_DEGREES;
        break;
    }
    this.setPlayerPos();
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

// Utility: function that computes the coords of a lat/lng point relative to COORD_ORIGIN with units of size TILE_DEGREES
function coordsFromLatLng(latlng: leaflet.LatLng): Coord {
  const latDiff = latlng.lat - COORD_ORIGIN.lat;
  const lngDiff = latlng.lng - COORD_ORIGIN.lng;
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

// Utility: function that converts toString output of LatLng back into a LatLng object
function latLngFromString(latlngStr: string): leaflet.LatLng {
  let startLatLng = 0;
  for (let i = 0; i < latlngStr.length; i++) {
    if (latlngStr[i] === "(") {
      startLatLng = i + 1;
    }
  }
  latlngStr = latlngStr.substring(startLatLng, latlngStr.length);

  const [latStr, lngStr] = latlngStr.split(",");
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (isNaN(lat) || isNaN(lng)) {
    console.error("Invalid lat/lng string: ", latlngStr);
    return leaflet.latLng(0, 0);
  }
  return leaflet.latLng(lat, lng);
}

//Utility: function that grabs a substring between an open and close character
function substringBetween(str: string, openAndCloseChar: string): string {
  if (openAndCloseChar.length !== 2) {
    console.error("Invalid openAndCloseChar: ", openAndCloseChar);
    return "";
  }
  const openChar = openAndCloseChar[0];
  const closeChar = openAndCloseChar[1];
  let start = -1;
  let end = -1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === openChar && start === -1) {
      start = i + 1;
    } else if (str[i] === closeChar && start !== -1) {
      end = i;
      break;
    }
  }
  if (start !== -1 && end !== -1) {
    return str.substring(start, end);
  }
  return "";
}

// Utility: function that prints the contents of a map (for debugging)
function _printMapContents(map: Map<Coord, Cache>) {
  console.log("Map contents:");
  map.forEach((value: Cache, key: Coord) => {
    console.log("Key: ", key, " Value: ", value);
  });
}

// ************************************************
// *************** MAIN PROGRAM ********************
// ************************************************

// Create the map centered on the classroom
const map = new LeafletMap(CLASSROOM_LATLNG, GAMEPLAY_ZOOM_LEVEL, COORD_ORIGIN);

const inventory = new Inventory();

// create a player object which will add a marker to represent the player
const player = new Player(CLASSROOM_LATLNG, map.obj);
player.createMvmntButtons();
player.createSettingsButtons(inventory.invCont);
player.createResetBtn(inventory.invCont);

// Save state to localStorage before closing the page
globalThis.addEventListener("beforeunload", () => {
  localStorage.clear();

  map.caches.forEach((cache: Cache, _key: string) => {
    map.stowCache(cache);
  });

  localStorage.setItem("cachedCaches", map.cachedCachesToString());
  localStorage.setItem("playerPos", player.posLatLng.toString());
  localStorage.setItem("heldItem", inventory.heldItemValue ?? "");
});
