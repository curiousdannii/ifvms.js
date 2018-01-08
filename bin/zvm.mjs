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
import readline from 'readline'

import { DialogTerm, Glk as AsyncGlk } from '../src/asyncglk/'
import GlkOte from 'glkote-term'
import MuteStream from 'mute-stream'
import yargs from 'yargs'

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

// Readline options
const stdin = process.stdin
const stdout = new MuteStream()
stdout.pipe( process.stdout )
const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    prompt: '',
})
const rl_opts = {
    rl: rl,
    stdin: stdin,
    stdout: stdout,
}

const vm = new ZVM()
const Glk = new AsyncGlk()

const options = {
    vm,
    Dialog: new DialogTerm( rl_opts ),
    Glk,
    GlkOte: new GlkOte( rl_opts ),
}

vm.prepare( fs.readFileSync( storyfile ), options )

// This will call vm.init()
Glk.init( options )