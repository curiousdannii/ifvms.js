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

'use strict';

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
	var ZVM = require( '../src/zvm.js' );

	var data = fs.readFileSync( path );

	var vm = new ZVM();
	vm.inputEvent({
		code: 'load',
		data: data,
	});
	vm.restart();
	vm.log = '';
	run( vm, walkthrough );
	return vm;
};
