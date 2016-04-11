var gulp = require('gulp');
var _ = require('lodash');
var browserify = require('browserify');
var babelify = require('babelify');
var source = require("vinyl-source-stream");
var uglify = require('gulp-uglify');
var sass = require('gulp-sass');
var reactify = require('reactify');
var watchify = require('watchify');
var util = require('gulp-util');
var sourcemaps = require('gulp-sourcemaps');
var gif = require('gulp-if');
var buffer = require('vinyl-buffer');

var config = {
    // Common options - changed by tasks in some cases.
    options: {
        // Build with debug info.
        debug: false,
        // Build "live"
        watch: false,
        // Uglify the code
        uglify: false
    },
    distPath: '../build/editor-server/assets',
    browserify: {
        bundle: {
            entries: 'app/js/app.js',
            bundleName: 'chicago-brick-live-editor.js',
        }
    },
    uglify: {
        settings: function(debug) {
            return {
                compress: {
                    drop_debugger: !debug,
                    drop_console: !debug
                },
                beautify: {},
                mangle: !debug,
            };
        }
    },
    sass: {
        files: 'app/scss/**/*.scss'
    },
};

// Build with source maps and watch for changes.
gulp.task('debug', ['sass'], function() {
    config.options.debug = true;
    config.options.watch  = true;
    config.options.uglify = false;

    gulp.watch(config.sass.files, ['sass']);
    buildBundle(config.browserify.bundle);
});

// Build uglified, no source maps, and just do it once.
gulp.task('release', ['sass'], function() {
    config.options.debug = false;
    config.options.watch  = false;
    config.options.uglify = true;

    return buildBundle(config.browserify.bundle);
});


// Individual Tasks
gulp.task('bundle', function() {
    buildBundle(config.browserify.bundle);
});

// build sass files.
gulp.task('sass', function () {
    gulp.src(config.sass.files)
        .pipe(sass().on('error', sass.logError))
        .pipe(gulp.dest(config.distPath + '/css'));
});

var buildBundle = function(bundelCfg) {
    var debug = config.options.debug;

    var bundleConfig = _.extend(bundelCfg, { debug: debug, cache: {}, packageCache: {}, fullPaths: true });

    var b = browserify(bundleConfig)
            .transform(babelify,
              {
                plugins: ['transform-object-rest-spread'],
                presets: ['es2015', 'react']
              });

    var makeBundle = function () {
        util.log('Building ' + util.colors.green(bundleConfig.bundleName));
        var stream = b.bundle()
                      .on('error', function(err) { util.log(util.colors.red('Error'), err.message); })
                      .pipe(source(bundleConfig.bundleName))
                      .pipe(buffer())
                      .pipe(gif(debug, sourcemaps.init({loadMaps: true})))
                      .pipe(gif(config.options.uglify, uglify(config.uglify.settings(debug))))
                      .pipe(gif(debug, sourcemaps.write('./')))
                      .pipe(gulp.dest(config.distPath + '/js'));
        stream.on('end', function() { util.log(util.colors.magenta('bundle complete.')); });
        return stream;
    };

    if (config.options.watch) {
        var w = watchify(b);

        w.on('update', function(ids) {
            util.log("Updating changes in: " + ids);
            makeBundle();
        }).on('log', util.log);
    }

    return makeBundle();
};
