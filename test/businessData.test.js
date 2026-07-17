const assert = require("node:assert/strict");
const test = require("node:test");
const { business, listServices } = require("../src/businessData");

test("service catalog matches approved Setmore categories", () => {
  assert.equal(business.name, "Cuts By Haris");
  assert.equal(business.timezone, "America/Regina");
  assert.equal(business.categories.length, 5);
  assert.deepEqual(
    business.categories.map((category) => category.name),
    ["Haircut", "Beard", "Perm", "Kids", "Seniors"]
  );
  assert.equal(listServices().length, 11);
});

test("main category keypad digits are stable", () => {
  assert.deepEqual(
    business.categories.map((category) => category.digit),
    ["1", "2", "3", "4", "5"]
  );
});

