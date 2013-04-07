module.exports = function( grunt )
{
	"use strict";
	
	/* jshint -W070 */ // Allow trailing commas only in the Gruntfile
	
	grunt.initConfig({
		concat: {
			options: {
				process: true,
			},
			zvm: {
				dest: 'dist/zvm.js',
				src: [
					'src/zvm/header.txt',
					'src/zvm/intro.js',
					'src/common/class.js',
					'src/common/iff.js',
					'src/common/util.js',
					'src/common/bytearray.js',
					'src/common/ast.js',
					'src/zvm/quetzal.js',
					'src/zvm/text.js',
					'src/zvm/ui.js',
					'src/zvm/opcodes.js',
					'src/common/idioms.js',
					'src/zvm/disassembler.js',
					'src/zvm/runtime.js',
					'src/zvm/vm.js',
					'src/zvm/outro.js',
				],
			},
		},
		
		jshint: {
			options: {
				// Enforcing options
				curly: true, // Require brackets for all blocks
				eqeqeq: true, // Require === and !==
				latedef: true, // require all vars to be defined before being used
				newcap: true, // require classes to begin with a capital
				strict: true, // ES5 strict mode
				undef: true, // all vars must be defined
				unused: true, // warn for unused vars
				
				// Relaxing options
				"-W064": false, // Don't warn about missing new with ByteArray
				boss: true, // Allow assignments in if, return etc
				evil: true, // eval() :)
				funcscope: true, // don't complain about using variables defined inside if statements
				
				// Environment
				browser: true,
				nonstandard: true,
				predef: [
					'DEBUG',
					'exports',
					'GVM',
					'IFF',
					'module',
					'parchment',
					'require',
					'vm_functions',
					'ZVM',
				],
			},
			all: [
				'Gruntfile.js',
				'dist/*.js'
			],
		},
		
		watch: {
			src: {
				files: '<%= concat.zvm.src %>',
				tasks: [ 'buildntest' ],
			},
		},
	});

	grunt.loadNpmTasks( 'grunt-contrib-concat' );
	grunt.loadNpmTasks( 'grunt-contrib-jshint' );
	grunt.loadNpmTasks( 'grunt-contrib-watch' );
	grunt.loadNpmTasks( 'grunt-update-submodules' );
	
	// Run the Praxix test suite
	grunt.registerTask( 'testzvm', function()
	{
		grunt.log.write( 'Running the Praxix test suite: ' );
		var bootstrap = require( './dist/bootstrap.js' );
		var vm = bootstrap.zvm( './tests/tests/praxix.z5', ['all'] );
		var result = vm.log;
		if ( /All tests passed./.test( result ) )
		{
			grunt.log.write( 'All tests passed!\n' );
		}
		else
		{
			grunt.log.write( /\d+ tests failed overall:[^$]+/.exec( result )[0] );
		}
	});

	grunt.registerTask( 'buildntest', [ 'concat', 'jshint', 'testzvm' ] );
	
	grunt.registerTask( 'default', [ 'update_submodules', 'buildntest' ] );
	
	grunt.registerTask( 'dev', [ 'watch' ] );
};