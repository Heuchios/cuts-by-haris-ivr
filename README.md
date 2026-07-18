# Cuts By Haris IVR Starter

This is a small Node.js/Twilio starter for appointment booking by SMS, with the original voice menu still available.

Current MVP behavior:

- Business name: Cuts By Haris
- Timezone: Saskatoon, Saskatchewan (`America/Regina`)
- Business hours: 9:00 AM to 6:00 PM, Monday through Sunday
- Calls outside business hours hear a closed message, then can still book through the keypad menu
- Callers choose a category, then service, then one of the next available mock appointment times
- Pressing `0` returns to the main menu from submenus
- Setmore is represented by a mock adapter until API access is approved
- Spoken prompts use `Polly.Joanna` at `90%` speed by default
- Menu options include a short `450ms` pause between choices
- SMS customers can text booking phrases such as `book`, `haircut`, `fade`, or `appointment`, then choose category/service/time by number
- If `OWNER_PHONE_NUMBER` is set, non-booking texts forward to the owner phone without sending a bot reply to the customer

## Menus

Main menu:

- `1` Haircut
- `2` Beard
- `3` Perm
- `4` Kids
- `5` Seniors

Submenus include the services shown in Setmore.

## Run locally

```bash
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Twilio webhook:

```text
POST https://your-public-url/voice/incoming
POST https://your-public-url/sms/incoming
```

For local Twilio testing, expose the app with a tunnel such as ngrok and set `PUBLIC_BASE_URL` to the tunnel URL.

## Deploy on Render

Create a new Render Web Service from this project.

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- Environment variable after deploy: `PUBLIC_BASE_URL=https://your-render-url.onrender.com`
- Optional voice variables:
  - `TWILIO_TTS_VOICE=Polly.Joanna`
  - `TWILIO_TTS_LANGUAGE=en-US`
  - `TWILIO_TTS_RATE=90%`
  - `TWILIO_MENU_OPTION_PAUSE=450ms`
- Optional smart SMS routing:
  - `OWNER_PHONE_NUMBER=+13065551212`

Once deployed, set the Twilio phone number's incoming call webhook to:

```text
https://your-render-url.onrender.com/voice/incoming
```

Use `POST` as the webhook method.

For text booking, set the Twilio phone number's incoming message webhook to:

```text
https://your-render-url.onrender.com/sms/incoming
```

Use `POST` as the webhook method.

Normal text routing:

- Customer texts a booking phrase like `book`, `haircut`, `fade`, `beard`, `appointment`, `can I get in`, `any openings`, `walk-ins`, or `squeeze me in`: booking menu starts.
- Customer texts anything else: message forwards to `OWNER_PHONE_NUMBER` without an automatic customer reply.
- Owner replies with `r +13065551212 your message`.
- Owner can reply to the most recent forwarded customer with `r your message`.

## Next integration step

After Setmore API access is approved, replace `src/setmore/mockSetmoreClient.js` with a real Setmore adapter that:

- lists available time slots for service/staff/date
- creates or finds the caller as a Setmore customer
- creates the appointment in Setmore
- returns the final appointment ID
