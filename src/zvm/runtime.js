/*

Z-Machine runtime functions
===========================

Copyright (c) 2016 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

'use strict';

/*

TODO:
	Check when restoring that it's a savefile for this storyfile
	Save/restore: table, name, prompt support

*/

/*eslint no-console: "off" */

var utils = require( '../common/utils.js' ),
extend = utils.extend,
U2S = utils.U2S16,
S2U = utils.S2U16,
byte_to_word = utils.Uint8toUint16Array,

file = require( '../common/file.js' ),

filemode_Read = 0x02,
filemode_Write = 0x01;

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

		var i,
		locals_count,
		old_locals_count = this.l.length,

		// Keep the number of provided args for @check_arg_count
		provided_args = args.length;

		// Get the number of locals and advance the pc
		this.pc = addr * this.addr_multipler;
		locals_count = this.m.getUint8( this.pc++ );

		// Add the locals
		// Trim args to the count if needed
		args = args.slice( 0, locals_count );
		// Add any extras
		for ( i = args.length; i < locals_count; i++ )
		{
			// Use provided arguments in version 3, or 0 in later versions
			args.push( this.version3 ? this.m.getUint16( this.pc + i * 2 ) : 0 );
		}
		if ( this.version3 )
		{
			this.pc += locals_count * 2;
		}

		// Prepend to the locals array
		this.l = args.concat( this.l );

		// Push the call stack (well unshift really)
		this.call_stack.unshift( [ next, storer, locals_count, this.s.length, provided_args, old_locals_count ] );
	},

	clear_attr: function( object, attribute )
	{
		var addr = this.objects + ( this.version3 ? 9 : 14 ) * object + ( attribute / 8 ) | 0;
		this.ram.setUint8( addr, this.m.getUint8( addr ) & ~( 0x80 >> attribute % 8 ) );
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

	// Quick hack for @inc/@dec/@inc_chk/@dec_chk
	incdec: function( varnum, change )
	{
		var result, offset;
		if ( varnum === 0 )
		{
			result = S2U( this.s.pop() + change );
			this.s.push( result );
			return result;
		}
		if ( --varnum < 15 )
		{
			return this.l[varnum] = S2U( this.l[varnum] + change );
		}
		else
		{
			offset = this.globals + ( varnum - 15 ) * 2;
			result = this.m.getUint16( offset ) + change;
			this.ram.setUint16( offset, result );
			return result;
		}
	},

	// Indirect variables
	indirect: function( variable, value )
	{
		if ( variable === 0 )
		{
			if ( arguments.length > 1 )
			{
				return this.s[this.s.length - 1] = value;
			}
			else
			{
				return this.s[this.s.length - 1];
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

	log: function()
	{
		if ( this.env.debug && typeof console !== 'undefined' && console.log )
		{
			console.log.apply( console, arguments );
		}
	},

	log_shift: function( number, places )
	{
		return places > 0 ? number << places : number >>> -places;
	},

	// Manage output streams
	output_stream: function( stream, addr )
	{
		stream = U2S( stream );
		if ( stream === 1 )
		{
			this.streams[0] = 1;
		}
		if ( stream === -1 )
		{
			this.log( 'Disabling stream one - it actually happened!' );
			this.streams[0] = 0;
		}
		if ( stream === 3 )
		{
			this.streams[2].unshift( [ addr, '' ] );
		}
		if ( stream === -3 )
		{
			var data = this.streams[2].shift(),
			text = this.text_to_zscii( data[1] );
			this.ram.setUint16( data[0], text.length );
			this.ram.setUint8Array( data[0] + 2, text );
		}
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
	restart: function()
	{
		// Set up the memory
		var memory = utils.MemoryView( this.data.buffer.slice() ),
		staticmem = memory.getUint16( 0x0E ),
		ram = utils.MemoryView( memory.buffer, 0, staticmem ),

		version = memory.getUint8( 0x00 ),
		version3 = version === 3,
		addr_multipler = version3 ? 2 : ( version === 5 ? 4 : 8 ),
		property_defaults = memory.getUint16( 0x0A ),
		extension = memory.getUint16( 0x36 );

		// Check if the version is supported
		if ( version !== 3 && version !== 5 && version !== 8 )
		{
			throw new Error( 'Unsupported Z-Machine version: ' + version );
		}

		// Preserve flags 2 - the fixed pitch bit is surely the lamest part of the Z-Machine spec!
		if ( this.m )
		{
			ram.setUint8( 0x11, this.m.getUint8( 0x11 ) );
		}

		extend( this, {

			// Memory, locals and stacks of various kinds
			m: memory,
			ram: ram,
			s: [],
			l: [],
			call_stack: [],
			undo: [],

			// IO stuff
			streams: [ 1, 0, [], 0 ],

			// Get some header variables
			version: version,
			version3: version3,
			pc: memory.getUint16( 0x06 ),
			properties: property_defaults,
			objects: property_defaults + ( version3 ? 53 : 112 ), // 62-9 or 126-14 - if we take this now then we won't need to always decrement the object number
			globals: memory.getUint16( 0x0C ),
			staticmem: staticmem,
			eof: ( memory.getUint16( 0x1A ) || 65536 ) * addr_multipler,
			extension: extension,
			extension_count: extension ? memory.getUint16( extension ) : 0,

			// Routine and string multiplier
			addr_multipler: addr_multipler,

			// Opcodes for this version of the Z-Machine
			opcodes: require( './opcodes.js' )( version3 ),

		});

		this.init_text();
		this.init_io();

		// Update the header
		this.update_header();
	},

	// Request a restore
	restore: function( pc )
	{
		this.pc = pc;
		this.save_mode = filemode_Read;
		this.glk.glk_fileref_create_by_prompt( 0x01, filemode_Read, 0 );
	},

	restore_file: function( data )
	{
		var ram = this.ram,
		quetzal = new file.Quetzal( data ),
		qmem = quetzal.memory,
		qstacks = quetzal.stacks,
		flags2 = this.m.getUint8( 0x11 ),
		temp,
		i = 0, j = 0,
		call_stack = [],
		newlocals = [],
		newstack;
		
		// Memory chunk
		ram.setUint8Array( 0, this.data.buffer.slice( 0, this.staticmem ) );
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
					ram.setUint8( j, temp ^ this.data[j++] );
				}
			}
		}
		else
		{
			ram.setUint8Array( 0, qmem );
		}
		// Preserve flags 1
		ram.setUint8( 0x11, flags2 );

		// Stacks chunk
		i = 6;
		// Dummy call frame
		temp = qstacks[i++] << 8 | qstacks[i++];
		newstack = byte_to_word( qstacks.slice( i, temp ) );
		// Regular frames
		while ( i < qstacks.length )
		{
			call_stack.unshift( [
				qstacks[i++] << 16 | qstacks[i++] << 8 | qstacks[i++], // pc
				0,
				0,
				newstack.length,
				0,
				newlocals.length,
			] );
			call_stack[0][1] = qstacks[i] & 0x10 ? -1 : qstacks[i + 1]; // storer
			call_stack[0][2] = qstacks[i] & 0x0F; // local count
			i += 2;
			temp = qstacks[i++];
			while ( temp )
			{
				call_stack[0][4]++; // provided_args - this is a stupid way to store it
				temp >>= 1;
			}
			temp = ( qstacks[i++] << 8 | qstacks[i++] ) * 2; // "eval" stack length
			newlocals = byte_to_word( qstacks.slice( i, ( i += call_stack[0][2] * 2 ) ) ).concat( newlocals );
			newstack = newstack.concat( byte_to_word( qstacks.slice( i, ( i += temp ) ) ) );
		}
		this.call_stack = call_stack;
		this.l = newlocals;
		this.s = newstack;
		this.pc = quetzal.pc;

		this.update_header();

		// Collapse the upper window (8.6.1.3)
		if ( this.version3 )
		{
			this.split_window( 0 );
		}
	},

	restore_undo: function()
	{
		if ( this.undo.length === 0 )
		{
			return 0;
		}
		var state = this.undo.pop();
		this.pc = state[0];
		// Preserve flags 2
		state[2][0x11] = this.m.getUint8( 0x11 );
		this.ram.setUint8Array( 0, state[2] );
		this.l = state[3];
		this.s = state[4];
		this.call_stack = state[5];
		this.variable( state[1], 2 );
		return 1;
	},

	// Return from a routine
	ret: function( result )
	{
		var call_stack = this.call_stack.shift(),
		storer = call_stack[1];

		// Correct everything again
		this.pc = call_stack[0];
		// With @throw we can now be skipping some call stack frames, so use the old locals length rather than this function's local count
		this.l = this.l.slice( this.l.length - call_stack[5] );
		this.s.length = call_stack[3];

		// Store the result if there is one
		if ( storer >= 0 )
		{
			this.variable( storer, result | 0 );
		}
	},

	// pc is the address of the storer operand (or branch in v3)
	save: function( pc )
	{
		this.pc = pc;
		this.save_mode = filemode_Write;
		this.glk.glk_fileref_create_by_prompt( 0x01, filemode_Write, 0 );
	},
	
	save_file: function( pc )
	{
		var memory = this.m,
		stack = this.s,
		locals = this.l,
		quetzal = new file.Quetzal(),
		compressed_mem = [],
		i, j,
		abyte,
		zeroes = 0,
		call_stack = this.call_stack.reverse(),
		frame,
		stack_len,
		stacks = [ 0, 0, 0, 0, 0, 0 ]; // Dummy call frame

		// IFhd chunk
		quetzal.release = memory.getUint16( 0x02 );
		quetzal.serial = memory.getUint8Array( 0x12, 6 );
		quetzal.checksum = memory.getUint16( 0x1C );
		quetzal.pc = pc;

		// Memory chunk
		quetzal.compressed = 1;
		for ( i = 0; i < this.staticmem; i++ )
		{
			abyte = memory.getUint8( i ) ^ this.data[i];
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

		// Stacks
		// Finish the dummy call frame
		stacks.push( call_stack[0][3] >> 8, call_stack[0][3] & 0xFF );
		for ( j = 0; j < call_stack[0][3]; j++ )
		{
			stacks.push( stack[j] >> 8, stack[j] & 0xFF );
		}
		for ( i = 0; i < call_stack.length; i++ )
		{
			frame = call_stack[i];
			stack_len = ( call_stack[i + 1] ? call_stack[i + 1][3] : stack.length ) - frame[3];
			stacks.push(
				frame[0] >> 16, frame[0] >> 8 & 0xFF, frame[0] & 0xFF, // pc
				frame[2] | ( frame[1] < 0 ? 0x10 : 0 ), // locals count and flag for no storer
				frame[1] < 0 ? 0 : frame[1], // storer
				( 1 << frame[4] ) - 1, // provided args
				stack_len >> 8, stack_len & 0xFF // this frame's stack length
			);
			// Locals
			for ( j = locals.length - frame[5] - frame[2]; j < locals.length - frame[5]; j++ )
			{
				stacks.push( locals[j] >> 8, locals[j] & 0xFF );
			}
			// The stack
			for ( j = frame[3]; j < frame[3] + stack_len; j++ )
			{
				stacks.push( stack[j] >> 8, stack[j] & 0xFF );
			}
		}
		call_stack.reverse();
		quetzal.stacks = stacks;

		return quetzal.write();
	},
	
	// Handle the result of glk_fileref_create_by_prompt()
	save_restore_handler: function( fref )
	{
		var memory = this.m,
		Glk = this.glk,
		str,
		buffer,
		result = 0,
		temp, iftrue, offset;
		
		if ( fref )
		{
			str = Glk.glk_stream_open_file( fref, this.save_mode, 0 );
			Glk.glk_fileref_destroy( fref );
			if ( str )
			{
				// Save
				if ( this.save_mode === filemode_Write )
				{
					Glk.glk_put_buffer_stream( str, new Uint8Array( this.save_file( this.pc ) ) );
					result = 1;
				}
				// Restore
				else
				{
					buffer = new Uint8Array( 128 * 1024 );
					Glk.glk_get_buffer_stream( str, buffer );
					this.restore_file( buffer.buffer );
					result = 2;
				}
				Glk.glk_stream_close( str );
			}
		}
		
		// Store the result / branch in z3
		if ( this.version3 )
		{
			// Calculate the branch
			temp = memory.getUint8( this.pc++ );
			iftrue = temp & 0x80;
			offset = temp & 0x40 ?
				// single byte address
				temp & 0x3F :
				// word address, but first get the second byte of it
				( temp << 8 | memory.getUint8( this.pc++ ) ) << 18 >> 18;

			if ( !result === !iftrue )
			{
				if ( offset === 0 || offset === 1 )
				{
					this.ret( offset );
				}
				else
				{
					this.pc += offset - 2;
				}
			}
		}
		else
		{
			this.variable( memory.getUint8( this.pc++ ), result );
		}
	},

	save_undo: function( pc, variable )
	{
		this.undo.push( [
			pc,
			variable,
			this.m.getUint8Array( 0, this.staticmem ),
			this.l.slice(),
			this.s.slice(),
			this.call_stack.slice(),
		] );
		return 1;
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
		return bitmap & flag === flag;
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
				this.s.push( value );
			}
			else
			{
				return this.s.pop();
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

	warn: function()
	{
		if ( this.env.debug && typeof console !== 'undefined' && console.warn )
		{
			console.warn.apply( console, arguments );
		}
	},

	// Utilities for signed arithmetic
	U2S: U2S,
	S2U: S2U,

};
