/*

File classes
============

Copyright (c) 2016 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

function string_to_Uint32( str, offset )
{
	return str.charCodeAt( offset ) << 24 | str.charCodeAt( offset + 1 ) << 16 | str.charCodeAt( offset + 2 ) << 8 | str.charCodeAt( offset + 3 );
}

function Uint32_to_string( num )
{
	return String.fromCharCode.call( null, ( num >> 24 ) & 0xFF, ( num >> 16 ) & 0xFF, ( num >> 8 ) & 0xFF, num & 0xFF );
}

var utils = require( './utils.js' ),
Class = utils.Class,

// A basic IFF file, to be extended later
// Currently supports string data
IFF = Class.subClass({
	init: function( data )
	{
		this.type = '';
		this.chunks = [];
		if ( data )
		{
			// Check that it is actually an IFF file
			if ( data.substr( 0, 4 ) !== 'FORM' )
			{
				throw new Error( 'Not an IFF file' );
			}

			// Parse the file
			this.type = data.substr( 8, 4 );

			var i = 12, l = data.length, chunk_length;
			while ( i < l )
			{
				chunk_length = string_to_Uint32( data, i + 4 );

				if ( chunk_length < 0 || ( chunk_length + i ) > l )
				{
					throw new Error( 'IFF chunk out of range' );
				}

				this.chunks.push({
					type: data.substr( i, 4 ),
					offset: i,
					data: data.substr( i + 8, chunk_length ),
				});

				i += 8 + chunk_length;
				if ( chunk_length % 2 )
				{
					i++;
				}
			}
		}
	},

	write: function()
	{
		// Start with the IFF type
		var out = this.type,
		i = 0, l = this.chunks.length,
		chunk, data;

		// Go through the chunks and write them out
		while ( i < l )
		{
			chunk = this.chunks[i++];
			data = chunk.data;
			out += chunk.type + Uint32_to_string( data.length ) + data;
			if ( data.length % 2 )
			{
				out += '\0';
			}
		}

		// Add the header and return
		return 'FORM' + Uint32_to_string( out.length ) + out;
	},
}),

Quetzal = IFF.subClass({
	// Parse a Quetzal savefile, or make a blank one
	init: function( data )
	{
		this.super.init.call( data );
		if ( data )
		{
			// Check this is a Quetzal savefile
			if ( this.type !== 'IFZS' )
			{
				throw new Error( 'Not a Quetzal savefile' );
			}

			// Go through the chunks and extract the useful ones
			var i = 0, l = this.chunks.length, type, chunk_data;
			while ( i < l )
			{
				type = this.chunks[i].type;
				chunk_data = this.chunks[i++].data;

				// Memory and stack chunks. Overwrites existing data if more than one of each is present!
				if ( type === 'CMem' || type === 'UMem' )
				{
					this.memory = data;
					this.compressed = ( type === 'CMem' );
				}
				else if ( type === 'Stks' )
				{
					this.stacks = data;
				}

				// Story file data
				else if ( type === 'IFhd' )
				{
					this.release = chunk_data.slice( 0, 2 );
					this.serial = chunk_data.slice( 2, 8 );
					// The checksum isn't used, but if we throw it away we can't round-trip
					this.checksum = chunk_data.slice( 8, 10 );
					this.pc = chunk_data[10] << 16 | chunk_data[11] << 8 | chunk_data[12];
				}
			}
		}
	},

	// Write out a savefile
	write: function()
	{
		// Reset the IFF type
		this.type = 'IFZS';

		// Format the IFhd chunk correctly
		var pc = this.pc,
		ifhd = this.release.concat(
			this.serial,
			this.checksum,
			( pc >> 16 ) & 0xFF, ( pc >> 8 ) & 0xFF, pc & 0xFF
		);

		// Add the chunks
		this.chunks = [
			{ type: 'IFhd', data: ifhd },
			{ type: ( this.compressed ? 'CMem' : 'UMem' ), data: this.memory },
			{ type: 'Stks', data: this.stacks },
		];

		// Return the byte array
		return this.super.write.call( this );
	},
});

module.exports = {
	IFF: IFF,
	Quetzal: Quetzal,
};
