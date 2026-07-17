const assert = require("node:assert/strict");
const test = require("node:test");
const { say, textToSpeechRate } = require("../src/twiml");

test("spoken prompts use a calmer default speaking rate", () => {
  delete process.env.TWILIO_TTS_RATE;

  const xml = say("Thanks for calling Cuts By Haris.");

  assert.equal(textToSpeechRate(), "85%");
  assert.match(xml, /voice="Polly\.Joanna"/);
  assert.match(xml, /<prosody rate="85%">Thanks for calling Cuts By Haris\.<\/prosody>/);
});
