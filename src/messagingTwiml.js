function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function message(text, attrs = {}) {
  const attrText = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join("");

  return `<Message${attrText}>${escapeXml(text)}</Message>`;
}

function response(...nodes) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${nodes.join("")}</Response>`;
}

function sendMessagingTwiML(res, xml) {
  res.type("text/xml").send(xml);
}

module.exports = {
  message,
  response,
  sendMessagingTwiML
};
