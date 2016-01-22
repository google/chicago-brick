Chicago Brick is the Google Chicago Video Wall Software.

Hi! Here are some quick notes on getting started with this software:

To use this software, first check you have a recent node:
    $ node --version
It should be at least 4.1.

Next, install the external deps that aren't in the repo:
    $ cd $PATH_TO_REPO/js
    $ npm install

Then, to run the server in 1x1 mode:
    $ ./bin/run_1x1.sh

And open a Chrome window to http://localhost:3000/?config=0,0,1920,1080

Or, to run the server in 2x2 mode:
    $ ./bin/run_2x2.sh

And open the client windows like so:
    $ ./start_clients.sh

Hopefully, this gets you developing!
 - Chicago Brick Team.
