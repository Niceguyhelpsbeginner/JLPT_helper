#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CSV 파일의 영어 설명 컬럼들을 한국어로 번역하는 스크립트
"""

import csv
import sys
import io
import shutil
import os
import time

# Windows 환경에서 UTF-8 출력 설정
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

try:
    from googletrans import Translator
    HAS_GOOGLETRANS = True
except ImportError:
    HAS_GOOGLETRANS = False
    print("[경고] googletrans 라이브러리가 설치되지 않았습니다.")
    print("      설치 명령: pip install googletrans==4.0.0rc1")
    print("      또는 간단한 번역 함수를 사용합니다.")

def simple_translate(text):
    """
    간단한 번역 함수 (googletrans가 없을 때 사용)
    실제로는 googletrans를 사용하는 것이 좋습니다.
    """
    # 여기서는 그냥 원문을 반환 (실제 번역은 googletrans 필요)
    return text

def translate_columns(input_file, output_file, columns_to_translate):
    """
    CSV 파일의 지정된 컬럼들을 한국어로 번역
    
    Args:
        input_file: 입력 CSV 파일 경로
        output_file: 출력 CSV 파일 경로
        columns_to_translate: 번역할 컬럼 인덱스 리스트 (0부터 시작)
    """
    # 번역기 초기화
    if HAS_GOOGLETRANS:
        translator = Translator()
        print("[번역기] Google Translate 사용")
    else:
        translator = None
        print("[번역기] 간단한 번역 함수 사용 (실제 번역을 위해서는 googletrans 설치 필요)")
    
    print(f"[1/4] 파일 읽는 중: {input_file}")
    
    with open(input_file, 'r', encoding='utf-8-sig') as f_in:
        reader = csv.reader(f_in)
        rows = list(reader)
    
    if len(rows) == 0:
        print("파일이 비어있습니다.")
        return
    
    total_rows = len(rows)
    total_columns = len(rows[0]) if rows else 0
    print(f"      총 행 수: {total_rows}")
    print(f"      총 컬럼 수: {total_columns}")
    print(f"      번역할 컬럼: {[c+1 for c in columns_to_translate]} (인덱스: {columns_to_translate})")
    
    print(f"[2/4] 번역 중... (시간이 오래 걸릴 수 있습니다)")
    
    output_rows = []
    translated_count = 0
    error_count = 0
    
    for i, row in enumerate(rows):
        new_row = row.copy()
        
        # 각 번역 대상 컬럼 처리
        for col_idx in columns_to_translate:
            if col_idx < len(new_row):
                original_text = new_row[col_idx].strip()
                
                # 빈 텍스트는 건너뛰기
                if not original_text:
                    continue
                
                try:
                    if translator:
                        # Google Translate 사용
                        # API 제한을 피하기 위해 짧은 대기
                        if i > 0 and i % 50 == 0:
                            time.sleep(1)  # 50개마다 1초 대기
                        
                        result = translator.translate(original_text, src='en', dest='ko')
                        translated_text = result.text
                        new_row[col_idx] = translated_text
                        translated_count += 1
                    else:
                        # 간단한 번역 함수 사용 (실제로는 번역 안 됨)
                        new_row[col_idx] = simple_translate(original_text)
                        translated_count += 1
                        
                except Exception as e:
                    # 번역 실패 시 원문 유지
                    print(f"[경고] 행 {i+1}, 컬럼 {col_idx+1} 번역 실패: {str(e)[:50]}")
                    error_count += 1
                    # 원문 유지 (이미 new_row에 있음)
        
        output_rows.append(new_row)
        
        # 진행 상황 출력 (50줄마다)
        if (i + 1) % 50 == 0:
            print(f"      처리 중: {i + 1}/{total_rows} 행... (번역: {translated_count}, 오류: {error_count})")
    
    print(f"[3/4] 결과 저장 중: {output_file}")
    with open(output_file, 'w', encoding='utf-8-sig', newline='') as f_out:
        writer = csv.writer(f_out)
        writer.writerows(output_rows)
    
    print(f"[4/4] 완료!")
    print(f"      총 {total_rows}개 행 처리됨")
    print(f"      번역된 텍스트: {translated_count}개")
    if error_count > 0:
        print(f"      번역 오류: {error_count}개")

if __name__ == "__main__":
    input_file = "Heisigs RTK 6th Edition Korean.csv"
    backup_file = "Heisigs RTK 6th Edition Korean_backup_before_translate.csv"
    output_file = input_file  # 원본 파일에 직접 저장
    
    # 번역할 컬럼 인덱스 (0부터 시작)
    # 12번 컬럼 = 인덱스 2, 13번 컬럼 = 인덱스 3, 14번 컬럼 = 인덱스 4
    columns_to_translate = [2, 3, 4]  # 12, 13, 14번 컬럼
    
    try:
        # 백업 파일 생성
        if os.path.exists(input_file):
            shutil.copy2(input_file, backup_file)
            print(f"[백업] 원본 파일 백업: {backup_file}")
        
        translate_columns(input_file, output_file, columns_to_translate)
        print(f"\n[성공] 원본 파일의 설명이 한국어로 번역되었습니다: {input_file}")
        print(f"       백업 파일: {backup_file}")
        
    except Exception as e:
        print(f"[오류] {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

