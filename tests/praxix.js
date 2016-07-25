#!/usr/bin/env node

// Run the Praxix test suite

console.log( 'Running the Praxix test suite: ' );
var bootstrap = require( '../dist/bootstrap.js' );
var vm = bootstrap.zvm( './praxix.z5', ['all'] );
var result = vm.log;

if ( /All tests passed/.test( result ) )
{
	console.log.ok( 'All tests passed!\n' );
}
else
{
	var errormsg = /\d+ tests failed overall:[^$\r]+/.exec( result );
	console.log( errormsg ? errormsg[0] : 'Praxix did not run successfully' );
	process.exit( 1 );
}
