/*

Common untility functions
=================================================

Copyright (c) 2013 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

// Utility to extend objects
module.exports.extend = function()
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
};

// Utilities for 16-bit signed arithmetic
module.exports.U2S16 = function( value )
{
	return value << 16 >> 16;
};
module.exports.S2U16 = function( value )
{
	return value & 0xFFFF;
};

// Utility to convert from byte arrays to word arrays
module.exports.byte_to_word = function( array )
{
	var i = 0, l = array.length,
	result = [];
	while ( i < l )
	{
		result[i / 2] = array[i++] << 8 | array[i++];
	}
	return result;
};

/*// Perform some micro optimisations
function optimise( code )
{
	return code

	// Sign conversions
	.replace( /(e\.)?U2S\(([^(]+?)\)/g, '(($2)<<16>>16)' )
	.replace( /(e\.)?S2U\(([^(]+?)\)/g, '(($2)&65535)' )

	// Bytearray
	.replace( /([\w.]+)\.getUint8\(([^(]+?)\)/g, '$1[$2]' )
	.replace( /([\w.]+)\.getUint16\(([^(]+?)\)/g, '($1[$2]<<8|$1[$2+1])' );
}
// Optimise some functions of an obj, compiling several at once
function optimise_obj( obj, funcnames )
{
	var funcname, funcparts, newfuncs = [];
	for ( funcname in obj )
	{
		if ( funcnames.indexOf( funcname ) >= 0 )
		{
			funcparts = /function\s*\(([^(]*)\)\s*\{([\s\S]+)\}/.exec( '' + obj[funcname] );
			if ( DEBUG )
			{
				newfuncs.push( funcname + ':function ' + funcname + '(' + funcparts[1] + '){' + optimise( funcparts[2] ) + '}' );
			}
			else
			{
				newfuncs.push( funcname + ':function(' + funcparts[1] + '){' + optimise( funcparts[2] ) + '}' );
			}
		}
	}
	extend( obj, eval( '({' + newfuncs.join() + '})' ) );
}*/

/*if ( DEBUG ) {

	// Debug flags
	var debugflags = {},
	get_debug_flags = function( data )
	{
		data = data.split( ',' );
		var i = 0;
		while ( i < data.length )
		{
			debugflags[data[i++]] = 1;
		}
	};
	if ( typeof parchment !== 'undefined' && parchment.options && parchment.options.debug )
	{
		get_debug_flags( parchment.options.debug );
	}

} // ENDDEBUG
*/
