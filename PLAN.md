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
- [ ] allow tokens clicked on within range to be displayed in an inventory under the map
- [ ] allow tokens to be placed back down again when you click on an empty cell
- [ ] if token is placed on cell with equal value token, combine them
- [ ] if a token is placed on an unequal token cell, put down your current token and pick up the cell token

## D3.b: Fill in once I get here
