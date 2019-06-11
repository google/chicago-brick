import {CanvasSurface} from '/client/surface/canvas_surface.js';

export function load(debug, state, wallGeometry) {
  // TODO(applmak): Use a real color object/library.
  const darken = (color, i) => {
    return `#${color.substr(1).match(/.{2}/g).map(c => Math.max(0, parseInt(c, 16) - 5*i).toString(16).padStart(2, '0')).join('')}`;
  };

  class SlitherClient {
    async willBeShownSoon(container) {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.canvas = this.surface.context;
    }
    draw(time) {
      // Clear the screen.
      this.canvas.fillStyle = 'black';
      this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);

      const snakesTimeline = state.get('snakes');
      if (!snakesTimeline) {
        return;
      }

      const snakes = [];
      for (let i = 100; i < 120*20; i += 120) {
        let s = snakesTimeline.get(time - i);
        if (s) {
          snakes.unshift(s);
        }
      }

      if (!snakes.length) {
        return;
      }

      // Push a transform.
      this.surface.pushOffset();

      this.canvas.strokeStyle = 'gray';
      this.canvas.lineWidth = 8.0;
      snakes[0].forEach((_, index) => {
        this.canvas.beginPath();
        snakes.forEach(snake => {
          this.canvas.ellipse(snake[index].position.x, snake[index].position.y, 50, 50, 0, 0, 2*Math.PI, false);
        });
        this.canvas.stroke();
        snakes.forEach((snake, i) => {
          this.canvas.fillStyle = darken(snakes[0][index].color, snakes.length - 1 - i);
          this.canvas.beginPath();
          this.canvas.ellipse(snake[index].position.x, snake[index].position.y, 50, 50, 0, 0, 2*Math.PI, false);
          this.canvas.fill();
        });
        let s = snakes[snakes.length - 1][index];
        this.canvas.fillStyle = 'white';
        this.canvas.beginPath();
        let x = s.position.x + Math.cos(s.heading - Math.PI/4) * 25;
        let y = s.position.y + Math.sin(s.heading - Math.PI/4) * 25;
        this.canvas.ellipse(x, y, 10, 10, 0, 0, 2*Math.PI, false);
        x = s.position.x + Math.cos(s.heading + Math.PI/4) * 25;
        y = s.position.y + Math.sin(s.heading + Math.PI/4) * 25;
        this.canvas.ellipse(x, y, 10, 10, 0, 0, 2*Math.PI, false);
        this.canvas.fill();

        this.canvas.fillStyle = 'black';
        this.canvas.beginPath();
        x = s.position.x + Math.cos(s.heading - Math.PI/4) * 26;
        y = s.position.y + Math.sin(s.heading - Math.PI/4) * 26;
        this.canvas.ellipse(x, y, 5, 5, 0, 0, 2*Math.PI, false);
        x = s.position.x + Math.cos(s.heading + Math.PI/4) * 26;
        y = s.position.y + Math.sin(s.heading + Math.PI/4) * 26;
        this.canvas.ellipse(x, y, 5, 5, 0, 0, 2*Math.PI, false);
        this.canvas.fill();
      });

      this.surface.popOffset();
    }
  }

  return {client: SlitherClient};
}
