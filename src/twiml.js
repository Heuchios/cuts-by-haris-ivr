function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function textToSpeechVoice() {
  return process.env.TWILIO_TTS_VOICE || "Polly.Joanna";
}

function textToSpeechLanguage() {
  return process.env.TWILIO_TTS_LANGUAGE || "en-US";
}

function textToSpeechRate() {
  return process.env.TWILIO_TTS_RATE || "85%";
}

function menuOptionPause() {
  return process.env.TWILIO_MENU_OPTION_PAUSE || "450ms";
}

function speechContent(prompt) {
  const parts = Array.isArray(prompt) ? prompt : [prompt];
  return parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .map(escapeXml)
    .join(`<break time="${escapeXml(menuOptionPause())}"/>`);
}

function say(text) {
  return [
    `<Say voice="${escapeXml(textToSpeechVoice())}" language="${escapeXml(textToSpeechLanguage())}">`,
    `<prosody rate="${escapeXml(textToSpeechRate())}">${speechContent(text)}</prosody>`,
    "</Say>"
  ].join("");
}

function gather({ action, text, timeout = 7, numDigits = 1 }) {
  return [
    `<Gather input="dtmf" action="${escapeXml(action)}" method="POST" timeout="${timeout}" numDigits="${numDigits}">`,
    say(text),
    "</Gather>"
  ].join("");
}

function redirect(action) {
  return `<Redirect method="POST">${escapeXml(action)}</Redirect>`;
}

function hangup() {
  return "<Hangup />";
}

function response(...nodes) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${nodes.join("")}</Response>`;
}

function sendTwiML(res, xml) {
  res.type("text/xml").send(xml);
}

module.exports = {
  gather,
  hangup,
  menuOptionPause,
  redirect,
  response,
  say,
  sendTwiML,
  textToSpeechRate
};
