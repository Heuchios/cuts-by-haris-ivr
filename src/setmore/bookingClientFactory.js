const { createMockSetmoreClient } = require("./mockSetmoreClient");
const { createSetmoreClient, getSetmoreConfigStatus } = require("./setmoreClient");

function createBookingClient({ business, env = process.env, fetchImpl = fetch }) {
  const configStatus = getSetmoreConfigStatus({ business, env });

  if (configStatus.ready) {
    const client = createSetmoreClient({ business, env, fetchImpl });
    client.configStatus = configStatus;
    return client;
  }

  const client = createMockSetmoreClient({ business });
  client.configStatus = configStatus;
  return client;
}

module.exports = {
  createBookingClient
};
