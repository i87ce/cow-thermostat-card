/**
 * Minimal Home Assistant types — we keep our own subset instead of pulling
 * @types/home-assistant-js-websocket because we only ever read a handful of
 * fields and we want zero runtime deps in the bundle.
 */

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
  };
  last_changed?: string;
  last_updated?: string;
}

export interface HassClimateAttributes {
  hvac_action?: "heating" | "cooling" | "idle" | "off" | "fan" | "drying";
  hvac_modes?: Array<"off" | "heat" | "cool" | "heat_cool" | "auto" | "dry" | "fan_only">;
  current_temperature?: number;
  temperature?: number;
  target_temp_high?: number;
  target_temp_low?: number;
  fan_mode?: string;
  fan_modes?: string[];
  min_temp?: number;
  max_temp?: number;
  target_temp_step?: number;
  current_humidity?: number;
}

export interface HassLightAttributes {
  brightness?: number; // 0-255
  color_mode?: string;
  /**
   * HA ≥ 2021.4 light entities expose every mode the platform supports.
   * A purely on/off light reports `["onoff"]`; anything else (`brightness`,
   * `color_temp`, `xy`, `rgb`, …) signals the bulb can be dimmed. We rely
   * on this rather than the legacy `supported_features` bitfield because
   * the bitfield was deprecated in 2021.4 and most modern integrations
   * report `0` even for fully dimmable lights.
   */
  supported_color_modes?: string[];
  supported_features?: number;
}

export interface HassCoverAttributes {
  current_position?: number; // 0 = closed, 100 = open
  current_tilt_position?: number;
}

export interface HassSensorAttributes {
  unit_of_measurement?: string;
  device_class?: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  /**
   * Standard fire-and-forget service call.
   * For services that return data (e.g. `music_assistant.search`,
   * `music_assistant.get_library`), use {@link callServiceWithResponse}.
   */
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: { entity_id?: string | string[] },
  ): Promise<void>;
  /**
   * HA ≥ 2024.4 service calls that return a payload. The host frontend
   * passes `return_response: true` to the websocket. We model it as an
   * overload so call sites stay readable.
   */
  callService(
    domain: string,
    service: string,
    serviceData: Record<string, unknown> | undefined,
    target: { entity_id?: string | string[] } | undefined,
    notifyOnError: boolean,
    returnResponse: true,
  ): Promise<{ response?: unknown }>;
  language?: string;
  locale?: { language: string; time_format?: string };
  /**
   * Currently-authenticated user. Frontend populates this from the
   * /api/auth/current_user response. Used by `cow-redirect-card` to
   * route the kiosk to the right room dashboard.
   */
  user?: {
    id: string;
    name: string;
    is_admin?: boolean;
  };
}

export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: LovelaceCardConfig): void;
}

declare global {
  interface Window {
    customCards?: Array<{
      type: string;
      name: string;
      description?: string;
      preview?: boolean;
    }>;
  }
}
