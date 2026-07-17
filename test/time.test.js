const assert = require("node:assert/strict");
const test = require("node:test");
const { business } = require("../src/businessData");
const { getLocalDateParts, isBusinessOpen } = require("../src/utils/time");

test("America/Regina local time is used for business hours", () => {
  const local = getLocalDateParts(new Date("2026-07-16T15:00:00.000Z"), business.timezone);
  assert.equal(local.hour, 9);
  assert.equal(local.minute, 0);
});

test("business is open from 9 AM up to 6 PM Regina time", () => {
  assert.equal(isBusinessOpen(business, new Date("2026-07-16T14:59:00.000Z")), false);
  assert.equal(isBusinessOpen(business, new Date("2026-07-16T15:00:00.000Z")), true);
  assert.equal(isBusinessOpen(business, new Date("2026-07-16T23:59:00.000Z")), true);
  assert.equal(isBusinessOpen(business, new Date("2026-07-17T00:00:00.000Z")), false);
});

