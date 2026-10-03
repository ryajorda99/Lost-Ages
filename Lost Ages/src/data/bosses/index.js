// All bosses in one place:  const BOSSES = require("../src/data/bosses");
//   Tier 1: hollowKing     (x12, drops item level 60)
//   Tier 2: ashenTyrant    (x25, drops item level 70)
//   Tier 3: stormSovereign (x30, drops item level 80)
module.exports = {
  hollowKing: require("./hollowKing"),
  ashenTyrant: require("./ashenTyrant"),
  stormSovereign: require("./stormSovereign"),
};