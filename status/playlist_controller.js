export class PlaylistController {
  constructor(container, getTime) {
    this.container = container;
    this.getTime = getTime;

    // A list of layouts. A layout is uniquely determined by its nextLayoutDeadline.
    // We keep the last 24 hours of layouts in this here list, to help debug any
    // issues (that's 86400000 ms, if you care). It's updated everytime we get
    // a notification of a transition from the server. A layout contains a list
    // of modules and an index that determines what module is currently playing.
    // The module player plays modules on a regular beat (the period of which is
    // determined by the moduleDuration associated with the layout). Layouts
    // also have a certain duration, but the module player waits until all of
    // its modules are loaded, which makes it harder to predict exactly when a
    // layout will begin.
    this.layouts = [];
  }
  addToLayouts(data) {
    // First, determine if this is a new layout, or a change to an existing
    // layout.
    if (this.layouts.length && this.layouts[0].nextLayoutDeadline == data.nextLayoutDeadline) {
      // Same layout. Just update the moduleIndex.
      if (data.moduleIndex < this.layouts[0].moduleIndex) {
        this.layouts[0].numLoopsBack++;
      }
      this.layouts[0].moduleIndex = data.moduleIndex;
      this.layouts[0].nextDeadline = data.nextDeadline;
    } else {
      // New layout!

      // Add copies of the module over and over until we hit our deadline.
      const moduleDuration = data.layouts[data.layoutIndex].moduleDuration * 1000;
      const moduleList = Array.from({length: data.moduleIndex}, (_, i) => {
        return {
          name: data.moduleList[i],
          deadline: -1
        };
      });
      for (let d = data.nextDeadline, i = 0; d < data.nextLayoutDeadline + moduleDuration; d += moduleDuration, ++i) {
        const index = (data.moduleIndex + i) % data.moduleList.length;
        moduleList.push({
          name: data.moduleList[index],
          deadline: Math.min(d, data.nextLayoutDeadline),
        });
      }

      this.layouts.unshift({
        numLoopsBack: 0,
        moduleIndex: data.moduleIndex,
        nextLayoutDeadline: data.nextLayoutDeadline,
        modules: moduleList,
        moduleList: data.moduleList,
        index: data.layoutIndex,
        moduleDuration,
      });

      const mostRecentDeadline = this.layouts[0].nextLayoutDeadline;
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      while (mostRecentDeadline - this.layouts[this.layouts.length - 1].nextLayoutDeadline > ONE_DAY_MS) {
        const l = this.layouts.pop();
        l.element.remove();
      }
    }
  }
  updateTransitionData(data) {
    if (this.layouts.length) {
      Array.from(this.layouts[0].element.querySelectorAll('.module'))
          .forEach(e => e.classList.remove('current'));
    }
    this.addToLayouts(data);

    // Update most recent layout el.
    if (!this.layouts[0].element) {
      const e = document.createElement('div');
      e.className = 'layout';
      this.layouts[0].element = e;

      const header = document.createElement('div');
      header.className = 'header';
      header.textContent = `Layout ${this.layouts[0].index}`;
      e.appendChild(header);

      for (const m of this.layouts[0].modules) {
        const mEl = document.createElement('div');
        mEl.classList.add('module');

        const nEl = document.createElement('span');
        nEl.textContent = m.name;
        mEl.appendChild(nEl);

        const tEl = document.createElement('span');
        tEl.classList.add('timestamp');
        if (m.deadline >= 0) {
          tEl.textContent = ` until ${m.deadline}`;
        }
        mEl.appendChild(tEl);

        e.appendChild(mEl);
      }

      const footer = document.createElement('div');
      footer.className = 'footer';
      footer.textContent = this.layouts[0].nextLayoutDeadline.toFixed(1);
      e.appendChild(footer);
    }

    // Update the layout:
    const moduleEls = Array.from(this.layouts[0].element.querySelectorAll('.module'));
    const currentIndex = this.layouts[0].moduleIndex + this.layouts[0].numLoopsBack * this.layouts[0].moduleList.length;
    for (let i = 0; i < moduleEls.length; i++) {
      const el = moduleEls[i];
      if (currentIndex == i) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
      if (i <= currentIndex) {
        el.classList.add('past');
      }
    }

    // First, off, let's just list the modules as they exist today.
    // We'll highlight the bold one.

    const {container} = this;
    const oldScrollPos = container.scrollTop;
    const scrollToEnd = container.scrollHeight - oldScrollPos === container.clientHeight;
    [...this.layouts].reverse()
        .filter(l => !l.element.parentNode)
        .forEach(l => container.appendChild(l.element));
    if (scrollToEnd) {
      container.scrollTop = container.scrollHeight;
    }
  }
  render() {
    if (!this.lineEl) {
      this.lineEl = document.createElement('div');
      this.lineEl.id = 'line';
    }
    if (!this.lineEl.parentNode) {
      this.container.appendChild(this.lineEl);
    }
    const now = this.getTime();
    // Figure out which layout we are playing.
    const l = this.layouts.find(l => l.nextLayoutDeadline > now);
    if (!l) {
      // At end.
      this.lineEl.style.top = this.container.scrollHeight;
      return;
    }

    // Figure out which module we're talking about.
    const moduleIndex = l.modules.findIndex(({deadline}) => deadline > now);
    const moduleDeadline = l.modules[moduleIndex].deadline;
    const moduleDuration = moduleIndex > 0 ?
        l.modules[moduleIndex].deadline - l.modules[moduleIndex - 1].deadline :
        l.moduleDuration;
    const moduleEls = l.element.querySelectorAll('.module');
    const moduleEl = moduleEls[moduleIndex];
    const top = moduleEl.offsetTop;
    const height = moduleEl.offsetHeight;

    this.lineEl.style.top = ((1 - (moduleDeadline - now) / moduleDuration) * height + top - 1) + 'px';
  }
  error() {
    if (this.layouts.length) {
      const currentIndex = this.layouts[0].moduleIndex + this.layouts[0].numLoopsBack * this.layouts[0].moduleList.length;
      const moduleEls = Array.from(this.layouts[0].element.querySelectorAll('.module'));
      moduleEls[currentIndex].classList.add('error');
    }
  }
  disconnect() {
    this.layouts = [];
    Array.from(this.container.children).forEach(e => e.remove());
  }
}
