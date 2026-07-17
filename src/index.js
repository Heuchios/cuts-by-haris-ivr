const express = require("express");
const { business } = require("./businessData");
const { createVoiceRouter } = require("./routes/voice");
const { createMockSetmoreClient } = require("./setmore/mockSetmoreClient");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (req, res) => {
  res.type("text/plain").send(`${business.name} IVR is running. Twilio webhook: /voice/incoming`);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    business: business.name,
    timezone: business.timezone
  });
});

const bookingClient = createMockSetmoreClient({ business });
app.use("/voice", createVoiceRouter({ bookingClient }));

app.listen(port, () => {
  console.log(`Cuts By Haris IVR listening on http://localhost:${port}`);
});
