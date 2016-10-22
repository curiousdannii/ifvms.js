/*

ZVM - the ifvms.js Z-Machine (versions 3, 5 and 8)
===============================================

Copyright (c) 2016 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

/*

This file is the public API of ZVM, which is based on the API of Quixe:
https://github.com/erkyrath/quixe/wiki/Quixe-Without-GlkOte#quixes-api

ZVM willfully ignores the standard in these ways:
	Non-buffered output is not supported
	Output streams 2 and 4 and input stream 1 are not supported
	Saving tables is not supported (yet?)
	No interpreter number or version is set

Any other non-standard behaviour should be considered a bug

*/

var utils = require( './common/utils.js' ),
Class = utils.Class,
extend = utils.extend,

api = {

	init: function()
	{
		// Create this here so that it won't be cleared on restart
		this.jit = {};
		this.env = {
			width: 80, // Default width of 80 characters
		};
		
		// The Quixe API expects the start function to be named init
		this.init = this.start;
	},

	prepare: function( storydata, options )
	{
		// If we are not given a glk option then we cannot continue
		if ( !options.glk )
		{
			throw new Error( 'a reference to Glk is required' );
		}
		this.glk = options.glk;
		
		// Convert the storyfile we are given to a Uint8Array
		this.data = new Uint8Array( storydata );
		
		// TODO: check that we are given a valid storyfile
	},

	start: function()
	{
		try {
			this.restart();
			this.run();
		}
		catch ( e )
		{
			this.glk.fatal_error("ZVM start: " + e );
			throw e;
		}
	},

	resume: function()
	{
		try {
			this.run();
		}
		catch ( e )
		{
			this.glk.fatal_error("ZVM: " + e );
			throw e;
		}
	},

	// An input event, or some other event from the runner
	inputEvent: function( data )
	{
		var memory = this.m,
		code = data.code;

		// Update environment variables
		if ( data.env )
		{
			extend( this.env, data.env );

			/*if ( this.env.debug )
			{
				if ( data.env.debug )
				{
					get_debug_flags( data.env.debug );
				}
			}*/

			// Also need to update the header

			// Stop if there's no code - we're being sent live updates
			if ( !code )
			{
				return;
			}
		}

		// Load the story file
		if ( code === 'load' )
		{
			// Convert the data we are given to a Uint8Array
			this.data = new Uint8Array( data.data );
			return;
		}

		// Clear the list of orders
		this.orders = [];

		if ( code === 'restart' )
		{
			this.restart();
		}

		if ( code === 'save' )
		{
			// Set the result variable, assume success
			this.save_restore_result( data.result || 1 );
		}

		if ( code === 'restore' )
		{
			// Restart the VM if we never have before
			if ( !this.m )
			{
				this.restart();
			}

			// Successful restore
			if ( data.data )
			{
				this.restore_file( data.data );
			}
			// Failed restore
			else
			{
				this.save_restore_result( 0 );
			}
		}

		// Handle line input
		if ( code === 'read' )
		{
			this.handle_input( data );
		}

		// Handle character input
		if ( code === 'char' )
		{
			this.variable( this.read_data.storer, this.keyinput( data.response ) );
		}

		// Write the status window's cursor position
		if ( code === 'get_cursor' )
		{
			memory.setUint16( data.addr, data.pos[0] + 1 );
			memory.setUint16( data.addr + 2, data.pos[1] + 1 );
		}

		// Resume normal operation
		this.run();
	},

	// Run
	run: function()
	{
		var pc,
		result;

		// Stop when ordered to
		this.stop = 0;
		while ( !this.stop )
		{
			pc = this.pc;
			if ( !this.jit[pc] )
			{
				this.compile();
			}
			result = this.jit[pc]( this );

			// Return from a VM func if the JIT function returned a result
			if ( !isNaN( result ) )
			{
				this.ret( result );
			}
		}
		this.glk.update();
	},

	// Compile a JIT routine
	compile: function()
	{
		var context = this.disassemble(), code, func;

		// Compile the routine with new Function()
		if ( this.env.debug )
		{
			code = '' + context;
			/*if ( !debugflags.nooptimise )
			{
				code = optimise( code );
			}
			if ( debugflags.jit )
			{
				console.log( code );
			}*/
			// We use eval because Firebug can't profile new Function
			// The 0, is to make IE8 work. h/t Secrets of the Javascript Ninja
			func = eval( '(0,function JIT_' + context.pc + '(e){' + code + '})' );

			// Extra stuff for debugging
			func.context = context;
			func.code = code;
			if ( context.name )
			{
				func.name = context.name;
			}
			this.jit[context.pc] = func;
		}
		else // DEBUG
		{
			// TODO: optimise
			//this.jit[context.pc] = new Function( 'e', optimise( '' + context ) );
			this.jit[context.pc] = new Function( 'e', '' + context );
		}
		if ( context.pc < this.staticmem )
		{
			this.warn( 'Caching a JIT function in dynamic memory: ' + context.pc );
		}
	},

	// Return control to the ZVM runner to perform some action
	act: function( code, options )
	{
		options = options || {};

		// Handle numerical codes from jit-code - these codes are opcode numbers
		if ( code === 183 )
		{
			code = 'restart';
		}
		if ( code === 186 )
		{
			code = 'quit';
		}

		options.code = code;
		this.orders.push( options );
		this.stop = 1;
		if ( this.outputEvent )
		{
			this.outputEvent( this.orders );
		}
	},

},

VM = Class.subClass( extend(
	api,
	require( './zvm/runtime.js' ),
	require( './zvm/text.js' ),
	require( './zvm/io.js' ),
	require( './zvm/disassembler.js' )
) );

module.exports = VM;
