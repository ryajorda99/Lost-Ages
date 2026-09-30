// viewer.js — watch SAVED fights in your browser.
// (You don't need this to watch a fight as it happens — simulate.js opens the viewer by itself.)
//
//   node scripts/viewer.js         3D viewer (opens http://localhost:3000)
//   node scripts/viewer.js --2d    old top-down 2D viewer (opens http://localhost:3000/2d)

const { startViewerServer, openBrowser } = require("../src/replay/viewerServer");

const USE_3D = !process.argv.includes("--2d");
const port = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) || 3000);

startViewerServer({ port }).then(server => {
  console.log(`Fight viewer running — 3D: ${server.url()}   2D: ${server.url()}/2d`);
  console.log(`(Press Ctrl+C to stop)`);
  openBrowser(server.url() + (USE_3D ? "/" : "/2d"));
});