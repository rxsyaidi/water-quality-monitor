// The Arduino sketch for the UNO R4 WiFi, filled in with this tank's key and limits. It is the project's
// own sketch (same pins, formulas and LCD) with the confirm and restart rules and a report to the app
// added. The pump decision always stays on the board, so it keeps working when the Wi-Fi drops.
import type { Device } from "./data";

type Fill = { key: string; supabaseUrl: string; publishableKey: string; device: Device };

const num = (v: number, d = 2) => Number(v).toFixed(d);

export function sketchFileName(d: Device) {
  return `water_quality_${d.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "tank"}.ino`;
}

export function sketch({ key, supabaseUrl, publishableKey, device: d }: Fill) {
  const host = new URL(supabaseUrl).host;
  return `// Water Quality Monitor, UNO R4 WiFi sketch for "${d.name}".
// Made by the app on ${new Date().toISOString().slice(0, 10)}. Not yet tested on the real hardware:
// check it on the bench with the pump unplugged before trusting it with a tank.
//
// Wiring (same as the project): pH sensor A0, turbidity sensor A1, pump relay D2, LCD I2C at 0x27.
// Libraries: WiFiS3 (comes with the UNO R4 board package) and LiquidCrystal_I2C.
//
// The board reads both sensors every 2 s and decides on its own: a reading must stay out of range
// for CONFIRM_S before the pump stops, and back in range for RESTART_S before it restarts.
// Each reading is sent to the app, which replies with the current limits and calibration.

#include <WiFiS3.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// 1. Your Wi-Fi (2.4 GHz)
const char WIFI_NAME[] = "your-wifi-name";
const char WIFI_PASSWORD[] = "your-wifi-password";

// 2. Filled in by the app. Keep the device key private: anyone with it can send readings for this tank.
const char HOST[] = "${host}";
const char API_KEY[] = "${publishableKey}";
const char DEVICE_KEY[] = "${key}";

// wiring
const int PH_PIN = A0;
const int NTU_PIN = A1;
const int RELAY_PIN = 2;
// many relay modules switch on with LOW: swap these two if the pump runs when it should not
const int RELAY_ON = HIGH;
const int RELAY_OFF = LOW;

// limits and calibration, as saved in the app today; the app's reply keeps them current
float phMin = ${num(d.ph_min)};
float phMax = ${num(d.ph_max)};
float ntuMax = ${num(d.ntu_max, 1)};
long confirmMs = ${d.confirm_s}000L;
long restartMs = ${d.restart_s}000L;
float phSlope = ${num(d.ph_slope, 4)};
float phOffset = ${num(d.ph_offset, 4)};
float clearVolt = ${num(d.clear_volt, 3)};

const unsigned long SAMPLE_MS = 2000;

LiquidCrystal_I2C lcd(0x27, 16, 2); // some modules are 0x3F
WiFiSSLClient client;

enum State { SAFE, CHECKING, STOPPED, RESTARTING };
State state = SAFE;
unsigned long outSince = 0, inSince = 0, lastSample = 0;
float ph = 7.0, ntu = 0, phV = 0, ntuV = 0;
bool online = false;

const char *stateName(State s) {
  switch (s) {
    case CHECKING: return "checking";
    case STOPPED: return "stopped";
    case RESTARTING: return "restarting";
    default: return "safe";
  }
}

float readVoltage(int pin) {
  long total = 0;
  for (int i = 0; i < 10; i++) { total += analogRead(pin); delay(10); }
  return (total / 10.0) * (5.0 / 1023.0);
}

float toPh(float v) { return phSlope * v + phOffset; }

float toNtu(float v) {
  v = v + (4.2 - clearVolt);          // line this sensor's clear water voltage up with the curve
  if (v < 2.5) return 3000.0;         // the curve bends back below 2.5 V: treat it as very cloudy
  if (v > 4.2) return 0.0;
  float n = -1120.4 * v * v + 5742.3 * v - 4352.9;
  return n < 0 ? 0 : n;
}

bool inRange() { return ph >= phMin && ph <= phMax && ntu <= ntuMax; }

void decide(unsigned long now) {
  bool ok = inRange();
  switch (state) {
    case SAFE:
      if (!ok) { state = CHECKING; outSince = now; }
      break;
    case CHECKING:
      if (ok) state = SAFE;
      else if (now - outSince >= (unsigned long)confirmMs) state = STOPPED;
      break;
    case STOPPED:
      if (ok) { state = RESTARTING; inSince = now; }
      break;
    case RESTARTING:
      if (!ok) state = STOPPED;
      else if (now - inSince >= (unsigned long)restartMs) state = SAFE;
      break;
  }
  bool pumpOn = state == SAFE || state == CHECKING;
  digitalWrite(RELAY_PIN, pumpOn ? RELAY_ON : RELAY_OFF);
}

void printRow(int row, const char *text) {
  char line[17];
  snprintf(line, sizeof(line), "%-16s", text);
  lcd.setCursor(0, row);
  lcd.print(line);
}

void show() {
  char a[8], b[8], row[17];
  dtostrf(ph, 4, 1, a);
  dtostrf(ntu, 5, 1, b);
  snprintf(row, sizeof(row), "pH%s NTU%s", a, b);
  printRow(0, row);
  const char *msg = state == SAFE ? "SAFE   PUMP ON" : state == CHECKING ? "CHECK  PUMP ON"
                  : state == STOPPED ? "DANGER PUMP OFF" : "WAIT   PUMP OFF";
  snprintf(row, sizeof(row), "%-15s%c", msg, online ? '*' : ' ');
  printRow(1, row);
}

// pulls "name":number out of the reply, keeping the old value if it is missing
void take(const String &body, const char *name, float &into) {
  String k = String("\\"") + name + "\\":";
  int i = body.indexOf(k);
  if (i >= 0) into = body.substring(i + k.length()).toFloat();
}

void applyConfig(const String &body) {
  if (body.indexOf("\\"ph_max\\"") < 0) return;
  float c = confirmMs / 1000.0, r = restartMs / 1000.0;
  take(body, "ph_min", phMin);
  take(body, "ph_max", phMax);
  take(body, "ntu_max", ntuMax);
  take(body, "confirm_s", c);
  take(body, "restart_s", r);
  take(body, "ph_slope", phSlope);
  take(body, "ph_offset", phOffset);
  take(body, "clear_volt", clearVolt);
  confirmMs = (long)(c * 1000);
  restartMs = (long)(r * 1000);
}

bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.begin(WIFI_NAME, WIFI_PASSWORD);
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 8000) delay(250);
  return WiFi.status() == WL_CONNECTED;
}

// one HTTPS request per reading, on a kept-alive connection
void report() {
  if (!ensureWifi()) { online = false; return; }
  if (!client.connected()) {
    client.stop();
    if (!client.connect(HOST, 443)) { online = false; return; }
  }
  bool pumpOn = state == SAFE || state == CHECKING;
  String body = String("{\\"p_key\\":\\"") + DEVICE_KEY + "\\",\\"p_ph\\":" + String(ph, 2) +
                ",\\"p_ntu\\":" + String(ntu, 1) + ",\\"p_pump_on\\":" + (pumpOn ? "true" : "false") +
                ",\\"p_state\\":\\"" + stateName(state) + "\\",\\"p_ph_v\\":" + String(phV, 3) +
                ",\\"p_ntu_v\\":" + String(ntuV, 3) + "}";
  client.print(String("POST /rest/v1/rpc/ingest HTTP/1.1\\r\\nHost: ") + HOST +
               "\\r\\napikey: " + API_KEY +
               "\\r\\nContent-Type: application/json\\r\\nConnection: keep-alive\\r\\nContent-Length: " +
               body.length() + "\\r\\n\\r\\n" + body);

  int status = 0;
  long length = -1;
  unsigned long t = millis();
  while (client.connected() && millis() - t < 4000) {
    String line = client.readStringUntil('\\n');
    if (status == 0 && line.startsWith("HTTP/1.1 ")) status = line.substring(9, 12).toInt();
    line.toLowerCase();
    if (line.startsWith("content-length:")) length = line.substring(15).toInt();
    if (line == "\\r" || line.length() == 0) break;
  }
  String reply;
  while (length > 0 && millis() - t < 4000) {
    if (client.available()) { reply += (char)client.read(); length--; }
  }
  online = status == 200;
  if (online) applyConfig(reply);
  else client.stop();
  Serial.print(F("app: ")); Serial.println(status);
}

void setup() {
  Serial.begin(9600);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_OFF); // off until the first safe reading
  lcd.init();
  lcd.backlight();
  printRow(0, "WATER MONITOR");
  printRow(1, "CONNECTING...");
  ensureWifi();
  // start as if the water was just out of range, so the pump waits for RESTART_S of safe readings
  state = RESTARTING;
  inSince = millis();
}

void loop() {
  unsigned long now = millis();
  if (now - lastSample < SAMPLE_MS) return;
  lastSample = now;

  phV = readVoltage(PH_PIN);
  ntuV = readVoltage(NTU_PIN);
  ph = toPh(phV);
  ntu = toNtu(ntuV);
  decide(now);
  show();
  report();

  Serial.print(F("pH ")); Serial.print(ph, 2);
  Serial.print(F(" | NTU ")); Serial.print(ntu, 1);
  Serial.print(F(" | ")); Serial.println(stateName(state));
}
`;
}
