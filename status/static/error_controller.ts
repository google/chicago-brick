import { RecordErrorMessage } from "../../client/util/error_logger.ts";

interface SavedError {
  message?: string;
  stack?: string;
  module: string;
  affectedClients?: string[];
  count?: number;
  client: string;
  timestamp: number;
  timestampSinceModuleStart: number;
  element?: HTMLElement;
}

interface ArgsParams {
  module: string;
  timestamp: number;
  timestampSinceModuleStart: number;
}

export class ErrorController {
  readonly errors: SavedError[] = [];
  constructor(readonly container: HTMLElement) {}
  error(e: RecordErrorMessage) {
    if (!e.client) {
      e.client = "server";
    }
    let didCombineError = false;
    // Try to extract some useful values from the args parameter.
    let module = "";
    let timestampSinceModuleStart = 0;
    let timestamp = 0;

    if ((e.args[0] as ArgsParams).module) {
      const params = e.args[0] as ArgsParams;
      ({ module, timestampSinceModuleStart, timestamp } = params);
    }
    // See if I can dedup these errors:
    for (const otherError of this.errors) {
      // Maybe include module deadline to ensure that we're talking about the
      // exact same module?
      if (
        otherError.message == e.message &&
        otherError.module == module
      ) {
        // We can combine this error:
        if (otherError.affectedClients) {
          if (!otherError.affectedClients.some((c) => c == e.client)) {
            otherError.affectedClients.push(e.client);
          }
        } else if (otherError.client != e.client) {
          otherError.affectedClients = [otherError.client, e.client];
        }
        otherError.timestamp = timestamp;
        otherError.timestampSinceModuleStart = timestampSinceModuleStart;
        otherError.count = otherError.count || 1;
        otherError.count++;
        didCombineError = true;
        break;
      }
    }
    if (!didCombineError) {
      this.errors.push({
        client: e.client,
        message: e.message,
        stack: e.stack,
        module,
        timestamp,
        timestampSinceModuleStart,
      });
      while (this.errors.length >= 100) {
        this.errors.shift();
      }
    }

    // Now, update the display:
    this.errors.sort((a, b) => {
      return a.timestamp - b.timestamp;
    });

    // Generate/update elements for errors;
    for (const e of this.errors) {
      if (!e.element) {
        const newErrorEl = document.createElement("div");
        newErrorEl.innerHTML = `<div>
          <span class="timestamp"></span>
          <span class="clients"></span>
          <span class="module"></span>:
          <span class="message"></span>
        </div>`;
        e.element = newErrorEl.firstElementChild as HTMLElement;
      }

      let timestampStr = `${e.timestamp.toFixed(1)}`;
      if (e.timestampSinceModuleStart) {
        timestampStr += ` (${e.timestampSinceModuleStart.toFixed(2)})`;
      }
      e.element.querySelector(".timestamp")!.textContent = timestampStr;
      const clientsEl = e.element.querySelector(".clients")! as HTMLElement;
      if (e.affectedClients) {
        clientsEl.textContent = "<multiple>";
        clientsEl.title = e.affectedClients.join("\n");
      } else {
        clientsEl.textContent = e.client;
        clientsEl.title = e.client;
      }
      e.element.querySelector(".module")!.textContent = e.module;
      const messageEl = e.element.querySelector(".message") as HTMLElement;
      if (e.stack) {
        messageEl.title = e.stack;
      }
      messageEl.textContent = e.message || "No error message";

      if ((e.count || 0) > 1) {
        let countEl = e.element.querySelector(".count")! as HTMLElement;
        if (!countEl) {
          countEl = document.createElement("span");
          countEl.className = "count";
          e.element.insertBefore(countEl, e.element.firstElementChild);
        }
        countEl.textContent = String(e.count);
      }
    }

    // Wipe container & add elements in.
    Array.from(this.container.children).forEach((e) => e.remove());
    for (const e of this.errors) {
      this.container.appendChild(e.element!);
    }
  }
  disconnect() {
    this.errors.length = 0;
  }
}
