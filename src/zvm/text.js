/*
 * Z-Machine text coding
 *
 * Copyright (c) 2011 The ifvms.js team
 * Licenced under the BSD
 * http://github.com/curiousdannii/ifvms.js
 */

/*
	
TODO:
	Proper ZSCII->ASCII transcoding
	
*/

var rnewline = /\n/g,
rdoublequote = /"/g,

// Standard alphabets
standard_alphabets = (function(a){
	var b = [[], [], []],
	i = 0;
	while ( i < 78 )
	{
		b[parseInt( i / 26 )][i % 26] = a.charCodeAt( i++ );
	}
	return b;
})( 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ*\n0123456789.,!?_#\'"/\\-:()' ),

// A class for managing everything text
Text = Object.subClass({
	init: function( engine )
	{
		var memory = engine.m,
		
		alphabet_addr = memory.getUint16( 0x34 ),
		i = 0,
		alphabets;
		
		this.e = engine;
		
		// Check for custom alphabets
		if ( alphabet_addr )
		{
			alphabets = [[], [], []];
			while ( i < 78 )
			{
				alphabets[parseInt( i / 26 )][i % 26] = memory.getUint8( alphabet_addr + i++ );
			}
		}
		// Otherwise use the standard alphabets
		else
		{
			alphabets = standard_alphabets;
		}
		this.alphabets = alphabets;
	},
	
	// Decode Z-chars into Unicode
	decode: function( addr )
	{
		var memory = this.e.m,
		
		start_addr = addr,
		word,
		buffer = [],
		i = 0,
		zchar,
		alphabet = 0,
		result = [];
		
		// Check if this one's been cached already
		if ( this.e.jit[addr] )
		{
			return this.e.jit[addr];
		}
		
		// Go through until we reach a stop bit
		while (1)
		{
			word = memory.getUint16( addr );
			addr += 2;
			
			buffer.push( word >> 10, word >> 5, word );
			
			// Stop bit
			if ( word & 0x8000 )
			{
				break;
			}
		}
		
		// Process the Z-chars
		while ( i < buffer.length )
		{
			zchar = buffer[i++] & 0x1F;
			
			// Special chars
			// Space
			if ( zchar == 0 )
			{
				result.push( 32 );
			}
			// Abbreviations
			else if ( zchar < 4 )
			{
			}
			// Shift characters
			else if ( zchar < 6 )
			{
				alphabet = zchar;
			}
			// Check for a 10 bit ZSCII character
			else if ( alphabet == 2 && zchar == 6 )
			{
				result.push( (buffer[i++] & 0x1F) << 5 | (buffer[i++] & 0x1F) );
			}
			else
			{
				// Regular characters
				result.push( this.alphabets[alphabet][ zchar - 6 ] );
			}
			
			// Reset the alphabet
			alphabet = alphabet < 4 ? 0 : alphabet - 3;
		}
		
		// Cache and return
		result = [ fromCharCode.apply( this, result ), addr - start_addr ];
		this.e.jit[start_addr] = result;
		return result;
	},
	
	// Escape text for JITing
	escape: function( text )
	{
		return text.replace( rnewline, '\\n' ).replace( rdoublequote, '\\"' );
	}
});