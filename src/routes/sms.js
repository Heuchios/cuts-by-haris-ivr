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
const lastCustomerByOwner = new Map();
const BOOKING_TRIGGER_PATTERNS = [
  /\bbook(?:ing)?\b/,
  /\bmenu\b/,
  /\bstart\b/,
  /\bappointment\b/,
  /\bappt\b/,
  /\bschedule\b/,
  /\breschedule\b/,
  /\bcancel\b/,
  /\bmake\s+(?:an?\s+)?appointment\b/,
  /\bset\s+up\s+(?:an?\s+)?appointment\b/,
  /\bwant\s+to\s+book\b/,
  /\bneed\s+to\s+book\b/,
  /\btrying\s+to\s+book\b/,
  /\bcan\s+i\s+book\b/,
  /\bcan\s+i\s+(?:get|come)\s+in\b/,
  /\bcould\s+i\s+(?:get|come)\s+in\b/,
  /\bget\s+me\s+in\b/,
  /\bfit\s+me\s+in\b/,
  /\bsqueeze\s+me\s+in\b/,
  /\bany\s+(?:openings?|spots?|appointments?|availability)\b/,
  /\bdo\s+you\s+have\s+.*(?:openings?|spots?|appointments?|availability)\b/,
  /\bwalk[\s-]*ins?\b/,
  /\bhair\s*cut\b/,
  /\bhaircut\b/,
  /\bcut\b/,
  /\bregular\s+cut\b/,
  /\bscissors?\s+cut\b/,
  /\bfresh\s+cut\b/,
  /\bget\s+my\s+hair\s+(?:cut|done)\b/,
  /\bneed\s+my\s+hair\s+(?:cut|done)\b/,
  /\bmy\s+(?:son|kid|child)\s+needs?\s+(?:a\s+)?cut\b/,
  /\bbarber\b/,
  /\bfade\b/,
  /\bskin\s*fade\b/,
  /\blow\s+fade\b/,
  /\bmid\s+fade\b/,
  /\bhigh\s+fade\b/,
  /\btaper\b/,
  /\btaper\s+fade\b/,
  /\bbuzz\s*cut\b/,
  /\bbeard\b/,
  /\btrim\b/,
  /\bbeard\s+trim\b/,
  /\brazor\s+line\s*up\b/,
  /\brazor\s+lineup\b/,
  /\bline\s*up\b/,
  /\blineup\b/,
  /\bshape\s*up\b/,
  /\bperm\b/,
  /\bkids?\s+haircut\b/,
  /\bkids?\s*cut\b/,
  /\bsenior(?:s)?\s+haircut\b/,
  /\bsenior(?:s)?\s*cut\b/
];

function canonicalPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

function ownerPhoneNumber() {
  return canonicalPhone(process.env.OWNER_PHONE_NUMBER);
}

function normalizeBody(value) {
  return String(value || "").trim().toLowerCase();
}

function originalBody(req) {
  return String(req.body.Body || "").trim();
}

function sessionKey(req) {
  return canonicalPhone(req.body.From) || "unknown";
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

function sendNoReply(res) {
  return sendMessagingTwiML(res, response());
}

function sendTo(res, to, text) {
  return sendMessagingTwiML(res, response(message(text, { to })));
}

function parseOwnerReply(text, fallbackCustomer) {
  const explicit = text.match(/^r(?:eply)?\s+(\+?\d[\d\s().-]{8,})\s+([\s\S]+)$/i);
  if (explicit) {
    return {
      to: canonicalPhone(explicit[1]),
      body: explicit[2].trim()
    };
  }

  const implicit = text.match(/^r(?:eply)?\s+([\s\S]+)$/i);
  if (implicit && fallbackCustomer) {
    return {
      to: fallbackCustomer,
      body: implicit[1].trim()
    };
  }

  return null;
}

function ownerHelpText() {
  return [
    "Owner commands:",
    "r +13065551212 your message",
    "or reply to the most recent customer with:",
    "r your message"
  ].join("\n");
}

function shouldStartBooking(body) {
  if (!body) return false;
  return BOOKING_TRIGGER_PATTERNS.some((pattern) => pattern.test(body));
}

function shouldForwardToOwner(body, session) {
  if (session) return false;
  if (shouldStartBooking(body)) return false;
  if (/^[1-5]$/.test(body)) return false;
  return true;
}

function forwardText() {
  return [
    "New text to Cuts By Haris",
    "From: {{from}}",
    "{{body}}",
    "",
    "Reply with:",
    "r {{from}} your message",
    "or for this customer:",
    "r your message"
  ].join("\n");
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

function bookingSystemTroubleText() {
  return [
    "Sorry, the booking system is having trouble right now.",
    "Please text us what service and time you want, and we will help you book it."
  ].join("\n");
}

function bookingTroubleOwnerText({ from, rawBody, service, stage }) {
  return [
    "Booking bot needs manual help",
    `From: ${from}`,
    `Stage: ${stage}`,
    service ? `Service: ${service.speechName}` : "",
    rawBody ? `Customer text: ${rawBody}` : "",
    "",
    "Reply with:",
    `r ${from} your message`
  ]
    .filter(Boolean)
    .join("\n");
}

function sendBookingTrouble({ res, from, owner, rawBody, service, stage }) {
  const customerText = bookingSystemTroubleText();
  if (!owner) {
    return sendText(res, customerText);
  }

  lastCustomerByOwner.set(owner, from);
  return sendMessagingTwiML(
    res,
    response(
      message(customerText),
      message(bookingTroubleOwnerText({ from, rawBody, service, stage }), { to: owner })
    )
  );
}

async function showSlots({ res, from, owner, rawBody, bookingClient, service, prefix = "" }) {
  let slots;
  try {
    slots = await bookingClient.listAvailableSlots({ service, count: 3 });
  } catch (error) {
    console.error("SMS slot lookup failed", bookingClient.getLastError?.() || error);
    resetSession(from);
    return sendBookingTrouble({
      res,
      from,
      owner,
      rawBody,
      service,
      stage: "slot lookup"
    });
  }

  if (!slots.length) {
    resetSession(from);
    return sendText(
      res,
      [
        `Sorry, I could not find open times for ${service.speechName} right now.`,
        "Please text us what day works for you and we will help you book it."
      ].join("\n")
    );
  }

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
    const owner = ownerPhoneNumber();
    const body = normalizeBody(req.body.Body);
    const rawBody = originalBody(req);

    if (owner && from === owner) {
      const ownerReply = parseOwnerReply(rawBody, lastCustomerByOwner.get(owner));
      if (!ownerReply || !ownerReply.to || !ownerReply.body) {
        return sendText(res, ownerHelpText());
      }

      return sendTo(res, ownerReply.to, ownerReply.body);
    }

    const session = sessions.get(from);

    if (["cancel", "stop"].includes(body)) {
      resetSession(from);
      return sendText(res, `No problem. Your booking was not completed. Text book anytime to start again.`);
    }

    if (owner && shouldForwardToOwner(body, session)) {
      lastCustomerByOwner.set(owner, from);
      return sendTo(
        res,
        owner,
        forwardText()
          .replaceAll("{{from}}", from)
          .replace("{{body}}", rawBody || "(empty message)")
      );
    }

    if (!owner && shouldForwardToOwner(body, session)) {
      return sendNoReply(res);
    }

    if (shouldStartBooking(body)) {
      setSession(from, { step: "select-category" });
      return sendText(res, mainMenuText());
    }

    if (body === "0") {
      setSession(from, { step: "select-category" });
      return sendText(res, mainMenuText());
    }

    if (session && session.step === "select-category") {
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

    if (!session) {
      return sendNoReply(res);
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

      return showSlots({ res, from, owner, rawBody, bookingClient, service });
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

      let appointment;
      try {
        appointment = await bookingClient.createAppointment({
          service: match.service,
          startAt: session.selectedSlot.startAt,
          customerPhone: from
        });
      } catch (error) {
        console.error("SMS appointment create failed", bookingClient.getLastError?.() || error);
        resetSession(from);
        return sendBookingTrouble({
          res,
          from,
          owner,
          rawBody,
          service: match.service,
          stage: "appointment create"
        });
      }

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
  BOOKING_TRIGGER_PATTERNS,
  createSmsRouter,
  lastCustomerByOwner,
  sessions
};
