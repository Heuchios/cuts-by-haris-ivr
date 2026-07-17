function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function say(text) {
  return `<Say voice="alice" language="en-US">${escapeXml(text)}</Say>`;
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
  redirect,
  response,
  say,
  sendTwiML
};

