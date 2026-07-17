function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function message(text) {
  return `<Message>${escapeXml(text)}</Message>`;
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

