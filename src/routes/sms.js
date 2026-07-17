const express = require("express");
const {
  business,
  getCategoryByDigit,
  getCategoryByKey,
  getServiceByDigit,
  getServiceByKey
} = require("../businessData");
const { message, response, sendMessagingTwiML } = require("../messagingTwiml");

const sessions = new Map();

function normalizeBody(value) {
  return String(value || "").trim().toLowerCase();
}

function sessionKey(req) {
  return req.body.From || "unknown";
}

function setSession(from, value) {
  sessions.set(from, {
    ...value,
    updatedAt: Date.now()
  });
}

function resetSession(from) {
  sessions.delete(from);
}

function sendText(res, text) {
  return sendMessagingTwiML(res, response(message(text)));
}

function mainMenuText(prefix = "") {
  return [
    prefix,
    `Thanks for texting ${business.name}. Reply with a number to book:`,
    "1 Haircut",
    "2 Beard",
    "3 Perm",
    "4 Kids",
    "5 Seniors",
    "",
    "Reply 0 anytime for this menu. Reply cancel to stop."
  ]
    .filter(Boolean)
    .join("\n");
}

function categoryMenuText(category, prefix = "") {
  return [
    prefix,
    `${category.name} services:`,
    ...category.services.map((service) => `${service.digit} ${service.speechName}`),
    "",
    "Reply 0 for the main menu."
  ]
    .filter(Boolean)
    .join("\n");
}

function slotText(slot) {
  const date = new Date(slot.startAt);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: business.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function slotMenuText(service, slots, prefix = "") {
  return [
    prefix,
    `You chose ${service.speechName}. Reply with a time:`,
    ...slots.map((slot, index) => `${index + 1} ${slotText(slot)}`),
    "",
    "Reply 0 for the main menu."
  ]
    .filter(Boolean)
    .join("\n");
}

function confirmText(service, slot) {
  return [
    `Confirm ${service.speechName} for ${slotText(slot)}?`,
    "Reply 1 to confirm.",
    "Reply 0 for the main menu."
  ].join("\n");
}

async function showSlots({ res, from, bookingClient, service, prefix = "" }) {
  const slots = await bookingClient.listAvailableSlots({ service, count: 3 });
  setSession(from, {
    step: "select-slot",
    serviceKey: service.key,
    slots
  });
  return sendText(res, slotMenuText(service, slots, prefix));
}

function createSmsRouter({ bookingClient }) {
  const router = express.Router();

  router.post("/incoming", async (req, res) => {
    const from = sessionKey(req);
    const body = normalizeBody(req.body.Body);

    if (!body || ["hi", "hello", "hey", "start", "book", "menu"].includes(body)) {
      resetSession(from);
      return sendText(res, mainMenuText());
    }

    if (["cancel", "stop"].includes(body)) {
      resetSession(from);
      return sendText(res, `No problem. Your booking was not completed. Text book anytime to start again.`);
    }

    if (body === "0") {
      resetSession(from);
      return sendText(res, mainMenuText());
    }

    const session = sessions.get(from);

    if (!session) {
      const category = getCategoryByDigit(body);
      if (!category) {
        return sendText(res, mainMenuText("Sorry, I did not understand that."));
      }

      setSession(from, {
        step: "select-service",
        categoryKey: category.key
      });
      return sendText(res, categoryMenuText(category));
    }

    if (session.step === "select-service") {
      const category = getCategoryByKey(session.categoryKey);
      if (!category) {
        resetSession(from);
        return sendText(res, mainMenuText("Sorry, that menu expired."));
      }

      const service = getServiceByDigit(category.key, body);
      if (!service) {
        return sendText(res, categoryMenuText(category, "Sorry, that service number was not valid."));
      }

      return showSlots({ res, from, bookingClient, service });
    }

    if (session.step === "select-slot") {
      const match = getServiceByKey(session.serviceKey);
      if (!match || !Array.isArray(session.slots)) {
        resetSession(from);
        return sendText(res, mainMenuText("Sorry, that booking expired."));
      }

      const slotIndex = Number(body) - 1;
      const selectedSlot = session.slots[slotIndex];
      if (!selectedSlot) {
        return sendText(res, slotMenuText(match.service, session.slots, "Sorry, that time number was not valid."));
      }

      setSession(from, {
        step: "confirm",
        serviceKey: match.service.key,
        selectedSlot
      });
      return sendText(res, confirmText(match.service, selectedSlot));
    }

    if (session.step === "confirm") {
      const match = getServiceByKey(session.serviceKey);
      if (!match || !session.selectedSlot) {
        resetSession(from);
        return sendText(res, mainMenuText("Sorry, that booking expired."));
      }

      if (body !== "1" && body !== "yes" && body !== "y") {
        return sendText(res, confirmText(match.service, session.selectedSlot));
      }

      const appointment = await bookingClient.createAppointment({
        service: match.service,
        startAt: session.selectedSlot.startAt,
        customerPhone: from
      });

      resetSession(from);
      return sendText(
        res,
        [
          `You're booked for ${slotText({ startAt: appointment.startAt })}.`,
          `Service: ${match.service.speechName}.`,
          `Thank you for booking with ${business.name}.`
        ].join("\n")
      );
    }

    resetSession(from);
    return sendText(res, mainMenuText("Sorry, let's start over."));
  });

  return router;
}

module.exports = {
  createSmsRouter,
  sessions
};

