const { listServices } = require("../businessData");
const { getLocalDateParts } = require("../utils/time");

const DEFAULT_BASE_URL = "https://developer.setmore.com";
const DEFAULT_API_PREFIX = "/api/v2";
const DEFAULT_LOOKAHEAD_DAYS = 21;
const DEFAULT_SLOT_LIMIT = 12;
const REGINA_UTC_OFFSET_HOURS = 6;
const TOKEN_REFRESH_SAFETY_MS = 60 * 1000;
const ERROR_PREVIEW_MAX_LENGTH = 240;

class SetmoreApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SetmoreApiError";
    this.details = details;
  }
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function trimSlashes(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function normalizeApiPrefix(value) {
  const text = `/${trimSlashes(value || DEFAULT_API_PREFIX)}`;
  return text === "/" ? DEFAULT_API_PREFIX : text;
}

function stripQuery(value) {
  return String(value || "").split("?")[0];
}

function apiPrefixFromTokenPath(path) {
  const match = String(path || "").match(/^(\/api\/v\d+)\/o\/oauth2\/token$/);
  return match ? match[1] : "";
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function serviceEnvSuffix(serviceKey) {
  return String(serviceKey || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function serviceKeyEnvName(service) {
  return `SETMORE_SERVICE_KEY_${serviceEnvSuffix(service.key)}`;
}

function parseServiceKeysJson(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function serviceKeyMapFromEnv(env, services) {
  const map = { ...parseServiceKeysJson(env.SETMORE_SERVICE_KEYS_JSON) };
  for (const service of services) {
    const value = env[serviceKeyEnvName(service)];
    if (value) {
      map[service.key] = value;
    }
  }
  return map;
}

function responsePreview(value) {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text
    .replace(/access_token["':\s]+[^"',}\s]+/gi, "access_token: [redacted]")
    .replace(/refreshToken=[^&\s]+/gi, "refreshToken=[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[redacted-phone]")
    .slice(0, ERROR_PREVIEW_MAX_LENGTH);
}

function troubleshootingHint(error) {
  const details = error?.details || {};
  const path = String(details.path || "");
  const message = String(error?.message || "");

  if (message.includes("token refresh") || stripQuery(path).includes("/oauth2/token")) {
    return "Setmore rejected the refresh token or token URL. Re-check the copied refresh token in Render.";
  }
  if (message.includes("staff key") || path.includes("/staffs")) {
    return "Setmore staff lookup failed. Add SETMORE_STAFF_KEY in Render.";
  }
  if (message.includes("service key") || path.includes("/services")) {
    return "Setmore service lookup failed. Add the matching SETMORE_SERVICE_KEY_* value in Render.";
  }
  if (path.includes("/appointments/slots")) {
    return "Setmore rejected the slot lookup. This usually means the staff key, service key, or slot request format needs adjustment.";
  }
  if (path.includes("/appointment/create")) {
    return "Setmore rejected appointment creation. The selected slot may no longer be available, or the appointment payload needs adjustment.";
  }
  if (path.includes("/customer")) {
    return "Setmore rejected customer lookup or creation.";
  }

  return "Check Render logs for the full server-side stack trace.";
}

function sanitizeSetmoreError(operation, error) {
  const details = error?.details || {};
  const status = details.status || "";
  const path = stripQuery(details.path || "");

  return {
    at: new Date().toISOString(),
    operation,
    name: error?.name || "Error",
    message: error?.message || "Unknown Setmore error",
    status,
    path,
    responsePreview: responsePreview(details.data),
    hint: troubleshootingHint(error)
  };
}

function getSetmoreConfigStatus({ business, env = process.env }) {
  const services = listServices(business);
  const serviceKeyMap = serviceKeyMapFromEnv(env, services);
  const configuredServiceKeys = services.filter((service) => Boolean(serviceKeyMap[service.key]));
  const enabled = isTruthy(env.SETMORE_ENABLED);
  const hasRefreshToken = Boolean(env.SETMORE_REFRESH_TOKEN);

  return {
    enabled,
    ready: enabled && hasRefreshToken,
    mode: enabled && hasRefreshToken ? "setmore" : "mock",
    baseUrl: trimTrailingSlash(env.SETMORE_API_BASE_URL) || DEFAULT_BASE_URL,
    apiPrefix: normalizeApiPrefix(env.SETMORE_API_PREFIX),
    hasRefreshToken,
    hasStaffKey: Boolean(env.SETMORE_STAFF_KEY),
    staffNameConfigured: Boolean(env.SETMORE_STAFF_NAME),
    configuredServiceKeyCount: configuredServiceKeys.length,
    totalServiceCount: services.length,
    missingServiceKeyEnv: services
      .filter((service) => !serviceKeyMap[service.key])
      .map((service) => serviceKeyEnvName(service))
  };
}

function unwrapSetmoreData(data) {
  if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "data")) {
    return data.data;
  }
  return data;
}

function collectArrays(value, arrays = []) {
  if (!value || typeof value !== "object") return arrays;
  if (Array.isArray(value)) {
    arrays.push(value);
    return arrays;
  }
  for (const item of Object.values(value)) {
    collectArrays(item, arrays);
  }
  return arrays;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:min|mins|minute|minutes|regular|cut)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function possibleServiceNames(service) {
  return [service.key, service.name, service.speechName]
    .map(normalizeName)
    .filter(Boolean);
}

function setmoreServiceNames(service) {
  return [
    service.name,
    service.service_name,
    service.serviceName,
    service.title,
    service.key
  ]
    .map(normalizeName)
    .filter(Boolean);
}

function pickKey(value) {
  if (!value || typeof value !== "object") return "";
  return value.key || value.service_key || value.serviceKey || value.id || value.service_id || value.serviceId || "";
}

function makeReginaLocalDate(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour + REGINA_UTC_OFFSET_HOURS, minute));
}

function addDaysToLocalDate(local, days) {
  const shifted = makeReginaLocalDate(local.year, local.month, local.day + days, 12, 0);
  return getLocalDateParts(shifted, "America/Regina");
}

function formatSelectedDate(local) {
  return [
    String(local.day).padStart(2, "0"),
    String(local.month).padStart(2, "0"),
    String(local.year)
  ].join("/");
}

function parseTimeOnLocalDate(value, local) {
  const text = String(value || "").trim();
  if (!text) return "";

  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && /(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }

  const timeMatch = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
  if (!timeMatch) return "";

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const meridiem = String(timeMatch[3] || "").toLowerCase().replace(/\./g, "");
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return makeReginaLocalDate(local.year, local.month, local.day, hour, minute).toISOString();
}

function slotStartValue(slot) {
  if (typeof slot === "string") return slot;
  if (!slot || typeof slot !== "object") return "";
  return (
    slot.startAt ||
    slot.start_at ||
    slot.startTime ||
    slot.start_time ||
    slot.datetime ||
    slot.date_time ||
    slot.timestamp ||
    slot.time ||
    slot.slot ||
    slot.value ||
    ""
  );
}

function slotId(slot, startAt, service) {
  if (slot && typeof slot === "object") {
    return slot.id || slot.key || slot.slot_key || slot.slotKey || startAt;
  }
  return `setmore-${service.key}-${startAt}`;
}

function normalizeSlots(payload, { service, local }) {
  const arrays = collectArrays(payload);
  const rawSlots = arrays.find((items) => items.length > 0) || [];

  return rawSlots
    .map((slot) => {
      const startAt = parseTimeOnLocalDate(slotStartValue(slot), local);
      if (!startAt) return null;
      return {
        id: slotId(slot, startAt, service),
        startAt,
        serviceKey: service.key,
        raw: slot
      };
    })
    .filter(Boolean);
}

function addMinutes(isoString, minutes) {
  const date = new Date(isoString);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function extractToken(data) {
  return (
    data?.data?.token?.access_token ||
    data?.data?.access_token ||
    data?.token?.access_token ||
    data?.access_token ||
    ""
  );
}

function extractExpiresIn(data) {
  return (
    Number(data?.data?.token?.expires_in) ||
    Number(data?.data?.expires_in) ||
    Number(data?.token?.expires_in) ||
    Number(data?.expires_in) ||
    3600
  );
}

function extractCustomer(payload) {
  const data = unwrapSetmoreData(payload);
  if (!data) return null;
  if (Array.isArray(data)) return data[0] || null;
  if (Array.isArray(data.customer)) return data.customer[0] || null;
  if (data.customer && typeof data.customer === "object") return data.customer;
  return data;
}

function extractAppointment(payload) {
  const data = unwrapSetmoreData(payload);
  if (!data) return null;
  if (data.appointment && typeof data.appointment === "object") return data.appointment;
  return data;
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function renderGeneratedCustomerEmail(phone) {
  const digits = phoneDigits(phone) || "unknown";
  return `sms-${digits}@cuts-by-haris.invalid`;
}

class SetmoreClient {
  constructor({ business, env = process.env, fetchImpl = fetch, now = () => new Date() }) {
    this.business = business;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.mode = "setmore";
    this.baseUrl = trimTrailingSlash(env.SETMORE_API_BASE_URL) || DEFAULT_BASE_URL;
    this.apiPrefix = normalizeApiPrefix(env.SETMORE_API_PREFIX);
    this.refreshToken = env.SETMORE_REFRESH_TOKEN;
    this.tokenPath = env.SETMORE_TOKEN_PATH || `${this.apiPrefix}/o/oauth2/token`;
    this.serviceKeyMap = serviceKeyMapFromEnv(env, listServices(business));
    this.staffKey = env.SETMORE_STAFF_KEY || "";
    this.staffName = env.SETMORE_STAFF_NAME || "";
    this.lookaheadDays = Number(env.SETMORE_LOOKAHEAD_DAYS || DEFAULT_LOOKAHEAD_DAYS);
    this.slotLimit = Number(env.SETMORE_SLOT_LIMIT || DEFAULT_SLOT_LIMIT);
    this.accessToken = "";
    this.accessTokenExpiresAt = 0;
    this.servicesCache = null;
    this.staffCache = null;
    this.lastError = null;
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new SetmoreApiError("SETMORE_REFRESH_TOKEN is missing.");
    }

    const paths = uniqueValues([
      this.tokenPath,
      `${this.apiPrefix}/o/oauth2/token`,
      "/api/v2/o/oauth2/token",
      "/api/v1/o/oauth2/token"
    ]);
    let lastFailure = null;

    for (const path of paths) {
      const encodedUrl = new URL(path, this.baseUrl);
      encodedUrl.searchParams.set("refreshToken", this.refreshToken);
      const rawTokenUrl = `${this.baseUrl}${path}?refreshToken=${this.refreshToken}`;
      const urls = uniqueValues([encodedUrl.toString(), rawTokenUrl]);

      for (const tokenUrl of urls) {
        const response = await this.fetchImpl(tokenUrl, {
          method: "GET",
          headers: {
            Accept: "application/json"
          }
        });

        const data = await this.parseResponse(response);
        if (!response.ok) {
          lastFailure = {
            status: response.status,
            path,
            data
          };
          continue;
        }

        const token = extractToken(data);
        if (!token) {
          lastFailure = {
            status: response.status,
            path,
            data
          };
          continue;
        }

        const matchedPrefix = apiPrefixFromTokenPath(path);
        if (matchedPrefix) {
          this.apiPrefix = matchedPrefix;
          this.tokenPath = path;
        }
        this.accessToken = token;
        this.accessTokenExpiresAt = Date.now() + extractExpiresIn(data) * 1000;
        return token;
      }
    }

    throw new SetmoreApiError("Setmore token refresh failed.", {
      path: this.tokenPath,
      ...(lastFailure || {})
    });
  }

  async ensureAccessToken() {
    if (!this.accessToken || Date.now() + TOKEN_REFRESH_SAFETY_MS >= this.accessTokenExpiresAt) {
      await this.refreshAccessToken();
    }
    return this.accessToken;
  }

  async parseResponse(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async request(path, options = {}, retry = true) {
    const token = await this.ensureAccessToken();
    const url = new URL(path, this.baseUrl);
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers
    };

    const response = await this.fetchImpl(url.toString(), {
      ...options,
      headers
    });
    const data = await this.parseResponse(response);

    if (response.status === 401 && retry) {
      this.accessToken = "";
      await this.refreshAccessToken();
      return this.request(path, options, false);
    }

    if (!response.ok) {
      throw new SetmoreApiError("Setmore API request failed.", {
        status: response.status,
        path,
        data
      });
    }

    return unwrapSetmoreData(data);
  }

  async requestAny(paths, options = {}) {
    let lastError = null;
    for (const path of paths) {
      try {
        return await this.request(path, options);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  apiPath(path) {
    return `${this.apiPrefix}/${trimSlashes(path)}`;
  }

  async getStaffKey() {
    if (this.staffKey) return this.staffKey;
    if (!this.staffCache) {
      await this.ensureAccessToken();
      const payload = await this.request(this.apiPath("bookingapi/staffs"));
      const staff = collectArrays(payload).find((items) => items.length > 0) || [];
      this.staffCache = staff;
    }

    const selected = this.staffName
      ? this.staffCache.find((staff) => normalizeName(staff.name || staff.staff_name || staff.first_name) === normalizeName(this.staffName))
      : this.staffCache[0];

    const key = pickKey(selected);
    if (!key) {
      throw new SetmoreApiError("Could not find a Setmore staff key. Set SETMORE_STAFF_KEY in Render.");
    }

    this.staffKey = key;
    return key;
  }

  async getServiceKey(service) {
    if (this.serviceKeyMap[service.key]) {
      return this.serviceKeyMap[service.key];
    }

    if (!this.servicesCache) {
      await this.ensureAccessToken();
      const payload = await this.request(this.apiPath("bookingapi/services"));
      this.servicesCache = collectArrays(payload).find((items) => items.length > 0) || [];
    }

    const localNames = possibleServiceNames(service);
    const match = this.servicesCache.find((candidate) => {
      const candidateNames = setmoreServiceNames(candidate);
      return candidateNames.some((candidateName) => {
        return localNames.some((localName) => candidateName === localName || candidateName.includes(localName) || localName.includes(candidateName));
      });
    });

    const key = pickKey(match);
    if (!key) {
      throw new SetmoreApiError(
        `Could not find Setmore service key for ${service.name}. Set ${serviceKeyEnvName(service)} in Render.`
      );
    }

    this.serviceKeyMap[service.key] = key;
    return key;
  }

  async listAvailableSlots({ service, count = 3, from = this.now() }) {
    try {
      const staffKey = await this.getStaffKey();
      const serviceKey = await this.getServiceKey(service);
      await this.ensureAccessToken();
      let local = getLocalDateParts(from, this.business.timezone);
      const slots = [];

      for (let day = 0; day < this.lookaheadDays && slots.length < count; day += 1) {
        const selectedDate = formatSelectedDate(local);
        const payload = await this.requestAny([this.apiPath("bookingapi/appointments/slots"), this.apiPath("bookingapi/slots")], {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            staff_key: staffKey,
            service_key: serviceKey,
            selected_date: selectedDate,
            off_hours: false,
            double_booking: false,
            timezone: this.business.timezone,
            slot_limit: this.slotLimit
          })
        });

        slots.push(...normalizeSlots(payload, { service, local }));
        local = addDaysToLocalDate(local, 1);
      }

      return slots.slice(0, count);
    } catch (error) {
      this.lastError = sanitizeSetmoreError("listAvailableSlots", error);
      throw error;
    }
  }

  async findCustomer(customerPhone) {
    await this.ensureAccessToken();
    const query = new URLSearchParams({
      phone: customerPhone
    });
    const payload = await this.request(`${this.apiPath("bookingapi/customer")}?${query.toString()}`);
    return extractCustomer(payload);
  }

  async createCustomer(customerPhone) {
    await this.ensureAccessToken();
    const digits = phoneDigits(customerPhone);
    const payload = await this.request(this.apiPath("bookingapi/customer/create"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        first_name: "SMS",
        last_name: digits ? `Customer ${digits.slice(-4)}` : "Customer",
        email_id: renderGeneratedCustomerEmail(customerPhone),
        country_code: "CA",
        cell_phone: customerPhone,
        comment: "Created by Cuts By Haris SMS booking bot."
      })
    });

    return extractCustomer(payload);
  }

  async getOrCreateCustomer(customerPhone) {
    try {
      const found = await this.findCustomer(customerPhone);
      if (pickKey(found)) return found;
    } catch {
      // Some Setmore accounts only allow customer lookup by name/email.
    }

    const created = await this.createCustomer(customerPhone);
    if (!pickKey(created)) {
      throw new SetmoreApiError("Setmore customer create response did not include a customer key.", { created });
    }

    return created;
  }

  async createAppointment({ service, startAt, customerPhone }) {
    try {
      const staffKey = await this.getStaffKey();
      const serviceKey = await this.getServiceKey(service);
      await this.ensureAccessToken();
      const customer = await this.getOrCreateCustomer(customerPhone);
      const customerKey = pickKey(customer);

      const payload = await this.request(this.apiPath("bookingapi/appointment/create"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          staff_key: staffKey,
          service_key: serviceKey,
          customer_key: customerKey,
          start_time: new Date(startAt).toISOString(),
          end_time: addMinutes(startAt, service.durationMinutes),
          cost: service.priceDollars
        })
      });

      const appointment = extractAppointment(payload);
      return {
        id: pickKey(appointment) || `setmore-${Date.now()}`,
        serviceKey: service.key,
        startAt,
        customerPhone,
        status: "booked",
        raw: appointment
      };
    } catch (error) {
      this.lastError = sanitizeSetmoreError("createAppointment", error);
      throw error;
    }
  }

  getLastError() {
    return this.lastError;
  }
}

function createSetmoreClient(options) {
  return new SetmoreClient(options);
}

module.exports = {
  SetmoreApiError,
  createSetmoreClient,
  getSetmoreConfigStatus,
  serviceKeyEnvName
};
