/*global -$ */
'use strict';
// generated on 2016-02-21 using generator-modern-frontend 0.1.2
var fs = require('fs');
var path = require('path');

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var browserSync = require('browser-sync');
var reload = browserSync.reload;

var through2 = require('through2');
var browserify = require('browserify');
var awspublish = require('gulp-awspublish');

gulp.task('stylesheet', ['sprites'], function () {
  return gulp.src('app/css/main.scss')
    .pipe($.sourcemaps.init())
    .pipe($.sass({
      outputStyle: 'nested', // libsass doesn't support expanded yet
      precision: 10,
      includePaths: ['.'],
      onError: console.error.bind(console, 'Sass error:')
    }))
    .pipe($.postcss([
      require('autoprefixer-core')({browsers: ['last 1 version']})
    ]))
    .pipe($.sourcemaps.write())
    .pipe(gulp.dest('.tmp/css'))
    .pipe(reload({stream: true}));
});

gulp.task('sprites', function() {
  var spritesPath = 'app/images/sprites';
  var identifiers = fs.readdirSync(spritesPath).filter(function(spritePath) {
    var stat = fs.statSync(spritesPath + '/' + spritePath);
    return stat.isDirectory();
  });

  for (var i = 0; i < identifiers.length; i++) {
    var spriteData = gulp.src(spritesPath + '/' + identifiers[i] + '/*.png').pipe($.spritesmith({
      imgName: 'sprite_' + identifiers[i] + '.png',
      cssName: identifiers[i] + '..scss',
      imgPath: '../images/sprite_' + identifiers[i] + '.png',
      cssFormat: 'sass'
    }));

    // Pipe image stream
    spriteData.img
      .pipe(gulp.dest('.tmp/images'))
      .pipe(gulp.dest('dist/images'))

    // Pipe CSS stream
    spriteData.css
      .pipe(gulp.dest('app/css/sprites'));
  }
});

gulp.task('javascript', function () {
  return gulp.src('app/js/main.js')
    .pipe(through2.obj(function (file, enc, next){ // workaround for https://github.com/babel/babelify/issues/46
      browserify(file.path)
      .transform('babelify')
      .bundle(function(err, res){
        if (err) { return next(err); }

        file.contents = res;
        next(null, file);
      });
    }))
    .on('error', function (error) {
      console.log(error.stack);
      this.emit('end');
    })
    .pipe($.sourcemaps.init())
    // .pipe($.uglify())
    .pipe($.sourcemaps.write('.'))
    .pipe(gulp.dest('.tmp/js'))
    .pipe(gulp.dest('dist/js'));
});

gulp.task('jshint', function () {
  return gulp.src('app/js/**/*.js')
    .pipe(reload({stream: true, once: true}))
    .pipe($.jshint())
    .pipe($.jshint.reporter('jshint-stylish'))
    .pipe($.if(!browserSync.active, $.jshint.reporter('fail')));
});

gulp.task('html', ['stylesheet'], function () {
  var assets = $.useref.assets({searchPath: ['.tmp', 'app', '.']});

  return gulp.src('app/*.html')
    .pipe(assets)
    .pipe($.if('**/*.js', $.uglify()))
    .pipe($.if('**/*.css', $.csso()))
    .pipe(assets.restore())
    .pipe($.useref())
    .pipe($.if('**/*.html', $.minifyHtml({conditionals: true, loose: true})))
    .pipe(gulp.dest('dist'));
});

gulp.task('images', function () {
  return gulp.src('app/images/**/*')
    .pipe($.cache($.imagemin({
      progressive: true,
      interlaced: true,
      // don't remove IDs from SVGs, they are often used
      // as hooks for embedding and styling
      svgoPlugins: [{cleanupIDs: false}]
    })))
    .pipe(gulp.dest('dist/images'));
});

gulp.task('fonts', function () {
  return gulp.src(require('main-bower-files')({
    filter: '**/*.{eot,svg,ttf,woff,woff2}'
  }).concat('app/fonts/**/*'))
    .pipe(gulp.dest('.tmp/fonts'))
    .pipe(gulp.dest('dist/fonts'));
});

gulp.task('extras', function () {
  return gulp.src([
    'app/*.*',
    '!app/*.html'
  ], {
    dot: true
  }).pipe(gulp.dest('dist'));
});

gulp.task('clean', require('del').bind(null, ['.tmp', 'dist']));

gulp.task('serve', ['stylesheet', 'javascript', 'fonts'], function () {
  browserSync({
    notify: false,
    port: 9000,
    server: {
      baseDir: ['.tmp', 'app'],
      routes: {
        '/bower_components': 'bower_components'
      }
    }
  });

  // watch for changes
  gulp.watch([
    'app/*.html',
    'app/js/**/*.js',
    'app/images/**/*',
    '.tmp/fonts/**/*'
  ]).on('change', reload);

  gulp.watch('app/css/**/*.scss', ['stylesheet']);
  gulp.watch('app/js/**/*.js', ['javascript']);
  gulp.watch('app/fonts/**/*', ['fonts']);
  gulp.watch('bower.json', ['wiredep', 'fonts']);
});

gulp.task('serve:dist', function () {
  browserSync({
    notify: false,
    port: 9000,
    server: {
      baseDir: ['dist']
    }
  });
});

// inject bower components
gulp.task('wiredep', function () {
  var wiredep = require('wiredep').stream;

  gulp.src('app/css/*.scss')
    .pipe(wiredep({
      ignorePath: /^(\.\.\/)+/
    }))
    .pipe(gulp.dest('app/css'));

  gulp.src('app/*.html')
    .pipe(wiredep({
      // exclude: ['bootstrap-sass-official'],
      ignorePath: /^(\.\.\/)*\.\./
    }))
    .pipe(gulp.dest('app'));
});

gulp.task('build', ['jshint', 'html', 'images', 'fonts', 'extras'], function () {
  return gulp.src('dist/**/*').pipe($.size({title: 'build', gzip: true}));
});

gulp.task('default', ['clean'], function () {
  gulp.start('build');
});

gulp.task('publish', function() {

  // create a new publisher using S3 options
  // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property
  var publisher = awspublish.create({
    params: {
      Bucket: 'datavegetables.club'
    }
  });

  // define custom headers
  var headers = {
    'Cache-Control': 'max-age=315360000, no-transform, public'
    // ...
  };

  return gulp.src('./dist/**/*')
     // gzip, Set Content-Encoding headers and add .gz extension
    //.pipe(awspublish.gzip({ ext: '.gz' }))

    // publisher will add Content-Length, Content-Type and headers specified above
    // If not specified it will set x-amz-acl to public-read by default
    .pipe(publisher.publish(headers))

    // create a cache file to speed up consecutive uploads
    //.pipe(publisher.cache())

     // print upload updates to console
    .pipe(awspublish.reporter());
});
