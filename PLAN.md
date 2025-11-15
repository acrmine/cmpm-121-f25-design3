# D3: Token Merging

## Game Design Vision

A website that tracks your location if you use it on your phone to navigate a map of the world (can also navigate using controls and not a map). You can pick up tokens in various locations and keep them with you before combining them with other tokens you find in other squares.

## Technologies

- TypeScript for most game code, little to no explicit HTML, and all CSS collected in common `style.css` file
- Deno and Vite for building
- GitHub Actions + GitHub Pages for deployment automation

## Assignments

## D3.a: Core mechanics (token collection and crafting)

Key technical challenge: Can you assemble a map-based user interface using the Leaflet mapping framework?
Key gameplay challenge: Can players collect and craft tokens from nearby locations to finally make one of sufficiently high value?

### Steps

- [x] copy main.ts to reference.ts for future reference
- [x] delete everything in main.ts
- [x] put a basic leaflet map on the screen
- [x] draw the player's location on the map
- [x] draw a rectangle representing one cell on the map
- [x] use loops to draw a whole grid of cells on the map
- [x] make a token type that can store a location and value reference
- [x] make a map class that stores token locations and leaflet map
- [x] change spawn cache to spawn a token in a given cell
- [x] allow tokens clicked on within range to be displayed in an inventory under the map
- [x] allow tokens to be placed back down again when you click on an empty cell
- [x] if token is placed on another token with equal value, combine them
- [x] if a token is placed on an unequal token cell, put down your current token and pick up the cell token
- [x] Add a victory message that activates when you hold a token of value 16

### Switching direction plan

- Each cache holds a map which maps latlng positions to token values so that I can effectively hold tokens per cache as well as their exact location

## D3.b: Fill in once I get here

- [x] center victory message at the top of the screen
- [x] add div element buttons in the bottom middle of the screen under the map that would allow for cardinal movement
- [x] connect those buttons to the player so that each one moves you one tile in the given directions
- [ ] change map coordinates origin to zero lat and zero long at null island
- [ ] change cache spawning to occur in a space as big as the current zoom of the screen
- [ ] check for new areas of the map that appear when the player scrolls the camera around spawn new caches there
- [ ] have the cells forget their status when outside of player view by either deleting their map of tokens or deleting the cache and spawning it again since cache location is deterministic
- [ ] change victory condition to 64
