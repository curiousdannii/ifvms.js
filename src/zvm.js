/*

ZVM - the ifvms.js Z-Machine (versions 3-5, 8)
==============================================

Copyright (c) 2018 The ifvms.js team
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/

/*

This file is the public API of ZVM, which is based on the API of Quixe:
https://github.com/erkyrath/quixe/wiki/Quixe-Without-GlkOte#quixes-api

ZVM willfully ignores the standard in these ways:
    Non-buffered output is not supported
    Saving tables is not supported (yet?)
    No interpreter number or version is set

Any other non-standard behaviour should be considered a bug

*/

'use strict';

const utils = require( './common/utils.js' )
const file = require( './common/file.js' )

const default_options = {
    stack_len: 100 * 1000,
    undo_len: 1000 * 1000,
}

// A clone function which ignores the properties we don't want to serialise
function clone( obj )
{
    const recurse = obj => typeof obj === 'object' ? clone( obj ) : obj
    const newobj = {}

    if ( Array.isArray( obj ) )
    {
        return obj.map( recurse )
    }

    for ( let prop in obj )
    {
        if ( prop !== 'buffer' && prop !== 'str' )
        {
            newobj[prop] = recurse( obj[prop] )
        }
    }
    return newobj
}

const api = {

    init: function()
    {
        // Create this here so that it won't be cleared on restart
        this.jit = {};

        // The Quixe API expects the start function to be named init
        this.init = this.start;
    },

    prepare: function( storydata, options )
    {
        // If we are not given a glk option then we cannot continue
        if ( !options.Glk )
        {
            throw new Error( 'A reference to Glk is required' );
        }
        this.Glk = options.Glk;
        this.data = storydata;
        this.options = Object.assign( {}, default_options, options )
    },

    start: async function()
    {
        // Identify the format and version number of the data file we were given
        const data = file.identify( this.data )
        delete this.data
        if ( !data || data.format !== 'ZCOD' )
        {
            throw new Error( 'This is not a Z-Code file' )
        }
        if ( [ 3, 4, 5, 8 ].indexOf( data.version ) < 0 )
        {
            throw new Error( 'Unsupported Z-Machine version: ' + data.version )
        }

        // Load the storyfile we are given into our MemoryView (an enhanced DataView)
        this.m = utils.MemoryView( data.data )

        // Make a seperate MemoryView for the ram, and store the original ram
        this.staticmem = this.m.getUint16( 0x0E )
        this.ram = utils.MemoryView( this.m, 0, this.staticmem )
        this.origram = this.m.getUint8Array( 0, this.staticmem )

        // Cache the game signature
        let signature = ''
        let i = 0
        while ( i < 0x1E )
        {
            signature += ( this.origram[i] < 0x10 ? '0' : '' ) + this.origram[i++].toString( 16 )
        }
        this.signature = signature

        // Handle loading and clearing autosaves
        let autorestored
        const Dialog = this.options.Dialog
        if ( Dialog )
        {
            if ( this.options.clear_vm_autosave )
            {
                Dialog.autosave_write( signature, null )
            }
            else if ( this.options.do_vm_autosave )
            {
                try
                {
                    const snapshot = Dialog.autosave_read( signature )
                    if ( snapshot )
                    {
                        await this.do_autorestore( snapshot )
                        autorestored = 1
                    }
                }
                catch (ex)
                {
                    this.log( 'Autorestore failed, deleting it' )
                    Dialog.autosave_write( signature, null )
                }
            }
        }

        // Initiate the engine, run, and wait for our first Glk event
        if ( !autorestored )
        {
            await this.restart()
            await this.run()
        }
    },

    do_autosave: async function( save )
    {
        if ( !this.options.Dialog )
        {
            throw new Error( 'A reference to Dialog is required' )
        }

        let snapshot = null
        if ( ( save || 0 ) >= 0 )
        {
            snapshot = {
                glk: await this.Glk.save_allstate(),
                io: clone( this.io ),
                ram: this.save_file( this.pc, 1 ),
                read_data: clone( this.read_data ),
                xorshift_seed: this.xorshift_seed,
            }
        }

        await this.options.Dialog.autosave_write( this.signature, snapshot )
    },

    get_signature: function()
    {
        return this.signature
    },

}

const VM = utils.Class.subClass( Object.assign(
    api,
    require( './zvm/runtime.js' ),
    require( './zvm/text.js' ),
    require( './zvm/io.js' ),
    require( './zvm/disassembler.js' )
) );

module.exports = VM;