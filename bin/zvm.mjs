#!/usr/bin/env node

/*

ZVM - the ifvms.js Z-Machine (versions 3-5, 8)
==============================================

Copyright (c) 2018 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/

// Run a ZVM instance

import fs from 'fs'
import process from 'process'
import yargs from 'yargs'

import AsyncGlkProxy from '../src/asyncglk/src/asyncglk/asyncglkproxy.mjs'
import GlkOte from 'glkote-term'

const argv = yargs
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
    .argv

// Check we have a valid file
const storyfile = argv._[0]
if ( !fs.existsSync( storyfile ) )
{
    console.error( `Error: "${ storyfile }" does not exist` )
    process.exitCode = 1
    process.exit()
}

// Use the bundled (and minified) VM if requested
import SourceZVM from '../src/zvm.js'
import BundledZVM from '../dist/zvm.min.js'
const ZVM = argv.b ? BundledZVM : SourceZVM

const vm = new ZVM()
const Glk = new AsyncGlkProxy( GlkOte.Glk )

const options = {
    vm: vm,
    Dialog: new GlkOte.Dialog(),
    Glk: Glk,
    GlkOte: new GlkOte(),
}

vm.prepare( fs.readFileSync( storyfile ), options )

// This will call vm.init()
Glk.init( options )
