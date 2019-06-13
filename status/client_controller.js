
export class ClientController {
  constructor(container) {
    this.container = container;
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;

    this.wallGeometry = undefined;

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.container.appendChild(this.svg);
    this.clients = [];
  }
  makeEl() {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    g.appendChild(rect);
    g.appendChild(text);
    return g;
  }
  setClients(data) {
    for (const d of data) {
      this.newClient(d, false);
    }

    if (this.wallGeometry) {
      this.renderClients();
    }
  }
  calculateTransform() {
    const xs = this.wallGeometry.map(p => p.x);
    const ys = this.wallGeometry.map(p => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);

    const B = 20;
    const W = this.width - 2 * B;
    const H = this.height - 2 * B;

    let scale;
    if (W / H > w / h) {
      scale = H / h;
    } else {
      scale = W / w;
    }

    this.tx = x => x * scale + B;
    this.ty = y => y * scale + B;
  }
  setWallGeometry(geo) {
    this.wallGeometry = geo;

    if (!this.wallPath) {
      this.wallPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.svg.appendChild(this.wallPath);
    }

    this.calculateTransform();

    this.wallPath.setAttribute('d', this.wallGeometry.map((p, i) => {
      const x = this.tx(p.x);
      const y = this.ty(p.y);
      return `${i == 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ') + ' Z');

    if (this.clients.length) {
      this.renderClients();
    }
  }
  newClient(d, render = true) {
    this.clients.push({
      id: d,
      rect: d.split(','),
      element: this.makeEl(),
    });

    if (render && this.wallGeometry) {
      this.renderClients();
    }
  }
  renderClients() {
    for (const c of this.clients) {
      if (!c.element.parentNode) {
        const rect = c.element.firstChild;
        const rectStrokeWidth = 1;
        rect.setAttribute('x', this.tx(c.rect[0]) + rectStrokeWidth);
        rect.setAttribute('y', this.ty(c.rect[1]) + rectStrokeWidth);
        rect.setAttribute('width', this.tx(c.rect[2]) - this.tx(0) - 2*rectStrokeWidth);
        rect.setAttribute('height', this.ty(c.rect[3]) - this.ty(0) - 2*rectStrokeWidth);

        const text = rect.nextSibling;
        text.textContent = c.id;
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('alignment-baseline', 'central');
        text.setAttribute('x', this.tx(c.rect[0] + c.rect[2] / 2));
        text.setAttribute('y', this.ty(c.rect[1] + c.rect[3] / 2));

        this.svg.appendChild(c.element);
      }
    }
  }
  lostClient(c) {
    const i = this.clients.findIndex(client => client.id == c);
    if (i >= 0) {
      this.clients[i].element.remove();
      this.clients.splice(i, 1);
    }
  }
  disconnect() {
    this.clients.length = 0;
    this.wallPath = null;
  }
}
