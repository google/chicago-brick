# Chicago Brick Presentation

## Getting Started

- Install deno: `http://deno.land/`

- Install vscode: `https://code.visualstudio.com/`

- Clone chicago-brick: `$ git clone https://github.com/google/chicago-brick`

## Introduction

applmak@ helped build the wall and has helped maintain it since 2015. Now, he
lives in Munich. Here he is at Oktoberfest:

    ███▓▓█▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓█████
    ███████▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
    ██████████▓▓▓▓▓▓▓▀╩╠▀▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
    █████████████▀▒░░φ░≤░≥╚╙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
    ▓▓▓████████▒╩╔╣╬▒φ║φφ░"░░║▓▓▓▓▓▓▓▓▓▓▓▓▓▓
    ▓▓▓████▓▓▓▓░`║╬╠╬╬╬╬▒▒φφ░░╫▓▓▓▓▓▓▓▓▓▓▓▓▓
    ▓╣╣╣▓▓▓▓▓▓▓░ ║╩╙╚╩╠╩╙╙╚╠░ ╙▓▓▓▌╠▓█▓▓▓▓▓▓
    ▓▓▓▓▓▓▓▓▓▓▓▌∩╬╓░«╔║▒░╓φφ╠ ║▓██╠╣╣╬╬╬╠╠╠╠
    ▓▓▓▓▓▓▓▓▓▓▓▓▒╣╣▒╣╬╣╬╠╢╣╠╠░║▓▓▓╬▒╠╚╢▒╣╬╠║
    ▓▓▓▓▓▓▓▓▓▓▓▓▓╠░╙░φε"φ░░░░╠▓▓▓▓▒╢╣▒▒╣▒╫▐║
    ╣╣▓▓▓▓▓▓▓▓╬╣▓▌░░╔φφφ░╓]░½▓▓▓▓▓╬╣║╬▓▒╣╝╝╝
    ▓▓▓╣╣╣▓▓▓▓▓▓▒▓▒░╚╬▒φ╠╙"░╝▓▓╣▓▓╬╣╬╣▓╣╣▒╣▒
    ╣╢▓╬╩╫╝╝▓╣▓▀ÿ╣▒░,└╙╙` ╔░ ║▓▓▓╣╬╣╣╣▒╬╠║▓▓
    φφ░░░∩ⁿ'.'  ╬╢╠║▒φφφφ▒░╓▒╣▒└╙╝▓╣▓▓▒╠╬╬▒║
    ╬╬╣⌐       Å▒╫╠╝╣▒╠╠╠░╬╣▒╬║   ╠▓▓▓╣▒▒║║╣
    ╬╬╚        .       `     `╙╙  ║╣╬╬╣╣▓▓╣@
    ▒║≥                           ║▓╝╣╬╝╝╝╜╣
    φ▒░                           ║▒░░║╣╢╣╣▒
    ▒▒`                `          ╙╙╙╙╠╬╝σ║╬
    ░≤                                ╚╠▒╠╚╬
    δ∩,      ` '      ⁿ⌐        ``    "∩╠║░▒
    ⁿ "                               `'╙╙┴╜

The wall schedules _modules_ to draw content on the wall. There are many modules
already written. Let's look at one.

## Our first module

- Open `demo_modules/solid/brick.json` in vscode.

Every module has a `brick.json` file that describes information about the
module. These are automatically discovered in the `demo_modules` folder or other
folders as specified on the command-line.

- Open `demo_modules/solid/solid.ts`.

Modules consist of a _client_ and _server_ part. This module is really simple,
and only has a client part that fills the screen with a single color.

Let's walk through the code.

- Run `$ bin/run_1x1.sh -m solid`.

This will start the server and open a chrome window for the client, and then
execute the `solid` module forever.

Note: I've mostly tested this on work linux desktop, work mac laptop, and
personal mac laptop. Haven't tested a lot on Windows. I don't think it works on
ChromeOS at all.

- Documentation:
  [2D Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)

- Exercise #1: Change the color!

Now, let's add a parameter to the draw method:

```typescript
draw(time: number) {
  this.canvas.fillStyle = this.color;
  this.canvas.fillRect(
    0,
    0,
    this.surface!.virtualRect.w,
    this.surface!.virtualRect.h,
  );
}
```

`time` is a monotonically increasing # of milliseconds since the server started.
You can use it to animate things on the client. Here's an example:

```typescript
draw(time: number) {
  const width = this.surface!.virtualRect.w;
  const height = this.surface!.virtualRect.h;
  const a = 5, b = 4.01;

  // Calculate position of the circle.
  const x = width / 2 * (1 + Math.sin(a * Math.PI * time / 1000));
  const y = height / 2 * (1 + Math.sin(b * Math.PI * time / 1000));

  this.canvas.beginPath();
  this.canvas.arc(x, y, 100, 0, 2 * Math.PI);

  // Change the circle color slowly.
  const color = Math.floor(255 * ((time / 10000) % 1));
  this.canvas.fillStyle = `rgb(${color}, ${color}, ${color})`;
  this.canvas.fill();
}
```

- Exercise #2: Animate something!

### Bonus: Parametric Rendering

This kind of module determines the whole state of rendering with only time as
input. I call this kind of module _parametric_. It's generally the simplest to
understand and to extend to other screens, as we'll see in a moment.

### Multiple screens

- Run `$ bin/run_2x2.sh -m solid`.

- Run `$ bin/start_2x2_clients.sh`.

You'll now see four copies of Chrome that are all running your module. Note that
they are running in sync (the animations are locked together, more or less.

Oftentimes, we don't want to treat each screen as its own module, we want to
draw across all of the screens at once. Obviously, because these are all
separate copies of Chrome, we don't tell one copy to draw into the window of
another. Instead, we only draw the right part inside of the right screen in
order to make it appear like we're drawing across the whole wall at once.

We can modify the example to do this really easily, as there's a pair of handy
functions to help us out.

```typescript
draw(time: number) {
  (this.surface as CanvasSurface).pushOffset();
  const width = this.surface!.wallRect.w;
  const height = this.surface!.wallRect.h;
  // ...
  (this.surface as CanvasSurface).popOffset();
}
```

- Exercise #3: Try this in your own module. Draw all over your mini 2x2 wall.

There's a good client-only more complex example in `demo_modules/doodles`.

## Simulation

Because every client can run at its own framerate, it's hard to sample
randomness in reliable way in the `draw` method. If one client is running faster
because its drawing is cheaper, it will sample the randomness more often, so
even seeded randomness can quickly get out of sync.

In order to make things more random, you can use the server part of the module
to perform the simulation, and send the results of that simulation to the
clients, who will render it.

So for these modules, there are three parts: a simulation that generates some
state, network traffic to get that state to the clients, and then rendering code
that draws that state.

- Open `demo_modules/balls/balls_server.ts`.

Here, we can see what the server part of a module looks like. The server code
initializes the simulation in `willBeShownSoon` and advances it in `tick`.
Finally, it sends this state to the clients using the injected `state` object.

- Open `demo_modules/balls/balls_client.ts`.

This is the client part of the module. The client code defines the injected
`state` object should interpolate between the state data that's sent from the
server. The definition there tells the `state` object about the structure of the
data from the network.

It also contains the drawing code.

- Run balls on 2x2 screens.

Wonder at the magnificence.

- Exercise #4: Modify the simulation and the rendering of the balls to do
  something different and look different.

Change some colors! Change the shapes! What about different sizes (this is sorta
hard)? Try adding gravity (this is hard)! Make the balls bounce off each other
(this is really hard).

### Bonus: Peer to peer simulation

The wall also supports peer-to-peer connections. You can see this in the
`matrix` module. Here, the screens independently figure out if they are at the
top of the wall in a column, and if so, spawn a bunch of matrix "trails" that it
sends to the other screens in the column. Once sent, the screens accurately
simulate time from that point forward until they move off the bottom of the
wall, when they are then deleted.

This could be used to simulate more efficiently. At the moment, the server poops
out when trying to do something interesting to about 10000 objects, mostly due
to the serialization & deserialization time of the state over the network. You
might be able to use this to be able to simulate more things in the same time,
as each client could participate. Implementation of this is left as an exercise
to the reader.

## Your own module

Now, it's time for you to make your own module! Take a look at the various demo
modules to get started. Come up with some neat ideas and help each other out. If
you are out of ideas consider making a module with the theme of:

- an orrery.
- weather.
- rain.
- the various critical points of random triangles.
- chaotic pendulums.
- clocks.
- hacking code.
- the Windows pipe screensaver.
- traffic in a city.
- gardens.
- virtual life.
- lissajous.
- any AfterDark screensaver.

With your theme in mind, think about how you are going to draw it and simulate
it. In general, 2D drawing is way, way easier than 3D drawing. Maybe don't start
with 3D for your first module. Maybe you're feeling lucky. I don't know.

This about whether your module will simulate in the client (_parametrically_) or
on the server. If the latter, design your state and describe it so that the
`state` object can interpolate the data correctly.

With that all set, write your drawing code, so you can see what you are doing,
and then start working on your simulation. Remember that making anything is
better than making it perfect! Have fun with it, and don't worry about your art
not being "good enough".
