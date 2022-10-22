import { CreditJson } from "../../client/title_card.ts";

interface CommonBrickJson {
  name: string;
  credit: CreditJson;
  config?: Record<string, unknown>;
  testonly?: boolean;
}

export interface BaseBrickJson extends CommonBrickJson {
  root: string;
  client_path: string;
  server_path?: string;
}

export interface ExtendsBrickJson extends CommonBrickJson {
  extends?: string;
}

export type BrickJson = ExtendsBrickJson | BaseBrickJson;

export function isBaseBrickJson(
  brickJson: BrickJson,
): brickJson is BaseBrickJson {
  return !((brickJson as ExtendsBrickJson).extends);
}
export function isExtendsBrickJson(
  brickJson: BrickJson,
): brickJson is ExtendsBrickJson {
  return !!((brickJson as ExtendsBrickJson).extends);
}

export interface LayoutConfig {
  modules?: string[];
  collection?: "__ALL__" | string;
  moduleDuration: number;
  duration: number;
}

export interface PlaylistJson {
  collections?: Record<string, string[]>;
  modules?: BrickJson[];
  playlist: LayoutConfig[];
}
