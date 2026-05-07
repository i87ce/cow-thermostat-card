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
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: { entity_id: string | string[] },
  ): Promise<void>;
  language?: string;
  locale?: { language: string; time_format?: string };
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
