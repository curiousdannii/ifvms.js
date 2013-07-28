/*

Z-Machine UI
============

Copyright (c) 2013 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

/*

Note: is used by both ZVM and Gnusto. In the case of Gnusto the engine is actually GnustoRunner.
	The engine must have a StructIO modified env
	
*/

var ZVMUI = (function(){

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
	0x2D6B  // Dark grey
];

// Convert a 15 bit colour to RGB
function convert_true_colour( colour )
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

return Class.subClass({

	colours: colours,
		
	init: function( engine, headerbit )
	{
		this.e = engine;
		this.buffer = '';
		
		// Use the requested formatter (or css by default)
		extend( this, this.formatters[engine.env.formatter] || this.formatters.css );
		
		if ( DEBUG )
		{
			this.reverse = 0;
			this.bold = 0;
			this.italic = 0;
			this.fg = undefined;
			this.bg = undefined;
		}
		// Bit 0 is for @set_style, bit 1 for the header, and bit 2 for @set_font
		this.mono = headerbit;
		
		// Set our initial colours, or assume black on white
		this.env = {
			fgcolour: engine.env.fgcolour || '#000',
			bgcolour: engine.env.bgcolour || '#fff'
		};
		
		// Upper window stuff
		this.currentwin = 0;
		this.status = []; // Status window orders
		
		// Construct the basic windows
		engine.orders.push(
			{
				code: 'stream',
				name: 'status'
			},
			{
				code: 'stream',
				name: 'main'
			},
			{
				code: 'find',
				name: 'main'
			}
		);
	},
	
	// Clear the lower window
	clear_window: function()
	{
		this.e.orders.push({
			code: 'clear',
			name: 'main',
			css: { 'background-color': this.bg }
		});
	},
	
	// Convert RGB to a true colour - RGB is a css colour code. Both rgb() and #000 formats are supported.
	convert_RGB: function( code )
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
	},

	erase_line: function( value )
	{
		if ( value === 1 )
		{
			this.flush();
			this.status.push( { code: "eraseline" } );
		}
	},
	
	erase_window: function( window )
	{
		this.flush();
		if ( window < 1 )
		{
			this.clear_window();
		}
		if ( window === -1 )
		{
			this.split_window( 0 );
		}
		if ( window === -2 || window === 1 )
		{
			this.status.push( { code: "clear" } );
		}
	},
	
	// Flush the buffer to the orders
	flush: function()
	{
		// If we have a buffer transfer it to the orders
		if ( this.buffer !== '' )
		{
			var order = {
				code: 'stream',
				text: this.buffer,
				props: {}
			};
			this.format( order.props );
			
			( this.currentwin ? this.status : this.e.orders ).push( order );
			this.buffer = '';
		}
	},
	
	get_cursor: function( array )
	{
		// act() will flush
		this.status.push({
			code: 'get_cursor',
			addr: array
		});
		this.e.act();
	},
	
	set_cursor: function( row, col )
	{
		this.flush();
		this.status.push({
			code: 'cursor',
			to: [row - 1, col - 1]
		});
	},
	
	set_font: function( font )
	{
		// We only support fonts 1 and 4
		if ( font !== 1 && font !== 4 )
		{
			return 0;
		}
		var returnval = this.mono & 0x04 ? 4 : 1;
		if ( font !== returnval )
		{
			this.flush();
			this.mono ^= 0x04;
		}
		return returnval;
	},
			
	// Set styles
	set_style: function( stylebyte )
	{
		this.flush();
		
		// Setting the style to Roman will clear the others
		if ( stylebyte === 0 )
		{
			this.reverse = this.bold = this.italic = 0;
			this.mono &= 0xFE;
		}
		if ( stylebyte & 0x01 )
		{
			this.reverse = 1;
		}
		if ( stylebyte & 0x02 )
		{
			this.bold = 1;
		}
		if ( stylebyte & 0x04 )
		{
			this.italic = 1;
		}
		if ( stylebyte & 0x08 )
		{
			this.mono |= 0x01;
		}
	},
	
	// Set true colours
	set_true_colour: function( foreground, background )
	{
		this.flush();
		
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
		}
	},
	
	set_window: function( window )
	{
		this.flush();
		this.currentwin = window;
		this.e.orders.push({
			code: 'find',
			name: window ? 'status' : 'main'
		});
		if ( window )
		{
			this.status.push({
				code: 'cursor',
				to: [0, 0]
			});
		}
	},
	
	split_window: function( lines )
	{
		this.flush();
		this.status.push({
			code: "height",
			lines: lines
		});
	},
	
	// Formatters allow you to change how styles are marked.
	// By default CSS and classes are supported. Others may be added by the user
	// The desired formatter should be passed in through env
	formatters: {
		css: {
			format: function( props )
			{
				props.css = {};
				if ( this.bold )
				{
					props.css['font-weight'] = 'bold';
				}
				if ( this.italic )
				{
					props.css['font-style'] = 'italic';
				}
				if ( this.mono )
				{
					props.node = 'tt';
				}
				if ( typeof this.fg !== 'undefined' )
				{
					props.css.color = this.fg;
				}
				if ( typeof this.bg !== 'undefined' )
				{
					props.css['background-color'] = this.bg;
				}
				if ( this.reverse )
				{
					var temp = props.css.color;
					props.css.color = props.css['background-color'] || this.env.bgcolour;
					props.css['background-color'] = temp || this.env.fgcolour;
				}
			},
			
			set_colour: function( foreground, background )
			{
				this.set_true_colour( colours[foreground], colours[background] );
			}
		},
		
		classes: {
			format: function( props )
			{
				var temp,
				classes = [],
				fg = this.fg,
				bg = this.bg;
				
				props.css = {};
				if ( this.bold )
				{
					classes.push( 'zvm-bold' );
				}
				if ( this.italic )
				{
					classes.push( 'zvm-italic' );
				}
				if ( this.mono )
				{
					classes.push( 'zvm-mono' );
				}
				if ( this.reverse )
				{
					temp = fg;
					fg = bg || this.env.bgcolour;
					bg = temp || this.env.fgcolour;
				}
				if ( typeof fg !== 'undefined' )
				{
					if ( isNaN( fg ) )
					{
						props.css.color = fg;
					}
					else
					{
						classes.push( 'zvm-fg-' + fg );
					}
				}
				if ( typeof bg !== 'undefined' )
				{
					if ( isNaN( bg ) )
					{
						props.css['background-color'] = bg;
					}
					else
					{
						classes.push( 'zvm-bg-' + bg );
					}
				}
				props['class'] = classes.join( ' ' );
			},
			
			set_colour: function( foreground, background )
			{
				this.flush();
				if ( foreground === 1 )
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
				}
			}
		}
	}
});

})();