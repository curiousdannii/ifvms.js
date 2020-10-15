/*

IFVMS Code Generator
====================

Copyright (c) 2020 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/
use std::io::Cursor;
use console_error_panic_hook;
use wasm_bindgen::prelude::*;

use ifvms_decompiler::zvm;

mod codegen_zvm;

#[wasm_bindgen]
pub struct ZVMDecompiler {
    state: ifvms_decompiler::zvm::ZVMState,

    #[wasm_bindgen(readonly)]
    pub image_addr: u32,
}

#[wasm_bindgen]
impl ZVMDecompiler {
    // Allocate space for the image
    #[wasm_bindgen(constructor)]
    pub fn new(image_length: u32, version: u8, globals_addr: u16) -> ZVMDecompiler {
        // Set up the console error hook
        console_error_panic_hook::set_once();

        // Allocate space for the image
        let image = vec![0 as u8; image_length as usize];
        let mut boxed_image = image.into_boxed_slice();
        let addr = boxed_image.as_mut_ptr();
        let cursor = Cursor::new(boxed_image);
        ZVMDecompiler {
            state: zvm::ZVMState {
                image: cursor,
                version,
                globals_addr,
                opcode_definitions: zvm::opcodes::get_opcode_definitions(version),
            },
            image_addr: addr as u32,
        }
    }

    pub fn output_block(&mut self, addr :u32) -> String {
        codegen_zvm::output_block(&mut self.state, addr)
    }
}