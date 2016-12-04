var gulp = require('gulp');
var uglify = require('gulp-uglify');
var concat = require('gulp-concat');
 
gulp.task('default', ['classic','classic'],function() {

});
 
gulp.task('classic', function() {
	var stream = gulp.src('./js-classic/*.js')
		.pipe(uglify())
		.pipe(concat('suk_player_classic.min.js'))
		.pipe(gulp.dest('./'));
	return stream;
}); 
gulp.task('classic', function() {
	var stream = gulp.src('./js/*.js')
		.pipe(uglify())
		.pipe(concat('suk_player.min.js'))
		.pipe(gulp.dest('./'));
	return stream;
});