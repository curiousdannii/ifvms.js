module.exports = function( grunt )
{
	grunt.initConfig({
		concat: {
			options: {
				process: true
			},
			zvm: {
				dest: 'dist/zvm.js',
				src: [
					'src/zvm/header.txt',
					'src/zvm/intro.js',
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
					'src/zvm/outro.js'
				]
			}
		},
		
		jshint: {
			options: {
				"-W032": false, // Unncessary semicolons
				"-W041": false, // Use '===' to compare with '0'
				"evil": true // eval() :)
			},
			all: ['Gruntfile.js', 'dist/*.js']
		}
	});

	grunt.loadNpmTasks( 'grunt-contrib-concat' );
	grunt.loadNpmTasks( 'grunt-contrib-jshint' );

	grunt.registerTask( 'default', ['concat', 'jshint'] );
};