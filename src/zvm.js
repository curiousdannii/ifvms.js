/*

ZVM - the ifvms.js Z-Machine (versions 3, 5 and 8)
==================================================

Copyright (c) 2016 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

/*

This file is the public API of ZVM, which is based on the API of Quixe:
https://github.com/erkyrath/quixe/wiki/Quixe-Without-GlkOte#quixes-api

ZVM willfully ignores the standard in these ways:
	Non-buffered output is not supported
	Saving tables is not supported (yet?)
	No interpreter number or version is set

Any other non-standard behaviour should be considered a bug

*/

'use strict';

var utils = require( './common/utils.js' ),
file = require( './common/file.js' ),
MemoryView = utils.MemoryView,

api = {

	init: function()
	{
		// Create this here so that it won't be cleared on restart
		this.jit = {};
		
		// The Quixe API expects the start function to be named init
		this.init = this.start;
	},

	prepare: function( storydata, options )
	{
		// If we are not given a glk option then we cannot continue
		if ( !options.Glk )
		{
			throw new Error( 'A reference to Glk is required' );
		}
		this.Glk = options.Glk;
		this.data = storydata;
		this.env = options;
	},

	start: function()
	{
		var Glk = this.Glk,
		data;
		try
		{
			// Identify the format and version number of the data file we were given
			data = file.identify( this.data );
			delete this.data;
			if ( !data || data.format !== 'ZCOD' )
			{
				throw new Error( 'This is not a Z-Code file' );
			}
			if ( data.version !== 3 && data.version !== 5 && data.version !== 8 )
			{
				throw new Error( 'Unsupported Z-Machine version: ' + data.version );
			}
			
			// Load the storyfile we are given into our MemoryView (an enhanced DataView)
			this.m = MemoryView( data.data );
			
			// Make a seperate MemoryView for the ram, and store the original ram
			this.staticmem = this.m.getUint16( 0x0E );
			this.ram = MemoryView( this.m.buffer, 0, this.staticmem );
			this.origram = this.m.getUint8Array( 0, this.staticmem );
			
			// Initiate the engine, run, and wait for our first Glk event
			this.restart();
			this.glk_block_call = null;
			this.run();
			if ( !this.quit )
			{
				this.glk_event = new Glk.RefStruct();
				if (!this.glk_block_call) {
					Glk.glk_select( this.glk_event );
				}
				else {
					this.glk_event.push_field(this.glk_block_call);
				}
				Glk.update();
			}
		}
		catch ( e )
		{
			if ( e instanceof Error )
			{
				e.message = 'ZVM start: ' + e.message;
			}
			Glk.fatal_error( e );
			throw e;
		}
	},

	resume: function(resumearg)
	{
		var Glk = this.Glk,
		glk_event = this.glk_event,
		event_type,
		run;
		
		try
		{
			event_type = glk_event.get_field( 0 );
			
			// Process the event
			if ( event_type === 2 )
			{
				this.handle_char_input( glk_event.get_field( 2 ) );
				run = 1;
			}
			if ( event_type === 3 )
			{
				this.handle_line_input( glk_event.get_field( 2 ), glk_event.get_field( 3 ) );
				run = 1;
			}
			// Arrange events
			if ( event_type === 5 )
			{
				this.update_width();
			}
			// glk_fileref_create_by_prompt handler
			if ( event_type === 'fileref_create_by_prompt' )
			{
				this.handle_create_fileref( resumearg );
				run = 1;
			}
			
			this.glk_block_call = null;
			if ( run )
			{
				this.run();
			}
			
			// Wait for another event
			if ( !this.quit )
			{
				this.glk_event = new Glk.RefStruct();
				if (!this.glk_block_call) {
					Glk.glk_select( this.glk_event );
				}
				else {
					this.glk_event.push_field(this.glk_block_call);
				}
				Glk.update();
			}
		}
		catch ( e )
		{
			if ( e instanceof Error )
			{
				e.message = 'ZVM: ' + e.message;
			}
			Glk.fatal_error( e );
			throw e;
		}
	},
	
	// Return a game signature from the header
	get_signature: function()
	{
		var result = [],
		i = 0;
		while ( i < 0x1E )
		{
			result.push( ( this.origram[i] < 0x10 ? '0' : '' ) + this.origram[i++].toString( 16 ) );
		}
		return result.join( '' );
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
			this.log( 'Caching a JIT function in dynamic memory: ' + context.pc );
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
