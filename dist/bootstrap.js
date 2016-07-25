/*

ZVM bootstrap
=============

Copyright (c) 2013 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

/*

This module allows you to load a file and run a list of commands.
Once the list is complete, the VM is handed back to you, and you can do what you like with it.

*/

/*eslint one-var: "off" */

(function()
{

'use strict';

// Convert text into an array
function text_to_array( text, array )
{
	var i = 0, l;
	array = array || [];
	for ( l = text.length % 8; i < l; ++i )
	{
		array.push( text.charCodeAt( i ) );
	}
	for ( l = text.length; i < l; )
	{
		// Unfortunately unless text is cast to a String object there is no shortcut for charCodeAt,
		// and if text is cast to a String object, it's considerably slower.
		array.push( text.charCodeAt( i++ ), text.charCodeAt( i++ ), text.charCodeAt( i++ ), text.charCodeAt( i++ ),
			text.charCodeAt( i++ ), text.charCodeAt( i++ ), text.charCodeAt( i++ ), text.charCodeAt( i++ ) );
	}
	return array;
}

// A basic ZVM runner
function run( vm, walkthrough )
{
	var orders, order, code, i, l;
	walkthrough = walkthrough || [];

	vm.run();

	while ( true )
	{
		orders = vm.orders;
		i = 0;
		l = orders.length;

		// Process the orders
		while ( i < l )
		{
			order = orders[i++];
			code = order.code;

			// Text output
			// We don't do much, just add it to a string on the vm object
			if ( code === 'stream' )
			{
				// Skip status line updates
				if ( order.to === 'status' )
				{
					continue;
				}
				vm.log += order.text || '';
			}

			// Line input
			else if ( code === 'read' && walkthrough.length )
			{
				order.response = walkthrough.shift();
				vm.inputEvent( order ); // Calls run
			}

			else if ( code === 'find' )
			{
				continue;
			}

			// Return on anything else
			else
			{
				return;
			}
		}
	}
}

// A simple function to run a particular story, optionally with a list of commands
exports.zvm = function( path, walkthrough )
{
	var fs = require( 'fs' );
	var iconv = require( 'iconv-lite' );
	var ZVM = require( '../src/zvm/zvm.js' );

	var data = iconv.decode( fs.readFileSync( path ), 'latin1' );

	var vm = new ZVM();
	vm.inputEvent({
		code: 'load',
		data: text_to_array( data ),
	});
	vm.restart();
	vm.log = '';
	run( vm, walkthrough );
	return vm;
};

})();
