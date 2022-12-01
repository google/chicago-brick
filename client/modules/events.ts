import { Point } from "../../lib/math/vector2d.ts";
import { CreditJson } from "../title_card.ts";

export interface SerializedModule {
  name: string;
  path: string;
  credit: CreditJson;
  config: unknown;
}

export interface LoadModuleEvent {
  module: SerializedModule;
  time: number;
  geo: Point[];
}

declare global {
  interface EmittedEvents {
    loadModule(config: LoadModuleEvent): void;
  }
}
