#!/usr/bin/env node

// Run a ZVM instance

'use strict';

var fs = require( 'fs' );
var yargs = require( 'yargs' );

var GlkOte = require( 'glkote-term' );

var argv = yargs
	.usage( 'Usage: zvm <file> [options]' )
	.demand( 1, 1, 'Error: one file path must be provided' )
	.options({
		'b': {
			alias: 'bundled',
			describe: 'Use the bundled version of the VM',
			type: 'boolean',
		},
	})
	.alias( 'h', 'help' )
	.alias( 'v', 'version' )
	.argv;

// Check we have a valid file
var storyfile = argv._[0];
if ( !fs.existsSync( storyfile ) )
{
	console.error( `Error: "${ storyfile }" does not exist` );
	process.exitCode = 1;
	return;
}

// Use the bundled (and minified) VM if requested
var ZVM = require( argv.b ? '../dist/zvm.min.js' : '../src/zvm.js' );

var vm = new ZVM();
var Glk = GlkOte.Glk;

var options = {
	vm: vm,
	Dialog: new GlkOte.Dialog(),
	Glk: Glk,
	GlkOte: new GlkOte(),
};

vm.prepare( fs.readFileSync( storyfile ), options );

// This will call vm.init()
Glk.init( options );
