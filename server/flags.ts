import commandLineArgs from "https://esm.sh/command-line-args@5.2.1";
import commandLineUsage from "https://esm.sh/command-line-usage@6.1.3";

const FLAG_DEFS = [
  { name: "help", type: Boolean, description: "Shows this help." },
  {
    name: "port",
    type: Number,
    defaultValue: 3000,
    description: "The port on which the brick server should run.",
  },
  {
    name: "playlist",
    type: String,
    alias: "p",
    defaultValue: "config/demo-playlist.json",
    description: "The path to the playlist to run.",
  },
  {
    name: "module",
    type: String,
    defaultValue: [],
    multiple: true,
    alias: "m",
    description: "If provided, runs only this module on repeat.",
  },
  {
    name: "layout_duration",
    type: Number,
    description: "The default layout duration in seconds.",
  },
  {
    name: "module_duration",
    type: Number,
    description: "The default module duration in seconds.",
  },
  {
    name: "assets_dir",
    type: String,
    alias: "d",
    // demo_modules contains the platform demos.
    // The modules dir should contain your own modules.
    defaultValue: ["demo_modules", "modules"],
    multiple: true,
    description: "List of directories of modules and assets.  Everything " +
      "under these dirs will be available under " +
      "/asset/(whatever is under your directories).",
  },
  {
    name: "module_dir",
    type: String,
    defaultValue: ["demo_modules/*", "node_modules/*"],
    multiple: true,
    description: "A glob pattern matching directories that contain module " +
      "code may be specified multiple times.",
  },
  {
    name: "use_geometry",
    type: JSON.parse,
    defaultValue: null,
    description:
      "When passed-in, describes the geometry of the wall via turtle-like commands. " +
      "See server/util/wall_geometry for the parser for the format.",
  },
  {
    name: "geometry_file",
    type: String,
    description: "The path to a JSON file describing the geometry of the wall.",
  },
  { name: "screen_width", type: Number, defaultValue: 1920 },
  {
    name: "credential_dir",
    type: String,
    description:
      "The path to a directory containing credentials needed by various modules that access external APIs.",
  },
  {
    name: "enable_monitoring",
    type: Boolean,
    description: "When true, enables a monitoring display on the client.",
  },
  {
    name: "https_cert",
    type: String,
    defaultValue: "",
    description: "Path to a SSL certification file. Often has extension crt.",
  },
  {
    name: "https_key",
    type: String,
    defaultValue: "",
    description: "Path to a SSL key file. Often has extension key.",
  },
  {
    name: "calendar_id",
    type: String,
    defaultValue: "",
    description: "Id of a Google Calendar used to configure the wall.",
  },
];

export interface Flags {
  help?: boolean;
  port: number;
  playlist: string;
  module: string[];
  layout_duration?: number;
  module_duration?: number;
  assets_dir: string[];
  module_dir: string[];
  use_geometry: ReturnType<typeof JSON.parse>;
  geometry_file?: string;
  screen_width: number;
  credential_dir?: string;
  enable_monitoring?: boolean;
  https_cert: string;
  https_key: string;
  calendar_id: string;
}

export const flags = commandLineArgs(FLAG_DEFS) as Flags;

if (flags.help) {
  console.log(
    "Available flags: " + commandLineUsage({ optionList: FLAG_DEFS }),
  );
  Deno.exit();
}
