module.exports = function( grunt )
{
	grunt.initConfig( eval( grunt.file.read( 'config.js' ) ) );

	grunt.loadNpmTasks( 'grunt-contrib-concat' );
	grunt.loadNpmTasks( 'grunt-contrib-jshint' );

	grunt.registerTask( 'default', [ 'concat', 'jshint' ] );
};