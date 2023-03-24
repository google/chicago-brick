import { BrickJson, ExtendsBrickJson } from "../playlist.ts";
import { CreditAuthorTitleJson } from "../../../client/title_card.ts";
import { easyLog } from "../../../lib/log.ts";

const log = easyLog("wall:calendar");

export interface ModuleDescription {
  moduleDef?: BrickJson;

  // Fallback used when no moduleDef is provided.
  moduleName: string;
}

export function parseDescription(desc: string): ModuleDescription {
  // Check if JSON when starts with "{".
  if (desc.includes("{")) {
    try {
      const moduleDef = JSON.parse(desc);
      return { moduleDef, moduleName: moduleDef.name };
    } catch (e) {
      log.error(`Error parsing module def as JSON:`, desc);
      log.error(e);
      throw e;
    }
  }

  // Parse as slideshow key/value pairs when contains ":".
  // Values will override and extend the slideshow module.
  if (desc.includes(":")) {
    const credit: CreditAuthorTitleJson = { title: "" };

    const config = {
      load: {},
      display: {
        fullscreen: {},
      },
      // deno-lint-ignore no-explicit-any
    } as any;

    const brickjson = {
      name: "",
      credit,
      extends: "slideshow",
      config,
    } as ExtendsBrickJson;

    for (const line of desc.split(/\n+/g)) {
      const [key, value] = line.split(/\s*:\s*/);
      if (key === "name") {
        brickjson.name = value;
      } else if (key === "title") {
        credit.title = value;
      } else if (key === "drive-folder") {
        config.load.drive = config.load.drive || {};
        config.load.drive.folderIds = config.load.drive.folderIds || [];
        config.load.drive.folderIds.push(...value.split(","));
      } else if (key === "drive-file") {
        config.load.drive = config.load.drive || {};
        config.load.drive.fileIds = config.load.drive.fileIds || [];
        config.load.drive.fileIds.push(...value.split(","));
      } else if (key === "period") {
        config.display.fullscreen.period = Number(value);
      } else if (key === "split" && value === "true") {
        config.display.fullscreen.split = true;
      } else if (key === "shuffle" && value === "true") {
        config.display.fullscreen.shuffle = true;
      }
    }
    return { moduleDef: brickjson, moduleName: brickjson.name };
  }

  // Fallback using description as module name.
  return { moduleName: desc };
}
