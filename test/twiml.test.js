const assert = require("node:assert/strict");
const test = require("node:test");
const { menuOptionPause, say, textToSpeechRate } = require("../src/twiml");

test("spoken prompts use a calmer default speaking rate", () => {
  delete process.env.TWILIO_TTS_RATE;

  const xml = say("Thanks for calling Cuts By Haris.");

  assert.equal(textToSpeechRate(), "85%");
  assert.match(xml, /voice="Polly\.Joanna"/);
  assert.match(xml, /<prosody rate="85%">Thanks for calling Cuts By Haris\.<\/prosody>/);
});

test("spoken menu parts include a short pause between options", () => {
  delete process.env.TWILIO_MENU_OPTION_PAUSE;

  const xml = say(["For skin fade, press 1.", "For regular haircut, no fade, press 2."]);

  assert.equal(menuOptionPause(), "450ms");
  assert.match(xml, /For skin fade, press 1\.<break time="450ms"\/>For regular haircut, no fade, press 2\./);
});
