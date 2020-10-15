#!/bin/sh

cd "$(dirname "$0")"
echo 'Praxix'
python regtest.py -i "../bin/zvm.js" praxix.regtest
echo 'Curses'
python regtest.py -i "../bin/zvm.js" curses.regtest