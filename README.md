ifvms.js
========

ifvms.js, the Javascript Interactive Fiction Virtual Machines project is a new set of third generation VM engines for web IF interpreters. Like the second generation VMs Gnusto and Quixe, the ifvms.js VMs include a Just-In-Time disassembler/compiler. What justifies the third generation label is that the disassembler generates an Abstract Syntax Tree, allowing Inform idioms, for example for and while loops, to be identified and mapped to Javascript control structures. Identifying these idioms allows the JIT code to run for longer, lowering overheads and therefore increasing performance.

Currently only the Z-Machine is supported, but plans to support Glulx and possibly TADS are in the works. ZVM is used by [Parchment]<http://code.google.com/p/parchment>. To play a story with it, go to <http://iplayif.com>!

ifvms.js is BSD licenced, but please help the community by sharing any changes you make with us.