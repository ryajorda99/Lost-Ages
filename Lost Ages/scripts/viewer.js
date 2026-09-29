// viewer.js — watch SAVED fights in your browser.
// (You don't need this to watch a fight as it happens — simulate.js opens the viewer by itself.)
//
//   node scripts/viewer.js         2D viewer (opens http://localhost:3000)
//   node scripts/viewer.js --3d    3D viewer (opens http://localhost:3000/3d.html)

const { startViewerServer, openBrowser } = require("../src/replay/viewerServer");

const USE_3D = process.argv.includes("--3d");
const port = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) || 3000);

startViewerServer({ port }).then(server => {
  console.log(`Fight viewer running — 2D: ${server.url()}   3D: ${server.url()}/3d.html`);
  console.log(`(Press Ctrl+C to stop)`);
  openBrowser(server.url() + (USE_3D ? "/3d.html" : ""));
});