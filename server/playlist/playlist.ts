export interface CreditAuthorTitleJson {
  title: string;
  author?: string;
}

export interface CreditImageJson {
  image: string;
}

export type CreditJson = CreditAuthorTitleJson | CreditImageJson;

// TODO: Fix this to be a union.
export interface BrickJson {
  name: string;
  extends?: string;
  client_path: string;
  server_path?: string;
  credit: CreditJson;
  config?: Record<string, unknown>;
  testonly: boolean;
}

export interface ModuleConfig extends BrickJson {
  root: string;
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
