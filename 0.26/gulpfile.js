var gulp = require('gulp')
var concat = require('gulp-concat')
var uglify = require('gulp-uglify')

gulp.task('default', function () {
  return gulp.src(['js/**/*.js'])
	.pipe(concat('SUK_player.min.js'))
	.pipe(uglify())
	.pipe(gulp.dest('./'));
});