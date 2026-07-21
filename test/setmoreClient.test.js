const assert = require("node:assert/strict");
const test = require("node:test");
const { business, listServices } = require("../src/businessData");
const { createBookingClient } = require("../src/setmore/bookingClientFactory");
const {
  createSetmoreClient,
  getSetmoreConfigStatus,
  serviceKeyEnvName
} = require("../src/setmore/setmoreClient");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function queuedFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({
      url,
      options,
      body: options.body ? JSON.parse(options.body) : null
    });
    const next = responses.shift();
    if (!next) {
      throw new Error(`Unexpected fetch call to ${url}`);
    }
    return jsonResponse(next.body, next.status || 200);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function serviceByKey(key) {
  return listServices().find((service) => service.key === key);
}

test("booking client stays in mock mode until Setmore is explicitly ready", () => {
  const env = {
    SETMORE_ENABLED: "true"
  };

  const client = createBookingClient({ business, env });
  const status = getSetmoreConfigStatus({ business, env });

  assert.equal(client.mode, "mock");
  assert.equal(status.ready, false);
  assert.equal(status.hasRefreshToken, false);
});

test("Setmore slot lookup refreshes token and posts the expected slot request", async () => {
  const skinFade = serviceByKey("skin-fade");
  const env = {
    SETMORE_ENABLED: "true",
    SETMORE_REFRESH_TOKEN: "refresh-token",
    SETMORE_STAFF_KEY: "staff-1",
    SETMORE_SERVICE_KEY_SKIN_FADE: "service-1",
    SETMORE_LOOKAHEAD_DAYS: "1",
    SETMORE_SLOT_LIMIT: "5"
  };
  const fetchImpl = queuedFetch([
    {
      body: {
        data: {
          token: {
            access_token: "access-token",
            expires_in: 3600
          }
        }
      }
    },
    {
      body: {
        data: {
          slots: ["9:30 AM", { start_time: "2026-07-18T16:00:00.000Z" }]
        }
      }
    }
  ]);

  const client = createSetmoreClient({
    business,
    env,
    fetchImpl,
    now: () => new Date("2026-07-18T14:00:00.000Z")
  });

  const slots = await client.listAvailableSlots({
    service: skinFade,
    count: 2,
    from: new Date("2026-07-18T14:00:00.000Z")
  });

  assert.equal(slots.length, 2);
  assert.equal(slots[0].startAt, "2026-07-18T15:30:00.000Z");
  assert.equal(slots[1].startAt, "2026-07-18T16:00:00.000Z");
  assert.equal(fetchImpl.calls[0].url, "https://developer.setmore.com/api/v2/o/oauth2/token?refreshToken=refresh-token");
  assert.equal(fetchImpl.calls[1].url, "https://developer.setmore.com/api/v2/bookingapi/appointments/slots");
  assert.equal(fetchImpl.calls[1].options.headers.Authorization, "Bearer access-token");
  assert.deepEqual(fetchImpl.calls[1].body, {
    staff_key: "staff-1",
    service_key: "service-1",
    selected_date: "18/07/2026",
    off_hours: false,
    double_booking: false,
    timezone: "America/Regina",
    slot_limit: 5
  });
});

test("Setmore token and slot lookup can fall back to legacy v1 endpoints", async () => {
  const buzzCut = serviceByKey("buzz-cut");
  const env = {
    SETMORE_ENABLED: "true",
    SETMORE_REFRESH_TOKEN: "refresh-token",
    SETMORE_STAFF_KEY: "staff-1",
    SETMORE_SERVICE_KEY_BUZZ_CUT: "service-4",
    SETMORE_LOOKAHEAD_DAYS: "1"
  };
  const fetchImpl = queuedFetch([
    {
      status: 400,
      body: {
        response: false,
        error: "invalid_refresh_token"
      }
    },
    {
      body: {
        data: {
          token: {
            access_token: "access-token",
            expires_in: 3600
          }
        }
      }
    },
    {
      status: 404,
      body: {
        response: false,
        error: "not_found"
      }
    },
    {
      body: {
        data: {
          slots: ["10:30 AM"]
        }
      }
    }
  ]);

  const client = createSetmoreClient({
    business,
    env,
    fetchImpl,
    now: () => new Date("2026-07-18T14:00:00.000Z")
  });

  const slots = await client.listAvailableSlots({
    service: buzzCut,
    count: 1,
    from: new Date("2026-07-18T14:00:00.000Z")
  });

  assert.equal(slots.length, 1);
  assert.equal(fetchImpl.calls[0].url, "https://developer.setmore.com/api/v2/o/oauth2/token?refreshToken=refresh-token");
  assert.equal(fetchImpl.calls[1].url, "https://developer.setmore.com/api/v1/o/oauth2/token?refreshToken=refresh-token");
  assert.equal(fetchImpl.calls[2].url, "https://developer.setmore.com/api/v1/bookingapi/appointments/slots");
  assert.equal(fetchImpl.calls[3].url, "https://developer.setmore.com/api/v1/bookingapi/slots");
});

test("Setmore appointment creation creates a phone customer and posts appointment data", async () => {
  const haircut = serviceByKey("regular-haircut-no-fade");
  const env = {
    SETMORE_ENABLED: "true",
    SETMORE_REFRESH_TOKEN: "refresh-token",
    SETMORE_STAFF_KEY: "staff-1",
    SETMORE_SERVICE_KEY_REGULAR_HAIRCUT_NO_FADE: "service-2"
  };
  const fetchImpl = queuedFetch([
    {
      body: {
        data: {
          token: {
            access_token: "access-token",
            expires_in: 3600
          }
        }
      }
    },
    {
      body: {
        data: {
          customer: []
        }
      }
    },
    {
      body: {
        data: {
          customer: {
            key: "customer-1"
          }
        }
      }
    },
    {
      body: {
        data: {
          appointment: {
            key: "appointment-1"
          }
        }
      }
    }
  ]);
  const client = createSetmoreClient({ business, env, fetchImpl });

  const appointment = await client.createAppointment({
    service: haircut,
    startAt: "2026-07-18T16:00:00.000Z",
    customerPhone: "+13065551212"
  });

  assert.equal(appointment.id, "appointment-1");
  assert.equal(fetchImpl.calls[1].url, "https://developer.setmore.com/api/v2/bookingapi/customer?phone=%2B13065551212");
  assert.equal(fetchImpl.calls[2].url, "https://developer.setmore.com/api/v2/bookingapi/customer/create");
  assert.equal(fetchImpl.calls[2].body.cell_phone, "+13065551212");
  assert.equal(fetchImpl.calls[2].body.email_id, "sms-13065551212@cuts-by-haris.invalid");
  assert.equal(fetchImpl.calls[3].url, "https://developer.setmore.com/api/v2/bookingapi/appointment/create");
  assert.deepEqual(fetchImpl.calls[3].body, {
    staff_key: "staff-1",
    service_key: "service-2",
    customer_key: "customer-1",
    start_time: "2026-07-18T16:00:00.000Z",
    end_time: "2026-07-18T16:30:00.000Z",
    cost: 35
  });
});

test("Setmore service key env names match the documented Render variables", () => {
  assert.equal(serviceKeyEnvName(serviceByKey("skin-fade")), "SETMORE_SERVICE_KEY_SKIN_FADE");
  assert.equal(
    serviceKeyEnvName(serviceByKey("regular-haircut-no-fade")),
    "SETMORE_SERVICE_KEY_REGULAR_HAIRCUT_NO_FADE"
  );
});
