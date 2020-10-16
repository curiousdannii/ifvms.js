/*

Z-Machine IO
============

Copyright (c) 2020 The ifvms.js team
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/

/*

TODO:

 - pre-existing line input
 - timed input
 - mouse input
 - write colours into header

*/

// Glulx key codes accepted by the Z-Machine
const ZSCII_keyCodes = (function()
{
    const codes = {
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
    }
    let i = 0
    while (i < 12)
    {
        codes[0xffffffef - i] = 133 + i++ // function keys
    }
    return codes
})()

// Style mappings
// The index bits are (lowest to highest): mono, italic, bold
const style_mappings = [0, 2, 1, 10, 4, 9, 5, 6]

// Convert a 15 bit colour to RGB
function convert_true_colour(colour)
{
    const from5to8 = [0, 8, 16, 25, 33, 41, 49, 58, 66, 74, 82, 90, 99, 107, 115, 123, 132,
    140, 148, 156, 165, 173, 181, 189, 197, 206, 214, 222, 230, 239, 247, 255]

    // Stretch the five bits per colour out to 8 bits
    return (from5to8[colour & 0x1F] << 16) | (from5to8[(colour & 0x03E0) >> 5] << 8) | (from5to8[(colour & 0x7C00) >> 10])
}

// The standard 15 bit colour values
const zcolours = [
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
]

class ZVMIO
{
    constructor(runtime)
    {
        this.runtime = runtime
        this.Glk = runtime.Glk
    }

    reset()
    {
        // State which we will serialise when autosaving
        this.state = {
            reverse: 0,
            bold: 0,
            italic: 0,
            bg: -1,
            fg: -1,

            // A variable for whether we are outputing in a monospaced font. If non-zero then we are
            // Bit 0 is for @set_style, bit 1 for the header, and bit 2 for @set_font
            mono: this.runtime.m.getUint8(0x11) & 0x02,

            // A variable for checking whether the transcript bit has been changed
            transcript: this.runtime.m.getUint8(0x11) & 0x01,

            // Index 0 is input stream 1, the output streams follow
            streams: [0, 1, {}, [], {}],

            currentwin: 0,

            // Use Zarf's algorithm for the upper window
            // http://eblong.com/zarf/glk/quote-box.html
            // Implemented in fix_upper_window() and split_window()
            height: 0, // What the VM thinks the height is
            glkheight: 0, // Actual height of the Glk window
            maxheight: 0, // Height including quote boxes etc
            seenheight: 0, // Last height the player saw
            width: 0,
            row: 0,
            col: 0,
        }

        // Construct the windows if they do not already exist
        this.open_windows()
    }

    erase_line(value)
    {
        if (value === 1)
        {
            const state = this.state
            this._print(' '.repeat(state.width - state.col))
            this.set_cursor(state.row, state.col)
        }
    }

    erase_window(window)
    {
        if (window < 1)
        {
            this.Glk.glk_window_clear(this.mainwin)
            if (this.state.bg >= 0)
            {
                this.Glk.glk_stylehint_set(3, 0, 8, this.state.bg)
            }
            else if (this.state.bg === -1)
            {
                this.Glk.glk_stylehint_clear(3, 0, 8)
            }
        }
        if (window !== 0)
        {
            if (window === -1)
            {
                this.split_window(0)
            }
            if (this.upperwin)
            {
                this.Glk.glk_window_clear(this.upperwin)
                this.set_cursor(0, 0)
            }
        }
    }

    fileref_create_by_prompt(data)
    {
        if (typeof data.run === 'undefined')
        {
            data.run = 1
        }
        this.fileref_data = data
        this.runtime.glk_blocking_call = 'fileref_create_by_prompt'
        this.Glk.glk_fileref_create_by_prompt(data.usage, data.mode, data.rock || 0)
    }

    // Fix the upper window height before an input event
    fix_upper_window()
    {
        const Glk = this.Glk
        const state = this.state
        
        // If we have seen the entire window, shrink it to what it should be
        if (state.seenheight >= state.maxheight)
        {
            state.maxheight = state.height
        }
        if (this.upperwin)
        {
            if (state.maxheight === 0)
            {
                Glk.glk_window_close(this.upperwin)
                this.upperwin = null
            }
            else if (state.maxheight !== state.glkheight)
            {
                Glk.glk_window_set_arrangement(Glk.glk_window_get_parent(this.upperwin), 0x12, state.maxheight, null)
            }
            state.glkheight = state.maxheight
        }
        state.seenheight = state.maxheight
        state.maxheight = state.height
    }

    format()
    {
        const state = this.state
        this.Glk.glk_set_style(style_mappings[!!state.mono | state.italic | state.bold])
        if (this.Glk.glk_gestalt(0x1100, 0))
        {
            this.Glk.garglk_set_reversevideo(state.reverse)
        }
    }

    get_cursor(array)
    {
        this.runtime.ram.setUint16(array, this.state.row + 1)
        this.runtime.ram.setUint16(array + 2, this.state.col + 1)
    }

    // Handle char input
    handle_char_input(charcode)
    {
        const stream4 = this.state.streams[4]
        const code = ZSCII_keyCodes[charcode] || this.runtime.reverse_unicode_table[charcode] || 63
        this.runtime.variable(this.read_data.storer, code)

        // Echo to the commands log
        if (stream4.mode === 1)
        {
            stream4.cache += code
        }
        if (stream4.mode === 2)
        {
            this.Glk.glk_put_char_stream_uni(stream4.str, code)
        }
    }

    // Handle the result of glk_fileref_create_by_prompt()
    handle_create_fileref(fref)
    {
        const Glk = this.Glk
        const data = this.fileref_data

        let str
        if (fref)
        {
            if (data.unicode)
            {
                str = Glk.glk_stream_open_file_uni(fref, data.mode, data.rock || 0)
            }
            else
            {
                str = Glk.glk_stream_open_file(fref, data.mode, data.rock || 0)
            }
            Glk.glk_fileref_destroy(fref)
        }
        if (data.func === 'restore' || data.func === 'save')
        {
            this.runtime.save_restore_handler(str)
        }
        if (data.func === 'input_stream')
        {
            this.state.streams[0] = str
        }
        if (data.func === 'output_stream')
        {
            this.output_stream_handler(str)
        }

        // Signal to resume() to call run() if required
        return data.run
    }

    // Handle line input
    handle_line_input(len, terminator)
    {
        const ram = this.runtime.ram
        const options = this.read_data
        const streams = this.state.streams

        // Cut the response to len, convert to a lower case string, and then to a ZSCII array
        const command = String.fromCharCode.apply(null, options.buffer.slice(0, len)) + '\n'
        const response = this.runtime.text_to_zscii(command.slice(0, -1).toLowerCase())

        // 7.1.1.1: The response must be echoed, Glk will handle this

        // But we do have to echo to the transcripts
        if (streams[2].mode === 1)
        {
            streams[2].cache += command
        }
        if (streams[2].mode === 2)
        {
            this.Glk.glk_put_jstring_stream(streams[2].str, command)
        }

        if (streams[4].mode === 1)
        {
            streams[4].cache += command
        }
        if (streams[4].mode === 2)
        {
            this.Glk.glk_put_jstring_stream(streams[4].str, command)
        }

        // Store the response
        if (this.runtime.version < 5)
        {
            // Append zero terminator
            response.push(0)

            // Store the response in the buffer
            ram.setUint8Array(options.bufaddr + 1, response)
        }
        else
        {
            // Store the response length
            ram.setUint8(options.bufaddr + 1, len)

            // Store the response in the buffer
            ram.setUint8Array(options.bufaddr + 2, response)

            // Store the terminator
            this.runtime.variable(options.storer, isNaN(terminator) ? 13 : terminator)
        }

        if (options.parseaddr)
        {
            // Tokenise the response
            this.runtime.tokenise(options.bufaddr, options.parseaddr)
        }
    }

    input_stream(stream)
    {
        var state = this.state
        if (stream && !state.streams[0])
        {
            this.fileref_create_by_prompt({
                func: 'input_stream',
                mode: 0x02,
                rock: 212,
                unicode: 1,
                usage: 0x103,
            })
        }
        if (!stream && state.streams[0])
        {
            this.Glk.glk_stream_close(state.streams[0])
            state.streams[0] = 0
        }
    }

    // Open windows
    open_windows()
    {
        const Glk = this.Glk

        if (!this.mainwin)
        {
            // We will borrow the general approach of Bocfel to implement the Z-Machine's formatting model in Glk
            // https://github.com/garglk/garglk/blob/master/terps/bocfel/screen.c

            // Reset some Glk stylehints just in case
            const styles_to_reset = [1, 2, 4, 5, 6, 9, 10]
            for (let i = 0; i < 7; i++)
            {
                // Reset the size, weight, and obliqueness
                Glk.glk_stylehint_set(0, styles_to_reset[i], 3, 0)
                Glk.glk_stylehint_set(0, styles_to_reset[i], 4, 0)
                Glk.glk_stylehint_set(0, styles_to_reset[i], 5, 0)
                // And force proportional font
                Glk.glk_stylehint_set(0, styles_to_reset[i], 6, 1)
            }

            // Now set the style hints we will use

            // Bold will use subheader
            Glk.glk_stylehint_set(0, 4, 4, 1)
            // Italic will use emphasised
            Glk.glk_stylehint_set(0, 1, 5, 1)
            // Bold+italic will use alert
            Glk.glk_stylehint_set(0, 5, 4, 1)
            Glk.glk_stylehint_set(0, 5, 5, 1)
            // Fixed will use preformated
            Glk.glk_stylehint_set(0, 2, 6, 0)
            // Bold+fixed will use user1
            Glk.glk_stylehint_set(0, 9, 4, 1)
            Glk.glk_stylehint_set(0, 9, 6, 0)
            // Italic+fixed will use user2
            Glk.glk_stylehint_set(0, 10, 5, 1)
            Glk.glk_stylehint_set(0, 10, 6, 0)
            // Bold+italic+fixed will use note
            Glk.glk_stylehint_set(0, 6, 4, 1)
            Glk.glk_stylehint_set(0, 6, 5, 1)
            Glk.glk_stylehint_set(0, 6, 6, 0)

            this.mainwin = Glk.glk_window_open(0, 0, 0, 3, 201)
            Glk.glk_set_window(this.mainwin)
            if (this.runtime.version3)
            {
                this.statuswin = Glk.glk_window_open(this.mainwin, 0x12, 1, 4, 202)
                if (this.statuswin)
                {
                    Glk.garglk_set_reversevideo_stream(Glk.glk_window_get_stream(this.statuswin), 1)
                }
            }
        }
        else
        {
            // Clean up after restarting
            Glk.glk_stylehint_clear(0, 0, 8)
            Glk.garglk_set_zcolors_stream(this.mainwin.str, this.state.fg, this.state.bg)
            Glk.glk_window_clear(this.mainwin)
            if (this.upperwin)
            {
                Glk.glk_window_close(this.upperwin)
                this.upperwin = null
            }
        }
    }

    // Manage output streams
    output_stream(stream, addr, called_from_print)
    {
        const ram = this.runtime.ram
        const streams = this.state.streams

        // The screen
        if (stream === 1)
        {
            streams[1] = 1
        }
        if (stream === -1)
        {
            streams[1] = 0
        }

        // Transcript
        if (stream === 2 && !streams[2].mode)
        {
            this.fileref_create_by_prompt({
                func: 'output_stream',
                mode: 0x05,
                rock: 210,
                run: !called_from_print,
                str: 2,
                unicode: 1,
                usage: 0x102,
            })
            streams[2].cache = ''
            streams[2].mode = 1
            if (!called_from_print)
            {
                this.runtime.stop = 1
            }
        }
        if (stream === -2)
        {
            ram.setUint8(0x11, (ram.getUint8(0x11) & 0xFE))
            if (streams[2].mode === 2)
            {
                this.Glk.glk_stream_close(streams[2].str)
            }
            streams[2].mode = this.state.transcript = 0
        }

        // Memory
        if (stream === 3)
        {
            streams[3].unshift([addr, ''])
        }
        if (stream === -3)
        {
            const data = streams[3].shift()
            const text = this.runtime.text_to_zscii(data[1])
            ram.setUint16(data[0], text.length)
            ram.setUint8Array(data[0] + 2, text)
        }

        // Command list
        if (stream === 4 && !streams[4].mode)
        {
            this.fileref_create_by_prompt({
                func: 'output_stream',
                mode: 0x05,
                rock: 211,
                str: 4,
                unicode: 1,
                usage: 0x103,
            })
            streams[4].cache = ''
            streams[4].mode = 1
            this.runtime.stop = 1
        }
        if (stream === -4)
        {
            if (streams[4].mode === 2)
            {
                this.Glk.glk_stream_close(streams[4].str)
            }
            streams[4].mode = 0
        }
    }

    output_stream_handler(str)
    {
        const ram = this.runtime.ram
        const streams = this.state.streams
        const stream_num = this.fileref_data.str

        if (stream_num === 2)
        {
            ram.setUint8(0x11, (ram.getUint8(0x11) & 0xFE) | (str ? 1 : 0))
            if (str)
            {
                streams[2].mode = 2
                streams[2].str = str
                this.state.transcript = 1
                if (streams[2].cache)
                {
                    this.Glk.glk_put_jstring_stream(streams[2].str, streams[2].cache)
                }
            }
            else
            {
                streams[2].mode = this.state.transcript = 0
            }
        }

        if (stream_num === 4)
        {
            if (str)
            {
                streams[4].mode = 2
                streams[4].str = str
                if (streams[4].cache)
                {
                    this.Glk.glk_put_jstring_stream(streams[4].str, streams[4].cache)
                }
            }
            else
            {
                streams[4].mode = 0
            }
        }
    }

    // Print text!
    _print(text)
    {
        const Glk = this.Glk
        const mem = this.runtime.m
        const state = this.state

        // Stream 3 gets the text first
        if (state.streams[3].length)
        {
            state.streams[3][0][1] += text
        }
        else
        {
            // Convert CR into LF
            text = text.replace(/\r/g, '\n')
            
            // Check the transcript bit
            // Because it might need to prompt for a file name, we return here, and will print again in the handler
            if ((mem.getUint8(0x11) & 0x01) !== state.transcript)
            {
                this.output_stream(state.transcript ? -2 : 2, 0, 1)
            }

            // Check if the monospace font bit has changed
            // Unfortunately, even now Inform changes this bit for the font statement, even though the 1.1 standard depreciated it :(
            if ((mem.getUint8(0x11) & 0x02) !== (state.mono & 0x02))
            {
                state.mono ^= 0x02
                this.format()
            }

            // For the upper window we print each character individually so that we can track the cursor position
            if (state.currentwin && this.upperwin)
            {
                // Don't automatically increase the size of the window
                // If we confirm that games do need this then we can implement it later
                let i = 0
                while (i < text.length && state.row < state.height)
                {
                    Glk.glk_put_jstring(text[i++])
                    state.col++
                    if (state.col === state.width)
                    {
                        state.col = 0
                        state.row++
                    }
                }
            }
            else if (!state.currentwin)
            {
                if (state.streams[1])
                {
                    Glk.glk_put_jstring(text)
                }
                // Transcript
                if (state.streams[2].mode === 1)
                {
                    state.streams[2].cache += text
                }
                if (state.streams[2].mode === 2)
                {
                    Glk.glk_put_jstring_stream(state.streams[2].str, text)
                }
            }
        }
    }

    // Print many things
    print(type, val)
    {
        const runtime = this.runtime
        let result
        
        // Number
        if (type === 0)
        {
            result = val
        }
        // Unicode
        if (type === 1)
        {
            result = String.fromCharCode(val)
        }
        // Text from address
        if (type === 2)
        {
            result = runtime.jit[val] || runtime.decode(val)
        }
        // Object
        if (type === 3)
        {
            const proptable = runtime.m.getUint16(runtime.objects + (runtime.version3 ? 9 : 14) * val + (runtime.version3 ? 7 : 12))
            result = runtime.decode(proptable + 1, runtime.m.getUint8(proptable) * 2)
        }
        // ZSCII
        if (type === 4)
        {
            result = runtime.unicode_table[val]
            if (!result)
            {
                return
            }
        }
        this._print('' + result)
    }

    // Request line input
    read(storer, text, parse, time, routine)
    {
        let len = this.runtime.m.getUint8(text)
        let initiallen = 0

        if (this.runtime.version3)
        {
            len++
            this.v3_status()
        }
        else
        {
            //initiallen = this.runtime.m.getUint8(text + 1)
        }

        const buffer = Array(len)
        buffer.fill(0)
        this.read_data = {
            buffer,
            bufaddr: text, // text-buffer
            parseaddr: parse, // parse-buffer
            routine,
            storer,
            time,
        }

        // Input stream 1
        if (this.state.streams[0])
        {
            let input_stream1_len = this.Glk.glk_get_line_stream_uni(this.state.streams[0], buffer)

            // Check for a newline character
            if (buffer[input_stream1_len - 1] === 0x0A)
            {
                input_stream1_len--
            }
            if (input_stream1_len)
            {
                this._print(String.fromCharCode.apply(null, buffer.slice(0, input_stream1_len)) + '\n')
                this.handle_line_input(input_stream1_len)
                return this.stop = 0
            }
            else
            {
                this.input_stream(0)
            }
        }

        // TODO: pre-existing input
        this.Glk.glk_request_line_event_uni(this.state.currentwin ? this.upperwin : this.mainwin, buffer, initiallen)
        this.fix_upper_window()
    }

    // Request character input
    read_char(storer, _, time, routine)
    {
        // Input stream 1
        if (this.state.streams[0])
        {
            const code = this.Glk.glk_get_char_stream_uni(this.state.streams[0])
            // Check for EOF
            if (code === -1)
            {
                this.input_stream(0)
            }
            else
            {
                this.variable(storer, code)
                return this.stop = 0
            }
        }

        this.read_data = {
            routine,
            storer,
            time,
        }
        this.Glk.glk_request_char_event_uni(this.state.currentwin ? this.upperwin : this.mainwin)
        this.fix_upper_window()
    }

    set_colour(foreground, background)
    {
        this.set_true_colour(zcolours[foreground], zcolours[background])
    }

    // Note that row and col must be decremented in JIT code
    set_cursor(row, col)
    {
        const state = this.state
        
        // 8.7.2.3: do nothing if the lower window is selected
        if (!state.currentwin)
        {
            return
        }

        if (row >= state.height)
        {
            // Moving the cursor to a row forces the upper window
            // to open enough for that line to exist
            this.split_window(row + 1)
        }
        if (this.upperwin && row >= 0 && col >= 0 && col < state.width)
        {
            this.Glk.glk_window_move_cursor(this.upperwin, col, row)
            state.row = row
            state.col = col
        }
    }

    set_font(font)
    {
        const returnval = this.state.mono & 0x04 ? 4 : 1
        if (font === 0)
        {
            return returnval
        }
        // We only support fonts 1 and 4
        if (font !== 1 && font !== 4)
        {
            return 0
        }
        if (font !== returnval)
        {
            this.state.mono ^= 0x04
            this.format()
        }
        return returnval
    }

    // Set styles
    set_text_style(stylebyte)
    {
        const state = this.state

        // Setting the style to Roman will clear the others
        if (stylebyte === 0)
        {
            state.reverse = state.bold = state.italic = 0
            state.mono &= 0xFE
        }
        if (stylebyte & 0x01)
        {
            state.reverse = 1
        }
        if (stylebyte & 0x02)
        {
            state.bold = 0x04
        }
        if (stylebyte & 0x04)
        {
            state.italic = 0x02
        }
        if (stylebyte & 0x08)
        {
            state.mono |= 0x01
        }
        this.format()
    }

    // Set true colours
    set_true_colour(foreground, background)
    {
        const Glk = this.Glk
        if (Glk.glk_gestalt(0x1100, 0))
        {
            let fg, bg
            if (foreground === 0xFFFE)
            {
                fg = -2
            }
            else
            {
                if (foreground === 0xFFFF)
                {
                    fg = -1
                }
                else
                {
                    fg = convert_true_colour(foreground)
                }
                this.io.fg = fg
            }

            if (background === 0xFFFE)
            {
                bg = -2
            }
            else
            {
                if (background === 0xFFFF)
                {
                    bg = -1
                }
                else
                {
                    bg = convert_true_colour(background)
                }
                this.io.bg = bg
            }

            // Set the colours for each open window
            Glk.garglk_set_zcolors_stream(this.mainwin.str, fg, bg)
            if (this.upperwin)
            {
                Glk.garglk_set_zcolors_stream(this.upperwin.str, fg, bg)
            }
        }
    }

    set_window(window)
    {
        this.state.currentwin = window

        // Focusing the upper window resets the cursor to the top left;
        // it also opens the upper window if it's not open
        if (window)
        {
            this.set_cursor(0, 0)
        }

        this.Glk.glk_set_window(this.upperwin && window ? this.upperwin : this.mainwin)
        this.format()
    }

    split_window(lines)
    {
        const Glk = this.Glk
        const state = this.state
        const row = state.row
        const col = state.col
        let oldheight = state.height
        state.height = lines
        
        // Erase existing lines if we are expanding into existing rows
        if ( this.upperwin && lines > oldheight )
        {
            const str = Glk.glk_window_get_stream(this.upperwin)
            while (oldheight < lines)
            {
                Glk.glk_window_move_cursor(this.upperwin, 0, oldheight++)
                Glk.glk_put_jstring_stream(str, ' '.repeat(state.width))
            }
            Glk.glk_window_move_cursor(this.upperwin, col, row)
        }

        // Don't decrease the height of the window yet, only increase
        if (lines > state.maxheight)
        {
            state.maxheight = lines

            // Set the height of the window
            // Create the window if it doesn't exist
            if (!this.upperwin)
            {
                if (this.state.bg >= 0)
                {
                    Glk.glk_stylehint_set(4, 0, 8, this.state.bg)
                }
                this.upperwin = Glk.glk_window_open(this.mainwin, 0x12, state.maxheight, 4, 203)
                Glk.garglk_set_zcolors_stream(this.upperwin.str, this.state.fg, this.state.bg)
                Glk.glk_stylehint_clear(4, 0, 8)
            }
            else
            {
                Glk.glk_window_set_arrangement(Glk.glk_window_get_parent(this.upperwin), 0x12, state.maxheight, null)
            }
            state.glkheight = state.maxheight
        }

        if (lines)
        {
            // Reset the cursor if it is now outside the window
            if (state.row >= lines)
            {
                this.set_cursor(0, 0)
            }
            // 8.6.1.1.2: In version three the upper window is always cleared
            if (this.runtime.version3)
            {
                Glk.glk_window_clear(this.upperwin)
            }
        }
    }

    update_screen_size()
    {
        const Glk = this.Glk
        const ram = this.runtime.ram
        const state = this.state
        const version = this.runtime.version

        const height_box = new Glk.RefBox()
        const width_box = new Glk.RefBox()
        const tempwin = Glk.glk_window_open(this.mainwin, 0x12, 0, 4, 0)
        let height = 0
        let width = 0

        // The main window is proportional, so its width may not be accurate
        // If the upper or status window is present, use its width, or else try to make a temp window
        // The height is the total of all windows

        Glk.glk_window_get_size(this.mainwin, width_box, height_box)
        height = height_box.get_value()

        if (this.upperwin)
        {
            Glk.glk_window_get_size(this.upperwin, width_box, height_box)
            height += height_box.get_value()
        }
        if (this.statuswin)
        {
            Glk.glk_window_get_size(this.statuswin, width_box, height_box)
            height += height_box.get_value()
        }
        if (tempwin)
        {
            Glk.glk_window_get_size(tempwin, width_box, 0)
            Glk.glk_window_close(tempwin)
        }

        // Use whichever width was available
        width = width_box.get_value()

        // Cap the dimensions
        // Height is capped to 254 as 255 means infinite, which breaks some games
        height = Math.min(height, 254)
        width = state.width = Math.min(width, 255)

        // Update the header
        if (version > 3)
        {
            ram.setUint8(0x20, height)
            ram.setUint8(0x21, width)
        }
        if (version > 4)
        {
            ram.setUint16(0x22, width)
            ram.setUint16(0x24, height)
        }

        // Fix the cursor if it is outside the window
        if (state.col >= width)
        {
            state.col = width - 1
        }
    }

    // Output the version 3 status line
    v3_status()
    {
        if (!this.statuswin)
        {
            return
        }

        const runtime = this.runtime
        const Glk = this.Glk
        const str = Glk.glk_window_get_stream(this.statuswin)
        const memory = runtime.m
        const width = this.state.width
        const hours_score = memory.getUint16(runtime.globals + 2)
        const mins_turns = memory.getUint16(runtime.globals + 4)
        const proptable = memory.getUint16(runtime.objects + 9 * memory.getUint16(runtime.globals) + 7)
        const shortname = '' + runtime.decode(proptable + 1, memory.getUint8(proptable) * 2)
        let rhs

        // Handle the turns/score or time
        if (memory.getUint8(0x01) & 0x02)
        {
            rhs = 'Time: ' + (hours_score % 12 === 0 ? 12 : hours_score % 12) + ':' + (mins_turns < 10 ? '0' : '') + mins_turns + ' ' + (hours_score > 11 ? 'PM' : 'AM')
        }
        else
        {
            rhs = 'Score: ' + hours_score + '  Turns: ' + mins_turns
        }

        // Print a blank line in reverse
        Glk.glk_window_move_cursor(this.statuswin, 0, 0)
        Glk.glk_put_jstring_stream(str, ' '.repeat(width))

        // Trim the shortname if necessary
        Glk.glk_window_move_cursor(this.statuswin, 0, 0)
        Glk.glk_put_jstring_stream(str, ' ' + shortname.slice(0, width - rhs.length - 4))

        // Print the right hand side
        Glk.glk_window_move_cursor(this.statuswin, width - rhs.length - 1, 0)
        Glk.glk_put_jstring_stream(str, rhs)
    }
}

module.exports = ZVMIO