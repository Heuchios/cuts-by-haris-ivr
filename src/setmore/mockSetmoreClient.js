const { getLocalDateParts } = require("../utils/time");

const REGINA_UTC_OFFSET_HOURS = 6;

function makeReginaLocalDate(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour + REGINA_UTC_OFFSET_HOURS, minute));
}

function addDaysToLocalDate(local, days) {
  const shifted = makeReginaLocalDate(local.year, local.month, local.day + days, 12, 0);
  return getLocalDateParts(shifted, "America/Regina");
}

function roundUp(value, interval) {
  return Math.ceil(value / interval) * interval;
}

function buildSlot(local, startMinutes, service) {
  const hour = Math.floor(startMinutes / 60);
  const minute = startMinutes % 60;
  const start = makeReginaLocalDate(local.year, local.month, local.day, hour, minute);
  return {
    id: `mock-${service.key}-${start.toISOString()}`,
    startAt: start.toISOString(),
    serviceKey: service.key
  };
}

function createMockSetmoreClient({ business }) {
  return {
    async listAvailableSlots({ service, count = 3, from = new Date() }) {
      const slots = [];
      const open = 9 * 60;
      const close = 18 * 60;
      const interval = 30;
      let local = getLocalDateParts(from, business.timezone);
      let startMinutes = roundUp(local.hour * 60 + local.minute + 15, interval);

      if (startMinutes < open) {
        startMinutes = open;
      }
      if (startMinutes + service.durationMinutes > close) {
        local = addDaysToLocalDate(local, 1);
        startMinutes = open;
      }

      while (slots.length < count) {
        if (startMinutes + service.durationMinutes <= close) {
          slots.push(buildSlot(local, startMinutes, service));
          startMinutes += interval;
          continue;
        }

        local = addDaysToLocalDate(local, 1);
        startMinutes = open;
      }

      return slots;
    },

    async createAppointment({ service, startAt, customerPhone }) {
      return {
        id: `mock-appointment-${Date.now()}`,
        serviceKey: service.key,
        startAt,
        customerPhone,
        status: "booked"
      };
    }
  };
}

module.exports = {
  createMockSetmoreClient
};

