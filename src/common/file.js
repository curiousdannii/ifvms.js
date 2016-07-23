/*

File classes
===============================

Copyright (c) 2016 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

function str_to_Uint32( str, offset )
{
    return str.charCodeAt( offset ) << 24 | str.charCodeAt( offset + 1 ) << 16 | str.charCodeAt( offset + 2 ) << 8 | str.charCodeAt( offset + 3 );
}

function Uint32_to_str( num )
{
    return String.fromCharCode.call( null, ( num >> 24 ) & 0xFF, ( num >> 16 ) & 0xFF, ( num >> 8 ) & 0xFF, num & 0xFF );
}

// A basic IFF file, to be extended later
// Currently supports string data
module.exports.IFF = function( data )
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
            chunk_length = str_to_Uint32( data, i + 4 );

            if ( chunk_length < 0 || ( chunk_length + i ) > l )
            {
                throw new Error( 'IFF chunk out of range' );
            }

            this.chunks.push({
                type: data.substr( i, 4 ),
                offset: i,
                data: data.substr( i + 8, chunk_length)
            });

            i += 8 + chunk_length;
            if ( chunk_length % 2 )
            {
                i++;
            }
        }
    }
};

IFF.prototype.write = function()
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
        out += chunk.type + Uint32_to_str( data.length ) + data;
        if ( data.length % 2 )
        {
            out += '\0';
        }
    }

    // Add the header and return
    return 'FORM' + Uint32_to_str( out.length ) + out;
};
