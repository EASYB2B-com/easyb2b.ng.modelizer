// Load gulp configuration
var config = require('./gulp.config.js');

// Load gulp plugins
var gulp = require('gulp');
var del = require('del');
var args = require('yargs').argv;
var fs = require('fs');
var runSequence = require('run-sequence');

// Load plugins
var $ = require('gulp-load-plugins')();

var pkg = require('./package.json');

var banner = ['/**',
              ' * <%= pkg.name %>',
              ' * @link <%= pkg.homepage %>',
              ' * @version v<%= pkg.version %>',
              ' * @license <%= pkg.license %>',
              ' */',
              ''].join('\n');


gulp.task('clean', function() {
  return del([config.build]);
});

// Task to watch for changes in source file
gulp.task('watch', function() {
  gulp.watch(config.src, ['build']);
});

gulp.task('concat', ['clean'], function() {
  return gulp
    .src(config.src)
    .pipe($.plumber())
    .pipe($.jshint('.jshintrc'))
    .pipe($.jshint.reporter('default'))
    .pipe($.concat('easyb2b-ng-modelizer.js'))
    .pipe($.iife({useStrict: true}))
    .pipe($.jsbeautifier({indent_size: 2, indent_char: ' '}))
    .pipe($.header(banner, {pkg: pkg}))
    .pipe(gulp.dest(config.build));
});

gulp.task('script', ['concat'], function() {
  return gulp
    .src([config.build + '/*.js'])
    .pipe($.plumber())
    .pipe($.uglify({preserveComments: 'license'}))
    .pipe($.rename({suffix: '.min'}))
    .pipe(gulp.dest(config.build));
});


// Increment version number
// @http://stackoverflow.com/questions/36339694/how-to-increment-version-number-via-gulp-task
gulp.task('bump', function () {
  /// <summary>
  /// It bumps revisions
  /// Usage:
  /// 1. gulp bump : bumps the package.json and bower.json to the next minor revision.
  ///   i.e. from 0.1.1 to 0.1.2
  /// 2. gulp bump --version 1.1.1 : bumps/sets the package.json and bower.json to the
  ///    specified revision.
  /// 3. gulp bump --type major       : bumps 1.0.0
  ///    gulp bump --type minor       : bumps 0.1.0
  ///    gulp bump --type patch       : bumps 0.0.2
  ///    gulp bump --type prerelease  : bumps 0.0.1-2
  /// </summary>

  var msg;
  var type = args.type;
  var version = args.version;
  var options = {};

  if (version) {
    options.version = version;
    msg += ' to ' + version;
  } else {
    options.type = type;
    msg += ' for a ' + type;
  }

  return gulp
    .src(['./package.json', './bower.json'])
    .pipe($.bump(options))
    .on('error', $.util.log)
    .pipe(gulp.dest('./'));
});

// Create commit
gulp.task('commit', function () {
  return gulp.src('.')
    .pipe($.git.add())
    .pipe($.git.commit('[Prerelease] Bumped version number'));
});


// Push changes to remote repo
gulp.task('push', function (cb) {
  $.git.push('origin', 'master', cb);
});


// Create git tag
gulp.task('tag', function(cb) {
  var version = 'v' + getPackageJsonVersion();

  $.git.tag(version, 'Created Tag for version: ' + version, function (error) {
    if (error) {
      return cb(error);
    }
    $.git.push('origin', 'master', {args: '--tags'}, cb);
  });

  function getPackageJsonVersion () {
    // We parse the json file instead of using require because require caches
    // multiple calls so the version number won't be updated
    return JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  };
});

// Release
gulp.task('release', function(callback) {
  runSequence('bump', 'build', 'commit', 'push', 'tag', function(error) {
    if(error) {
      console.log(error.message)
    } else {
      console.log('Release finished successfully');
    }
    callback(error);
  });
});

gulp.task('build', ['clean', 'script']);
