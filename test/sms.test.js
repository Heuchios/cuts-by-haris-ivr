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

test("non-booking texts produce no bot reply when owner routing is disabled", async () => {
  sessions.clear();
  lastCustomerByOwner.clear();
  delete process.env.OWNER_PHONE_NUMBER;

  const bookingClient = createMockSetmoreClient({ business });
  const router = createSmsRouter({ bookingClient });
  const server = await startTestServer(router);

  try {
    const result = await sendSms(server.baseUrl, "Hey, are you available today?", "+13065551111");

    assert.equal(result.response.status, 200);
    assert.equal(result.xml, '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    assert.doesNotMatch(result.xml, /Sorry, I did not understand/);
    assert.doesNotMatch(result.xml, /1 Haircut/);
  } finally {
    await server.close();
    sessions.clear();
    lastCustomerByOwner.clear();
    delete process.env.OWNER_PHONE_NUMBER;
  }
});

test("barber booking phrases and long customer texts activate the booking menu", async () => {
  sessions.clear();
  lastCustomerByOwner.clear();
  delete process.env.OWNER_PHONE_NUMBER;

  const bookingClient = createMockSetmoreClient({ business });
  const router = createSmsRouter({ bookingClient });
  const server = await startTestServer(router);

  try {
    const examples = [
      "Hi, I need a haircut appointment",
      "Can I get in sometime tomorrow?",
      "Do you have any openings for a fade this week?",
      "Can you squeeze me in for a beard trim?",
      "My son needs a cut after school",
      "Looking to book a low fade",
      "Do you take walk-ins?",
      "I want to get my hair done",
      "Can I book a regular cut?"
    ];

    for (const [index, text] of examples.entries()) {
      const result = await sendSms(server.baseUrl, text, `+13065554${String(index).padStart(3, "0")}`);

      assert.equal(result.response.status, 200);
      assert.match(result.xml, /Thanks for texting Cuts By Haris/, text);
      assert.match(result.xml, /1 Haircut/, text);
    }
  } finally {
    await server.close();
    sessions.clear();
    lastCustomerByOwner.clear();
    delete process.env.OWNER_PHONE_NUMBER;
  }
});

test("unprompted category numbers do not activate the booking menu", async () => {
  sessions.clear();
  lastCustomerByOwner.clear();
  delete process.env.OWNER_PHONE_NUMBER;

  const bookingClient = createMockSetmoreClient({ business });
  const router = createSmsRouter({ bookingClient });
  const server = await startTestServer(router);

  try {
    const result = await sendSms(server.baseUrl, "1", "+13065554444");

    assert.equal(result.response.status, 200);
    assert.equal(result.xml, '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } finally {
    await server.close();
    sessions.clear();
    lastCustomerByOwner.clear();
    delete process.env.OWNER_PHONE_NUMBER;
  }
});

test("stale SMS slot selections are replaced with fresh available times", async () => {
  sessions.clear();
  lastCustomerByOwner.clear();
  delete process.env.OWNER_PHONE_NUMBER;

  const customer = "+13065556666";
  const bookingClient = createMockSetmoreClient({ business });
  const router = createSmsRouter({ bookingClient });
  const server = await startTestServer(router);

  try {
    sessions.set(customer, {
      step: "confirm",
      serviceKey: "skin-fade",
      selectedSlot: {
        startAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        serviceKey: "skin-fade"
      }
    });

    const result = await sendSms(server.baseUrl, "1", customer);

    assert.equal(result.response.status, 200);
    assert.match(result.xml, /Sorry, that time is no longer available/);
    assert.match(result.xml, /You chose skin fade/);
    assert.match(result.xml, /Reply with a time/);
  } finally {
    await server.close();
    sessions.clear();
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
    await sendSms(server.baseUrl, "What is your address?", "+13065552222");
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
