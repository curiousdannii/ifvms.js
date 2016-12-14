#!/usr/bin/env node

// Run a ZVM instance

'use strict';

var fs = require( 'fs' );
var GlkOte = require( 'glkote-term' );
var ZVM = require( '../src/zvm.js' );

var vm = new ZVM();
var Glk = GlkOte.Glk;

var options = {
	vm: vm,
	Glk: Glk,
	GlkOte: new GlkOte(),
};

vm.prepare( fs.readFileSync( process.argv[2] ), options );

// This will call vm.init()
Glk.init( options );
