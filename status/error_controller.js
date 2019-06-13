
export class ErrorController {
  constructor(container) {
    this.container = container;

    this.errors = [];
  }
  error(e) {
    // See if I can dedup these errors:
    for (const otherError of this.errors) {
      // Maybe include module deadline to ensure that we're talking about the
      // exact same module?
      if (otherError.message == e.message &&
          otherError.module == e.module) {
        // We can combine this error:
        if (otherError.affectedClients) {
          if (!otherError.affectedClients.some(c => c == e.client)) {
            otherError.affectedClients.push(e.client);
          }
        } else if (otherError.client != e.client) {
          otherError.affectedClients = [otherError.client, e.client];
        }
        otherError.timestamp = e.timestamp;
        otherError.timestampSinceModuleStart = e.timestampSinceModuleStart;
        otherError.count = otherError.count || 1;
        otherError.count++;
        e = null;
      }
    }
    if (e) {
      this.errors.push(e);
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
        const newErrorEl = document.createElement('div');
        newErrorEl.innerHTML = `<div>
          <span class="timestamp"></span>
          <span class="clients"></span>
          <span class="module"></span>:
          <span class="message"></span>
        </div>`;
        e.element = newErrorEl.firstElementChild;
      }

      e.element.querySelector('.timestamp').textContent =
          `${e.timestamp.toFixed(1)} (+${e.timestampSinceModuleStart.toFixed(2)})`;
      const clientsEl = e.element.querySelector('.clients');
      if (e.affectedClients) {
        clientsEl.textContent = '<multiple>';
        clientsEl.title = e.affectedClients.join('\n');
      } else {
        clientsEl.textContent = e.client;
        clientsEl.title = e.client;
      }
      e.element.querySelector('.module').textContent = e.module;
      const messageEl = e.element.querySelector('.message');
      messageEl.title = e.stack;
      messageEl.textContent = e.message;

      if (e.count > 1) {
        let countEl = e.element.querySelector('.count');
        if (!countEl) {
          countEl = document.createElement('span');
          countEl.className = 'count';
          e.element.insertBefore(countEl, e.element.firstElementChild);
        }
        countEl.textContent = e.count;
      }
    }

    // Wipe container & add elements in.
    Array.from(this.container.children).forEach(e => e.remove());
    for (const e of this.errors) {
      this.container.appendChild(e.element);
    }
  }
  disconnect() {
    this.errors = [];
  }
}
