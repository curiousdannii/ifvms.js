/*

ZVM - the ifvms.js Z-Machine (versions 3, 5 and 8)
=================================================

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
		var Glk = this.glk;
		try
		{
			// Initiate the engine, run, and wait for our first Glk event
			this.restart();
			this.run();
			this.glk_event = new Glk.RefStruct();
			Glk.glk_select( this.glk_event );
			Glk.update();
		}
		catch ( e )
		{
			Glk.fatal_error( 'ZVM start: ' + e );
			throw e;
		}
	},

	resume: function()
	{
		var Glk = this.glk,
		glk_event = this.glk_event,
		event_type;
		
		try
		{
			event_type = glk_event.get_field( 0 );
			
			// Process the event
			if ( event_type === 2 )
			{
				this.handle_char_input( glk_event.get_field( 2 ) );
				this.run();
			}
			if ( event_type === 3 )
			{
				this.handle_line_input( glk_event.get_field( 2 ), glk_event.get_field( 3 ) );
				this.run();
			}
			
			// Wait for another event
			this.glk_event = new Glk.RefStruct();
			Glk.glk_select( this.glk_event );
			Glk.update();
		}
		catch ( e )
		{
			Glk.fatal_error( 'ZVM: ' + e );
			throw e;
		}
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
	},

	// Compile a JIT routine
	compile: function()
	{
		var context = this.disassemble();
		
		// Compile the routine with new Function()
		this.jit[context.pc] = new Function( 'e', '' + context );

		if ( context.pc < this.staticmem )
		{
			this.warn( 'Caching a JIT function in dynamic memory: ' + context.pc );
		}
	},

},

VM = utils.Class.subClass( utils.extend(
	api,
	require( './zvm/runtime.js' ),
	require( './zvm/text.js' ),
	require( './zvm/io.js' ),
	require( './zvm/disassembler.js' )
) );

module.exports = VM;