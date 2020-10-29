/*

IFVMS Code Generator
====================

Copyright (c) 2020 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/
use std::io::Cursor;
use js_sys;
use wasm_bindgen::prelude::*;

use ifvms_decompiler::*;

mod codegen_zvm;

// Functions to optionally set up the console error panic hook
#[cfg(feature = "panic_hook")]
use console_error_panic_hook;
#[cfg(feature = "panic_hook")]
fn setup_panic_hook() {
    console_error_panic_hook::set_once();
}
#[cfg(not(feature = "panic_hook"))]
fn setup_panic_hook() {}

// Output data from compiling a function/fragment
#[wasm_bindgen]
pub struct DecompilationResult {
    // Address of the function or first fragment
    #[wasm_bindgen(readonly)]
    pub addr: u32,

    // wasm-bindgen can't handle Strings in structs directly, it needs a getter function
    code: String,

    // SafetyTBD functions this function calls, again needs a getter
    calls: Vec<u32>,

    // Number of locals
    #[wasm_bindgen(readonly)]
    pub locals: u32,

    // Whether or not the function is safe
    #[wasm_bindgen(readonly)]
    pub safe: bool,
}

#[wasm_bindgen]
impl DecompilationResult {
    #[wasm_bindgen(getter)]
    pub fn code(&self) -> String {
        self.code.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn calls(&self) -> js_sys::Uint32Array {
        let slice: &[u32] = &self.calls;
        js_sys::Uint32Array::from(slice)
    }
}

// The decompiler class which will be used by ZVM
#[wasm_bindgen]
pub struct ZVMDecompiler {
    state: ifvms_decompiler::zvm::ZVMState,
}

#[wasm_bindgen]
impl ZVMDecompiler {
    // Allocate space for the image
    #[wasm_bindgen(constructor)]
    pub fn new(image_length: u32, version: u8, globals_addr: u16, unsafe_io: bool) -> ZVMDecompiler {
        // Set up the console error panic hook
        setup_panic_hook();

        // Allocate space for the image
        let image = vec![0 as u8; image_length as usize];
        let boxed_image = image.into_boxed_slice();
        let cursor = Cursor::new(boxed_image);
        ZVMDecompiler {
            state: zvm::ZVMState::new(cursor, version, globals_addr, unsafe_io),
        }
    }

    // Attempt to decompile a function
    pub fn function(&mut self, addr: u32) -> DecompilationResult {
        unimplemented!()
    }

    // Output the code for one fragment
    pub fn fragment(&mut self, addr: u32) -> DecompilationResult {
        DecompilationResult {
            addr,
            code: codegen_zvm::output_block(&mut self.state, addr),
            calls: Vec::new(),
            locals: 0,
            safe: false,
        }
    }

    // Return the address of the image so that ZVM can fill in the data
    #[wasm_bindgen(getter)]
    pub fn image_addr(&mut self) -> u32 {
        let image = self.state.image.get_mut();
        image.as_mut_ptr() as u32
    }
}