const express = require("express");
const { business } = require("./businessData");
const { createSmsRouter } = require("./routes/sms");
const { createVoiceRouter } = require("./routes/voice");
const { createBookingClient } = require("./setmore/bookingClientFactory");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const bookingClient = createBookingClient({ business });

app.get("/", (req, res) => {
  res
    .type("text/plain")
    .send(`${business.name} booking app is running. Voice webhook: /voice/incoming. SMS webhook: /sms/incoming`);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    business: business.name,
    timezone: business.timezone,
    smsForwardingEnabled: Boolean(process.env.OWNER_PHONE_NUMBER),
    bookingMode: bookingClient.mode,
    setmore: bookingClient.configStatus
  });
});

app.use("/sms", createSmsRouter({ bookingClient }));
app.use("/voice", createVoiceRouter({ bookingClient }));

app.listen(port, () => {
  console.log(`Cuts By Haris IVR listening on http://localhost:${port}`);
});
