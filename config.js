({
	concat: {
		options: {
			process: true,
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
				'src/zvm/outro.js',
			],
		},
	},
	
	jshint: {
		options: {
			// Enforcing options
			curly: true, // Require brackets for all blocks
			latedef: true, // require all vars to be defined before being used
			newcap: true, // require classes to begin with a capital
			strict: true, // ES5 strict mode
			undef: true, // all vars must be defined
			unused: true, // warn for unused vars
			
			// Relaxing options
			"-W041": false, // Use '===' to compare with '0'
			"-W064": false, // Don't warn about missing new with ByteArray
			"-W065": false, // Missing radix parameter in parseInt
			boss: true, // Allow assignments in if, return etc
			evil: true, // eval() :)
			funcscope: true, // don't complain about using variables defined inside if statements
			
			// Environment
			browser: true,
			nonstandard: true,
			predef: [ 'IFF', 'parchment', 'vm_functions' ],
		},
		all: [ 'dist/*.js' ],
	}
})