# Chicago Brick: the Google Chicago Video Wall Software

## Quick Start
To use this software, first download and install [node](http://www.nodejs.org).
Then, check you have a recent node:
```
$ node --version
```
The wall uses all the new JS shiny, so node should be at least 8.

Clone the repo to your machine:
```
git clone https://github.com/google/chicago-brick.git
```

Next, install the external npm deps that aren't in the repo:
```
path/to/your/chicago-brick$ npm install
```

Then, to run the server in 1x1 mode with stars module:
```
chicago-brick$ ./bin/run_1x1.sh -m stars
```

And open a Chrome window to http://localhost:3000/?config=0,0,1920,1080.
You should be able to see many stars zooming towards you.
If you don't see that, try running the `npm install` command again.

Or, to run the server in 2x2 mode with stars module:
```
chicago-brick$ ./bin/run_2x2.sh -m stars
```

And open the client windows like so:
```
chicago-brick$ ./bin/start_2x2_clients.sh
```
You should be able to see the same thing with four browser windows instead.

You can play with different modules by substituting the `stars` argument
with other names in `chicago-brick/config/demo-playlist.json`.

## Modules

A chicago brick module is a directory with a brick.json file.  This file
provides the module's configuration.  See examples in demo_modules. Any
directory (or glob) that should be included should be passed in using the
--module_dir flag.

### Modules as deps

A module can be included by installing its package as a dependency. By default
brick will load any modules found in node_modules subdirectories.

## API Doc

You can view some API Docs at http://google.github.io/chicago-brick/api.html.

***
Hopefully, this gets you developing!

 – Chicago Brick Team
