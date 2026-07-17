const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { business } = require("../src/businessData");
const { createSmsRouter, lastCustomerByOwner, sessions } = require("../src/routes/sms");
const { createMockSetmoreClient } = require("../src/setmore/mockSetmoreClient");

async function startTestServer(router) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use("/sms", router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function sendSms(baseUrl, body, from = "+13065551212") {
  const response = await fetch(`${baseUrl}/sms/incoming`, {
    method: "POST",
    body: new URLSearchParams({
      From: from,
      Body: body
    })
  });

  return {
    response,
    xml: await response.text()
  };
}

test("sms booking flow uses numbered text menus", async () => {
  sessions.clear();
  lastCustomerByOwner.clear();
  delete process.env.OWNER_PHONE_NUMBER;
  const bookingClient = createMockSetmoreClient({ business });
  const router = createSmsRouter({ bookingClient });
  const server = await startTestServer(router);

  try {
    let result = await sendSms(server.baseUrl, "book");
    assert.equal(result.response.status, 200);
    assert.match(result.xml, /Thanks for texting Cuts By Haris/);
    assert.match(result.xml, /1 Haircut/);

    result = await sendSms(server.baseUrl, "1");
    assert.match(result.xml, /Haircut services/);
    assert.match(result.xml, /1 skin fade/);
    assert.match(result.xml, /5 long haircut/);
    assert.doesNotMatch(result.xml, /dollars/);

    result = await sendSms(server.baseUrl, "1");
    assert.match(result.xml, /You chose skin fade/);
    assert.match(result.xml, /Reply with a time/);
    assert.match(result.xml, /1 /);

    result = await sendSms(server.baseUrl, "1");
    assert.match(result.xml, /Confirm skin fade/);
    assert.match(result.xml, /Reply 1 to confirm/);

    result = await sendSms(server.baseUrl, "1");
    assert.match(result.xml, /You&apos;re booked/);
    assert.match(result.xml, /Service: skin fade/);
  } finally {
    await server.close();
    sessions.clear();
  }
});

test("non-booking texts forward to owner phone when smart routing is enabled", async () => {
  sessions.clear();
  lastCustomerByOwner.clear();
  process.env.OWNER_PHONE_NUMBER = "+13065550000";

  const bookingClient = createMockSetmoreClient({ business });
  const router = createSmsRouter({ bookingClient });
  const server = await startTestServer(router);

  try {
    const result = await sendSms(server.baseUrl, "Hey, are you available today?", "+13065551111");

    assert.equal(result.response.status, 200);
    assert.match(result.xml, /<Message to="\+13065550000">/);
    assert.match(result.xml, /New text to Cuts By Haris/);
    assert.match(result.xml, /From: \+13065551111/);
    assert.match(result.xml, /Hey, are you available today\?/);
    assert.equal(lastCustomerByOwner.get("+13065550000"), "+13065551111");
  } finally {
    await server.close();
    sessions.clear();
    lastCustomerByOwner.clear();
    delete process.env.OWNER_PHONE_NUMBER;
  }
});

test("owner can reply to the most recent forwarded customer", async () => {
  sessions.clear();
  lastCustomerByOwner.clear();
  process.env.OWNER_PHONE_NUMBER = "+13065550000";

  const bookingClient = createMockSetmoreClient({ business });
  const router = createSmsRouter({ bookingClient });
  const server = await startTestServer(router);

  try {
    await sendSms(server.baseUrl, "Do you take walk-ins?", "+13065552222");
    const result = await sendSms(server.baseUrl, "r Yes, until 6 today.", "+13065550000");

    assert.equal(result.response.status, 200);
    assert.match(result.xml, /<Message to="\+13065552222">Yes, until 6 today\.<\/Message>/);
  } finally {
    await server.close();
    sessions.clear();
    lastCustomerByOwner.clear();
    delete process.env.OWNER_PHONE_NUMBER;
  }
});

test("owner can reply to an explicit customer number", async () => {
  sessions.clear();
  lastCustomerByOwner.clear();
  process.env.OWNER_PHONE_NUMBER = "+13065550000";

  const bookingClient = createMockSetmoreClient({ business });
  const router = createSmsRouter({ bookingClient });
  const server = await startTestServer(router);

  try {
    const result = await sendSms(server.baseUrl, "r +13065553333 Yes, I can do 2 PM.", "+13065550000");

    assert.equal(result.response.status, 200);
    assert.match(result.xml, /<Message to="\+13065553333">Yes, I can do 2 PM\.<\/Message>/);
  } finally {
    await server.close();
    sessions.clear();
    lastCustomerByOwner.clear();
    delete process.env.OWNER_PHONE_NUMBER;
  }
});
