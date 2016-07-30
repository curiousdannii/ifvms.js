/*

Z-Machine text functions
========================

Copyright (c) 2016 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

/*

TODO:
	Consider quote suggestions from 1.1 spec

*/

// Key codes accepted by the Z-Machine
var ZSCII_keyCodes = {
	8: 8, // delete/backspace
	13: 13, // enter
	27: 27, // escape
	37: 131, // arrow keys
	38: 129,
	39: 132,
	40: 130,
},
i = 96;
while ( i < 106 )
{
	ZSCII_keyCodes[i] = 49 + i++; // keypad
}
i = 112;
while ( i < 124 )
{
	ZSCII_keyCodes[i] = 21 + i++; // function keys
}

module.exports = {

	init_text: function()
	{
		var self = this,
		memory = this.m,

		alphabet_addr = !this.version3 && memory.getUint16( 0x34 ),
		unicode_addr = this.extension_table( 3 ),
		unicode_len = unicode_addr && memory.getUint8( unicode_addr++ );

		this.abbr_addr = memory.getUint16( 0x18 );

		// Generate alphabets
		function make_alphabet( data )
		{
			var alphabets = [[], [], []],
			i = 0;
			while ( i < 78 )
			{
				alphabets[( i / 26 ) | 0][i % 26] = data[ i++ ];
			}
			// A2->7 is always a newline
			alphabets[2][1] = 13;
			self.alphabets = alphabets;
		}

		// Make the unicode tables
		function make_unicode( data )
		{
			var table = { 13: '\r' }, // New line conversion
			reverse = { 13: 13 },
			i = 0;
			while ( i < data.length )
			{
				table[155 + i] = String.fromCharCode( data[i] );
				reverse[data[i]] = 155 + i++;
			}
			i = 32;
			while ( i < 127 )
			{
				table[i] = String.fromCharCode( i );
				reverse[i] = i++;
			}
			self.unicode_table = table;
			self.reverse_unicode_table = reverse;
		}

		// Check for custom alphabets
		make_alphabet( alphabet_addr ? memory.getBuffer8( alphabet_addr, 78 )
			// Or use the standard alphabet
			: this.text_to_zscii( 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ \r0123456789.,!?_#\'"/\\-:()', 1 ) );

		// Check for a custom unicode table
		make_unicode( unicode_addr ? memory.getBuffer16( unicode_addr, unicode_len )
			// Or use the default
			: this.text_to_zscii( unescape( '%E4%F6%FC%C4%D6%DC%DF%BB%AB%EB%EF%FF%CB%CF%E1%E9%ED%F3%FA%FD%C1%C9%CD%D3%DA%DD%E0%E8%EC%F2%F9%C0%C8%CC%D2%D9%E2%EA%EE%F4%FB%C2%CA%CE%D4%DB%E5%C5%F8%D8%E3%F1%F5%C3%D1%D5%E6%C6%E7%C7%FE%F0%DE%D0%A3%u0153%u0152%A1%BF' ), 1 ) );

		// Parse the standard dictionary
		this.dictionaries = {};
		this.dict = memory.getUint16( 0x08 );
		this.parse_dict( this.dict );

		// Optimise our own functions
		/*if ( DEBUG )
		{
			if ( !debugflags.nooptimise )
			optimise_obj( this, 'TEXT' );
		}*/
	},

	// Decode Z-chars into ZSCII and then Unicode
	decode: function( addr, length )
	{
		var memory = this.m,

		start_addr = addr,
		temp,
		buffer = [],
		i = 0,
		zchar,
		alphabet = 0,
		result = [],
		resulttexts = [],
		usesabbr,
		tenbit,
		unicodecount = 0;

		// Check if this one's been cached already
		if ( this.jit[addr] )
		{
			return this.jit[addr];
		}

		// If we've been given a length, then use it as the finaladdr,
		// Otherwise don't go past the end of the file
		length = length ? length + addr : this.eof;

		// Go through until we've reached the end of the text or a stop bit
		while ( addr < length )
		{
			temp = memory.getUint16( addr );
			addr += 2;

			buffer.push( temp >> 10 & 0x1F, temp >> 5 & 0x1F, temp & 0x1F );

			// Stop bit
			if ( temp & 0x8000 )
			{
				break;
			}
		}

		// Process the Z-chars
		while ( i < buffer.length )
		{
			zchar = buffer[i++];

			// Special chars
			// Space
			if ( zchar === 0 )
			{
				result.push( 32 );
			}
			// Abbreviations
			else if ( zchar < 4 )
			{
				usesabbr = 1;
				result.push( -1 );
				resulttexts.push( '\uE000+this.abbr(' + ( 32 * ( zchar - 1 ) + buffer[i++] ) + ')+\uE000' );
			}
			// Shift characters
			else if ( zchar < 6 )
			{
				alphabet = zchar;
			}
			// Check for a 10 bit ZSCII character
			else if ( alphabet === 2 && zchar === 6 )
			{
				// Check we have enough Z-chars left.
				if ( i + 1 < buffer.length )
				{
					tenbit = buffer[i++] << 5 | buffer[i++];
					// A regular character
					if ( tenbit < 768 )
					{
						result.push( tenbit );
					}
					// 1.1 spec Unicode strings - not the most efficient code, but then noone uses this
					else
					{
						tenbit -= 767;
						unicodecount += tenbit;
						temp = i;
						i = ( i % 3 ) + 3;
						while ( tenbit-- )
						{
							result.push( -1 );
							resulttexts.push( String.fromCharCode( buffer[i] << 10 | buffer[i + 1] << 5 | buffer[i + 2] ) );
							// Set those characters so they won't be decoded again
							buffer[i++] = buffer[i++] = buffer[i++] = 0x20;
						}
						i = temp;
					}
				}
			}
			// Regular characters
			else if ( zchar < 0x20 )
			{
				result.push( this.alphabets[alphabet][ zchar - 6 ] );
			}

			// Reset the alphabet
			alphabet = alphabet < 4 ? 0 : alphabet - 3;

			// Add to the index if we've had raw unicode
			if ( ( i % 3 ) === 0 )
			{
				i += unicodecount;
				unicodecount = 0;
			}
		}

		result = this.zscii_to_text( result, resulttexts );
		// Abbreviations must be extracted at run time, so return a function instead
		if ( usesabbr )
		{
			result = {
				toString: ( Function( 'return"' + result.replace( /\\/g, '\\\\' ).replace( /"/g, '\\"' ).replace( /\r/g, '\\r' ).replace( /\uE000/g, '"' ) + '"' ) ).bind( this ),
			};
		}
		// Cache and return
		if ( start_addr >= this.staticmem )
		{
			this.jit[start_addr] = result;
		}
		return result;
	},

	// Encode ZSCII into Z-chars
	encode: function( zscii )
	{
		var alphabets = this.alphabets,
		zchars = [],
		word_len = this.version3 ? 6 : 9,
		i = 0,
		achar,
		temp,
		result = [];

		// Encode the Z-chars
		while ( zchars.length < word_len )
		{
			achar = zscii[i++];
			// Space
			if ( achar === 32 )
			{
				zchars.push( 0 );
			}
			// Alphabets
			else if ( ( temp = alphabets[0].indexOf( achar ) ) >= 0 )
			{
				zchars.push( temp + 6 );
			}
			else if ( ( temp = alphabets[1].indexOf( achar ) ) >= 0 )
			{
				zchars.push( 4, temp + 6 );
			}
			else if ( ( temp = alphabets[2].indexOf( achar ) ) >= 0 )
			{
				zchars.push( 5, temp + 6 );
			}
			// 10-bit ZSCII / Unicode table
			else if ( ( temp = this.reverse_unicode_table[achar] ) )
			{
				zchars.push( 5, 6, temp >> 5, temp & 0x1F );
			}
			// Pad character
			else if ( achar === undefined )
			{
				zchars.push( 5 );
			}
		}
		zchars.length = word_len;

		// Encode to bytes
		i = 0;
		while ( i < word_len )
		{
			result.push( zchars[i++] << 2 | zchars[i] >> 3, ( zchars[i++] & 0x07 ) << 5 | zchars[i++] );
		}
		result[ result.length - 2 ] |= 0x80;
		return result;
	},

	// In these two functions zscii means an array of ZSCII codes and text means a regular Javascript unicode string
	zscii_to_text: function( zscii, texts )
	{
		var i = 0, l = zscii.length,
		charr,
		j = 0,
		result = '';

		while ( i < l )
		{
			charr = zscii[i++];
			// Text substitution from abbreviations or 1.1 unicode
			if ( charr === -1 )
			{
				result += texts[j++];
			}
			// Regular characters
			if ( ( charr = this.unicode_table[charr] ) )
			{
				result += charr;
			}
		}
		return result;
	},

	// If the second argument is set then don't use the unicode table
	text_to_zscii: function( text, notable )
	{
		var array = [], i = 0, l = text.length, charr;
		while ( i < l )
		{
			charr = text.charCodeAt( i++ );
			// Check the unicode table
			if ( !notable )
			{
				charr = this.reverse_unicode_table[charr] || 63;
			}
			array.push( charr );
		}
		return array;
	},

	// Parse and cache a dictionary
	parse_dict: function( addr )
	{
		var memory = this.m,

		addr_start = addr,
		dict = {},
		entry_len,
		endaddr,

		// Get the word separators
		seperators_len = memory.getUint8( addr++ );
		dict.separators = memory.getBuffer8( addr, seperators_len );
		addr += seperators_len;

		// Go through the dictionary and cache its entries
		entry_len = memory.getUint8( addr++ );
		endaddr = addr + 2 + entry_len * memory.getUint16( addr );
		addr += 2;
		while ( addr < endaddr )
		{
			dict[ Array.prototype.toString.call( memory.getBuffer8( addr, this.version3 ? 4 : 6 ) ) ] = addr;
			addr += entry_len;
		}
		this.dictionaries[addr_start] = dict;

		return dict;
	},

	// Print an abbreviation
	abbr: function( abbrnum )
	{
		return this.decode( this.m.getUint16( this.abbr_addr + 2 * abbrnum ) * 2 );
	},

	// Tokenise a text
	tokenise: function( text, buffer, dictionary, flag )
	{
		// Use the default dictionary if one wasn't provided
		dictionary = dictionary || this.dict;

		// Parse the dictionary if needed
		dictionary = this.dictionaries[dictionary] || this.parse_dict( dictionary );

		var memory = this.m,
		bufferlength = 1e3,
		i = 1,
		letter,
		separators = dictionary.separators,
		word,
		words = [],
		max_words,
		dictword,
		wordcount = 0;

		// In versions 5 and 8 we can get the actual buffer length
		if ( !this.version3 )
		{
			bufferlength = memory.getUint8( text + i++ ) + 2;
		}

		// Find the words, separated by the separators, but as well as the separators themselves
		while ( i < bufferlength )
		{
			letter = memory.getUint8( text + i );
			if ( letter === 0 )
			{
				break;
			}
			else if ( letter === 32 || separators.indexOf( letter ) >= 0 )
			{
				if ( letter !== 32 )
				{
					words.push( [ [letter], i ] );
				}
				word = null;
			}
			else
			{
				if ( !word )
				{
					words.push( [ [], i ] );
					word = words[ words.length - 1 ][0];
				}
				word.push( letter );
			}
			i++;
		}

		// Go through the text until we either have reached the max number of words, or we're out of words
		max_words = Math.min( words.length, memory.getUint8( buffer ) );
		while ( wordcount < max_words )
		{
			dictword = dictionary['' + this.encode( words[wordcount][0] )];

			// If the flag is set then don't overwrite words which weren't found
			if ( !flag || dictword )
			{
				// Fill out the buffer
				memory.setUint16( buffer + 2 + wordcount * 4, dictword || 0 );
				memory.setUint8( buffer + 4 + wordcount * 4, words[wordcount][0].length );
				memory.setUint8( buffer + 5 + wordcount * 4, words[wordcount][1] );
			}
			wordcount++;
		}

		// Update the number of found words
		memory.setUint8( buffer + 1, wordcount );
	},

	// Handle key input
	keyinput: function( data )
	{
		// Handle key codes first, then check the character table, or return a '?' if nothing is found
		return ZSCII_keyCodes[ data.keyCode ] || this.reverse_unicode_table[ data.charCode ] || 63;
	},

};
