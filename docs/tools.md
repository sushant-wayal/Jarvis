# Jarvis V1 Registered Tools

Jarvis features a modular tool registry (`apps/brain/src/modules/tools/registry.ts`). Tools are declared dynamically to the Google Gemini SDK using Zod input validation schemas.

---

## Registered V1 Tools

### 1. Calculator (`calculator`)
- **Description**: Performs mathematical calculations accurately (addition, subtraction, multiplication, division, percentages).
- **Parameters**:
  - `expression` (string): Math expression, e.g. `"1836100 / 12"`, `"15% of 85000"`.

### 2. Current Time (`current_time`)
- **Description**: Returns the current time and day for a specific timezone or city.
- **Parameters**:
  - `timezone` (string, optional): IANA timezone string, e.g. `"Europe/London"`, `"Asia/Kolkata"`.
  - `city` (string, optional): City name, e.g. `"London"`, `"Tokyo"`.

### 3. Date / Time Calculation (`date_time`)
- **Description**: Returns today's date or calculates days until a target weekday (e.g. Friday).
- **Parameters**:
  - `targetDayOfWeek` (string, optional): Day of week, e.g. `"Friday"`.

### 4. Weather (`weather`)
- **Description**: Real-time weather conditions and practical advice via Open-Meteo API provider abstraction.
- **Parameters**:
  - `location` (string): City or region, e.g. `"Tokyo"`, `"London"`, `"Mumbai"`.

### 5. Web Search (`web_search`)
- **Description**: Live web lookup for current events, facts, entity descriptions, or real-time details.
- **Parameters**:
  - `query` (string): Search query phrase.
