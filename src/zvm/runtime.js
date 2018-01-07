/*

Z-Machine runtime functions
===========================

Copyright (c) 2018 The ifvms.js team
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/

'use strict';

/*

TODO:
	Save/restore: table, name, prompt support

*/

const file = require( '../common/file.js' )
const utils = require( '../common/utils.js' )
const extend = utils.extend
const U2S = utils.U2S16
const S2U = utils.S2U16

// eslint-disable-next-line brace-style
const AsyncFunction = Object.getPrototypeOf( async function() {} ).constructor

// Test whether we are running on a littleEndian system
const littleEndian = (function()
{
	var testUint8Array = new Uint8Array( 2 ),
	testUint16Array = new Uint16Array( testUint8Array.buffer );
	testUint16Array[0] = 1;
	return testUint8Array[0] === 1;
})()

function fix_stack_endianness( view, start, end, auto )
{
	if ( littleEndian && !auto )
	{
		while ( start < end )
		{
			view.setUint16( start, view.getUint16( start, 1 ) );
			start += 2;
		}
	}
}

module.exports = {

	art_shift: function( number, places )
	{
		return places > 0 ? number << places : number >> -places;
	},

	// Call a routine
	call: function( addr, storer, next, args )
	{
		// 6.4.3: Calls to 0 instead just store 0
		if ( addr === 0 )
		{
			if ( storer >= 0 )
			{
				this.variable( storer, 0 );
			}
			return this.pc = next;
		}

		// Get the number of locals and advance the pc
		this.pc = addr * this.addr_multipler;
		var locals_count = this.m.getUint8( this.pc++ ),

		stack = this.stack,
		i = 0,

		// Write the current stack use
		frameptr = this.frameptr;
		stack.setUint16( frameptr + 6, this.sp );
		this.frames.push( frameptr );

		// Create a new frame
		frameptr = this.frameptr = this.s.byteOffset + this.sp * 2;
		// Return address
		stack.setUint32( frameptr, next << 8 );
		// Flags
		stack.setUint8( frameptr + 3, ( storer >= 0 ? 0 : 0x10 ) | locals_count );
		// Storer
		stack.setUint8( frameptr + 4, storer >= 0 ? storer : 0 );
		// Supplied arguments
		stack.setUint8( frameptr + 5, ( 1 << args.length ) - 1 );

		// Create the locals and stack
		this.make_stacks();
		this.sp = 0;
		while ( i < locals_count )
		{
			this.l[i] = i < args.length ? args[i] : ( this.version < 5 ? this.m.getUint16( this.pc + i * 2 ) : 0 );
			i++;
		}
		if ( this.version < 5 )
		{
			this.pc += locals_count * 2;
		}
	},

	clear_attr: function( object, attribute )
	{
		var addr = this.objects + ( this.version3 ? 9 : 14 ) * object + ( attribute / 8 ) | 0;
		this.ram.setUint8( addr, this.m.getUint8( addr ) & ~( 0x80 >> attribute % 8 ) );
	},

	// Compile a JIT routine
	compile: function()
	{
		const context = this.disassemble()

		// Compile the routine with new AsyncFunction() as it could call async Glk functions
		this.jit[context.pc] = new AsyncFunction( 'e', '' + context )

		if ( context.pc < this.staticmem )
		{
			this.log( 'Caching a JIT function in dynamic memory: ' + context.pc )
		}
	},

	copy_table: function( first, second, size )
	{
		size = U2S( size );
		var ram = this.ram,
		i = 0,
		allowcorrupt = size < 0;
		size = Math.abs( size );

		// Simple case, zeroes
		if ( second === 0 )
		{
			while ( i < size )
			{
				ram.setUint8( first + i++, 0 );
			}
			return;
		}

		if ( allowcorrupt )
		{
			while ( i < size )
			{
				ram.setUint8( second + i, this.m.getUint8( first + i++ ) );
			}
		}
		else
		{
			ram.setUint8Array( second, this.m.getUint8Array( first, size ) );
		}
	},

	do_autorestore: async function( snapshot )
	{
		const Glk = this.Glk

		// Restore Glk
		await Glk.restore_allstate( snapshot.glk )

		// Get references to our Glk objects
		this.io = snapshot.io
		const RockBox = new Glk.RefBox()
		let obj
		while ( obj = Glk.glk_window_iterate( obj, RockBox ) )
		{
			if ( RockBox.value === 201 )
			{
				this.mainwin = obj
				if ( obj.linebuf )
				{
					snapshot.read_data.buffer = obj.linebuf
				}
			}
			if ( RockBox.value === 202 )
			{
				this.statuswin = obj
			}
			if ( RockBox.value === 203 )
			{
				this.upperwin = obj
			}
		}
		obj = null
		while ( obj = Glk.glk_stream_iterate( obj, RockBox ) )
		{
			if ( RockBox.value === 210 )
			{
				this.io.streams[2] = obj
			}
			if ( RockBox.value === 211 )
			{
				this.io.streams[4] = obj
			}
		}

		// Restart and restore the RAM and stacks
		this.restart()
		await this.restore_file( new Uint8Array( snapshot.ram ), 1 )

		// Set remaining data from the snapshot
		this.read_data = snapshot.read_data
		this.xorshift_seed = snapshot.xorshift_seed
	},

	encode_text: function( zscii, length, from, target )
	{
		this.ram.setUint8Array( target, this.encode( this.m.getUint8Array( zscii + from, length ) ) );
	},

	// Access the extension table
	extension_table: function( word, value )
	{
		var addr = this.extension;
		if ( !addr || word > this.extension_count )
		{
			return 0;
		}
		addr += 2 * word;
		if ( value === undefined )
		{
			return this.m.getUint16( addr );
		}
		this.ram.setUint16( addr, value );
	},

	// Find the address of a property, or given the previous property, the number of the next
	find_prop: function( object, property, prev )
	{
		var memory = this.m,
		version3 = this.version3,

		this_property_byte, this_property,
		last_property = 0,

		// Get this property table
		properties = memory.getUint16( this.objects + ( version3 ? 9 : 14 ) * object + ( version3 ? 7 : 12 ) );

		// Skip over the object's short name
		properties += memory.getUint8( properties ) * 2 + 1;

		// Run through the properties
		while ( 1 )
		{
			this_property_byte = memory.getUint8( properties );
			this_property = this_property_byte & ( version3 ? 0x1F : 0x3F );

			// Found the previous property, so return this one's number
			if ( last_property === prev )
			{
				return this_property;
			}
			// Found the property! Return its address
			if ( this_property === property )
			{
				// Must include the offset
				return properties + ( !version3 && this_property_byte & 0x80 ? 2 : 1 );
			}
			// Gone past the property
			if ( this_property < property )
			{
				return 0;
			}

			// Go to next property
			last_property = this_property;

			// Calculate the size of this property and skip to the next
			if ( version3 )
			{
				properties += ( this_property_byte >> 5 ) + 2;
			}
			else
			{
				if ( this_property_byte & 0x80 )
				{
					this_property = memory.getUint8( properties + 1 ) & 0x3F;
					properties += this_property ? this_property + 2 : 66;
				}
				else
				{
					properties += this_property_byte & 0x40 ? 3 : 2;
				}
			}
		}
	},

	// 1.2 spec @gestalt
	gestalt: function( id /*, arg*/ )
	{
		switch ( id )
		{
			case 1:
				return 0x0102;
			case 0x2000:
				return 1;
			// These aren't really applicable, but 2 is closer than 1
			case 0x2001:
			case 0x2002:
				return 2;
		}
		return 0;
	},

	// Get the first child of an object
	get_child: function( obj )
	{
		if ( this.version3 )
		{
			return this.m.getUint8( this.objects + 9 * obj + 6 );
		}
		else
		{
			return this.m.getUint16( this.objects + 14 * obj + 10 );
		}
	},

	get_sibling: function( obj )
	{
		if ( this.version3 )
		{
			return this.m.getUint8( this.objects + 9 * obj + 5 );
		}
		else
		{
			return this.m.getUint16( this.objects + 14 * obj + 8 );
		}
	},

	get_parent: function( obj )
	{
		if ( this.version3 )
		{
			return this.m.getUint8( this.objects + 9 * obj + 4 );
		}
		else
		{
			return this.m.getUint16( this.objects + 14 * obj + 6 );
		}
	},

	get_prop: function( object, property )
	{
		var memory = this.m,

		// Try to find the property
		addr = this.find_prop( object, property ),
		len;

		// If we have the property
		if ( addr )
		{
			len = memory.getUint8( addr - 1 );
			// Assume we're being called for a valid short property
			return memory[ ( this.version3 ? len >> 5 : len & 0x40 ) ? 'getUint16' : 'getUint8' ]( addr );
		}

		// Use the default properties table
		// Remember that properties are 1-indexed
		return memory.getUint16( this.properties + 2 * ( property - 1 ) );
	},

	// Get the length of a property
	// This opcode expects the address of the property data, not a property block
	get_prop_len: function( addr )
	{
		// Spec 1.1
		if ( addr === 0 )
		{
			return 0;
		}

		var value = this.m.getUint8( addr - 1 );

		// Version 3
		if ( this.version3 )
		{
			return ( value >> 5 ) + 1;
		}

		// Two size/number bytes
		if ( value & 0x80 )
		{
			value &= 0x3F;
			return value === 0 ? 64 : value;
		}
		// One byte size/number
		return value & 0x40 ? 2 : 1;
    },

    // Run the Glk event loop waiting for a particular kind of event
    glk_event: async function( event_type )
    {
        while ( 1 )
        {
            const glk_event = new this.Glk.RefStruct()
            await this.Glk.glk_select( glk_event )

            const this_event_type = glk_event.get_field( 0 )

            // Handle arrange events
            if ( this_event_type === 5 )
            {
                await this.update_screen_size()
            }

            if ( this_event_type === event_type )
            {
                return glk_event
            }
        }
    },

	// Quick hack for @inc/@dec/@inc_chk/@dec_chk
	incdec: function( varnum, change )
	{
		if ( varnum === 0 )
		{
			this.s[this.sp - 1] += change;
			return this.s[this.sp - 1];
		}
		if ( --varnum < 15 )
		{
			this.l[varnum] += change;
			return this.l[varnum];
		}
		else
		{
			var offset = this.globals + ( varnum - 15 ) * 2;
			this.ram.setUint16( offset, this.m.getUint16( offset ) + change );
			return this.ram.getUint16( offset );
		}
	},

	// Indirect variables
	indirect: function( variable, value )
	{
		if ( variable === 0 )
		{
			if ( arguments.length > 1 )
			{
				return this.s[this.sp - 1] = value;
			}
			else
			{
				return this.s[this.sp - 1];
			}
		}
		return this.variable( variable, value );
	},

	insert_obj: function( obj, dest )
	{
		// First remove the obj from wherever it was
		this.remove_obj( obj );
		// Now add it to the destination
		this.set_family( obj, dest, dest, obj, obj, this.get_child( dest ) );
	},

	// @jeq
	jeq: function()
	{
		var i = 1;

		// Account for many arguments
		while ( i < arguments.length )
		{
			if ( arguments[i++] === arguments[0] )
			{
				return 1;
			}
		}
	},

	jin: function( child, parent )
	{
		return this.get_parent( child ) === parent;
	},

	log: function( message )
	{
		if ( this.options.GlkOte )
		{
			this.options.GlkOte.log( message );
		}
	},

	log_shift: function( number, places )
	{
		return places > 0 ? number << places : number >>> -places;
	},

	make_stacks: function()
	{
		var locals_count = this.stack.getUint8( this.frameptr + 3 ) & 0x0F;
		this.l = new Uint16Array( this.stack.buffer, this.frameptr + 8, locals_count );
		this.s = new Uint16Array( this.stack.buffer, this.frameptr + 8 + locals_count * 2 );
	},

	put_prop: function( object, property, value )
	{
		// Try to find the property
		var addr = this.find_prop( object, property ),
		len;

		if ( addr )
		{
			len = this.m.getUint8( addr - 1 );

			// Assume we're being called for a valid short property
			this.ram[ ( this.version3 ? len >> 5 : len & 0x40 ) ? 'setUint16' : 'setUint8' ]( addr, value );
		}
	},

	random: function( range )
	{
		var seed = this.xorshift_seed;

		// Switch to the Xorshift RNG (or switch off if range == 0)
		if ( range < 1 )
		{
			this.xorshift_seed = range;
			return 0;
		}

		// Pure randomness
		if ( seed === 0 )
		{
			return 1 + ( Math.random() * range ) | 0;
		}

		// Based on the discussions in this forum topic, we will not implement the sequential mode recommended in the standard
		// http://www.intfiction.org/forum/viewtopic.php?f=38&t=16023

		// Instead implement a 32 bit Xorshift generator
		seed ^= ( seed << 13 );
		seed ^= ( seed >> 17 );
		this.xorshift_seed = ( seed ^= ( seed << 5 ) );
		return 1 + ( ( seed & 0x7FFF ) % range );
	},

	remove_obj: function( obj )
	{
		var parent = this.get_parent( obj ),
		older_sibling,
		younger_sibling,
		temp_younger;

		// No parent, do nothing
		if ( parent === 0 )
		{
			return;
		}

		older_sibling = this.get_child( parent );
		younger_sibling = this.get_sibling( obj );

		// obj is first child
		if ( older_sibling === obj )
		{
			this.set_family( obj, 0, parent, younger_sibling );
		}
		// obj isn't first child, so fix the older sibling
		else
		{
			// Go through the tree until we find the older sibling
			while ( 1 )
			{
				temp_younger = this.get_sibling( older_sibling );
				if ( temp_younger === obj )
				{
					break;
				}
				older_sibling = temp_younger;
			}
			this.set_family( obj, 0, 0, 0, older_sibling, younger_sibling );
		}
	},

	// (Re)start the VM
	restart: async function()
	{
		var ram = this.ram,
		version = ram.getUint8( 0x00 ),
		version3 = version === 3,
		addr_multipler = version3 ? 2 : ( version === 8 ? 8 : 4 ),
		flags2 = ram.getUint8( 0x11 ),
		property_defaults = ram.getUint16( 0x0A ),
		extension = ( version > 4 ) ? ram.getUint16( 0x36 ) : 0,
		stack = utils.MemoryView( this.options.stack_len );

		// Reset the RAM, but preserve flags 2
		ram.setUint8Array( 0, this.origram );
		ram.setUint8( 0x11, flags2 );

		extend( this, {

			// Locals and stacks of various kinds
			stack: stack,
			frameptr: 0,
			frames: [],
			s: new Uint16Array( stack.buffer, 8 ),
			sp: 0,
			l: [],
			undo: [],
			undo_len: 0,

			glk_blocking_call: null,

			// Get some header variables
			version: version,
			version3: version3,
			pc: ram.getUint16( 0x06 ),
			properties: property_defaults,
			objects: property_defaults + ( version3 ? 53 : 112 ), // 62-9 or 126-14 - if we take this now then we won't need to always decrement the object number
			globals: ram.getUint16( 0x0C ),
			// staticmem: set in prepare()
			eof: ( ram.getUint16( 0x1A ) || 65536 ) * addr_multipler,
			extension: extension,
			extension_count: extension ? ram.getUint16( extension ) : 0,

			// Routine and string multiplier
			addr_multipler: addr_multipler,

			// Opcodes for this version of the Z-Machine
			opcodes: require( './opcodes.js' )( version ),

		});

		this.init_text();
		await this.init_io()

		// Update the header
		await this.update_header()
	},

	// Request a restore
	restore: async function( pc )
	{
        const Glk = this.Glk
        let result = 0

        this.pc = pc

        const fref = await Glk.glk_fileref_create_by_prompt( 0x01, 0x02, 0 )
        if ( fref )
        {
            const str = await Glk.glk_stream_open_file( fref, 0x02, 0 )
            if ( str )
            {
                const buffer = new Uint8Array( 128 * 1024 )
				await Glk.glk_get_buffer_stream( str, buffer )
				result = await this.restore_file( buffer.buffer )
                await Glk.glk_stream_close( str )
            }
            await Glk.glk_fileref_destroy( fref )
        }

        this.save_restore_result( result )
	},

	restore_file: async function( data, autorestoring )
	{
		var ram = this.ram,
		quetzal = new file.Quetzal( data ),
		qmem = quetzal.memory,
		stack = this.stack,
		flags2 = ram.getUint8( 0x11 ),
		temp,
		i = 0, j = 0;

		// Check this is a savefile for this story
		if ( ram.getUint16( 0x02 ) !== quetzal.release || ram.getUint16( 0x1C ) !== quetzal.checksum )
		{
			return 0;
		}
		while ( i < 6 )
		{
			if ( ram.getUint8( 0x12 + i ) !== quetzal.serial[i++] )
			{
				return 0;
			}
		}
		i = 0;

		// Memory chunk
		// Reset the RAM
		ram.setUint8Array( 0, this.origram );
		if ( quetzal.compressed )
		{
			while ( i < qmem.length )
			{
				temp = qmem[i++];
				// Same memory
				if ( temp === 0 )
				{
					j += 1 + qmem[i++];
				}
				else
				{
					ram.setUint8( j, temp ^ this.origram[j++] );
				}
			}
		}
		else
		{
			ram.setUint8Array( 0, qmem );
		}
		// Preserve flags 2
		ram.setUint8( 0x11, flags2 );

		// Stacks
		stack.setUint8Array( 0, quetzal.stacks );
		this.frames = [];
		i = 0;
		while ( i < quetzal.stacks.byteLength )
		{
			this.frameptr = i;
			this.frames.push( i );
			// Swap the bytes of the locals and stacks
			fix_stack_endianness( stack, j = i + 8, j += ( stack.getUint8( i + 3 ) & 0x0F ) * 2, autorestoring )
			fix_stack_endianness( stack, j, j += stack.getUint16( i + 6 ) * 2, autorestoring )
			i = j;
		}
		this.frames.pop();
		this.sp = stack.getUint16( this.frameptr + 6 );
		this.make_stacks();

		this.pc = quetzal.pc;
		this.update_header();

		// Collapse the upper window (8.6.1.3)
		if ( this.version3 )
		{
			await this.split_window( 0 )
		}

		return 2;
	},

	restore_undo: function()
	{
		if ( this.undo.length === 0 )
		{
			return 0;
		}

		var state = this.undo.pop();
		this.frameptr = state.frameptr;
		this.pc = state.pc;
		this.undo_len -= ( state.ram.byteLength + state.stack.byteLength );

		// Replace the ram, preserving flags 2
		state.ram[0x11] = this.m.getUint8( 0x11 );
		this.ram.setUint8Array( 0, state.ram );

		// Fix up the stack
		this.frames = state.frames;
		this.sp = state.sp;
		this.stack.setUint8Array( 0, state.stack );
		this.make_stacks();

		this.variable( state.var, 2 );
		return 1;
	},

	// Return from a routine
	ret: function( result )
	{
		var stack = this.stack,

		// Get the storer and return pc from this frame
		frameptr = this.frameptr,
		storer = stack.getUint8( frameptr + 3 ) & 0x10 ? -1 : stack.getUint8( frameptr + 4 );
		this.pc = stack.getUint32( frameptr ) >> 8;

		// Recreate the locals and stacks from the previous frame
		frameptr = this.frameptr = this.frames.pop();
		this.make_stacks();
		this.sp = stack.getUint16( frameptr + 6 );

		// Store the result if there is one
		if ( storer >= 0 )
		{
			this.variable( storer, result || 0 );
		}
	},

    // Run and handle Glk events
    run: async function()
    {
        // Run until the VM has quit
        while ( !this.quit )
        {
            const pc = this.pc
            if ( !this.jit[pc] )
            {
                this.compile()
            }
            const result = await this.jit[pc]( this )

            // Return from a VM func if the JIT function returned a result
            if ( !isNaN( result ) )
            {
                this.ret( result )
            }
        }
    },

    // pc is the address of the storer operand (or branch in v3)
    save: async function( pc )
    {
        const Glk = this.Glk
        let result = 0

        this.pc = pc

        const fref = await Glk.glk_fileref_create_by_prompt( 0x01, 0x01, 0 )
        if ( fref )
        {
            const str = await Glk.glk_stream_open_file( fref, 0x01, 0 )
            if ( str )
            {
                Glk.glk_put_buffer_stream( str, new Uint8Array( this.save_file( this.pc ) ) )
                result = 1
                await Glk.glk_stream_close( str )
            }
            await Glk.glk_fileref_destroy( fref )
        }

        this.save_restore_result( result )
    },

	save_file: function( pc, autosaving )
	{
		var memory = this.m,
		quetzal = new file.Quetzal(),
		stack = utils.MemoryView( this.stack.buffer.slice() ),
		zeroes = 0,
		i, j,
		frameptr = this.frameptr,
		abyte;

		// IFhd chunk
		quetzal.release = memory.getUint16( 0x02 );
		quetzal.serial = memory.getUint8Array( 0x12, 6 );
		quetzal.checksum = memory.getUint16( 0x1C );
		quetzal.pc = pc;

		// Memory chunk
		if ( autosaving )
		{
			quetzal.memory = this.m.getUint8Array( 0, this.staticmem )
		}
		else
		{
			const compressed_mem = []
			quetzal.compressed = 1;
			for ( i = 0; i < this.staticmem; i++ )
			{
				abyte = memory.getUint8( i ) ^ this.origram[i];
				if ( abyte === 0 )
				{
					if ( ++zeroes === 256 )
					{
						compressed_mem.push( 0, 255 );
						zeroes = 0;
					}
				}
				else
				{
					if ( zeroes )
					{
						compressed_mem.push( 0, zeroes - 1 );
						zeroes = 0;
					}
					compressed_mem.push( abyte );
				}
			}
			quetzal.memory = compressed_mem;
		}

		// Stacks
		// Set the current sp
		stack.setUint16( frameptr + 6, this.sp );

		// Swap the bytes of the locals and stacks
		if ( littleEndian && !autosaving )
		{
			const frames = this.frames.slice()
			frames.push( frameptr )
			for ( i = 0; i < frames.length; i++ )
			{
				frameptr = frames[i];
				fix_stack_endianness( stack, j = frameptr + 8, j += ( stack.getUint8( frameptr + 3 ) & 0x0F ) * 2 );
				fix_stack_endianness( stack, j, j += stack.getUint16( frameptr + 6 ) * 2 );
			}
		}
		quetzal.stacks = stack.getUint8Array( 0, this.frameptr + 8 + ( stack.getUint8( frameptr + 3 ) & 0x0F ) * 2 + this.sp * 2 );

		return quetzal.write();
	},

    save_restore_result: function( result )
    {
        const memory = this.m

        // Store the result / branch in z3
        if ( this.version3 )
        {
            // Calculate the branch
            const temp = memory.getUint8( this.pc++ )
            const iftrue = temp & 0x80
            const offset = temp & 0x40 ?
                // single byte address
                temp & 0x3F :
                // word address, but first get the second byte of it
                ( temp << 8 | memory.getUint8( this.pc++ ) ) << 18 >> 18

            if ( !result === !iftrue )
            {
                if ( offset === 0 || offset === 1 )
                {
                    this.ret( offset )
                }
                else
                {
                    this.pc += offset - 2
                }
            }
        }
        else
        {
            this.variable( memory.getUint8( this.pc++ ), result )
        }
    },

	save_undo: function( pc, variable )
	{
		// Drop an old undo state if we've reached the limit, but always save at least one state
		var state
		if ( this.undo_len > this.options.undo_len )
		{
			state = this.undo.shift()
			this.undo_len -= ( state.ram.byteLength + state.stack.byteLength )
		}
		state = {
			frameptr: this.frameptr,
			frames: this.frames.slice(),
			pc: pc,
			ram: this.m.getUint8Array( 0, this.staticmem ),
			sp: this.sp,
			stack: this.stack.getUint8Array( 0, this.s.byteOffset + this.sp * 2 ),
			var: variable,
		}
		this.undo_len += ( state.ram.byteLength + state.stack.byteLength )
		this.undo.push( state )
		return 1
	},

	scan_table: function( key, addr, length, form )
	{
		form = form || 0x82;
		var memoryfunc = form & 0x80 ? 'getUint16' : 'getUint8';
		form &= 0x7F;
		length = addr + length * form;

		while ( addr < length )
		{
			if ( this.m[memoryfunc]( addr ) === key )
			{
				return addr;
			}
			addr += form;
		}
		return 0;
	},

	set_attr: function( object, attribute )
	{
		var addr = this.objects + ( this.version3 ? 9 : 14 ) * object + ( attribute / 8 ) | 0;
		this.ram.setUint8( addr, this.m.getUint8( addr ) | 0x80 >> attribute % 8 );
	},

	set_family: function( obj, newparent, parent, child, bigsis, lilsis )
	{
		var ram = this.ram,
		objects = this.objects;

		if ( this.version3 )
		{
			// Set the new parent of the obj
			ram.setUint8( objects + 9 * obj + 4, newparent );
			// Update the parent's first child if needed
			if ( parent )
			{
				ram.setUint8( objects + 9 * parent + 6, child );
			}
			// Update the little sister of a big sister
			if ( bigsis )
			{
				ram.setUint8( objects + 9 * bigsis + 5, lilsis );
			}
		}
		else
		{
			// Set the new parent of the obj
			ram.setUint16( objects + 14 * obj + 6, newparent );
			// Update the parent's first child if needed
			if ( parent )
			{
				ram.setUint16( objects + 14 * parent + 10, child );
			}
			// Update the little sister of a big sister
			if ( bigsis )
			{
				ram.setUint16( objects + 14 * bigsis + 8, lilsis );
			}
		}
	},

	test: function( bitmap, flag )
	{
		return ( bitmap & flag ) === flag;
	},

	test_attr: function( object, attribute )
	{
		return ( this.m.getUint8( this.objects + ( this.version3 ? 9 : 14 ) * object + ( attribute / 8 ) | 0 ) << attribute % 8 ) & 0x80;
	},

	// Read or write a variable
	variable: function( variable, value )
	{
		var havevalue = value !== undefined,
		offset;
		if ( variable === 0 )
		{
			if ( havevalue )
			{
				this.s[this.sp++] = value;
			}
			else
			{
				return this.s[--this.sp];
			}
		}
		else if ( --variable < 15 )
		{
			if ( havevalue )
			{
				this.l[variable] = value;
			}
			else
			{
				return this.l[variable];
			}
		}
		else
		{
			offset = this.globals + ( variable - 15 ) * 2;
			if ( havevalue )
			{
				this.ram.setUint16( offset, value );
			}
			else
			{
				return this.m.getUint16( offset );
			}
		}
		return value;
	},

	// Utilities for signed arithmetic
	U2S: U2S,
	S2U: S2U,

};
