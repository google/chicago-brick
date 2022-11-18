# Chicago Brick: the Google Chicago Video Wall Software

## Quick Start

To use this software, first download and install [deno](http://deno.land).

Next, clone the repo to your machine:

```bash
$ git clone https://github.com/google/chicago-brick.git
```

Then, to run the server in 1x1 mode with the gears module:

```
chicago-brick$ ./bin/run_1x1.sh -m gears
```

This should open a Chrome window to http://localhost:3000/?config=0,0,1920,1080.
You should be able to see some gears rotating. If you don't see that, try
running the `npm install` command again.

Or, to run the server in 2x2 mode with the gears module:

```
chicago-brick$ ./bin/run_2x2.sh -m gears
```

And open the client windows like so:

```
chicago-brick$ ./bin/start_2x2_clients.sh
```

You should be able to see the same thing with four browser windows instead.

You can play with different modules by substituting the `gears` argument with
other names from `chicago-brick/config/demo-playlist.json` or from the various
`brick.json` files within the `demo_modules` folder.

## Geometry

The wall server needs to know the shape of the screens that make up the wall. At
the moment, this shape must be a single polygon, though it can be concave. By
default, the wall assumes that it's going to display on a 1920x1080 screen. To
change this, you can use the `--use_geometry` flag to specify the shape in a
turtle-like langauge. You can also specify the points in a JSON-formatted file
and use the `--geometry_file` flag to pass the path to the file.

## Modules

A chicago brick module is responsible for showing control across the wall.
Modules are stored in a directory and contain a `brick.json` file with metadata
about the module. The directory also contains the client and server parts to the
module, which are executed on the clients or server respectively. These parts
can be written in TypeScript or JavaScript, though TypeScript is strongly
preferred. See examples in demo_modules.

The server learns about modules that can be shown via the `--module_dir` flag,
which is scanned for any `brick.json` files. Playlists are only allowed to
reference modules that the wall knows about.

## Playlist

A playlist defines the order in which the wall should play modules. The playlist
consists of layouts, each of which refers to either a specific list of modules
or a pre-defined collection of modules. The layout will randomly select among
its set of modules and play each for the specified module duration. After the
layout duration expires, the next layout is shown. For example:

```json
{
  "playlist": [
    {
      "modules": ["gears", "slither"],
      "duration": 600,
      "moduleDuration": 60
    },
    {
      "modules": ["matrix"],
      "duration": 600,
      "moduleDuration": 600
    }
  ]
}
```

## Contributing

We welcome contributions of new modules and of improvements to the wall software
itself! See the CONTRIBUTING file for some stuff you need to complete before you
contribute.

Hopefully, this gets you developing!

– Chicago Brick Team
