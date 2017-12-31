/*

Common untility functions
=========================

Copyright (c) 2016 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

'use strict';

// Utility to extend objects
function extend()
{
	var old = arguments[0], i = 1, add, name;
	while ( i < arguments.length )
	{
		add = arguments[i++];
		for ( name in add )
		{
			old[name] = add[name];
		}
	}
	return old;
}

// Simple classes
// Inspired by John Resig's class implementation
// http://ejohn.org/blog/simple-javascript-inheritance/

function Class()
{}

Class.subClass = function( props )
{
	function newClass()
	{
		if ( this.init )
		{
			this.init.apply( this, arguments );
		}
	}
	newClass.prototype = extend( Object.create( this.prototype ), props );
	newClass.subClass = this.subClass;
	newClass.super = newClass.prototype.super = this.prototype;
	return newClass;
};

// An enhanced DataView
// Accepts an ArrayBuffer, typed array, or a length number
function MemoryView( buffer, byteOffset = 0, byteLength )
{
	if ( typeof buffer === 'number' )			// number
	{
		buffer = new ArrayBuffer( buffer );
	}	
	else if ( buffer.buffer )					// TypedArray
	{
		// Note that a typed array is a view over a potentially larger array buffer.  Before
		// extracting the underlying buffer, map the given 'byteLength' and byteOffset' to
		// the underlying array buffer from which we will construct the DataView.

		// A specified 'byteLength' does not need to be adjusted, but if no byteLength was
		// given, we need to ensure that the resulting MemoryView does not extend past the
		// end of the typed array (see above).
		if ( byteLength === undefined )
		{
			byteLength = buffer.byteLength - byteOffset;
		}

		// Map the 'byteOffset' specified relative to the typed array to the same location
		// in the underlying array buffer.
		byteOffset += buffer.byteOffset;

		// Finally, extract the underlying array buffer.
		buffer = buffer.buffer;
	}
	// Else already an ArrayBuffer.  No adjustments to 'byteOffset'/'byteLength' necessary.
	
	return extend( new DataView( buffer, byteOffset, byteLength ), {
		getUint8Array: function( start, length )
		{
			start += this.byteOffset;
			return new Uint8Array( this.buffer.slice( start, start + length ) );
		},
		getUint16Array: function( start, length )
		{
			// We cannot simply return a Uint16Array as most systems are little-endian
			start += this.byteOffset;
			return Uint8toUint16Array( new Uint8Array( this.buffer, start, length * 2 ) );
		},
		setUint8Array: function( start, data )
		{
			if ( data instanceof ArrayBuffer )
			{
				data = new Uint8Array( data );
			}
			( new Uint8Array( this.buffer, this.byteOffset, this.byteLength ) ).set( data, start );
		},
		//setBuffer16 NOTE: if we implement this we cannot simply set a Uint16Array as most systems are little-endian
		
		// For use with IFF files
		getFourCC: function( index )
		{
			return String.fromCharCode( this.getUint8( index ), this.getUint8( index + 1 ), this.getUint8( index + 2 ), this.getUint8( index + 3 ) );
		},
		setFourCC: function( index, text )
		{
			this.setUint8( index, text.charCodeAt( 0 ) );
			this.setUint8( index + 1, text.charCodeAt( 1 ) );
			this.setUint8( index + 2, text.charCodeAt( 2 ) );
			this.setUint8( index + 3, text.charCodeAt( 3 ) );
		},
	} );
}

// Utilities for 16-bit signed arithmetic
function U2S16( value )
{
	return value << 16 >> 16;
}
function S2U16 ( value )
{
	return value & 0xFFFF;
}

// Utility to convert from byte arrays to word arrays
function Uint8toUint16Array( array )
{
	var i = 0, l = array.length,
	result = new Uint16Array( l / 2 );
	while ( i < l )
	{
		result[i / 2] = array[i++] << 8 | array[i++];
	}
	return result;
}

module.exports = {
	extend: extend,
	Class: Class,
	MemoryView: MemoryView,
	U2S16: U2S16,
	S2U16: S2U16,
	Uint8toUint16Array: Uint8toUint16Array,
};