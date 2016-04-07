# Chicago Brick Live
Chicago Brick Live enables realtime creation of content for [Chicago Brick](http://github.com/google/chicago-brick).

## How does it work?
**Chicago Brick Live** has three parts:
- The **code editor** that allows code running on any screen to be edited in a web browser.
- The **chicago-brick-live** module for Chicago Brick that runs the code created in the code editor on the screens served by Chicago Brick.  This is included as a demo module so you already have it!
- The **code server** extra that serves code to run on the screens to the chicago-brick-live module and the code editor.

The **code editor** and **code server** are both part of the the Chicago Brick Live extra.  See the Quick Start for details on how to run them.

## Quick Start
To use Chicago Brick Live first setup Chicago Brick as described [here](https://github.com/google/chicago-brick).  Next, install required dependencies
```
chicago-brick/extras/chicago-brick-live$ npm install
```
Run the code-server (starts on ``http://localhost:3001``)
```
chicago-brick/extras/chicago-brick-live$ npm run code-server
```
Run the editor-server (starts on ``http://localhost:3500``)
```
chicago-brick/extras/chicago-brick-live$ npm run editor-server
```
Run Chicago Brick with the *chicago-brick-live* module.  For example:
```
chicago-brick$ ./bin/run_2x2.sh -m chicago-brick-live
```

## Testing
Run all available tests:
```
chicago-brick/extras/chicago-brick-live$ npm run test
```
