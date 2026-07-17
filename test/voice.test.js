const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { createVoiceRouter } = require("../src/routes/voice");

async function startTestServer(router) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use("/voice", router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

test("after-hours callers can still enter the booking menu", async () => {
  const bookingClient = {};
  const router = createVoiceRouter({
    bookingClient,
    now: () => new Date("2026-07-17T01:00:00.000Z")
  });
  const server = await startTestServer(router);

  try {
    const response = await fetch(`${server.baseUrl}/voice/incoming`, {
      method: "POST",
      body: new URLSearchParams()
    });
    const xml = await response.text();

    assert.equal(response.status, 200);
    assert.match(xml, /We&apos;re currently closed/);
    assert.match(xml, /You can still book an appointment/);
    assert.match(xml, /To book a haircut, press 1/);
    assert.doesNotMatch(xml, /<Hangup/);
  } finally {
    await server.close();
  }
});

test("haircut menu reads service names without prices or durations", async () => {
  const bookingClient = {};
  const router = createVoiceRouter({ bookingClient });
  const server = await startTestServer(router);

  try {
    const response = await fetch(`${server.baseUrl}/voice/main-menu`, {
      method: "POST",
      body: new URLSearchParams({ Digits: "1" })
    });
    const xml = await response.text();

    assert.equal(response.status, 200);
    assert.match(xml, /For skin fade, press 1/);
    assert.match(xml, /For regular haircut, no fade, press 2/);
    assert.match(xml, /For haircut and beard, press 3/);
    assert.match(xml, /For buzz cut, press 4/);
    assert.match(xml, /For long haircut, press 5/);
    assert.match(xml, /For skin fade, press 1\.<break time="450ms"\/>For regular haircut/);
    assert.doesNotMatch(xml, /minutes/);
    assert.doesNotMatch(xml, /dollars/);
  } finally {
    await server.close();
  }
});
