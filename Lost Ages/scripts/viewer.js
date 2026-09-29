// viewer.js — watch SAVED fights in your browser.
// (You don't need this to watch a fight as it happens — simulate.js opens the viewer by itself.)
//
//   node scripts/viewer.js     then open http://localhost:3000

const { startViewerServer, openBrowser } = require("../src/replay/viewerServer");

startViewerServer({ port: Number(process.argv[2] || 3000) }).then(server => {
  console.log(`Fight viewer running — ${server.url()}`);
  console.log(`(Press Ctrl+C to stop)`);
  openBrowser(server.url());
});