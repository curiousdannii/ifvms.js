/*

Z-Machine IO
============

Copyright (c) 2016 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

'use strict';

/*

TODO:

 - style and colour support
 - pre-existing line input
 - timed input
 - mouse input
 - text grid quote boxes

*/

var utils = require( '../common/utils.js' ),
U2S = utils.U2S16,
//S2U = utils.S2U16,

// Glulx key codes accepted by the Z-Machine
ZSCII_keyCodes = (function()
{
	var codes = {
		0xfffffff9: 8, // delete/backspace
		0xfffffffa: 13, // enter
		0xfffffff8: 27, // escape
		0xfffffffc: 129, // up
		0xfffffffb: 130, // down
		0xfffffffe: 131, // left
		0xfffffffd: 132, // right
		0xfffffff3: 146, // End / key pad 1
		0xfffffff5: 148, // PgDn / key pad 3
		0xfffffff4: 152, // Home / key pad 7
		0xfffffff6: 154, // PgUp / key pad 9
	},
	i = 0;
	while ( i < 12 )
	{
		codes[ 0xffffffef - i ] = 133 + i++; // function keys
	}
	return codes;
})(),

/*

Try to support as many of the Z-Machine's formatting combinations as possible.
There are not enough styles to support them all, so sometimes bold formatting misses out.
This spreadsheet shows how the Z-Machine formatting is mapped to Glk styles

http://docs.google.com/spreadsheets/d/1Nvwyb_twC3_fPYDrjQu86b3KRAmLFDllIUvPUpMz108

The index bits are (lowest to highest): mono, italic, bold, reverse

We use the default GlkOte styles as much as possible, but for full support zvm.css must also be used

*/
style_mappings = [
	// main window
	[ 0, 2, 1, 7, 4, 7, 5, 7, 9, 10, 6, 3, 6, 3, 6, 3 ],
	// status window
	[ 0, 0, 1, 1, 4, 4, 5, 5, 9, 9, 6, 6, 3, 3, 7, 7 ],
];

module.exports = {

	init_io: function()
	{
		this.io = {
			reverse: 0,
			bold: 0,
			italic: 0,
			
			// A variable for whether we are outputing in a monospaced font. If non-zero then we are
			// Bit 0 is for @set_style, bit 1 for the header, and bit 2 for @set_font
			mono: this.m.getUint8( 0x11 ) & 0x02,

			// A variable for checking whether the transcript bit has been changed
			transcript: this.m.getUint8( 0x11 ) & 0x01,

			streams: [ 1, 0, [], 0 ],

			currentwin: 0,
			
			width: 0,
			height: 0,
			row: 0,
			col: 0,
		};

		//this.process_colours();

		// Construct the windows if they do not already exist
		if ( !this.mainwin )
		{
			this.mainwin = this.Glk.glk_window_open( 0, 0, 0, 3, 201 );
			if ( this.version3 )
			{
				this.statuswin = this.Glk.glk_window_open( this.mainwin, 0x12, 1, 4, 202 );
			}
		}
		this.set_window( 0 );
	},

	erase_line: function( value )
	{
		if ( value === 1 )
		{
			var io = this.io,
			row = io.row,
			col = io.col;
			this._print( Array( io.width - io.col + 1 ).join( ' ' ) );
			this.set_cursor( row, col );
		}
	},

	erase_window: function( window )
	{
		if ( window < 1 )
		{
			this.Glk.glk_window_clear( this.mainwin );
		}
		if ( window === 1 || window === -2 )
		{
			if ( this.upperwin )
			{
				this.Glk.glk_window_clear( this.upperwin );
				this.set_cursor( 0, 0 );
			}
		}
		if ( window === -1 )
		{
			this.split_window( 0 );
		}
	},

	fileref_create_by_prompt: function( data )
	{
		this.fileref_data = data;
		this.glk_block_call = 'fileref_create_by_prompt';
		this.Glk.glk_fileref_create_by_prompt( data.usage, data.mode, data.rock || 0 );
	},

	format: function()
	{
		this.Glk.glk_set_style( style_mappings[ this.io.currentwin ][ !!this.io.mono | this.io.italic | this.io.bold | this.io.reverse ] );
	},

	get_cursor: function( array )
	{
		this.ram.setUint16( array, this.io.row + 1 );
		this.ram.setUint16( array + 2, this.io.col + 1 );
	},

	// Handle char input
	handle_char_input: function( charcode )
	{
		this.variable( this.read_data.storer, ZSCII_keyCodes[ charcode ] || this.reverse_unicode_table[ charcode ] || 63 );
	},

	// Handle the result of glk_fileref_create_by_prompt()
	handle_create_fileref: function( fref )
	{
		var Glk = this.Glk,
		data = this.fileref_data,
		str;

		if ( fref )
		{
			if ( data.unicode )
			{
				str = Glk.glk_stream_open_file_uni( fref, data.mode, data.rock || 0 );
			}
			else
			{
				str = Glk.glk_stream_open_file( fref, data.mode, data.rock || 0 );
			}
			Glk.glk_fileref_destroy( fref );
		}
		if ( data.func === 'restore' || data.func === 'save' )
		{
			this.save_restore_handler( str );
		}
		if ( data.func === 'output_stream' )
		{
			this.output_stream_handler( str );
		}
	},

	// Handle line input
	handle_line_input: function( len, terminator )
	{
		var ram = this.ram,
		options = this.read_data,
		
		// Convert the response back to a string, cut to len, convert to lower case, and then to a ZSCII array
		command = String.fromCharCode.apply( null, options.buffer ),
		response = this.text_to_zscii( command.slice( 0, len ).toLowerCase() );
		
		// 7.1.1.1: The response must be echoed, Glk will handle this
		
		// But we do have to echo to the transcript
		if ( this.io.streams[1] )
		{
			this.Glk.glk_put_jstring_stream( this.io.streams[1], command + '\n' );
		}
		if ( this.io.streams[3] )
		{
			this.Glk.glk_put_jstring_stream( this.io.streams[3], command + '\n' );
		}

		// Store the response
		if ( this.version3 )
		{
			// Append zero terminator
			response.push( 0 );

			// Store the response in the buffer
			ram.setUint8Array( options.bufaddr + 1, response );
		}
		else
		{
			// Store the response length
			ram.setUint8( options.bufaddr + 1, len );

			// Store the response in the buffer
			ram.setUint8Array( options.bufaddr + 2, response );

			// Store the terminator
			this.variable( options.storer, isNaN( terminator ) ? 13 : terminator );
		}

		if ( options.parseaddr )
		{
			// Tokenise the response
			this.tokenise( options.bufaddr, options.parseaddr );
		}
	},

	// Manage output streams
	output_stream: function( stream, addr_text )
	{
		var ram = this.ram,
		io = this.io,
		data, text;
		stream = U2S( stream );

		if ( stream === 1 )
		{
			io.streams[0] = 1;
		}
		if ( stream === -1 )
		{
			io.streams[0] = 0;
		}
		if ( stream === 2 )
		{
			this.fileref_create_by_prompt({
				func: 'output_stream',
				mode: 0x05,
				rock: 210,
				str: 2,
				text: addr_text,
				unicode: 1,
				usage: 0x102,
			});
			this.stop = 1;
		}
		if ( stream === -2 )
		{
			ram.setUint8( 0x11, ( ram.getUint8( 0x11 ) & 0xFE ) );
			if ( io.streams[1] )
			{
				this.Glk.glk_stream_close( io.streams[1] );
			}
			io.streams[1] = io.transcript = 0;
			if ( addr_text )
			{
				this._print( addr_text );
			}
		}
		if ( stream === 3 )
		{
			io.streams[2].unshift( [ addr_text, '' ] );
		}
		if ( stream === -3 )
		{
			data = io.streams[2].shift();
			text = this.text_to_zscii( data[1] );
			ram.setUint16( data[0], text.length );
			ram.setUint8Array( data[0] + 2, text );
		}
		if ( stream === 4 )
		{
			this.fileref_create_by_prompt({
				func: 'output_stream',
				mode: 0x05,
				rock: 211,
				str: 4,
				unicode: 1,
				usage: 0x103,
			});
			this.stop = 1;
		}
		if ( stream === -4 )
		{
			if ( io.streams[3] )
			{
				this.Glk.glk_stream_close( io.streams[3] );
			}
			io.streams[3] = 0;
		}
	},
	
	output_stream_handler: function( str )
	{
		var ram = this.ram,
		io = this.io,
		data = this.fileref_data;

		if ( data.str === 2 )
		{
			ram.setUint8( 0x11, ( ram.getUint8( 0x11 ) & 0xFE ) | ( str ? 1 : 0 ) );
			if ( str )
			{
				io.streams[1] = str;
				io.transcript = 1;
			}
			else
			{
				io.streams[1] = io.transcript = 0;
			}
			if ( data.text )
			{
				this._print( data.text );
			}
		}

		if ( data.str === 4 )
		{
			if ( str )
			{
				io.streams[3] = str;
			}
			else
			{
				io.streams[3] = 0;
			}
		}
	},

	// Print text!
	_print: function( text )
	{
		var Glk = this.Glk,
		io = this.io,
		i = 0;
		
		// Stream 3 gets the text first
		if ( io.streams[2].length )
		{
			io.streams[2][0][1] += text;
		}
		else
		{
			// Convert CR into LF
			text = text.replace( /\r/g, '\n' );
			
			// Check the transcript bit
			// Because it might need to prompt for a file name, we return here, and will print again in the handler
			if ( ( this.m.getUint8( 0x11 ) & 0x01 ) !== io.transcript )
			{
				return this.output_stream( io.transcript ? -2 : 2, text );
			}
			
			// Check if the monospace font bit has changed
			// Unfortunately, even now Inform changes this bit for the font statement, even though the 1.1 standard depreciated it :(
			if ( ( this.m.getUint8( 0x11 ) & 0x02 ) !== ( io.mono & 0x02 ) )
			{
				io.mono ^= 0x02;
				this.format();
			}
			
			// For the upper window we print each character individually so that we can track the cursor position
			if ( io.currentwin )
			{
				// Don't automatically increase the size of the window
				// If we confirm that games do need this then we can implement it later
				while ( i < text.length && io.row < io.height )
				{
					Glk.glk_put_jstring( text[i++] );
					io.col++;
					if ( io.col === io.width )
					{
						io.col = 0;
						io.row++;
					}
				}
			}
			else
			{
				if ( io.streams[0]  )
				{
					Glk.glk_put_jstring( text );
				}
				// Transcript
				if ( io.streams[1]  )
				{
					Glk.glk_put_jstring_stream( io.streams[1], text );
				}
			}
		}
	},

	// Print many things
	print: function( type, val )
	{
		var proptable, result;
		
		// Number
		if ( type === 0 )
		{
			result = val;
		}
		// Unicode
		if ( type === 1 )
		{
			result = String.fromCharCode( val );
		}
		// Text from address
		if ( type === 2 )
		{
			result = this.jit[ val ] || this.decode( val );
		}
		// Object
		if ( type === 3 )
		{
			proptable = this.m.getUint16( this.objects + ( this.version3 ? 9 : 14 ) * val + ( this.version3 ? 7 : 12 ) );
			result = this.decode( proptable + 1, this.m.getUint8( proptable ) * 2 );
		}
		// ZSCII
		if ( type === 4 )
		{
			if ( !this.unicode_table[ val ] )
			{
				return;
			}
			result = this.unicode_table[ val ];
		}
		this._print( '' + result );
	},

	print_table: function( zscii, width, height, skip )
	{
		height = height || 1;
		skip = skip || 0;
		var i = 0;
		while ( i++ < height )
		{
			this._print( this.zscii_to_text( this.m.getUint8Array( zscii, width ) ) + ( i < height ? '\r' : '' ) );
			zscii += width + skip;
		}
	},

	// Process CSS default colours
	process_colours: function()
	{
		// Convert RGB to a Z-Machine true colour
		// RGB is a css colour code. rgb(), #000000 and #000 formats are supported.
		/*function convert_RGB( code )
		{
			var round = Math.round,
			data = /(\d+),\s*(\d+),\s*(\d+)|#(\w{1,2})(\w{1,2})(\w{1,2})/.exec( code ),
			result;

			// Nice rgb() code
			if ( data[1] )
			{
				result =  [ data[1], data[2], data[3] ];
			}
			else
			{
				// Messy CSS colour code
				result = [ parseInt( data[4], 16 ), parseInt( data[5], 16 ), parseInt( data[6], 16 ) ];
				// Stretch out compact #000 codes to their full size
				if ( code.length === 4 )
				{
					result = [ result[0] << 4 | result[0], result[1] << 4 | result[1], result[2] << 4 | result[2] ];
				}
			}

			// Convert to a 15bit colour
			return round( result[2] / 8.226 ) << 10 | round( result[1] / 8.226 ) << 5 | round( result[0] / 8.226 );
		}

		// Standard colours
		var colours = [
			0xFFFE, // Current
			0xFFFF, // Default
			0x0000, // Black
			0x001D, // Red
			0x0340, // Green
			0x03BD, // Yellow
			0x59A0, // Blue
			0x7C1F, // Magenta
			0x77A0, // Cyan
			0x7FFF, // White
			0x5AD6, // Light grey
			0x4631, // Medium grey
			0x2D6B,	 // Dark grey
		],

		// Start with CSS colours provided by the runner
		fg_css = this.e.env.fgcolour,
		bg_css = this.e.env.bgcolour,
		// Convert to true colour for storing in the header
		fg_true = fg_css ? convert_RGB( fg_css ) : 0xFFFF,
		bg_true = bg_css ? convert_RGB( bg_css ) : 0xFFFF,
		// Search the list of standard colours
		fg = colours.indexOf( fg_true ),
		bg = colours.indexOf( bg_true );
		// ZVMUI must have colours for reversing text, even if we don't write them to the header
		// So use the given colours or assume black on white
		if ( fg < 2 )
		{
			fg = fg_css || 2;
		}
		if ( bg < 2 )
		{
			bg = bg_css || 9;
		}

		this.env = {
			fg: fg,
			bg: bg,
			fg_true: fg_true,
			bg_true: bg_true,
		};*/
	},

	// Request line input
	read: function( storer, text, parse, time, routine )
	{
		var len = this.m.getUint8( text ),
		initiallen = 0,
		buffer;

		if ( this.version3 )
		{
			len++;
			this.v3_status();
		}
		else
		{
			//initiallen = this.m.getUint8( text + 1 );
		}

		buffer =  Array( len );
		this.read_data = {
			buffer: buffer,
			bufaddr: text, // text-buffer
			parseaddr: parse, // parse-buffer
			routine: routine,
			storer: storer,
			time: time,
		};
		
		// TODO: pre-existing input
		this.Glk.glk_request_line_event_uni( this.mainwin, buffer, initiallen );
	},

	// Request character input
	read_char: function( storer, one, time, routine )
	{
		this.read_data = {
			routine: routine,
			storer: storer,
			time: time,
		};
		this.Glk.glk_request_char_event_uni( this.mainwin );
	},

	set_colour: function( /*foreground, background*/ )
	{
		/*if ( foreground === 1 )
		{
			this.fg = undefined;
		}
		if ( foreground > 1 && foreground < 13 )
		{
			this.fg = foreground;
		}
		if ( background === 1 )
		{
			this.bg = undefined;
		}
		if ( background > 1 && background < 13 )
		{
			this.bg = background;
		}*/
	},

	// Note that row and col must be decremented in JIT code
	set_cursor: function( row, col )
	{
		var io = this.io;
		if ( this.upperwin && row >= 0 && row < io.height && col >= 0 && col < io.width )
		{
			this.Glk.glk_window_move_cursor( this.upperwin, col, row );
			io.row = row;
			io.col = col;
		}
	},

	set_font: function( font )
	{
		// We only support fonts 1 and 4
		if ( font !== 1 && font !== 4 )
		{
			return 0;
		}
		var returnval = this.io.mono & 0x04 ? 4 : 1;
		if ( font !== returnval )
		{
			this.io.mono ^= 0x04;
			this.format();
		}
		return returnval;
	},

	// Set styles
	set_style: function( stylebyte )
	{
		var io = this.io;

		// Setting the style to Roman will clear the others
		if ( stylebyte === 0 )
		{
			io.reverse = io.bold = io.italic = 0;
			io.mono &= 0xFE;
		}
		if ( stylebyte & 0x01 )
		{
			io.reverse = 0x08;
		}
		if ( stylebyte & 0x02 )
		{
			io.bold = 0x04;
		}
		if ( stylebyte & 0x04 )
		{
			io.italic = 0x02;
		}
		if ( stylebyte & 0x08 )
		{
			io.mono |= 0x01;
		}
		this.format();
	},

	// Set true colours
	set_true_colour: function( /*foreground, background*/ )
	{
		// Convert a 15 bit colour to RGB
		/*function convert_true_colour( colour )
		{
			// Stretch the five bits per colour out to 8 bits
			var newcolour = Math.round( ( colour & 0x1F ) * 8.226 ) << 16
				| Math.round( ( ( colour & 0x03E0 ) >> 5 ) * 8.226 ) << 8
				| Math.round( ( ( colour & 0x7C00 ) >> 10 ) * 8.226 );
			newcolour = newcolour.toString( 16 );
			// Ensure the colour is 6 bytes long
			while ( newcolour.length < 6 )
			{
				newcolour = '0' + newcolour;
			}
			return '#' + newcolour;
		}

		if ( foreground === 0xFFFF )
		{
			this.fg = undefined;
		}
		else if ( foreground < 0x8000 )
		{
			this.fg = convert_true_colour( foreground );
		}

		if ( background === 0xFFFF )
		{
			this.bg = undefined;
		}
		else if ( background < 0x8000 )
		{
			this.bg = convert_true_colour( background );
		}*/
	},

	set_window: function( window )
	{
		this.Glk.glk_set_window( this.upperwin && window ? this.upperwin : this.mainwin );
		this.io.currentwin = window;
		this.format();
		
		// Focusing the upper window resets the cursor to the top left
		if ( window )
		{
			this.set_cursor( 0, 0 );
		}
	},

	split_window: function( lines )
	{
		var Glk = this.Glk;
		if ( lines === 0 && this.upperwin )
		{
			Glk.glk_window_close( this.upperwin );
			this.upperwin = null;
		}
		else if ( !this.upperwin )
		{
			this.upperwin = Glk.glk_window_open( this.mainwin, 0x12, lines, 4, 203 );
		}
		if ( lines && this.upperwin )
		{
			Glk.glk_window_set_arrangement( Glk.glk_window_get_parent( this.upperwin ), 0x12, lines, null );
			this.io.height = lines;
			if ( this.io.row >= lines )
			{
				this.set_cursor( 0, 0 );
			}

			// 8.6.1.1.2: In version three the upper window is always cleared
			if ( this.version3 )
			{
				Glk.glk_window_clear( this.upperwin );
			}
		}
	},

	// Update the header after restarting or restoring
	update_header: function()
	{
		var ram = this.ram;

		// Reset the Xorshift seed
		this.xorshift_seed = 0;

		// Update the width - in version 3 does not actually set the header variables
		this.update_width();

		// For version 3 we only set Flags 1
		if ( this.version3 )
		{
			return ram.setUint8( 0x01,
				( ram.getUint8( 0x01 ) & 0x8F ) // Keep all except bits 4-6
				| ( this.statuswin ? 0 : 0x10 ) // Status win not available
				| ( this.statuswin ? 0x20 : 0 ) // Upper win is available
				| 0x40 // Variable pitch font is default - Or can we tell from env if the font is fixed pitch?
			);
		}
		
		// Flags 1
		ram.setUint8( 0x01,
			0x00 // Colour is not supported yet
			| 0x1C // Bold, italic and mono are supported
			| 0x00 // Timed input not supported yet
		);
		
		// Flags 2: Clear bits 3, 5, 7: no character graphics, mouse or sound effects
		// This is really a word, but we only care about the lower byte
		ram.setUint8( 0x11, ram.getUint8( 0x11 ) & 0x57 );
		
		// Screen settings
		ram.setUint8( 0x20, 255 ); // Infinite height
		ram.setUint16( 0x24, 255 );
		ram.setUint16( 0x26, 0x0101 ); // Font height/width in "units"
		
		// Colours
		//ram.setUint8( 0x2C, isNaN( this.env.bg ) ? 1 : this.env.bg );
		//ram.setUint8( 0x2D, isNaN( this.env.fg ) ? 1 : this.env.fg );
		//this.extension_table( 5, this.env.fg_true );
		//this.extension_table( 6, this.env.bg_true );
		
		// Z Machine Spec revision
		ram.setUint16( 0x32, 0x0102 );
		
		// Clear flags three, we don't support any of that stuff
		this.extension_table( 4, 0 );
	},

	update_width: function()
	{
		var Glk = this.Glk,
		tempwin = Glk.glk_window_open( this.mainwin, 0x12, 0, 4, 204 ),
		box = new Glk.RefBox(),
		width;
		Glk.glk_window_get_size( tempwin || this.mainwin, box );
		if ( tempwin )
		{
			Glk.glk_window_close( tempwin );
		}
		this.io.width = width = box.get_value();
		if ( !this.version3 )
		{
			this.ram.setUint8( 0x21, width );
			this.ram.setUint16( 0x22, width );
		}
		if ( this.io.col >= width )
		{
			this.io.col = width - 1;
		}
	},
	
	// Output the version 3 status line
	v3_status: function()
	{
		if ( !this.statuswin )
		{
			return;
		}

		var Glk = this.Glk,
		memory = this.m,
		io = this.io,
		width = io.width,
		hours_score = memory.getUint16( this.globals + 2 ),
		mins_turns = memory.getUint16( this.globals + 4 ),
		proptable = memory.getUint16( this.objects + 9 * memory.getUint16( this.globals ) + 7 ),
		shortname = '' + this.decode( proptable + 1, memory.getUint8( proptable ) * 2 ),
		rhs;

		// Handle the turns/score or time
		if ( memory.getUint8( 0x01 ) & 0x02 )
		{
			rhs = 'Time: ' + ( hours_score % 12 === 0 ? 12 : hours_score % 12 ) + ':' + ( mins_turns < 10 ? '0' : '' ) + mins_turns + ' ' + ( hours_score > 11 ? 'PM' : 'AM' );
		}
		else
		{
			rhs = 'Score: ' + hours_score + '  Turns: ' + mins_turns;
		}

		// Print a blank line in reverse
		Glk.glk_set_window( this.statuswin );
		Glk.glk_window_move_cursor( this.statuswin, 0, 0 );
		Glk.glk_set_style( style_mappings[1][ 0x08 ] );
		Glk.glk_put_jstring( Array( width + 1 ).join( ' ' ) );

		// Trim the shortname if necessary
		Glk.glk_window_move_cursor( this.statuswin, 0, 0 );
		Glk.glk_put_jstring( ' ' + shortname.slice( 0, width - rhs.length - 4 ) );

		// Print the right hand side
		Glk.glk_window_move_cursor( this.statuswin, width - rhs.length - 1, 0 );
		Glk.glk_put_jstring( rhs );

		// Return to the former window
		Glk.glk_set_style( 0 );
		Glk.glk_set_window( this.upperwin && io.currentwin ? this.upperwin : this.mainwin );
	},

};
