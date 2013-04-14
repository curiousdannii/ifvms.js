/*

The Z-Machine VM for versions 5 and 8
=====================================

Copyright (c) 2013 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

/*

This file represents the public API of the ZVM class, while runtime.js contains most other class functions
	
TODO:
	Is 'use strict' needed for JIT functions too, or do they inherit that status?
	Specifically handle saving?
	Try harder to find default colours
	
*/

// See runtime.js for the first half!
	
	init: function()
	{
		// Create this here so that it won't be cleared on restart
		this.jit = {};
		this.env = {
			width: 80 // Default width of 80 characters
		};
		
		// Optimise our own functions
		if ( DEBUG )
		{
			// Skip if we must
			if ( !debugflags.nooptimise )
			{
				optimise_obj( this, ['find_prop'] );
			}
		}
		else
		{
			optimise_obj( this, ['find_prop'] );
		}
	},
	
	// An input event, or some other event from the runner
	inputEvent: function( data )
	{
		var memory = this.m,
		code = data.code,
		response;
		
		// Update environment variables
		if ( data.env )
		{
			extend( this.env, data.env );
			
			if ( DEBUG )
			{
				if ( data.env.debug )
				{
					get_debug_flags( data.env.debug ); 
				}
			}
			
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
			this.data = data.data;
			return;
		}
		
		if ( code === 'restart' )
		{
			this.restart();
		}
		
		if ( code === 'save' )
		{
			// Set the result variable, assume success
			this.variable( data.storer, data.result || 1 );
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
				this.restore( data.data );
			}
			// Failed restore
			else
			{
				this.variable( data.storer, 0 );
			}
		}
		
		// Handle line input
		if ( code === 'read' )
		{
			// Store the terminating character, or 13 if not provided
			this.variable( data.storer, isNaN( data.terminator ) ? 13 : data.terminator );
			
			// Echo the response (7.1.1.1)
			response = data.response;
			this._print( response + '\n' );
			
			// Convert the response to lower case and then to ZSCII
			response = this.text.text_to_zscii( response.toLowerCase() );
			
			// Check if the response is too long, and then set its length
			if ( response.length > data.len )
			{
				response = response.slice( 0, data.len );
			}
			memory.setUint8( data.buffer + 1, response.length );
			
			// Store the response in the buffer
			memory.setBuffer( data.buffer + 2, response );
			
			if ( data.parse )
			{
				// Tokenise the response
				this.text.tokenise( data.buffer, data.parse );
			}
		}
		
		// Handle character input
		if ( code === 'char' )
		{
			this.variable( data.storer, this.text.keyinput( data.response ) );
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
		var now = new Date(),
		pc,
		result,
		count = 0;
		
		// Clear the list of orders
		this.orders = [];
		
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
			
			// Or if more than five seconds has passed, however only check every 50k times
			// What's the best time for this?
			if ( ++count % 50000 === 0 && ( (new Date()) - now ) > 5000 )
			{
				this.act( 'tick' );
				return;
			}
		}
	},
	
	// Compile a JIT routine
	compile: function()
	{
		var context = disassemble( this );
		
		// Compile the routine with new Function()
		if ( DEBUG )
		{
			var code = '' + context;
			if ( !debugflags.nooptimise )
			{
				code = optimise( code );
			}
			if ( debugflags.jit )
			{
				console.log( code );
			}
			// We use eval because Firebug can't profile new Function
			// The 0, is to make IE8 work. h/t Secrets of the Javascript Ninja
			var func = eval( '(0,function JIT_' + context.pc + '(e){' + code + '})' );
			
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
			this.jit[context.pc] = new Function( 'e', optimise( '' + context ) );
		}
		if ( context.pc < this.staticmem )
		{
			console.warn( 'Caching a JIT function in dynamic memory: ' + context.pc );
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
		if ( code === 1001 )
		{
			code = 'restore';
			options = { storer: options };
		}
		
		// Flush the buffer
		this.ui.flush();
		
		// Flush the status if we need to
		// Should instead it be the first order? Might be better for screen readers etc
		if ( this.ui.status.length )
		{
			this.orders.push({
				code: 'stream',
				to: 'status',
				data: this.ui.status
			});
			this.ui.status = [];
		}
		
		options.code = code;
		this.orders.push( options );
		this.stop = 1;
		if ( this.outputEvent )
		{
			this.outputEvent( this.orders );
		}
	}

});