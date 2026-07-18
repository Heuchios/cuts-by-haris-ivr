const express = require("express");
const {
  business,
  getCategoryByDigit,
  getCategoryByKey,
  getServiceByDigit,
  getServiceByKey
} = require("../businessData");
const { formatSlotForSpeech, isBusinessOpen } = require("../utils/time");
const { gather, hangup, redirect, response, say, sendTwiML } = require("../twiml");

function actionUrl(req, pathname, params = {}) {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const url = new URL(pathname, base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function withFallback(req, prompt, actionPath) {
  const action = actionUrl(req, actionPath);
  return response(
    gather({ action, text: prompt }),
    say("Sorry, I did not receive a choice."),
    redirect(action)
  );
}

function asPromptParts(prompt) {
  if (!prompt) return [];
  return Array.isArray(prompt) ? prompt : [prompt];
}

function mainMenuPrompt(prefix = []) {
  return [
    ...asPromptParts(prefix),
    `Thanks for calling ${business.name}.`,
    "To book a haircut, press 1.",
    "For beard services, press 2.",
    "For a perm, press 3.",
    "For kids cuts, press 4.",
    "For seniors, press 5."
  ];
}

function afterHoursBookingPrefix() {
  return [
    "We're currently closed.",
    "Our regular hours are 9 A M to 6 P M, Monday through Sunday.",
    "You can still book an appointment using this phone menu."
  ];
}

function categoryPrompt(category, prefix = []) {
  const options = category.services
    .map((service) => {
      return `For ${service.speechName}, press ${service.digit}.`;
    });

  return [...asPromptParts(prefix), ...options, "Press 0 to return to the main menu."];
}

function slotPrompt(service, slots, prefix = []) {
  const options = slots
    .map((slot, index) => {
      return `For ${formatSlotForSpeech(slot, business.timezone)}, press ${index + 1}.`;
    });

  return [
    ...asPromptParts(prefix),
    `You chose ${service.speechName}.`,
    ...options,
    "Press 0 to return to the main menu."
  ];
}

function confirmPrompt(service, startAt) {
  const slot = { startAt };
  const when = formatSlotForSpeech(slot, business.timezone);
  return [
    `You selected ${when} for ${service.speechName}.`,
    "To confirm this booking using the phone number you called from, press 1.",
    "Press 0 to return to the main menu."
  ];
}

function bookingSystemTroubleResponse() {
  return response(
    say("Sorry, the booking system is having trouble right now. Please text us and we will help you book. Goodbye."),
    hangup()
  );
}

function createVoiceRouter({ bookingClient, now = () => new Date() }) {
  const router = express.Router();

  function handleIncomingCall(req, res) {
    const prefix = isBusinessOpen(business, now()) ? [] : afterHoursBookingPrefix();
    return sendTwiML(res, withFallback(req, mainMenuPrompt(prefix), "/voice/main-menu"));
  }

  router.post("/incoming", handleIncomingCall);
  router.post("/", handleIncomingCall);

  router.post("/main-menu", (req, res) => {
    const digit = req.body.Digits;
    if (digit === "0") {
      return sendTwiML(res, withFallback(req, mainMenuPrompt(), "/voice/main-menu"));
    }

    const category = getCategoryByDigit(digit);

    if (!category) {
      return sendTwiML(
        res,
        withFallback(req, mainMenuPrompt("Sorry, that was not a valid choice. "), "/voice/main-menu")
      );
    }

    return sendTwiML(res, withFallback(req, categoryPrompt(category), `/voice/category/${category.key}`));
  });

  router.post("/category/:categoryKey", async (req, res) => {
    const digit = req.body.Digits;
    if (digit === "0") {
      return sendTwiML(res, withFallback(req, mainMenuPrompt(), "/voice/main-menu"));
    }

    const category = getCategoryByKey(req.params.categoryKey);
    if (!category) {
      return sendTwiML(res, withFallback(req, mainMenuPrompt("Sorry, that menu was not found. "), "/voice/main-menu"));
    }

    const service = getServiceByDigit(category.key, digit);
    if (!service) {
      return sendTwiML(
        res,
        withFallback(req, categoryPrompt(category, "Sorry, that was not a valid service. "), `/voice/category/${category.key}`)
      );
    }

    let slots;
    try {
      slots = await bookingClient.listAvailableSlots({ service });
    } catch (error) {
      console.error("Voice slot lookup failed", error);
      return sendTwiML(res, bookingSystemTroubleResponse());
    }

    if (!slots.length) {
      return sendTwiML(
        res,
        response(
          say(`Sorry, I could not find open times for ${service.speechName} right now. Please text us and we will help you book.`),
          hangup()
        )
      );
    }

    return sendTwiML(res, withFallback(req, slotPrompt(service, slots), `/voice/slot/${service.key}`));
  });

  router.post("/slot/:serviceKey", async (req, res) => {
    const digit = req.body.Digits;
    if (digit === "0") {
      return sendTwiML(res, withFallback(req, mainMenuPrompt(), "/voice/main-menu"));
    }

    const match = getServiceByKey(req.params.serviceKey);
    if (!match) {
      return sendTwiML(res, withFallback(req, mainMenuPrompt("Sorry, that service was not found. "), "/voice/main-menu"));
    }

    const slotIndex = Number(digit) - 1;
    let slots;
    try {
      slots = await bookingClient.listAvailableSlots({ service: match.service });
    } catch (error) {
      console.error("Voice slot lookup failed", error);
      return sendTwiML(res, bookingSystemTroubleResponse());
    }

    if (!slots.length) {
      return sendTwiML(
        res,
        response(
          say(`Sorry, I could not find open times for ${match.service.speechName} right now. Please text us and we will help you book.`),
          hangup()
        )
      );
    }

    const selectedSlot = slots[slotIndex];
    if (!selectedSlot) {
      return sendTwiML(
        res,
        withFallback(req, slotPrompt(match.service, slots, "Sorry, that was not a valid time. "), `/voice/slot/${match.service.key}`)
      );
    }

    const action = actionUrl(req, `/voice/confirm/${match.service.key}`, {
      startAt: selectedSlot.startAt
    });

    return sendTwiML(
      res,
      response(
        gather({ action, text: confirmPrompt(match.service, selectedSlot.startAt) }),
        say("Sorry, I did not receive a choice."),
        redirect(action)
      )
    );
  });

  router.post("/confirm/:serviceKey", async (req, res) => {
    const digit = req.body.Digits;
    if (digit === "0") {
      return sendTwiML(res, withFallback(req, mainMenuPrompt(), "/voice/main-menu"));
    }

    const match = getServiceByKey(req.params.serviceKey);
    if (!match || !req.query.startAt) {
      return sendTwiML(res, withFallback(req, mainMenuPrompt("Sorry, that booking could not be found. "), "/voice/main-menu"));
    }

    if (digit !== "1") {
      return sendTwiML(
        res,
        response(
          gather({
            action: actionUrl(req, `/voice/confirm/${match.service.key}`, { startAt: req.query.startAt }),
            text: ["Sorry, that was not a valid choice.", ...confirmPrompt(match.service, req.query.startAt)]
          }),
          say("Sorry, I did not receive a choice."),
          redirect(actionUrl(req, `/voice/confirm/${match.service.key}`, { startAt: req.query.startAt }))
        )
      );
    }

    let appointment;
    try {
      appointment = await bookingClient.createAppointment({
        service: match.service,
        startAt: req.query.startAt,
        customerPhone: req.body.From || "unknown"
      });
    } catch (error) {
      console.error("Voice appointment create failed", error);
      return sendTwiML(res, bookingSystemTroubleResponse());
    }

    const when = formatSlotForSpeech({ startAt: appointment.startAt }, business.timezone);
    return sendTwiML(
      res,
      response(
        say(`You're booked for ${when}. Thank you for calling ${business.name}. Goodbye.`),
        hangup()
      )
    );
  });

  return router;
}

module.exports = {
  createVoiceRouter
};
