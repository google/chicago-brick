# Chicago Brick Live
Chicago Brick Live enables realtime creation of content for [Chicago Brick](http://github.com/google/chicago-brick).

## How does it work?

## Quick Start
To use Chicago Brick Live first setup Chicago Brick as described [here](https://github.com/google/chicago-brick).  Next, install required dependencies
```
chicago-brick/extras/chicago-brick-live$ npm install
```
Build Chicago Brick Live
```
chicago-brick/extras/chicago-brick-live$ npm run build
```
Run the code-server (starts on ``http://localhost:3001``)
```
chicago-brick/extras/chicago-brick-live$ npm run code-server
```
Run the editor-server (starts on ``http://localhost:3500``)
```
chicago-brick/extras/chicago-brick-live$ npm run editor-server
```
Run Chicago Brick with the *chicago-brick-live* module
```
chicago-brick$ ./bin/run_2x2.sh -m chicago-brick-live
```

## Testing
You can run all available tests
```
chicago-brick/extras/chicago-brick-live$ npm run test
```
