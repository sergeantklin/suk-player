var gulp = require('gulp');
var uglify = require('gulp-uglify');
var concat = require('gulp-concat');
 
gulp.task('default', function() {
	var stream = gulp.src('./js/*.js')
		.pipe(uglify())
		.pipe(concat('suk_player.min.js'))
		.pipe(gulp.dest('./'));
	return stream;
});
