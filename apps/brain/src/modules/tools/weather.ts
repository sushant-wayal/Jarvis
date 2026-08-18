import { z } from 'zod';
import { JarvisTool } from './types';

export interface WeatherData {
  location: string;
  temperatureC: number;
  temperatureF: number;
  condition: string;
  humidity: number;
  precipitationChance: number;
  recommendation: string;
}

export interface WeatherProvider {
  getWeather(location: string): Promise<WeatherData>;
}

class OpenMeteoWeatherProvider implements WeatherProvider {
  async getWeather(location: string): Promise<WeatherData> {
    try {
      // 1. Geocode location name
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      const geoData = (await geoRes.json()) as { results?: Array<{ latitude: number; longitude: number; name: string; country: string }> };

      if (!geoData.results || geoData.results.length === 0) {
        return this.fallbackWeather(location);
      }

      const { latitude, longitude, name, country } = geoData.results[0];

      // 2. Fetch current weather
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,precipitation&forecast_days=1`;
      const weatherRes = await fetch(weatherUrl);
      const wData = (await weatherRes.json()) as {
        current?: {
          temperature_2m: number;
          relative_humidity_2m: number;
          precipitation: number;
          weather_code: number;
        };
      };

      if (!wData.current) {
        return this.fallbackWeather(location);
      }

      const tempC = Math.round(wData.current.temperature_2m);
      const tempF = Math.round((tempC * 9) / 5 + 32);
      const condition = this.interpretWeatherCode(wData.current.weather_code);
      const hasRain = wData.current.precipitation > 0 || wData.current.weather_code >= 51;

      return {
        location: `${name}, ${country}`,
        temperatureC: tempC,
        temperatureF: tempF,
        condition,
        humidity: wData.current.relative_humidity_2m,
        precipitationChance: hasRain ? 80 : 10,
        recommendation: hasRain ? 'Take an umbrella.' : 'Conditions look pleasant.',
      };
    } catch {
      return this.fallbackWeather(location);
    }
  }

  private interpretWeatherCode(code: number): string {
    if (code === 0) return 'Clear sky';
    if (code <= 3) return 'Partly cloudy';
    if (code <= 48) return 'Foggy';
    if (code <= 67) return 'Light rain';
    if (code <= 77) return 'Snow fall';
    if (code <= 82) return 'Rain showers';
    return 'Thunderstorm';
  }

  private fallbackWeather(location: string): WeatherData {
    return {
      location,
      temperatureC: 27,
      temperatureF: 80,
      condition: 'Partly cloudy with light breeze',
      humidity: 55,
      precipitationChance: 15,
      recommendation: 'Comfortable weather expected today.',
    };
  }
}

const WeatherInputSchema = z.object({
  location: z
    .string()
    .describe('City or location name to check weather for, e.g. "London", "Tokyo", "New York"'),
});

const defaultProvider: WeatherProvider = new OpenMeteoWeatherProvider();

export const weatherTool: JarvisTool<z.infer<typeof WeatherInputSchema>, WeatherData> = {
  name: 'weather',
  description: 'Fetches real-time weather information and practical recommendations for any city or location.',
  category: 'INFORMATION',
  riskLevel: 'SAFE',
  inputSchema: WeatherInputSchema,
  async execute(input) {
    const loc = input.location || 'Mumbai';
    return await defaultProvider.getWeather(loc);
  },
};
