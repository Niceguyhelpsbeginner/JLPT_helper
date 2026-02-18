#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CSV 파일에서 특정 컬럼만 남기고 나머지 삭제하는 스크립트
"""

import csv
import sys
import io
import shutil
import os

# Windows 환경에서 UTF-8 출력 설정
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def remove_columns(input_file, output_file, keep_columns):
    """
    CSV 파일에서 지정된 컬럼만 남기고 나머지 삭제
    
    Args:
        input_file: 입력 CSV 파일 경로
        output_file: 출력 CSV 파일 경로
        keep_columns: 유지할 컬럼 인덱스 리스트 (1부터 시작)
    """
    rows_processed = 0
    
    print(f"[1/3] 파일 읽는 중: {input_file}")
    
    with open(input_file, 'r', encoding='utf-8-sig') as f_in:
        reader = csv.reader(f_in)
        rows = list(reader)
    
    if len(rows) == 0:
        print("파일이 비어있습니다.")
        return
    
    # 첫 번째 행으로 컬럼 수 확인
    total_columns = len(rows[0])
    print(f"      총 컬럼 수: {total_columns}")
    print(f"      유지할 컬럼: {keep_columns} (총 {len(keep_columns)}개)")
    
    # 컬럼 인덱스를 0부터 시작하도록 변환 (1-based -> 0-based)
    keep_indices = [col - 1 for col in keep_columns if 1 <= col <= total_columns]
    
    # 유효하지 않은 컬럼 인덱스 확인
    invalid_columns = [col for col in keep_columns if col < 1 or col > total_columns]
    if invalid_columns:
        print(f"[경고] 유효하지 않은 컬럼 인덱스: {invalid_columns}")
    
    print(f"[2/3] 컬럼 제거 중...")
    
    # 컬럼 제거 처리
    output_rows = []
    for i, row in enumerate(rows):
        # 지정된 컬럼만 추출
        new_row = [row[idx] if idx < len(row) else "" for idx in keep_indices]
        output_rows.append(new_row)
        rows_processed += 1
        
        # 진행 상황 출력 (100줄마다)
        if (i + 1) % 100 == 0:
            print(f"      처리 중: {i + 1}/{len(rows)} 행...")
    
    print(f"[3/3] 결과 저장 중: {output_file}")
    with open(output_file, 'w', encoding='utf-8-sig', newline='') as f_out:
        writer = csv.writer(f_out)
        writer.writerows(output_rows)
    
    print(f"[완료] {rows_processed}개 행 처리됨")
    print(f"      원본 컬럼 수: {total_columns}개 -> 결과 컬럼 수: {len(keep_indices)}개")

if __name__ == "__main__":
    input_file = "Heisigs RTK 6th Edition Korean.csv"
    backup_file = "Heisigs RTK 6th Edition Korean_backup_before_remove.csv"
    output_file = input_file  # 원본 파일에 직접 저장
    
    # 유지할 컬럼: 1, 5, 12, 13, 14, 17, 18, 19, 20, 23, 25
    keep_columns = [1, 5, 12, 13, 14, 17, 18, 19, 20, 23, 25]
    
    try:
        # 백업 파일 생성
        if os.path.exists(input_file):
            shutil.copy2(input_file, backup_file)
            print(f"[백업] 원본 파일 백업: {backup_file}")
        
        remove_columns(input_file, output_file, keep_columns)
        print(f"\n[성공] 원본 파일에서 컬럼이 제거되었습니다: {input_file}")
        print(f"       백업 파일: {backup_file}")
        
    except Exception as e:
        print(f"[오류] {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

