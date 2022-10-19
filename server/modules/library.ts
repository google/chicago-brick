/** A class that holds onto all the known module definitions. */

import { easyLog } from "../../lib/log.ts";
import {
  BrickJson,
  isBaseBrickJson,
  isExtendsBrickJson,
} from "../playlist/playlist.ts";
import { ModuleDef } from "./module_def.ts";

const log = easyLog("wall:library");

class ModuleLibrary extends Map<string, ModuleDef> {
  serialize(): Record<string, BrickJson> {
    return [...library.values()].reduce((ret, def) => {
      ret[def.name] = {
        name: def.name,
        root: def.root,
        extends: def.baseName,
        client_path: def.clientPath,
        server_path: def.serverPath,
        config: def.config,
        credit: def.credit,
        testonly: def.testonly,
      };
      return ret;
    }, {} as Record<string, BrickJson>);
  }
  /**
   * Turns module configs into module defs. Returns a map of name => def.
   */
  loadAllModules(configs: BrickJson[]) {
    for (const config of configs.filter(isBaseBrickJson)) {
      // This is a "base" module. Make a moduleDef.
      this.set(
        config.name,
        new ModuleDef(
          config.name,
          config.root,
          {
            server: config.server_path ?? "",
            client: config.client_path ?? "",
          },
          "",
          config.config ?? {},
          config.credit || {},
          !!config.testonly,
        ),
      );
    }

    for (const config of configs.filter(isExtendsBrickJson)) {
      // This is an extension module, so we need to combine some things to make a module def.
      const base = this.get(config.extends!);
      if (!base) {
        log.error(
          `Module ${config.name} attempted to extend module ${config.extends}, which cannot be found.`,
        );
        continue;
      }
      this.set(
        config.name,
        new ModuleDef(
          config.name,
          base.root,
          {
            server: base.serverPath,
            client: base.clientPath,
          },
          base.name,
          { ...base.config, ...config.config ?? [] },
          config.credit || {},
          !!config.testonly,
        ),
      );
    }
  }
}

export const library = new ModuleLibrary();
