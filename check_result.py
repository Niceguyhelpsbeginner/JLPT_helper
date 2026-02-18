#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import csv
import sys
import io

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('Heisigs RTK 6th Edition Korean.csv', 'r', encoding='utf-8-sig') as f:
    reader = csv.reader(f)
    row = next(reader)
    print(f'현재 컬럼 수: {len(row)}')
    print('\n남아있는 컬럼들:')
    for i, val in enumerate(row):
        display_val = val[:60] + "..." if len(val) > 60 else val
        if not display_val:
            display_val = "(빈 값)"
        print(f'  {i+1}. {display_val}')

