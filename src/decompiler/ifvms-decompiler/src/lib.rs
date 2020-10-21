/*

ifvms-decompiler - core library
===============================

Copyright (c) 2020 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/

pub mod zvm;

// Function safety refers to whether or not a function can be compiled and run without worrying about its locals and stack being part of the savestate
// Safe functions will never be saved so they can have various optimisations
// Unsafe functions need to be compiled such that they can be serialised and restored
// SafetyTBD functions have not yet been determined, and may need to be recompiled if judged safe
pub enum FunctionSafety {
    Safe,
    Unsafe,
    SafetyTBD,
}