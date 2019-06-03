// Karma configuration
// Generated on Thu May 30 2019 21:58:18 GMT-0500 (Central Daylight Time)

module.exports = function(config) {
  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '.',


    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['mocha'],


    // list of files / patterns to load in the browser
    files: [
      {pattern: 'lib/**/*_test.js', type: 'module'},
      {pattern: 'client/**/*_test.js', type: 'module'},
      {pattern: 'server/**/*_test.js', type: 'module'},
      {pattern: 'lib/**/*.js', type: 'module', included: false},
      {pattern: 'client/**/*.js', type: 'module', included: false},
      {pattern: 'server/**/*.js', type: 'module', included: false},
      {pattern: 'node_modules/chai/chai.js'},
      {pattern: 'node_modules/sinon/pkg/sinon.js'},
      {pattern: 'node_modules/sinon-chai/lib/sinon-chai.js'},
      {pattern: 'node_modules/debug/dist/debug.js'},
      {pattern: 'node_modules/clock-skew/lib/clock_skew.js', type: 'module', included: false},
    ],

    proxies: {
      '/lib/': '/base/lib/',
      '/client/': '/base/client/',
      '/server/': '/base/server/',
      '/sys/': '/base/node_modules/',
    },

    // list of files / patterns to exclude
    exclude: [
    ],


    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
    },


    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['progress'],


    // web server port
    port: 9876,


    // enable / disable colors in the output (reporters and logs)
    colors: true,


    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,


    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,


    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['Chrome'],


    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,

    // Concurrency level
    // how many browser should be started simultaneous
    concurrency: Infinity
  });
};
